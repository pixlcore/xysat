// Orchestra Satellite
// Copyright (c) 2020 - 2022 Joseph Huckaby

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
		
	}
},
class Engine extends Component {
	
	startup(callback) {
		// start service
		var self = this;
		this.logDebug(3, "Orchestra Satellite v" + this.server.__version + " starting up" );
		
		// use global config
		this.config = this.server.config;
		
		// job log dir and temp dir
		Tools.mkdirp.sync( Path.join( this.config.get('log_dir'), 'jobs' ) );
		Tools.mkdirp.sync( Path.join( this.config.get('temp_dir'), 'plugins' ) );
		Tools.mkdirp.sync( Path.join( this.config.get('temp_dir'), 'jobs' ) );
		
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
		this.request = new Request( "Orchestra Satellite v" + this.server.__version );
		this.request.setTimeout( 300 * 1000 );
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
			case 'freebsd': case 'openbsd': case 'netbsd': this.platform.bsd = true; break;
			case 'win32': this.platform.windows = true; break;
		}
		
		if (this.platform.linux) {
			// pre-calc location of some binaries
			this.psBin = Tools.findBinSync('ps');
			this.ssBin = Tools.findBinSync('ss');
			
			// pre-determine mounted disk devices, for fast disk usage measurements
			// FUTURE: Re-do this every minute, just in case the disks change
			this.diskDeviceMatch = /.+/;
			var lsblk = Tools.findBinSync('lsblk');
			if (lsblk) try {
				var devices = {};
				cp.execFileSync( lsblk, ['-r'] ).toString().split(/\n/).forEach( function(line) {
					// nvme0n1p1 259:1 0 8G 0 part /
					if (line.match(/^\s*(\w+).+\//)) devices[ RegExp.$1 ] = 1;
				} );
				var dev_list = Object.keys(devices);
				if (dev_list.length) this.diskDeviceMatch = new RegExp('(' + dev_list.join('|') + ')');
			}
			catch (e) {;}
		} // linux
		
		if (this.platform.darwin) {
			// pre-calc location of some binaries
			this.psBin = Tools.findBinSync('ps');
			
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
		
		// TEST TEST TEST:
		
		this.logDebug(3, "Some stuff", {
			"__filename": __filename,
			"__dirname": __dirname,
			"process.cwd()": process.cwd(),
			"process.execPath": process.execPath,
			"process.argv": process.argv,
			"require.main.filename": require.main.filename,
			"process.pkg": (process.pkg ? 1 : 0)
		});
		
		callback();
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
		this.logDebug(3, "Shutting down Orchestra Satellite");
		this.abortAllJobs();
		if (this.socket) this.socketDisconnect();
		if (this.reconnectTimer) clearTimeout( this.reconnectTimer );
		callback();
	}
	
});
