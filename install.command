#!/bin/sh
# Double-clickable wrapper for Finder. Opens a Terminal window, runs the real
# installer, and waits so the output can be read before the window closes.
#
# Must be committed with the executable bit set:
#   git update-index --chmod=+x install.command

DIR=$(cd "$(dirname "$0")" && pwd)

"$DIR/install.sh" "$@"
status=$?

printf '\nPress Return to close this window...'
read -r _
exit "$status"
