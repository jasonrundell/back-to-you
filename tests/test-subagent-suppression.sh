#!/bin/sh
# Tests the Stop hook's redundant-clip suppression: when a subagent is the
# last thing a turn does, SubagentStop's subagent-done clip plays moments
# before Stop fires task-complete - two "done" clips back to back for one
# completion. play-category.sh timestamps the subagent-done moment in
# $CLAUDE_DIR/.subagent-done-at; play-sound.sh skips its own clip when that
# marker is 5 seconds old or less, and always consumes the marker.
#
#   sh tests/test-subagent-suppression.sh
#
# Runs anywhere with a POSIX sh, touches nothing outside a temp dir, and
# plays no audio. It replicates the marker logic rather than shelling out to
# the real hooks, because play-sound.sh depends on macOS's plutil to read its
# JSON payload and play-category.sh on afplay - neither is available here.
#
# Keep in step with hooks/play-sound.sh and hooks/play-category.sh. If the
# suppression window or marker handling there changes, change it here.

TMP=$(mktemp -d) || exit 1
trap 'rm -rf "$TMP"' EXIT INT TERM HUP

mark() {
    # $1 = seconds ago the subagent-done clip "played"
    now=$(date +%s)
    echo "$((now - $1))" > "$TMP/.subagent-done-at"
}

# Mirrors the suppression block in hooks/play-sound.sh exactly.
resolve() {
    category="$1"
    marker="$TMP/.subagent-done-at"
    result=play

    if [ -f "$marker" ]; then
        marked=$(tr -dc '0-9' < "$marker" 2>/dev/null)
        rm -f "$marker" 2>/dev/null
        if [ "$category" = "task-complete" ] && [ -n "$marked" ]; then
            now=$(date +%s)
            if [ $((now - marked)) -le 5 ]; then
                result=skip
            fi
        fi
    fi

    printf '%s' "$result"
}

pass=0
fail=0

check() {
    want="$1"; desc="$2"
    got="$3"
    if [ "$got" = "$want" ]; then
        pass=$((pass + 1))
        printf '  ok    %-56s -> %s\n' "$desc" "$got"
    else
        fail=$((fail + 1))
        printf '  FAIL  %-56s -> %s (wanted %s)\n' "$desc" "$got" "$want"
    fi
}

printf '\nStop hook redundant-clip suppression\n\n'

rm -f "$TMP/.subagent-done-at"
check play   "no marker, task-complete"                    "$(resolve task-complete)"

mark 0
check skip   "marker just now, task-complete"               "$(resolve task-complete)"

mark 5
check skip   "marker 5s old (boundary), task-complete"      "$(resolve task-complete)"

mark 6
check play   "marker 6s old, task-complete"                 "$(resolve task-complete)"

mark 0
check play   "marker just now, decision-needed"             "$(resolve decision-needed)"

mark 0
resolve task-complete > /dev/null
check play   "marker consumed after first check"            "$(resolve task-complete)"

printf '\n  %d passed, %d failed\n\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
