#!/bin/sh
# Back to You - macOS verification harness.
#
#   sh tests/verify-macos.sh path/to/backtoyou-1.2.0.tgz
#
# Runs every mechanical check from issue #36 against a sandboxed HOME, so the
# real ~/.claude is never touched, and prints a report to paste back onto the
# issue. The checks a machine cannot make - whether a clip is *audible*, and
# whether it is the right clip - are called out for you to answer by ear.
#
# Nothing here is shipped: tests/ is excluded from the npm tarball.

set -u

TARBALL="${1:-}"
if [ -z "$TARBALL" ] || [ ! -f "$TARBALL" ]; then
    printf 'usage: sh tests/verify-macos.sh <path-to-backtoyou-x.y.z.tgz>\n' >&2
    printf 'Build one with: npm pack\n' >&2
    exit 1
fi

SB=$(mktemp -d /tmp/bty-macos-XXXXXX) || exit 1
export HOME="$SB"
PKG="$SB/extract/package"
pass=0
fail=0

ok()   { pass=$((pass + 1)); printf '  PASS  %s\n' "$1"; }
bad()  { fail=$((fail + 1)); printf '  FAIL  %s\n' "$1"; }
note() { printf '        %s\n' "$1"; }
hdr()  { printf '\n%s\n' "$1"; }

printf 'Back to You - macOS verification\n'
printf '  macOS   %s (%s)\n' "$(sw_vers -productVersion 2>/dev/null || echo unknown)" "$(uname -m)"
printf '  node    %s\n' "$(node -v 2>/dev/null || echo MISSING)"
printf '  sandbox %s\n' "$SB"

mkdir -p "$SB/extract"
tar -xzf "$TARBALL" -C "$SB/extract" || { printf 'could not extract tarball\n' >&2; exit 1; }

# --- 1. cold install -------------------------------------------------------

hdr '1. Cold install'
node "$PKG/bin/cli.js" < /dev/null > "$SB/install.log" 2>&1
if [ $? -eq 0 ]; then ok 'installer exits 0'; else bad 'installer exits 0'; sed 's/^/        /' "$SB/install.log"; fi

for f in hooks/play-sound.js hooks/play-category.js hooks/play-lib.js sound-theme.txt .backtoyou-version; do
    if [ -e "$SB/.claude/$f" ]; then ok "installed $f"; else bad "installed $f"; fi
done
for f in hooks/play-sound.ps1 hooks/play-sound.sh; do
    if [ -e "$SB/.claude/$f" ]; then bad "$f must NOT be installed on macOS"; else ok "$f correctly absent"; fi
done

packs=$(ls "$SB/.claude/sounds" 2>/dev/null | tr '\n' ' ')
note "packs: $packs"
[ "$(ls "$SB/.claude/sounds" 2>/dev/null | wc -l | tr -d ' ')" = "4" ] && ok 'all four packs copied' || bad 'all four packs copied'

# --- 2. the hook, invoked exactly as settings.json invokes it ---------------

hdr '2. Playback (LISTEN - a machine cannot check this part)'
CMD=$(node -e 'console.log(require(process.env.HOME+"/.claude/settings.json").hooks.Stop[0].hooks[0].command)' 2>/dev/null)
note "wired: $CMD"
case "$CMD" in
    node\ *play-sound.js*) ok 'Stop wired to the Node hook' ;;
    *) bad 'Stop wired to the Node hook' ;;
esac

printf '\n        >>> LISTEN: you should hear "Back to you."\n'
start=$(date +%s)
printf '%s' '{"last_assistant_message":"All done."}' | eval "$CMD"
status=$?
elapsed=$(( $(date +%s) - start ))
[ $status -eq 0 ] && ok 'task-complete hook exits 0' || bad "task-complete hook exits 0 (got $status)"
note "wall time: ${elapsed}s"

printf '\n        >>> LISTEN: you should hear "Waiting on you." - a DIFFERENT clip\n'
printf '%s' '{"last_assistant_message":"Shall I push it?"}' | eval "$CMD"
[ $? -eq 0 ] && ok 'decision-needed hook exits 0' || bad 'decision-needed hook exits 0'

if [ -f "$SB/.claude/.backtoyou-playback-error" ]; then
    bad 'playback error file written - afplay failed'
    note "$(cat "$SB/.claude/.backtoyou-playback-error")"
else
    ok 'no playback error file (afplay worked)'
fi

# --- 3. latency ------------------------------------------------------------
# Node cold start on macOS has never been measured. The decision to put Node
# on Unix (issue #27) rests partly on an ESTIMATE of ~35ms nobody confirmed.

hdr '3. Hook latency - the number issue #27 was decided on without'
note 'Emptying task-complete so this times the hook, not the clip.'
mv "$SB/.claude/sounds/claude/task-complete" "$SB/.claude/sounds/claude/task-complete.off"
mkdir -p "$SB/.claude/sounds/claude/task-complete"
i=0
total=0
while [ $i -lt 10 ]; do
    s=$(perl -MTime::HiRes=time -e 'printf "%.0f", time*1000' 2>/dev/null)
    printf '%s' '{"last_assistant_message":"x"}' | eval "$CMD" >/dev/null 2>&1
    e=$(perl -MTime::HiRes=time -e 'printf "%.0f", time*1000' 2>/dev/null)
    total=$((total + e - s))
    i=$((i + 1))
done
rm -rf "$SB/.claude/sounds/claude/task-complete"
mv "$SB/.claude/sounds/claude/task-complete.off" "$SB/.claude/sounds/claude/task-complete"
note "hook overhead, no clip, 10 runs: $((total / 10))ms average"
note 'Compare: sh was ~4ms on Linux; Node was ~113ms under WSL (inflated).'
note 'If this is far above ~60ms, say so on the issue - it reopens issue #27.'

# --- 4. switching ----------------------------------------------------------

hdr '4. Pack switching'
node "$PKG/bin/cli.js" gigatron < /dev/null > "$SB/switch.log" 2>&1
[ "$(cat "$SB/.claude/sound-theme.txt")" = "gigatron" ] && ok 'switched to gigatron' || bad 'switched to gigatron'
# Match the instruction, not the word: the switch path deliberately says
# "no restart needed", which a bare grep for "restart" would flag.
if grep -qi 'Restart Claude Code' "$SB/switch.log"; then
    bad 'switch must NOT instruct a restart'
else
    ok 'switch gives no restart instruction'
fi
grep -qi 'no restart needed' "$SB/switch.log" && ok 'switch says a restart is unnecessary' || note 'switch did not mention that no restart is needed'
printf '\n        >>> LISTEN: this should be the GIGATRON voice, with no restart\n'
printf '%s' '{"last_assistant_message":"All done."}' | eval "$CMD"

# --- 5. upgrade from a legacy .sh install ----------------------------------

hdr '5. Upgrade from the old .sh install - the path every current user takes'
rm -rf "$SB/.claude"
mkdir -p "$SB/.claude/hooks"
printf 'mistress-of-pain\n' > "$SB/.claude/sound-theme.txt"
cat > "$SB/.claude/settings.json" <<'JSON'
{
  "model": "claude-opus-5",
  "env": { "KEEP_ME": "yes" },
  "hooks": {
    "Stop": [ { "hooks": [ { "type": "command", "command": "\"~/.claude/hooks/play-sound.sh\"", "timeout": 10 } ] } ],
    "Notification": [ { "hooks": [ { "type": "command", "command": "\"~/.claude/hooks/play-sound-decision.sh\"", "timeout": 10 } ] } ],
    "PostToolUse": [ { "hooks": [ { "type": "command", "command": "my-own-hook.sh", "timeout": 5 } ] } ]
  }
}
JSON
node "$PKG/bin/cli.js" < /dev/null > /dev/null 2>&1
[ "$(cat "$SB/.claude/sound-theme.txt")" = "mistress-of-pain" ] && ok 'active pack preserved' || bad 'active pack preserved'
node -e '
const c = require(process.env.HOME + "/.claude/settings.json");
const all = Object.values(c.hooks).flatMap(g => g.flatMap(x => x.hooks.map(h => h.command)));
const stale = all.filter(x => x.includes(".sh") && !x.includes("my-own-hook"));
const mine = all.filter(x => x.includes("my-own-hook"));
const ours = all.filter(x => x.includes("play-sound.js") || x.includes("play-category.js"));
console.log((c.model === "claude-opus-5" ? "  PASS  " : "  FAIL  ") + "unrelated config preserved");
console.log((c.env && c.env.KEEP_ME === "yes" ? "  PASS  " : "  FAIL  ") + "nested config preserved");
console.log((stale.length === 0 ? "  PASS  " : "  FAIL  ") + "no stale .sh entries (" + stale.length + ")");
console.log((mine.length === 1 ? "  PASS  " : "  FAIL  ") + "third-party hook untouched");
console.log((ours.length === 5 ? "  PASS  " : "  FAIL  ") + "five Back to You entries wired (" + ours.length + ")");
'

# --- 6. uninstall ----------------------------------------------------------

hdr '6. Uninstall'
node "$PKG/bin/cli.js" < /dev/null > /dev/null 2>&1   # reinstall after the upgrade test
mkdir -p "$SB/.claude/sounds/mytheme/task-complete"
echo mine > "$SB/.claude/sounds/mytheme/task-complete/mine.mp3"
echo mine > "$SB/.claude/sounds/claude/task-complete/my-take.mp3"

node "$PKG/bin/cli.js" --uninstall < /dev/null > /dev/null 2>&1
[ $? -ne 0 ] && ok 'refuses without --yes when not a terminal' || bad 'refuses without --yes when not a terminal'
[ -f "$SB/.claude/sound-theme.txt" ] && ok 'the refusal changed nothing' || bad 'the refusal changed nothing'

node "$PKG/bin/cli.js" --uninstall --yes < /dev/null > "$SB/uninstall.log" 2>&1
[ $? -eq 0 ] && ok 'uninstall exits 0' || bad 'uninstall exits 0'
[ -f "$SB/.claude/hooks/play-sound.js" ] && bad 'hooks removed' || ok 'hooks removed'
[ -f "$SB/.claude/sound-theme.txt" ] && bad 'sound-theme.txt removed' || ok 'sound-theme.txt removed'
[ -f "$SB/.claude/sounds/mytheme/task-complete/mine.mp3" ] && ok 'a pack you made survives' || bad 'a pack you made survives'
[ -f "$SB/.claude/sounds/claude/task-complete/my-take.mp3" ] && ok 'a take inside a shipped pack survives' || bad 'a take inside a shipped pack survives'
[ -f "$SB/.claude/sounds/claude/task-complete/vo-back-to-you.mp3" ] && bad 'shipped clips removed' || ok 'shipped clips removed'
# Count OUR entries, not all events: the third-party hook seeded in step 5
# survives on purpose, so an empty `hooks` object would be the wrong bar.
node -e '
const fs=require("fs");
const c=JSON.parse(fs.readFileSync(process.env.HOME+"/.claude/settings.json","utf8").replace(/^﻿/,""));
const all=Object.values(c.hooks||{}).flatMap(g=>g.flatMap(x=>x.hooks.map(h=>h.command)));
const ours=all.filter(x=>/play-(sound|category|sound-decision)\.(js|sh|ps1)/.test(x));
const theirs=all.filter(x=>x.includes("my-own-hook"));
console.log((ours.length===0?"  PASS  ":"  FAIL  ")+"no Back to You entries left ("+ours.length+")");
console.log((theirs.length===1?"  PASS  ":"  FAIL  ")+"the third-party hook survived the uninstall");
'
node "$PKG/bin/cli.js" --uninstall --yes < /dev/null > /dev/null 2>&1
[ $? -eq 0 ] && ok 'a second uninstall is a no-op, not an error' || bad 'a second uninstall is a no-op, not an error'

# --- 7. the shims ----------------------------------------------------------

hdr '7. Shims'
if [ -f "$PKG/install.sh" ]; then
    note 'install.sh is in the tarball (unexpected - it is meant to be clone-only)'
else
    ok 'install.sh correctly absent from the tarball'
    note 'Test the shims separately from a git clone:'
    note '  git clone https://github.com/jasonrundell/back-to-you.git'
    note '  cd back-to-you && ./install.sh'
    note '  env PATH=/usr/bin:/bin ./install.sh    # expect the Node-required message'
    note '  double-click install.command in Finder'
fi

# --- report ----------------------------------------------------------------

hdr '--------------------------------------------------------------'
printf 'automated: %d passed, %d failed\n' "$pass" "$fail"
printf '\nStill needs your ears and your judgement:\n'
printf '  [ ] The clips were audible, and task-complete/decision-needed differed\n'
printf '  [ ] The gigatron switch was audible without restarting Claude Code\n'
printf '  [ ] After restarting Claude Code, real turns produce clips\n'
printf '  [ ] A permission prompt produces the decision clip\n'
printf '  [ ] A subagent finishing is silent - one clip per turn, not two\n'
printf '  [ ] The shims and install.command work from a clone\n'
printf '\nSandbox left at %s for inspection - rm -rf it when done.\n' "$SB"
printf 'Your real ~/.claude was never touched.\n'

[ "$fail" -eq 0 ] || exit 1
