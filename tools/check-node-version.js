#!/usr/bin/env node

// Stop releases unless the workflow bundles the latest stable Node.js major requested.
// Uses only built-in Node.js APIs, and can also be run directly for a preflight.
// Usage: node tools/check-node-version.js <major>

var fs = require('fs');
var Path = require('path');

var workflowPath = Path.join(__dirname, '../.github/workflows/release.yml');
var indexURL = 'https://nodejs.org/dist/index.json';
var nodeMajor = process.argv[2];

async function checkNodeVersion() {

	// Require one positive integer major version before reading files or fetching.
	if ((process.argv.length !== 3) || !/^[1-9]\d*$/.test(nodeMajor || '') || !Number.isSafeInteger(Number(nodeMajor))) {
		throw new Error('Usage: node tools/check-node-version.js <major> (e.g. 24)');
	}
	
	// Read the literal version from the workflow's top-level env block.
	// This deliberately supports our simple YAML layout without a YAML dependency.
	// Reject missing, ambiguous or nonliteral settings instead of guessing.
	var workflow = fs.readFileSync(workflowPath, 'utf8');
	var env = workflow.match(/^env:[ \t]*(?:#[^\r\n]*)?\r?\n([\s\S]*?)(?=^\S|(?![\s\S]))/m);
	var settings = workflow.match(/^[ \t]*NODE_VERSION:[^\r\n]*/gm) || [];
	var match = env && env[1].match(/^  NODE_VERSION:[ \t]*(['"]?)(\d+\.\d+\.\d+)\1[ \t]*(?:#[^\r\n]*)?\r?$/m);
	if (!match || (settings.length !== 1)) {
		throw new Error('Expected one literal NODE_VERSION (e.g. \'24.22.2\') in the top-level env block of ' + workflowPath);
	}
	var pinned = match[2];
	
	// Bound the entire lookup, including reading the response body.
	// Network errors, HTTP errors and malformed JSON must all block the release.
	console.log('Checking bundled Node.js against the latest v' + nodeMajor + ' release...');
	var response = await fetch(indexURL, { signal: AbortSignal.timeout(15000) });
	if (!response.ok) throw new Error('Node.js release index returned HTTP ' + response.status);
	var releases = await response.json();
	if (!Array.isArray(releases)) throw new Error('Invalid Node.js release index: expected an array.');
	
	// Ignore other major versions and prereleases.  Sort numerically so we do not
	// depend on the index order or compare version numbers as plain strings.
	var pattern = new RegExp('^v' + nodeMajor + '\\.\\d+\\.\\d+$');
	var versions = releases.filter(function(release) {
		return release && (typeof release.version === 'string') && pattern.test(release.version);
	}).map(function(release) { return release.version.slice(1); });
	
	versions.sort(function(a, b) {
		var aa = a.split('.').map(Number);
		var bb = b.split('.').map(Number);
		return (bb[1] - aa[1]) || (bb[2] - aa[2]);
	});
	if (!versions.length) throw new Error('No stable Node.js v' + nodeMajor + ' releases found in ' + indexURL);
	var latest = versions[0];
	
	// Keep the pinned build reproducible: report the required edit, never change it.
	if (pinned !== latest) {
		throw new Error('Bundled Node.js version does not match the latest v' + nodeMajor + ' release!\n' +
			'  Workflow NODE_VERSION: ' + pinned + '\n' +
			'  Latest Node.js v' + nodeMajor + ':    ' + latest + '\n' +
			'Update NODE_VERSION in ' + workflowPath + ', commit the change, and retry.');
	}
	console.log('Node.js version check passed: ' + pinned + ' is the latest v' + nodeMajor + ' release.');
}

checkNodeVersion().catch(function(err) {
	// Use a conspicuous stderr banner and a nonzero status so release.sh stops.
	console.error('\n============================================================\n' +
		'ERROR: RELEASE STOPPED - NODE.JS VERSION CHECK FAILED\n' +
		err.message + '\n' +
		'No release tags have been created or pushed by this script.\n' +
		'============================================================\n');
	process.exitCode = 1;
});
