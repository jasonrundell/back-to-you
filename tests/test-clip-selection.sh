#!/bin/sh
# Samples the clip-selection logic the shell hooks use and prints a
# distribution table, so the random picks can be confirmed to spread evenly.
#
#   sh tests/test-clip-selection.sh                 # uses installed claude theme
#   sh tests/test-clip-selection.sh <dir> [draws]   # any folder of clips
#
# The shell equivalent of tests/Test-TaskCompleteRandomness.ps1. It plays no
# audio.
#
# The hooks cannot use $RANDOM - Claude Code spawns them via `sh -c`, and
# $RANDOM is a bashism. They read /dev/urandom instead, with an awk fallback.
# This exercises the same path.

dir="${1:-$HOME/.claude/sounds/claude/task-complete}"
draws="${2:-600}"

if [ ! -d "$dir" ]; then
    printf 'No such directory: %s\n' "$dir" >&2
    printf 'Pass a folder of clips as the first argument.\n' >&2
    exit 1
fi

list=$(find "$dir" -maxdepth 1 -type f \( -name '*.mp3' -o -name '*.wav' \) 2>/dev/null)

if [ -z "$list" ]; then
    printf 'No .mp3 or .wav files in %s\n' "$dir" >&2
    exit 1
fi

count=$(printf '%s\n' "$list" | wc -l | tr -d '[:space:]')

printf '\n  Directory : %s\n' "$dir"
printf '  Clips     : %s\n' "$count"
printf '  Draws     : %s\n' "$draws"
printf '  Expected  : ~%s per clip\n\n' "$((draws / count))"

i=0
while [ "$i" -lt "$draws" ]; do
    rand=$(od -An -N2 -tu2 /dev/urandom 2>/dev/null | tr -dc '0-9')
    if [ -z "$rand" ]; then
        rand=$(awk 'BEGIN { srand(); print int(rand() * 65536) }' 2>/dev/null)
    fi
    [ -n "$rand" ] || rand=0
    index=$(( rand % count + 1 ))
    printf '%s\n' "$list" | sed -n "${index}p" | sed 's#.*/##'
    i=$(( i + 1 ))
done | sort | uniq -c | sort -rn | while read -r n name; do
    printf '  %6s  %s\n' "$n" "$name"
done

printf '\n'
