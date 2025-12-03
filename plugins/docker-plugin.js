#!/usr/bin/env node

// Docker Plugin for xyOps
// Copyright (c) 2019 - 2025 PixlCore LLC
// BSD 3-Clause License -- see LICENSE.md

// Job Params: 
// image_name, image_ver, cont_name, cont_rm, cont_init, cont_cpus, cont_mem, cont_net, cont_extras, run_mode, script, cont_cmd, verbose

const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const Path = require('path');
const Tools = require('pixl-tools');
const sq = require('shell-quote');
const noop = function() {};

const docker_bin = Tools.findBinSync('docker');
if (!docker_bin) {
	console.log( JSON.stringify({ xy: 1, code: 1, description: "Unable to locate docker CLI on " + os.hostname() }) );
	process.exit(1);
}

(async function() {
	// read in data from xyops
	const chunks = [];
	for await (const chunk of process.stdin) { chunks.push(chunk); }
	let job = JSON.parse( chunks.join('') );
	let params = job.params;
	
	// build docker run command
	let child_cmd = docker_bin;
	let child_args = ['run', '-i'];
	if (params.cont_rm) child_args.push('--rm');
	if (params.cont_init) child_args.push('--init');
	if (params.cont_cpus && (params.cont_cpus !== "0")) child_args.push('--cpus', params.cont_cpus);
	if (params.cont_mem && (params.cont_mem !== "0")) child_args.push('--memory', params.cont_mem.replace(/\s+/g, ''));
	if (params.cont_net) child_args.push('--network', params.cont_net);
	if (params.cont_name) child_args.push('--name', params.cont_name);
	if (params.cont_extras) {
		child_args = child_args.concat( sq.parse(params.cont_extras) );
	}
	
	child_args.push( params.image_name + ':' + params.image_ver );
	child_args = child_args.concat( sq.parse(params.cont_cmd) );
	
	let child_opts = {
		stdio: ['pipe', 'inherit', 'inherit'],
		cwd: process.cwd(),
		env: process.env
	};
	
	if (params.verbose && (params.verbose !== "0")) {
		console.log( "Launching docker: " + child_cmd + " " + sq.quote(child_args) );
	}
	
	// spawn child to run it
	let child = null;
	let kill_timer = null;
	
	try {
		child = cp.spawn( child_cmd, child_args, child_opts );
		if (!child || !child.pid || !child.stdin) {
			throw new Error("Docker process failed to spawn (Check executable location and permissions?)");
		}
	}
	catch (err) {
		if (child) child.on('error', function() {}); // prevent crash
		console.log( JSON.stringify({
			xy: 1,
			code: 1,
			description: "Docker spawn error: " + Tools.getErrorDescription(err)
		}));
		return;
	}
	
	child.on('error', function (err) {
		// child error
		console.log( JSON.stringify({
			xy: 1,
			code: 1,
			description: "Docker process failed: " + Tools.getErrorDescription(err)
		}));
	} );
	
	child.on('exit', function (code, signal) {
		// child exited
		if (kill_timer) clearTimeout(kill_timer);
		code = (code || signal || 0);
		
		if (code) console.log( JSON.stringify({
			xy: 1,
			code: code,
			description: "Docker exited with code: " + code
		}));
	} ); // exit
	
	// silence EPIPE errors on child STDIN
	child.stdin.on('error', noop );
	
	// send job data, or plain script, based on param
	if (params.run_mode.match(/JSON/)) child.stdin.write( JSON.stringify(job) + "\n" );
	else child.stdin.write( params.script + "\n" );
	
	child.stdin.end();
	
	// Handle shutdown
	process.on('SIGTERM', function() { 
		console.log("Caught SIGTERM, killing docker: " + child.pid);
		
		kill_timer = setTimeout( function() {
			// child didn't die, kill with prejudice
			console.log("Docker did not exit, killing harder: " + child.pid);
			child.kill('SIGKILL');
		}, 9 * 1000 );
		
		// try killing nicely first
		child.kill('SIGTERM');
	} );
	
})();
