#!/bin/sh
# Claude Code hook: plays a random clip from one named sound category.
#
# Used by every wired event except Stop, which has to work out its own category
# from the assistant's last message before it can play anything.
#
#   play-category.sh decision-needed
#   play-category.sh session-start
#   play-category.sh subagent-done
#   play-category.sh error
#
# POSIX sh only: Claude Code spawns hooks via `sh -c`, so bashisms ([[ ]],
# arrays, $RANDOM, <<<) are unavailable here.
#
# Exits quietly - and with status 0 - when the category folder is missing or
# empty. That is the supported way to switch a sound off: delete the clips you
# do not want. A non-zero exit would surface a hook error in the transcript.
#
# Deliberately duplicates the theme-resolution and playback logic in
# play-sound.sh. Factoring it out would mean a third file the installer has to
# copy and keep in step, and play-sound.sh runs at the end of every single
# response - too hot a path to spend a second process on.

CLAUDE_DIR="$HOME/.claude"

category="${1:-}"
[ -n "$category" ] || exit 0

# --- resolve the active theme ----------------------------------------------

theme=claude
theme_file="$CLAUDE_DIR/sound-theme.txt"
if [ -f "$theme_file" ]; then
    t=$(tr -d '\r\n' < "$theme_file" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    if [ -n "$t" ]; then
        theme="$t"
    fi
fi

dir="$CLAUDE_DIR/sounds/$theme/$category"
[ -d "$dir" ] || exit 0

# --- pick a clip -----------------------------------------------------------

list=$(find "$dir" -maxdepth 1 -type f \( -name '*.mp3' -o -name '*.wav' \) 2>/dev/null)
[ -n "$list" ] || exit 0

count=$(printf '%s\n' "$list" | wc -l | tr -d '[:space:]')
[ "$count" -gt 0 ] 2>/dev/null || exit 0

rand=$(od -An -N2 -tu2 /dev/urandom 2>/dev/null | tr -dc '0-9')
if [ -z "$rand" ]; then
    rand=$(awk 'BEGIN { srand(); print int(rand() * 65536) }' 2>/dev/null)
fi
[ -n "$rand" ] || rand=0

index=$(( rand % count + 1 ))
clip=$(printf '%s\n' "$list" | sed -n "${index}p")
[ -n "$clip" ] || exit 0

# --- play ------------------------------------------------------------------
# `afplay` blocks until the clip ends. The watchdog is here because a user can
# drop a three-minute file into a theme folder.

afplay "$clip" 2>/dev/null &
player=$!
( sleep 6; kill "$player" 2>/dev/null ) >/dev/null 2>&1 &
guard=$!

wait "$player" 2>/dev/null
kill "$guard" 2>/dev/null
wait "$guard" 2>/dev/null

exit 0
