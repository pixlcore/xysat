#!/bin/sh
set -e

# check for bootstrap env var, but only on first run
if [ -n "$XYOPS_setup" ] && [ ! -f "config.json" ]; then
	echo "Configuring xySat: $XYOPS_setup"
    curl -fsSL --connect-timeout 10 "$XYOPS_setup" > config.json
	chmod 600 config.json
fi

# check for foreground
if [ -n "${SATELLITE_foreground:-}" ]; then
    # cleanup pid file
	rm -f pid.txt

	# start xysat, replace current process
	exec node main.js start
else
    echo "This script is for containers only."
fi
