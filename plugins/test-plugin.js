#!/usr/bin/env node

// Test Plugin for OpsRocket
// Copyright (c) 2019 - 2025 PixlCore LLC
// Sustainable Use License -- see LICENSE.md

var fs = require('fs');
var cp = require('child_process');
var os = require('os');
var Path = require('path');
var JSONStream = require('pixl-json-stream');
var Tools = require('pixl-tools');
var Perf = require('pixl-perf');
var Request = require('pixl-request');

var perf = new Perf();
perf.setScale( 1 ); // seconds
perf.begin();

var request = new Request();
request.setTimeout( 300 * 1000 );
request.setFollow( 5 );
request.setAutoError( true );
request.setKeepAlive( false );

var net_url = 'https://github.com/jhuckaby/performa-satellite/releases/latest/download/performa-satellite-linux-x64';
var ac = null;

// setup stdin / stdout streams 
// process.stdin.setEncoding('utf8');
// process.stdout.setEncoding('utf8');

// console.warn("Printed this with console.warn, should go to stderr.");
// console.log("Printed this with console.log, should be ignored as not json.");
console.log("Job start!");

// ANSI escape codes
(function() {
	// ANSI escape codes for text styles
	const RESET = '\x1b[0m';
	const BOLD = '\x1b[1m';
	const DIM = '\x1b[2m';
	const ITALIC = '\x1b[3m';
	const UNDERLINE = '\x1b[4m';
	const INVERSE = '\x1b[7m';
	const STRIKETHROUGH = '\x1b[9m';

	// ANSI escape codes for colors
	const BLACK = '\x1b[30m';
	const RED = '\x1b[31m';
	const GREEN = '\x1b[32m';
	const YELLOW = '\x1b[33m';
	const BLUE = '\x1b[34m';
	const MAGENTA = '\x1b[35m';
	const CYAN = '\x1b[36m';
	const WHITE = '\x1b[37m';
	const GRAY = '\x1b[90m';
	
	console.log(`Testing some ANSI colors and styles: ${BOLD}Bold text${RESET}, ${DIM}Dim text${RESET}, ${ITALIC}Italic text${RESET}, ${UNDERLINE}Underlined text${RESET}, ${INVERSE}Inverse text${RESET}, ${STRIKETHROUGH}Strikethrough text${RESET}, ${BLACK}Black text${RESET}, ${RED}Red text${RESET}, ${GREEN}Green text${RESET}, ${YELLOW}Yellow text${RESET}, ${BLUE}Blue text${RESET}, ${MAGENTA}Magenta text${RESET}, ${CYAN}Cyan text${RESET}, ${WHITE}White text${RESET}, ${GRAY}Gray text${RESET}.`);
})();

if (process.argv.length > 2) console.log("ARGV: " + JSON.stringify(process.argv));

/*process.on('SIGTERM', function() {
	console.warn("Caught SIGTERM and ignoring it!  Hahahahaha!");
} );*/

var stream = new JSONStream( process.stdin, process.stdout );
stream.on('json', function(job) {
	// got job from parent 
	console.log( "The current working directory is: " + process.cwd() );
	console.log( "The current date/time for our job is: " + (new Date(job.now * 1000)).toString() );
	
	// report if we got input
	if (job.input && job.input.data) {
		console.log( "Received input data: " + JSON.stringify(job.input.data) );
	}
	if (job.input && job.input.files) {
		console.log( "Received input files: " + JSON.stringify(job.input.files) );
		console.log( "Glob: " + JSON.stringify( Tools.glob.sync('*') ) );
	}
	
	// use some memory so we show up on the mem graph
	var buf = null;
	if (job.params.burn) {
		buf = Buffer.alloc( 1024 * 1024 * Math.floor( 128 + (Math.random() * 128) ) );
	}
	
	var start = Tools.timeNow();
	var idx = 0;
	var duration = 0;
	var req_in_progress = false;
	
	if (job.params.duration.toString().match(/^(\d+)\-(\d+)$/)) {
		var low = RegExp.$1;
		var high = RegExp.$2;
		low = parseInt(low);
		high = parseInt(high);
		duration = Math.round( low + (Math.random() * (high - low)) );
		console.log( "Chosen random duration: " + duration + " seconds" );
	}
	else {
		duration = parseInt( job.params.duration );
	}
	
	if (job.params.spawn) {
		cp.exec( 'sleep ' + Math.floor(duration - 1), function(err, stdout, stderr) {} );
	}
	
	var timer = setInterval( function() {
		var now = Tools.timeNow();
		var elapsed = now - start;
		var progress = Math.min( elapsed / duration, 1.0 );
		
		if (buf) buf.fill( String.fromCharCode( Math.floor( Math.random() * 256 ) ) );
		
		if (job.params.progress) {
			// report progress
			console.log( "Progress: " + Tools.shortFloat(progress));
			stream.write({
				opsrocket: true,
				progress: progress
			});
		}
		
		idx++;
		
		if (progress >= 1.0) {
			console.log( "We're done!" );
			perf.end();
			clearTimeout( timer );
			
			// abort network request if still in progress
			if (ac) ac.abort();
			
			// insert some fake random stats into perf
			var max = perf.scale * (duration / 5);
			var rand_range = function(low, high) { return low + (Math.random() * (high - low)); };
			
			perf.perf.db_query = { end: 1, elapsed: rand_range(0, max * 0.3) };
			perf.perf.db_connect = { end: 1, elapsed: rand_range(max * 0.2, max * 0.5) };
			perf.perf.log_read = { end: 1, elapsed: rand_range(max * 0.4, max * 0.7) };
			perf.perf.gzip_data = { end: 1, elapsed: rand_range(max * 0.6, max * 0.9) };
			perf.perf.http_post = { end: 1, elapsed: rand_range(max * 0.8, max * 1) };
			
			perf.count('lines', 52);
			perf.count('db_rows', 81);
			perf.count('db_conns', 8);
			perf.count('errors', 12);
			
			// include a table with some stats
			var table = {
				title: "Sample Job Stats",
				header: [
					"IP Address", "DNS Lookup", "Flag", "Count", "Percentage"
				],
				rows: [
					["62.121.210.2", "directing.com", "MaxEvents-ImpsUserHour-DMZ", 138, "0.0032%" ],
					["97.247.105.50", "hsd2.nm.comcast.net", "MaxEvents-ImpsUserHour-ILUA", 84, "0.0019%" ],
					["21.153.110.51", "grandnetworks.net", "InvalidIP-Basic", 20, "0.00046%" ],
					["95.224.240.69", "hsd6.mi.comcast.net", "MaxEvents-ImpsUserHour-NM", 19, "0.00044%" ],
					["72.129.60.245", "hsd6.nm.comcast.net", "InvalidCat-Domestic", 17, "0.00039%" ],
					["21.239.78.116", "cable.mindsprung.com", "InvalidDog-Exotic", 15, "0.00037%" ]
				],
				caption: "This is an example stats table you can generate from within your Plugin code."
			};
			
			// include a custom html report
			var html = {
				title: "Sample Job Report",
				content: "<pre>This is a sample text report you can generate from within your Plugin code (can be HTML too).\n\n-------------------------------------------------\n          Date/Time | 2015-10-01 6:28:38 AM      \n       Elapsed Time | 1 hour 15 minutes          \n     Total Log Rows | 4,313,619                  \n       Skipped Rows | 15                         \n  Pre-Filtered Rows | 16,847                     \n             Events | 4,296,757                  \n        Impressions | 4,287,421                  \n Backup Impressions | 4,000                      \n             Clicks | 5,309 (0.12%)              \n      Backup Clicks | 27 (0.00062%)              \n       Unique Users | 1,239,502                  \n-------------------------------------------------</pre>",
				caption: ""
			};
			
			if (job.params.upload) {
				var temp_file = 'sample-report-' + job.id + '.txt';
				fs.writeFileSync( temp_file, html.content.replace(/<.+?>/g, '') + "\n" );
				stream.write({
					opsrocket: true,
					push: {
						files: [ { path: temp_file, delete: true } ]
					}
				});
			}
			
			switch (job.params.action) {
				case 'Success':
					console.log( "Simulating a successful response." );
					stream.write({
						opsrocket: true,
						complete: true,
						code: 0,
						description: "Success!",
						perf: perf.summarize(),
						table: table,
						html: html,
						data: {
							text: "This is some sample data to pass to the next job!",
							// mmmm: "MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM",
							animal: "cat",
							breed: "abyssinian",
							age: 42
						}
					});
				break;
				
				case 'Error':
					console.log( "Simulating an error response." );
					stream.write({
						opsrocket: true,
						complete: true,
						code: 999,
						description: "Simulating an error message here.  Something went wrong!",
						perf: perf.summarize()
					});
				break;
				
				case 'Warning':
					console.log( "Simulating a warning response." );
					stream.write({
						opsrocket: true,
						complete: true,
						code: 'warning',
						description: "Simulating a warning message here.  Something is concerning!",
						perf: perf.summarize()
					});
				break;
				
				case 'Critical':
					console.log( "Simulating an error response." );
					stream.write({
						opsrocket: true,
						complete: true,
						code: 'critical',
						description: "Simulating a critical error message here.  Something is VERY wrong!",
						perf: perf.summarize()
					});
				break;
				
				case 'Crash':
					console.log( "Simulating a crash..." );
					setTimeout( function() { 
						// process.exit(1); 
						throw new Error("Test Crash");
					}, 100 );
				break;
			}
			
			// allow organic exit so stream.writes can complete
			// process.exit(0);
		}
		else {
			// burn up some CPU so we show up on the chart
			if (job.params.burn) {
				var temp = Tools.timeNow();
				while (Tools.timeNow() - temp < 0.10) {
					var x = Math.PI * 32768 / 100.3473847384 * Math.random();
				}
			}
			
			if (job.params.network && !req_in_progress) {
				// repeatedly fetch large file to generate network connections and traffic
				req_in_progress = true;
				ac = new AbortController();
				request.get( net_url, { signal: ac.signal }, function() { req_in_progress = false; ac = null; } );
			}
		}
		
	}, 150 );
	
} );
