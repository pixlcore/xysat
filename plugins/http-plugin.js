#!/usr/bin/env node

// HTTP Plugin for xyOps
// Invoked via the 'HTTP Client' Plugin
// Copyright (c) 2019 - 2025 PixlCore LLC
// BSD 3-Clause License -- see LICENSE.md

// Job Params: 
//		method, url, headers, data, timeout, follow, ssl_cert_bypass, download, success_match, error_match

var fs = require('fs');
var os = require('os');
var cp = require('child_process');
var Path = require('path');
var JSONStream = require('pixl-json-stream');
var Tools = require('pixl-tools');
var Request = require('pixl-request');
var config = require('../config.json');

// setup stdin / stdout streams 
process.stdin.setEncoding('utf8');
process.stdout.setEncoding('utf8');

var stream = new JSONStream( process.stdin, process.stdout );
stream.EOL = "\n";

stream.on('json', function(job) {
	// got job from parent
	var params = job.params;
	var request = new Request();
	
	var print = function(text) {
		process.stdout.write(text);
	};
	
	// airgapped mode
	if (config.airgap && config.airgap.enabled) {
		if (config.airgap.whitelist && config.airgap.whitelist.length) request.setWhitelist( config.airgap.whitelist );
		if (config.airgap.blacklist && config.airgap.blacklist.length) request.setBlacklist( config.airgap.blacklist );
	}
	
	// timeout
	request.setTimeout( parseInt(params.timeout || 0) * 1000 );
	request.setIdleTimeout( parseInt(params.idle_timeout || params.timeout || 0) * 1000 );
	
	if (!params.url || !params.url.match(/^https?\:\/\/\S+$/i)) {
		stream.write({ xy: 1, complete: true, code: 1, description: "Malformed URL: " + (params.url || '(n/a)') });
		return;
	}
	
	// allow URL to be substituted using [placeholders]
	params.url = Tools.sub( params.url, job );
	
	print("Sending HTTP " + params.method + " to URL:\n" + params.url + "\n");
	
	// headers
	if (params.headers) {
		// allow headers to be substituted using [placeholders]
		params.headers = Tools.sub( params.headers, job );
		
		// print("\nRequest Headers:\n" + params.headers.trim() + "\n");
		params.headers.replace(/\r\n/g, "\n").trim().split(/\n/).forEach( function(pair) {
			if (pair.match(/^([^\:]+)\:\s*(.+)$/)) {
				request.setHeader( RegExp.$1, RegExp.$2 );
			}
		} );
	}
	
	// follow redirects
	if (params.follow) request.setFollow( 32 );
	
	var opts = {
		method: params.method
	};
	
	// ssl cert bypass
	if (params.ssl_cert_bypass) {
		opts.rejectUnauthorized = false;
	}
	
	// post data
	if ((opts.method != 'GET') && (opts.method != 'HEAD')) {
		// allow POST data to be substituted using [placeholders]
		params.data = Tools.sub( params.data, job );
		
		// print("\nPOST Data:\n" + params.data.trim() + "\n");
		opts.data = Buffer.from( params.data || '' );
	}
	
	// download
	if (params.download) {
		opts.download = params.download = Path.join( job.cwd, job.id + '-download.bin' );
	}
	
	// progress
	var prog = { current: 0, len: 0 };
	opts.progress = function(chunk, res) {
		if (res.headers && res.headers['content-length']) {
			if (!prog.len) prog.len = parseInt( res.headers['content-length'] );
			prog.current += chunk.length;
			if (prog.len) stream.write({ xy: 1, progress: prog.current / prog.len });
		}
	};
	
	// matching
	var success_match = new RegExp( params.success_match || '.*' );
	var error_match = new RegExp( params.error_match || '(?!)' );
	
	// send request
	request.request( params.url, opts, function(err, resp, data, perf) {
		// HTTP code out of success range = error
		if (!err && ((resp.statusCode < 200) || (resp.statusCode >= 400))) {
			err = new Error("HTTP " + resp.statusCode + " " + resp.statusMessage);
			err.code = resp.statusCode;
		}
		
		// successmatch?  errormatch?
		var text = (!params.download && data) ? data.toString() : '';
		if (!err) {
			if (text.match(error_match)) {
				err = new Error("Response contains error match: " + params.error_match);
			}
			else if (!text.match(success_match)) {
				err = new Error("Response missing success match: " + params.success_match);
			}
		}
		
		// start building xyops JSON update
		var update = { 
			xy: 1,
			complete: true
		};
		if (err) {
			update.code = err.code || 1;
			update.description = err.message || err;
		}
		else {
			update.code = 0;
			update.description = "Success (HTTP " + resp.statusCode + " " + resp.statusMessage + ")";
		}
		
		print( update.description + "\n" );
		
		// attach file to job for upload
		if (!err && params.download) {
			var filename = Path.basename(params.url) || 'output';
			if (resp.headers && resp.headers['content-disposition']) {
				// grab filename out of CD header, which may or may not have quotes
				if (resp.headers['content-disposition'].toString().match(/filename="(.+?)"/)) filename = RegExp.$1;
				else if (resp.headers['content-disposition'].toString().match(/filename=([^\;]+)/)) filename = RegExp.$1;
			}
			if (!filename.match(/\.\w+$/)) {
				if (resp.headers['content-type']) filename += '.' + Path.basename(resp.headers['content-type']);
				else filename += '.bin';
			}
			update.files = [
				{ path: params.download, filename: filename, delete: true } 
			];
		}
		
		// populate data object with response
		if (resp) update.data = {
			statusCode: resp.statusCode,
			statusMessage: resp.statusMessage,
			headers: resp.headers
		};
		
		// include markdown report of request and response
		var details = '';
		
		details += "### Summary\n";
		details += "- **Method:** " + params.method + "\n";
		details += "- **URL:** " + params.url + "\n";
		details += "- **Redirects:** " + (params.follow ? 'Follow' : 'n/a') + "\n";
		details += "- **Timeout:** " + Tools.getTextFromSeconds(params.timeout, false, false) + "\n";
		details += "- **Response:** HTTP " + resp.statusCode + " " + resp.statusMessage + "\n";
		
		if (params.headers.length) {
			details += "\n### Request Headers:\n\n```http\n";
			details += params.headers + "\n";
			details += "```\n";
		}
		
		if (params.data && params.data.length) {
			details += "\n### Request Body:\n\n```\n";
			details += params.data.trim() + "\n```\n";
		}
		
		if (resp && resp.rawHeaders) {
			details += "\n### Response Headers:\n\n```http\n";
			
			for (var idx = 0, len = resp.rawHeaders.length; idx < len; idx += 2) {
				details += resp.rawHeaders[idx] + ": " + resp.rawHeaders[idx + 1] + "\n";
			}
			details += "```\n";
		}
		
		// add raw response content, if text (and not too long)
		if (text && resp && resp.headers['content-type'] && resp.headers['content-type'].match(/(text|javascript|json|css|html)/i)) {
			if (text.length) {
				details += "\n### Response Body:\n\n```\n";
				details += text.trim() + "\n```\n";
			}
			
			// if response was JSON, include parsed data
			if ((text.length < 1024 * 1024) && (resp.headers['content-type'].match(/(application|text)\/json/i) || text.match(/^\s*\{[\S\s]+\}\s*$/))) {
				var json = null;
				try { json = JSON.parse(text); }
				catch (e) {
					print("\nWARNING: Failed to parse JSON response: " + e + " (could not include JSON in job data)\n");
				}
				if (json && update.data) update.data.json = json;
			}
		}
		
		if (perf) details += "\n### Performance Metrics:\n\n```json\n" + JSON.stringify(perf.metrics(), null, "\t") + "\n```\n";
		
		update.markdown = {
			title: "HTTP Request Details",
			content: details
		};
		
		if (perf) {
			// passthru perf to xyops
			update.perf = perf.metrics();
		}
		
		stream.write(update);
	} );
});
