#!/usr/bin/env node

// xySat - xyOps Satellite - Monitor Test Run
// Copyright (c) 2019 - 2025 PixlCore LLC
// BSD 3-Clause License -- see LICENSE.md

const PixlServer = require("pixl-server");
const pkg = require('../package.json');

var config = {
	hosts: [ "localhost" ],
	port: 5522,
	secure: false,
	socket_opts: { rejectUnauthorized: false },
	pid_file: "pid.txt",
	log_dir: "logs",
	log_filename: "test.log",
	log_crashes: true,
	log_archive_path: "logs/archives/[filename]-[yyyy]-[mm]-[dd].log.gz",
	log_archive_keep: "7 days",
	temp_dir: "temp",
	child_kill_timeout: 10,
	monitoring_enabled: true,
	quickmon_enabled: true,
	
	debug_level: 10,
	echo: true,
	color: true,
	foreground: true
};

const cli = require('pixl-cli');
var Tools = cli.Tools;
var async = Tools.async;
var args = cli.args;
cli.global();

var MockEngine = require('../lib/engine.js');

MockEngine.prototype.socketInit = function() {
	// mock sock
	this.socket = {
		connected: true,
		auth: true,
		send: function() {}
	};
};

MockEngine.prototype.socketConnect = function() {};
MockEngine.prototype.socketDisconnect = function() {};

MockEngine.prototype.tick = function() {};
MockEngine.prototype.minute = function() {};
MockEngine.prototype.day = function() {};

MockEngine.prototype.shutdown = function(callback) { callback(); };

println("\n" + bold("Starting monitoring self-test run...") + "\n" );

// chdir to the proper server root dir
process.chdir( require('path').dirname( __dirname ) );

// start server
var server = new PixlServer({
	__name: 'Satellite',
	__version: pkg.version,
	
	config: config,
	
	components: [
		MockEngine
	]
});

server.startup( function() {
	// server startup complete
	process.title = "xySat Test";
	var sat = server.Satellite;
	sat.numServers = 1;
	
	async.series([
		function(callback) {
			// getBasicServerInfo
			println("\n" + bold("Test getBasicServerInfo...") + "\n" );
			sat.getBasicServerInfo( function() {
				callback();
			} );
		},
		function(callback) {
			// runQuickMonitors
			println("\n" + bold("Test runQuickMonitors...") + "\n" );
			sat.runQuickMonitors( { max_sleep_ms: 1 }, function() {
				callback();
			} );
		},
		function(callback) {
			// runMonitors
			println("\n" + bold("Test runMonitors...") + "\n" );
			sat.runMonitors( { max_sleep_ms: 1 }, function() {
				callback();
			} );
		}
	],
	function() {
		println("\n" + bold("All tests complete. Shutting down...") + "\n" );
		server.shutdown();
	});
} );
