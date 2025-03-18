#!/usr/bin/env node

// Orchestra Satellite - Main entry point
// Copyright (c) 2019 - 2025 PixlCore LLC
// Sustainable Use License

const Path = require('path');
const fs = require('fs');
const PixlServer = require("pixl-server");
const self_bin = Path.resolve(process.argv[0]) + ' ' + Path.resolve(process.argv[1]);
const config_file = Path.join( __dirname, 'config.json' );
var config = {};

const cli = require('pixl-cli');
var Tools = cli.Tools;
var args = cli.args;
cli.global();

process.chdir( __dirname );

// setup pixl-boot for startup service
var boot = require('pixl-boot');
var boot_opts = {
	name: "Orchestra Satellite",
	company: "PixlCore LLC",
	script: self_bin,
	linux_type: "forking",
	linux_after: "network.target",
	linux_wanted_by: "multi-user.target",
	darwin_type: "agent"
};

if (args.install || (args.other && (args.other[0] == 'install'))) {
	// first time install
	boot.install(boot_opts, function(err) {
		if (err) throw err;
		
		print("\nOrchestra Satellite has been installed successfully.\n");
		
		if (!fs.existsSync(config_file)) {
			config = { 
				hosts: [ "orchestra.local:5523" ],
				secure: true,
				socket_opts: { rejectUnauthorized: false },
				secret_key: "CHANGE_ME", 
				pid_file: "pid.txt",
				log_dir: "logs",
				log_filename: "satellite.log",
				log_crashes: true,
				log_archive_path: "logs/archives/[yyyy]/[mm]/[dd]/[filename]-[yyyy]-[mm]-[dd].log.gz", // TODO: this, also log arch deletion
				temp_dir: "temp",
				debug_level: 5,
				child_kill_timeout: 10,
				max_sleep_ms: 5000,
				monitoring_enabled: true
			};
			var raw_config = JSON.stringify( config, null, "\t" );
			fs.writeFileSync( config_file, raw_config, { mode: 0o600 } );
			print("\nA sample config file has been created: " + config_file + ":\n");
			print( raw_config + "\n" );
		}
		
		print("\n");
		process.exit(0);
	} );
}
else if (args.uninstall || (args.other && (args.other[0] == 'uninstall'))) {
	// uninstall satellite
	boot.uninstall(boot_opts, function(err) {
		if (err) throw err;
		
		print("\nOrchestra Satellite has been removed successfully.\n");
		print("\n");
		process.exit(0);
	} );
}
else if (args.stop || (args.other && (args.other[0] == 'stop'))) {
	// shutdown if running
	var pid = 0;
	try { pid = parseInt( fs.readFileSync( 'pid.txt', 'utf8' ) ); } catch (e) {;}
	
	if (pid) {
		try { process.kill( pid, 'SIGTERM' ); }
		catch (err) {
			die("\nError: Failed to stop process: " + err + "\n\n");
		}
		process.exit(0);
	}
	else die("\nError: Failed to load PID file (pid.txt)\n\n");
}
else if (args.plugin || (args.other && (args.other[0] == 'plugin') && args.other[1])) {
	// execute plugin
	var plugin_name = Path.basename(args.plugin || args.other[1]);
	var plugin_file = Path.resolve( Path.join( 'bin', plugin_name + '.js' ) );
	if (!fs.existsSync(plugin_file)) die("\nError: Unknown plugin: " + plugin_name + "\n\n");
	
	process.title = plugin_name + '.js';
	require(plugin_file);
}
else {
	// normal startup
	
	// merge CLI into config file and save it
	delete args.start;
	delete args.other;
	
	if (args.host) {
		// hosts should always be an array
		args.hosts = [ args.host ];
		delete args.host;
	}
	
	if (Tools.numKeys(args) && !args.debug && !args.echo) {
		var temp_config = Tools.mergeHashes( JSON.parse( fs.readFileSync( config_file, 'utf8' ) ), args );
		fs.writeFileSync( config_file, JSON.stringify(temp_config, null, "\t") + "\n", { mode: 0o600 } );
	}
	
	// start server
	var server = new PixlServer({
		__name: 'Satellite',
		__version: '1.0.0',
		
		configFile: config_file,
		
		components: [
			require('./lib/engine.js')
		]
	});

	server.startup( function() {
		// server startup complete
		process.title = "Orchestra Satellite";
	} );
	
	// process.once('SIGINT', function() {
	// 	// Note: Doesn't pixl-server take care of this?  Why are we hooking SIGINT in main.js?
	// 	// Ohhhh did this have something to do with the ptty lib?
	// 	server.shutdown();
	// });
}
