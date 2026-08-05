#!/bin/sh
# Back to You - a voice for Claude Code. Installer for macOS.
#
#   ./install.sh            installs every theme, prompts you to pick one
#   ./install.sh mytheme    installs every theme, activates sounds/mytheme
#
# Mirrors install.bat beat for beat so the two stay comparable. Depends on
# nothing beyond a stock macOS: no Homebrew, no jq, no python3.

set -eu

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
CLAUDE_DIR="$HOME/.claude"
SETTINGS="$CLAUDE_DIR/settings.json"

fail() {
    printf 'ERROR: %s\n' "$1" >&2
    exit 1
}

# --- pick a voice pack -------------------------------------------------------
# A theme argument skips the prompt entirely, so scripted / non-interactive
# installs (curl | sh, CI, etc.) behave exactly as before.

if [ $# -ge 1 ]; then
    THEME="$1"
elif [ -t 0 ]; then
    i=0
    default_i=1
    for d in "$SCRIPT_DIR"/sounds/*/; do
        [ -d "$d" ] || continue
        i=$((i + 1))
        name=$(basename "$d")
        eval "PACK_$i=\$name"
        if [ "$name" = "claude" ]; then
            default_i=$i
        fi
    done
    pack_count=$i

    printf 'Choose a voice pack:\n\n'
    i=0
    while [ "$i" -lt "$pack_count" ]; do
        i=$((i + 1))
        eval "name=\$PACK_$i"
        if [ "$i" -eq "$default_i" ]; then
            printf '  %d) %s (default)\n' "$i" "$name"
        else
            printf '  %d) %s\n' "$i" "$name"
        fi
    done
    printf '\n'
    printf 'Pick a number [%d]: ' "$default_i"
    read -r choice || choice=""
    choice="${choice:-$default_i}"

    case "$choice" in
        ''|*[!0-9]*)
            fail "\"$choice\" isn't one of the choices above."
            ;;
    esac
    if [ "$choice" -lt 1 ] || [ "$choice" -gt "$pack_count" ]; then
        fail "\"$choice\" isn't one of the choices above."
    fi
    eval "THEME=\$PACK_$choice"
    printf '\n'
else
    THEME="claude"
fi

# --- pre-flight ------------------------------------------------------------

if [ ! -d "$SCRIPT_DIR/sounds/$THEME" ]; then
    printf 'ERROR: No theme folder at "%s"\n' "$SCRIPT_DIR/sounds/$THEME" >&2
    printf 'Available themes:\n' >&2
    for d in "$SCRIPT_DIR"/sounds/*/; do
        [ -d "$d" ] || continue
        printf '  %s\n' "$(basename "$d")" >&2
    done
    exit 1
fi

for required in task-complete decision-needed; do
    dir="$SCRIPT_DIR/sounds/$THEME/$required"
    if [ -z "$(find "$dir" -maxdepth 1 -type f \( -name '*.mp3' -o -name '*.wav' \) 2>/dev/null)" ]; then
        printf 'ERROR: No sounds in "%s"\n' "$dir" >&2
        printf 'Add at least one .mp3 or .wav to that folder and run this installer again.\n' >&2
        exit 1
    fi
done

command -v afplay >/dev/null 2>&1 || fail "afplay not found. This installer is for macOS."
command -v osascript >/dev/null 2>&1 || fail "osascript not found. This installer is for macOS."
command -v plutil >/dev/null 2>&1 || fail "plutil not found. This installer is for macOS."

printf 'Installing Back to You for Claude Code (macOS)...\n'
printf '  Active theme: %s\n\n' "$THEME"

# --- copy sounds and hooks -------------------------------------------------

mkdir -p "$CLAUDE_DIR/hooks" "$CLAUDE_DIR/sounds"

# The trailing /. copies the contents rather than nesting a sounds/sounds
# directory. Every theme comes along, so a custom pack is never deleted by
# installing a different one.
cp -R "$SCRIPT_DIR/sounds/." "$CLAUDE_DIR/sounds/" || fail "Copying sounds failed."
printf '  ok  Sound themes copied\n'

printf '%s\n' "$THEME" > "$CLAUDE_DIR/sound-theme.txt"
printf '  ok  Active theme set to %s\n' "$THEME"

cp "$SCRIPT_DIR/hooks/play-sound.sh" "$CLAUDE_DIR/hooks/play-sound.sh"
cp "$SCRIPT_DIR/hooks/play-category.sh" "$CLAUDE_DIR/hooks/play-category.sh"

# Without this the hooks are a silent no-op, which is the hardest kind of
# failure to diagnose - nothing errors, there is simply never any sound.
chmod +x "$CLAUDE_DIR/hooks/play-sound.sh" "$CLAUDE_DIR/hooks/play-category.sh"
printf '  ok  Hook scripts installed\n'

# --- merge settings.json ---------------------------------------------------
# This file belongs to the user and may hold hooks and configuration this
# installer knows nothing about. Back it up, validate before and after, and
# restore on any failure.

BACKUP=""

if [ -f "$SETTINGS" ]; then
    if ! LINT_OUTPUT=$(plutil -lint "$SETTINGS" 2>&1); then
        printf 'ERROR: %s exists but is not valid JSON:\n' "$SETTINGS" >&2
        printf '  %s\n' "$LINT_OUTPUT" >&2
        printf 'Fix or move it, then run this installer again.\n' >&2
        printf 'Nothing has been changed.\n' >&2
        exit 1
    fi
    BACKUP="$SETTINGS.bak.$(date +%Y%m%d%H%M%S)"
    cp "$SETTINGS" "$BACKUP"
    printf '  ok  Backed up settings to %s\n' "$BACKUP"
fi

restore_and_fail() {
    if [ -n "$BACKUP" ]; then
        cp "$BACKUP" "$SETTINGS"
        printf '  Restored settings from %s\n' "$BACKUP" >&2
    fi
    fail "$1"
}

if ! osascript -l JavaScript "$SCRIPT_DIR/tools/merge-settings.js" "$SETTINGS" "$CLAUDE_DIR/hooks"; then
    restore_and_fail "Could not update settings.json."
fi

if ! LINT_OUTPUT=$(plutil -lint "$SETTINGS" 2>&1); then
    restore_and_fail "settings.json is not valid JSON after the merge: $LINT_OUTPUT"
fi

printf '\nAll done. Restart Claude Code to activate sound notifications.\n'
printf 'To switch themes later, edit %s\n' "$CLAUDE_DIR/sound-theme.txt"
