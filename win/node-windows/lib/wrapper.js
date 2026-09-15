// Handle input parameters.
var Logger = require('./eventlog');
var optimist = require('yargs');
var p = require('path');
var fs = require('fs');
var fork = require('child_process').fork;
var restartWindowSeconds = 60;

var argv = optimist
	.demand('file')
	.alias('f', 'file')
	.describe('file', 'The absolute path of the script to be run as a process.')
	.check(function(argv) {
		if (!fs.existsSync(p.resolve(argv.f))) {
			throw new Error(argv.f + ' does not exist or cannot be found.');
		}

		return true;
	})
	.describe('scriptoptions', 'The options to be sent to the script.')
	.alias('d', 'cwd')
	.describe('cwd', 'The absolute path of the current working directory of the script to be run as a process.')
	.demand('log')
	.alias('l', 'log')
	.describe('log', 'The descriptive name of the log for the process')
	.default('eventlog', 'APPLICATION')
	.alias('e', 'eventlog')
	.describe('eventlog', 'The event log container. This must be APPLICATION or SYSTEM.')
	.default('maxretries', -1)
	.alias('m', 'maxretries')
	.describe('maxretries', 'The maximum total number of times the process will be auto-restarted.')
	.default('maxrestarts', 5)
	.alias('r', 'maxrestarts')
	.describe('maxrestarts', 'The maximum number of starts allowed within a ' + restartWindowSeconds + ' second period.')
	.default('wait', 1)
	.alias('w', 'wait')
	.describe('wait', 'The number of seconds between each restart attempt.')
	.default('grow', 0.25)
	.alias('g', 'grow')
	.describe('grow', 'A percentage growth rate at which the wait time is increased.')
	.default('abortonerror', 'no')
	.alias('a', 'abortonerror')
	.describe('abortonerror', 'Do not attempt to restart the process if it fails with an error.')
	.check(function(argv) {
		return ['y', 'n', 'yes', 'no'].indexOf(String(argv.a).trim().toLowerCase()) >= 0;
	})
	.default('stopparentfirst', 'no')
	.alias('s', 'stopparentfirst')
	.describe('stopparentfirst', 'Allow the script to exit using a shutdown message.')
	.check(function(argv) {
		// Older node-windows releases wrote the literal string "undefined" into
		// service XML.  Accept it as a false value so an upgraded wrapper can
		// still start beneath an existing service registration.
		return ['y', 'n', 'yes', 'no', 'undefined'].indexOf(String(argv.s).trim().toLowerCase()) >= 0;
	})
	.parse();

var log = new Logger((typeof argv.e === 'undefined') ? argv.l : {
	source: argv.l,
	eventlog: argv.e
});

var script = p.resolve(argv.f);
var initialWait = Math.max(0, Number(argv.w) || 0) * 1000;
var wait = initialWait;
var grow = Math.max(1, (Number(argv.g) || 0) + 1);
var maxRetries = parseInt(argv.m, 10);
var maxRestarts = parseInt(argv.r, 10);
var abortOnError = /^(?:y|yes)$/i.test(String(argv.a));
var stopParentFirst = /^(?:y|yes)$/i.test(String(argv.s));
var attempts = 0;
var launchTimes = [];
var child = null;
var restartTimer = null;
var stableTimer = null;
var shutdownTimer = null;
var shuttingDown = false;
var requestedExitCode = 0;

if (!isFinite(maxRetries)) {
	maxRetries = -1;
}

if (!isFinite(maxRestarts) || (maxRestarts < 0)) {
	maxRestarts = 0;
}

if (argv.d) {
	if (!fs.existsSync(p.resolve(argv.d))) {
		log.warn(argv.d + ' not found. Using the wrapper working directory instead.');
		argv.d = process.cwd();
	}

	argv.d = p.resolve(argv.d);
}

// Set the absolute path of the file.
argv.f = script;

// Clear a timer and its shared reference together.  This prevents old timer
// callbacks from surviving across a child generation or shutdown.
var clearTimer = function(name) {
	if (name === 'restart' && restartTimer) {
		clearTimeout(restartTimer);
		restartTimer = null;
	}
	else if (name === 'stable' && stableTimer) {
		clearTimeout(stableTimer);
		stableTimer = null;
	}
};

// Shut down the wrapper and its one known child.  A bounded timeout prevents a
// child that ignores the graceful shutdown message from keeping WinSW stuck.
var shutdown = function(code) {
	requestedExitCode = Number(code) || 0;

	if (shuttingDown) {
		return;
	}

	shuttingDown = true;
	clearTimer('restart');
	clearTimer('stable');

	if (!child) {
		process.exit(requestedExitCode);
		return;
	}

	var currentChild = child;

	try {
		if (stopParentFirst && currentChild.connected) {
			currentChild.send('shutdown', function(err) {
				if (err) {
					try {
						currentChild.kill();
					}
					catch (killErr) {
						// The bounded shutdown timer below remains the final fallback.
					}
				}
			});
		}
		else {
			currentChild.kill();
		}
	}
	catch (err) {
		log.error('Failed to stop child process: ' + err.message);
	}

	shutdownTimer = setTimeout(function() {
		try {
			if (child === currentChild) {
				currentChild.kill('SIGKILL');
			}
		}
		catch (err) {
			// The wrapper must still exit even if the child is already gone.
		}

		process.exit(requestedExitCode);
	}, 10000);
};

// Schedule exactly one restart.  The timer callback re-checks all shared state
// before launching, so an old callback can never create a second live child.
var scheduleRestart = function() {
	if (shuttingDown || child || restartTimer) {
		return;
	}

	if ((maxRetries >= 0) && (attempts >= maxRetries)) {
		log.error('Too many restarts. ' + argv.f + ' will not be restarted because the maximum number of total restarts has been exceeded.');
		shutdown(1);
		return;
	}

	attempts++;

	var delay = wait;
	wait = wait * grow;

	log.warn('Restarting ' + argv.f + ' in ' + delay + ' msecs; attempt = ' + attempts);

	restartTimer = setTimeout(function() {
		restartTimer = null;

		if (shuttingDown || child) {
			return;
		}

		launch();
	}, delay);
};

/**
 * @method launch
 * Start the child only when there is no existing child or pending shutdown.
 */
var launch = function(logLevel, msg) {
	if (shuttingDown) {
		return;
	}

	// The child reference is the single source of truth.  Fail closed if it is
	// occupied, even if the process is in the middle of spawning or exiting.
	if (child) {
		log.warn('Ignored a duplicate launch request while child PID ' + (child.pid || 'pending') + ' is still active.');
		return;
	}

	clearTimer('restart');

	if (logLevel && msg && (typeof log[logLevel] === 'function')) {
		log[logLevel](msg);
	}

	// Enforce the rolling restart window immediately before every fork.  This
	// closes the race where multiple timers could all pass the old monitor test.
	var now = Date.now();
	var cutoff = now - (restartWindowSeconds * 1000);
	launchTimes = launchTimes.filter(function(timestamp) {
		return timestamp >= cutoff;
	});

	if ((maxRestarts > 0) && (launchTimes.length >= maxRestarts)) {
		log.error('Too many starts within the last ' + restartWindowSeconds + ' seconds. Please check the script.');
		shutdown(1);
		return;
	}

	launchTimes.push(now);

	var opts = {
		env: process.env
	};
	var args = [];

	if (argv.d) {
		opts.cwd = argv.d;
	}

	// Only a real affirmative value enables detached mode.  The upstream XML
	// generator emitted the literal string "undefined", which was truthy here.
	if (stopParentFirst) {
		opts.detached = true;
	}

	if (argv.scriptoptions) {
		args = argv.scriptoptions.split(' ');
	}

	var launchedChild;

	try {
		launchedChild = fork(script, args, opts);
		child = launchedChild;
	}
	catch (err) {
		log.error('Failed to launch ' + argv.f + ': ' + err.message);
		child = null;
		scheduleRestart();
		return;
	}

	log.info('Started ' + argv.f + ' with PID ' + (launchedChild.pid || 'pending') + '.');

	// A process that survives the restart window is no longer crash-looping, so
	// restore the configured initial delay for any future isolated failure.
	stableTimer = setTimeout(function() {
		stableTimer = null;

		if (!shuttingDown && (child === launchedChild)) {
			wait = initialWait;
		}
	}, (restartWindowSeconds * 1000) + 1);

	var handled = false;

	var childStopped = function(code, signal, error) {
		if (handled) {
			return;
		}

		handled = true;
		clearTimer('stable');

		// An event from an obsolete ChildProcess object must never clear or
		// restart the current generation.
		if (child !== launchedChild) {
			log.warn('Ignored a stale child termination event.');
			return;
		}

		child = null;

		if (shuttingDown) {
			if (shutdownTimer) {
				clearTimeout(shutdownTimer);
				shutdownTimer = null;
			}

			process.exit(requestedExitCode);
			return;
		}

		if (error) {
			log.error(argv.f + ' failed: ' + error.message);
		}
		else {
			log.warn(argv.f + ' stopped running' + ((code === null) ? '' : ' with exit code ' + code) + (signal ? ' and signal ' + signal : '') + '.');
		}

		if (abortOnError && (code !== 0)) {
			log.error(argv.f + ' will not be restarted because abort-on-error is enabled.');
			shutdown((typeof code === 'number') ? code : 1);
			return;
		}

		scheduleRestart();
	};

	// Spawn failures emit "error" and may not emit "exit".  Other child errors
	// are logged but left to the eventual exit event so no duplicate is started.
	launchedChild.on('error', function(err) {
		if (!launchedChild.pid) {
			childStopped(1, null, err);
		}
		else {
			log.error('Child process error for PID ' + launchedChild.pid + ': ' + err.message);
		}
	});

	launchedChild.on('exit', function(code, signal) {
		childStopped(code, signal, null);
	});
};

// Best-effort cleanup for a direct wrapper exit.  Signal handlers use the
// bounded shutdown path above, but the synchronous exit hook is still useful
// if some external code calls process.exit().
process.on('exit', function() {
	if (child) {
		try {
			child.kill();
		}
		catch (err) {
			// There is nothing more a synchronous exit handler can safely do.
		}
	}
});

process.on('SIGINT', function() {
	shutdown(0);
});

process.on('SIGTERM', function() {
	shutdown(0);
});

// The upstream handler called launch() from uncaughtException.  If the current
// child was still alive, that recursively created another copy.  Fatal wrapper
// errors now stop the known child and let WinSW report a clean service failure.
process.on('uncaughtException', function(err) {
	log.error('Uncaught wrapper exception: ' + (err && err.stack ? err.stack : err));
	shutdown(1);
});

process.on('unhandledRejection', function(reason) {
	log.error('Unhandled wrapper rejection: ' + (reason && reason.stack ? reason.stack : reason));
	shutdown(1);
});

// Launch the process.
launch('info', 'Starting ' + argv.f);
