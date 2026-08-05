#!/bin/sh
# Diagnoses "I installed Back to You and I don't hear anything" on macOS.
#
#   sh tools/doctor.sh
#
# Walks the same chain the Stop hook depends on - settings.json wiring,
# script presence and permissions, the quarantine flag, clips on disk, and
# an actual afplay test - and reports which link is broken. Fixes nothing;
# a diagnostic that also mutates state is a worse diagnostic.
#
# Exits 0 when every check passes, 1 when at least one fails.

CLAUDE_DIR="$HOME/.claude"
SETTINGS="$CLAUDE_DIR/settings.json"
SCRIPT_DIR=$(cd "$(dirname "$0")/.." && pwd)

problems=0

ok() {
    printf '  ok      %s\n' "$1"
}

bad() {
    printf '  MISSING %s\n' "$1"
    if [ -n "${2:-}" ]; then
        printf '          -> %s\n' "$2"
    fi
    problems=$((problems + 1))
}

printf 'Back to You doctor\n\n'

# --- platform ----------------------------------------------------------------

if command -v afplay >/dev/null 2>&1; then
    ok "afplay is available"
else
    bad "afplay is available" "This isn't macOS, or afplay isn't on PATH."
fi

if command -v osascript >/dev/null 2>&1; then
    ok "osascript is available"
else
    bad "osascript is available" "This isn't macOS, or osascript isn't on PATH."
fi

# --- settings.json wiring ------------------------------------------------------

if [ -f "$SETTINGS" ]; then
    ok "$SETTINGS exists"
    wiring=$(osascript -l JavaScript "$SCRIPT_DIR/tools/doctor.js" "$SETTINGS" 2>&1)
    printf '%s\n' "$wiring" | while IFS= read -r line; do
        printf '  %s\n' "$line"
    done
    if printf '%s' "$wiring" | grep -q '^missing'; then
        problems=$((problems + 1))
        printf '          -> Run ./install.sh again to rewire the missing hook(s).\n'
    fi
else
    bad "$SETTINGS exists" "Run ./install.sh."
fi

# --- hook scripts --------------------------------------------------------------

for script in play-sound.sh play-category.sh; do
    path="$CLAUDE_DIR/hooks/$script"
    if [ ! -f "$path" ]; then
        bad "$path exists" "Run ./install.sh."
        continue
    fi
    ok "$path exists"

    if [ -x "$path" ]; then
        ok "$path is executable"
    else
        bad "$path is executable" "Run: chmod +x \"$path\""
    fi

    quarantine=$(xattr -p com.apple.quarantine "$path" 2>/dev/null || true)
    if [ -n "$quarantine" ]; then
        bad "$path has no quarantine flag" "Run: xattr -d com.apple.quarantine \"$path\""
    else
        ok "$path has no quarantine flag"
    fi
done

# --- active theme and clips -----------------------------------------------

theme=claude
theme_file="$CLAUDE_DIR/sound-theme.txt"
if [ -f "$theme_file" ]; then
    t=$(tr -d '\r\n' < "$theme_file" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    [ -n "$t" ] && theme="$t"
    ok "Active theme: $theme (from $theme_file)"
else
    bad "$theme_file exists" "Defaulting to the \"claude\" theme. Run ./install.sh to create it."
fi

sample_clip=""
for category in task-complete decision-needed error subagent-done; do
    dir="$CLAUDE_DIR/sounds/$theme/$category"
    clip=$(find "$dir" -maxdepth 1 -type f \( -name '*.mp3' -o -name '*.wav' \) 2>/dev/null | head -n 1)
    if [ -n "$clip" ]; then
        ok "$dir has at least one clip"
        [ -n "$sample_clip" ] || sample_clip="$clip"
    else
        bad "$dir has at least one clip" "Run ./install.sh to reinstall the \"$theme\" theme."
    fi
done

# --- actual playback -----------------------------------------------------------

if [ -n "$sample_clip" ] && command -v afplay >/dev/null 2>&1; then
    printf '\nPlaying %s - you should hear it now...\n' "$sample_clip"
    if afplay "$sample_clip" 2>/dev/null; then
        ok "afplay played the sample clip without error"
        printf '          -> If you didn'"'"'t hear it, check System Settings > Sound (output\n'
        printf '             device and volume) and whether Focus/Do Not Disturb is muting alerts.\n'
    else
        bad "afplay played the sample clip without error" "afplay itself failed - check output device in System Settings > Sound."
    fi
fi

printf '\n'
if [ "$problems" -eq 0 ]; then
    printf 'All checks passed.\n'
    exit 0
else
    printf '%d check(s) failed. Fix the items marked MISSING above and run this again.\n' "$problems"
    exit 1
fi
