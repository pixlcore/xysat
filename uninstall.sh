#!/bin/sh

# Copyright (c) 2019 - 2025 PixlCore LLC
# BSD 3-Clause License -- see LICENSE.md

cd "$(dirname "$0")" || exit 1

# Uninstall xyOps Satellite
./bin/node main.js uninstall || exit 1
