#!/bin/sh

# Copyright (c) 2019 - 2025 PixlCore LLC
# Sustainable Use License -- see LICENSE.md

cd "$(dirname "$0")" || exit 1

# Uninstall OpsRocket Satellite
./bin/node main.js uninstall || exit 1
