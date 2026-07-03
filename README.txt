StarCraft Sound Notifications for Claude Code / Cowork / Cursor
===============================================================

Plays StarCraft sounds automatically based on what Claude or Cursor is doing:
  - Task complete sound  → end of every response
  - Decision needed sound → when Claude or Cursor asks you a question

FEATURES
--------
- Claude Code / Cowork support through Claude Stop and Notification hooks
- Cursor support through personal user hooks that apply to every Cursor project
- Cursor Plan mode question detection from both response and stop events
- Randomized sounds from separate task-complete and decision-needed folders
- PowerShell audio playback with no extra Windows dependencies
- Installer merges hook settings without replacing unrelated existing hooks
- Installer stops with a clear error if required MP3 sound assets are missing

HOW IT WORKS
------------
Claude Code / Cowork:
  - Installs hooks into %USERPROFILE%\.claude\hooks\
  - Adds Stop and Notification entries to %USERPROFILE%\.claude\settings.json
  - Uses the Stop hook to play task-complete sounds, or decision-needed sounds
    when the last assistant message ends with a question

Cursor:
  - Installs personal hooks into %USERPROFILE%\.cursor\hooks\
  - Adds stop and afterAgentResponse entries to %USERPROFILE%\.cursor\hooks.json
  - Uses afterAgentResponse to play decision-needed sounds when Cursor's response
    ends with a question
  - Uses stop to play task-complete sounds
  - Also checks stop event input for question-like endings, so Plan mode stops
    that ask for your decision can play the decision-needed sound
  - Skips the stop sound briefly after a decision-needed sound so Cursor does not
    play two sounds for the same response

REQUIREMENTS
------------
- Windows 10 or later: supported
- macOS: not supported by this Windows installer
- Linux: not supported by this Windows installer
- Claude Code, Cowork, or Cursor installed
- PowerShell (built into Windows — no extra install needed)

INSTALL
-------
1. Right-click the zip and select "Extract All" to unzip it
2. Open the extracted "sc-sounds-hook-windows" folder
3. Double-click the installer you want:
   - "install.bat"        - sets up both Claude Code / Cowork and Cursor
   - "install-claude.bat" - sets up Claude Code / Cowork only
   - "install-cursor.bat" - sets up Cursor only
4. If Windows asks "Do you want to allow this app to make changes?" click Yes
5. Restart Claude Code, Cowork, and/or Cursor
6. That's it — sounds will play automatically!

Cursor hooks are installed at the personal scope in:
  %USERPROFILE%\.cursor\hooks.json
  %USERPROFILE%\.cursor\hooks\

That means the sounds play for any Cursor project.

Note: If you see a blue "Windows protected your PC" screen, click
"More info" then "Run anyway". This is normal for scripts that aren't
from the Microsoft Store.

UNINSTALL
---------
Delete these files from your PC:
  %USERPROFILE%\.claude\hooks\play-sound.ps1
  %USERPROFILE%\.claude\hooks\play-sound-decision.ps1
  %USERPROFILE%\.claude\sounds\task-complete\
  %USERPROFILE%\.claude\sounds\decision-needed\
  %USERPROFILE%\.cursor\hooks\play-cursor-stop.ps1
  %USERPROFILE%\.cursor\hooks\play-cursor-response.ps1
  %USERPROFILE%\.cursor\sounds\task-complete\
  %USERPROFILE%\.cursor\sounds\decision-needed\
  %USERPROFILE%\.cursor\last-decision-sound.txt

Then remove the Stop and Notification hook entries from %USERPROFILE%\.claude\settings.json.
Then remove the stop and afterAgentResponse hook entries from %USERPROFILE%\.cursor\hooks.json.

SOUNDS INCLUDED
---------------
Task complete:
  - goliath-online
  - job-s-finished
  - oh-yeah
  - research-complete

Decision needed:
  - anytime-you-re-ready
  - go-ahead-commander
  - go-ahead-hq
  - reporting-for-duty

A random sound from the matching category plays automatically.
