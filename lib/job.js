// Orchestra Satellite - Communication Layer
// Copyright (c) 2020 - 2022 Joseph Huckaby

const fs = require('fs');
const cp = require('child_process');
const WebSocket = require('ws');
const Class = require("class-plus");
const Tools = require("pixl-tools");
const os = require('os');
const Path = require('path');
const zlib = require('zlib');
const sqparse = require('shell-quote').parse;
const Request = require('pixl-request');
const JSONStream = require('pixl-json-stream');
const async = require('async');
const si = require('systeminformation');

module.exports = Class({
	
	activeJobs: {},
	kids: {},
	connCache: {},
	
},
class Jobs {
	
	launchJob(job) {
		// launch job on this server!
		var self = this;
		var child = null;
		var worker = null;
		
		// remove activity (meta) from this copy of the job, 
		// so our updates don't clobber the meta log which is maintained in master
		delete job.activity;
		
		this.logDebug(6, "Launching job on server", job);
		
		// setup optional legacy log that user code can write to
		job.log_file = Path.resolve( Path.join(this.config.get('log_dir'), 'jobs', 'job-' + job.id + '.log') );
		
		// setup environment for child
		var child_opts = {
			cwd: job.cwd || process.cwd(),
			uid: job.uid || process.getuid(),
			gid: process.getgid(),
			env: Tools.mergeHashes(
				this.config.get('job_env') || {},
				Tools.mergeHashes( process.env, job.env || {} )
			)
		};
		
		child_opts.env['ORCHESTRA'] = this.server.__version;
		child_opts.env['CRONICLE'] = this.server.__version; // for legacy purposes
		child_opts.env['JOB_ID'] = job.id;
		child_opts.env['JOB_LOG'] = job.log_file; // legacy
		child_opts.env['JOB_NOW'] = job.now;
		child_opts.env['PWD'] = child_opts.cwd;
		
		// copy all top-level job keys into child env, if number/string/boolean
		for (var key in job) {
			switch (typeof(job[key])) {
				case 'string': 
				case 'number':
					child_opts.env['JOB_' + key.toUpperCase()] = '' + job[key]; 
				break;
				
				case 'boolean':
					child_opts.env['JOB_' + key.toUpperCase()] = job[key] ? 1 : 0;
				break;
			}
		}
		
		// get uid / gid info for child env vars
		var user_info = Tools.getpwnam( child_opts.uid, true );
		if (user_info) {
			child_opts.uid = user_info.uid;
			child_opts.gid = user_info.gid;
			child_opts.env.USER = child_opts.env.USERNAME = user_info.username;
			child_opts.env.HOME = user_info.dir;
			child_opts.env.SHELL = user_info.shell;
		}
		else if (child_opts.uid != process.getuid()) {
			// user not found
			job.pid = 0;
			job.code = 1;
			job.description = "Plugin Error: User does not exist: " + child_opts.uid;
			this.logError("child", job.description);
			this.activeJobs[ job.id ] = job;
			this.finishJob( job );
			return;
		}
		
		if (job.gid) {
			var grp_info = Tools.getgrnam( job.gid, true );
			if (grp_info) {
				child_opts.gid = grp_info.gid;
			}
			else {
				// gid not found
				job.pid = 0;
				job.code = 1;
				job.description = "Plugin Error: Group does not exist: " + job.gid;
				this.logError("child", job.description);
				this.activeJobs[ job.id ] = job;
				this.finishJob( job );
				return;
			}
		}
		
		child_opts.uid = parseInt( child_opts.uid );
		child_opts.gid = parseInt( child_opts.gid );
		
		// add plugin params as env vars, expand $INLINE vars
		if (job.params) {
			for (var key in job.params) {
				child_opts.env[key.toUpperCase()] = 
					(''+job.params[key]).replace(/\$(\w+)/g, function(m_all, m_g1) {
					return (m_g1 in child_opts.env) ? child_opts.env[m_g1] : '';
				});
			}
		}
		
		// spawn child
		var child_cmd = job.command;
		var child_args = [];
		
		if (child_cmd.match(/^\[([\w\-]+)\]$/)) {
			// special syntax for built-in plugins
			var plugin_name = RegExp.$1;
			if (process.pkg) {
				child_cmd = process.execPath;
				child_args = [ '--plugin', plugin_name ];
			}
			else {
				child_cmd = process.argv[0];
				child_args = [ process.argv[1], '--plugin', plugin_name ];
			}
		}
		else if (child_cmd.match(/\s+(.+)$/)) {
			// if command has cli args, parse using shell-quote
			var cargs_raw = RegExp.$1;
			child_cmd = child_cmd.replace(/\s+(.+)$/, '');
			child_args = sqparse( cargs_raw, child_opts.env );
		}
		
		// add plugin script if configured
		if (job.script) {
			child_args.push( Path.resolve( Path.join( this.config.get('temp_dir'), 'plugins', job.plugin + '.bin' ) ) );
		}
		
		worker = {};
		
		// attach streams
		child_opts.stdio = ['pipe', 'pipe', 'pipe'];
		
		this.logDebug(9, "Spawning child: " + child_cmd, { args: child_args, opts: child_opts });
		
		// spawn child
		try {
			child = cp.spawn( child_cmd, child_args, child_opts );
			if (!child || !child.pid || !child.stdin || !child.stdout) {
				throw new Error("Child process failed to spawn (Check executable location and permissions?)");
			}
		}
		catch (err) {
			if (child) child.on('error', function() {}); // prevent crash
			job.pid = 0;
			job.code = 1;
			job.description = "Child spawn error: " + child_cmd + ": " + Tools.getErrorDescription(err);
			this.logError("child", job.description);
			this.activeJobs[ job.id ] = job;
			this.finishJob( job );
			return;
		}
		job.pid = child.pid || 0;
		
		this.logDebug(3, "Spawned child process: " + job.pid + " for job: " + job.id, child_cmd);
		this.appendMetaLog(job, "Spawned child process: PID " + job.pid);
		
		// connect json stream to child's stdio
		// order reversed deliberately (out, in)
		var stream = new JSONStream( child.stdout, child.stdin );
		stream.recordRegExp = /^\s*\{.+\}\s*$/;
		stream.preserveWhitespace = true;
		stream.maxLineLength = 1024 * 1024;
		
		worker.pid = job.pid;
		worker.child = child;
		worker.stream = stream;
		
		stream.on('json', function(data) {
			// received data from child
			self.handleChildResponse(job, worker, data);
		} );
		
		stream.on('text', function(line) {
			// received non-json text from child, log it
			if (line.match(/\r/)) line = line.split(/\r/).pop();
			self.appendJobLog(job, line);
		} );
		
		stream.on('error', function(err, text) {
			// Probably a JSON parse error (child emitting garbage)
			self.logError('job', "Child stream error: Job ID " + job.id + ": PID " + job.pid + ": " + err);
			if (text) self.appendJobLog(job, text);
		} );
		
		child.stderr.on('data', function(data) {
			// child printed something to STDERR, capture and pass along to log
			self.appendJobLog(job, data);
		});
		
		child.on('error', function (err) {
			// child error
			job.code = 1;
			job.description = "Child process error: " + Tools.getErrorDescription(err);
			worker.child_exited = true;
			self.logError("child", job.description);
			self.finishJob( job );
		} );
		
		child.on('close', function (code, signal) {
			// child exited
			self.logDebug(3, "Child " + job.pid + " exited with code: " + (code || signal || 0));
			self.appendMetaLog(job, "Child exited with code: " + (code || signal || 0));
			worker.child_exited = true;
			
			// if we're shutting down, don't do anything else
			if (self.server.shut) return;
			
			if (job.complete) {
				// child already reported completion, so finish job now
				self.finishJob( job );
			}
			else {
				// job is not complete but process exited (could be coming in next tick)
				// set timeout just in case something went wrong
				worker.complete_timer = setTimeout( function() {
					job.code = code || 'warning';
					job.description = code ? 
						("Child " + job.pid + " crashed with code: " + (code || signal)) : 
						("Process exited without reporting job completion.");
					if (!code) job.unknown = 1;
					self.finishJob( job );
				}, 1000 );
			}
		} ); // on exit
		
		// send initial job + params
		stream.write( job );
		
		// we're done writing to the child -- don't hold its stdin open
		worker.child.stdin.end();
		
		// track job in our own hash
		this.activeJobs[ job.id ] = job;
		this.kids[ job.pid ] = worker;
	}
	
	appendJobLog(job, msg) {
		// append user-generated output to job log (via socket request)
		if (this.socket && this.socket.connected && this.socket.auth) {
			this.socket.send('job_log', { id: job.id, text: ''+msg } );
		}
		else {
			// no socket connection?  log it locally to the legacy job log file (will be uploaded as attachment).
			fs.appendFileSync( job.log_file, ''+msg );
		}
	}
	
	appendMetaLog(job, msg) {
		// append message to special "meta" log inside the job object (via socket request)
		if (this.socket && this.socket.connected && this.socket.auth) {
			this.socket.send('job_meta', { id: job.id, text: msg } );
		}
		// this.logDebug(6, "Job " + job.id + " Meta: " + msg);
		if (this.debugLevel(6)) {
			this.logger.set( 'component', 'Job-' + job.id );
			this.logger.print({ 
				category: 'debug', 
				code: 6, 
				msg: msg, 
				data: null 
			});
		}
	}
	
	handleChildResponse(job, worker, data) {
		// child sent us some datas (progress or completion)
		var found = false;
		this.logDebug(10, "Got job update from child: " + job.pid, data);
		
		if (job.complete) {
			// prevent child from overwriting things when the job has been aborted remotely
			this.logDebug(9, "Job is already complete, ignoring child update");
			return;
		}
		if (job.code === 'abort') {
			this.logDebug(9, "Job is being aborted, ignoring child update");
			return;
		}
		
		// assume success if complete but no code specified
		if (data.complete && !data.code) data.code = 0;
		
		// merge in data
		if (data.orchestra) {
			// new api: provide `orchestra` key and everything else gets imported
			Tools.mergeHashInto( job, Tools.copyHashRemoveKeys(data, { orchestra:1 }) );
			found = true;
		}
		else {
			// old api: only look for specific keys, to avoid importing junk into RAM
			
			// legacy chain reaction API
			if (data.chain) {
				// legacy, convert to new action
				if (!job.push) job.push = {};
				if (!job.push.actions) job.push.actions = [];
				job.push.actions.push({ trigger: 'success', type: 'run_event', event_id: data.chain, params: data.chain_params || {}, enabled: true });
				found = true;
			}
			if (data.chain_error) {
				// legacy, convert to new action
				if (!job.push) job.push = {};
				if (!job.push.actions) job.push.actions = [];
				job.push.actions.push({ trigger: 'error', type: 'run_event', event_id: data.chain_error, enabled: true });
				found = true;
			}
			if (data.chain_data) {
				// legacy, convert to new data property
				data.data = data.chain_data;
				delete data.chain_data;
				found = true;
			}
			
			// legacy notification API
			if (data.notify_success) {
				if (!job.push) job.push = {};
				if (!job.push.actions) job.push.actions = [];
				job.push.actions.push({ trigger: 'success', type: 'email', email: data.notify_success, enabled: true });
				found = true;
			}
			if (data.notify_fail) {
				if (!job.push) job.push = {};
				if (!job.push.actions) job.push.actions = [];
				job.push.actions.push({ trigger: 'error', type: 'email', email: data.notify_fail, enabled: true });
				found = true;
			}
			
			// TODO: what is this `skip` key below?  Shouldn't that be an action trigger?
			
			// copy over known keys
			['progress', 'complete', 'code', 'description', 'perf', 'update_event', 'table', 'html', 'files', 'data', 'skip', 'tags', 'push'].forEach( function(key) {
				if (key in data) { job[key] = data[key]; found = true; }
			} );
			
			if (!found) {
				// random JSON from child that we don't recognize, log it and skip
				self.appendJobLog(job, JSON.stringify(data));
			}
		}
		
		if (found) {
			// if either table or html provided, update a draw checksum token as a hint to the UI
			if (data.table || data.html || data.markdown || data.text || data.perf || job.push) job.redraw = Tools.generateShortID();
			
			// handle file push in satellite, do not send over to master
			if (job.push && job.push.files) {
				if (!job.files) job.files = [];
				job.files = job.files.concat( job.push.files );
				delete job.push.files;
				if (!Tools.numKeys(job.push)) delete job.push;
			}
		}
		
		if (job.complete && worker.child_exited) {
			// in case this update came in after child exited
			this.finishJob( job );
		}
	}
	
	finishJob(job) {
		// complete job
		var self = this;
		
		// job may already be removed (sanity check)
		if (!this.activeJobs[ job.id ]) return;
		if (job.state != 'active') return;
		
		// if we're shutting down, don't finish job
		if (this.server.shut) return;
		
		// only complete if we have a healthy socket connection to master
		if (!this.socket || !this.socket.connected || !this.socket.auth) {
			this.logDebug(5, "No socket connection, job is waiting to finish: " + job.id);
			setTimeout( function() { self.finishJob(job); }, 1000 );
			return;
		}
		
		// mark as complete
		job.complete = true;
		job.progress = 1.0;
		
		this.logDebug(5, "Job completed " + (job.code ? "with error" : "successfully"), job);
		this.appendMetaLog(job, "Job is finishing");
		
		// kill completion timer, if set
		var worker = this.kids[ job.pid ] || {};
		if (worker.complete_timer) {
			clearTimeout( worker.complete_timer );
			delete worker.complete_timer;
		}
		if (worker.kill_timer) {
			clearTimeout( worker.kill_timer );
			delete worker.kill_timer;
		}
		
		// if non-zero code, we expect a string description
		if (job.code != 0) {
			if (!job.description) job.description = "Unknown Error (no description provided)";
		}
		if (job.description) {
			job.description = '' + job.description;
		}
		
		// cleanup child worker
		if (job.pid) delete self.kids[ job.pid ];
		
		// change state so master knows we're finishing
		job.state = 'finishing';
		
		// send update to parent right now, instead of waiting for next tick
		self.updateJob(job);
		
		// add legacy job log to files array (glob will remove it if non-existent)
		if (!job.files) job.files = [];
		job.files.push({ path: job.log_file, delete: true });
		
		this.prepUploadJobFiles(job, function(err) {
			if (err) {
				job.code = err.code || 'upload';
				job.description = "" + (err.message || err);
			}
			
			// now we're done done with job
			job.state = 'complete';
			self.updateJob(job);
			delete self.activeJobs[ job.id ];
			
			self.logDebug(6, "Job is complete", { job_id: job.id });
		});
	}
	
	prepUploadJobFiles(job, callback) {
		// glob all file requests to resolve them to individual files, then upload
		var self = this;
		var to_upload = [];
		if (!job.files || !job.files.length || !Tools.isaArray(job.files)) return callback();
		
		async.eachSeries( job.files,
			function(file, callback) {
				if (typeof(file) == 'string') {
					file = { path: file };
				}
				else if (Array.isArray(file)) {
					if (file.length == 3) file = { path: file[0], filename: file[1], delete: file[2] };
					else if (file.length == 2) file = { path: file[0], filename: file[1] };
					else file = { path: file[0] };
				}
				
				if (file.filename) {
					// if user specified a custom filename, then do not perform a glob
					to_upload.push(file);
					process.nextTick(callback);
				}
				else Tools.glob( file.path, function(err, files) {
					if (!files) files = [];
					files.forEach( function(path) {
						to_upload.push({ path: path, delete: !!file.delete });
					} );
					callback();
				} );
			},
			function() {
				job.files = to_upload;
				self.uploadJobFiles(job, callback);
			}
		); // eachSeries
	}
	
	uploadJobFiles(job, callback) {
		// upload all job files (from user) if applicable
		var self = this;
		var storage_keys = [];
		var server_id = this.config.get('server_id');
		if (!job.files || !job.files.length || !Tools.isaArray(job.files)) return callback();
		
		async.eachSeries( job.files,
			function(file, callback) {
				self.logDebug(6, "Uploading file for job", { job_id: job.id, file });
				self.appendMetaLog(job, "Uploading file: " + file.path + " (" + (file.filename || Path.basename(file.path)) + ")");
				
				var url = (self.config.get('secure') ? 'https:' : 'http:') + '//' + self.socket.host + '/api/app/upload_job_file';
				var opts = Tools.mergeHashes( self.config.get('socket_opts') || {}, {
					"files": {
						file1: [file.path, file.filename || Path.basename(file.path)]
					},
					"data": {
						id: job.id,
						auth: Tools.digestHex( job.id + self.config.get('secret_key'), 'sha256' )
					}
				});
				
				self.logDebug(6, "Uploading job file", { job_id: job.id, file, url });
				
				self.request.post( url, opts, function(err, resp, data, perf) {
					if (err) {
						return callback( new Error("Failed to upload job log: " + (err.message || err)) );
					}
					
					var json = null;
					try { json = JSON.parse( data.toString() ); }
					catch (err) { return callback(err); }
					
					if (json.code && json.description) {
						return callback( new Error("Orchestra API Error: " + data.description) );
					}
					
					self.logDebug(8, "File upload complete", { job_id: job.id, key: json.key, size: json.size, perf: perf.metrics() });
					
					// save storage key
					storage_keys.push({ path: json.key, size: json.size, server: server_id });
					
					if (file.delete) fs.unlink(file.path, callback);
					else return callback();
				}); // request.post
			},
			function(err) {
				// replace job.files with storage keys
				if (err) {
					self.logError('upload', "" + err);
				}
				else {
					job.files = storage_keys;
					self.logDebug(8, "All files uploaded", job.files);
				}
				callback(err);
			}
		);
	}
	
	updateJob(job) {
		// send separate, single update to master for specific job
		// (do not send procs or conns, as those need to be sent on a tick schedule)
		if (!this.socket || !this.socket.connected || !this.socket.auth) return;
		
		var jobs = {};
		jobs[ job.id ] = Tools.copyHashRemoveKeys(job, { procs:1, conns:1 });
		
		this.socket.send('jobs', jobs);
		
		// clean up push system
		delete job.push;
	}
	
	measureJobResources(job, pids) {
		// scan process list for all processes that are descendents of job pid
		delete job.procs;
		
		if (pids[ job.pid ]) {
			// add all procs into job
			job.procs = {};
			job.procs[ job.pid ] = pids[ job.pid ];
			
			var info = pids[ job.pid ];
			var cpu = info.cpu;
			var mem = info.memRss;
			
			// also consider children of the child (up to 100 generations deep)
			var levels = 0;
			var family = {};
			family[ job.pid ] = 1;
			
			while (Tools.numKeys(family) && (++levels <= 100)) {
				for (var fpid in family) {
					for (var cpid in pids) {
						if (pids[ cpid ].parentPid == fpid) {
							family[ cpid ] = 1;
							cpu += pids[ cpid ].cpu;
							mem += pids[ cpid ].memRss;
							job.procs[ cpid ] = pids[ cpid ];
						} // matched
					} // cpid loop
					delete family[fpid];
				} // fpid loop
			} // while
			
			if (job.cpu) {
				if (cpu < job.cpu.min) job.cpu.min = cpu;
				if (cpu > job.cpu.max) job.cpu.max = cpu;
				job.cpu.total += cpu;
				job.cpu.count++;
				job.cpu.current = cpu;
			}
			else {
				job.cpu = { min: cpu, max: cpu, total: cpu, count: 1, current: cpu };
			}
			
			if (job.mem) {
				if (mem < job.mem.min) job.mem.min = mem;
				if (mem > job.mem.max) job.mem.max = mem;
				job.mem.total += mem;
				job.mem.count++;
				job.mem.current = mem;
			}
			else {
				job.mem = { min: mem, max: mem, total: mem, count: 1, current: mem };
			}
			
			if (this.debugLevel(10)) {
				this.logDebug(10, "Active Job: " + job.pid + ": CPU: " + cpu + "%, Mem: " + Tools.getTextFromBytes(mem));
			}
		} // matched job with pid
	}
	
	measureJobDiskIO(callback) {
		// use linux /proc/PID/io to glean disk r/w per sec per job proc
		var self = this;
		var procs = [];
		
		// zero everything out for non-linux
		for (var job_id in this.activeJobs) {
			var job = this.activeJobs[job_id];
			if (job.procs) {
				for (var pid in job.procs) { job.procs[pid].disk = 0; }
			}
		}
		
		// this trick is linux only
		if (process.platform != 'linux') return process.nextTick( callback );
		
		// get array of all active job procs
		for (var job_id in this.activeJobs) {
			var job = this.activeJobs[job_id];
			if (job.procs) procs = procs.concat( Object.values(job.procs) );
		}
		
		// parallelize this just a smidge, as it can be a lot of reads
		async.eachLimit( procs, 4,
			function(proc, callback) {
				fs.readFile( '/proc/' + proc.pid + '/io', 'utf8', function(err, text) {
					// if (!text) text = "rchar: " + Math.floor( Tools.timeNow(true) * 1024 ); // sample data (for testing)
					if (!text) text = "";
					
					// parse into key/value pairs
					var params = {};
					text.replace( /(\w+)\:\s*(\d+)/g, function(m_all, key, value) {
						params[key] = parseInt(value);
						return m_all;
					} );
					
					// take disk w + r per proc
					proc.disk = (params.rchar || 0) + (params.wchar || 0);
					// proc.disk = (params.read_bytes || 0) + (params.write_bytes || 0);
					
					callback();
				} );
			},
			callback
		); // async.eachLimit
	}
	
	measureJobNetworkIO(callback) {
		// use linux `ss` utility to glean network r/w per sec per job proc
		var self = this;
		
		// zero everything out for non-linux
		for (var job_id in this.activeJobs) {
			var job = this.activeJobs[job_id];
			if (job.procs) {
				for (var pid in job.procs) { 
					job.procs[pid].conns = 0; 
					job.procs[pid].net = 0; 
				}
			}
		}
		
		// this trick is linux only
		if ((process.platform != 'linux') || !this.ssBin) return process.nextTick( callback );
		
		cp.exec( this.ssBin + ' -nutipaO', { timeout: 1000, maxBuffer: 1024 * 1024 * 32 }, function(err, stdout, stderr) {
			if (err) {
				self.logError('cp', "Failed to launch ss: " + err);
				return callback();
			}
			
			var now = Tools.timeNow(true);
			var lines = stdout.split(/\n/);
			var ids = {};
			
			lines.forEach( function(line) {
				if (line.match(/^(tcp|tcp4|tcp6|udp|udp4|udp6)\s+(\w+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+.+pid\=(\d+)/)) {
					var type = RegExp.$1, state = RegExp.$2, local_addr = RegExp.$5, remote_addr = RegExp.$6, pid = RegExp.$7;
					
					// clean up some stuff
					pid = parseInt(pid);
					if (state == "ESTAB") state = 'ESTABLISHED';
					if (state == "UNCONN") state = 'UNCONNECTED';
					
					// generate socket "id" key using combo of local + remote
					var id = local_addr + '|' + remote_addr;
					
					if (!self.connCache[id]) self.connCache[id] = { bytes: 0, delta: 0, started: now };
					var conn = self.connCache[id];
					
					conn.type = type;
					conn.state = state;
					conn.local_addr = local_addr;
					conn.remote_addr = remote_addr;
					conn.pid = pid;
					
					var bytes = 0;
					if (line.match(/\bbytes_acked\:(\d+)/)) bytes += parseInt( RegExp.$1 ); // tx
					if (line.match(/\bbytes_received\:(\d+)/)) bytes += parseInt( RegExp.$1 ); // rx
					
					conn.delta = bytes - conn.bytes;
					conn.bytes = bytes;
					
					ids[id] = 1;
				}
			} ); // foreach line
			
			// delete sweep for removed conns
			for (var id in self.connCache) {
				if (!(id in ids)) delete self.connCache[id];
			}
			
			// join up conns with jobs and job procs
			Object.values(self.activeJobs).forEach( function(job) {
				if (!job.procs) return;
				
				job.conns = [];
				for (var id in self.connCache) {
					var conn = self.connCache[id];
					if (conn.pid in job.procs) {
						job.conns.push(conn);
						job.procs[conn.pid].conns++;
						job.procs[conn.pid].net += conn.delta;
					}
				}
				
			}); // foreach job
			
			callback();
		} ); // cp.exec
	}
	
	jobTick() {
		// send all active jobs to master
		// called every second
		var self = this;
		if (!this.socket || !this.socket.connected || !this.socket.auth) return;
		if (!Tools.numKeys(this.activeJobs)) return;
		
		if (this.jobTickInProgress) return; // no steppy on toesy
		this.jobTickInProgress = true;
		
		// scan all processes on machine
		// si.processes( function(data) {
		this.getProcsFast( function(data) {
			if (!self.socket || !self.socket.connected || !self.socket.auth) {
				self.jobTickInProgress = false;
				return;
			}
			
			// cleanup and convert to hash of pids
			var pids = {};
			data.list.forEach( function(proc) {
				// proc.started = (new Date( proc.started )).getTime() / 1000;
				// proc.memRss = proc.memRss * 1024;
				// proc.memVsz = proc.memVsz * 1024;
				pids[ proc.pid ] = proc;
			} );
			
			for (var job_id in self.activeJobs) {
				var job = self.activeJobs[job_id];
				self.measureJobResources(job, pids);
			}
			
			async.parallel(
				[
					self.measureJobDiskIO.bind(self),
					self.measureJobNetworkIO.bind(self)
				],
				function() {
					if (!self.socket || !self.socket.connected || !self.socket.auth) {
						self.jobTickInProgress = false;
						return;
					}
					
					self.socket.send('jobs', self.activeJobs);
					
					// cleanup push system
					for (var job_id in self.activeJobs) {
						var job = self.activeJobs[job_id];
						delete job.push;
					}
					
					self.jobTickInProgress = false;
				}
			); // async.parallel
		} ); // si.processes
	}
	
	checkJobLogSizes() {
		// make sure legacy job log sizes don't grow too large
		// called every minute
		var self = this;
		var limited = Object.values(this.activeJobs).filter( function(job) {
			return !job.complete && Tools.findObject( job.limits, { type: 'log', enabled: true } );
		} );
		
		async.eachSeries( limited, function(job, callback) {
			var log_limit = Tools.findObject( job.limits, { type: 'log', enabled: true } );
			
			fs.stat( job.log_file, function(err, stats) {
				if (stats && stats.size && log_limit.amount && (stats.size > log_limit.amount)) {
					// job log file has grown too large!
					job.retry_ok = true; // allow retry even though we're aborting
					self.abortJob({ id: job.id, reason: "Job log file size has exceeded maximum size limit of " + Tools.getTextFromBytes(log_limit.amount) + "." });
				}
				callback();
			} );
		} );
	}
	
	abortJob(stub) {
		// abort job in progress
		var self = this;
		var job = this.activeJobs[ stub.id ];
		
		if (!job) {
			this.logError('job', "Job not found for abort: " + stub.id);
			return;
		}
		if (job.complete) {
			this.logError('job', "Job is already complete, skipping abort request: " + stub.id);
			return;
		}
		
		var worker = this.kids[ job.pid ] || {};
		
		this.logDebug(4, "Aborting local job: " + stub.id + ": " + stub.reason, job);
		this.appendMetaLog(job, "Aborting job on server");
		
		job.code = 'abort';
		job.description = stub.reason;
		job.complete = true;
		
		if (worker.child) {
			// kill process
			worker.kill_timer = setTimeout( function() {
				// child didn't die, kill with prejudice
				self.appendMetaLog(job, "Child did not exit, killing harder: " + job.pid);
				worker.child.kill('SIGKILL');
			}, this.config.get('child_kill_timeout') * 1000 );
			
			// try killing nicely first
			worker.child.kill('SIGTERM');
		}
		else {
			// no child process, just finish job
			this.finishJob(job);
		}
	}
	
	updateAllJobs(updates) {
		// apply updates to all active jobs (shallow merge)
		for (var job_id in this.activeJobs) {
			Tools.mergeHashInto( this.activeJobs[job_id], updates );
		}
	}
	
	appendMetaLogAllJobs(msg) {
		// append meta message to all active jobs
		for (var job_id in this.activeJobs) {
			this.appendMetaLog( this.activeJobs[job_id], msg );
		}
	}
	
	abortAllJobs() {
		// abort all jobs (for shutdown)
		for (var job_id in this.activeJobs) {
			this.abortJob( this.activeJobs[job_id] );
		}
	}
	
});
