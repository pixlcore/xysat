#!/usr/bin/env node

// xySat - xyOps Satellite - Main entry point
// Copyright (c) 2019 - 2025 PixlCore LLC
// BSD 3-Clause License -- see LICENSE.md

const Path = require('path');
const fs = require('fs');
const PixlServer = require("pixl-server");
const pkg = require('./package.json');
const self_bin = Path.resolve(process.argv[0]) + ' ' + Path.resolve(process.argv[1]);
const config_file = Path.join( __dirname, 'config.json' );
const is_windows = !!process.platform.match(/^win/);

var config = {};
var sample_config = {
	hosts: [ "localhost" ],
	port: 5522,
	secure: false,
	socket_opts: { rejectUnauthorized: false },
	secret_key: "CHANGE_ME", 
	pid_file: "pid.txt",
	log_dir: "logs",
	log_filename: "[component].log",
	log_crashes: true,
	log_archive_path: "logs/archives/[filename]-[yyyy]-[mm]-[dd].log.gz",
	log_archive_keep: "7 days",
	temp_dir: "temp",
	debug_level: 5,
	child_kill_timeout: 10,
	monitoring_enabled: true,
	quickmon_enabled: true
};

const cli = require('pixl-cli');
var Tools = cli.Tools;
var args = cli.args;
cli.global();

// special windows install mode
if ((args.install || args.uninstall || args.stop) && is_windows) {
	// install as a windows service, or uninstall
	process.chdir( __dirname );
	
	// patch out console.log because node-windows dumps debug info to it
	// see: https://github.com/coreybutler/node-windows/issues/382
	console.log = function() {};
	
	var Service = require('node-windows').Service;
	var svc = new Service({
		name: 'xyOps Satellite',
		description: 'xyOps Satellite',
		script: Path.resolve(  __dirname, 'main.js' ),
		execPath: process.execPath,
		scriptOptions: [ '--foreground' ]
	});
	
	if (args.install) {
		svc.on('start', function() {
			print("\nxyOps Satellite has been started successfully.\n\n");
			process.exit(0);
		});
		
		svc.on('error', function(err) {
			print("\nWindows Service Installation Error: " + err + "\n\n");
			process.exit(1);
		});
		
		var installCompleted = function() {
			print("\nxyOps Satellite has been installed successfully.\n");
			
			if (!fs.existsSync(config_file)) {
				config = sample_config;
				var raw_config = JSON.stringify( config, null, "\t" );
				fs.writeFileSync( config_file, raw_config, { mode: 0o600 } );
				print("\nA sample config file has been created: " + config_file + ":\n");
				print( raw_config + "\n" );
				process.exit(0);
			}
			else {
				svc.start();
			}
		};
		svc.on('install', installCompleted);
		svc.on('alreadyinstalled', installCompleted);
		
		svc.install();
	} // install
	
	if (args.uninstall) {
		var uninstallCompleted = function() {
			try { 
				// kill main process if still running
				var pid = parseInt( fs.readFileSync( 'pid.txt', 'utf8' ) ); 
				if (pid) process.kill( pid, 'SIGTERM' );
			} catch (e) {;}
			
			// delete entire sat directory
			try { Tools.rimraf.sync( __dirname ); }
			catch (e) { die("\nError: Failed to delete folder: " + __dirname + ": " + e + "\n\n"); }
			
			print("\nxyOps Satellite has been removed successfully.\n\n");
			process.exit(0);
		};
		svc.on('uninstall', uninstallCompleted);
		svc.on('alreadyuninstalled', uninstallCompleted);
		
		svc.on('error', function(err) {
			print("\nWindows Service Error: " + err + "\n\n");
			process.exit(1);
		});
		
		svc.uninstall();
	} // uninstall
	
	if (args.stop) {
		svc.on('stop', function() {
			print("\nxyOps Satellite has been stopped.\n\n");
			process.exit(0);
		});
		
		svc.on('error', function(err) {
			print("\nWindows Service Error: " + err + "\n\n");
			process.exit(1);
		});
		
		svc.stop();
	} // stop
	
	return;
} // windows

// setup pixl-boot for startup service
var boot = require('pixl-boot');
var boot_opts = {
	name: "xysat",
	company: "PixlCore LLC",
	script: self_bin,
	linux_type: "forking",
	linux_after: "network.target",
	linux_wanted_by: "multi-user.target",
	darwin_type: "agent"
};

if (args.install || (args.other && (args.other[0] == 'install'))) {
	// first time install
	process.chdir( __dirname );
	boot.install(boot_opts, function(err) {
		if (err) throw err;
		
		print("\nxyOps Satellite has been installed successfully.\n");
		
		if (!fs.existsSync(config_file)) {
			config = sample_config;
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
	process.chdir( __dirname );
	boot.uninstall(boot_opts, function(err) {
		try { 
			// kill main process if still running
			var pid = parseInt( fs.readFileSync( 'pid.txt', 'utf8' ) ); 
			if (pid) process.kill( pid, 'SIGTERM' );
		} catch (e) {;}
		
		// delete entire sat directory
		try { Tools.rimraf.sync( __dirname ); }
		catch (e) { die("\nError: Failed to delete folder: " + __dirname + ": " + e + "\n\n"); }
		
		print("\nxyOps Satellite has been removed successfully.\n");
		print("\n");
		process.exit(0);
	} );
}
else if (args.stop || (args.other && (args.other[0] == 'stop'))) {
	// shutdown if running
	process.chdir( __dirname );
	var pid = 0;
	try { pid = parseInt( fs.readFileSync( 'pid.txt', 'utf8' ) ); } catch (e) {;}
	if (!pid) die("\nError: xyOps Satellite is not currentiy running.\n\n");
	
	try { process.kill( pid, 'SIGTERM' ); }
	catch (err) {
		die("\nError: Failed to stop process: " + err + "\n\n");
	}
	
	// wait for pid to actually exit
	var checkExit = function() {
		try { process.kill(pid, 0); }
		catch (e) { process.exit(0); }
		setTimeout( checkExit, 250 );
	}
	checkExit();
}
else if (args.plugin || (args.other && (args.other[0] == 'plugin') && args.other[1])) {
	// execute plugin
	var plugin_name = Path.basename(args.plugin || args.other[1]);
	var plugin_file = Path.resolve( __dirname, Path.join( 'plugins', plugin_name + '.js' ) );
	if (!fs.existsSync(plugin_file)) die("\nError: Unknown plugin: " + plugin_name + "\n\n");
	
	process.title = plugin_name + '.js';
	require(plugin_file);
}
else {
	// normal startup
	process.chdir( __dirname );
	if (!fs.existsSync(config_file)) {
		// create sample config file if needed (user may have skipped the install step)
		fs.writeFileSync( config_file, JSON.stringify( sample_config, null, "\t" ), { mode: 0o600 } );
	}
	
	// make sure we don't stomp on ourselves
	try {
		var pid = parseInt( fs.readFileSync( 'pid.txt', 'utf8' ) ) || 0;
		if (pid && process.kill(pid, 0)) die(`\nError: xyOps Satellite is already running (PID ${pid}).\n\n`);
	}
	catch (e) {;}
	
	// map XYOPS_ env vars to SATELLITE_, for convenience
	for (var key in process.env) {
		if (key.match(/^XYOPS_(.+)$/)) process.env[ 'SATELLITE_' + RegExp.$1 ] = process.env[key];
	}
	
	// merge CLI into config file and save it
	delete args.start;
	delete args.other;
	
	if (Tools.numKeys(args) && !args.debug && !args.echo) {
		var temp_config = Tools.mergeHashes( JSON.parse( fs.readFileSync( config_file, 'utf8' ) ), args );
		fs.writeFileSync( config_file, JSON.stringify(temp_config, null, "\t") + "\n", { mode: 0o600 } );
	}
	
	// start server
	var server = new PixlServer({
		__name: 'Satellite',
		__version: pkg.version,
		
		configFile: config_file,
		
		components: [
			require('./lib/engine.js')
		]
	});

	server.startup( function() {
		// server startup complete
		process.title = "xyOps Satellite";
	} );
	
	if (is_windows) {
		// hook logger error event for windows event viewer
		var EventLogger = require('node-windows').EventLogger;
		var win_log = new EventLogger('xyOps');
		
		win_log.info( "xyOps Satellite v" + pkg.version + " starting up" );
		
		server.logger.on('row', function(line, cols, args) {
			if (args.category == 'error') win_log.error( line );
			else if ((args.category == 'debug') && (args.code == 1)) win_log.info( line );
		});
	}
	
	// process.once('SIGINT', function() {
	// 	// Note: Doesn't pixl-server take care of this?  Why are we hooking SIGINT in main.js?
	// 	// Ohhhh did this have something to do with the ptty lib?
	// 	server.shutdown();
	// });
}
