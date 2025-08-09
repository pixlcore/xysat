#!/bin/sh

# Copyright (c) 2019 - 2025 PixlCore LLC
# Sustainable Use License -- see LICENSE.md

cd "$(dirname "$0")" || exit 1

# Install and start xyOps Satellite
./bin/node main.js install || exit 1
./bin/node main.js start || exit 1
