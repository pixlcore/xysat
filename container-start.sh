#!/bin/sh
set -e

# add some common path locations
export PATH=$PATH:/usr/bin:/bin:/usr/local/bin:/usr/sbin:/sbin:/usr/local/sbin:$HOME/.local/bin

# check for bootstrap env var, but only on first run
CONFIG_FILE="${XYSAT_config_file:-config.json}"

if [ -n "$XYOPS_setup" ] && [ ! -s "$CONFIG_FILE" ]; then
	echo "Configuring xySat: $XYOPS_setup"
	curl -fsSL --connect-timeout 10 --retry 10 --retry-delay 5 --retry-connrefused --retry-all-errors "$XYOPS_setup" -o "$CONFIG_FILE"
	chmod 600 "$CONFIG_FILE"
fi

# check for foreground
if [ -n "${SATELLITE_foreground:-}" ]; then
    # cleanup pid file
	rm -f pid.txt

	# start xysat, replace current process
	exec node main.js start
else
    echo "ERROR: This script is for containers only."
fi
