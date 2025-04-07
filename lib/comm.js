// Orchestra Satellite - Communication Layer
// Copyright (c) 2020 Joseph Huckaby

const fs = require('fs');
const Path = require('path');
const cp = require('child_process');
const WebSocket = require('ws');
const Class = require("class-plus");
const Tools = require("pixl-tools");

module.exports = Class({
	
	socket: null,
	tempHost: null
	
},
class Communication {
	
	socketInit() {
		// called on startup and config reload
		this.connectTimeoutSec = this.config.get('connect_timeout_sec') || 5;
		this.pingTimeoutSec = this.config.get('ping_timeout_sec') || 120;
		this.sockReconnDelaySec = this.config.get('socket_reconnect_delay_sec') || 1;
		this.sockReconnDelayMax = this.config.get('socket_reconnect_delay_max') || 10;
		this.sockReconnDelayCur = this.sockReconnDelaySec;
	}
	
	socketDisconnect() {
		// kill socket if connected, and prevent auto-reconnect
		if (this.socket) {
			this.socket.forceDisconnect = true;
			this.logDebug(9, "Destroying previous socket");
			this.socket.close();
			this.socket = null;
		}
	}
	
	socketConnect() {
		// connect to server via websocket
		var self = this;
		var url = '';
		var host = Tools.randArray(this.config.get('hosts'));
		delete this.reconnectTimer;
		
		if (this.tempHost) {
			// one-time connect (i.e. redirect to master)
			host = this.tempHost;
			delete this.tempHost;
		}
		url = (this.config.get('secure') ? 'wss:' : 'ws:') + '//' + host + '/';
		
		// make sure old socket is disconnected
		this.socketDisconnect();
		
		this.logDebug(5, "Connecting to WebSocket: " + url);
		
		// custom socket abstraction layer
		var socket = this.socket = {
			host: host,
			url: url,
			ws: new WebSocket( url, this.config.get('socket_opts') || {} ),
			
			connected: false,
			disconnected: false,
			
			connectTimer: setTimeout( function() {
				self.logError('comm', "Socket connect timeout (" + self.connectTimeoutSec + " sec)");
				socket.close();
			}, this.connectTimeoutSec * 1000 ),
			
			send: function(cmd, data) {
				self.logDebug(10, "Sending socket message: " + cmd, data);
				
				if (this.connected) this.ws.send( JSON.stringify({ cmd: cmd, data: data }) );
				else self.logError('socket', "Socket not connected, message not sent", { cmd, data });
			},
			
			close: function() {
				try { 
					this.ws.close(); 
				} 
				catch(err) {
					this.ws.terminate();
				}
			}
		};
		
		socket.ws.onerror = function(err) {
			// socket error
			if (err.error) err = err.error; // ws weirdness
			self.logError('comm', "Socket Error: " + (err.message || err.code || err), { host: socket.host, url: socket.url } );
		};
		
		socket.ws.onopen = function (event) {
			// socket connected
			if (socket.connectTimer) {
				clearTimeout( socket.connectTimer );
				delete socket.connectTimer;
			}
			
			// reset reconn delay to base level
			self.sockReconnDelayCur = self.sockReconnDelaySec;
			
			socket.connected = true;
			socket.lastPing = Tools.timeNow();
			
			self.logDebug(3, "WebSocket connected successfully");
			
			self.getBasicServerInfo( function(info) {
				// start auth challenge, include basic info like os, cpu, mem
				socket.send( 'hello', Tools.mergeHashes( self.config.get('initial') || {}, {
					hostname: self.server.hostname,
					id: self.config.get('server_id') || '',
					info: info
				} ) );
			}); // getBasicServerInfo
		};
		
		socket.ws.onmessage = function (event) {
			// got message from server, parse JSON and handle
			self.logDebug(10, "Got message from server: " + event.data);
			var json = null;
			try { 
				json = JSON.parse( event.data ); 
			}
			catch (err) {
				self.logError('comm', "Failed to parse JSON: " + err);
			}
			if (json) self.handleSocketMessage(json);
		};
		
		socket.ws.onclose = function (event) {
			// socket has closed
			var was_connected = socket.connected;
			
			if (was_connected) {
				// socket was connected, and now isn't
				self.logDebug(3, "Socket has closed");
			}
			else {
				// socket was already disconnected, so increase retry delay (expon backoff)
				self.sockReconnDelayCur = Math.min( self.sockReconnDelayCur * 2, self.sockReconnDelayMax );
			}
			
			socket.disconnected = true;
			socket.connected = false;
			
			if (socket.connectTimer) {
				clearTimeout( socket.connectTimer );
				delete socket.connectTimer;
			}
			if (socket.forceDisconnect) {
				// deliberate disconnect, stop here
				return;
			}
			
			self.logDebug(5, `Will attempt to reconnect in ${self.sockReconnDelayCur} seconds`);
			self.reconnectTimer = setTimeout( function() { self.socketConnect(); }, self.sockReconnDelayCur * 1000 );
			self.socket = null;
			
			if (was_connected) {
				// socket was connected, and now isn't, so log into all job metas
				self.appendMetaLogAllJobs("Lost connection to conductor");
			}
		};
	}
	
	handleSocketMessage(json) {
		// process message from master server
		var self = this;
		var socket = this.socket;
		var cmd = json.cmd;
		var data = json.data;
		
		switch (cmd) {
			case 'echo':
				// send back same data we got
				socket.lastPing = Tools.timeNow();
				socket.send('echoback', data);
			break;
			
			case 'auth_failure':
				// authentiation failure (should never happen)
				var msg = data.description;
				this.logError('comm', "Authentication failure: " + msg);
				
				// close socket until config reload
				this.logDebug(3, "Closing socket until config reload or service restart");
				this.socketDisconnect();
			break;
			
			case 'hello':
				// response to initial hello, should have nonce for us to hash
				// if we were assigned an ID, save it permanently
				if (data.id && !this.config.get('server_id')) {
					this.logDebug(3, "We have been assigned a unique server ID: " + data.id);
					this.updateConfig({
						server_id: data.id
					});
				}
				
				// continue auth challange
				socket.send('join', {
					token: this.config.get('auth_token') || Tools.digestHex( data.nonce + this.config.get('secret_key'), 'sha256' )
				});
			break;
			
			case 'joined':
				// auth successful
				this.logDebug(5, "WebSocket auth successful!");
				socket.auth = true;
				
				this.updateConfig({
					hosts: data.masterData.masters
				});
				
				// save stuff for minute monitoring
				this.groups = data.groups || [];
				this.plugins = data.plugins || [];
				this.commands = data.commands || [];
				this.prepPlugins();
				
				if (Tools.numKeys(this.activeJobs)) {
					// if we have active jobs, this is a "reconnect" event
					this.updateAllJobs({
						reconnected: Tools.timeNow()
					});
					this.appendMetaLogAllJobs("Reconnected to master server: " + this.socket.host);
				}
				else {
					// fire off initial monitoring pass
					this.runMonitors({ max_sleep_ms: 1, monitoring_only: true });
				}
			break;
			
			case 'masterData':
				// auth successful
				this.logDebug(5, "Received new masterData", data);
				this.updateConfig({
					hosts: data.masters
				});
			break;
			
			case 'redirect':
				// reconnect to new master
				this.logDebug(5, "Reconnecting to new master", data);
				this.tempHost = data.host;
				socket.close();
			break;
			
			case 'launch_job':
				// launch job
				this.launchJob(data.job);
			break;
			
			case 'abort_job':
				// abort job
				this.abortJob(data);
			break;
			
			case 'update':
				// arbitrary data update from master
				// e.g. groups, commands
				Tools.mergeHashInto( this, data );
				this.prepPlugins();
			break;
			
			case 'uninstall':
				// full shutdown and uninstall
				this.uninstallSatellite();
			break;
			
			// more commands here
			
		} // switch cmd
	}
	
	prepPlugins() {
		// create temp script files for all event and monitor plugins
		// this is only called on startup and when plugins are updated, so it's okay to use "sync" I/O
		var self = this;
		var plugin_dir = Path.join( this.config.get('temp_dir'), 'plugins' );
		var filenames = {};
		
		// pre-scan dir, so we can compare (if any plugins were deleted)
		Tools.glob.sync( Path.join( plugin_dir, '*.bin' ) ).forEach( function(file) {
			filenames[ Path.basename(file) ] = true;
		} );
		
		this.plugins.forEach( function(plugin) {
			if (plugin.script) {
				var script_file = Path.join( plugin_dir, plugin.id + '.bin' );
				fs.writeFileSync( script_file, plugin.script + "\n" );
				delete filenames[ Path.basename(script_file) ];
			}
		} );
		
		this.commands.forEach( function(command) {
			if (command.script) {
				var script_file = Path.join( plugin_dir, command.id + '.bin' );
				fs.writeFileSync( script_file, command.script + "\n" );
				delete filenames[ Path.basename(script_file) ];
			}
		} );
		
		// delete any leftover files (deleted plugins)
		for (var filename in filenames) {
			var file = Path.join( plugin_dir, filename );
			try { fs.unlinkSync(file); } catch (e) {;}
		}
	}
	
	updateConfig(updates) {
		// update config and save file
		for (var key in updates) {
			this.config.set(key, updates[key]);
		}
		
		// save config safely
		this.logDebug(3, "Saving configuration file: " + this.config.configFile);
		try {
			var temp_config = JSON.parse( fs.readFileSync( this.config.configFile, 'utf8' ) );
			for (var key in updates) {
				temp_config[key] = updates[key];
			}
			
			// special case: remove initial prop (one-time use)
			if (temp_config.initial) delete temp_config.initial;
			
			fs.writeFileSync( this.config.configFile, JSON.stringify(temp_config, null, "\t") + "\n", { mode: 0o600 } );
		}
		catch (err) {
			this.logError('comm', "Failed to save configuration file: " + err);
		}
		
		// prevent auto file reload (pixl-server / pixl-config)
		this.config.mod = fs.statSync(this.config.configFile).mtime.getTime();
	}
	
	socketTick() {
		// called once per second from app.tick()
		// see if we're receiving frequent status updates from server (might be dead socket)
		if (this.socket && this.socket.connected) {
			if (Tools.timeNow() - this.socket.lastPing >= this.pingTimeoutSec) {
				// 5 seconds and no ping = likely dead
				this.logDebug(2, "No ping in last " + this.pingTimeoutSec + " seconds, assuming socket is dead");
				this.socket.close(); // should auto-reconnect
			}
		}
	}
	
	uninstallSatellite() {
		// completely shutdown and uninstall satellite -- called from websocket
		var self = this;
		this.logDebug(1, "Received conductor command to uninstall satellite -- goodbye!");
		
		// issue command by shelling out to our control script in a detached child
		var child = null;
		try {
			child = cp.spawn( process.execPath, [ require.main.filename, "uninstall" ], { 
				detached: true,
				stdio: ['ignore', 'ignore', 'ignore'],
				windowsHide: true
			} );
			child.on('error', function(err) {
				self.logError('uninstall', "Failed to uninstall satellite: " + err);
			});
			child.unref();
		}
		catch (err) {
			this.logError('uninstall', "Failed to uninstall satellite: " + err);
		}
	}
	
});
