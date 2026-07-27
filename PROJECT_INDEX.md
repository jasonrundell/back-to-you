# Project Index

## Overview

This project installs StarCraft sound notifications for Claude Code and Cowork on Windows. It copies PowerShell hook scripts and MP3 sound assets into `%USERPROFILE%\.claude`, then adds Claude hook entries to `%USERPROFILE%\.claude\settings.json`.

## Feature Capabilities

- Plays randomized StarCraft MP3 sounds for task completion and decision-needed events.
- Supports Claude Code and Cowork through Claude `Stop` and `Notification` hooks.
- Detects question-like assistant messages in the `Stop` hook payload and plays a decision-needed sound instead of the task-complete sound.
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
├── install.bat            # Claude Code / Cowork installer
├── hooks/
│   ├── play-sound.ps1
│   └── play-sound-decision.ps1
├── sounds/
│   ├── task-complete/     # ~67 MP3 clips
│   └── decision-needed/   # ~40 MP3 clips
└── tests/
    └── Test-TaskCompleteRandomness.ps1
```

## Runtime Flow

1. The user runs `install.bat`.
2. The installer verifies that both `sounds/` folders contain MP3 files and aborts with an error if either is empty.
3. The installer creates the hook and sound directories under `%USERPROFILE%\.claude`.
4. The installer copies hook scripts from `hooks/` and MP3 files from `sounds/task-complete/` and `sounds/decision-needed/` into the Claude folders.
5. The installer creates or updates `%USERPROFILE%\.claude\settings.json` with `Stop` and `Notification` hook commands.
6. Claude Code or Cowork runs the configured hooks and the PowerShell scripts play a random MP3 from the matching sound directory.

## Installed Locations

```text
%USERPROFILE%\.claude\
├── hooks\
│   ├── play-sound.ps1
│   └── play-sound-decision.ps1
├── settings.json
└── sounds\
    ├── task-complete\
    └── decision-needed\
```

Hooks are installed at the user level, so the sounds apply to every Claude Code and Cowork session for the current Windows user.

## File Responsibilities

### `README.txt`

User-facing installation, uninstall, and sound documentation.

### `install.bat`

Windows installer that:

- Verifies the local MP3 assets are present.
- Creates Claude hook and sound directories.
- Copies MP3 assets into the Claude sound folders.
- Copies PowerShell hook scripts into the Claude hook folder.
- Creates or updates Claude `settings.json` `Stop` and `Notification` hook entries.

### `hooks/play-sound.ps1`

Claude `Stop` hook script. It reads hook input from standard input, checks whether `last_assistant_message` appears to end with a question, then plays either a decision-needed sound or a task-complete sound.

### `hooks/play-sound-decision.ps1`

Claude `Notification` hook script. It plays a random decision-needed sound.

### `tests/Test-TaskCompleteRandomness.ps1`

Sampling harness that mirrors the hook's random selection logic and prints a markdown distribution table. It does not play audio. Defaults to the installed `%USERPROFILE%\.claude\sounds\task-complete` folder; override with `-SoundDirectory`.

## Hook Commands

The installer writes commands equivalent to:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\.claude\hooks\play-sound.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\.claude\hooks\play-sound-decision.ps1"
```

## Maintenance Notes

- Keep `README.txt` and this index in sync when hook behavior, install steps, or supported platforms change.
- Claude Code supports many more hook events than `Stop` and `Notification` (for example `StopFailure`, `PostToolUseFailure`, `PermissionRequest`, `SubagentStop`, `SessionStart`). Adding a sound for a new event means adding a hook script under `hooks/`, copying it in `install.bat`, and adding a matching merge block to the `settings.json` PowerShell step.
- The `Notification` hook supports a matcher on notification type, so decision-needed sounds can be split further if needed.
- Validate installer changes on a Windows machine because the project depends on Windows batch syntax, PowerShell, `%USERPROFILE%` paths, and Claude settings.
