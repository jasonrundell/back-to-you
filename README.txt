StarCraft Sound Notifications for Claude Code / Cowork
======================================================

Plays StarCraft sounds automatically based on what Claude is doing:
  - Task complete sound  → end of every response
  - Decision needed sound → when Claude asks you a question or sends a
                            notification (for example, a permission prompt)

FEATURES
--------
- Claude Code / Cowork support through Claude Stop and Notification hooks
- Randomized sounds from separate task-complete and decision-needed folders
- PowerShell audio playback with no extra Windows dependencies
- Installer merges hook settings without replacing unrelated existing hooks
- Installer stops with a clear error if required MP3 sound assets are missing

HOW IT WORKS
------------
  - Installs hooks into %USERPROFILE%\.claude\hooks\
  - Adds Stop and Notification entries to %USERPROFILE%\.claude\settings.json
  - Uses the Stop hook to play task-complete sounds, or decision-needed sounds
    when the last assistant message ends with a question
  - Uses the Notification hook to play decision-needed sounds

REQUIREMENTS
------------
- Windows 10 or later: supported
- macOS: not supported by this Windows installer
- Linux: not supported by this Windows installer
- Claude Code or Cowork installed
- PowerShell (built into Windows — no extra install needed)

INSTALL
-------
1. Right-click the zip and select "Extract All" to unzip it
2. Open the extracted "sc-sounds-hook-windows" folder
3. Double-click "install.bat"
4. If Windows asks "Do you want to allow this app to make changes?" click Yes
5. Restart Claude Code and/or Cowork
6. That's it — sounds will play automatically!

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

Then remove the Stop and Notification hook entries from
%USERPROFILE%\.claude\settings.json.

SOUNDS INCLUDED
---------------
Around 100 StarCraft MP3 clips, split across two folders:

  sounds\task-complete\    - unit acknowledgements, "job's finished",
                             research/upgrade/evolution complete alerts
  sounds\decision-needed\  - "go ahead, commander", "reporting for duty",
                             low-energy and supply-blocked alerts

A random sound from the matching folder plays automatically. To customize,
add or remove MP3 files in either folder before running install.bat, or edit
the installed copies under %USERPROFILE%\.claude\sounds\ directly.

TESTING
-------
tests\Test-TaskCompleteRandomness.ps1 samples the task-complete folder the same
way the hook does and prints a distribution table, so you can confirm the
random picks are spread evenly. It does not play audio.
