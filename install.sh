#!/bin/sh
# Back to You - installer shim for macOS and Linux.
#
#   ./install.sh            pick a voice pack, or switch the active one
#   ./install.sh mytheme    activate mytheme without prompting
#
# This used to be the installer. It is now a shim: the real one is bin/cli.js,
# and there is exactly one implementation of it. See docs/adr/0001 for why.
#
# Runs straight from a clone or an unzipped release - the package has no
# runtime dependencies, so there is nothing to `npm install` first.

set -eu

DIR=$(cd "$(dirname "$0")" && pwd)

if ! command -v node >/dev/null 2>&1; then
    printf 'ERROR: Back to You needs Node.js, and `node` is not on your PATH.\n' >&2
    printf 'Install it from https://nodejs.org and run this again.\n' >&2
    exit 1
fi

exec node "$DIR/bin/cli.js" "$@"
