# How comparable Claude Code hook projects present themselves

Research for issue #4 (part of #1). Surveyed 2026-07-27.

**Where this lives:** the repo had no existing convention for research notes — no `docs/`,
no `research/`, no `notes/`. I created `research/` and put this here. If a different home is
preferred later, this is the only file in it.

## Method

Every README below was read as raw source, not as a rendered page or a blog write-up about it.
Direct-competitor READMEs were pulled with `gh api repos/<owner>/<repo>/readme -H "Accept:
application/vnd.github.raw"`, which returns the exact bytes on the default branch. Star counts
came from `gh api repos/<owner>/<repo>` the same day. Claude Code mechanics were checked against
the official docs at `code.claude.com/docs`, not against what the sound repos claim about them.

A caution on the numbers: the direct-competitor sample is small and the star counts are low
(2–110). At that scale stars track "did this get posted to X / Reddit" at least as much as they
track README quality. So below I distinguish between **structural patterns that recur across the
whole corpus** (defensible) and **judgements about what reads well** (labelled as mine).

## The corpus

### Direct competitors — Claude Code sound/audio hook packs

| Stars | Repo | Note |
| ---: | --- | --- |
| 110 | [ctoth/claudio](https://github.com/ctoth/claudio) | Go binary, multi-agent (Claude/Codex/Gemini/Qwen/Copilot) |
| 75 | [ChanMeng666/echook](https://github.com/ChanMeng666/echook) | Maximalist; 39 hook events, TTS, webhooks, statusline |
| 43 | [6m1w/claude-sound-fx](https://github.com/6m1w/claude-sound-fx) | 12 themes, plugin-install, best-composed README in the set |
| 20 | [moonshot-partners/claude-code-sound-packs](https://github.com/moonshot-partners/claude-code-sound-packs) | Shell scripts, downloads audio at install |
| 15 | [ryparker/claude-code-sounds](https://github.com/ryparker/claude-code-sounds) | npx installer, 17 game themes |
| 15 | [lodev09/claude-sounds](https://github.com/lodev09/claude-sounds) | Plugin marketplace install, 4 sources |
| 2 | [BMayhew/claude-sound-hooks](https://github.com/BMayhew/claude-sound-hooks) | |
| — | [daveschumaker/homebrew-claude-sounds](https://github.com/daveschumaker/homebrew-claude-sounds) | Homebrew tap |
| — | [mikedotcook/claude-sounds](https://github.com/mikedotcook/claude-sounds) | macOS menu-bar volume control for hook sounds |

### Ecosystem context

| Stars | Repo |
| ---: | --- |
| 3,855 | [disler/claude-code-hooks-mastery](https://github.com/disler/claude-code-hooks-mastery) |
| — | [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) |

### Adjacent — projects that sell a feel rather than a feature list

| Stars | Repo |
| ---: | --- |
| 59,108 | [starship/starship](https://github.com/starship/starship) |
| 19,548 | [catppuccin/catppuccin](https://github.com/catppuccin/catppuccin) |
| 4,868 | [variadico/noti](https://github.com/variadico/noti) (README now only a redirect to Codeberg) |

---

## Q1 — What is at the top, in what order?

Two distinct shapes appear, and they split by audience rather than by quality.

**Shape A — the centered hero block.** Used by
[starship](https://github.com/starship/starship),
[catppuccin](https://github.com/catppuccin/catppuccin),
[6m1w/claude-sound-fx](https://github.com/6m1w/claude-sound-fx),
[ryparker/claude-code-sounds](https://github.com/ryparker/claude-code-sounds),
[ChanMeng666/echook](https://github.com/ChanMeng666/echook). All five wrap the top in
`<div align="center">` or `<p align="center">` and run roughly:

1. Logo / banner image
2. Badges
3. Name and one-line tagline
4. Demo media
5. First heading (Install or Quick Start)

Starship's actual order, read from source, is: logo (400px) → six badges → a nav row
(`Website · Installation · Configuration`) → 13 flag-icon language links → a branch-rename
warning → demo GIF → tagline → six feature bullets → "Explore the Starship docs" button →
`## 🚀 Installation`. Its tagline is verbatim: *"The minimal, blazing-fast, and infinitely
customizable prompt for any shell!"*

Two things about that order are worth stealing. The **demo comes before the tagline** — show,
then say. And the **docs call-to-action sits immediately before Install**, so the reader is
handed an exit to the full docs at the exact moment they commit to installing.

**Shape B — no hero at all.** [ctoth/claudio](https://github.com/ctoth/claudio), the highest-star
direct competitor at 110, opens with a bare `# Claudio`, two paragraphs of plain prose, then
`Full documentation starts at docs/index.md` — on line 11 — then `## Install`. No banner, no
badge, no demo, no table of contents. It is aimed at people who already know they want this.

The variant that fits this project best is 6m1w's, because it is the only one that opens on the
*problem* rather than the product. Verbatim, its first content after the banner is a blockquote:

> You kick off a task, switch to your browser, and forget about the terminal.
> Five minutes later you check back — it's been waiting for you the whole time.

Then the product sentence, then the demo video. That ordering — **lived moment → what it is →
proof** — is the one that works on a reader who has never configured a hook, because it does not
require them to already know what a hook is to feel why they want one.

---

## Q2 — How do they demonstrate audio, which static text cannot carry?

This is the core problem and the corpus splits sharply on it. Four techniques, in descending
order of how well they actually work.

### 1. Embed a video with sound (the only real demo)

Both [6m1w/claude-sound-fx](https://github.com/6m1w/claude-sound-fx) and
[ChanMeng666/echook](https://github.com/ChanMeng666/echook) put a bare GitHub asset URL on its
own line:

```
https://github.com/user-attachments/assets/c47537fc-1c18-4256-877d-0f22d4314bfd
```

GitHub renders a bare `user-attachments/assets/<uuid>` URL as an inline HTML5 player with audio.
You get the URL by dragging a video file into any issue or PR comment box and copying the link
it generates. This is the single highest-value technique found in the whole survey: it is the
only way a README lets someone *hear* the product before installing it. echook's is labelled
`### Promotional Video` with a `<sup>` credit line underneath naming the tools used.

Note the hard dependency: **this requires `README.md`. A `README.txt` cannot do it.**

### 2. Print the line the voice says (works surprisingly well)

The dominant text technique, and every theme-based pack in the corpus converged on it
independently: a themes table with a column that quotes the audio in italics.

[ryparker](https://github.com/ryparker/claude-code-sounds) calls the column **Vibe**:

| Theme | Vibe |
| --- | --- |
| **StarCraft** (`starcraft`) | *"Not enough minerals"* — Terran, Protoss, and Zerg voice lines |
| **Portal** (`portal`) | *"Are you still there?"* — Turrets, portal guns, and Aperture Science |

[6m1w](https://github.com/6m1w/claude-sound-fx) uses the same column name and adds an **Origin**
column: *"At your service, sir."* — Calm, competent, slightly British. |Iron Man.
[moonshot-partners](https://github.com/moonshot-partners/claude-code-sound-packs) does it in a
Description column: `Warcraft III Orc Peon - "Zug zug", "Work work", "Something need doing?"`.

ryparker also drops a single quoted line — `_"Something need doing?"_` — as the last element of
the centered hero block, standing alone. It is the closest thing to a sound effect that markdown
can render, and it lands.

The pattern is: **quoted line in italics, em dash, then a short characterisation of the tone.**
Not a description of the sound — the actual words, verbatim.

### 3. Fuse the mechanism diagram with the audio content

6m1w's `## How It Works` is a plain code block that does two jobs at once:

```
 SessionStart ──→ 🔊 "I am ready."         (theme: start)
 Stop ──→ 🔊 "Task complete."               (theme: complete)
 PostToolUseFailure ──→ 🔊 "That was a mistake." (theme: error)
 Notification ──→ 🔊 "Hmm?"                 (theme: notification)
```

One block teaches the hook event names, the mapping, and what you will actually hear. For a
project whose whole premise is "sounds are mapped to events", this is more efficient than any
prose explanation, and it is the best single artifact in the survey after the video.

### 4. Ship a preview command

[moonshot-partners](https://github.com/moonshot-partners/claude-code-sound-packs) puts
`./preview.sh warcraft-peasant` in its Quick Start *between* install and activate, so hearing the
pack is a step in the install flow rather than an afterthought.
[ryparker](https://github.com/ryparker/claude-code-sounds) has `--mix`, an interactive grid that
previews clips, screenshotted in the README. [claudio](https://github.com/ctoth/claudio) ships no
preview and no demo of any kind.

**Gap in the market:** nobody in this corpus combines all four. The two with video have weak
theme tables; the two with strong theme tables have no video.

---

## Q3 — How much do they explain what a hook is?

Almost nobody explains it. Across the corpus the modal treatment is a **hyperlink on the first
mention of "Claude Code" and nothing more**:

- lodev09: "Sound feedback plugin for [Claude Code](https://docs.anthropic.com/en/docs/claude-code)."
- 6m1w: "...adds themed audio cues to [Claude Code](...) and [Opencode](...)"
- ryparker: "**Sound themes for [Claude Code](...) lifecycle hooks.**"

Only [moonshot-partners](https://github.com/moonshot-partners/claude-code-sound-packs) defines
the mechanism, and it does it in exactly one sentence at the top of `## How It Works`, deep in
the README:

> Claude Code [hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) let you run shell
> commands on specific events.

It then shows the literal `settings.json` fragment the installer produces. That combination —
one-sentence definition, then the actual JSON — is the most generous treatment in the corpus and
still costs under ten lines.

**What everyone does instead of explaining:** a hook-event table. This is the genre's single
strongest convention — it appears in ryparker, lodev09, moonshot-partners, 6m1w, claudio, and
echook, i.e. every project surveyed. The columns are consistently *Event | When it fires |
Sound*. It teaches the mechanism by enumeration rather than definition, which suits a reader who
wants to know what they will hear, not how hooks work.

**My read:** for a non-developer-ish audience the corpus is under-explaining, but the fix is not
a tutorial. It is one sentence of plain English placed *late* (in How It Works, not at the top),
plus the event table everyone already ships. Explaining hooks at the top would be a mistake — it
front-loads a concept the reader does not need in order to want the product.

---

## Q4 — Install sections, and where the platform caveat goes

### Install

The ecosystem has converged hard on **one line, run inside Claude Code**:

```
/plugin marketplace add 6m1w/claude-sound-fx
/plugin install sound-fx@claude-sound-fx
```

(6m1w; lodev09 is the same shape with `claude plugin marketplace add lodev09/claude-plugins`.)
The next tier is one line in a terminal: `npx claude-code-sounds` (ryparker),
`go install claudio.click/cmd/claudio@latest` (claudio). Nobody in the corpus asks the user to
download a zip.

Two details worth copying:

- **ryparker hides the source install** behind `<details><summary>Alternative: install from
  source</summary>`. The simple path is the only thing visible; the complex path is one click
  away and does not clutter the page.
- **6m1w numbers the steps with circled glyphs inside the code block** (`# ① Clone the repo on
  your LOCAL machine`) for its multi-step relay setup, so a five-command sequence still reads as
  a sequence.

### Platform caveats — three phrasings, ranked

**Best — one sentence, immediately under the install command, reason in parentheses.** ryparker:

> Requires macOS (uses `afplay`) and Node.js 20+.

It is not a section, not a warning box, not an apology. It is a fact placed where it is
actionable — the reader learns it at the moment they would otherwise paste the command. The
parenthetical reason converts "we didn't bother" into "here is the mechanism".

**Best for multi-platform — a capability table with a positive header.** 6m1w's `## Platform
Support` sits directly after the demo and *before* install, opening with:

> Works on every major platform. No extra setup needed for local use.

| Platform | Extra setup? | How it works |
| --- | :---: | --- |
| **macOS** | No | Plays via `afplay` directly |
| **Windows (WSL)** | No | Auto-calls `powershell.exe` or `ffplay.exe` via WSL interop |
| **Remote server (SSH)** | Yes | Requires a relay script on your local machine — see below |

The column is **"Extra setup?"**, not "Supported?". That reframing is the whole trick: it turns a
support matrix into a friction matrix, and the one "Yes" reads as a documented path rather than
a hole. lodev09 does a cheaper version of the same thing — a Requirements list annotating each
OS with its player and "(built-in)" where nothing is needed.

**Weakest — the apologetic note.** moonshot-partners:

> Note: Currently macOS only due to `afplay`. PRs welcome for Linux (`aplay`/`paplay`) support!

"Currently ... only due to ..." leads with the limitation and the cause of the limitation. It is
partially rescued by "PRs welcome", which converts the gap into an invitation, and by a
`## Contributing` section that lists Linux and Windows support as named asks. But the framing
starts negative.

**The rule the corpus supports:** state the platform fact in the same breath as the mechanism
that causes it, in the place where it changes the reader's next action, and never lead the
sentence with the word "not".

---

## Q5 — Length, and where they stop

Measured in "how far before the reader is handed off":

- **claudio (110★)** — links to `docs/index.md` on **line 11**, before the install section, and
  again inside Soundpacks (`See docs/soundpacks.md for layout, fallback chains, JSON mappings,
  validation, and git-backed soundpacks`). The README is ~110 lines and covers only: what it is,
  install, daily commands, soundpacks overview, tracking, build/test.
- **starship (59k★)** — hands off with an "Explore the Starship docs" button placed immediately
  before Install, and again at the end of the install steps to
  [starship.rs/config](https://starship.rs/config/) and
  [starship.rs/presets](https://starship.rs/presets/). Everything configurable lives on the
  website, not in the README.
- **catppuccin (19.5k★)** — keeps the palette tables inline (they *are* the product) and pushes
  the 200+ port list into collapsible `<details>` sections. The demarcation is: core identity
  inline, ecosystem folded.
- **ryparker** — never links out at all. Instead it folds `How It Works` and `Creating a Theme`
  into `<details>` blocks. Same effect, no second file to maintain.
- **echook (75★)** — the outlier: enormous, with a collapsible TOC, version history, a 29-row
  statusline segment table, share-to-social badges. It works only because it is explicitly
  addressed to an AI agent rather than a human ("**Humans: don't install or configure echook by
  hand.**"). Not a model for a human-facing README.

**The convergent shape:** the visible README ends after Install → what you get → one How It
Works → customise. Reference material either goes to `docs/` (claudio, starship) or into
`<details>` (ryparker, catppuccin). For a project of this size, `<details>` is the better trade —
it keeps a single file, and the collapsed summary lines double as a table of contents.

Non-obvious detail: ryparker writes `<details><summary><h2 style="display:inline">How It
Works</h2></summary>` so the collapsed section still renders as a heading and still lands in
GitHub's auto-generated outline.

---

## Q6 — Claude Code ecosystem conventions a newcomer would notice missing

Ranked by how loudly the absence would register.

1. **`.claude-plugin/marketplace.json` + `plugin.json`.** Confirmed present in
   [6m1w/claude-sound-fx](https://github.com/6m1w/claude-sound-fx) (`gh api
   repos/6m1w/claude-sound-fx/contents/.claude-plugin` returns both files); lodev09 ships the
   equivalent. Per the [official plugins docs](https://code.claude.com/docs/en/plugins), a plugin
   is a directory with `.claude-plugin/plugin.json` and a `hooks/hooks.json` at the plugin root,
   and hooks migrate over from `settings.json` unchanged — "Copy the `hooks` object from your
   `.claude/settings.json`, since the format is the same." A sound pack that cannot be installed
   with `/plugin install` now reads as pre-2026.
2. **A hook-event table.** Universal. Six of six. Its absence is conspicuous.
3. **A mute / volume control, documented as its own section.** ryparker has `## Muting` with three
   methods plus a Do-Not-Disturb feature that auto-mutes during Zoom/FaceTime/Webex calls; claudio
   has `claudio volume 0.4` / `mute` / `unmute`; 6m1w has `CLAUDE_SOUND_VOLUME`;
   [mikedotcook/claude-sounds](https://github.com/mikedotcook/claude-sounds) is an entire separate
   project that exists only to control hook-sound volume. For an audio product, "how do I make it
   stop" is a top-three reader question and the corpus treats it as first-class.
4. **A slash command.** ryparker ships `/mute` and `/unmute`; 6m1w ships `/sound-fx:setup`;
   lodev09 ships `/sounds`; claudio ships `/claudio`. Controlling the tool without leaving Claude
   Code is expected.
5. **A one-command uninstall.** Every project has one. This repo's current "delete these files,
   then edit settings.json by hand" is the outlier.
6. **An audio-rights / disclaimer paragraph.** Only relevant to packs using copyrighted game
   audio (ryparker, moonshot-partners, lodev09 all carry one). **Not applicable here** — the
   chiptune pack is synthesized from a note manifest and the voice pack is ElevenLabs-generated.
   That is a genuine differentiator worth stating explicitly, because it is the one thing every
   competitor has to apologise for.
7. **`awesome-claude-code` listing.** Submission is via the web-UI issue form only, must be filed
   by a human, and the description must be "written as _descriptions_ - not a sales pitch...
   one line... no emojis"
   ([CONTRIBUTING.md](https://github.com/hesreallyhim/awesome-claude-code/blob/main/CONTRIBUTING.md)).
   Worth writing that one-line description into the repo description field now so it can be
   submitted verbatim.

### The finding that overrides the rest

**`README.txt` has to become `README.md`.** GitHub renders a `.txt` readme inside a `<pre>` block:
no images, no tables, no `<details>`, no links, and critically **no video embed**. Every single
technique in Q2 — the only ones that let a reader experience an audio product before installing
it — requires markdown. For a sound pack, shipping a `.txt` README forfeits the entire demo
surface.

---

## RECOMMENDED OUTLINE for `README.md`

For: a Windows-now / macOS-soon voice-and-chiptune notification pack, aimed at someone who uses
Claude Code daily and has never configured a hook. Hand this straight to the README ticket.

Ordering principle, taken from 6m1w and starship: **feel the problem → hear the product → install
→ what you get → then and only then, mechanism.** Nothing above the fold requires the reader to
know what a hook is.

### 0. Rename `README.txt` → `README.md` — prerequisite, not a section
Without it none of the below renders. Keep `README.txt` deleted, not duplicated.

### 1. Centered hero block
*Why:* the shape five of the six strongest READMEs in the corpus use; establishes this is a
designed product in the first screenful.
*Contains:* small banner or wordmark → 2–3 badges max (license, platform, latest release —
resist echook's badge wall) → `# Claude Code Sound Hooks` → one-line tagline naming the payoff,
not the feature (e.g. "Claude tells you when it's done, so you can look away") → **one quoted
voice line in italics on its own line**, ryparker-style: *"That's finished."*

### 2. The moment, as a blockquote — 2 lines
*Why:* 6m1w's opener is the only thing in the corpus that sells a feel to someone who does not
yet know they want a hook. It works because it describes the reader's afternoon, not the software.
*Contains:* the tab-switching problem. Something like: *You kick off a refactor, switch to your
browser, and forget the terminal exists. Ten minutes later Claude has been waiting on a yes/no
the whole time.* No product name in it.

### 3. One-paragraph product statement
*Why:* immediately answers "so what is it" before the reader scrolls.
*Contains:* two sentences. What it does (a short spoken line when Claude finishes or needs a
decision), and the one-sentence differentiator: every sound here is original — synthesized
chiptune or generated voice — not ripped game audio. Link "Claude Code" to the docs on first
mention, per the universal convention. Do not define "hook" here.

### 4. Demo video — bare `user-attachments` URL on its own line
*Why:* **the highest-value item in this entire document.** The only way to let a reader hear the
product. Currently impossible in `.txt`, and currently missing from every competitor that has a
good theme table.
*Contains:* a 15–25 second screen recording with system audio — a real prompt, Claude working,
"That's finished.", then a question and "Your call." Drag the file into a GitHub issue comment to
mint the URL, paste it bare. Put the chiptune theme in the same clip so both packs are heard.

### 5. `## The Voices` (themes table)
*Why:* the corpus's convergent answer to demoing audio in text, and this project has an unusual
advantage — the voice pack's lines are *already written down* in `ELEVENLABS-VOICE-PROMPT.md`.
Ship them as the demo.
*Contains:* a table per theme. Columns *When it plays | What you hear*. Quote the lines verbatim
in italics: `Stop` → *"Done."* / *"That's finished."* / *"All set."* / *"Back to you."*;
decision-needed → *"Your call."* / *"Question for you."* / *"Waiting on you."* Then a one-line
note that one is picked at random each time so it does not get stale. For chiptune, describe the
shape instead — "rising phrases that resolve" vs "rising phrases left hanging, a musical
question mark" — which is already written well in `PROJECT_INDEX.md`.

### 6. `## Install`
*Why:* the reader is now convinced; give them the shortest path and nothing else.
*Contains:* the numbered click-path for the zip + `install.bat`, kept to the current five steps,
which are already well written for a non-developer. **Immediately under the install block, one
sentence:** "Windows 10 or later. Uses PowerShell, which is already on your PC — nothing else to
install." Fold the SmartScreen "Windows protected your PC" note into a `<details>` labelled
"If Windows shows a blue warning screen" — it is reassurance, and inline it reads as a red flag.
*Flag for a follow-up ticket, not this one:* ship `.claude-plugin/marketplace.json` +
`plugin.json` so this becomes `/plugin marketplace add jasonrundell/claude-code-sound-hooks`.
That is the ecosystem's expected install and the largest single gap versus competitors.

### 7. `## Platform Support` — a table with an "Extra setup?" column
*Why:* the phrasing question in the ticket. 6m1w's framing is the answer, and it is the right
structure for a project that is Windows-now/macOS-soon: a matrix has a row for macOS, so the
status is a documented cell rather than a missing thing.
*Contains:*

| Platform | Works today? | How it plays sound |
| --- | :---: | --- |
| **Windows 10/11** | Yes | PowerShell, built in — nothing to install |
| **macOS** | In progress | Will use `afplay`, built in — [track it in #N](…) |
| **Linux** | Not yet | Needs `paplay`/`aplay` — [PRs welcome](…) |

Open the section with a positive sentence before the table ("Windows works out of the box with
nothing to install. macOS is next."). Name the mechanism in every row — that is what converts a
gap into a plan. Never open a row or sentence with "not supported".

### 8. `## Turning It Off`
*Why:* a first-class section in every audio project surveyed, and the number-one anxiety of
someone installing something that will make noise during a meeting. Placing it before How It
Works signals confidence.
*Contains:* how to mute, how to switch themes (`sound-theme.txt`, one line, takes effect on the
next sound with no restart — a genuinely good feature currently buried at the bottom), and the
one-step uninstall. If a mute switch does not exist yet, add one; the corpus says it is table
stakes.

### 9. `<details>` — `## How It Works`
*Why:* Q3 and Q5 together. The mechanism explanation belongs late and collapsed: available to
the curious, invisible to everyone else. Use ryparker's `<summary><h2 style="display:inline">`
trick so it still appears in GitHub's outline.
*Contains, in this order:* (a) one plain sentence — "Claude Code [hooks](…) let you run a command
when something happens. This installs two." (b) 6m1w's fused arrow diagram, which is a perfect
fit here because it shows the event and the spoken line together:
`Stop ──→ 🔊 "That's finished."` (c) the event table, *Event | When it fires | What you hear*,
including the three categories that exist but are not yet wired (`error`, `subagent-done`,
`session-start`) marked as such — shipped-but-unwired reads as roadmap, and this repo already has
that table in `PROJECT_INDEX.md`. (d) the literal `settings.json` fragment the installer writes,
moonshot-partners style, so the reader can see exactly what was changed on their machine.

### 10. `<details>` — `## Make Your Own Theme`
*Why:* every competitor has this and it drives contribution, but it is for a much smaller reader
than the rest of the page.
*Contains:* the existing `sounds/<name>/` + `install.bat <name>` instructions, plus the chiptune
note-manifest editing guide — both already written in `README.txt` and good. Add that themes
accept `.mp3` and `.wav`, and note the length constraint (`task-complete` clips under ~1.5s,
since the hook waits out the clip on every response) — that is real, hard-won guidance a theme
author needs and nobody else ships.

### 11. Footer
*Why:* short, and one line of it is a competitive advantage.
*Contains:* license; a one-sentence originality note — **"All sounds are original: the chiptune
pack is synthesized from a note manifest in this repo, and the voice pack was generated with
ElevenLabs. No game audio, no rights-holder problem."** Every theme-based competitor carries a
defensive copyright disclaimer instead; state the inverse as a feature. Then contributing, and
the one-line non-salesy description reserved for the `awesome-claude-code` submission.

### Explicitly not included

- **A "Features" bullet list.** The current `README.txt` has nine bullets; only starship uses the
  form, and it earns it at 59k stars with six bullets under a demo GIF. For this audience the
  themes table and How It Works carry the same information with evidence attached.
- **A hook explainer at the top.** Q3 — every project in the corpus defers or omits it, and
  front-loading it makes the reader feel they need to learn something before they are allowed to
  want the product.
- **A table of contents.** Only the two longest READMEs (echook, awesome-claude-code) have one.
  With `<details>` summaries doubling as section markers, this README should not be long enough
  to need it.
