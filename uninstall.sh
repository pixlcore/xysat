#!/bin/sh

# Copyright (c) 2019 - 2025 PixlCore LLC
# MIT License -- see LICENSE.md

cd "$(dirname "$0")" || exit 1

# Uninstall xyOps Satellite
./bin/node main.js uninstall || exit 1
