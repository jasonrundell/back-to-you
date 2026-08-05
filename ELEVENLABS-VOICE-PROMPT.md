# ElevenLabs Voice Theme Prompt

Source of truth for the shipped `claude` sound theme: the persona prompt, settings,
and per-clip script used to generate `sounds/claude/` in
[ElevenLabs](https://elevenlabs.io/). Use it to regenerate the pack or re-voice it.

## 1. Voice Design prompt

ElevenLabs → **Voices → Voice Design** (Text to Voice). Paste this as the description:

> A calm, precise male-neutral voice in its early thirties, neutral North American
> accent. Measured and unhurried, with a warm low-mid timbre and clean articulation —
> the voice of a very competent engineer sitting beside you, not a customer service
> agent. Dry, understated humour that never tips into sarcasm. Speaks quietly and
> close to the mic, at conversational volume, with natural breath and no announcer
> polish, no upspeak, no enthusiasm. Studio-clean recording, no reverb, no background
> noise.

**Preview text** (Voice Design needs ~100+ characters to judge a voice well):

> [calm] Done. That one's finished — the tests pass and I've left the config alone.
> [curious] Want me to keep going, or is this a good place to stop?

Generate three variants, pick the one that still sounds relaxed when short — most
voices fall apart on one-word lines. Save it as `Claude Code`.

## 2. Model and settings

- **Model:** Eleven v3 (the audio tags below only work there). On v2, drop the
  bracketed tags — they get read aloud otherwise.
- **Stability:** ~0.55 — high enough to keep the whole pack consistent, low enough
  that short lines do not flatten.
- **Similarity:** ~0.80
- **Style:** 0.0–0.15 (style exaggeration ruins one-word lines)
- **Speed:** 0.95
- Generate **each line as its own generation**, not one block cut up afterwards.
  The pacing stays even that way.

## 3. The 14 clips

Length matters: `hooks/play-sound.ps1` sleeps for the clip's real duration on _every_
response, so keep `task-complete` and `decision-needed` under ~1.5s. Filenames match
what is checked into `sounds/claude/`.

### `task-complete/` (5)

Plays at the end of every response, so these need to be short and unremarkable.

| File                 | Text to speak           |
| -------------------- | ----------------------- |
| `vo-back-to-you.mp3` | `[softly] Back to you.` |

### `decision-needed/` (4)

Rising, unresolved, slightly forward.

| File             | Text to speak              |
| ---------------- | -------------------------- |
| `vo-waiting.mp3` | `[softly] Waiting on you.` |

### `error/` (3)

Flat and factual, never alarmed.

| File                  | Text to speak            |
| --------------------- | ------------------------ |
| `vo-hit-an-error.mp3` | `[softly] Hit an error.` |

### `subagent-done/` (2)

Near-whisper, meant to be barely noticed.

| File                    | Text to speak               |
| ----------------------- | --------------------------- |
| `vo-subagents-done.mp3` | `[softly] Subagent's done.` |

### `session-start/` — retired, no longer generated

The startup greeting was dropped. `SessionStart` fires on every new session, not
every app launch, and in a measured six-hour run that came to roughly four times
an hour — 69% of every sound heard, in bursts as tight as four in 43 seconds.
The recipe is kept here for anyone who wires the hook themselves:

| File                        | Text to speak                  |
| --------------------------- | ------------------------------ |
| `vo-ready-when-you-are.mp3` | `[softly] Ready when you are.` |

## 4. After export

Export MP3 128 kbps or better — the hooks accept `.mp3` and `.wav`.

- **Trim leading silence hard.** ElevenLabs leaves 100–300 ms of head on most
  generations, and that gap is audible when a clip fires after every response.
- **Normalize the set** to a consistent peak so `error` is not louder than
  `task-complete`.

Drop the files into `sounds/claude/<category>/` and run:

```bat
install.bat
```

The installer only validates `task-complete` and `decision-needed`, so those two must
be populated. `error` and `subagent-done` are wired and will play as soon as they hold
a clip; `session-start` is not wired to any hook, so anything left in that folder stays
silent. See the hook table in `README.md`.

## 5. Open design question

A voice clip on _every_ response is more intrusive than a short tone, and the `Stop`
hook blocks for the clip's full length while it plays. If it starts to grate, the fix
is to speak only on `decision-needed` and play something brief — or nothing — for
`task-complete`. That needs a change to `hooks/play-sound.ps1`, which currently
resolves both categories from the same theme folder.
