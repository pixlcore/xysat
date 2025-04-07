// Orchestra Satellite - Utils
// Copyright (c) 2025 Joseph Huckaby

const fs = require('fs');
const cp = require('child_process');
const os = require('os');
const Class = require("class-plus");
const Tools = require("pixl-tools");
const Path = require('path');
const zlib = require('zlib');
const sqparse = require('shell-quote').parse;
const async = require('async');
const si = require('systeminformation');

module.exports = Class({
	
},
class Utils {
	
	getCPUFast(skey, callback) {
		// get CPU info fast
		var self = this;
		var info = {
			avgLoad: os.loadavg()[0],
			currentLoad: 0,
			cpus: [],
			totals: { user: 0, nice: 0, system: 0, irq: 0, idle: 100, active: 0, iowait: 0, softirq: 0 }
		};
		
		if (this.platform.linux) {
			// use /proc/stat on linux
			if (!this.cpuState[skey]) this.cpuState[skey] = {};
			var state = this.cpuState[skey];
			
			fs.readFile( '/proc/stat', 'utf8', function(err, data) {
				if (err) return callback(info);
				
				data.trim().split(/\n/).forEach( function(line) {
					if (line.match(/^\s*(cpu\d*)\s+(.+)$/)) {
						var cpu_key = RegExp.$1;
						var cpu_values = RegExp.$2.trim().split(/\s+/).map( function(value) { return parseInt(value); } );
						
						if (cpu_values.length && state.proc_stat && state.proc_stat[cpu_key]) {
							var cpu_deltas = cpu_values.map( function(value, idx) {
								return Math.max( 0, value - state.proc_stat[cpu_key][idx] );
							});
							
							var delta_total = 0;
							cpu_deltas.forEach( function(delta) { delta_total += delta; } );
							if (!delta_total) delta_total = 1; // prevent divide-by-zero
							
							// convert each to percentage of total
							var percents = cpu_deltas.map( function(delta) {
								return Tools.shortFloat( 100 - (100 * ((delta_total - delta) / delta_total)) );
							});
							
							// format for JSON
							var pct_fmt = {
								'user': Tools.clamp(percents[0], 0, 100),
								'nice': Tools.clamp(percents[1], 0, 100),
								'system': Tools.clamp(percents[2], 0, 100),
								'idle': Tools.clamp(percents[3], 0, 100),
								'iowait': Tools.clamp(percents[4], 0, 100),
								'irq': Tools.clamp(percents[5], 0, 100),
								'softirq': Tools.clamp(percents[6], 0, 100),
								'active': 100 - Tools.clamp(percents[3], 0, 100)
							};
							
							if (cpu_key == 'cpu') info.totals = pct_fmt;
							else info.cpus.push(pct_fmt);
						} // found state
						else {
							// fill with zeroes first time through
							var pct_fmt = { user:0, nice:0, system:0, idle:100, iowait:0, irq:0, softirq:0, active:0 };
							if (cpu_key == 'cpu') info.totals = pct_fmt;
							else info.cpus.push(pct_fmt);
						}
						
						if (!state.proc_stat) state.proc_stat = {};
						state.proc_stat[cpu_key] = cpu_values;
					}
				} ); // for each line
				
				info.currentLoad = info.totals.active;
				callback(info);
			} ); // fs.readFile
		}
		else {
			// non-linux, use os.cpus() API
			var cpus = os.cpus().map(cpu => cpu.times);
			var total_idle = 0;
			var total_active = 0;
			
			if (!this.cpuState[skey]) {
				// first call, initialize state, return all zeroes
				for (var idx = 0, len = cpus.length; idx < len; idx++) {
					info.cpus.push({ user: 0, nice: 0, system: 0, irq: 0, idle: 100, active: 0, iowait: 0, softirq: 0 });
				}
				this.cpuState[skey] = cpus;
				return callback(info);
			}
			
			var state = this.cpuState[skey];
			
			cpus.forEach( function(cpu, idx) {
				var prev = state[idx];
				var idle = cpu.idle - prev.idle;
				var active = (cpu.user - prev.user) + (cpu.nice - prev.nice) + (cpu.sys - prev.sys) + (cpu.irq - prev.irq);
				var delta = idle + active;
				
				total_idle += idle;
				total_active += active;
				
				info.cpus.push({
					user: ((cpu.user - prev.user) / delta) * 100,
					nice: ((cpu.nice - prev.nice) / delta) * 100,
					system: ((cpu.sys - prev.sys) / delta) * 100,
					irq: ((cpu.irq - prev.irq) / delta) * 100,
					idle: (idle / delta) * 100,
					active: (active / delta) * 100,
					iowait: 0, // n/a on darwin
					softirq: 0 // n/a on darwin
				});
			} );
			
			var total_time = total_idle + total_active;
			info.currentLoad = (total_active / total_time) * 100;
			
			// add up totals
			info.totals.idle = 0;
			info.cpus.forEach( function(cpu) {
				for (var key in cpu) {
					info.totals[key] += cpu[key];
				}
			} );
			
			// totals should be averages across all CPUs
			for (var key in info.totals) {
				info.totals[key] /= (info.cpus.length || 1);
			}
			
			this.cpuState[skey] = cpus;
			callback(info);
		}
	}
	
	getMemFast(callback) {
		// get memory information fast
		var self = this;
		var info = {
			total: os.totalmem(),
    		free: os.freemem()
		};
		info.used = info.total - info.free;
		info.available = info.free;
		
		if (this.platform.linux) {
			// use /proc/meminfo on linux
			fs.readFile('/proc/meminfo', 'utf8', function (err, data) {
				if (err) return callback(info);
				
				data.trim().split(/\n/).forEach( function(line) {
					// MemAvailable:   15873932 kB
					if (line.match(/^\s*(\w+)\:\s*(.+)$/)) {
						var key = RegExp.$1;
						var value = RegExp.$2;
						info[ key.replace(/^Mem/, '').toLowerCase() ] = Tools.getBytesFromText(value);
					}
				} );
				
				// compute estimate of available mem
				if (!info.available && info.free && info.buffers) info.available = info.free + info.buffers;
				callback(info);
			});
		}
		else if (this.platform.darwin) {
			// use vm_stat on macos
			cp.execFile( '/usr/bin/vm_stat', [], { timeout: 750 }, function(err, stdout, stderr) {
				if (err) return callback(info);
				
				stdout.trim().split(/\n/).forEach( function(line) {
					// Pages free: 2596.
					if (line.trim().match(/^Pages\s+(\w+)\:\s*(\d+)\./)) {
						var key = RegExp.$1;
						var value = RegExp.$2;
						info[ key.toLowerCase() ] = parseInt(value, 10) * self.memPageSize;
					}
					else if (line.match(/File\-backed\s+pages\:\s*(\d+)\./)) {
						info.filemapped = parseInt(RegExp.$1, 10) * self.memPageSize;
					}
					else if (line.match(/Pages\s+stored\s+in\s+compressor\:\s*(\d+)\./)) {
						info.compressed = parseInt(RegExp.$1, 10) * self.memPageSize;
					}
				});
				
				// compute estimate of available mem
				if (info.used && info.active) {
					info.buffers = info.used - info.active;
              		info.available = info.free + info.buffers;
				}
				
				// rough estimate of cached
				info.cached = (info.inactive || 0) + (info.compressed || 0) + (info.filemapped || 0);
				
				callback(info);
			} );
		}
		else callback(info);
	}
	
	getDiskFast(callback) {
		// get disk stats fast
		var self = this;
		var info = { rx: 0, wx: 0 };
		
		if (this.platform.linux) {
			// linux mode, use /proc
			fs.readFile( '/proc/diskstats', 'utf8', function(err, data) {
				if (err) return callback(info);
				
				data.trim().split(/\n/).forEach( function(line) {
					if (!line.match(self.diskDeviceMatch)) return;
					
					const parts = line.trim().split(/\s+/);
					if (parts.length >= 14) {
						info.rx += (parseInt(parts[5], 10) * 512);
						info.wx += (parseInt(parts[9], 10) * 512);
					}
				} );
				callback(info);
			} );
		}
		else if (this.platform.darwin) {
			// macos mode, we need to exec a thing
			cp.execFile( '/usr/sbin/ioreg', ['-c', 'IOBlockStorageDriver', '-k', 'Statistics', '-r', '-w0'], { timeout: 750 }, function(err, stdout, stderr) {
				if (err) return callback(info);
				
				stdout.trim().split(/\n/).forEach( function(line) {
					// "Bytes (Read)"=1367766069248
					// "Bytes (Write)"=899319865344
					if (line.match(/\"Bytes\s*\(Read\)\"\=(\d+)/)) info.rx += parseInt(RegExp.$1, 10);
					if (line.match(/\"Bytes\s*\(Write\)\"\=(\d+)/)) info.wx += parseInt(RegExp.$1, 10);
				});
				
				callback(info);
			} );
		}
		else callback(info);
	}
	
	getNetFast(callback) {
		// get net stats fast
		var self = this;
		var info = { rx: 0, tx: 0 };
		var ifaces = [];
		
		for (var iface in this.interfaces) {
			if (iface.match(/^\w+$/) && this.interfaces[iface][0] && !this.interfaces[iface][0].internal) ifaces.push(iface);
		}
		if (!ifaces.length) return callback(info);
		
		if (this.platform.linux) {
			// use /proc/net/dev for linux (all external interfaces)
			var re = new RegExp("^\\s*(" + ifaces.join('|') + ")\\:" );
			
			fs.readFile( '/proc/net/dev', 'utf8', function(err, data) {
				if (err) return callback(info);
				
				data.trim().split(/\n/).forEach( function(line) {
					if (!line.match(re)) return;
					var parts = line.trim().split(/\s+/);
					info.rx += parseInt(parts[1], 10); // RX bytes
					info.tx += parseInt(parts[9], 10); // TX bytes
				} );
				
				callback(info);
			});
		}
		else if (this.platform.darwin) {
			// use netstat for macos (first external interface only)
			cp.execFile( '/usr/sbin/netstat', ['-bdI', this.defaultInterfaceName], { timeout: 750 }, function(err, stdout, stderr) {
				if (err) return callback(info);
				// Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll Drop
				// en0        1500  <Link#14>   f4:d4:88:6c:4b:ee 317608715     0 429293416196 52253328     0 11215265711     0 104
				var lines = stdout.trim().split(/\n/);
				var headers = lines.shift().trim().split(/\s+/);
				var cols = lines.shift().trim().split(/\s+/);
				
				var data = {};
				for (var idx = 0, len = headers.length; idx < len; idx++) {
					data[ headers[idx] ] = cols[idx];
				}
				
				info.rx += parseInt( data.Ibytes || 0, 10 );
				info.tx += parseInt( data.Obytes || 0, 10 );
				
				callback(info);
			});
		}
		else callback(info);
	}
	
	getProcsCached(callback) {
		// get process information, cached with a dynamic rolling debounce
		// (TTL is based on the previous cache miss elapsed time)
		// (designed to throttle on slower machines, or with thousands of processes)
		var self = this;
		var now = Tools.timeNow();
		var cache = this.procCache;
		
		if (cache.data) {
			if (now < cache.expires) {
				// still fresh
				return callback( Tools.copyHash(cache.data, true) );
			}
		}
		
		this.getProcsFast( function(data) {
			// save cache data
			cache.data = data;
			cache.date = Tools.timeNow();
			cache.elapsed = cache.date - now;
			cache.expires = cache.date + (cache.elapsed * 5);
			callback( Tools.copyHash(cache.data, true) );
		} );
	}
	
	getProcsFast(callback) {
		// get process information fast
		var self = this;
		var now = Tools.timeNow(true);
		
		if (this.platform.windows) {
			return si.processes( function(data) {
				data.list.forEach( function(proc) {
					// convert data to our native format
					try { 
						proc.started = Math.floor( (new Date(proc.started)).getTime() / 1000 );
						proc.age = now - proc.started;
					}
					catch (e) { proc.started = proc.age = 0; }
					
					// some commands are quoted
					proc.command = proc.command.replace(/^\"(.+?)\"/, '$1');
					
					// cleanup state
					proc.state = Tools.ucfirst( proc.state || 'unknown' );
					
					delete proc.path;
					delete proc.params;
				});
				callback(data);
			} );
		} // windows
		
		var info = { list: [] };
		var ps_args = [];
		var ps_opts = {
			env: Object.assign( {}, process.env ),
			maxBuffer: 1024 * 1024 * 100, 
			timeout: 30000 
		};
		const colMap = {
			ppid: 'parentPid',
			rss: 'memRss',
			vsz: 'memVsz',
			tt: 'tty',
			thcnt: 'threads',
			pri: 'priority',
			ni: 'nice',
			s: 'state',
			stat: 'state',
			elapsed: 'age',
			cls: 'class',
			gid: 'group',
			args: 'command'
		};
		const stateMap = {
			I: 'Idle',
			S: 'Sleeping',
			D: 'Sleeping',
			U: 'Sleeping',
			R: 'Running',
			Z: 'Zombie',
			T: 'Stopped',
			t: 'Stopped',
			W: 'Paged',
			X: 'Dead'
		};
		const classMap = {
			TS: 'Other',
			FF: 'FIFO',
			RR: 'RR',
			B: 'Batch',
			ISO: 'ISO',
			IDL: 'Idle',
			DLN: 'Deadline'
		};
		const filterMap = {
			pid: parseInt,
			parentPid: parseInt,
			priority: parseInt,
			nice: parseInt,
			threads: parseInt,
			time: parseInt,
			
			// cpu: parseFloat,
			mem: parseFloat,
			
			cpu: function(value) {
				// divide by CPU count for real value
				return parseFloat(value) / self.numCPUs;
			},
			
			age: function(value) {
				if (value.match(/^\d+$/)) return parseInt(value);
				if (value.match(/^(\d+)\-(\d+)\:(\d+)\:(\d+)$/)) {
					// DD-HH:MI:SS
					var [ dd, hh, mi, ss ] = [ RegExp.$1, RegExp.$2, RegExp.$3, RegExp.$4 ];
					return ( (parseInt(dd) * 86400) + (parseInt(hh) * 3600) + (parseInt(mi) * 60) + parseInt(ss) );
				}
				if (value.match(/^(\d+)\:(\d+)\:(\d+)$/)) {
					// HH:MI:SS
					var [ hh, mi, ss ] = [ RegExp.$1, RegExp.$2, RegExp.$3 ];
					return ( (parseInt(hh) * 3600) + (parseInt(mi) * 60) + parseInt(ss) );
				}
				if (value.match(/^(\d+)\:(\d+)$/)) {
					// MI:SS
					var [ mi, ss ] = [ RegExp.$1, RegExp.$2 ];
					return ( (parseInt(mi) * 60) + parseInt(ss) );
				}
				return 0;
			},
			memRss: function(value) {
				return parseInt(value) * 1024;
			},
			memVsz: function(value) {
				return parseInt(value) * 1024;
			},
			state: function(value) {
				return stateMap[value.substring(0, 1)] || 'Unknown';
			},
			class: function(value) {
				return classMap[value] || 'Unknown';
			},
			group: function(value) {
				if (value.match(/^\d+$/)) {
					var group = Tools.getgrnam( value, true ); // cached in ram
					if (group && group.name) return group.name;
				}
				return value;
			}
		};
		
		if (this.platform.linux) {
			// PID    PPID USER     %CPU   RSS ELAPSED S PRI  NI    VSZ TT       %MEM CLS GROUP    THCNT     TIME COMMAND
			ps_args = ['-eo', 'pid,ppid,user,%cpu,rss,etimes,state,pri,nice,vsz,tty,%mem,class,group,thcount,times,args'];
			ps_opts.env.LC_ALL = 'C';
		}
		else if (this.platform.darwin) {
			// PID  PPID  %CPU %MEM PRI      VSZ    RSS NI     ELAPSED STAT TTY      USER               GID ARGS
			ps_args = ['-axro', 'pid,ppid,%cpu,%mem,pri,vsz,rss,nice,etime,state,tty,user,group,args'];
		}
		
		cp.execFile( this.psBin, ps_args, ps_opts, function(err, stdout, stderr) {
			if (err) return callback(info);
			
			var lines = stdout.trim().split(/\n/);
			var headers = lines.shift().trim().split(/\s+/).map( function(key) { return key.trim().toLowerCase().replace(/\W+/g, ''); } );
			
			lines.forEach( function(line) {
				var cols = line.trim().split(/\s+/);
				if (cols.length > headers.length) {
					var extras = cols.splice(headers.length);
					cols[ headers.length - 1 ] += ' ' + extras.join(' ');
				}
				var proc = {};
				
				headers.forEach( function(key, idx) {
					key = colMap[key] || key;
					proc[key] = filterMap[key] ? filterMap[key](cols[idx]) : cols[idx];
				} );
				
				proc.started = Math.max(0, now - (proc.age || 0));
				
				// state bookkeeping
				var state = proc.state.toLowerCase();
				info[ state ] = (info[ state ] || 0) + 1;
				info.all = (info.all || 0) + 1;
				
				info.list.push(proc);
			} );
			
			callback(info);
		}); // cp.execFile
	}
	
});
