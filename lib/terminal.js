// xySat - xyOps Satellite - Terminals
// Copyright (c) 2019 - 2026 PixlCore LLC
// BSD 3-Clause License -- see LICENSE.md

const fs = require('fs');
const Path = require('path');
const os = require('os');
const Class = require("class-plus");
const Tools = require("pixl-tools");

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
				callback();
			}
		);
	}
	
	openTerminal(data) {
		// open new terminal, from comm
		// data: { id, opts?, env?, cmd?, args? }
		var self = this;
		var id = data.id;
		
		if (!this.zigPty) {
			this.logError('terminal', "Cannot create terminal: ZigPTY is unavailable");
			return;
		}
		if (this.config.getPath('terminal.enabled') === false) {
			this.logError('terminal', "Cannot create terminal: Feature disabled");
			return;
		}
		if (!id || (typeof(id) != 'string') || id.match(Tools.MATCH_BAD_KEY)) {
			this.logError('terminal', "Cannot create terminal: Invalid ID: " + id);
			return;
		}
		if (this.terminals[id]) {
			this.logError('terminal', "Cannot create terminal: ID already in use: " + id);
			return;
		}
		
		var opts = Object.assign( {}, {
			cols: 80,
			rows: 24,
			cwd: os.homedir(),
			name: 'xterm-256color'
		}, this.config.getPath('terminal.defaults') || {}, data.opts || {} );
		
		opts.env = Object.assign( {}, this.cleanEnv(), this.config.getPath('terminal.env') || {}, data.env || {}, {
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
		
		this.logDebug(5, "Opening new terminal: " + id);
		
		var pty = null;
		try {
			pty = this.zigPty.spawn( data.cmd || undefined, data.args || [], opts );
		}
		catch (err) {
			this.logError('terminal', "Cannot create terminal: " + err);
			return;
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
	}
	
	writeTerminal(data) {
		// write data to terminal, from comm
		// data: { id, data }
		if (!data.id || !this.terminals[data.id]) {
			this.logError('', "Terminal not found: " + (data.id || 'n/a'));
			return;
		}
		
		var pty = this.terminals[data.id];
		
		try { pty.write(data.data); }
		catch (err) {
			this.logError('terminal', "Failed to write to terminal: " + data.id + ": " + err);
		}
	}
	
	resizeTerminal(data) {
		// resize terminal, from comm
		// data: { id, cols, rows }
		if (!data.id || !this.terminals[data.id]) {
			this.logError('', "Terminal not found: " + (data.id || 'n/a'));
			return;
		}
		if (!data.cols || !data.rows) {
			this.logError('', "Cannot resize terminal: " + data.id + ": Invalid size");
			return;
		}
		
		this.logDebug(9, "Resizing terminal", data);
		var pty = this.terminals[data.id];
		
		try { pty.resize( data.cols, data.rows ); }
		catch (err) {
			this.logError('terminal', "Failed to resize terminal: " + data.id + ": " + err);
		}
	}
	
	closeTerminal(data) {
		// close terminal, from comm
		// data: { id }
		if (!data.id) {
			this.logError('', "Terminal not found: No ID specified");
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
	
});
