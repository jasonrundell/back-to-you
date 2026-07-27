Chiptune Sound Notifications for Claude Code / Cowork
=====================================================

Plays a sound automatically based on what Claude is doing:
  - Task complete sound  → end of every response
  - Decision needed sound → when Claude asks you a question or sends a
                            notification (for example, a permission prompt)

All sounds are synthesized 8-bit bleeps, generated from code rather than
sampled, so the whole pack is a few hundred KB of WAV built from a note
manifest you can edit.

FEATURES
--------
- Claude Code / Cowork support through Claude Stop and Notification hooks
- Sounds generated from code, so melodies are editable as plain text
- Randomized sounds from separate task-complete and decision-needed folders
- Theme system: drop in your own sound folder and switch with one line
- Sounds play for their real length instead of a fixed delay
- PowerShell audio playback with no extra Windows dependencies
- Installer merges hook settings without replacing unrelated existing hooks

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
2. Open the extracted folder
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
  %USERPROFILE%\.claude\sounds\
  %USERPROFILE%\.claude\sound-theme.txt

Then remove the Stop and Notification hook entries from
%USERPROFILE%\.claude\settings.json.

THE SOUNDS
----------
16 sounds across five categories:

  task-complete    5 rising major arpeggios that resolve
  decision-needed  4 rising phrases left unresolved (a musical "?")
  error            3 descending minor 2nds with a nasal duty cycle
  subagent-done    2 quiet high ticks
  session-start    2 power-up sweeps

One is picked at random per event.

Only task-complete and decision-needed are wired up right now. The other
three exist for hook events the installer does not configure yet:

  error          -> Claude's StopFailure and PostToolUseFailure hooks
  subagent-done  -> SubagentStop
  session-start  -> SessionStart

CHANGING THE SOUNDS
-------------------
The melodies live at the bottom of tools\New-ChiptuneSounds.ps1 as note
sequences. Edit them, regenerate, and reinstall:

  powershell -File tools\New-ChiptuneSounds.ps1 -OutputRoot sounds\chiptune
  install.bat

Each note takes a pitch (like C5 or F#4), a length in milliseconds, and
optionally Duty (pulse width - 0.5 is hollow, 0.125 is nasal), Vol, and
Decay. Sweeps use To for a second pitch to glide toward.

YOUR OWN THEME
--------------
Create sounds\<name>\ with task-complete\ and decision-needed\ subfolders,
put .mp3 or .wav files in them, then:

  install.bat <name>

Every theme folder gets installed; the active one is whichever is named in
%USERPROFILE%\.claude\sound-theme.txt. Edit that file to switch - it takes
effect on the next sound, with no reinstall and no Claude restart.

TESTING
-------
tests\Test-TaskCompleteRandomness.ps1 samples the task-complete folder the same
way the hook does and prints a distribution table, so you can confirm the
random picks are spread evenly. It does not play audio.
