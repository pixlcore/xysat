#!/bin/bash
set -euo pipefail

# Release the latest version of xySat

HOMEDIR="$(dirname "$(cd -- "$(dirname "$0")" && (pwd -P 2>/dev/null || pwd))")"
cd $HOMEDIR

PACKAGE_VERSION=$(node -p -e "require('./package.json').version")
SHORTVER="v$PACKAGE_VERSION"
LONGVER="Version $PACKAGE_VERSION"
echo $LONGVER
git tag -a "$SHORTVER" -m "$LONGVER" && git push --tags

node tools/changelog.js

echo ""
echo "Legacy xySat release..."
echo ""

cd ../xysat-legacy
./build.sh
