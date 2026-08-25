// xySat - xyOps Satellite - Engine
// Copyright (c) 2019 - 2025 PixlCore LLC
// BSD 3-Clause License -- see LICENSE.md

const fs = require('fs');
const os = require('os');
const Path = require('path');
const cp = require('child_process');
const Class = require("class-plus");
const Component = require("pixl-server/component");
const Tools = require("pixl-tools");
const Request = require("pixl-request");

module.exports = Class({
	__mixins: [
		require('./comm.js'),
		require('./monitor.js'),
		require('./job.js'),
		require('./utils.js')
	],
	__events: true,
	__hooks: false,
	__asyncify: false,
		
	defaultConfig: {
		
	},
	
	features: {
		testMonitorPlugin: true,
		dockerStats: true
	}
},
class Satellite extends Component {
	
	earlyStart() {
		// early startup to hook logger, to scan for errors
		var self = this;
		
		// basic config validation
		['pid_file', 'log_dir', 'log_filename', 'temp_dir', 'debug_level'].forEach( function(path) {
			if (!self.server.config.getPath(path)) {
				console.error("\nFATAL: Missing required configuration property: " + path + "\n");
				process.exit(1);
			}
		} );
		
		var log_file = Path.join( this.server.config.get('log_dir'), 'Error.log' );
		
		this.server.logger.on('row', function(line, cols, args) {
			if (args.category !== 'error') return; // early exit for non-errors
			
			// dedicated error log
			if (args.sync) fs.appendFileSync(log_file, line);
			else fs.appendFile(log_file, line, function() {});
		}); // row
		
		return true; // continue startup
	}
	
	startup(callback) {
		// start service
		var self = this;
		this.logDebug(2, "xyOps Satellite v" + this.server.__version + " starting up" );
		
		// use global config
		this.config = this.server.config;
		this.debug = this.server.debug;
		this.foreground = this.server.foreground;
		
		// job log dir and shared temp dirs
		Tools.mkdirp.sync( Path.join( this.config.get('log_dir'), 'jobs' ) );
		
		// These directories are shared by jobs which may run under different user accounts.
		// Keep them world-writable, but use sticky bit only on the final nested dir.
		var temp_dir = this.config.get('temp_dir');
		[ temp_dir, Path.join( temp_dir, 'plugins' ), Path.join( temp_dir, 'jobs' ) ].forEach( function(dir) {
			Tools.mkdirp.sync( dir );
			if (process.platform != 'win32') fs.chmodSync( dir, 0o1777 );
		} );
		
		// allow `masters` to override hosts, and split string if needed
		// (i.e. support common environment variable format)
		if (this.config.get('masters')) {
			var masters = this.config.get('masters');
			if (typeof(masters) == 'string') masters = masters.split(/\,\s*/);
			this.config.set('hosts', masters);
			this.config.delete('masters');
		}
		
		// socket connect
		this.socketInit();
		this.socketConnect();
		
		// hook into tick timer
		this.server.on('tick', this.tick.bind(this));
		this.server.on('minute', this.minute.bind(this));
		this.server.on('day', this.day.bind(this));
		
		// reconnect on config reload
		this.config.on('reload', function() {
			self.socketInit();
			if (!self.socket) self.socketConnect();
		});
		
		// create a http request instance for various tasks
		this.request = new Request( "xyOps Satellite v" + this.server.__version );
		this.request.setFollow( 5 );
		this.request.setAutoError( true );
		this.request.setKeepAlive( true );
		
		// compute unique host id, for monitoring time offsets
		this.hostHash = Tools.digestHex( os.hostname(), 'md5' );
		this.hostID = parseInt( this.hostHash.substring(0, 8), 16 ); // 32-bit numerical hash
		this.numServers = 0;
		
		// commands should come over from 'joined'
		this.commands = [];
		
		// prime this for repeated calls (delta)
		this.lastCPU = process.cpuUsage();
		
		// and these
		this.cpuState = {};
		this.numCPUs = os.cpus().length;
		this.procCache = {};
		
		// pre-grab net ifaces
		this.interfaces = os.networkInterfaces();
		this.defaultInterfaceName = Tools.firstKey( this.interfaces );
		
		// sniff platform
		this.platform = {};
		switch (process.platform) {
			case 'linux': this.platform.linux = true; break;
			case 'darwin': this.platform.darwin = true; break;
			case 'freebsd': this.platform.freebsd = this.platform.bsd = true; break;
			case 'openbsd': case 'netbsd': this.platform.bsd = true; break;
			case 'win32': this.platform.windows = true; break;
		}
		
		if (this.platform.linux) {
			// pre-calc location of some binaries
			this.psBin = Tools.findBinSync('ps');
			this.ssBin = Tools.findBinSync('ss');
			this.curlBin = Tools.findBinSync('curl');
			this.wgetBin = Tools.findBinSync('wget');
		} // linux
		
		if (this.platform.darwin) {
			// pre-calc location of some binaries
			this.psBin = Tools.findBinSync('ps');
			this.curlBin = Tools.findBinSync('curl');
			
			// determine the default network interface (for fast network speed measurements)
			var route = Tools.findBinSync('route');
			if (route) try {
				var result = cp.execFileSync( route, ['-n', 'get', 'default'] ).toString();
				//   interface: en0
				if (result.match(/\binterface\:\s*(\w+)/)) this.defaultInterfaceName = RegExp.$1;
			}
			catch (e) {;}
			
			// determine the default mem page size
			var sysctl = Tools.findBinSync('sysctl');
			if (sysctl) try {
				var result = cp.execFileSync( sysctl, ['-n', 'vm.pagesize'] ).toString();
				if (result && result.match(/(\d+)/)) this.memPageSize = parseInt( RegExp.$1, 10 );
			}
			catch (e) {
				this.memPageSize = 4096;
			}
		} // darwin
		
		if (this.platform.freebsd) {
			// process monitoring uses the native BSD ps command
			this.psBin = Tools.findBinSync('ps');
		}
		
		if (!this.platform.windows) {
			this.dockerBin = Tools.findBinSync('docker');
		}
		
		// optionally handle shutdowns gracefully
		this.setupGracefulShutdown();
		
		callback();
	}
	
	setupGracefulShutdown() {
		// hijack pixl-server shutdown so we can wait for jobs in graceful mode
		var self = this;
		var origShutdown = this.server.shutdown.bind(this.server);
		var shutGrace = false;
		
		this.server.shutdown = function(callback) {
			if (!callback) callback = function() {};
			if (!self.config.get('graceful')) return origShutdown(callback);
			
			// prevent multiple signals from interfering with graceful shutdown
			if (shutGrace) return;
			shutGrace = true;
			
			self.logDebug(3, "Performing graceful shutdown sequence");
			
			if (!Tools.numKeys(self.activeJobs)) {
				self.logDebug(3, "No active jobs, shutting down immediately");
				return origShutdown(callback);
			}
			
			// send server disable signal to conductor if supported (xyops v1.0.90+)
			// (so no new jobs will be dispatched to us during the wait)
			if (self.conductorFeatures.disable_self && self.socket) {
				self.logDebug(3, "Sending disable socket command to conductor");
				self.socket.send('disable', {});
			}
			
			self.logDebug(3, "Waiting for all jobs to complete...");
			self.waitForAllJobs( function() {
				self.logDebug(3, "All jobs completed, resuming shutdown.");
				origShutdown(callback);
			});
		};
	}
	
	tick() {
		// called every second from pixl-server
		this.socketTick();
		this.jobTick();
		this.runQuickMonitors();
	}
	
	minute() {
		// called every minute
		this.checkJobLogSizes();
		this.runMonitors();
	}
	
	day() {
		// called every day at midnight
		this.archiveLogs();
	}
	
	shutdown(callback) {
		// stop service
		var self = this;
		
		this.logDebug(1, "Shutting down xyOps Satellite");
		this.abortAllJobs();
		
		this.waitForAllJobs( function() {
			if (self.socket) self.socketDisconnect();
			if (self.reconnectTimer) clearTimeout( self.reconnectTimer );
			callback();
		});
	}
	
});
