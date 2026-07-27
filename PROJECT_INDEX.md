# Project Index

## Overview

This project installs sound notifications for Claude Code and Cowork on Windows. It copies PowerShell hook scripts and sound assets into `%USERPROFILE%\.claude`, then adds Claude hook entries to `%USERPROFILE%\.claude\settings.json`.

Two sound themes ship. `starcraft` is a set of MP3 voice clips. `chiptune` is 16 synthesized 8-bit WAV files produced by `tools/New-ChiptuneSounds.ps1` from a note manifest. The WAVs are committed so they can be previewed and installed without running the generator, but they are build output: edit the manifest and regenerate rather than editing the audio.

## Feature Capabilities

- Plays randomized sounds for task completion and decision-needed events.
- Supports Claude Code and Cowork through Claude `Stop` and `Notification` hooks.
- Detects question-like assistant messages in the `Stop` hook payload and plays a decision-needed sound instead of the task-complete sound.
- Ships two themes and installs both, with the active one selected by `%USERPROFILE%\.claude\sound-theme.txt`.
- Synthesizes the chiptune pack from code (square-wave oscillator, decay envelope, pitch sweep) so its sounds are editable as text.
- Waits for each sound's real duration instead of a fixed delay, so short sounds do not stall the hook.
- Accepts both `.mp3` and `.wav` in any theme folder.
- Merges hook entries into existing Claude settings instead of replacing unrelated hooks.
- Fails installation with a clear error when required MP3 assets are missing.

## Supported Platforms

- Windows: Supported. The installer is a batch script and the hook scripts use PowerShell plus the .NET `PresentationCore` media APIs.
- macOS: Not supported by the current scripts. A macOS implementation would need shell scripts, an audio playback command such as `afplay`, and platform-specific Claude settings instructions.
- Linux: Not supported by the current scripts. A Linux implementation would need shell scripts, an audio playback command such as `paplay`, `aplay`, or `mpg123`, and platform-specific Claude settings instructions.

## Repository Structure

```text
.
├── README.txt
├── PROJECT_INDEX.md
├── install.bat            # Claude Code / Cowork installer, takes an optional theme
├── hooks/
│   ├── play-sound.ps1
│   └── play-sound-decision.ps1
├── sounds/
│   ├── starcraft/
│   │   ├── task-complete/     # ~67 MP3 clips
│   │   └── decision-needed/   # ~40 MP3 clips
│   └── chiptune/              # 16 generated WAVs, see tools/
│       ├── task-complete/
│       ├── decision-needed/
│       ├── error/
│       ├── subagent-done/
│       └── session-start/
├── tools/
│   └── New-ChiptuneSounds.ps1 # synthesizes the chiptune theme
└── tests/
    └── Test-TaskCompleteRandomness.ps1
```

## Runtime Flow

1. The user runs `install.bat`, optionally passing `starcraft` (default) or `chiptune`.
2. The installer validates the theme argument, verifies both `sounds/starcraft/` folders contain MP3 files and that the chiptune WAVs are present, and aborts with an error otherwise.
3. The installer creates the hook and sound directories under `%USERPROFILE%\.claude`.
4. The installer copies hook scripts from `hooks/` and both sound themes into the Claude folders.
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
├── sound-theme.txt        # one line: "starcraft" or "chiptune"
└── sounds\
    ├── starcraft\
    │   ├── task-complete\
    │   └── decision-needed\
    └── chiptune\
        ├── task-complete\
        ├── decision-needed\
        ├── error\
        ├── subagent-done\
        └── session-start\
```

Hooks are installed at the user level, so the sounds apply to every Claude Code and Cowork session for the current Windows user.

Both themes are installed on every run; only the one named in `sound-theme.txt` plays. Switching themes needs no reinstall and no Claude restart, because the hook reads that file on each invocation. Themes live in separate folders so installing one never deletes sounds the user added to another.

## File Responsibilities

### `README.txt`

User-facing installation, uninstall, and sound documentation.

### `install.bat`

Windows installer that:

- Validates the optional theme argument (`starcraft` or `chiptune`).
- Verifies the local MP3 and WAV assets are present.
- Creates Claude hook and sound directories.
- Copies both sound themes into the Claude sound folders.
- Writes the active theme to `sound-theme.txt`.
- Copies PowerShell hook scripts into the Claude hook folder.
- Creates or updates Claude `settings.json` `Stop` and `Notification` hook entries.

### `hooks/play-sound.ps1`

Claude `Stop` hook script. It reads hook input from standard input, checks whether `last_assistant_message` appears to end with a question, resolves the active theme, then plays either a decision-needed sound or a task-complete sound.

### `hooks/play-sound-decision.ps1`

Claude `Notification` hook script. It resolves the active theme and plays a random decision-needed sound.

Both hook scripts fall back to the `starcraft` theme when `sound-theme.txt` is missing or empty, and exit quietly when the resolved folder holds no sounds.

### `tools/New-ChiptuneSounds.ps1`

Synthesizes the chiptune theme into `-OutputRoot` as 8-bit mono 22.05 kHz WAV files. Contains three parts:

- A synth: note-name to frequency conversion, a square-wave oscillator with adjustable duty cycle, a linear decay envelope, and a phase accumulator so pitch sweeps stay continuous.
- A WAV writer that emits the 44-byte canonical header plus PCM data.
- A manifest of note sequences, one entry per sound, grouped by category. This is the part to edit to change how the pack sounds.

Sound shape carries the meaning: rising phrases that resolve to the tonic read as "done", phrases left unresolved read as a question, and descending minor seconds with a narrow duty cycle read as an error.

### `tests/Test-TaskCompleteRandomness.ps1`

Sampling harness that mirrors the hook's random selection logic and prints a markdown distribution table. It does not play audio. Defaults to the installed `%USERPROFILE%\.claude\sounds\starcraft\task-complete` folder; override with `-SoundDirectory` to check another theme.

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

The `starcraft` theme has no folders for these categories. Adding one of these hooks means adding matching clips there too, or the theme will fall silent for that event.

## Maintenance Notes

- Keep `README.txt` and this index in sync when hook behavior, install steps, themes, or supported platforms change.
- Claude Code supports many more hook events than `Stop` and `Notification` (for example `StopFailure`, `PostToolUseFailure`, `PermissionRequest`, `SubagentStop`, `SessionStart`). Adding a sound for a new event means adding a hook script under `hooks/`, copying it in `install.bat`, and adding a matching merge block to the `settings.json` PowerShell step.
- The `Notification` hook supports a matcher on notification type, so decision-needed sounds can be split further if needed.
- The chiptune manifest in `tools/New-ChiptuneSounds.ps1` is the source of truth for that theme. After editing it, regenerate into `sounds/chiptune/` and commit the resulting WAVs so the checked-in audio never drifts from the manifest.
- Validate installer changes on a Windows machine because the project depends on Windows batch syntax, PowerShell, `%USERPROFILE%` paths, and Claude settings.
