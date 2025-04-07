#!/bin/sh

cd "$(dirname "$0")" || exit 1

# Uninstall Orchestra Satellite
./bin/node main.js uninstall || exit 1
