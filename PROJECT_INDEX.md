# Project Index

## Overview

This project installs chiptune sound notifications for Claude Code and Cowork on Windows. It copies PowerShell hook scripts and sound assets into `%USERPROFILE%\.claude`, then adds Claude hook entries to `%USERPROFILE%\.claude\settings.json`.

The shipped `chiptune` theme is 16 synthesized 8-bit WAV files produced by `tools/New-ChiptuneSounds.ps1` from a note manifest. The WAVs are committed so they can be previewed and installed without running the generator, but they are build output: edit the manifest and regenerate rather than editing the audio.

## Feature Capabilities

- Plays randomized sounds for task completion and decision-needed events.
- Supports Claude Code and Cowork through Claude `Stop` and `Notification` hooks.
- Detects question-like assistant messages in the `Stop` hook payload and plays a decision-needed sound instead of the task-complete sound.
- Synthesizes its sounds from code (square-wave oscillator, decay envelope, pitch sweep) so they are editable as text.
- Supports arbitrary user-supplied themes: any folder under `sounds/` is installed, and the active one is named in `%USERPROFILE%\.claude\sound-theme.txt`.
- Waits for each sound's real duration instead of a fixed delay, so short sounds do not stall the hook.
- Accepts both `.mp3` and `.wav` in any theme folder.
- Merges hook entries into existing Claude settings instead of replacing unrelated hooks.

## Supported Platforms

- Windows: Supported. The installer is a batch script and the hook scripts use PowerShell plus the .NET `PresentationCore` media APIs.
- macOS: Not supported by the current scripts. A macOS implementation would need shell scripts, an audio playback command such as `afplay`, and platform-specific Claude settings instructions.
- Linux: Not supported by the current scripts. A Linux implementation would need shell scripts, an audio playback command such as `paplay`, `aplay`, or `mpg123`, and platform-specific Claude settings instructions.

## Repository Structure

```text
.
├── README.txt
├── PROJECT_INDEX.md
├── .gitattributes         # pins .bat/.ps1 to CRLF, marks audio binary
├── install.bat            # installer, takes an optional theme name
├── hooks/
│   ├── play-sound.ps1
│   └── play-sound-decision.ps1
├── sounds/
│   └── chiptune/          # 16 generated WAVs, see tools/
│       ├── task-complete/     # 5
│       ├── decision-needed/   # 4
│       ├── error/             # 3
│       ├── subagent-done/     # 2
│       └── session-start/     # 2
├── tools/
│   └── New-ChiptuneSounds.ps1 # synthesizes the chiptune theme
└── tests/
    └── Test-TaskCompleteRandomness.ps1
```

## Runtime Flow

1. The user runs `install.bat`, optionally passing a theme name (default `chiptune`).
2. The installer verifies a matching folder exists under `sounds/` and that its `task-complete` and `decision-needed` folders are non-empty, listing the available themes if not.
3. The installer creates the hook and sound directories under `%USERPROFILE%\.claude`.
4. The installer copies hook scripts from `hooks/` and the entire `sounds/` tree, so every theme present is installed.
5. The installer writes the chosen theme name to `%USERPROFILE%\.claude\sound-theme.txt`.
6. The installer creates or updates `%USERPROFILE%\.claude\settings.json` with `Stop` and `Notification` hook commands.
7. Claude Code or Cowork runs the configured hooks. Each script reads the theme file, then plays a random sound from `sounds\<theme>\<category>\`.

## Installed Locations

```text
%USERPROFILE%\.claude\
├── hooks\
│   ├── play-sound.ps1
│   └── play-sound-decision.ps1
├── settings.json
├── sound-theme.txt        # one line naming the active theme
└── sounds\
    └── chiptune\
        ├── task-complete\
        ├── decision-needed\
        ├── error\
        ├── subagent-done\
        └── session-start\
```

Hooks are installed at the user level, so the sounds apply to every Claude Code and Cowork session for the current Windows user.

Themes live in separate folders, so installing one never deletes sounds the user added to another. Switching themes needs no reinstall and no Claude restart, because the hook reads `sound-theme.txt` on each invocation. Both hook scripts fall back to `chiptune` when that file is missing or empty.

## File Responsibilities

### `README.txt`

User-facing installation, uninstall, theming, and sound-editing documentation.

### `install.bat`

Windows installer that:

- Resolves the theme argument, defaulting to `chiptune`, and validates that the theme folder exists and is populated.
- Creates Claude hook and sound directories.
- Copies the whole `sounds/` tree into the Claude sound folder.
- Writes the active theme to `sound-theme.txt`.
- Copies PowerShell hook scripts into the Claude hook folder.
- Creates or updates Claude `settings.json` `Stop` and `Notification` hook entries, building the JSON with `ConvertTo-Json` so Windows paths are escaped correctly.

### `hooks/play-sound.ps1`

Claude `Stop` hook script. It reads hook input from standard input, checks whether `last_assistant_message` appears to end with a question, resolves the active theme, then plays either a decision-needed sound or a task-complete sound.

### `hooks/play-sound-decision.ps1`

Claude `Notification` hook script. It resolves the active theme and plays a random decision-needed sound.

Both hook scripts exit quietly when the resolved folder holds no sounds, and wait for the sound's real duration rather than a fixed delay.

### `tools/New-ChiptuneSounds.ps1`

Synthesizes the chiptune theme into `-OutputRoot` as 8-bit mono 22.05 kHz WAV files. Contains three parts:

- A synth: note-name to frequency conversion, a square-wave oscillator with adjustable duty cycle, a linear decay envelope, and a phase accumulator so pitch sweeps stay continuous.
- A WAV writer that emits the 44-byte canonical header plus PCM data.
- A manifest of note sequences, one entry per sound, grouped by category. This is the part to edit to change how the pack sounds.

Sound shape carries the meaning: rising phrases that resolve to the tonic read as "done", phrases left unresolved read as a question, and descending minor seconds with a narrow duty cycle read as an error.

### `tests/Test-TaskCompleteRandomness.ps1`

Sampling harness that mirrors the hook's random selection logic and prints a markdown distribution table. It does not play audio. Defaults to the installed `%USERPROFILE%\.claude\sounds\chiptune\task-complete` folder; override with `-SoundDirectory` to check another theme.

## Hook Commands

The installer writes commands equivalent to:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\.claude\hooks\play-sound.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\.claude\hooks\play-sound-decision.ps1"
```

## Unwired Sound Categories

`tools/New-ChiptuneSounds.ps1` generates `error`, `subagent-done`, and `session-start` sounds that nothing currently plays, because the installer only wires the `Stop` and `Notification` hooks. They exist so the matching hook events can be added without designing new sounds first:

| Category | Intended hook event |
| --- | --- |
| `error` | `StopFailure`, `PostToolUseFailure` |
| `subagent-done` | `SubagentStop` |
| `session-start` | `SessionStart` |

## Maintenance Notes

- Keep `README.txt` and this index in sync when hook behavior, install steps, themes, or supported platforms change.
- Claude Code supports many more hook events than `Stop` and `Notification` (for example `StopFailure`, `PostToolUseFailure`, `PermissionRequest`, `SubagentStop`, `SessionStart`). Adding a sound for a new event means adding a hook script under `hooks/`, copying it in `install.bat`, and adding a matching merge block to the `settings.json` PowerShell step.
- The `Notification` hook supports a matcher on notification type, so decision-needed sounds can be split further if needed.
- The chiptune manifest is the source of truth for that theme. After editing it, regenerate into `sounds/chiptune/` and commit the resulting WAVs so the checked-in audio never drifts from the manifest.
- Keep `install.bat` ASCII-only. `cmd` mis-parses `::` comment lines containing non-ASCII characters when the file has LF endings; `.gitattributes` pins `.bat` and `.ps1` to CRLF to prevent that.
- Validate installer changes on a Windows machine because the project depends on Windows batch syntax, PowerShell, `%USERPROFILE%` paths, and Claude settings.
