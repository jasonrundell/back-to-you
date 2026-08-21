# Project Index

## Overview

This project gives Claude Code and Cowork a voice. It copies hook scripts and sound packs into the user's `~/.claude`, then wires Claude hook entries into that directory's `settings.json`.

It ships as the npm package `backtoyou`, and there is exactly **one** installer: `bin/cli.js`, reached as `npx backtoyou`. `install.sh`, `install.bat` and `install.command` are shims that check for Node and exec it. They used to be three parallel implementations of the same install, and keeping them in step was this project's largest recurring cost — a shim cannot drift, which closes the question rather than deferring it. See `docs/adr/0001-node-as-a-hard-requirement.md`.

Node is therefore a hard requirement, at install time and at hook runtime on macOS and Linux. The **hooks** are still split by platform — Node on Unix, PowerShell on Windows — because Windows plays audio through `System.Windows.Media.MediaPlayer`, a WPF assembly Node cannot reach. That split is measured, not assumed; the numbers are in the ADR.

Four voice packs ship (`claude`, `gigatron`, `jay-run`, `mistress-of-pain`), one clip per category. Each pack keeps its ElevenLabs Voice Design prompt checked in beside its audio, so a pack can be regenerated or re-voiced without redesigning it.

## Feature Capabilities

- Plays a clip when a turn ends, when Claude needs a decision, and when a turn fails on an API error.
- Detects question-like assistant messages in the `Stop` hook payload and plays a decision-needed clip instead of the task-complete clip.
- Installs every shipped pack, and names the active one in `~/.claude/sound-theme.txt`. Switching rewrites that single line — no reinstall, no restart, because the hooks re-read it on every fire.
- Offers user-made packs alongside the shipped ones: the picker lists the union of what the package ships and what is already under `~/.claude/sounds/`.
- Accepts both `.mp3` and `.wav`, and picks at random among however many clips a category folder holds.
- Rewrites its own `settings.json` entries on every install rather than merging into them, so an upgrade corrects a stale path, a missing timeout, or a matcher an earlier release got wrong. Hooks belonging to the user are untouched.
- Uninstalls with `npx backtoyou --uninstall`, matching what it ships file by file so nothing the user made is deleted.
- Writes the reason to `~/.claude/.backtoyou-playback-error` when playback fails on either platform, rather than falling silent.

## Supported Platforms

All three desktop platforms, with Node.js 18+ the only prerequisite.

- **Windows: Supported.** `play-sound.ps1` / `play-category.ps1`, playing through the .NET `PresentationCore` assembly.
- **macOS: Supported.** `play-sound.js` / `play-category.js`, playing through `afplay`.
- **Linux: Supported.** The same Node hooks, probing a chain of players and using the first that works.

### Why the Linux player chain is ordered the way it is

Settled by the audio research in issue #25 and encoded in `PLAYERS` in `hooks/play-lib.js`. Probe order is `pw-play`, `paplay`, `mpg123`, `play`, `aplay`.

`pw-play` leads because it is the only candidate present by default on both a stock Ubuntu desktop and Fedora Workstation — `paplay` lives in `pulseaudio-utils`, which neither installs. `paplay` stays at rung two anyway, because WSLg exposes a PulseAudio server through a preset `PULSE_SERVER` where `aplay` cannot work at all (no `/dev/snd`); stopping the chain at `pw-play` would break WSL.

Two format gates are mandatory rather than tidy:

- **`aplay` handed an mp3 does not fail.** It replays the compressed bytes as 8 kHz unsigned 8-bit mono noise and exits 0, so in a first-success-wins chain it wins and emits roughly 2.3 seconds of static. It is gated to `.wav`.
- **`mpg123` cannot play wav**, so it needs the inverse gate. Both matter, because the README invites users to drop in either format.

`ffplay` is excluded outright: with no audio device it plays nothing and exits 0, which would satisfy the chain, suppress the error file, and produce exactly the undiagnosable silence this project treats as its worst outcome. `tests/installer.test.js` guards all four of these decisions — do not add it back.

## Repository Structure

```text
.
├── README.md
├── PROJECT_INDEX.md
├── CLAUDE.md                   # project rules for agents
├── CONTEXT.md                  # not present yet; docs/agents/domain.md expects it here
├── ELEVENLABS-VOICE-PROMPT.md  # persona prompt + per-clip script for the `claude` pack
├── LICENSE                     # MIT, code and docs
├── LICENSE-AUDIO               # non-commercial, everything under sounds/
├── NOTICE
├── package.json                # name: backtoyou, bin: bin/cli.js, zero dependencies
├── .gitattributes              # .bat/.ps1 -> CRLF, .sh/.command/.js/.json -> LF, audio binary
├── install.bat                 # Windows shim -> bin\cli.js
├── install.sh                  # macOS/Linux shim -> bin/cli.js
├── install.command             # Finder wrapper around install.sh
├── .github/workflows/
│   └── release.yml             # npm publish via OIDC trusted publishing, plus the download zip
├── assets/
│   ├── banner-light.svg        # README hero, light theme
│   ├── banner-dark.svg         # README hero, dark theme
│   ├── demo.svg                # animated terminal demo in the README
│   └── README-fragment.md      # the <picture> block and its rationale
├── bin/
│   └── cli.js                  # the installer: arg parsing, the picker, the printed output
├── src/
│   ├── plan.js                 # pure planning - no I/O, no console
│   ├── paths.js                # where things live, and what differs per platform
│   ├── install.js              # the effects: copying, backing up, writing
│   ├── settings.js             # reading and rewriting settings.json
│   └── uninstall.js            # taking it all back out again
├── hooks/
│   ├── play-sound.js               # Unix Stop
│   ├── play-category.js            # Unix, all fixed-category events
│   ├── play-lib.js                 # shared by both; never invoked directly
│   ├── play-sound.ps1              # Windows Stop
│   └── play-category.ps1           # Windows, all fixed-category events
├── sounds/                     # 12 mp3s: 4 packs x 3 wired categories
│   ├── claude/                     # the default pack
│   │   ├── task-complete/vo-back-to-you.mp3
│   │   ├── decision-needed/vo-waiting-on-you.mp3
│   │   ├── error/vo-hit-an-error.mp3
│   │   └── elevenlabs-prompt.md    # the Voice Design prompt for this pack
│   ├── gigatron/                   # same shape, plus elevenlabs-prompt.md
│   ├── jay-run/                    # same shape; no prompt checked in yet
│   └── mistress-of-pain/           # same shape, plus elevenlabs-prompt.md
├── docs/
│   ├── adr/
│   │   └── 0001-node-as-a-hard-requirement.md
│   └── agents/
│       ├── issue-tracker.md    # issues live in GitHub Issues, via `gh`
│       └── domain.md           # where the domain docs live
└── tests/
    ├── installer.test.js               # the suite: `npm test`, 51 named cases, no framework
    ├── verify-macos.sh                 # manual macOS release harness, run against a tarball
    └── Test-TaskCompleteRandomness.ps1 # Windows clip distribution, prints a table
```

`tests/` is not in `package.json`'s `files` allowlist, so none of it ships in the tarball. Neither does `assets/`, which is why every image URL in `README.md` is absolute — npm renders that same file on the package page, where relative paths do not resolve.

## Runtime Flow

`bin/cli.js` is the whole surface:

```text
npx backtoyou             pick a voice pack, or switch the active one
npx backtoyou <pack>      activate <pack> without prompting
npx backtoyou --uninstall remove it all again
                          --help, --version, --yes
```

1. **Read the world.** `layout()` resolves every path under `~/.claude`; `readInstallState()` reads `sound-theme.txt` and `.backtoyou-version`; `availablePacks()` returns the shipped packs unioned with whatever is already under `~/.claude/sounds/`, `claude` first.
2. **Choose a pack.** A named argument wins. Otherwise, on a terminal, the numbered picker runs with the active pack as the default. Off a terminal — piped, CI — a fresh run takes `claude` and says so, while a re-run keeps whatever is already active rather than silently switching the pack of anyone automating a reinstall.
3. **Pre-flight.** `checkPack()` requires the pack folder to exist, in the package or in `~/.claude/sounds/`, with clips in both `task-complete` and `decision-needed`. `error` is wired but not required — a pack without it is simply quiet on failures.
4. **Classify the run.** `planEffects()` returns one of four kinds: `fresh`, `upgrade`, `switch`, `same`. Only `fresh` and `upgrade` do a full install; `switch` writes one line; `same` prints "Nothing to do" and exits.
5. **Full install** (`runFullInstall`), in order: check every hook file exists in the package *before* writing anything; create `hooks/` and `sounds/`; copy every pack in; delete retired clips and the stale subagent marker; copy the platform's hook files; back `settings.json` up; rewrite our entries into it; write `.backtoyou-version`.
6. **Write the active pack** to `sound-theme.txt`, and tell the user to restart Claude Code.
7. **At runtime**, Claude Code or Cowork runs the configured hooks. Each reads `sound-theme.txt` fresh, then plays a random clip from `sounds/<pack>/<category>/`.

If the `settings.json` rewrite throws, the backup is copied back over it and the error is reported — the file is never left half-written, because the write itself goes to a temp file and is renamed into place.

## Installed Locations

Windows installs the `.ps1` hooks, macOS and Linux the `.js` ones. Everything else is identical, on every platform: Node's `os.homedir()` and PowerShell's `$env:USERPROFILE` resolve to the same place.

```text
~/.claude/
├── hooks/
│   ├── play-sound.js        |  play-sound.ps1
│   ├── play-category.js     |  play-category.ps1
│   └── play-lib.js          |  (Windows has no support file)
├── settings.json
├── settings.json.bak.<timestamp>   # written before every merge and every uninstall
├── sound-theme.txt                 # one line naming the active pack
├── .backtoyou-version              # what installed, for the fresh/upgrade decision
├── .backtoyou-playback-error       # written only when playback fails, either platform
└── sounds/
    ├── claude/                     # task-complete/  decision-needed/  error/
    ├── gigatron/
    ├── jay-run/
    ├── mistress-of-pain/
    └── <anything the user made>    # never touched by installing or uninstalling
```

The version marker is a dotfile rather than a second line in `sound-theme.txt`, deliberately: the README documents that file as one bare pack name, and hand-editing it is a supported way to switch packs.

Hooks are installed at the user level, so the sounds apply to every Claude Code and Cowork session for that user. Because installing copies without deleting, a pack left over from an earlier version stays on disk until removed by hand or by `--uninstall`.

## File Responsibilities

### `README.md`

User-facing pitch, installation, platform support, uninstall, and theming documentation. It is also what npm renders on the package page, which is why its image URLs are absolute.

### `bin/cli.js`

Argument parsing, the interactive picker, the uninstall confirmation, and every line of printed output. It holds no rules of its own — it asks `src/plan.js` what should happen and `src/install.js` / `src/uninstall.js` to do it.

The uninstall prompt is the one confirmation in the CLI, and its non-TTY rule is deliberately the **opposite** of installing's: an install without a terminal proceeds and says so, because it is safe and idempotent, but a deletion that proceeds unasked in a script is how someone loses voice packs they made. `--uninstall` off a terminal fails unless `--yes` is passed.

### `src/plan.js`

Pure planning: no I/O, no console. Takes a description of the world and returns what should happen — `classifyRun`, `resolvePack`, `defaultPack`, `readChoice`, `planEffects`. It is pure so the decision table can be tested exhaustively without a filesystem, which is most of what `tests/installer.test.js` exercises.

### `src/paths.js`

Every path under `~/.claude`, and `hookFacts()` — the one place that knows which hook files this platform installs and how `settings.json` invokes them. Windows gets `powershell -NoProfile -ExecutionPolicy Bypass -File "<path>"`; `-NoProfile` matters, or a user profile would run on every single response. Unix gets `node "<path>"`.

**`node <path>` rather than a shebang plus `chmod +x`.** Without the execute bit a shebang hook is a silent no-op — nothing errors, there is simply never any sound — which this project treats as its worst failure mode. Naming the interpreter removes the failure mode rather than guarding against it.

It also carries the files this project no longer uses but still cleans up: `.subagent-done-at`, the marker the hooks wrote up to 1.2.0; `back-to-you-hook.log`, a debug artifact from an August 2026 build; and `LEGACY_CLIPS`, the exact relative paths of the retired `subagent-done` clip in all four packs.

### `src/install.js`

Everything that touches disk on the way in. Notable choices:

- **`availablePacks()` unions shipped packs with installed ones.** That is what keeps a custom pack visible under `npx`, where there is no checkout to hold it.
- **Every hook file is checked to exist before anything is written**, including `play-lib.js`, which `settings.json` never names but both Unix hooks require. A missing support file would break the hooks just as completely while being far less obvious.
- **All packs are copied, not just the chosen one**, so installing one never deletes a custom one.
- **Retired clips are deleted on install.** Copying never deletes, so a category this package has retired would sit in `~/.claude` for ever otherwise — and play again the moment someone wired the event back by hand. Unwiring an event is only half of retiring it.
- `copyDir` is hand-rolled rather than `fs.cpSync`, which still warns as experimental on Node 18 and 20.

### `src/settings.js`

Reading and rewriting `settings.json`. A direct port of the deleted `tools/merge-settings.js` (JXA) and its PowerShell twin, both of which existed only because there was no JSON parser available at install time; the semantics are theirs and are deliberate.

- **It rewrites rather than merges.** `stripOwnedHooks` removes every entry this project owns across every event, then the current plan is written back. That is what lets an upgrade correct an entry an older version got wrong, and what retires an event outright — `SubagentStop` was wired up to 1.2.0, and an upgrade unwires it with nothing asked of the user. An earlier version skipped any event that already had an entry, so none of those could ever be fixed.
- **`OWNED_SCRIPTS` lists every script this project has ever installed**, on every platform: the `.sh` names so a pre-Node macOS install is unwired instead of left wired alongside the new entries, the `.ps1` names for the same reason in reverse, and `play-sound-decision.sh`, an early build's unmatched `Notification` hook that gave upgrading users two clips per prompt. A group holding a hook of the user's own is kept, minus ours; its matcher is theirs.
- **A UTF-8 BOM is stripped to parse and restored on write.** PowerShell 5.1 writes UTF-8 *with* BOM by default, so every `settings.json` the old `merge-settings.ps1` ever wrote is likely to carry one. `JSON.parse` rejects it outright, where the JXA and PowerShell readers both tolerated it. The file's encoding signature is the user's, not ours to normalise away.
- **Every entry carries `timeout: 10`.** Claude Code's default for command hooks is ten minutes, which is no safety net at all for something attached to the end of every response.
- Writes go to `<file>.tmp-<pid>` and are renamed into place. Events left empty are dropped, so unwiring an event does not leave `"SomeEvent": []` behind.

`editSettings` is shared by installing and uninstalling, so the delicate parts — BOM handling, refusing to clobber a malformed file, the atomic write — exist once.

### `src/uninstall.js`

The governing rule is that nothing the user made is ever deleted. That is not only whole custom packs: the README invites people to drop extra takes into a shipped pack's folder, so user content lives inside our own directories too.

Everything under `sounds/` is therefore matched by **exact relative path** against what the package ships, never by directory name — `shippedClips()` walks the package's own `sounds/` to build that list, so it cannot drift from what was installed. Empty folders are pruned afterwards, and a folder still holding a take of the user's survives. `settings.json` backups are kept deliberately: they hold the user's prior configuration and are the recovery path if this went wrong.

`removeLegacyClips` is exported from here and called by *installing* as well, which is why the two halves of retiring a category live together.

### `hooks/play-lib.js`

Shared by both Unix hooks: the active pack, random clip selection, playback, and payload reading.

The old `.sh` hooks duplicated this logic on purpose — a third file for the installer to keep in step, and the cost of a second process on a path that runs at the end of every response. The second reason does not survive the move to Node (`require` is in-process), and the first is worth paying once to avoid two copies of a five-player probe chain drifting apart.

Playback blocks until the clip ends, which is how `afplay`, `pw-play` and `paplay` all behave natively; `spawnSync`'s timeout gives the six-second watchdog for free. A watchdog kill counts as success, because it means the clip *was* playing. When every candidate is missing or fails, `noteFailure()` writes the reason to `~/.claude/.backtoyou-playback-error` — overwritten rather than appended, since a broken setup would grow that file without bound. The PowerShell hooks write the same one-line file, so a mute install is diagnosable the same way on either platform.

### `hooks/play-sound.js` and `hooks/play-sound.ps1`

Claude `Stop` hook. Reads the payload from standard input, checks whether `last_assistant_message` ends in a question, and plays either a decision-needed or a task-complete clip.

Both test the whole message with `\?[^a-zA-Z0-9]*$` — a question mark followed only by non-alphanumerics, so `right?"` and `...ok?)` both count. **The two must stay byte-identical in behaviour**, and `tests/installer.test.js` asserts the Node half against the PowerShell regex explicitly.

The deleted `.sh` hook classified on the **last non-empty line** instead, because `grep` anchors `$` at the end of every line and testing the whole message there would have fired decision-needed for any multi-line answer merely containing a question. Node's regex has no such problem, so the Unix and Windows halves now agree by construction rather than by translation.

**Both used to check for a recent subagent-done marker and skip their own clip.** That existed because `SubagentStop` fired moments before `Stop` when a subagent was the turn's last action, giving two "done" clips for one completion. `SubagentStop` is unwired as of 1.3.0 and the category is gone, so there is nothing left to double up with; `.subagent-done-at` is no longer written or read, and installing deletes any left behind.

### `hooks/play-category.js` and `hooks/play-category.ps1`

The test suite (`npm test` / `node tests/installer.test.js`), using bare `node:assert` — no framework, matching the package's zero-dependency policy. Covers `src/plan.js`, `src/settings.js` (merge/unwire semantics, BOM handling, ownership of legacy script names), `src/install.js`/`src/uninstall.js` (full install/uninstall round trips, legacy-clip cleanup, survivor detection), and the `hooks/play-sound.js` classifier and `hooks/play-lib.js` player-gating logic.

```text
node play-category.js decision-needed            # Notification
powershell -File play-category.ps1 error         # StopFailure
```

One parameterised script rather than one per event: the fixed-category events differ only in which folder they read.

Both drain standard input without parsing it. Claude Code writes JSON to the hook's stdin, and leaving it unread risks blocking the writer once a payload outgrows the pipe buffer — `PreToolUse`, the largest payload wired here, is the one that can. The PowerShell version guards that on `IsInputRedirected`, or running the script by hand would sit waiting for EOF instead of playing a sound.

All four hook scripts exit quietly — and with status 0 — on every path, including every error path. A non-zero exit surfaces a hook error in the transcript, which a missing sound file does not warrant, and on `PreToolUse` it does considerably worse than that (see below).

### Why only Windows waits for the clip duration, and why it pumps a dispatcher to do it

The PowerShell hooks wait for `NaturalDuration` to resolve before sleeping out the clip. That exists **only** because .NET's `MediaPlayer.Play()` is asynchronous — without it the script would exit before the sound finished.

The waiting is not a plain `Start-Sleep`, though. `MediaPlayer` marshals its events — the duration becoming known, and `MediaFailed` — through the calling thread's `Dispatcher`, and a plain script host never pumps one. Verified experimentally: without pumping, `NaturalDuration` never resolves and `MediaFailed` never fires, which is why every Windows playback failure used to vanish silently. `Wait-Dispatcher` pushes a `DispatcherFrame` for the duration of each wait instead, and both work. Audio rendering never needed any of this — the underlying media session plays independently of the callback — which is exactly why the bug presented as no error and no sound.

The Unix players all block until the clip ends, so the Node hooks need none of that machinery. The asymmetry is correct and should not be "fixed". Both platforms cap playback at roughly six seconds, because a user can drop a three-minute file into a pack folder and this runs at the end of every response — and both write `~/.claude/.backtoyou-playback-error` when playback fails: an `Add-Type` failure, a `MediaFailed` event or any other exception on Windows, an exhausted player chain on Unix.

### `install.sh`, `install.bat`, `install.command`

Shims. Each checks that `node` is on `PATH`, prints a one-line "install it from nodejs.org" message if not, and execs `bin/cli.js` with whatever arguments it was given.

`install.bat` and `install.command` both `pause` before exiting, which is the entire reason they exist rather than a bare `npx`: double-clicked from Explorer or Finder, the window would otherwise close before the output could be read.

They run straight from a clone or an unzipped release with no `npm install` first — which is what makes **zero runtime dependencies binding rather than a preference**.

### `.github/workflows/release.yml`

Publishes to npm and attaches the download zip, from one published GitHub Release. Nothing goes out on a plain tag push: drafting a release and then publishing it is the deliberate human step, because `npm publish` cannot be taken back.

Auth is npm **trusted publishing (OIDC)** — no `NPM_TOKEN` to leak or rotate. The trusted publisher is configured against this repository *and this filename*; renaming `release.yml` breaks publishing until the npm setting is updated to match.

**`setup-node` must not be given `registry-url`.** That input writes an `_authToken` line into a temporary `.npmrc`; with no token secret — and there is none, by design — it expands to an empty string, npm reads the line as "auth is already configured", never starts the OIDC exchange, and publishes with empty credentials. The registry answers an unauthenticated `PUT` with a 404, so the failure reads as "package not found" rather than "not logged in". That is exactly how the v1.3.0 release failed. A `workflow_dispatch`-only step decodes and prints the `repository` and `workflow_ref` claims the OIDC token would present, because npm reports every trusted-publishing failure as a bare `ENEEDAUTH` or 404 with no diagnostics at all.

Four checks guard mistakes that have already happened once:

- **No auth token may reach the effective npmrc.** If anything puts one back, npm silently skips OIDC and the publish fails hundreds of lines later with that misleading 404. This fails early instead, where the message says what is actually wrong.
- **The tag must match `package.json`.** A published version can never be replaced, only superseded.
- **`LICENSE-AUDIO` and `NOTICE` must be in the tarball.** They are exactly the files `npm-packlist` drops once a `files` allowlist exists — `LICENSE` is force-included by its always-ship glob, but `-AUDIO` is a filename suffix rather than an extension, and `NOTICE` was never in that set. Shipping the mp3s without their terms would breach `LICENSE-AUDIO` condition 5, silently.
- **The zip must use forward slashes.** The v1.1.1 zip stored 26 of 33 entries with backslashes, so macOS extracted it as a flat pile of files literally named `hooks\play-sound.sh`. It went unnoticed across three releases because nothing checked.

### `ELEVENLABS-VOICE-PROMPT.md` and `sounds/*/elevenlabs-prompt.md`

`ELEVENLABS-VOICE-PROMPT.md` is the full recipe for the `claude` pack: the Voice Design prompt, the ElevenLabs model and settings, the exact line spoken by each clip, and the post-export trimming and normalization notes. It also keeps the retired `subagent-done` and `session-start` recipes, for anyone who wants to wire those events themselves. It is MIT-licensed on purpose — the audio is not, so the recipe is the escape hatch for anyone the audio terms do not suit.

The per-pack `elevenlabs-prompt.md` files hold just the voice description for that pack. `CLAUDE.md` caps those descriptions at **500 characters**, which is an ElevenLabs limit; check with `wc -c` before committing one. `jay-run` has no prompt checked in yet.

## Wired Hook Events

Four entries, built by `hookPlan()` in `src/settings.js`.

| Event | Matcher | Category | Script |
| --- | --- | --- | --- |
| `Stop` | none | `task-complete` or `decision-needed` | `play-sound` |
| `Notification` | `permission_prompt\|agent_needs_input\|elicitation_dialog` | `decision-needed` | `play-category` |
| `PreToolUse` | `AskUserQuestion` | `decision-needed` | `play-category` |
| `StopFailure` | none | `error` | `play-category` |

Six decisions behind that table, each verified against the hook reference:

- **`Notification` is matched to requests for input only.** Unmatched it fires on all eight notification types, including `auth_success` — a successful login announcing *"Waiting on you."* — and `agent_completed`, which is a subagent announcing itself and is out for the same reason `SubagentStop` is. The lifecycle types `elicitation_complete` and `elicitation_response` report that a request *finished*, so they stay silent; `elicitation_dialog` is a real request and does not. `idle_prompt` is deliberately excluded: it fires on a timer rather than on a question, so it nags rather than signals.
- **`PreToolUse` on `AskUserQuestion` exists because the multiple-choice picker has no notification type of its own.** Without it, the single most decision-shaped moment in the product would be silent.

  > **This is the one hook that can break Claude Code.** `PreToolUse` can *block* the tool call: exit code 2 means "do not do this". A hook here that exits non-zero stops the question from being asked at all. Both `play-category` scripts exit 0 unconditionally, on every path including every error path, and **must stay that way**. Each carries an explicit `exit 0` / `process.exit(0)` for exactly this reason — without it the PowerShell process inherits whatever `$LASTEXITCODE` happened to be.

- **`SessionStart` is deliberately not wired.** It was, matched to `startup` alone so the greeting would not replay on `resume`, `clear`, `compact`, or `fork`. That was not enough. `startup` means every new **session**, not every app launch, and short-lived sessions are common: instrumenting the hook over a six-hour run caught 25 `SessionStart:startup` events — about four an hour, **69% of every sound heard**, with bursts as tight as four in 43 seconds, and 48% of them from a bare `$HOME` cwd rather than any project. Subagents are *not* the cause; none of the 25 carried an `agent_id`. The greeting was also the least useful clip in the set — a session starting is the one moment the terminal already has your attention, which is precisely what `task-complete` and `decision-needed` exist to cover when it does not.
- **`SubagentStop` is deliberately not wired**, as of 1.3.0, and the `subagent-done` category is retired with it. It was wired, whispering once per subagent, with `play-sound.*` suppressing its own clip when `Stop` followed within five seconds — because a subagent finishing as the turn's last action played two "done" clips for one completion. The suppression worked; the sound was still the wrong idea. A subagent finishing is not a moment that wants the user back, the turn is still running, and a turn that fans out to several of them announced every one. Installing removes the clip as well as the entry, and `src/paths.js` carries the retired paths so an upgrade cleans up after the older version.
- **`StopFailure` does not mean "Claude's work failed".** It fires when a turn ends on an **API error** — rate limit, auth failure, server error. Still the right trigger for the `error` clips, but not what the name suggests. It also cannot block: its output and exit code are ignored, which suits a hook that only makes a noise.
- **`PostToolUseFailure` is deliberately not wired.** It fires on *every* failed tool call, including a `grep` that matches nothing and a red test run. An error sound there is a constant buzz and is the kind of thing that gets a project uninstalled on day one.

To wire a new event, add a line to `hookPlan()` and nothing else — one file, one platform-independent list, since `hookFacts()` already supplies the per-platform invocation. A new script is needed only if the event has to choose its own category the way `Stop` does.

### Turning a sound off

Every hook exits quietly when its category folder is missing or empty. **Deleting the clips from a category is the supported way to disable it** — no settings edit, no reinstall, and it survives upgrades, since installing copies over what it ships without deleting anything else and uninstalling matches by exact path. Removing the hook entry from `settings.json` also works, and is what a user should do to reclaim the latency of the `Stop` hook entirely.

## Testing

`npm test` runs `tests/installer.test.js`: 51 named cases, `node:assert` only, no framework — the package has zero runtime dependencies and there is no reason for the tests to add any. Every filesystem test runs against an `fs.mkdtempSync` sandbox, and the settings-merge tests use a fixed set of Unix `hookFacts` so the merge is testable on any host platform.

It covers the plan table, the settings rewrite (including BOM round-tripping, third-party hook survival, and upgrading from a `.sh` install), install and uninstall effects, `Stop` classification against the PowerShell regex, and the player probe order. One test reads the **real** `~/.claude/settings.json` on the machine running it, if there is one, and asserts it survives a merge semantically intact.

`tests/verify-macos.sh` is the manual release harness: it takes a `npm pack` tarball, installs it into a sandboxed `HOME`, and walks cold install, playback, hook latency, pack switching, upgrade from an older install, uninstall, and the shims — printing a report to paste onto the release issue, with the checks a machine cannot make (is the clip *audible*, is it the *right* clip) called out to answer by ear.

Its upgrade step is seeded twice, because there are two populations to upgrade. `.sh` installs are v1.1.1 and earlier — clone-only, never on npm. 1.2.0 is the Node CLI and the only version npm has served, so that is the shape nearly every real upgrade starts from. Both wired `SubagentStop`, and the 1.2.0 seed also carries the retired clip and the stale `.subagent-done-at` marker on disk, since unwiring the event is only half of what the retirement has to do.

`tests/Test-TaskCompleteRandomness.ps1` mirrors the hook's random selection and prints a markdown distribution table. It does not play audio. Defaults to the installed `%USERPROFILE%\.claude\sounds\claude\task-complete`; override with `-SoundDirectory`.

## Maintenance Notes

- **Change both hook implementations together.** `play-sound.js` and `play-sound.ps1` must classify identically, and `play-category.js` and `play-category.ps1` must behave identically. Everything *above* the hooks is now single-implementation, so this is the only place parity still has to be maintained by hand — and it is the most likely way this project breaks.
- **Zero runtime dependencies is binding, not a preference.** `install.sh` and `install.bat` exec `node bin/cli.js` straight out of a clone or an unzipped folder, with no `npm install` first. Adding a dependency breaks both.
- **Renaming a hook script means adding the old name to `OWNED_SCRIPTS`** in `src/settings.js`, or upgrading users keep the old entry wired alongside the new one and hear two clips. That list is also what `src/uninstall.js` deletes from `~/.claude/hooks`, so the two halves cannot drift.
- **Retiring a clip means adding it to `LEGACY_CLIPS`** in `src/paths.js`, by exact relative path. Unwiring the event is only half the job — installing must take the audio off the machine too.
- **`~/.claude` is a cross-platform compatibility surface.** Both implementations share it, and a user can move a machine or a home directory between platforms. Anything either hook writes there is a contract.
- Keep `task-complete` clips short. The `Stop` hook blocks for the clip's real duration on every response, so long clips are felt as latency. Roughly 1.5 seconds is the practical ceiling, and there is a six-second hard cap behind it.
- Keep `install.bat` ASCII-only. `cmd` mis-parses `::` comment lines containing non-ASCII characters when the file has LF endings.
- **Never let the shell scripts acquire CRLF endings.** `.gitattributes` pins `.bat`/`.ps1` to CRLF and `.sh`/`.command`/`.js`/`.json` to LF. A CRLF shebang makes `sh` fail with `bad interpreter: /bin/sh^M`, which is a baffling error to hand a user. Check the staged blob, not just the working copy: `git cat-file -p ":install.sh" | tr -cd '\r' | wc -c` must print 0.
- **`install.sh` and `install.command` must keep their executable bit in git** (`100755`). Verify with `git ls-files -s`. Without it, a fresh clone cannot run `./install.sh` and `install.command` will not launch from Finder.
- **Do not rename `.github/workflows/release.yml`.** npm trusted publishing is configured against that exact filename.
- Keep `README.md` and this index in sync when hook behaviour, install steps, packs, or supported platforms change.
- Validate Windows changes on Windows. `npm test` runs everywhere and covers the Node half thoroughly, but nothing in it executes PowerShell, and `tests/verify-macos.sh` needs a Mac.
