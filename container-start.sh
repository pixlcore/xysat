#!/bin/bash

# Older containers explicitly launch this script using "sh", which ignores the
# Bash shebang above.  Re-launch under Bash so self-upgrades remain compatible.
if [ -z "${BASH_VERSION:-}" ]; then
	exec /bin/bash "$0" "$@"
fi

set -e

# add some common path locations
export PATH=$PATH:/usr/bin:/bin:/usr/local/bin:/usr/sbin:/sbin:/usr/local/sbin:$HOME/.local/bin

# check for bootstrap env var, but only on first run
CONFIG_FILE="${XYSAT_config_file:-config.json}"

if [[ -n "${XYOPS_setup:-}" && ! -s "$CONFIG_FILE" ]]; then
	# XYOPS_setup may contain one URL, or a comma-separated list of fallback URLs.
	# Split it into a Bash array so we can stop as soon as one download succeeds.
	IFS=',' read -r -a SETUP_URLS <<< "$XYOPS_setup"
	CONFIG_DOWNLOADED=0
	
	for SETUP_URL in "${SETUP_URLS[@]}"; do
		echo "Configuring xySat: $SETUP_URL"
		
		if curl -fsSL --connect-timeout 10 --retry 5 --retry-delay 1 --retry-connrefused --retry-all-errors "$SETUP_URL" -o "$CONFIG_FILE"; then
			chmod 600 "$CONFIG_FILE"
			CONFIG_DOWNLOADED=1
			break
		fi
		
		rm -f "$CONFIG_FILE"
		echo "WARNING: Failed to configure xySat using: $SETUP_URL" >&2
	done
	
	# Match the old single-URL behavior by stopping startup if no download worked.
	if [[ "$CONFIG_DOWNLOADED" -ne 1 ]]; then
		echo "ERROR: Failed to configure xySat from all XYOPS_setup URLs." >&2
		exit 1
	fi
fi

# check for foreground
if [[ -n "${SATELLITE_foreground:-}" ]]; then
	# cleanup pid file
	rm -f pid.txt
	
	# start xysat, replace current process
	exec node main.js start
else
	echo "ERROR: This script is for containers only."
fi
