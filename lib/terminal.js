// xySat - xyOps Satellite - Terminals
// Copyright (c) 2019 - 2026 PixlCore LLC
// BSD 3-Clause License -- see LICENSE.md

const fs = require('fs');
const Path = require('path');
const os = require('os');
const async = require('async');
const Class = require("class-plus");
const Tools = require("pixl-tools");

// ansi utilities
const ansiBold = function(text) { return `\x1b[1m${text}\x1b[0m`; };
const EOL = "\r\n";

module.exports = Class({
	
	terminals: {}
	
},
class Terminals {
	
	setupTerminals(callback) {
		// Dynamically import zigpty (ESM module, grrr)
		var self = this;
		
		import('zigpty').then(
			function(zigPty) {
				self.zigPty = zigPty;
				callback();
			},
			function(err) {
				// Log error but continue -- zigpty load failure should NOT block startup
				self.logError('terminal', '' + err);
				delete self.features.terminal; // do not advertise terminal feature
				callback();
			}
		);
	}
	
	openTerminal(data) {
		// open new terminal, from comm
		// data: { id, opts?, env?, cmd?, args? }
		var self = this;
		var id = data.id;
		
		if (!id || (typeof(id) != 'string') || id.match(Tools.MATCH_BAD_KEY)) {
			// no way to report this error back to the client, so just log and return
			this.logError('terminal', "Cannot create terminal: Invalid ID: " + id);
			return;
		}
		if (this.terminals[id]) {
			// no way to report this error back to the client, so just log and return
			this.logError('terminal', "Cannot create terminal: ID already in use: " + id);
			return;
		}
		
		var termError = msg => {
			// log error and try to send a message back to the client via the terminal interface
			this.logError('terminal', msg);
			
			if (this.socket && this.socket.connected && this.socket.auth) {
				this.socket.send('termData', { id, data: EOL + EOL + `🛑  ${ansiBold('ERROR:')} ${msg}` + EOL });
				this.socket.send('termClose', { id });
			}
			
			return false;
		};
		
		if (!this.zigPty) {
			return termError("Cannot create terminal: ZigPTY is unavailable");
		}
		if (this.config.getPath('terminal.enabled') === false) {
			return termError("Cannot create terminal: Feature disabled");
		}
		
		var opts = Object.assign( {}, {
			cols: 80,
			rows: 24,
			cwd: os.homedir(),
			name: 'xterm-256color'
		}, this.config.getPath('terminal.defaults') || {}, data.opts || {} );
		
		this.logDebug(5, "Opening new terminal: " + id, opts);
		
		opts.env = Object.assign( {}, this.cleanEnv(), this.config.getPath('terminal.env') || {}, data.env || {}, {
			HOME: os.homedir(),
			TERM: 'xterm-256color',
			COLORTERM: 'truecolor'
		});
		
		opts.onExit = function(code, signal) {
			// Remove the terminal from our active registry.
			if (self.socket && self.socket.connected && self.socket.auth) {
				self.socket.send('termClose', { id, code, signal });
			}
			self.logDebug(5, "Terminal exited: " + id, { code, signal });
			delete self.terminals[id];
		};
		
		var pty = null;
		try {
			pty = this.zigPty.spawn( data.cmd || this.autoShell || undefined, data.args || [], opts );
		}
		catch (err) {
			return termError("Cannot create terminal: " + err);
		}
		
		pty.onData( function(data) {
			// received data from pty, pass along to xyops conductor
			if (self.socket && self.socket.connected && self.socket.auth) {
				self.socket.send('termData', { id, data });
			}
		} );
		
		this.terminals[id] = pty;
		this.logDebug(5, "Terminal opened: " + id, { pid: pty.pid });
		
		// notify conductor that pty was opened
		if (this.socket && this.socket.connected && this.socket.auth) {
			this.socket.send('termOpen', { id, pid: pty.pid });
		}
		
		pty._xy_sendStatsDebounce = this.debounce( this.sendStats.bind(this), 1000 );
		pty._xy_sendStatsDebounce(id);
	}
	
	writeTerminal(data) {
		// write data to terminal, from comm
		// data: { id, data }
		if (!data.id || !this.terminals[data.id]) {
			this.logError('terminal', "Terminal not found: " + (data.id || 'n/a'));
			return;
		}
		
		var pty = this.terminals[data.id];
		
		try { pty.write(data.data); }
		catch (err) {
			this.logError('terminal', "Failed to write to terminal: " + data.id + ": " + err);
		}
		
		if (pty._xy_sendStatsDebounce) {
			pty._xy_sendStatsDebounce( data.id );
			
			// if data contains an EOL, schedule another stats call after the bounce period
			// this gives the pty time to actually change the directory, launch a process, etc.
			if (data.data.match(/\r/)) pty._xy_sendStatsDebounce( data.id );
		}
	}
	
	resizeTerminal(data) {
		// resize terminal, from comm
		// data: { id, cols, rows }
		if (!data.id || !this.terminals[data.id]) {
			this.logError('terminal', "Terminal not found: " + (data.id || 'n/a'));
			return;
		}
		if (!data.cols || !data.rows) {
			this.logError('terminal', "Cannot resize terminal: " + data.id + ": Invalid size");
			return;
		}
		
		this.logDebug(9, "Resizing terminal", data);
		var pty = this.terminals[data.id];
		
		try { pty.resize( data.cols, data.rows ); }
		catch (err) {
			this.logError('terminal', "Failed to resize terminal: " + data.id + ": " + err);
		}
	}
	
	uploadTerminal(data) {
		// files uploaded from client, from comm
		// data: { id, files, cwd?, uid?, gid? }
		var self = this;
		
		if (!data.id || !this.terminals[data.id]) {
			this.logError('terminal', "Terminal not found: " + (data.id || 'n/a'));
			return;
		}
		if (!data.files || !data.files.length) {
			this.logError('terminal', "Cannot process files: " + data.id + ": No files found");
			return;
		}
		if (!data.cwd) data.cwd = os.tmpdir();
		
		if (!this.platform.windows) {
			if (data.uid) {
				var user_info = Tools.getpwnam( data.uid, true );
				if (user_info) data.uid = user_info.uid;
				else {
					self.socket.send('termNotify', { id: data.id, type: 'error', message: "Failed to resolve User ID: " + data.uid });
					return;
				}
			}
			if (data.gid) {
				var grp_info = Tools.getgrnam( data.gid, true );
				if (grp_info) data.gid = grp_info.gid;
				else {
					self.socket.send('termNotify', { id: data.id, type: 'error', message: "Failed to resolve Group ID: " + data.gid });
					return;
				}
			}
		}
		
		this.logDebug(9, "Processing files for terminal", data);
		
		async.eachSeries( data.files,
			function(file, callback) {
				var dest_file = Path.join( data.cwd, file.filename );
				var url = self.base_url + '/' + file.path;
				var opts = Object.assign( {}, self.config.get('socket_opts') || {}, self.getFileOpts(), {
					download: dest_file,
					atomic: true
				});
				
				self.logDebug(6, "Downloading terminal file: " + url, { dest_file });
				
				self.request.get( url, opts, function(err, resp) {
					if (err) return callback( new Error("Failed to download terminal file: " + file.filename + ": " + (err.message || err)) );
					if (self.platform.windows) return callback();
					
					// Preserve unspecified ownership components, while honoring explicit zero IDs.
					var uid = ((data.uid === '') || (data.uid == null)) ? -1 : Number(data.uid);
					var gid = ((data.gid === '') || (data.gid == null)) ? -1 : Number(data.gid);
					if ((uid === -1) && (gid === -1)) return callback();
					
					fs.chown( dest_file, uid, gid, function(err) {
						if (err) {
							// treat this error as non-fatal, but notify the user
							var err_msg = "Failed to chown terminal file: " + file.filename + ": " + (err.message || err);
							self.logError('terminal', err_msg);
							if (self.socket && self.socket.connected && self.socket.auth) {
								self.socket.send('termNotify', { id: data.id, type: 'error', message: err_msg });
							}
						}
						callback();
					});
				} ); // request.get
			},
			function(err) {
				if (!self.socket || !self.socket.connected || !self.socket.auth) return;
				if (err) {
					self.socket.send('termNotify', { id: data.id, type: 'error', message: String(err.message || err) });
					return;
				}
				
				var bytes = 0;
				data.files.forEach( file => { bytes += file.size || 0; } );
				
				var msg = data.files.length + " " + Tools.pluralize('file', data.files.length) + " uploaded successfully (" + Tools.getTextFromBytes(bytes) + ").";
				self.socket.send('termNotify', { id: data.id, type: 'success', message: msg, lifetime: 10 });
			}
		); // eachSeries
	}
	
	closeTerminal(data) {
		// close terminal, from comm
		// data: { id }
		if (!data.id) {
			this.logError('terminal', "Terminal not found: No ID specified");
			return;
		}
		if (!this.terminals[data.id]) {
			// assume xyops is just cleaning up a stale ref
			// send back standard exit message
			if (this.socket && this.socket.connected && this.socket.auth) {
				this.socket.send('termClose', { id: data.id });
			}
			return;
		}
		
		this.logDebug(5, "Closing terminal", data);
		var pty = this.terminals[data.id];
		
		try { pty.close(); }
		catch (err) { 
			this.logError('terminal', "Failed to close terminal: " + data.id + ": " + err);
		}
	}
	
	closeTerminals() {
		// close all terminals for shutdown
		var self = this;
		
		// Detach the terminal registry before closing anything.  This prevents
		// terminal exit handlers from interfering with our iteration.
		var terminals = this.terminals || {};
		this.terminals = {};
		
		var terminal_ids = Object.keys(terminals);
		if (terminal_ids.length) {
			this.logDebug(3, "Closing " + terminal_ids.length + " terminals for shutdown");
		}
		
		// close() is synchronous and idempotent.  It closes the PTY and
		// requests termination of the attached shell or process.
		terminal_ids.forEach( function(id) {
			var terminal = terminals[id];
			if (!terminal || !terminal.close) return;
			
			try { terminal.close(); }
			catch (err) {
				// A single broken terminal should never block shutdown.
				self.logError('terminal', "Failed to close terminal: " + id + ": " + err);
			}
		} ); // foreach term
	}
	
	sendStats(id) {
		// send pty stats to socket
		var pty = this.terminals[id];
		if (!pty) return; // sanity
		
		if (this.socket && this.socket.connected && this.socket.auth) {
			try {
				var stats = { ...pty.stats() };
				if (!stats.children) stats.children = [];
				
				if (!this.platform.windows) {
					stats.uid = String(process.getuid());
					stats.gid = String(process.getgid());
				}
				
				if (this.platform.linux) {
					// for linux, try harder to resolve subshell cwd and uid/gid
					var child = stats.children[ stats.children.length - 1 ] || stats;
					if (child.pid) {
						var cwd = fs.readlinkSync(`/proc/${child.pid}/cwd`);
						if (cwd) stats.cwd = cwd;
						
						var raw = fs.readFileSync(`/proc/${child.pid}/status`, 'utf8');
						if (raw.match(/\bUid\:\s*(\d+)/)) {
							stats.uid = RegExp.$1;
							var user_info = Tools.getpwnam( stats.uid, true );
							if (user_info) stats.uid = user_info.username;
						}
						if (raw.match(/\bGid\:\s*(\d+)/)) {
							stats.gid = RegExp.$1;
							var grp_info = Tools.getgrnam( stats.gid, true );
							if (grp_info) stats.gid = grp_info.name;
						}
					}
				}
				
				this.socket.send('termStats', { id, data: stats });
			}
			catch (e) {;}
		}
	}
	
});
