#!/usr/bin/env node

// Shell Script Runner for Orchestra
// Invoked via the 'Shell Script' Plugin
// Copyright (c) 2022 Joseph Huckaby
// Released under the Sustainable Use License

const fs = require('fs');
const os = require('os');
const cp = require('child_process');
const Path = require('path');
const sqparse = require('shell-quote').parse;
const JSONStream = require('pixl-json-stream');
const Tools = require('pixl-tools');
const config = require('../config.json');

const is_windows = !!process.platform.match(/^win/);
const RE_SHEBANG = /^\#\!([^\n]+)\n/;

// chdir to the proper server root dir
process.chdir( Path.dirname( __dirname ) );

// setup stdin / stdout streams
process.stdin.setEncoding('utf8');
process.stdout.setEncoding('utf8');

var stream = new JSONStream( process.stdin, process.stdout );

stream.once('json', function(job) {
	// got job from parent
	var script_file = Path.join( config.temp_dir, 'orchestra-script-temp-' + job.id + '.sh' );
	var child_cmd = Path.resolve(script_file);
	var child_args = [];
	var child_opts = {
		stdio: ['pipe', 'pipe', 'pipe'],
		cwd: os.tmpdir()
	};
	
	// convert to unix line endings universally (windows 10+ is fine with this)
	if (job.params.script.match(/\r/)) job.params.script = job.params.script.replace(/\r\n/g, "\n");
	
	if (is_windows) {
		// we have to parse the shebang ourselves
		if (job.params.script.match(RE_SHEBANG)) {
			var shebang = RegExp.$1.trim();
			
			if (shebang.match(/^powershell(\.exe)?$/i)) {
				script_file = script_file.replace(/\.\w+$/, '.ps1');
				child_cmd = 'POWERSHELL.EXE';
				child_args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script_file];
			}
			else if (shebang.match(/^pwsh(\.exe)?$/i)) {
				script_file = script_file.replace(/\.\w+$/, '.ps1');
				child_cmd = 'PWSH.EXE';
				child_args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script_file];
			}
			else if (shebang.match(/^cmd(\.exe)?$/i)) {
				script_file = script_file.replace(/\.\w+$/, '.bat');
				child_cmd = 'CMD.EXE';
				child_args = ['/c', script_file];
			}
			else if (shebang.match(/\b(powershell|pwsh)\b/i)) {
				// powershell with custom exe location and/or CLI arguments
				script_file = script_file.replace(/\.\w+$/, '.ps1');
				child_cmd = shebang;
				// if command has cli args, parse using shell-quote
				if (child_cmd.match(/\s+(.+)$/)) {
					var cargs_raw = RegExp.$1;
					child_cmd = child_cmd.replace(/\s+(.+)$/, '');
					child_args = sqparse( cargs_raw, process.env );
				}
				child_args.push( '-File', script_file );
			}
			else if (shebang.match(/\b(cmd)\b/i)) {
				// cmd with custom exe location and/or ClI arguments
				script_file = script_file.replace(/\.\w+$/, '.bat');
				child_cmd = shebang;
				// if command has cli args, parse using shell-quote
				if (child_cmd.match(/\s+(.+)$/)) {
					var cargs_raw = RegExp.$1;
					child_cmd = child_cmd.replace(/\s+(.+)$/, '');
					child_args = sqparse( cargs_raw, process.env );
				}
				child_args.push( '/c', script_file );
			}
			else {
				// generic executable
				child_cmd = shebang;
				child_args = [ script_file ];
			}
			
			// remove shebang line
			job.params.script = job.params.script.replace(RE_SHEBANG, "");
		}
		else {
			// no shebang, assume cmd.exe
			script_file = script_file.replace(/\.\w+$/, '.bat');
			child_cmd = 'CMD.EXE';
			child_args = ['/c', script_file];
		}
		child_opts.windowsHide = true;
	}
	
	// write out temp file containing script code
	fs.writeFileSync( script_file, job.params.script, { mode: 0o775 } );
	
	// spawn child to run it
	var child = cp.spawn( child_cmd, child_args, child_opts );
	
	var kill_timer = null;
	var stderr_buffer = '';
	var sent_html = false;
	
	var cstream = new JSONStream( child.stdout, child.stdin );
	cstream.recordRegExp = /^\s*\{.+\}\s*$/;
	
	cstream.on('json', function(data) {
		// received JSON data from child, pass along to Orchestra or log
		if (job.params.json) {
			stream.write(data);
			if (data.html) sent_html = true;
		}
		else cstream.emit('text', JSON.stringify(data) + "\n");
	} );
	
	cstream.on('text', function(line) {
		// received non-json text from child
		// look for plain number from 0 to 100, treat as progress update
		if (line.match(/^\s*(\d+)\%\s*$/)) {
			var progress = Math.max( 0, Math.min( 100, parseInt( RegExp.$1 ) ) ) / 100;
			stream.write({
				orchestra: true,
				progress: progress
			});
		}
		else {
			// otherwise just log it
			if (job.params.annotate) {
				var dargs = Tools.getDateArgs( new Date() );
				line = '[' + dargs.yyyy_mm_dd + ' ' + dargs.hh_mi_ss + '] ' + line;
			}
			process.stdout.write(line);
		}
	} );
	
	cstream.on('error', function(err, text) {
		// Probably a JSON parse error (child emitting garbage)
		if (text) process.stdout.write(text + "\n");
	} );
	
	child.on('error', function (err) {
		// child error
		stream.write({
			orchestra: true,
			complete: true,
			code: 1,
			description: "Script failed: " + Tools.getErrorDescription(err)
		});
		
		fs.unlink( script_file, function(err) {;} );
	} );
	
	child.on('exit', function (code, signal) {
		// child exited
		if (kill_timer) clearTimeout(kill_timer);
		code = (code || signal || 0);
		
		var data = {
			orchestra: true,
			complete: true,
			code: code,
			description: code ? ("Script exited with code: " + code) : ""
		};
		
		if (stderr_buffer.length && stderr_buffer.match(/\S/)) {
			if (!sent_html) data.html = {
				title: "Error Output",
				content: "<pre>" + stderr_buffer.replace(/</g, '&lt;').trim() + "</pre>"
			};
			
			if (code) {
				// possibly augment description with first line of stderr, if not too insane
				var stderr_line = stderr_buffer.trim().split(/\n/).shift();
				if (stderr_line.length < 256) data.description += ": " + stderr_line;
			}
		}
		
		stream.write(data);
		fs.unlink( script_file, function(err) {;} );
	} ); // exit
	
	// silence EPIPE errors on child STDIN
	child.stdin.on('error', function(err) {
		// ignore
	} );
	
	// track stderr separately for display purposes
	child.stderr.setEncoding('utf8');
	child.stderr.on('data', function(data) {
		// keep first 32K in RAM, but log everything
		if (stderr_buffer.length < 32768) stderr_buffer += data;
		else if (!stderr_buffer.match(/\.\.\.$/)) stderr_buffer += '...';
		
		process.stdout.write(data);
	});
	
	// pass job down to child process (harmless for shell, useful for php/perl/node)
	cstream.write( job );
	child.stdin.end();
	
	// Handle shutdown
	process.on('SIGTERM', function() { 
		console.log("Caught SIGTERM, killing child: " + child.pid);
		
		kill_timer = setTimeout( function() {
			// child didn't die, kill with prejudice
			console.log("Child did not exit, killing harder: " + child.pid);
			child.kill('SIGKILL');
		}, 9 * 1000 );
		
		// try killing nicely first
		child.kill('SIGTERM');
	} );
	
} ); // stream
