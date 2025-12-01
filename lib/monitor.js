// xySat - xyOps Satellite - Monitor Layer
// Copyright (c) 2019 - 2025 PixlCore LLC
// BSD 3-Clause License -- see LICENSE.md

const fs = require('fs');
const cp = require('child_process');
const os = require('os');
const Class = require("class-plus");
const Tools = require("pixl-tools");
const Path = require('path');
const zlib = require('zlib');
const sqparse = require('shell-quote').parse;
const XML = require('pixl-xml');
const async = require('async');
const si = require('systeminformation');
const Perf = require('pixl-perf');

module.exports = Class({
	
},
class Monitor {
	
	logMonitor(level, msg, data) {
		// log debug msg with pseudo-component
		if (this.debugLevel(level)) {
			this.logger.set( 'component', 'Monitor' );
			this.logger.print({ category: 'debug', code: level, msg: msg, data: data });
		}
	}
	
	getBasicServerInfo(callback) {
		// get basic OS, CPU, Memory info, for hello auth challenge
		var self = this;
		var info = {
			satellite: this.server.__version,
			node: process.versions.node,
			booted: Tools.timeNow(true) - os.uptime(),
			arch: os.arch(),
			platform: os.platform(),
			release: os.release(),
			quickmon: this.config.get('quickmon_enabled') && !this.platform.windows
		};
		
		async.series([
			function(callback) {
				// operating system
				si.osInfo( function(data) {
					data.platform = Tools.ucfirst( data.platform );
					info.os = data;
					callback();
				} );
			},
			function(callback) {
				// system memory
				si.mem( function(data) {
					info.memory = data;
					callback();
				} );
			},
			function(callback) {
				// cpu info
				si.cpu( function(data) {
					info.cpu = data;
					callback();
				} );
			},
			function(callback) {
				// detect virtualization
				self.detectVirtualization( function(data) {
					info.virt = data;
					callback();
				} );
			}
		],
		function() {
			callback(info);
		});
	}
	
	runQuickMonitors(opts = {}) {
		// run select monitors every second
		var self = this;
		var info = {};
		if (!this.socket || !this.socket.connected || !this.socket.auth) return;
		if (!this.config.get('monitoring_enabled') || !this.config.get('quickmon_enabled')) return;
		if (this.platform.windows) return;
		
		var perf = new Perf();
		perf.begin();
		
		async.parallel([
			function(callback) {
				// system memory
				// si.mem( function(data) {
				perf.begin('mem');
				self.getMemFast( function(data) {
					perf.end('mem');
					info.mem = data;
					callback();
				} );
			},
			function(callback) {
				// cpu load
				// si.currentLoad( function(data) {
				perf.begin('cpu');
				self.getCPUFast( 'second', function(data) {
					perf.end('cpu');
					info.cpu = data;
					callback();
				} );
			},
			function(callback) {
				// filesystem stats
				// si.fsStats( function(data) {
				perf.begin('disk');
				self.getDiskFast( function(data) {
					perf.end('disk');
					info.fs = data;
					callback();
				} );
			},
			function(callback) {
				// network stats (first external interface)
				// si.networkStats( function(data) {
				perf.begin('net');
				self.getNetFast( function(data) {
					perf.end('net');
					info.net = data;
					callback();
				} );
			}
		],
		function() {
			// re-check this as the si commands are async
			perf.end();
			var metrics = perf.metrics();
			if (metrics.perf.total > 250) self.logMonitor(9, "QuickMon Perf Warning", metrics);
			
			if (!self.socket || !self.socket.connected || !self.socket.auth) return;
			
			// vary max sleep time based on server count (passed to us from conductor), scale up with numServers, max of 1s
			var max_sleep_ms = opts.max_sleep_ms || Tools.clamp(self.numServers, 1, 1000);
			var sleep_ms = 0 + (self.hostID % max_sleep_ms);
			setTimeout( function() { self.socket.send('quickmon', info); }, sleep_ms );
		});
	}
	
	runMonitors(opts) {
		// called every minute
		// run full check on all server systems, commands, monitors
		var self = this;
		if (!opts) opts = {};
		if (!this.socket || !this.socket.connected || !this.socket.auth) return;
		
		var perf = new Perf();
		perf.begin();
		
		// add current server mem/cpu
		var cpu = process.cpuUsage( this.lastCPU );
		this.lastCPU = cpu;
		
		// start building info structure
		var info = {
			version: "1.0",
			date: (new Date()).getTime() / 1000,
			server: this.config.get('server_id'),
			hostname: os.hostname(),
			data: {
				uptime_sec: os.uptime(),
				arch: os.arch(),
				platform: os.platform(),
				release: os.release(),
				load: os.loadavg(),
				// cpus: os.cpus(),
				stats: { io: {}, fs: {} },
				
				jobs: Tools.numKeys(this.activeJobs),
				
				process: {
					pid: process.pid,
					started: this.server.started,
					mem: process.memoryUsage.rss(),
					cpu: ((cpu.user + cpu.system) / 600000000) * 100 // percent of one core
				}
			}
		};
		
		async.series([
			function(callback) {
				// sleep for N seconds based on hash of hostname, scale up with numServers, max of 30s (min of 1s)
				// this is to avoid multiple servers from submitting metrics at the same instant
				var max_sleep_ms = opts.max_sleep_ms || (Tools.clamp(self.numServers, 1, 1000) * 29);
				var sleep_ms = 1000 + (self.hostID % (max_sleep_ms || 1));
				perf.begin('sleep');
				setTimeout( function() { perf.end('sleep'); callback(); }, sleep_ms );
			},
			function(callback) {
				// operating system
				perf.begin('si.osInfo');
				si.osInfo( function(data) {
					perf.end('si.osInfo');
					data.platform = Tools.ucfirst( data.platform );
					info.data.os = data;
					callback();
				} );
			},
			function(callback) {
				// system memory
				// si.mem( function(data) {
				perf.begin('getMemFast');
				self.getMemFast( function(data) {
					perf.end('getMemFast');
					info.data.memory = data;
					callback();
				} );
			},
			function(callback) {
				// cpu info
				perf.begin('si.cpu');
				si.cpu( function(data) {
					perf.end('si.cpu');
					info.data.cpu = data;
					callback();
				} );
			},
			function(callback) {
				// cpu info
				// si.cpu( function(data) {
				perf.begin('getCPUFast');
				self.getCPUFast( 'minute', function(data) {
					perf.end('getCPUFast');
					Tools.mergeHashInto( info.data.cpu, data );
					callback();
				} );
			},
			function(callback) {
				// file systems
				perf.begin('si.fsSize');
				si.fsSize( function(data) {
					perf.end('si.fsSize');
					info.data.mounts = {};
					data.forEach( function(item) {
						var key = item.mount.replace(/^\//, '').replace(/\W+/g, '_') || 'root';
						info.data.mounts[key] = item;
					});
					callback();
				} );
			},
			function(callback) {
				// disk IO
				if (self.platform.windows) return callback(); // fails on win32
				perf.begin('si.disksIO');
				si.disksIO( function(data) {
					perf.end('si.disksIO');
					info.data.stats.io = data;
					callback();
				} );
			},
			function(callback) {
				// filesystem stats
				if (self.platform.windows) return callback(); // fails on win32
				perf.begin('si.fsStats');
				si.fsStats( function(data) {
					perf.end('si.fsStats');
					info.data.stats.fs = data;
					callback();
				} );
			},
			function(callback) {
				// network interfaces
				perf.begin('si.networkInterfaces');
				si.networkInterfaces( function(data) {
					// convert array to hash, keyed by interface name (lo, eth0)
					perf.end('si.networkInterfaces');
					info.data.interfaces = {};
					data.forEach( function(item) {
						info.data.interfaces[ item.iface ] = item;
					} );
					callback();
				} );
			},
			function(callback) {
				// network stats
				perf.begin('si.networkStats');
				si.networkStats( '*', function(data) {
					perf.end('si.networkStats');
					
					// add up stats from all external interfaces
					info.data.stats.network = {};
					
					// merge stats in with matching interface
					data.forEach( function(item) {
						var iface = info.data.interfaces[ item.iface ];
						if (!iface) return;
						
						if (!iface.internal) {
							// add up external stats
							if (!info.data.stats.network.ifaces) info.data.stats.network.ifaces = [];
							info.data.stats.network.ifaces.push( item.iface );
							
							for (var key in item) {
								if (key.match(/^(rx_|tx_)/)) info.data.stats.network[key] = (info.data.stats.network[key] || 0) + item[key];
							}
						} // is external
						
						// merge stats with matching interface
						Tools.mergeHashInto(iface, item);
					} );
					
					callback();
				} );
			},
			function(callback) {
				// network connections
				perf.begin('getNetworkConnections');
				self.getNetworkConnections(info, function() {
					perf.end('getNetworkConnections');
					callback();
				});
			},
			function(callback) {
				// all processes
				// si.processes( function(data) {
				perf.begin('getProcsFast');
				self.getProcsFast( function(data) {
					perf.end('getProcsFast');
					// fix up procs a bit
					data.list.forEach( function(proc) {
						// augment job procs with job id, disk, net, conns
						for (var job_id in self.activeJobs) {
							var job = self.activeJobs[job_id];
							
							if (job.procs && !job.runner && job.procs[proc.pid]) {
								var job_proc = job.procs[proc.pid];
								proc.job = job_id;
								proc.disk = job_proc.disk || 0;
								proc.conns = job_proc.conns || 0;
								proc.net = job_proc.net || 0;
							}
						}
					} );
					
					info.data.processes = data;
					callback();
				} );
			},
			function(callback) {
				// custom commands
				if (!self.commands.length) return process.nextTick( callback );
				info.data.commands = {};
				perf.begin('commands');
				
				// filter commands by server groups
				var commands = self.commands.filter( function(command) {
					return !command.groups.length || Tools.includesAny(command.groups, self.groups);
				} );
				
				async.eachSeries( commands,
					function(command, callback) {
						// exec single command
						if (!command.timeout) command.timeout = 5; // default 5 sec
						
						var child_opts = { 
							// timeout: command.timeout * 1000,
							windowsHide: true,
							cwd: command.cwd || os.tmpdir(),
							env: Object.assign( {}, self.cleanEnv(), command.sec || {} ),
							stdio: ['pipe', 'pipe', 'ignore']
						};
						if (command.uid && (command.uid != 0)) {
							var user_info = Tools.getpwnam( command.uid, true );
							if (user_info) {
								child_opts.uid = parseInt( user_info.uid );
								child_opts.gid = parseInt( user_info.gid );
								child_opts.env.USER = child_opts.env.USERNAME = user_info.username;
								child_opts.env.HOME = user_info.dir;
								child_opts.env.SHELL = user_info.shell;
							}
							else {
								info.data.commands[ command.id ] = "Error: Could not determine user information for: " + command.uid;
								return process.nextTick( callback );
							}
						}
						if (command.gid && (command.gid != 0)) {
							var grp_info = Tools.getgrnam( command.gid, true );
							if (grp_info) {
								child_opts.gid = grp_info.gid;
							}
							else {
								info.data.commands[ command.id ] = "Error: Could not determine group information for: " + command.gid;
								return process.nextTick( callback );
							}
						}
						
						var child = null;
						var child_cmd = command.command;
						var child_args = [];
						var child_output = '';
						var child_timeout_err_msg = '';
						var callback_fired = false;
						
						// if command has cli args, parse using shell-quote
						if (child_cmd.match(/\s+(.+)$/)) {
							var cargs_raw = RegExp.$1;
							child_cmd = child_cmd.replace(/\s+(.+)$/, '');
							child_args = sqparse( cargs_raw, child_opts.env );
						}
						
						// add plugin script if configured
						if (command.script) {
							child_args.push( Path.resolve( Path.join( self.config.get('temp_dir'), 'plugins', command.id + '.bin' ) ) );
						}
						
						var child_timer = setTimeout( function() {
							// timed out
							child_timeout_err_msg = "Command timed out after " + command.timeout + " seconds";
							child.kill(); // should fire exit event
						}, command.timeout * 1000 );
						
						// spawn child
						try {
							child = cp.spawn( child_cmd, child_args, child_opts );
						}
						catch (err) {
							clearTimeout( child_timer );
							info.data.commands[ command.id ] = "Error: Could not execute command: " + child_cmd + ": " + Tools.getErrorDescription(err);
							if (!callback_fired) { callback_fired = true; callback(); }
						}
						
						child.on('error', function (err) {
							// child error
							clearTimeout( child_timer );
							info.data.commands[ command.id ] = "Error: Could not execute command: " + child_cmd + ": " + Tools.getErrorDescription(err);
							if (!callback_fired) { callback_fired = true; callback(); }
						} );
						
						child.on('exit', function (code, signal) {
							// child exited
							clearTimeout( child_timer );
							var result = child_timeout_err_msg || child_output;
							
							// automatically parse JSON or XML
							if ((command.format == 'json') && result.match(/(\{|\[)/)) {
								// attempt to parse JSON
								var json = null;
								try { json = JSON.parse(result); }
								catch (err) { result = 'JSON Parser Error: ' + err; }
								if (json) result = json;
							}
							else if ((command.format == 'xml') && result.match(/\</)) {
								// attempt to parse XML
								var xml = null;
								try { xml = XML.parse(result); }
								catch (err) { result = "XML Parser Error: " + err; }
								if (xml) result = xml;
							}
							else {
								// plain text, trim whitespace
								result = result.trim();
							}
							
							info.data.commands[ command.id ] = result;
							if (!callback_fired) { callback_fired = true; callback(); }
						});
						
						if (child.stdout) {
							child.stdout.on('data', function(data) {
								child_output += data.toString();
								if (child_output.length > 32 * 1024) child.kill(); // sanity
							});
						}
						
						// if (child.stdin && command.script) {
						// 	child.stdin.write( command.script + "\n" );
						// }
						
						child.stdin.end();
					},
					function() {
						perf.end('commands');
						callback();
					}
				); // async.eachSeries
			},
			function(callback) {
				// all done
				perf.end();
				var metrics = perf.metrics();
				self.logMonitor(9, "Monitoring Perf Metrics", metrics);
				
				// send server metrics over to master
				if (self.config.get('monitoring_enabled') && self.socket && self.socket.connected && self.socket.auth) {
					self.socket.send('monitor', info);
				}
				
				callback(); // end async.series
			}
		]); // async.series
	}
	
	getNetworkConnections(info, callback) {
		// get all network connections either using `ss` on linux, or si
		var self = this;
		
		var finish = function(conns) {
			info.data.conns = conns;
				
			info.data.stats.network.conns = conns.length;
			info.data.stats.network.states = { established: 0 };
			
			conns.forEach( function(conn) {
				if (conn.state) {
					var key = conn.state.toString().toLowerCase();
					if (!info.data.stats.network.states[key]) info.data.stats.network.states[key] = 0;
					info.data.stats.network.states[key]++;
				}
			});
			
			callback();
		}; // finish
		
		if (this.ssBin) {
			// linux
			cp.exec( this.ssBin + ' -nutipaO', { timeout: 1000, maxBuffer: 1024 * 1024 * 32 }, function(err, stdout, stderr) {
				if (err) {
					self.logError('cp', "Failed to launch ss: " + err);
					return finish(conns);
				}
				
				var conns = [];
				
				stdout.split(/\n/).forEach( function(line) {
					if (line.match(/^(tcp|tcp4|tcp6|udp|udp4|udp6)\s+(\w+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+.+pid\=(\d+)/)) {
						var type = RegExp.$1, state = RegExp.$2, local_addr = RegExp.$5, remote_addr = RegExp.$6, pid = RegExp.$7;
						
						// clean up some stuff
						pid = parseInt(pid);
						if (state == "ESTAB") state = 'ESTABLISHED';
						if (state == "UNCONN") state = 'UNCONNECTED';
						
						var conn = { type, state, local_addr, remote_addr, pid };
						
						conn.bytes_out = line.match(/\bbytes_acked\:(\d+)/) ? parseInt( RegExp.$1 ) : 0;
						conn.bytes_in = line.match(/\bbytes_received\:(\d+)/) ? parseInt( RegExp.$1 ) : 0;
						
						conns.push(conn);
					}
				} ); // foreach line
				
				finish(conns);
			} ); // cp.exec
		} // ss
		else {
			// macos or other
			si.networkConnections( function(si_conns) {
				var conns = [];
				
				// cleanup windows garbage
				if (si_conns[0] && (si_conns[0].protocol == 'proto')) si_conns.shift();
				
				si_conns.forEach( function(conn) {
					conns.push({
						type: conn.protocol,
						state: conn.state || 'unknown',
						local_addr: conn.localAddress + ':' + conn.localPort,
						remote_addr: conn.peerAddress + ':' + conn.peerPort,
						pid: conn.pid || 0
					});
				}); // foreach conn
				
				finish(conns);
			} ); // si.networkConnections
		} // si
	}
	
	getOpenFiles(callback) {
		// use lsof to scan all open files
		var cmd = Tools.findBinSync('lsof');
		if (!cmd) return callback( new Error("Cannot locate lsof binary.") );
		
		// linux only: prevent duplicate files for threads
		if (process.platform == 'linux') cmd += ' -Ki';
		
		// rest of lsof CLI options are universal:
		// machine-readable output, skip blocking ops, formatting opts
		cmd += ' -RPn -F Ttpfn';
		
		cp.exec( cmd, { timeout: 10 * 1000 }, function(err, stdout, stderr) {
			if (err) return callback(err);
			
			// parse lsof output
			var files = [];
			var cur_proc = null;
			var cur_file = null;
			
			stdout.split(/\n/).forEach( function(line) {
				if (!line.match(/^(\w)(.+)$/)) return;
				var code = RegExp.$1;
				var value = RegExp.$2;
				
				switch (code) {
					case 'p':
						// new process
						if (cur_proc && cur_file) files.push( Tools.mergeHashes(cur_proc, cur_file) );
						cur_proc = { pid: parseInt(value) };
						cur_file = null;
					break;
					
					case 'f':
						// new file
						if (cur_proc && cur_file) files.push( Tools.mergeHashes(cur_proc, cur_file) );
						cur_file = { desc: value };
					break;
					
					case 't':
						// file type
						if (cur_file) cur_file.type = value;
					break;
					
					case 'n':
						// file path
						if (cur_file) cur_file.path = value;
					break;
					
					case 'T':
						// TCP socket info (append if applicable)
						if (cur_file && cur_file.path && value.match(/ST\=(.+)$/)) {
							cur_file.path += ' (' + RegExp.$1 + ')';
						}
					break;
				} // switch code
			} ); // foreach line
			
			if (cur_proc && cur_file) files.push( Tools.mergeHashes(cur_proc, cur_file) );
			
			callback(null, files);
		}); // cp.exec
	}
	
	detectVirtualization(callback) {
		// detect virtualization and get details if applicable
		// will produce: false, { vendor }, or { vendor, type, location }
		var info = false;
		
		// all these checks are linux-only, so skip if we're on another OS
		if (process.platform != 'linux') return callback(info);
		
		if (fs.existsSync('/sys/class/dmi/id/board_vendor')) {
			// public cloud of some kind (AWS, Google, Azure, DigitalOcean)
			try {
				var vendor = fs.readFileSync('/sys/class/dmi/id/board_vendor', 'utf8').trim();
				if (vendor.match(/\S/)) info = { vendor, cloud: true };
			}
			catch (err) {;}
			
			if (info && info.vendor.match(/\b(Amazon|AWS|EC2)\b/)) {
				// amazon ec2
				async.series([
					function(callback) {
						var opts = { timeout: 1000, idleTimeout: 1000 };
						self.request.get( 'http://169.254.169.254/latest/meta-data/instance-type', opts, function(err, resp, data, perf) {
							if (!err && data) info.type = data.toString().trim();
							callback();
						} );
					},
					function(callback) {
						var opts = { timeout: 1000, idleTimeout: 1000 };
						self.request.get( 'http://169.254.169.254/latest/meta-data/placement/availability-zone', opts, function(err, resp, data, perf) {
							if (!err && data) info.location = data.toString().trim();
							callback();
						} );
					}
				], function() { callback(info); } );
				return;
			} // aws
			else if (info && info.vendor.match(/\b(Google)\b/)) {
				// google compute cloud
				async.series([
					function(callback) {
						var opts = { timeout: 1000, idleTimeout: 1000 };
						self.request.get( 'http://metadata.google.internal/computeMetadata/v1/instance/machine-type', opts, function(err, resp, data, perf) {
							if (!err && data) info.type = data.toString().trim().split('/').pop();
							callback();
						} );
					},
					function(callback) {
						var opts = { timeout: 1000, idleTimeout: 1000 };
						self.request.get( 'http://metadata.google.internal/computeMetadata/v1/instance/zone', opts, function(err, resp, data, perf) {
							if (!err && data) info.location = data.toString().trim().split('/').pop();
							callback();
						} );
					}
				], function() { callback(info); } );
				return;
			} // google cloud
			else if (info && info.vendor.match(/\b(Microsoft|Azure)\b/)) {
				// microsoft azure cloud
				var opts = { timeout: 1000, idleTimeout: 1000 };
				self.request.json( 'http://169.254.169.254/metadata/instance?api-version=2020-06-01', false, opts, function(err, resp, data, perf) {
					if (!err && data && data.compute) {
						info.type = data.compute.vmSize;
						info.location = data.compute.location;
						callback(info);
					}
				} ); // request.json
				return;
			} // azure
			else if (info && info.vendor.match(/\b(DigitalOcean)\b/)) {
				// digital ocean droplet
				var opts = { timeout: 1000, idleTimeout: 1000 };
				self.request.json( 'http://169.254.169.254/metadata/v1.json', false, opts, function(err, resp, data, perf) {
					if (!err && data && data.region) {
						info.location = data.region;
						callback(info);
					}
				} ); // request.json
				return;
			} // digitalocean
		} // board_vendor
		
		if (!info && fs.existsSync('/sys/class/dmi/id/sys_vendor')) {
			// other vm (Linode, KVM, etc.)
			try {
				var vendor = fs.readFileSync('/sys/class/dmi/id/sys_vendor', 'utf8').trim();
				if (vendor.match(/\S/)) info = { vendor };
			}
			catch (err) {;}
		}
		
		if (!info && fs.existsSync('/sys/class/dmi/id/product_name')) {
			// other vm (QEMU, etc.)
			try {
				var vendor = fs.readFileSync('/sys/class/dmi/id/product_name', 'utf8').trim();
				if (vendor.match(/\S/)) info = { vendor };
			}
			catch (err) {;}
		}
		
		if (!info && fs.existsSync('/.dockerenv')) {
			// docker
			info = { vendor: 'Docker' };
		}
		
		if (!info && fs.existsSync('/proc/self/cgroup')) {
			// another way to detect docker
			try {
				var cgroup = fs.readFileSync('/proc/self/cgroup', 'utf8').trim();
				if (cgroup.match(/\b(docker)\b/i)) info = { vendor: 'Docker' };
			}
			catch (err) {;}
		}
		
		if (!info) {
			// check df for known mounts that might hint the vendor
			var df_bin = Tools.findBinSync('df');
			var df = df_bin ? cp.execSync(df_bin).toString() : '';
			if (df.match(/\b(orbstack)\b/)) info = { vendor: 'OrbStack' };
			else if (df.match(/\b(docker)\b/)) info = { vendor: 'Docker' };
			else if (df.match(/\b(kubelet)\b/)) info = { vendor: 'Kubernetes' };
			else if (df.match(/\b(qemu)\b/)) info = { vendor: 'QEMU' };
			else if (df.match(/\b(vboxsf)\b/)) info = { vendor: 'VirtualBox' };
			else if (df.match(/\b(vmhgfs)\b/)) info = { vendor: 'VMWare' };
			else if (df.match(/\b(hyperv)\b/)) info = { vendor: 'Hyper-V' };
		}
		
		if (!info && fs.existsSync('/proc/1/environ')) {
			// LXC
			try {
				var environ = fs.readFileSync('/proc/1/environ', 'utf8').toString().trim();
				if (environ.match(/\b(lxc)\b/i)) info = { vendor: 'LXC' };
			}
			catch (err) {;}
		}
		
		callback(info);
	}
	
});
