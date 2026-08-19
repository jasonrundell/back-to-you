<!--
  Image URLs are absolute on purpose. npm renders this exact file on the
  package page, where relative paths do not resolve — and assets/ is
  deliberately not in the package's `files` allowlist, so they would not ship
  either. raw.githubusercontent serves these as image/svg+xml, so they render
  on GitHub and npmjs.com alike.
-->
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/jasonrundell/back-to-you/main/assets/banner-dark.svg">
    <img src="https://raw.githubusercontent.com/jasonrundell/back-to-you/main/assets/banner-light.svg" alt="Back to You — a voice for Claude Code" width="820">
  </picture>
</p>

# Back to You — voices by elevenlabs.io

A voice for Claude Code.

_"Back to you."_

> You kick off a refactor, switch to your browser, and forget the terminal exists.
> Ten minutes later Claude has been waiting on a yes/no the whole time.

Back to You gives [Claude Code](https://code.claude.com/docs) a quiet voice. It says "Back to you." when a task finishes and "Waiting on you." when it needs a decision — short, flat, never enthusiastic, like a competent engineer sitting beside you. Every clip is original audio made for this, not game sounds borrowed from elsewhere.

<p align="center">
  <img src="https://raw.githubusercontent.com/jasonrundell/back-to-you/main/assets/demo.svg" alt="A task finishes and the voice says &quot;Back to you.&quot; Then Claude asks a question and the voice says &quot;Waiting on you.&quot;" width="820">
</p>

<!--
  AUDIO — paste the bare https://github.com/user-attachments/assets/<uuid> URL
  on its own line, directly below, and GitHub renders an inline player.
  Mint it by dragging sounds/claude/task-complete/vo-back-to-you.mp3 into any
  GitHub comment box.
-->

## What you hear

Each pack ships one clip per hook today.

| When it plays | What you hear |
| --- | --- |
| **A task finishes** | _"Back to you."_ |
| **Claude needs a decision** | _"Waiting on you."_ |
| **A turn fails** | _"Hit an error."_ |
| **A subagent finishes** | _"Subagent's done."_ — a near-whisper, meant to be barely noticed |

The first row plays at the end of **every** response. That is the point, and it is also the thing to know before installing: the clips are kept under a second and a half for exactly this reason.

Want more variety? Drop extra `.mp3` or `.wav` files into any `sounds/<pack>/<category>/` folder — the hook picks one at random each time it fires, so add as many takes as you like.

## Voice packs

Four packs ship today. The installer asks which to activate; switching later is a one-line edit to `sound-theme.txt`, no reinstall needed.

| Pack | Vibe |
| --- | --- |
| `claude` _(default)_ | Calm, dry, competent-engineer-beside-you. Understated humor, never enthusiastic. |
| `gigatron` | A genius AI quietly amused by humans — deep, wry, faintly metallic, calm menace under the humor. |
| `jay-run` | A second neutral voice, no character write-up yet — give it a listen. |
| `mistress-of-pain` | Low, smoky, predatory calm — an amused, coldly curious hunter, not a seductress. |

Want your own? See "Make your own theme" below.

## Install

One command, the same on macOS, Windows and Linux:

```bash
npx backtoyou
```

You'll be asked to pick a voice pack — `claude`, `gigatron`, `jay-run`, or `mistress-of-pain` — with `claude` as the default if you just press Enter. Restart Claude Code. That's it.

Needs [Node.js](https://nodejs.org). Nothing else — no Homebrew, no `jq`, no Python, and no dependencies of its own.

**Changed your mind about the voice?** Run it again and pick a different one:

```bash
npx backtoyou
```

Switching is instant — it rewrites a single line in `~/.claude/sound-theme.txt` and takes effect on the next sound. No reinstall, no restart. Or skip the prompt entirely:

```bash
npx backtoyou gigatron
```

<details>
<summary>Installing from a clone or a download instead</summary>

Both still work, and both run the same installer — `install.sh` and `install.bat` are now three-line shims around it.

```bash
git clone https://github.com/jasonrundell/back-to-you.git
cd back-to-you
./install.sh            # or install.bat on Windows
```

Or grab the zip from [Releases](https://github.com/jasonrundell/back-to-you/releases), unzip it, and run the installer inside — on macOS you can double-click `install.command`.

There's nothing to `npm install` first: the package has no dependencies, so `node bin/cli.js` runs straight out of the folder.

**macOS quarantines anything downloaded through a browser**, so a zip may give you `Operation not permitted`. To clear it, open Terminal, type `xattr -d -r com.apple.quarantine ` (with the trailing space), then drag the unzipped folder into the Terminal window and press Return. Cloning avoids this entirely — `git` doesn't set the quarantine flag — and `npx` avoids it best of all.

**Windows may show a blue "Windows protected your PC" screen** for any script that didn't come from the Microsoft Store. Click **More info**, then **Run anyway**. Nothing is installed system-wide — the installer only writes into your own `.claude` folder.

</details>

## Platform support

All three desktop platforms, with Node.js the only prerequisite.

| Platform | Works today | How it plays sound |
| --- | :---: | --- |
| **Windows 10/11** | Yes | PowerShell and `MediaPlayer`, built in |
| **macOS** | Yes — new, lightly tested | `afplay`, built in |
| **Linux** | Yes — new, lightly tested | `pw-play`, `paplay`, `mpg123`, `play`, or `aplay` — whichever it finds first |

On Linux it looks for a player in that order and uses the first one that works. `pw-play` (PipeWire) ships by default on current Ubuntu and Fedora desktops, so usually nothing needs installing. If none is found, the reason is written to `~/.claude/.backtoyou-playback-error` rather than failing silently.

macOS and Linux support are both new and haven't been through many hands yet. If something breaks, [open an issue](https://github.com/jasonrundell/back-to-you/issues) — it's the fastest way to get it fixed.

Also works with **Cowork**, which reads the same hooks.

## FAQ

**Why don't I hear sounds in a cloud session (Claude Code on the web, or a cloud session opened through the desktop app)?**

Hooks run wherever the session itself runs. A local `claude` CLI session runs on your machine, so `afplay`, `pw-play` or PowerShell can reach your speakers. A cloud session runs inside an isolated remote container instead, with no path to your local audio hardware — the hook command genuinely executes, it just has nothing to play through. Cloud sessions also only load hooks from repository-level (`.claude/settings.json`) and organization-managed settings, not your machine's `~/.claude/settings.json`, so the entries this installer wires wouldn't even be read there.

There's no supported way today to make a cloud session play sound on your local machine — that would need a client-side hook or notification callback from Claude Code itself, which is outside what this repo's scripts can do. If you rely on audio feedback, run Claude Code locally.

## Turning it off

**One sound too many?** Delete the clips from that folder and it stops. The hooks exit quietly when a folder is empty — no settings to edit, no reinstall.

```
~/.claude/sounds/claude/error/          ← delete these, no more error sounds
```

**All of it?** Delete the installed files and remove the `Back to You` entries from `~/.claude/settings.json`:

```
~/.claude/hooks/play-sound.js       (.ps1 on Windows)
~/.claude/hooks/play-category.js    (.ps1 on Windows)
~/.claude/hooks/play-lib.js         (macOS and Linux only)
~/.claude/sounds/
~/.claude/sound-theme.txt
~/.claude/.backtoyou-version
```

**Heard nothing after installing?** Look for `~/.claude/.backtoyou-playback-error`. If it exists, it names the clip and what was tried — an empty folder and a missing audio player look identical from the outside, and this tells them apart. If it doesn't exist, playback isn't the problem; check that `settings.json` still has the hook entries.

Installed before v1? Older builds also left `~/.claude/hooks/play-sound-decision.sh` (or `.ps1`) behind. Upgrading unwires it for you, along with the older `.sh` hooks that macOS and Linux used before the Node rewrite; those files are inert once unwired, and safe to delete.

<details>
<summary><h2 style="display:inline">How it works</h2></summary>

Claude Code [hooks](https://code.claude.com/docs/en/hooks) let you run a command when something happens. This installs two hook scripts and points five events at them.

The hooks are **Node on macOS and Linux, PowerShell on Windows** — a split that looks odd until you see why. Everything Node buys here is a Unix problem: reading one field out of the hook payload without a JSON parser previously cost `plutil` plus a JavaScript-for-Automation fallback. Windows never had that problem, and it plays audio through a .NET assembly Node can't reach, so a Node hook there would have to launch PowerShell anyway — slower than just being PowerShell. Both implementations classify identically and share the same files in `~/.claude`.

```
Stop ──────────→ 🔊 "Back to you."
Notification ──→ 🔊 "Waiting on you."
```

| Event | When it fires | What you hear |
| --- | --- | --- |
| `Stop` | A response ends | `task-complete`, or `decision-needed` if the response ends in a question |
| `Notification` | Claude asks for permission or input | `decision-needed` |
| `PreToolUse` | Claude opens the multiple-choice picker | `decision-needed` |
| `SubagentStop` | A subagent finishes | `subagent-done` |
| `StopFailure` | A turn ends on an API error | `error` |

`Notification` is matched to the types that are genuinely a request for input, and `PreToolUse` to `AskUserQuestion` — the picker has no notification type of its own, and would otherwise be the one decision-shaped moment that stays silent. `PostToolUseFailure` is deliberately left alone: it fires on every failed tool call, including a `grep` that finds nothing, and would buzz constantly.

**`SubagentStop` and `Stop` can fire moments apart.** When a subagent is the last thing a turn does, you'd otherwise hear the subagent-done clip and then task-complete right after it — two "done" sounds for one finished task. The `Stop` hook checks for that and skips its own clip when it fires immediately after a subagent-done one. A real question still gets its decision-needed clip either way.

**`SessionStart` is deliberately not wired**, and there is no startup greeting. Earlier versions wired it, matched to `startup` so it wouldn't replay on `/clear` or after a compaction. That wasn't enough: `startup` means every new *session*, not every app launch, and short-lived sessions are common. Measured over a six-hour run it fired about four times an hour and accounted for **69% of every sound heard**, in bursts as tight as four in 43 seconds. It was also the least useful of the set — a session starting is the one moment you're already looking at the terminal, which is exactly what `task-complete` and `decision-needed` are for. Reinstalling removes the hook from an existing install.

The installer merges these into `~/.claude/settings.json` without touching anything else in it, backing the file up first:

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node \"~/.claude/hooks/play-sound.js\"", "timeout": 10 } ] }
    ]
  }
}
```

**On latency.** The `Stop` hook waits for the clip to finish before the turn closes, so every clip is a small tax on every response. That's why they're all under about a second and a half, and why there's a six-second hard cap. If you add your own, keep them short.

</details>

<details>
<summary><h2 style="display:inline">Make your own theme</h2></summary>

A theme is a folder of sounds. Create it directly in `~/.claude/sounds/`, drop in `.mp3` or `.wav` files, and it's ready:

```
~/.claude/sounds/mytheme/
├── task-complete/
├── decision-needed/
├── error/
└── subagent-done/
```

```bash
npx backtoyou mytheme
```

Naming a theme on the command line skips the interactive picker — handy for scripting. Leave it off and `mytheme` shows up as a numbered choice alongside the built-in packs, because the picker lists everything in `~/.claude/sounds/` as well as everything shipped.

That's why the folder goes in `~/.claude/sounds/` rather than in a checkout: with `npx` there's no checkout to put it in. Installing or switching packs never deletes it.

The active theme is named in `~/.claude/sound-theme.txt`. Edit that one line to switch by hand if you'd rather — it takes effect on the next sound, with no reinstall and no restart, exactly like re-running the installer.

**Keep `task-complete` clips under about 1.5 seconds.** That folder plays at the end of every response, and anything longer starts to feel like lag.

Themes are for your own machine. This repository ships only audio it made itself, so theme contributions aren't accepted — see below for why that matters.

</details>

## License

Two licenses, and the difference matters:

- **Code, scripts, docs, artwork** — MIT. See [LICENSE](LICENSE).
- **Audio under `sounds/`** — **not open source.** See [LICENSE-AUDIO](LICENSE-AUDIO). Redistributable and modifiable, but non-commercial only, with ElevenLabs attribution preserved and no AI training.

That split isn't a preference. The clips were generated with ElevenLabs, whose terms forbid offering their output under anything more permissive — which rules out MIT and every Creative Commons license alike.

**If those terms don't suit you, generate your own.** [ELEVENLABS-VOICE-PROMPT.md](ELEVENLABS-VOICE-PROMPT.md) is MIT and holds the complete recipe: the voice design prompt, the model settings, and the exact line for each of the four clips. Run it under your own ElevenLabs account and the audio is yours outright.

## About the sounds

Every clip here is original. The voice was designed for this project and generated with [ElevenLabs](https://elevenlabs.io) — no game audio, no rights-holder problem, no disclaimer needed.

---

Not affiliated with Anthropic. "Claude" and "Claude Code" are their trademarks, used here only to say what this works with.
