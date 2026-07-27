Sound Notifications for Claude Code / Cowork
============================================

Plays a sound automatically based on what Claude is doing:
  - Task complete sound  → end of every response
  - Decision needed sound → when Claude asks you a question or sends a
                            notification (for example, a permission prompt)

Two themes ship: StarCraft voice clips, or synthesized 8-bit chiptune bleeps.

FEATURES
--------
- Claude Code / Cowork support through Claude Stop and Notification hooks
- Two sound themes, switchable by editing a single line of text
- Randomized sounds from separate task-complete and decision-needed folders
- Chiptune pack is generated from code, so it ships as a script, not as audio
- Sounds play for their real length instead of a fixed delay
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
     - or run "install.bat chiptune" from a terminal to start on the
       chiptune theme instead of StarCraft
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

If you installed a version before sound themes existed, the old
%USERPROFILE%\.claude\sounds\task-complete\ and \decision-needed\ folders are
left behind unused when you upgrade. They are safe to delete.

SOUND THEMES
------------
Two packs ship, and both are installed every time. Only the active one plays.

  starcraft  - around 100 StarCraft MP3 clips (the default)
                 task-complete:   unit acknowledgements, "job's finished",
                                  research/upgrade/evolution complete alerts
                 decision-needed: "go ahead, commander", "reporting for duty",
                                  low-energy and supply-blocked alerts

  chiptune   - 16 synthesized 8-bit WAV bleeps. The files are checked in, but
               they are generated output: the melodies live as note sequences
               in tools\New-ChiptuneSounds.ps1, which is the thing to edit.
                 task-complete:   rising major arpeggios that resolve
                 decision-needed: rising phrases left unresolved (a musical "?")
                 error:           descending minor 2nds with a nasal duty cycle
                 subagent-done:   quiet high ticks
                 session-start:   power-up sweeps

SWITCHING THEMES
----------------
Edit one line:

  %USERPROFILE%\.claude\sound-theme.txt

Put "starcraft" or "chiptune" in it. Takes effect on the next sound - no
reinstall and no Claude restart needed. Or reinstall with the theme as an
argument: "install.bat chiptune".

CUSTOMIZING
-----------
Add or remove files in %USERPROFILE%\.claude\sounds\<theme>\<category>\.
Both .mp3 and .wav are picked up, and one file is chosen at random per event.
You can also make your own theme: create a folder next to the shipped ones
with task-complete\ and decision-needed\ subfolders, then name it in
sound-theme.txt.

To change the chiptune melodies, edit the manifest at the bottom of
tools\New-ChiptuneSounds.ps1, regenerate into the repo, then reinstall:

  powershell -File tools\New-ChiptuneSounds.ps1 -OutputRoot sounds\chiptune
  install.bat chiptune

Each note takes a pitch (like C5 or F#4), a length in milliseconds, and
optionally Duty (pulse width - 0.5 is hollow, 0.125 is nasal), Vol, and
Decay. Sweeps use To for a second pitch to glide toward.

NOTE ON THE EXTRA CHIPTUNE CATEGORIES
-------------------------------------
The error, subagent-done, and session-start sounds are generated but nothing
plays them yet - the installer only wires Claude's Stop and Notification
hooks. Claude Code also supports StopFailure, PostToolUseFailure,
PermissionRequest, SubagentStop and SessionStart hooks, which those sounds
are shaped for.

TESTING
-------
tests\Test-TaskCompleteRandomness.ps1 samples the task-complete folder the same
way the hook does and prints a distribution table, so you can confirm the
random picks are spread evenly. It does not play audio.
