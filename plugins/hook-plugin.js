#!/usr/bin/env node

// Web Hook Plugin for xyOps
// Copyright (c) 2025 PixlCore LLC
// BSD 3-Clause License -- see LICENSE.md

// Job Params: web_hook, text

var fs = require('fs');
var os = require('os');
var cp = require('child_process');
var Path = require('path');
var JSONStream = require('pixl-json-stream');
var Tools = require('pixl-tools');
var Request = require('pixl-request');

// setup stdin / stdout streams 
process.stdin.setEncoding('utf8');
process.stdout.setEncoding('utf8');

var stream = new JSONStream( process.stdin, process.stdout );
stream.EOL = "\n";

stream.on('json', function(job) {
	// got job from parent
	var params = job.params;
	var request = new Request( "xyOps Hook Plugin" );
	request.setAutoError( true );
	
	// send request to xyops conductor
	var url = job.base_url + '/api/app/fire_job_web_hook/v1';
	var payload = {
		job: job.id,
		server: job.server,
		web_hook: params.web_hook,
		text: params.text || ''
	};
	
	console.log("Firing web hook via API: " + url);
	
	request.json( url, payload, function(err, resp, data, perf) {
		if (err) {
			console.log( "Error: " + err.message, err );
			stream.write({ xy: 1, code: err.code || 1, description: err.message || String(err) });
			return;
		}
		if (data.code) {
			if (!data.description) data.description = "(Unknown Error)";
			console.log("Web Hook failed: " + data.description);
			stream.write({ xy: 1, code: data.code, description: data.description, data });
			return;
		}
		
		if (!data.description) data.description = "Success";
		if (!data.details) data.details = "(No details provided)";
		
		console.log("Web Hook successful: " + data.description);
		stream.write({ 
			xy: 1, 
			code: 0, 
			description: data.description, 
			markdown: { title: "Web Hook Details", content: data.details }, 
			data 
		});
		
	} ); // request.json
});
