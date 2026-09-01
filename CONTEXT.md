# Back to You

Gives Claude Code and Cowork a voice: installs hook scripts and voice packs into `~/.claude`, and plays a clip when a turn ends, needs a decision, or fails.

## Language

**Voice pack**:
A named voice — one folder of clips per category, plus the ElevenLabs voice-design prompt that can regenerate it.
_Avoid_: theme, sound theme (the `sound-theme.txt` filename is historical, and documented as a user-editable surface)

**Active pack**:
The one voice pack the hooks currently play from. Switching it is a one-line change, not a reinstall.
_Avoid_: active theme, current theme

**Category**:
The kind of moment a clip announces: `task-complete`, `decision-needed`, or `error`. Each is a folder inside a pack. `task-complete` and `decision-needed` are required of every pack; `error` is optional — a pack without it installs, and stays quiet on failures.
_Avoid_: event (that's the Claude Code hook trigger, not the sound's meaning)

**Clip**:
One audio file (`.mp3` or `.wav`) inside a category. Playback picks at random among however many a category holds.

**Shipped**:
Content this package installs and therefore owns: packs, clips, hook scripts, settings entries. Only shipped content may ever be overwritten or removed.
_Avoid_: default, built-in

**User-made**:
Packs or clips the user added under `~/.claude/sounds/`. Never deleted, by installing or uninstalling; offered by the picker alongside shipped packs.
_Avoid_: custom (ambiguous with a shipped pack the user merely selected)

**Run kind**:
What an installer invocation amounts to once the world is read: `fresh`, `upgrade`, `switch`, or `same`.

**Install step**:
One recorded effect of a full install, in the order it happened. The steps are the truthful account of what a run did — including a run that failed partway.

**Uninstall gate**:
The consent decision in front of removal: proceed, refuse, or ask. Refusal without a terminal is deliberate — deletion never proceeds unasked in a script.

**Wired event**:
A Claude Code hook event carrying a shipped settings entry. Retiring a category means unwiring its event *and* removing its clips — either half alone leaves ghosts.

**Retired**:
A category or clip this project used to ship and now removes on install, so it cannot replay if the event is ever re-wired by hand.
