#!/bin/sh

cd "$(dirname "$0")" || exit 1

# Install and start Orchestra Satellite
./bin/node main.js install || exit 1
./bin/node main.js start || exit 1
