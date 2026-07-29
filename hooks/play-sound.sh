#!/bin/sh
# Claude Code Stop hook - plays a task-complete clip, or a decision-needed clip
# when the last assistant message ends in a question.
#
# POSIX sh only: Claude Code spawns hooks via `sh -c`, not the user's login
# shell, so bashisms ([[ ]], arrays, $RANDOM, <<<) are unavailable here.
#
# Always exits 0. A non-zero exit surfaces a hook error in the transcript, and
# a missing sound is never worth interrupting someone's session over.

CLAUDE_DIR="$HOME/.claude"

# --- read the hook payload -------------------------------------------------
# Buffered to a file rather than piped: `plutil` reading a real path is
# well-defined, whereas its handling of `-` as stdin is not documented.

tmp=$(mktemp -t backtoyou 2>/dev/null) || exit 0
trap 'rm -f "$tmp"' EXIT INT TERM HUP
cat > "$tmp" 2>/dev/null || exit 0

msg=$(plutil -extract last_assistant_message raw -o - -- "$tmp" 2>/dev/null) || msg=""

if [ -z "$msg" ]; then
    # plutil could not read it. JXA is slower but definitively correct, and
    # this path only runs when the fast one has already failed.
    msg=$(osascript -l JavaScript -e 'ObjC.import("Foundation");
function run(argv) {
  var s = $.NSString.stringWithContentsOfFileEncodingError(argv[0], 4, null);
  if (s.isNil()) { return ""; }
  try {
    var o = JSON.parse(ObjC.unwrap(s));
    return (o && typeof o.last_assistant_message === "string") ? o.last_assistant_message : "";
  } catch (e) { return ""; }
}' "$tmp" 2>/dev/null) || msg=""
fi

rm -f "$tmp"
trap - EXIT INT TERM HUP

# --- classify --------------------------------------------------------------
# The Windows hook anchors its regex at end-of-string. `grep` anchors at the
# end of every line, so matching the whole message would fire decision-needed
# for any multi-line answer that merely contains a question. Compare only the
# last non-empty line. An empty message means task-complete, matching Windows.

category=task-complete

if [ -n "$msg" ]; then
    tail_line=$(printf '%s\n' "$msg" | sed -e 's/[[:space:]]*$//' -e '/^$/d' | tail -n 1)
    case "$tail_line" in
        *\?)
            category=decision-needed
            ;;
        *)
            # A question mark followed only by punctuation still counts, e.g. `right?"`
            if printf '%s' "$tail_line" | grep -qE '\?[^[:alnum:]]*$'; then
                category=decision-needed
            fi
            ;;
    esac
fi

# --- resolve the active theme ----------------------------------------------
# One line of text, read fresh every time, so switching packs needs no
# reinstall and no Claude restart.

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
# `afplay` blocks until the clip ends, so no duration probing is needed - the
# Windows script only polls NaturalDuration because .NET's Play() is async.
# The watchdog exists because a user can drop a three-minute file into a theme
# folder, and this hook runs at the end of every single response.

afplay "$clip" 2>/dev/null &
player=$!
( sleep 6; kill "$player" 2>/dev/null ) >/dev/null 2>&1 &
guard=$!

wait "$player" 2>/dev/null
kill "$guard" 2>/dev/null
wait "$guard" 2>/dev/null

exit 0
