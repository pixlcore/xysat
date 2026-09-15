/**
 * @class nodewindows.EventLogger
 * @since 0.1.0
 * Console-backed replacement for the original Windows Event Log adapter.
 *
 * The upstream implementation launched eventcreate.exe for every single log
 * message, and attempted to launch a second elevated process if that failed.
 * A service restart loop could therefore create hundreds of extra processes
 * while the machine was already under resource pressure.
 *
 * xySat already writes its own durable log files, and WinSW captures this
 * wrapper's stdout and stderr.  Keep the public EventLogger API intact, but
 * write through the console so no helper processes are ever spawned.
 */

var eventlogs = ['APPLICATION', 'SYSTEM'];

// Write a message to stdout or stderr without ever launching a child process.
var write = function(src, type, msg, code, callback) {
	var error = null;

	// The event code is retained in the method signature for API compatibility.
	// It has no meaning in the console-backed implementation.
	if (typeof code === 'function') {
		callback = code;
	}

	try {
		if (msg !== null && typeof msg !== 'undefined') {
			msg = String(msg).trim();

			if (msg.length) {
				var line = '[' + src + '] ' + msg;

				if ((type === 'ERROR') || (type === 'FAILUREAUDIT')) {
					console.error(line);
				}
				else if (type === 'WARNING') {
					console.warn(line);
				}
				else {
					console.log(line);
				}
			}
		}
	}
	catch (err) {
		// Logging must never be allowed to crash or restart the service wrapper.
		error = err;
	}

	if (callback) {
		process.nextTick(function() {
			callback(error);
		});
	}
};

// Preserve the original constructor, properties and method aliases so any
// remaining node-windows callers continue to work unchanged.
var logger = function(config) {
	config = config || {};

	if (typeof config === 'string') {
		config = {
			source: config
		};
	}

	Object.defineProperties(this, {
		source: {
			enumerable: true,
			writable: true,
			configurable: false,
			value: config.source || 'Node.js'
		},

		_logname: {
			enumerable: false,
			writable: true,
			configurable: false,
			value: config.eventLog || config.eventlog || 'APPLICATION'
		},

		eventLog: {
			enumerable: true,
			get: function() {
				return this._logname.toUpperCase();
			},
			set: function(value) {
				if (value) {
					value = String(value).toUpperCase();
					this._logname = (eventlogs.indexOf(value) >= 0) ? value : 'APPLICATION';
				}
			}
		},

		info: {
			enumerable: true,
			writable: true,
			configurable: false,
			value: function(message, code, callback) {
				write(this.source, 'INFORMATION', message, code, callback);
			}
		},

		information: {
			enumerable: false,
			get: function() {
				return this.info;
			}
		},

		error: {
			enumerable: true,
			writable: true,
			configurable: false,
			value: function(message, code, callback) {
				write(this.source, 'ERROR', message, code, callback);
			}
		},

		warn: {
			enumerable: true,
			writable: true,
			configurable: false,
			value: function(message, code, callback) {
				write(this.source, 'WARNING', message, code, callback);
			}
		},

		warning: {
			enumerable: false,
			get: function() {
				return this.warn;
			}
		},

		auditSuccess: {
			enumerable: true,
			writable: true,
			configurable: false,
			value: function(message, code, callback) {
				write(this.source, 'SUCCESSAUDIT', message, code, callback);
			}
		},

		auditFailure: {
			enumerable: true,
			writable: true,
			configurable: false,
			value: function(message, code, callback) {
				write(this.source, 'FAILUREAUDIT', message, code, callback);
			}
		}
	});
};

module.exports = logger;
