# Project Index

## Overview

This project installs voice sound notifications for Claude Code and Cowork on **Windows, macOS, and Linux**. It ships as an npm package (`backtoyou`) run via `npx backtoyou`: a Node CLI copies hook scripts and sound packs into `~/.claude`, then merges Claude hook entries into `~/.claude/settings.json`.

There is exactly one installer implementation, `bin/cli.js` plus `src/`. `install.sh` and `install.bat` are three-line shims that `exec`/call it from a clone or an unzipped release — see [`docs/adr/0001-node-as-a-hard-requirement.md`](docs/adr/0001-node-as-a-hard-requirement.md) for why Node became a hard requirement and the old dual-implementation shell installers were retired.

The hook *scripts* still split by platform: Node (`hooks/*.js`) on macOS and Linux, PowerShell (`hooks/*.ps1`) on Windows. That split survives the Node consolidation because Windows plays audio through `System.Windows.Media.MediaPlayer`, a WPF assembly Node cannot reach — see the same ADR.

Each shipped voice pack is 3 voice-over MP3 clips generated in ElevenLabs — one each for `task-complete`, `decision-needed`, and `error`. `ELEVENLABS-VOICE-PROMPT.md` and each pack's `elevenlabs-prompt.md` hold the voice design prompt and generation notes so a pack can be regenerated or re-voiced.

## Feature Capabilities

- Plays a random clip from the active pack for task completion, decision-needed, and error events.
- Supports Claude Code and Cowork through Claude `Stop`, `Notification`, `PreToolUse`, and `StopFailure` hooks.
- Detects question-like assistant messages in the `Stop` hook payload and plays the decision-needed clip instead of task-complete.
- Ships four voice packs (`claude`, `gigatron`, `jay-run`, `mistress-of-pain`) and supports arbitrary user-supplied packs dropped into `~/.claude/sounds/`; the active one is named in `~/.claude/sound-theme.txt`.
- Switching packs rewrites one line in `sound-theme.txt` — no reinstall, no restart.
- Waits for each clip's real duration instead of a fixed delay (Windows), or blocks natively on the player (Unix), so short clips do not stall the hook, capped at 6 seconds.
- Accepts both `.mp3` and `.wav` in any pack folder.
- Rewrites (not merges) its own hook entries into existing Claude settings on every install, so an upgrade corrects a stale path or a wrong matcher, while leaving the user's other hooks untouched.
- Ships a CLI uninstaller (`npx backtoyou --uninstall`) that removes exactly what this package installed and nothing the user added.

## Supported Platforms

- **Windows 10/11: Supported.** PowerShell hook scripts using the .NET `PresentationCore` / `System.Windows.Media.MediaPlayer` APIs.
- **macOS: Supported.** Node hook scripts using `afplay`, which ships with the OS.
- **Linux: Supported.** Node hook scripts probe `pw-play`, `paplay`, `mpg123`, `play`, or `aplay`, in that order, and use the first one found. See the probe-order and format-gate notes in `hooks/play-lib.js`.

All three platforms require **Node.js ≥ 18** — both to run the installer and, on macOS/Linux, at hook runtime. This is a deliberate hard requirement (`docs/adr/0001`), not an oversight; there is no dependency-free fallback path anymore.

## Repository Structure

```text
.
├── README.md
├── PROJECT_INDEX.md
├── CLAUDE.md
├── ELEVENLABS-VOICE-PROMPT.md   # persona prompt + per-clip script, MIT
├── LICENSE                      # code: MIT
├── LICENSE-AUDIO                # sounds/: non-commercial, ElevenLabs terms
├── NOTICE
├── package.json                 # bin: backtoyou -> bin/cli.js
├── .gitattributes                # .bat/.ps1 -> CRLF, .sh/.command/.js -> LF, audio binary
├── .github/workflows/release.yml # npm publish via OIDC trusted publishing, on GitHub Release
├── install.bat                  # Windows shim, execs bin/cli.js
├── install.sh                   # macOS/Linux shim, execs bin/cli.js
├── install.command              # Finder double-click wrapper around install.sh
├── bin/
│   └── cli.js                   # the actual installer/uninstaller CLI entry point
├── src/
│   ├── paths.js                 # ~/.claude layout, per-platform hook facts, legacy-clip list
│   ├── plan.js                  # pure decision logic: which pack, fresh/upgrade/switch/same
│   ├── settings.js               # settings.json read/merge/write, hook-entry ownership
│   ├── install.js                # all install-time disk effects
│   └── uninstall.js              # all uninstall-time disk effects
├── assets/
│   ├── banner-light.svg / banner-dark.svg  # README hero
│   ├── demo.svg
│   └── README-fragment.md
├── docs/
│   ├── adr/
│   │   └── 0001-node-as-a-hard-requirement.md
│   └── agents/
│       ├── domain.md            # how agent skills should read this repo's domain docs
│       └── issue-tracker.md     # issues live in GitHub Issues, via `gh`
├── hooks/
│   ├── play-lib.js              # shared by both Node hooks: player probe chain, clip picking
│   ├── play-sound.js            # Unix Stop hook
│   ├── play-category.js         # Unix, all fixed-category events
│   ├── play-sound.ps1           # Windows Stop hook
│   └── play-category.ps1        # Windows, all fixed-category events
├── sounds/
│   ├── claude/                  # default pack
│   ├── gigatron/
│   ├── jay-run/
│   ├── mistress-of-pain/
│   └── <pack>/
│       ├── elevenlabs-prompt.md
│       ├── task-complete/       # 1 clip
│       ├── decision-needed/     # 1 clip
│       └── error/               # 1 clip
└── tests/
    ├── installer.test.js            # node:assert suite for src/ and hooks/play-lib.js logic
    ├── Test-TaskCompleteRandomness.ps1  # Windows clip-distribution sampling harness
    └── verify-macos.sh              # manual macOS tarball verification harness (not shipped)
```

`session-start/` and `subagent-done/` pack folders and their hook wiring are retired as of 1.3.0 — see "Wired Hook Events" below.

## Runtime Flow

`$CLAUDE` below is `%USERPROFILE%\.claude` on Windows and `~/.claude` on macOS/Linux.

1. The user runs `npx backtoyou [pack]`, or `install.sh` / `install.bat` / `install.command`, which shim straight into `bin/cli.js`. With no pack argument and a real terminal, the CLI lists every pack found in the package plus any already under `$CLAUDE/sounds/` and prompts for a choice (default: the active pack if installed, else `claude`). A non-interactive run (piped, CI) keeps the active pack on a re-run, or installs `claude` on a fresh one.
2. `src/plan.js` classifies the run as `fresh`, `upgrade`, `switch`, or `same` by comparing the requested pack and this package's version against `$CLAUDE/.backtoyou-version` and `sound-theme.txt`. Only `fresh` and `upgrade` take the full install path.
3. `src/install.js#checkPack` verifies the chosen pack exists and its `task-complete` and `decision-needed` folders are non-empty.
4. **Full install** (`fresh`/`upgrade`): `runFullInstall` creates `$CLAUDE/hooks` and `$CLAUDE/sounds`, copies every pack from the package into `$CLAUDE/sounds` (so a user's custom pack is never touched), copies this platform's hook scripts, removes any clips a retired category used to ship, backs up `settings.json` to `settings.json.bak.<timestamp>`, and rewrites the four hook entries via `src/settings.js#mergeSettings` — stripping every entry this project has ever owned first, so an upgrade corrects a stale path or matcher rather than leaving it. On failure the backup is restored.
5. **Switch** (`switch`): only `sound-theme.txt` is rewritten. No files are copied, no restart is needed — the hooks read the theme file on every fire.
6. **Same**: no-op.
7. Claude Code or Cowork runs the configured hooks. Each hook reads the theme file, then plays a random clip from `$CLAUDE/sounds/<theme>/<category>/`.

Uninstalling (`npx backtoyou --uninstall`) is the mirror image, in `src/uninstall.js`: it removes every hook script and state file this project has ever installed, deletes only the exact clip files this package ships (by relative path, so a user's own take or pack survives), backs up and unwires `settings.json`, and reports what it kept.

## Installed Locations

Windows installs `.ps1` hooks, macOS/Linux install `.js` hooks; the rest of the tree is identical.

```text
%USERPROFILE%\.claude\   (Windows)   |   ~/.claude/   (macOS/Linux)
├── hooks\
│   ├── play-sound.ps1       |  play-sound.js
│   ├── play-category.ps1    |  play-category.js
│   └──                      |  play-lib.js        (Unix only, required, never invoked directly)
├── settings.json
├── settings.json.bak.<timestamp>      # written before each merge, both platforms
├── sound-theme.txt                    # one line naming the active pack
├── .backtoyou-version                 # the installed package version
├── .backtoyou-playback-error          # written only when a hook fails to find a working player
└── sounds\
    ├── claude\
    ├── gigatron\
    ├── jay-run\
    ├── mistress-of-pain\
    └── <any custom pack>\
        ├── task-complete\
        ├── decision-needed\
        └── error\
```

Hooks are installed at the user level, so the sounds apply to every Claude Code and Cowork session for the current user. Packs live in separate folders, so installing or switching never deletes a pack the user added, and the installer never deletes a pack it did not ship.

## File Responsibilities

### `README.md`

User-facing pitch, installation, uninstall, platform support, and theming documentation.

### `ELEVENLABS-VOICE-PROMPT.md` / `sounds/<pack>/elevenlabs-prompt.md`

Source of truth for each pack's voice: design prompt, ElevenLabs model and settings, and the exact line spoken by each clip. Prompts must stay **500 characters or fewer** — see `CLAUDE.md`.

### `bin/cli.js`

The installer/uninstaller entry point (`npx backtoyou`). Parses `--help`, `--version`, `--uninstall`, `--yes`, and an optional pack-name argument; runs the interactive picker when appropriate; and calls into `src/plan.js`, `src/install.js`, and `src/uninstall.js` to do the actual work. Zero runtime dependencies, deliberately — `install.sh`/`install.bat` exec this file directly from a clone with no `npm install` first.

### `src/paths.js`

Where everything lives under `~/.claude`, and the per-platform `hookFacts()` (which script names, which support files, how `settings.json` invokes them). Also holds `LEGACY_CLIPS`, the list of clip paths a retired category used to ship, so upgrading removes them.

### `src/plan.js`

Pure decision logic, no I/O: classifies a run as `fresh`/`upgrade`/`switch`/`same`, resolves which pack a run should activate (argument, interactive pick, or non-interactive default), and decides what a run should actually do (`planEffects`).

### `src/settings.js`

Reads, merges, and atomically writes `~/.claude/settings.json`. `mergeSettings` strips every hook entry this project has ever owned (`OWNED_SCRIPTS`, covering current and retired script names on both platforms) and writes the current four-event plan back — a rewrite, not a merge, so an upgrade can fix a wrong matcher or timeout. Handles a UTF-8 BOM (written by PowerShell 5.1) by stripping it to parse and restoring it on write.

### `src/install.js`

All install-time disk effects: enumerating available packs, checking a pack is usable, copying packs and hooks, backing up and merging settings, writing the theme file, and removing legacy clips.

### `src/uninstall.js`

All uninstall-time disk effects, matching `src/install.js` file-for-file so the two never drift. Deletes only exact relative clip paths this package ships (plus `LEGACY_CLIPS`), so a user's own pack or an added take inside a shipped pack's folder always survives.

### `install.sh` / `install.bat` / `install.command`

Three-line shims. `install.sh`/`install.bat` verify `node` is on `PATH` and `exec`/call `bin/cli.js "$@"`. `install.command` is a Finder double-click wrapper that runs `install.sh` and waits for Return so the output is readable before the window closes. Committed mode `755`.

### `hooks/play-lib.js`

Shared by both Unix hooks: the player probe chain (`afplay` on macOS; `pw-play`, `paplay`, `mpg123`, `play`, `aplay` in order on Linux, with format gates because `aplay` on an mp3 plays static and `mpg123` cannot play wav), active-theme reading, random clip picking, blocking playback with a 6-second watchdog, and writing `.backtoyou-playback-error` on failure so a broken install is diagnosable rather than silently mute.

### `hooks/play-sound.js` and `hooks/play-sound.ps1`

Claude `Stop` hook. Reads the hook payload from stdin, classifies `task-complete` vs `decision-needed` by whether the last assistant message ends in a question, then plays the matching category. Both implementations must classify identically; each is covered by `tests/installer.test.js`'s classification tests.

### `hooks/play-category.js` and `hooks/play-category.ps1`

Takes a category name and plays a random clip from it. Used by every wired event except `Stop`. **This is the hook wired to `PreToolUse`**, where a non-zero exit blocks the tool call — every code path must exit 0.

### `tests/installer.test.js`

The test suite (`npm test` / `node tests/installer.test.js`), using bare `node:assert` — no framework, matching the package's zero-dependency policy. Covers `src/plan.js`, `src/settings.js` (merge/unwire semantics, BOM handling, ownership of legacy script names), `src/install.js`/`src/uninstall.js` (full install/uninstall round trips, legacy-clip cleanup, survivor detection), and the `hooks/play-sound.js` classifier and `hooks/play-lib.js` player-gating logic.

### `tests/Test-TaskCompleteRandomness.ps1`

Sampling harness that mirrors the Windows hook's random selection logic and prints a markdown distribution table. Does not play audio. Defaults to the installed `%USERPROFILE%\.claude\sounds\claude\task-complete` folder.

### `tests/verify-macos.sh`

Manual verification harness for a packed tarball (`npm pack`), run against a sandboxed `$HOME`. Not shipped — `tests/` is excluded from the npm package.

### `.github/workflows/release.yml`

Publishes to npm on a published GitHub Release, via OIDC trusted publishing (no `NPM_TOKEN`). Also attaches a download zip. `workflow_dispatch` supports a dry run. The trusted-publisher config on npmjs.com names this exact filename — renaming it breaks publishing until the npm-side setting is updated.

## Wired Hook Events

Four events are wired. `SessionStart` and `SubagentStop` are deliberately not.

| Event | Matcher | Category | Script |
| --- | --- | --- | --- |
| `Stop` | none | `task-complete` or `decision-needed` | `play-sound` |
| `Notification` | `permission_prompt\|agent_needs_input\|elicitation_dialog` | `decision-needed` | `play-category` |
| `PreToolUse` | `AskUserQuestion` | `decision-needed` | `play-category` |
| `StopFailure` | none | `error` | `play-category` |

- **`Notification` is matched to requests for input only.** Unmatched it also fires on `auth_success` and `agent_completed` (a subagent announcing itself).
- **`PreToolUse` on `AskUserQuestion`** covers the multiple-choice picker, which has no notification type of its own.

  > **This is the one hook that can break Claude Code.** `PreToolUse` can *block* the tool call: exit code 2 means "do not do this". Both `play-category` scripts exit 0 unconditionally, on every path, and **must stay that way**.

- **`SessionStart` is deliberately not wired.** Measured over a six-hour run, `SessionStart:startup` fired ~4x an hour and accounted for 69% of every sound heard — short-lived sessions are common, and a session starting is the one moment the terminal already has the user's attention.
- **`SubagentStop` is deliberately not wired, and `subagent-done` is retired**, as of 1.3.0. It used to play once per subagent, with `Stop` suppressing its own clip when it followed within five seconds — the suppression worked, but a subagent finishing isn't a moment that wants the user back, and a turn that fanned out to several subagents announced every one. `src/paths.js#LEGACY_CLIPS` and the retired `.subagent-done-at` marker exist so upgrading cleans up an older install.
- **`StopFailure` fires on an API error** (rate limit, auth failure, server error), not on Claude's work failing. It cannot block: its output and exit code are ignored.
- **`PostToolUseFailure` is deliberately not wired.** It fires on every failed tool call, including a `grep` that matches nothing, and would be a constant buzz.

### Turning a sound off

Deleting the clips from a category folder is the supported way to disable it — every hook exits quietly on an empty or missing folder. Removing the hook entry from `settings.json` also works, and is how a user reclaims the `Stop` hook's latency entirely.

## Maintenance Notes

- **There is one installer implementation now.** Change `src/` and `bin/cli.js`; `install.sh`/`install.bat` need touching only if the shim contract itself changes.
- **Change both hook platforms together.** Every hook-behavior change has a Node half (`hooks/*.js`) and a PowerShell half (`hooks/*.ps1`). `tests/installer.test.js` only exercises the Node side directly — verify the PowerShell side by hand or via `tests/Test-TaskCompleteRandomness.ps1`.
- Keep `README.md` and this index in sync when hook behavior, install steps, packs, or supported platforms change.
- Adding a sound for a new hook event is a change to `hookPlan()` in `src/settings.js` — one array entry, both platforms picked up automatically since `hookFacts()` in `src/paths.js` already resolves the per-platform script and invocation. `tests/installer.test.js` covers the merge semantics.
- **`hooks/play-category.*` must exit 0 on every path**, including every error path — it is wired to `PreToolUse`, which can block a tool call on a non-zero exit.
- Keep `task-complete` clips short. The `Stop` hook blocks for the clip's real duration on every response; roughly 1.5 seconds is the practical ceiling.
- **Never let the Unix shims or hook scripts acquire CRLF endings**, and never let `.bat`/`.ps1` files lose theirs. `.gitattributes` pins `.bat`/`.ps1` to CRLF and `.sh`/`.command`/`.js` to LF. Check the staged blob, not just the working copy: `git cat-file -p ":install.sh" | tr -cd '\r' | wc -c` must print 0.
- **The shell scripts must keep their executable bit in git** (`100755`): `install.sh`, `install.command`. Verify with `git ls-files -s`.
- **Zero runtime dependencies is binding**, not a preference — see `docs/adr/0001`. `node bin/cli.js` must run straight from a clone or unzipped folder with no `npm install` first.
- ElevenLabs Voice Design prompts must stay **500 characters or fewer** — check with `wc -c` before finalizing (see `CLAUDE.md`).
