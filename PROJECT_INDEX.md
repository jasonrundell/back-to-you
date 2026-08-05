# Project Index

## Overview

This project installs voice sound notifications for Claude Code and Cowork on **Windows and macOS**. It copies hook scripts and sound assets into the user's Claude directory, then adds Claude hook entries to that directory's `settings.json`.

Each platform has its own installer and its own pair of hook scripts — `install.bat` with PowerShell on Windows, `install.sh` with POSIX `sh` on macOS. They mirror each other step for step and produce identical results; where they differ, the difference is documented and deliberate.

The shipped `claude` theme is 15 voice-over MP3 clips generated in ElevenLabs from a persona written to sound like the embodiment of Claude Code — calm, precise, understated. `ELEVENLABS-VOICE-PROMPT.md` holds the voice design prompt, generation settings, and the script for every line, so the pack can be regenerated or re-voiced without redesigning it.

## Feature Capabilities

- Plays randomized clips for task completion and decision-needed events.
- Supports Claude Code and Cowork through Claude `Stop` and `Notification` hooks.
- Detects question-like assistant messages in the `Stop` hook payload and plays a decision-needed clip instead of the task-complete clip.
- Supports arbitrary user-supplied themes: any folder under `sounds/` is installed, and the active one is named in `%USERPROFILE%\.claude\sound-theme.txt`.
- Waits for each clip's real duration instead of a fixed delay, so short clips do not stall the hook.
- Accepts both `.mp3` and `.wav` in any theme folder.
- Merges hook entries into existing Claude settings instead of replacing unrelated hooks.

## Supported Platforms

- **Windows: Supported.** `install.bat` plus PowerShell hook scripts using the .NET `PresentationCore` media APIs.
- **macOS: Supported.** `install.sh` plus POSIX `sh` hook scripts using `afplay`. Depends on nothing beyond a stock macOS — no Homebrew, no `jq`, no `python3`.
- Linux: Not supported. The macOS shell scripts are close to portable, but audio playback would need `paplay`, `aplay`, or `mpg123` instead of `afplay`, and the settings merge would need a replacement for `osascript`.

### Why macOS avoids `python3` and `jq`

Neither ships with macOS. `python3` comes with the **Command Line Tools**, not the operating system, so on a Mac that has never had Xcode installed `/usr/bin/python3` is a trampoline that pops a GUI dialog prompting for a developer-tools install. That fails for precisely the non-technical users this project targets while working perfectly on every developer's machine — the worst kind of bug to ship. `jq` is never present at all.

The settings merge therefore runs through `osascript -l JavaScript` (JXA), which is stock. See `tools/merge-settings.js` for why it is preferred over `plutil`.

## Repository Structure

```text
.
├── README.md
├── PROJECT_INDEX.md
├── ELEVENLABS-VOICE-PROMPT.md  # persona prompt + per-clip script
├── .gitattributes              # .bat/.ps1 -> CRLF, .sh/.command/.js -> LF, audio binary
├── install.bat                 # Windows installer, optional theme name
├── install.sh                  # macOS installer, optional theme name
├── install.command             # Finder wrapper around install.sh
├── assets/
│   ├── banner-light.svg        # README hero, light theme
│   ├── banner-dark.svg         # README hero, dark theme
│   └── README-fragment.md      # the <picture> block and its rationale
├── hooks/
│   ├── play-sound.ps1              # Windows Stop
│   ├── play-category.ps1           # Windows, all fixed-category events
│   ├── play-sound.sh               # macOS Stop
│   └── play-category.sh            # macOS, all fixed-category events
├── tools/
│   ├── merge-settings.ps1      # Windows settings merge, run by install.bat
│   └── merge-settings.js       # macOS JXA settings merge, run by install.sh
├── sounds/
│   └── claude/                 # 15 voice-over MP3s, 14 of them wired
│       ├── task-complete/          # 5
│       ├── decision-needed/        # 4
│       ├── error/                  # 3
│       ├── subagent-done/          # 2
│       └── session-start/          # 1, unwired - nothing reads this folder
└── tests/
    ├── Test-TaskCompleteRandomness.ps1  # Windows clip distribution
    ├── test-clip-selection.sh           # shell clip distribution
    ├── test-classification.sh           # Stop hook question detection
    └── test-merge-settings.js           # macOS settings merge (needs node)
```

## Runtime Flow

Both installers follow the same sequence. `$CLAUDE` below is `%USERPROFILE%\.claude` on Windows and `~/.claude` on macOS.

1. The user runs `install.bat` (Windows) or `install.sh` / `install.command` (macOS), optionally passing a theme name. Without one, and when run interactively, the installer lists the packs found under `sounds/` and prompts for a choice (default `claude`); non-interactive runs (e.g. piped) default straight to `claude`.
2. The installer verifies a matching folder exists under `sounds/` and that its `task-complete` and `decision-needed` folders are non-empty, listing the available themes if not. The macOS installer additionally checks that `afplay`, `osascript`, and `plutil` are present.
3. The installer creates the hook and sound directories under `$CLAUDE`.
4. The installer copies hook scripts from `hooks/` and the entire `sounds/` tree, so every theme present is installed. macOS then makes the hook scripts executable.
5. The installer writes the chosen theme name to `$CLAUDE/sound-theme.txt`.
6. The installer creates or updates `$CLAUDE/settings.json` with the five wired hook commands. It strips every entry pointing at this project's own scripts — current or from an older version — then writes the current plan back, so an upgrade corrects a stale path, a missing timeout, or a matcher an earlier release got wrong. Hooks belonging to the user are untouched. Both platforms back the existing file up to `settings.json.bak.<timestamp>` and validate before and after; on failure the backup is restored.
7. Claude Code or Cowork runs the configured hooks. Each script reads the theme file, then plays a random clip from `sounds/<theme>/<category>/`.

## Installed Locations

Windows installs `.ps1` hooks, macOS installs `.sh` hooks; the rest of the tree is identical.

```text
%USERPROFILE%\.claude\   (Windows)   |   ~/.claude/   (macOS)
├── hooks\
│   ├── play-sound.ps1       |  play-sound.sh
│   └── play-category.ps1        |  play-category.sh
├── settings.json
├── settings.json.bak.<timestamp>   # written before each merge, both platforms
├── sound-theme.txt        # one line naming the active theme
└── sounds\
    └── claude\
        ├── task-complete\
        ├── decision-needed\
        ├── error\
        ├── subagent-done\
        └── session-start\      # installed but unwired; no hook reads it
```

Hooks are installed at the user level, so the sounds apply to every Claude Code and Cowork session for the current Windows user.

Themes live in separate folders, so installing one never deletes sounds the user added to another. Switching themes needs no reinstall and no Claude restart, because the hook reads `sound-theme.txt` on each invocation. Both hook scripts fall back to `claude` when that file is missing or empty.

Because the installer never deletes installed themes, a `chiptune` folder left over from an earlier version stays on disk until removed by hand. This is not currently documented in `README.md`.

## File Responsibilities

### `README.md`

User-facing pitch, installation, uninstall, and theming documentation.

### `ELEVENLABS-VOICE-PROMPT.md`

The source of truth for the `claude` theme: voice design prompt, ElevenLabs model and settings, the exact line spoken by each clip, and post-export trimming and normalization notes. Update it alongside any change to the shipped audio.

### `install.bat`

Windows installer that:

- Resolves the theme argument, defaulting to `claude`, and validates that the theme folder exists and is populated.
- Creates Claude hook and sound directories.
- Copies the whole `sounds/` tree into the Claude sound folder.
- Writes the active theme to `sound-theme.txt`.
- Copies PowerShell hook scripts into the Claude hook folder.
- Creates or updates Claude `settings.json` `Stop` and `Notification` hook entries, building the JSON with `ConvertTo-Json` so Windows paths are escaped correctly.

### `install.sh`

macOS installer. Mirrors `install.bat` step for step, with two differences that matter:

- **It backs up `settings.json` before touching it**, validates with `plutil -lint` before and after the merge, and restores the backup if either check fails. It also treats "absent" and "unparseable" as distinct cases, refusing to overwrite a malformed file rather than replacing it.
- **It `chmod +x` the installed hook scripts.** Without that the hooks are a silent no-op — nothing errors, there is simply never any sound.

### `install.command`

Three-line Finder wrapper so the installer can be double-clicked. Runs `install.sh`, then waits for Return so the output is readable before the Terminal window closes. Committed mode `755`.

### `tools/merge-settings.ps1`

The Windows settings merge, run by `install.bat`. Backs up, merges the five hook entries, writes, then reads the result back and reparses it to prove the file still loads — restoring the backup if it does not.

It lives in its own file rather than inside `install.bat` because five entries, two carrying matchers, do not fit legibly into a batch one-liner continued with carets. The previous inline version handled two entries and was already near the limit of readability.

### `tools/merge-settings.js`

The macOS settings merge, run by `install.sh` via `osascript -l JavaScript`. Scans `hooks.Stop` and `hooks.Notification` for an entry already naming our scripts, appends one if absent, and writes atomically.

JXA rather than `plutil` because this is the user's own config file: `plutil` round-trips JSON through the plist type system, which has no `null`, sorts keys, and can coerce types. `JSON.parse`/`JSON.stringify` is an identity transform for everything it does not deliberately touch.

### `hooks/play-sound.ps1` and `hooks/play-sound.sh`

Claude `Stop` hook. Reads the hook payload from standard input, checks whether `last_assistant_message` ends with a question, resolves the active theme, then plays either a decision-needed or a task-complete clip.

**The question detection differs between the two, deliberately.** PowerShell's `-match` anchors `$` at the end of the whole string. `grep` anchors it at the end of *every* line, so a literal translation would play the decision-needed clip for any multi-line answer that merely contains a question — which is most of them. The shell version therefore classifies on the **last non-empty line**. `tests/test-classification.sh` is the regression guard.

### `hooks/play-category.ps1` and `hooks/play-category.sh`

Takes a category name and plays a random clip from it. Used by every wired event **except** `Stop`, which has to work out its own category first.

```
play-category.ps1 -Category decision-needed      # Notification
play-category.sh  subagent-done                  # SubagentStop
```

One parameterised script rather than one script per event: four events differ only in which folder they read, and four near-identical files per platform would be eight files to keep in step.

All four hook scripts exit quietly — and with status 0 — when the resolved folder holds no sounds. A non-zero exit surfaces a hook error in the transcript, which a missing sound file does not warrant.

### Why only Windows waits for the clip duration

The PowerShell hooks poll `NaturalDuration` before sleeping. That exists **only** because .NET's `MediaPlayer.Play()` is asynchronous — without it the script would exit before the sound finished.

`afplay` blocks until the clip ends, so the shell hooks need none of that machinery. The asymmetry is correct and should not be "fixed". Both platforms do cap playback at roughly six seconds, because a user can drop a three-minute file into a theme folder and this runs at the end of every response.

### Why the shell hooks avoid `$RANDOM`

Claude Code spawns hooks via `sh -c`, not the user's login shell. `$RANDOM` is a bashism and is unavailable under `sh`, so clip selection reads `/dev/urandom` through `od`, with an `awk` fallback. `tests/test-clip-selection.sh` samples the same path.

### `tests/Test-TaskCompleteRandomness.ps1`

Sampling harness that mirrors the hook's random selection logic and prints a markdown distribution table. It does not play audio. Defaults to the installed `%USERPROFILE%\.claude\sounds\claude\task-complete` folder; override with `-SoundDirectory` to check another theme.

## Wired Hook Events

Four sound categories are wired. `session-start` is not — see below.

| Event | Matcher | Category | Script |
| --- | --- | --- | --- |
| `Stop` | none | `task-complete` or `decision-needed` | `play-sound` |
| `Notification` | `permission_prompt\|agent_needs_input\|elicitation_dialog` | `decision-needed` | `play-category` |
| `PreToolUse` | `AskUserQuestion` | `decision-needed` | `play-category` |
| `SubagentStop` | none | `subagent-done` | `play-category` |
| `StopFailure` | none | `error` | `play-category` |

Five decisions behind that table, each verified against the hook reference:

- **`Notification` is matched to requests for input only.** Unmatched it fires on all eight notification types, including `auth_success` — a successful login announcing *"Your call."* — and `agent_completed`, which `SubagentStop` already owns, giving two clips back to back for one finished subagent. The lifecycle types `elicitation_complete` and `elicitation_response` report that a request *finished*, so they stay silent; `elicitation_dialog` is a real request and does not. `idle_prompt` is deliberately excluded: it fires on a timer rather than on a question, so it nags rather than signals.
- **`PreToolUse` on `AskUserQuestion` exists because the multiple-choice picker has no notification type of its own.** Without it, the single most decision-shaped moment in the product would be silent.

  > **This is the one hook that can break Claude Code.** `PreToolUse` can *block* the tool call: exit code 2 means "do not do this". A hook here that exits non-zero stops the question from being asked at all. Both `play-category` scripts exit 0 unconditionally, on every path including every error path, and **must stay that way**. The PowerShell version carries an explicit `exit 0` for exactly this reason — without it the process inherits whatever `$LASTEXITCODE` happened to be.


- **`SessionStart` is deliberately not wired.** It was, matched to `startup` alone so the greeting would not replay on `resume`, `clear`, `compact`, or `fork`. That was not enough. `startup` means every new **session**, not every app launch, and short-lived sessions are common: instrumenting the hook over a six-hour run caught 25 `SessionStart:startup` events — about four an hour, **69% of every sound heard**, with bursts as tight as four in 43 seconds, and 48% of them from a bare `$HOME` cwd rather than any project. Subagents are *not* the cause; none of the 25 carried an `agent_id`, and a subagent costs only its `SubagentStop` whisper. The greeting was also the least useful clip in the set — a session starting is the one moment the terminal already has your attention, which is precisely what `task-complete` and `decision-needed` exist to cover when it does not. Re-wire it in `tools/merge-settings.*` if you want it back, but note that reinstalling strips any entry pointing at our own scripts.
- **`StopFailure` does not mean "Claude's work failed".** It fires when a turn ends on an **API error** — rate limit, auth failure, server error. Still the right trigger for the `error` clips, but not what the name suggests. It also cannot block: its output and exit code are ignored, which suits a hook that only makes a noise.
- **`PostToolUseFailure` is deliberately not wired.** It fires on *every* failed tool call, including a `grep` that matches nothing and a red test run. An error sound there is a constant buzz and is the kind of thing that gets a project uninstalled on day one.

### Turning a sound off

Every hook exits quietly when its category folder is missing or empty. **Deleting the clips from a category is the supported way to disable it** — no settings edit, no reinstall, and it survives upgrades since the installer never deletes themes. Removing the hook entry from `settings.json` also works and is what a user should do to reclaim the latency of the `Stop` hook entirely.

## Maintenance Notes

- **Change both platforms together.** Every hook-behaviour or install-step change now has a Windows half and a macOS half. Shipping one without the other is the most likely way this project breaks.
- Keep `README.md` and this index in sync when hook behavior, install steps, themes, or supported platforms change.
- Adding a sound for a new hook event is now a **one-line change per platform**: append an entry to the `$plan` array in `tools/merge-settings.ps1` and the `hookPlan()` list in `tools/merge-settings.js`. No new script is needed unless the event has to choose its own category the way `Stop` does. `tests/test-merge-settings.js` covers the macOS side.
- **`tools/merge-settings.ps1` must end with `exit 0`.** Without an explicit exit the process inherits whatever `$LASTEXITCODE` happened to be, and `install.bat`'s `if errorlevel 1` check aborts a perfectly successful install. This has already bitten once.
- The `Notification` hook supports a matcher on notification type, so decision-needed clips can be split further. It is currently wired **unmatched**, which means it also fires on `auth_success` and `agent_completed`.
- Keep `task-complete` clips short. The `Stop` hook blocks for the clip's real duration on every response, so long clips are felt as latency. Voice is inherently longer than the bleeps this project used to ship — roughly 1.5 seconds is the practical ceiling.
- Keep `install.bat` ASCII-only. `cmd` mis-parses `::` comment lines containing non-ASCII characters when the file has LF endings.
- **Never let the shell scripts acquire CRLF endings.** `.gitattributes` pins `.bat`/`.ps1` to CRLF and `.sh`/`.command`/`.js` to LF. A CRLF shebang makes `sh` fail with `bad interpreter: /bin/sh^M`, which is a baffling error to hand a user. Check the staged blob, not just the working copy: `git cat-file -p ":install.sh" | tr -cd '\r' | wc -c` must print 0.
- **The shell scripts must keep their executable bit in git** (`100755`). Verify with `git ls-files -s`. Without it, a fresh clone cannot run `./install.sh` and `install.command` will not launch from Finder.
- Write the macOS hook scripts to POSIX `sh`, not bash. Claude Code spawns hooks via `sh -c`, so `[[ ]]`, arrays, `$RANDOM`, and `<<<` are unavailable regardless of the user's login shell.
- Validate Windows changes on Windows and macOS changes on a Mac. `sh -n` catches syntax errors from either platform, and `tests/test-classification.sh` runs anywhere, but neither substitutes for running the real installer.
