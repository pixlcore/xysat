#!/bin/sh

# Copyright (c) 2019 - 2025 PixlCore LLC
# BSD 3-Clause License -- see LICENSE.md

cd "$(dirname "$0")" || exit 1

# Install and start xyOps Satellite
./bin/node main.js install || exit 1
./bin/node main.js start || exit 1
