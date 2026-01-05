// xySat - xyOps Satellite - Job Layer
// Copyright (c) 2019 - 2025 PixlCore LLC
// BSD 3-Clause License -- see LICENSE.md

const fs = require('fs');
const cp = require('child_process');
const WebSocket = require('ws');
const Class = require("class-plus");
const Tools = require("pixl-tools");
const os = require('os');
const Path = require('path');
const zlib = require('zlib');
const sqparse = require('shell-quote').parse;
const JSONStream = require('pixl-json-stream');
const async = require('async');
const si = require('systeminformation');

module.exports = Class({
	
	activeJobs: {},
	kids: {},
	connCache: {},
	
},
class Jobs {
	
	logJob(level, msg, data) {
		// log debug msg with pseudo-component
		if (this.debugLevel(level)) {
			this.logger.set( 'component', 'Job' );
			this.logger.print({ category: 'debug', code: level, msg: msg, data: data });
		}
	}
	
	prepLaunchJob(job, details, sec) {
		// setup temp dir for job, and download any files passed to us
		var self = this;
		
		// make sure we aren't trying to shut down
		if (this.server.shut) {
			job.pid = 0;
			job.code = 1;
			job.description = "Setup Error: Server is shutting down. Job cannot launch.";
			self.logError("job", job.description);
			self.activeJobs[ job.id ] = job;
			self.finishJob( job );
			return;
		}
		
		// each job gets its own unique temp dir
		job.cwd = Path.resolve( Path.join( this.config.get('temp_dir'), 'jobs', job.id ) );
		
		async.series([
			function(callback) {
				// create temp dir for job, full access
				Tools.mkdirp( job.cwd, { mode: 0o777 }, callback );
			},
			function(callback) {
				// download input files to job temp dir if we were given any
				if (!details.input || !details.input.files || !details.input.files.length) return callback();
				
				async.eachSeries( details.input.files,
					function(file, callback) {
						var dest_file = Path.join( job.cwd, file.filename );
						var url = (self.config.get('secure') ? 'https:' : 'http:') + '//' + self.socket.host + ':' + self.socket.port + '/' + file.path;
						var opts = Tools.mergeHashes( self.config.get('socket_opts') || {}, {
							download: dest_file
						});
						
						self.logJob(6, "Downloading job file: " + url, { dest_file });
						self.appendMetaLog(job, `Downloading file: ${file.filename} (${Tools.getTextFromBytes(file.size)})`);
						
						self.request.get( url, opts, function(err, resp, data, perf) {
							if (err) {
								return callback( new Error("Failed to download job file: " + file.filename + ": " + (err.message || err)) );
							}
							callback();
						} ); // request.get
					},
					callback
				); // eachSeries
			}
		],
		function(err) {
			if (err) {
				// something went wrong
				job.pid = 0;
				job.code = 1;
				job.description = "Setup Error: " + err;
				self.logError("job", job.description);
				self.activeJobs[ job.id ] = job;
				self.finishJob( job );
				return;
			}
			
			// launch job for real
			self.launchJob(job, details, sec);
		});
	}
	
	launchJob(job, details, sec) {
		// launch job on this server!
		var self = this;
		var child = null;
		var worker = null;
		
		// remove activity (meta) from this copy of the job, 
		// so our updates don't clobber the meta log which is maintained in master
		delete job.activity;
		
		this.logJob(6, "Launching job: " + job.id, this.debugLevel(9) ? job : null);
		
		// setup optional legacy log that user code can write to
		job.log_file = Path.resolve( Path.join(this.config.get('log_dir'), 'jobs', 'job-' + job.id + '.log') );
		
		// setup environment for child
		var child_opts = {
			cwd: job.cwd,
			env: Object.assign( {},
				this.cleanEnv(),
				this.config.get('job_env') || {},
				job.env || {},
				sec || {}
			)
		};
		
		child_opts.env['XYOPS'] = this.server.__version;
		child_opts.env['JOB_ID'] = job.id;
		child_opts.env['JOB_LOG'] = job.log_file; // legacy
		child_opts.env['JOB_NOW'] = job.now;
		child_opts.env['PWD'] = job.cwd;
		
		if (this.config.get('cronicle')) {
			child_opts.env['CRONICLE'] = this.server.__version; // for legacy purposes
			
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
		} // cronicle
		
		// get uid / gid info for child env vars
		if (!this.platform.windows) {
			child_opts.uid = job.uid || process.getuid();
			child_opts.gid = process.getgid();
			
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
				this.logError("job", job.description);
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
					this.logError("job", job.description);
					this.activeJobs[ job.id ] = job;
					this.finishJob( job );
					return;
				}
			}
			
			child_opts.uid = parseInt( child_opts.uid );
			child_opts.gid = parseInt( child_opts.gid );
		}
		
		// add simple non-object plugin params as env vars, expand $INLINE vars
		if (job.params) {
			for (var key in job.params) {
				if (typeof(job.params[key]) != 'object') {
					child_opts.env[ key.replace(/\W+/g, '_') ] = 
						(''+job.params[key]).replace(/\$(\w+)/g, function(m_all, m_g1) {
						return (m_g1 in child_opts.env) ? child_opts.env[m_g1] : '';
					});
				}
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
				child_cmd = process.execPath;
				child_args = [ require.main.filename, '--plugin', plugin_name ];
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
		
		// windows additions
		if (this.platform.windows) {
			child_opts.windowsHide = true;
		}
		
		worker = {};
		
		// attach streams
		child_opts.stdio = ['pipe', 'pipe', 'pipe'];
		
		this.logJob(9, "Spawning child: " + child_cmd, {
			args: child_args, 
			opts: Tools.copyHashRemoveKeys( child_opts, { env: 1 } ) 
		});
		
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
		
		this.logJob(3, "Spawned child process: " + job.pid + " for job: " + job.id, child_cmd);
		this.appendMetaLog(job, "Spawned child process: PID " + job.pid);
		
		// connect json stream to child's stdio
		// order reversed deliberately (out, in)
		var stream = new JSONStream( child.stdout, child.stdin );
		stream.recordRegExp = /^\s*\{.+\}\s*$/;
		stream.preserveWhitespace = true;
		stream.maxLineLength = 1024 * 1024;
		stream.EOL = "\n";
		
		worker.pid = job.pid;
		worker.child = child;
		worker.stream = stream;
		
		// line buffer for flood management
		var lb_lines = [];
		var lb_size = 0;
		var lb_timer = null;
		
		var flushLineBuffer = function() {
			// flush all lines
			if (lb_timer) { clearTimeout(lb_timer); lb_timer = null; }
			if (!lb_lines.length) return;
			self.appendJobLog(job, lb_lines.join(''));
			lb_lines = [];
			lb_size = 0;
		};
		var addToLineBuffer = function(line) {
			lb_lines.push(line);
			lb_size += line.length;
			if (lb_size >= stream.maxLineLength) flushLineBuffer();
			else if (!lb_timer) lb_timer = setTimeout( flushLineBuffer, 50 );
		};
		
		stream.on('json', function(data) {
			// received data from child
			if (!self.handleChildResponse(job, worker, data)) {
				// unrecognized json, emit as raw text
				stream.emit('text', JSON.stringify(data) + "\n");
			}
		} );
		
		stream.on('text', function(line) {
			// received non-json text from child, log it
			if (self.platform.windows) line = line.replace(/\r$/, '');
			addToLineBuffer(line);
		} );
		
		stream.on('error', function(err, text) {
			// Probably a JSON parse error (child emitting garbage)
			self.logError('job', "Child stream error: Job ID " + job.id + ": PID " + job.pid + ": " + err);
			if (text) self.appendJobLog(job, text);
		} );
		
		child.stderr.on('data', function(data) {
			// child printed something to STDERR, capture and pass along to log
			// self.appendJobLog(job, data);
			addToLineBuffer( ''+data );
		});
		
		child.on('error', function (err) {
			// child error
			flushLineBuffer();
			job.code = 1;
			job.description = "Child process error: " + Tools.getErrorDescription(err);
			worker.child_exited = true;
			self.logError("child", job.description);
			self.finishJob( job );
		} );
		
		child.on('close', function (code, signal) {
			// child exited
			flushLineBuffer();
			self.logJob(3, "Child " + job.pid + " exited with code: " + (code || signal || 0));
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
		
		// possibly include meta data for calling the xyOps API directly (i.e. remote jobs)
		var meta = {
			secrets: sec || {},
			activity: null // overwrite this as it's too verbose and not needed by plugin
		};
		
		if (job.runner) {
			// generate special job-specific file upload auth token, which auto-expires when job completes
			// (low security risk: it can ONLY be used to upload files, and only for this specific active job)
			var job_token = '';
			if (this.config.get('secret_key')) {
				var auth_token = Tools.digestHex( job.server + this.config.get('secret_key'), 'sha256' );
				job_token = Tools.digestHex( job.id + auth_token, 'sha256' );
			}
			else {
				job_token = Tools.digestHex( job.id + this.config.get('auth_token'), 'sha256' );
			}
			
			meta.base_url = (this.config.get('secure') ? 'https:' : 'http:') + '//' + this.socket.host + ':' + this.socket.port;
			meta.socket_opts = this.config.get('socket_opts');
			meta.auth_token = job_token;
		} // runner
		
		// send initial job + params + details + meta
		delete job.type; // don't clobber our "type":"job" thing
		stream.write({ xy: 1, type: 'event', ...job, ...details, ...meta });
		
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
		else if (!job.runner) {
			// no socket connection?  log it locally to the legacy job log file (will be uploaded as attachment).
			fs.appendFileSync( job.log_file, ''+msg );
		}
	}
	
	appendMetaLog(job, msg) {
		// append message to special "meta" log inside the job object (via socket request)
		if (this.socket && this.socket.connected && this.socket.auth) {
			this.socket.send('job_meta', { id: job.id, text: msg } );
		}
		this.logJob(6, "Job " + job.id + " Meta: " + msg);
	}
	
	handleChildResponse(job, worker, data) {
		// child sent us some datas (progress or completion)
		var found = false;
		this.logJob(10, "Got job update from child: " + job.pid, data);
		
		if (job.complete) {
			// prevent child from overwriting things when the job has been aborted remotely
			this.logJob(9, "Job is already complete, ignoring child update");
			return true;
		}
		if (job.code === 'abort') {
			this.logJob(9, "Job is being aborted, ignoring child update");
			return true;
		}
		
		// sanity check: if data has 'type' property, assume user accidentally printed the entire job object
		if (data.type) {
			this.logJob(9, "Detected type property, ignoring child update");
			return true;
		}
		
		// assume success if complete but no code specified
		if (data.complete && !data.code) data.code = 0;
		
		// likewise, if code is specified assume complete
		if (!data.complete && ('code' in data)) data.complete = true;
		
		// merge in data
		if (data.xy) {
			// new api: provide `xy` key and everything else gets imported
			Tools.mergeHashInto( job, Tools.copyHashRemoveKeys(data, { xy:1 }) );
			found = true;
		}
		else if (this.config.get('cronicle')) {
			// old api: only look for specific keys, to avoid importing junk into RAM
			
			// legacy chain reaction API
			if (data.chain) {
				// legacy, convert to new action
				if (!job.push) job.push = {};
				if (!job.push.actions) job.push.actions = [];
				job.push.actions.push({ condition: 'success', type: 'run_event', event_id: data.chain, params: data.chain_params || {}, enabled: true });
				found = true;
			}
			if (data.chain_error) {
				// legacy, convert to new action
				if (!job.push) job.push = {};
				if (!job.push.actions) job.push.actions = [];
				job.push.actions.push({ condition: 'error', type: 'run_event', event_id: data.chain_error, enabled: true });
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
				job.push.actions.push({ condition: 'success', type: 'email', email: data.notify_success, enabled: true });
				found = true;
			}
			if (data.notify_fail) {
				if (!job.push) job.push = {};
				if (!job.push.actions) job.push.actions = [];
				job.push.actions.push({ condition: 'error', type: 'email', email: data.notify_fail, enabled: true });
				found = true;
			}
			
			// copy over known keys
			['progress', 'complete', 'code', 'description', 'perf', 'update_event', 'table', 'html', 'files', 'data', 'tags', 'push'].forEach( function(key) {
				if (key in data) { job[key] = data[key]; found = true; }
			} );
		} // legacy
		
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
			found = true;
		}
		
		return found;
	}
	
	finishJob(job) {
		// complete job
		var self = this;
		
		// job may already be removed (sanity check)
		if (!this.activeJobs[ job.id ]) return;
		if (job.state != 'active') return;
		
		// if we're shutting down, don't finish job
		if (this.server.shut) return;
		
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
		
		// only complete if we have a healthy socket connection to master
		if (!this.socket || !this.socket.connected || !this.socket.auth) {
			this.logJob(5, "No socket connection, job is waiting to finish: " + job.id);
			setTimeout( function() { self.finishJob(job); }, 1000 );
			return;
		}
		
		// mark as complete
		job.complete = true;
		job.progress = 1.0;
		
		if (job.code) this.logJob(5, "Job completed with code: " + job.code, job);
		else this.logJob(5, "Job completed successfully", job);
		
		this.appendMetaLog(job, "Job is finishing");
		
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
		if (!job.runner) {
			if (!job.files) job.files = [];
			job.files.push({ path: job.log_file, delete: true });
		}
		
		this.prepUploadJobFiles(job, function(err) {
			if (err) {
				job.code = err.code || 'upload';
				job.description = "" + (err.message || err);
				job.files = [];
			}
			
			// now we're done done with job
			job.state = 'complete';
			self.updateJob(job);
			delete self.activeJobs[ job.id ];
			
			self.logJob(6, "Job is complete", { job_id: job.id });
			
			// delete temp dir, only log on error
			Tools.rimraf( job.cwd, function(err) {
				if (err) self.logError('fs', `Failed to delete job temp dir: ${job.cwd}: ${err}`);
			} );
			
			// re-check upgrade request if pending
			if (self.upgradeRequest) self.upgradeSatellite();
		});
	}
	
	prepUploadJobFiles(job, callback) {
		// glob all file requests to resolve them to individual files, then upload
		var self = this;
		var to_upload = [];
		if (!job.files || !job.files.length || !Tools.isaArray(job.files)) return callback();
		
		// if job is running remotely, skip file upload
		if (job.runner) return callback();
		
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
				
				if (!file.path) return; // sanity
				
				// prepend job cwd if path is not absolute
				if (!Path.isAbsolute(file.path)) file.path = Path.join(job.cwd, file.path);
				
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
		var final_files = [];
		var server_id = this.config.get('server_id');
		if (!job.files || !job.files.length || !Tools.isaArray(job.files)) return callback();
		
		async.eachSeries( job.files,
			function(file, callback) {
				var filename = Path.basename(file.filename || file.path).replace(/[^\w\-\+\.\,\s\(\)\[\]\{\}\'\"\!\&\^\%\$\#\@\*\?\~]+/g, '_');
				self.logJob(6, "Uploading file for job", { job_id: job.id, file });
				self.appendMetaLog(job, "Uploading file: " + filename);
				
				var url = (self.config.get('secure') ? 'https:' : 'http:') + '//' + self.socket.host + ':' + self.socket.port + '/api/app/upload_job_file';
				var opts = Tools.mergeHashes( self.config.get('socket_opts') || {}, {
					"files": {
						file1: [file.path, filename]
					},
					"data": {
						id: job.id
					}
				});
				
				if (self.config.get('secret_key')) {
					opts.data.auth = Tools.digestHex( job.id + self.config.get('secret_key'), 'sha256' );
				}
				else {
					opts.data.server = self.config.get('server_id');
					opts.data.auth = self.config.get('auth_token');
				}
				
				self.logJob(6, "Uploading job file", { job_id: job.id, file, url });
				
				self.request.post( url, opts, function(err, resp, data, perf) {
					if (err) {
						return callback( new Error("Failed to upload job file: " + filename + ": " + (err.message || err)) );
					}
					
					var json = null;
					try { json = JSON.parse( data.toString() ); }
					catch (err) { return callback(err); }
					
					if (json.code && json.description) {
						return callback( new Error("Failed to upload job file: " + filename + ": " + json.description) );
					}
					
					self.logJob(8, "File upload complete", { job_id: job.id, key: json.key, size: json.size, perf: perf.metrics() });
					
					// save file metadata
					final_files.push({ 
						id: file.id || Tools.generateShortID('f'),
						date: Tools.timeNow(true),
						filename: filename, 
						path: json.key, 
						size: json.size, 
						server: server_id, 
						job: job.id 
					});
					
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
					job.files = final_files;
					self.logJob(8, "All files uploaded", job.files);
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
		
		// skip remote runner jobs
		if (job.runner) return;
		
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
				this.logJob(10, "Active Job: " + job.pid + ": CPU: " + cpu + "%, Mem: " + Tools.getTextFromBytes(mem));
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
			if (job.procs && !job.runner) {
				for (var pid in job.procs) { job.procs[pid].disk = 0; }
			}
		}
		
		// this trick is linux only
		if (process.platform != 'linux') return process.nextTick( callback );
		
		// get array of all active job procs
		for (var job_id in this.activeJobs) {
			var job = this.activeJobs[job_id];
			if (job.procs && !job.runner) procs = procs.concat( Object.values(job.procs) );
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
			if (job.procs && !job.runner) {
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
				if (job.runner) return;
				
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
		
		if (!Tools.numKeys(this.activeJobs)) {
			// no jobs, so clear proc cache if old, to free up memory when no jobs are running
			if (this.procCache.data && (Tools.timeNow() >= this.procCache.expires)) this.procCache = {};
			return;
		}
		
		if (this.jobTickInProgress) return; // no steppy on toesy
		this.jobTickInProgress = true;
		
		// scan all processes on machine
		// si.processes( function(data) {
		this.getProcsCached( function(data) {
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
						
						// also cleanup other "one-time" properties here: html, text, table, markdown, perf, etc.
						delete job.table;
						delete job.html;
						delete job.markdown;
						delete job.text;
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
		
		this.logJob(4, "Aborting local job: " + stub.id + ": " + stub.reason, job);
		this.appendMetaLog(job, "Aborting job on server");
		
		job.code = 'abort';
		job.description = stub.reason;
		job.complete = true;
		
		if (worker.child) {
			// kill process(es) or not, depending on abort policy
			if (job.kill === 'none') {
				// kill none, just unref and finish
				worker.child.unref();
				this.finishJob(job);
				return;
			}
			
			worker.kill_timer = setTimeout( function() {
				// child didn't die, kill with prejudice
				if ((job.kill === 'all') && job.procs && Tools.firstKey(job.procs)) {
					// sig-kill ALL job processes
					var pids = Object.keys(job.procs);
					self.appendMetaLog(job, "Children did not exit, killing harder: " + pids.join(', '));
					pids.forEach( function(pid) {
						try { process.kill(pid, 'SIGKILL'); }
						catch(e) {;}
					} );
				}
				else {
					// sig-kill parent only
					self.appendMetaLog(job, "Child did not exit, killing harder: " + job.pid);
					worker.child.kill('SIGKILL');
				}
			}, this.config.get('child_kill_timeout') * 1000 );
			
			// try killing nicely first
			if ((job.kill === 'all') && job.procs && Tools.firstKey(job.procs)) {
				// sig-term ALL job processes
				var pids = Object.keys(job.procs);
				this.appendMetaLog(job, "Killing all job processes: " + pids.join(', '));
				pids.forEach( function(pid) {
					try { process.kill(pid, 'SIGTERM'); }
					catch(e) {;}
				} );
			}
			else {
				// sig-term parent only
				this.appendMetaLog(job, "Killing job process: " + job.pid);
				worker.child.kill('SIGTERM');
			}
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
	
	waitForAllJobs(callback) {
		// wait for all jobs to finish before proceeding
		var self = this;
		var num_jobs = Tools.numKeys(this.activeJobs);
		
		if (num_jobs) {
			this.logJob(3, "Waiting for " + num_jobs + " jobs to complete", Object.keys(this.activeJobs));
			
			async.whilst(
				function () {
					return (Tools.numKeys(self.activeJobs) > 0);
				},
				function (callback) {
					setTimeout( function() { callback(); }, 250 );
				},
				function() {
					// all jobs gone
					self.logJob(9, "All jobs completed.");
					callback();
				}
			); // whilst
		}
		else callback();
	}
	
});
