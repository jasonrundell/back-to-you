# Project Index

## Overview

This project installs StarCraft sound notifications for Claude Code, Cowork, and Cursor on Windows. It copies PowerShell hook scripts and expected MP3 sound assets into `%USERPROFILE%\.claude` and `%USERPROFILE%\.cursor`, then adds Claude hook entries to `%USERPROFILE%\.claude\settings.json` and Cursor user hook entries to `%USERPROFILE%\.cursor\hooks.json`.

## Feature Capabilities

- Plays randomized StarCraft MP3 sounds for task completion and decision-needed events.
- Supports Claude Code and Cowork through Claude `Stop` and `Notification` hooks.
- Supports Cursor through personal user hooks installed under `%USERPROFILE%\.cursor`, so the sounds apply to every Cursor project.
- Uses Cursor `afterAgentResponse` to detect question-like responses and play decision-needed sounds.
- Uses Cursor `stop` to play task-complete sounds and to detect question-like Plan mode stops that need a user decision.
- Suppresses the Cursor task-complete sound briefly after a decision-needed sound to avoid double playback for the same response.
- Merges hook entries into existing Claude and Cursor settings instead of replacing unrelated hooks.
- Fails installation with a clear error when required MP3 assets are missing.

## Supported Platforms

- Windows: Supported. The installer is a batch script and the hook scripts use PowerShell plus the .NET `PresentationCore` media APIs.
- macOS: Not supported by the current scripts. A macOS implementation would need shell scripts, an audio playback command such as `afplay`, and platform-specific Claude/Cursor settings instructions.
- Linux: Not supported by the current scripts. A Linux implementation would need shell scripts, an audio playback command such as `paplay`, `aplay`, or `mpg123`, and platform-specific Claude/Cursor settings instructions.

## Repository Structure

```text
.
├── README.txt
├── PROJECT_INDEX.md
├── install.bat            # Combined: runs install-claude.bat then install-cursor.bat
├── install-claude.bat     # Dedicated Claude Code / Cowork installer
├── install-cursor.bat     # Dedicated Cursor installer
└── hooks/
    ├── play-cursor-response.ps1
    ├── play-cursor-stop.ps1
    ├── play-sound.ps1
    └── play-sound-decision.ps1
```

The installer references these expected asset directories, but they are not currently present in the workspace:

```text
sounds/
├── task-complete/
└── decision-needed/
```

## Runtime Flow

1. The user runs `install.bat` (both tools), `install-claude.bat` (Claude only), or `install-cursor.bat` (Cursor only).
2. The installer creates the hook directories and the expected sound directories under the relevant app config folder(s) (`%USERPROFILE%\.claude` and/or `%USERPROFILE%\.cursor`).
3. The installer copies hook scripts from `hooks/` into the matching Claude and/or Cursor hook folders.
4. The installer copies MP3 files from local `sounds/task-complete/` and `sounds/decision-needed/` directories into the matching app sound folders.
5. The Claude installer creates or updates `%USERPROFILE%\.claude\settings.json` with `Stop` and `Notification` hook commands.
6. The Cursor installer creates or updates `%USERPROFILE%\.cursor\hooks.json` with user-scope `stop` and `afterAgentResponse` hook commands.
7. Claude Code, Cowork, or Cursor runs the configured hooks and the PowerShell scripts play a random MP3 from the matching sound directory.

## Installed Locations

### Claude Code / Cowork

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

### Cursor Personal Scope

```text
%USERPROFILE%\.cursor\
├── hooks\
│   ├── play-cursor-response.ps1
│   └── play-cursor-stop.ps1
├── hooks.json
├── last-decision-sound.txt
└── sounds\
    ├── task-complete\
    └── decision-needed\
```

Cursor hooks are installed at the user level, not inside a single repository. This makes the sounds available in every Cursor workspace for the current Windows user.

## File Responsibilities

### `README.txt`

User-facing installation, uninstall, and sound list documentation.

### `install.bat`

Combined Windows installer. It calls `install-claude.bat` and `install-cursor.bat`
(each with a `nopause` argument so only the combined script prompts at the end),
setting up both Claude Code / Cowork and Cursor in one run.

### `install-claude.bat`

Dedicated Claude Code / Cowork installer that:

- Creates Claude hook and sound directories.
- Copies MP3 assets into the Claude sound folders.
- Copies PowerShell hook scripts into the Claude hook folder.
- Creates or updates Claude `settings.json` `Stop` and `Notification` hook entries.

Accepts an optional `nopause` argument to skip the closing `pause` (used by `install.bat`).

### `install-cursor.bat`

Dedicated Cursor installer that:

- Creates Cursor user hook and sound directories.
- Copies MP3 assets into the Cursor sound folders.
- Copies PowerShell hook scripts into the Cursor hook folder.
- Creates or updates Cursor user `hooks.json` `stop` and `afterAgentResponse` hook entries.

Accepts an optional `nopause` argument to skip the closing `pause` (used by `install.bat`).

### `hooks/play-sound.ps1`

Claude `Stop` hook script. It reads hook input from standard input, checks whether `last_assistant_message` appears to end with a question, then plays either a decision-needed sound or a task-complete sound.

### `hooks/play-sound-decision.ps1`

Claude `Notification` hook script. It plays a random decision-needed sound.

### `hooks/play-cursor-response.ps1`

Cursor user `afterAgentResponse` hook script. It reads Cursor hook input from standard input, searches response-shaped text fields, plays a decision-needed sound when the response ends with a question, and writes a short-lived marker so the `stop` hook does not immediately play a second sound.

### `hooks/play-cursor-stop.ps1`

Cursor user `stop` hook script. It reads Cursor hook input from standard input, plays a decision-needed sound when the stop payload ends with a question, and otherwise plays a task-complete sound unless a recent decision-needed sound marker is present. This gives Cursor Plan mode stops a chance to ask for a decision with the decision-needed sound.

### `%USERPROFILE%\.cursor\last-decision-sound.txt`

Runtime marker written by `play-cursor-response.ps1`. `play-cursor-stop.ps1` reads it to avoid playing a task-complete sound immediately after a decision-needed sound.

## Hook Commands

The installer writes commands equivalent to:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\.claude\hooks\play-sound.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\.claude\hooks\play-sound-decision.ps1"
```

For Cursor, the installer writes user-scope hook commands equivalent to:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\hooks\play-cursor-stop.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\hooks\play-cursor-response.ps1"
```

Cursor user hooks are installed in `%USERPROFILE%\.cursor`, so they apply to every Cursor project.

## Maintenance Notes

- Keep `README.txt` and this index in sync when hook behavior, install steps, or supported platforms change.
- Add the expected `sounds/task-complete/*.mp3` and `sounds/decision-needed/*.mp3` assets before packaging a release. The installer fails with a clear error when those assets are missing.
- If supporting macOS or Linux later, add separate installer scripts instead of expanding the Windows batch file with cross-platform assumptions.
- Validate installer changes on a Windows machine because the project depends on Windows batch syntax, PowerShell, `%USERPROFILE%` paths, Claude settings, and Cursor user hooks.
