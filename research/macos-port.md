# macOS port research — audio playback and settings merge without PowerShell

Research for [issue #5](https://github.com/jasonrundell/claude-code-sound-hooks/issues/5). Part of #1.

**Location note:** the repo had no existing convention for research notes (no `docs/`, no `notes/`,
no ADR folder — only `README.txt` and `PROJECT_INDEX.md` at the root). This file establishes
`research/` as the place for them.

---

## How to read this document

The development machine is Windows. **Nothing here was verified by running it on a Mac.** Every
claim is therefore tagged:

| Tag | Meaning |
| --- | --- |
| **CONFIRMED** | Stated in a primary source — Anthropic's official Claude Code docs, an Apple man page, Apple developer/support documentation, or an Apple employee posting officially on Apple Developer Forums. URL given. |
| **INFERRED** | Follows from a primary source but the source does not say it outright. The reasoning is shown so it can be checked. |
| **UNCONFIRMED** | Could not be established from a primary source. Must be tested on real Mac hardware before the port ships. Every one of these is repeated in [§9](#9-assumptions-that-must-be-verified-on-real-mac-hardware). |

Where a widely-repeated "fact" turned out not to have a primary source behind it, it is written up
as UNCONFIRMED rather than stated flatly. There are a few of those, and two of them are load-bearing.

**A note on man page sources.** Apple does not publish its current man pages on the web. The mirror
used throughout is <https://keith.github.io/xcode-man-pages/>, which renders the man pages shipped
in Xcode and the macOS base system. It is a faithful mirror rather than a first-party host, so man
page content is marked CONFIRMED but the URL is a mirror. Anything that depends on a man page being
*complete* (rather than on a specific line existing) is treated with suspicion — see §1.

---

## 0. Summary of the decisions this research forces

Four findings change the shape of the port. If you read nothing else, read these.

1. **Do not use `python3`.** Apple states outright that macOS does not ship Python. `/usr/bin/python3`
   is a developer-tools trampoline that pops a GUI dialog on a stock machine. Using it in `install.sh`
   would break the installer for every user who has never installed Xcode. → §3.
2. **Use `osascript -l JavaScript` for the settings merge.** It is the only stock-macOS tool with
   correct JSON semantics. `plutil` is a strong second but cannot represent JSON `null`. → §3.
3. **`last_assistant_message` is real and documented, on both `Stop` and `SubagentStop`.** The docs
   explicitly say to prefer it over reading the transcript. The Windows question-detection design is
   correct and ports over. But the regex needs one change — `$` means something different in
   `grep` than in PowerShell's `-match`. → §5.
4. **The Gatekeeper story for a `.command` file is not the Gatekeeper story for an app**, and the
   README should not pretend otherwise. The best answer is to make quarantine never happen
   (`git clone`), and document `xattr -d` as the fix rather than the "Open Anyway" dance. → §6.

`StopFailure` and `PostToolUseFailure` — which `PROJECT_INDEX.md` guessed at — both turned out to be
real, current event names. But `StopFailure` does not mean what the index assumes. → §7.

---

## 1. Audio playback: `afplay`

### 1.1 Is it on a stock macOS install?

**INFERRED — high confidence, but not formally documented.**

There is no Apple-published index of which command-line tools ship with which macOS release. Apple's
own DTS engineer says so directly:

> "I'm not aware of any definitive index of command-line tools installed by OS version."
>
> — Quinn "The Eskimo!", Apple Developer Technical Support,
> <https://developer.apple.com/forums/thread/702210>

That same post contains the warning that matters most for this port — some `/usr/bin` entries are not
real tools at all:

> "many command-line tools are trampolines for tools that embedded inside Xcode. For example,
> `/usr/bin/nm` is present on a customer release of macOS 12 but is just a trampoline that prompts
> you to install the developer tools:
>
> ```
> % nm
> xcode-select: note: no developer tools were found at '/Applications/Xcode.app', requesting install.
> Choose an option in the dialog to download the command line developer tools.
> ```
> "
>
> — <https://developer.apple.com/forums/thread/702210>

So "the binary exists at `/usr/bin/x`" does not imply "running it works on a stock Mac". This is
exactly the trap that `python3` falls into (§3.1).

`afplay` is *not* a developer tool — it is part of the base system's Core Audio tooling alongside
`afinfo` and `afconvert`, and its man page ships in the base OS man path. The trampoline mechanism
applies to Xcode-hosted tools. So `afplay` is almost certainly a real base-OS binary.

**But this is inference, not documentation.** The installer must not assume it.

> **Mitigation (cheap, do it anyway):** `install.sh` runs `command -v afplay >/dev/null || { … }` as a
> pre-flight check and refuses to install with a clear message if it is missing. This costs one line
> and removes the risk entirely. The hook scripts should degrade silently (exit 0) rather than error.

### 1.2 Does it block until the clip finishes?

**UNCONFIRMED — and this is load-bearing.**

The shipped man page is famously minimal. In full, it is:

```
AFPLAY(1)                   General Commands Manual                  AFPLAY(1)

NAME
     afplay — Audio File Play

SYNOPSIS
     afplay [-h] audiofile

DESCRIPTION
     Audio File Play plays an audio file to the default audio output

OPTIONS
     -h      print help text

February 13, 2007                     Darwin
```

— <https://keith.github.io/xcode-man-pages/afplay.1.html> (dated February 13, 2007; source "Darwin")

The man page says **nothing** about blocking, and nothing about supported formats. It is also
demonstrably out of date relative to the binary: the tool's own `--help` output (per multiple
secondary sources, e.g. <https://ss64.com/mac/afplay.html>) lists options the man page omits entirely:

```
{-v | --volume} VOLUME     set the volume for playback of the file
{-t | --time} TIME         play for TIME seconds
{-r | --rate} RATE         play at playback rate
{-q | --rQuality} QUALITY  set the quality used for rate-scaled playback
{-d | --debug}             debug print output
{-h | --help}              print help
```

**The argument that it blocks:** a `-t / --time TIME` option meaning "play for TIME seconds" is
meaningless in a tool that returns immediately — you cannot bound the duration of a process that has
already exited. The existence of `-t` is therefore strong evidence that `afplay` runs in the
foreground for the length of playback.

That is a good argument. It is not a citation. **Verify on hardware** with:

```sh
time afplay ~/.claude/sounds/chiptune/task-complete/chip-fanfare.wav
```

If `real` matches the clip length, it blocks. If it returns in ~0.0s, it does not, and the port needs
a different approach (see §2.3).

### 1.3 Does it handle both `.mp3` and `.wav`?

**INFERRED — high confidence.**

The man page does not list formats. `afplay` is built on AudioToolbox's Audio File Services, whose
`AudioFileTypeID` constants — the definitive list of container formats the framework reads — include
both:

- `kAudioFileWAVEType` — "Microsoft WAVE file"
- `kAudioFileMP3Type` — "MPEG Audio Layer 3 (.mp3) file"

— <https://developer.apple.com/documentation/audiotoolbox/audiofiletypeid>

(Also in that list: AIFF, AIFC, CAF, M4A, MPEG-4, AAC ADTS, AC-3, AMR, MP1, MP2, Sound Designer II,
NeXT/Sun.)

The gap: Apple does not document that `afplay` is implemented on Audio File Services. The inference is
from the shared `af` prefix and the shared toolchain (`afinfo`, `afconvert`). Practically, the shipped
`chiptune` theme is 100% `.wav`, so **the `.mp3` path is not on the critical path for the port** —
it only matters for user-supplied themes. Treat `.wav` as CONFIRMED-enough and `.mp3` as
UNCONFIRMED-but-very-likely.

### 1.4 First-run permission prompt?

**UNCONFIRMED — expected to be none.**

macOS TCC (Transparency, Consent and Control) gates *audio input* (Microphone) and screen recording.
There is no TCC class for audio *output*; Apple's privacy settings expose no "speakers" permission.
No Apple documentation was found describing any consent prompt for playing sound.

**However**, two adjacent prompts are plausible and should be watched for on first run:

- If the hook script or Terminal touches a protected location (`~/Documents`, `~/Desktop`,
  `~/Downloads`), macOS prompts for file access. `~/.claude/` is **not** a protected location, so this
  should not fire. Worth confirming.
- Nothing in the recommended design uses Apple Events to control another app, so no Automation
  consent prompt should appear. Note that this is a reason to prefer the ObjC-bridge JXA approach in
  §3.4 over anything that scripts an application.

---

## 2. Duration-aware waiting

### 2.1 What the Windows version does, and why

`hooks/play-sound.ps1` opens the file with `System.Windows.Media.MediaPlayer`, polls up to 2s for
`NaturalDuration`, plays, then `Start-Sleep`s for the real duration + 150ms, capped at 6000ms. The
whole apparatus exists because .NET's `MediaPlayer.Play()` is **asynchronous** — the script would exit
and the process would be torn down mid-sound if it did not deliberately wait.

### 2.2 On macOS you get it for free — and should delete the machinery

**INFERRED, contingent on §1.2.**

If `afplay` blocks (§1.2), the entire duration-detection apparatus is unnecessary. The macOS hook is:

```sh
afplay "$f"
```

and the hook naturally lives exactly as long as the sound. This is strictly better than the Windows
version: no 2-second duration poll, no `+150ms` fudge, no 6-second cap, no failure mode where the
duration is unavailable and it falls back to a fixed 4000ms.

**Recommendation: do not port the duration logic to macOS.** Porting it would be reimplementing a
workaround for a problem that does not exist on the platform. The two implementations *should* differ
here, and `PROJECT_INDEX.md` should say why, so a future reader does not "fix" the asymmetry.

### 2.3 `afinfo`, if it turns out to be needed

Only relevant if §1.2 fails and `afplay` returns immediately.

```
AFINFO(1)                   General Commands Manual                  AFINFO(1)

NAME
     afinfo — Audio File Info

SYNOPSIS
     afinfo audiofile

DESCRIPTION
     Audio File Info prints out information about an audio file to stdout
```

— <https://keith.github.io/xcode-man-pages/afinfo.1.html> (dated February 13, 2007)

The man page confirms the tool exists and writes to stdout. It does **not** document the output
format, and does not confirm that duration is among the fields. **UNCONFIRMED**: the widely-reported
output line is `estimated duration: 1.234 sec`, parseable with `awk '/estimated duration/ {print $3}'`.

If `afplay` does not block, the fallback ordering is:

1. `afplay -t <duration> "$f"` — if `-t` makes it block for that long. Untested.
2. `afplay "$f" & sleep <duration-from-afinfo>; wait` — needs afinfo's format confirmed.
3. `afplay "$f" & wait` — if it backgrounds cleanly, `wait` restores blocking with no duration math
   at all. **Try this first**; it is the smallest change and needs no duration parsing.

### 2.4 A caution about how long a Stop hook should block

The Windows hook caps its wait at 6 seconds. Keep an equivalent cap on macOS even though `afplay`
makes it unnecessary for the shipped theme — a user can drop a 3-minute MP3 into a theme folder.

Claude Code's default timeout for `command` hooks is **10 minutes**
(<https://code.claude.com/docs/en/hooks>), which is far too generous to act as a safety net. Set an
explicit short `timeout` on the hook entry in `settings.json` (see §8.2) *and* guard in the script:

```sh
# belt and braces: never hold the turn open for more than ~6s
( afplay "$f" & p=$!; ( sleep 6; kill $p 2>/dev/null ) & wait $p ) 2>/dev/null
```

Whether a blocking Stop hook visibly stalls the Claude Code UI is **UNCONFIRMED** — the docs do not
say. The Windows version has shipped with a 6s worst case, so this is a known-acceptable envelope.

---

## 3. Settings merge without clobbering the user's hooks

This is the highest-risk part of the port. `~/.claude/settings.json` is a file the user owns and may
have hand-edited. Corrupting it breaks their Claude Code install, not just the sounds.

### 3.1 Is `python3` present by default on current macOS? **No. Definitively no.**

**CONFIRMED.** This is the single most important finding in this document, and the answer is the
opposite of what most people assume.

Apple's Developer Technical Support states it flatly, in a thread about macOS 15.5 (Sequoia):

> "macOS does not come with a built-in copy of Python [1]. Given that, we recommend that you install
> Python either from its website or using a package manager like Homebrew."
>
> "[1] There are a couple of complicating factors here:
>   - Historically macOS *did* ship with Python.
>   - Apple's developer tools include a copy of Python, but that copy is an implementation detail and
>     isn't really targeted at Python developers."
>
> — Quinn "The Eskimo!", Apple DTS, <https://developer.apple.com/forums/thread/790807>

Read carefully, that says: Python 3 comes with the **Command Line Tools**, not with macOS. On a Mac
that has never had Xcode or the Command Line Tools installed, `/usr/bin/python3` is a trampoline of
exactly the kind described in §1.1 — running it does not run Python, it pops a GUI dialog:

> *"The 'python3' command requires the command line developer tools. Would you like to install the
> tools now?"*

**What this means for `install.sh`:** a Python-based merge would appear to work on every developer's
machine (they all have Xcode) and fail on a clean consumer Mac with a modal dialog and a
non-functional install. It is the worst possible failure mode — invisible during development,
100% reproducible for the target user.

The direction of travel confirms it. From the macOS Catalina 10.15 release notes, under
**Scripting Language Runtimes → Deprecations**:

> "Scripting language runtimes such as Python, Ruby, and Perl are included in macOS for compatibility
> with legacy software. Future versions of macOS won't include scripting language runtimes by default,
> and might require you to install additional packages. If your software depends on scripting
> languages, it's recommended that you bundle the runtime within the app. (49764202)"
>
> "Use of Python 2.7 isn't recommended as this version is included in macOS for compatibility with
> legacy software. Future versions of macOS won't include Python 2.7. Instead, it's recommended that
> you run `python3` from within Terminal. (51097165)"
>
> — <https://developer.apple.com/documentation/macos-release-notes/macos-catalina-10_15-release-notes>

The same deprecation appeared in the Xcode 11 release notes
(<https://developer.apple.com/documentation/xcode-release-notes/xcode-11-release-notes>). Python 2.7
was subsequently removed outright in macOS 12.3.

**Verdict: `python3` is disqualified.** So, for the same documented reason, are `perl` and `ruby` —
they are still present today but Apple has explicitly said they are there for legacy compatibility
and will not be by default in future. Building a 2026 installer on a runtime Apple deprecated in 2019
is a slow-motion breakage.

### 3.2 Does `jq` ever ship with macOS? **No.**

**UNCONFIRMED as a formal citation** — this is a negative, and Apple publishes no list to check
against (§1.1). But:

- `jq` is a third-party GPL/MIT project (<https://jqlang.github.io/jq/>), not an Apple component.
- It has no man page in Apple's shipped man page set.
- Every macOS install instruction for `jq`, including its own project documentation, is
  `brew install jq`.

**Safest assumption: `jq` is never present.** Note this cuts against Anthropic's own hook examples,
which use `jq` freely (e.g. the `stop_hook_active` sample at
<https://code.claude.com/docs/en/hooks-guide>). Those examples assume a developer machine. An
installer aimed at end users cannot.

### 3.3 What *is* reliably present

| Tool | Ships in base macOS? | JSON-capable? | Verdict |
| --- | --- | --- | --- |
| `python3` | **No** — CLT trampoline (§3.1) | yes | **Disqualified** |
| `jq` | **No** — Homebrew only (§3.2) | yes | **Disqualified** |
| `perl`, `ruby` | Yes, but Apple-deprecated since 10.15 | `JSON::PP` is core Perl | Rejected — documented as going away |
| `plutil` | Yes — core system utility | yes, with caveats | Strong second choice |
| `osascript -l JavaScript` (JXA) | Yes — base OS OSA component | yes, full JS `JSON` | **Recommended** |

Note the shape of the argument: the disqualifying property is not "is the binary at that path" but
"is it a base-OS component that Apple has not marked for removal". `plutil` and `osascript` are both
core system utilities — `plutil` because the OS itself is built on property lists, `osascript`
because OSA is part of the base system's automation stack. Neither is a developer tool, so neither
can be a trampoline; neither is a "scripting language runtime" in the sense of the Catalina
deprecation.

**`plutil`** is confirmed to have everything needed
(<https://keith.github.io/xcode-man-pages/plutil.1.html>):

- `-convert fmt` — "Convert the named file to the indicated format and write back to the file system." `json` is a valid fmt.
- `-o path` — "Specify an alternate path name for the result of the -convert operation… Specifying `-` as the path outputs to stdout."
- `-insert keypath -type [value] [-append]` — "Insert a value into the property list before writing it out."
- `-replace keypath -type value` — "Overwrite an existing value in the property list before writing it out."
- `-remove keypath` — "Removes the value at keypath from the property list before writing it out."
- `-extract keypath fmt [-expect expect_type]` — "Outputs the value at keypath in the property list as a new plist of type fmt."
- `-json` as a value type — "JSON fragment, useful for inserting compound values"
- `-r` — "For JSON, add whitespace and indentation to make the output more human-readable and sort the keys"
- `-lint` — validates a file.

**`osascript -l JavaScript`** is confirmed to exist as a mechanism
(<https://keith.github.io/xcode-man-pages/osascript.1.html>):

- osascript executes "OSA scripts (AppleScript, JavaScript, etc.)"
- `-l language` — "Override the language for any plain text files. Normally, plain text files are compiled as AppleScript."
- `-e` — "Enter one line of a script." Multiple `-e` flags compose a multi-line script.
- A script may be "Passed in using standard input… to pass arguments to a STDIN-read script, you must explicitly specify `-` for the script name."

JavaScript for Automation has been a shipped OSA language since OS X 10.10 Yosemite. The man page
naming JavaScript is CONFIRMED; that the JavaScript OSA component is present on every current macOS
is **UNCONFIRMED** (verify with `osalang -l | grep -i javascript`), though there is no indication
Apple has removed it.

### 3.4 Recommendation: **JXA via `osascript -l JavaScript`** — one approach, justified

Use `osascript -l JavaScript` to do the whole read-check-merge-write in a single script.

**Why, over `plutil`:**

1. **`plutil` cannot represent JSON `null`.** Property lists have no null type. `plutil -convert`
   round-trips JSON through a plist object graph, and `NSNull` is not a valid plist object. If any
   user's `settings.json` contains a `null` anywhere — in a config block this installer knows nothing
   about — the merge either errors out or silently mangles it. We are editing *someone else's config
   file*; "usually fine" is not the bar. JavaScript's `JSON.parse`/`JSON.stringify` handle `null`
   natively and exactly.
2. **`plutil` rewrites and reorders the whole file.** `-r` explicitly "sort[s] the keys". The user's
   hand-arranged `settings.json` comes back alphabetised and reformatted. JXA preserves key insertion
   order through parse/stringify.
3. **`plutil` risks type coercion.** Round-tripping through the plist type system is a chance for
   numbers, booleans and date-shaped strings to come back as different types than they went in.
   `JSON.parse`/`JSON.stringify` is an identity transform for everything it does not touch.
4. **The merge is not a simple set — it is an array append with a duplicate check.** `hooks.Stop` is an
   *array of matcher-groups*, and the installer must scan the existing entries for one whose command
   already mentions `play-sound.sh` before appending (exactly what `install.bat` does with
   `Where-Object { $_.hooks.command -like '*play-sound.ps1*' }`). In JXA that is `.some()` and
   `.push()` — three lines, obviously correct. In `plutil` it is a chain of `-extract`/`grep`/
   `-insert … -append` calls whose array-index keypath syntax is itself **UNCONFIRMED** and whose
   failure modes are hard to reason about. Fragile logic operating on the user's config is the thing
   to avoid.
5. **Cost is irrelevant here.** `osascript` process startup (~50–150ms) matters not at all in an
   installer that runs once. It *would* matter in the hook, which is a different problem with a
   different answer — see §3.6.

**Why not just require Homebrew + `jq`?** Because the Windows installer requires nothing beyond a
stock Windows, and the macOS one should match. Making users install Homebrew to get notification
sounds inverts the effort/reward ratio of the whole project.

**Shape of the merge script** (illustrative; the port ticket writes the real one):

```javascript
// osascript -l JavaScript merge.js -- <settings-path> <hook-dir>
ObjC.import('Foundation');

function readText(p) {
  const s = $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null);
  return s.isNil() ? null : ObjC.unwrap(s);
}
function writeText(p, t) {
  $.NSString.alloc.initWithUTF8String(t)
    .writeToFileAtomicallyEncodingError(p, true, $.NSUTF8StringEncoding, null);
}

function run(argv) {
  const [settingsPath, hookDir] = argv;
  const raw = readText(settingsPath);
  const cfg = raw && raw.trim() ? JSON.parse(raw) : {};   // throws on malformed -> installer aborts

  cfg.hooks = cfg.hooks || {};

  // event name -> substring that identifies OUR entry -> command to add
  const wanted = [
    ['Stop',         'play-sound.sh',          `"${hookDir}/play-sound.sh"`],
    ['Notification', 'play-sound-decision.sh', `"${hookDir}/play-sound-decision.sh"`],
  ];

  for (const [event, marker, command] of wanted) {
    const groups = (cfg.hooks[event] = cfg.hooks[event] || []);
    const present = groups.some(g =>
      (g.hooks || []).some(h => typeof h.command === 'string' && h.command.includes(marker)));
    if (present) { console.log(`  ok  ${event} hook already present - skipping`); continue; }
    groups.push({ hooks: [{ type: 'command', command, timeout: 10 }] });
    console.log(`  ok  ${event} hook added`);
  }

  writeText(settingsPath, JSON.stringify(cfg, null, 2) + '\n');
  return '';
}
```

Everything the installer did not put there is carried through untouched, because it is the same
object graph going out as came in.

### 3.5 Safety net — do this regardless of which tool wins

Non-negotiable for a script that edits the user's config:

1. **Back up first.** `cp settings.json "settings.json.bak.$(date +%Y%m%d%H%M%S)"` before any write.
   Tell the user the path.
2. **Write atomically, to a temp file, then `mv`.** A half-written `settings.json` from an interrupted
   installer is worse than no installer. (The JXA sketch above uses
   `writeToFile:atomically:` which does this natively.)
3. **Validate before *and* after.** `plutil -lint settings.json` — use `plutil` for what it is
   unambiguously good at even though the merge itself is JXA. Refuse to touch a file that is already
   malformed (tell the user, do not "fix" it); restore the backup if the post-write lint fails.
4. **Abort loudly on parse failure.** `JSON.parse` throwing must fail the install with the backup
   path printed, never fall through to "write a fresh settings.json" — that is precisely the
   clobbering the ticket forbids. Note that `install.bat` has this bug today: its `else` branch writes
   a brand-new file, which is correct only because it is guarded by `Test-Path`, but a *malformed*
   existing file would make `ConvertFrom-Json` throw and the whole PowerShell block die. Do not
   reproduce that ambiguity — handle "absent" and "unparseable" as distinct cases.

### 3.6 The hook's own JSON problem (related but separate)

The `Stop` hook must read `last_assistant_message` out of the stdin payload. Same "no `jq`, no
`python3`" constraint, but different tradeoffs: this runs on **every turn**, so a ~100ms `osascript`
startup is a real, if small, tax on every single response.

Options, best first:

1. **`plutil -extract`, reading stdin.** `plutil` is a small C binary with negligible startup.
   ```sh
   msg=$(printf '%s' "$payload" | plutil -extract last_assistant_message raw -o - -- - 2>/dev/null)
   ```
   **UNCONFIRMED**: that `plutil` accepts `-` as an input file meaning stdin, and that `raw` is a
   valid `-extract` output format producing a bare unquoted string. Both are strongly believed and
   both are one command to check on hardware. The `null`-safety objection from §3.4 does not apply
   here — we are reading one string out, not round-tripping the user's file.
2. **JXA**, same as the installer. Correct for certain, ~100ms per turn. Acceptable fallback.
3. **`sed`/`grep` extraction.** Do not. It will break on the first embedded `\"` or newline in an
   assistant message, which is to say almost immediately.

Note the hook only needs the *tail* of the message (§5.3), so an alternative is to skip parsing
almost entirely — but the value is JSON-escaped, so some unescaping is unavoidable. Parse it properly.

---

## 4. Paths

**CONFIRMED** — <https://code.claude.com/docs/en/settings>

| Scope | macOS | Windows |
| --- | --- | --- |
| User | `~/.claude/settings.json` | `%USERPROFILE%\.claude\settings.json` |
| Project | `.claude/settings.json` | same, relative |
| Project (local, gitignored) | `.claude/settings.local.json` | same, relative |
| Managed / enterprise | `/Library/Application Support/ClaudeCode/managed-settings.json` | `C:\Program Files\ClaudeCode\managed-settings.json` |

**Answer to the ticket's question:** the user-level layout is identical apart from the path separator
and the home-directory spelling. `~/.claude/` on macOS is the exact analogue of `%USERPROFILE%\.claude\`.
The only genuine divergence is the managed-settings path, which this project does not touch.

So the installed tree mirrors `PROJECT_INDEX.md` exactly:

```
~/.claude/
├── hooks/
│   ├── play-sound.sh
│   └── play-sound-decision.sh
├── settings.json
├── sound-theme.txt
└── sounds/
    └── chiptune/{task-complete,decision-needed,error,subagent-done,session-start}/
```

Two notes:

- `~/.claude/hooks/` is the conventional location in Anthropic's own examples
  (<https://code.claude.com/docs/en/hooks-guide>), so the Windows layout was already idiomatic.
- Do **not** use `~` inside the `command` string in `settings.json`. It is not reliably expanded
  depending on how the command is invoked. Write the absolute path — `install.sh` knows `$HOME`, so
  interpolate it at install time, exactly as `install.bat` interpolates `%USERPROFILE%`.
  `$CLAUDE_PROJECT_DIR` is available to hook commands
  (<https://code.claude.com/docs/en/hooks-guide>) but points at the project, not the home dir, so it
  is not useful here.

---

## 5. Hook payload: does the question-detection logic port unchanged?

### 5.1 Common fields

**CONFIRMED** — <https://code.claude.com/docs/en/hooks>. Every payload carries some subset of:

| Field | Description (verbatim) |
| --- | --- |
| `session_id` | "Current session identifier" |
| `prompt_id` | "UUID identifying the user prompt currently being processed… Absent until the first user input." Requires Claude Code v2.1.196+ |
| `transcript_path` | "Path to conversation JSON. The transcript file is written asynchronously and may lag the in-memory conversation, so it may not yet include the current turn's most recent messages when a hook fires. Hooks that need the final assistant text of the current turn should use `last_assistant_message` on Stop and SubagentStop instead of reading the transcript" |
| `cwd` | "Current working directory when the hook is invoked" |
| `permission_mode` | `"default"`, `"plan"`, `"acceptEdits"`, `"auto"`, `"dontAsk"`, `"bypassPermissions"`. "Not all events receive this field." |
| `effort` | Object with a `level` field: `"low"`/`"medium"`/`"high"`/`"xhigh"`/`"max"`. Present on `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStop`. Also exposed as `$CLAUDE_EFFORT`. |
| `hook_event_name` | "Name of the event that fired" |

### 5.2 `last_assistant_message` is real, documented, and the recommended approach

**CONFIRMED.** The `Stop` payload:

```json
{
  "session_id": "abc123",
  "prompt_id": "550e8400-e29b-41d4-a716-446655440000",
  "transcript_path": "/home/user/.claude/projects/.../transcript.jsonl",
  "cwd": "/home/user/my-project",
  "permission_mode": "default",
  "effort": { "level": "medium" },
  "hook_event_name": "Stop",
  "last_assistant_message": "I've completed the task...",
  "stop_hook_active": false,
  "turn_index": 5
}
```

| Field | Description (verbatim) |
| --- | --- |
| `last_assistant_message` | "The complete text of Claude's final message in this turn" |
| `stop_hook_active` | "Boolean indicating if a Stop hook is currently executing" |
| `turn_index` | "Zero-indexed turn number in the conversation" |

— <https://code.claude.com/docs/en/hooks>

This is worth stating plainly because it is easy to get wrong: `last_assistant_message` is not just
present, the docs **actively steer hooks toward it** and away from `transcript_path`, because the
transcript is written asynchronously and may not yet contain the current turn. **The Windows hook's
design is the documented-correct one.** Nothing about the approach needs rethinking for macOS.

### 5.3 Is the payload identical across platforms?

**UNCONFIRMED as an explicit statement** — the docs nowhere say "the payload is platform-independent".
But:

- No documented field is platform-conditional. Every field in every event schema is described without
  platform qualification.
- The only platform-varying *values* are `cwd` and `transcript_path`, which will naturally hold
  native paths. The hook reads neither.
- `last_assistant_message` is model output — a string, byte-identical in origin across platforms.

**Practical answer: yes, the question-detection logic ports.** It touches exactly one field, and that
field cannot be platform-dependent. Risk here is negligible.

### 5.4 The one thing that does *not* port unchanged: the regex

`play-sound.ps1` uses:

```powershell
if ($lastMsg -match '\?[^a-zA-Z0-9]*$') { ... }
```

In .NET, without `RegexOptions.Multiline`, `$` matches at the **end of the whole string** (or before a
final trailing newline). The intent is "the message *ends* with a question".

The naive shell translation is **wrong**:

```sh
printf '%s' "$msg" | grep -qE '\?[^a-zA-Z0-9]*$'   # BUG
```

`grep` is line-oriented: `$` matches the end of **every line**. An assistant message like

> "You asked whether this should be configurable? Here is the answer. I made it configurable and all
> tests pass."

matches on line 1 and plays the decision-needed sound for a completed task. Multi-line assistant
messages are the norm, so this would misfire constantly.

**Fix — compare only the last non-empty line:**

```sh
tail_line=$(printf '%s\n' "$msg" | sed -e 's/[[:space:]]*$//' -e '/^$/d' | tail -n 1)
case "$tail_line" in
  *\?)        category=decision-needed ;;   # fast path
  *) if printf '%s' "$tail_line" | grep -qE '\?[^a-zA-Z0-9]*$'
     then category=decision-needed
     else category=task-complete
     fi ;;
esac
```

`[[:posix:]]` character classes are used rather than `[a-zA-Z0-9]` to stay locale-safe; either works,
but be consistent. **Add a test for the multi-line case** — the existing
`tests/Test-TaskCompleteRandomness.ps1` covers clip selection, not classification, so this behaviour
is currently untested on both platforms.

### 5.5 What shell runs the hook

**CONFIRMED** — <https://code.claude.com/docs/en/hooks-guide>: the default "shell form" (no `args`
array) "spawns `sh -c` on macOS and Linux or Git Bash on Windows by default". An "exec form" (with
`"args": []`) spawns directly without a shell.

Consequences:

- The hook command runs under **`sh`, not the user's login shell**. The user's zsh being default
  (since macOS Catalina) is irrelevant to the hook. **Write the hook scripts to POSIX `sh`** and give
  them a `#!/bin/sh` shebang. Do not use bashisms (`[[ ]]`, arrays, `<<<`) — see §8.3.
- Since `sh -c` is used, the `command` string goes through shell word-splitting, so the absolute path
  in it **must be quoted** if `$HOME` could contain a space (it can — "Macintosh HD/Users/Jane Doe"
  is unusual but legal).

---

## 6. Making it double-clickable, and Gatekeeper

### 6.1 Is `.command` the right wrapper?

**UNCONFIRMED against Apple documentation — but it is the only real option.**

Honest finding: I could not locate an Apple document that specifies the `.command` extension. The
Terminal User Guide page on executing commands
(<https://support.apple.com/guide/terminal/execute-commands-and-run-tools-apdb66b5242-0d18-49fc-9c47-a2498b7c91d5/mac>)
covers running tools *inside* Terminal and `open -a`, but says nothing about `.command`, `chmod`, or
double-clicking a script in Finder. The behaviour (Finder opens `.command` files in Terminal and
executes them) is long-established and universally relied upon, but it is folklore-by-consensus
rather than something I can cite to Apple.

**Permission bit: `chmod +x` is required.** Without the executable bit, Finder opens the file in a
text editor rather than running it. **UNCONFIRMED** from Apple docs; certain in practice.

**The bit that actually bites: git does not preserve the executable bit through a ZIP download.**
A `git clone` preserves mode 755, but "Download ZIP" from the GitHub web UI does not reliably
preserve it, and neither does every unzip path. So:

- Commit `install.command` with mode 755 (`git update-index --chmod=+x install.command`).
- Add a `.gitattributes` entry if useful, though mode is the thing that matters.
- **In the README, always give the `chmod +x` line as part of the instructions**, not as
  troubleshooting. It is idempotent and costs the user nothing.

**Recommended structure — two files, not one:**

- `install.sh` — the real installer, POSIX `sh`, runnable from a terminal (`sh install.sh`), takes the
  optional theme argument exactly as `install.bat` does.
- `install.command` — a three-line wrapper for Finder users:

  ```sh
  #!/bin/sh
  cd "$(dirname "$0")" || exit 1
  exec sh ./install.sh "$@"
  ```

  The `cd "$(dirname "$0")"` is essential: Finder launches `.command` files with the working directory
  set to the user's home, not the script's directory, so a bare `install.sh` would fail to find
  `sounds/`. (`install.bat` already handles the equivalent with `%~dp0`.)

This split keeps the terminal path clean and the Finder path working, and means the Gatekeeper
discussion below applies only to the small wrapper.

### 6.2 Gatekeeper: what actually happens

Two things must be separated, because conflating them is what produces bad README instructions.

**(a) Quarantine is not universal. It depends entirely on how the user got the files.**

The `com.apple.quarantine` extended attribute is applied by the *downloading application*, not by the
OS globally. Apps opt in via the `LSFileQuarantineEnabled` Info.plist key — "A Boolean value
indicating whether the files this app creates are quarantined by default"
(<https://developer.apple.com/documentation/bundleresources/information-property-list/lsfilequarantineenabled>).

Apple's DTS is explicit about which tools do not:

> "Most Unix-y tools don't quarantine their downloads, including curl and scp."
>
> "To unquarantine a file, use the xattr command-line tool to remove the `com.apple.quarantine`
> extended attribute."
>
> "The `com.apple.quarantine` extended attribute is not considered API."
>
> — Quinn "The Eskimo!", Apple DTS, <https://developer.apple.com/forums/thread/666452>

So:

| How the user obtained the repo | Quarantined? | Gatekeeper friction |
| --- | --- | --- |
| `git clone` | **No** (INFERRED from the curl/scp statement — git is the same class of tool; git is not named explicitly) | **None** |
| `curl -L …` | **No** (CONFIRMED, named explicitly) | **None** |
| "Download ZIP" in Safari/Chrome/Firefox | **Yes** — and Archive Utility propagates the attribute to extracted files | Yes |
| AirDrop, Mail, Messages | **Yes** | Yes |

**This is the lever.** `git clone` sidesteps Gatekeeper entirely. Lead the README with it.

**(b) What the user sees when it *is* quarantined — and why the standard Apple steps may not apply.**

Apple's documented flow, from "Open a Mac app from an unknown developer"
(<https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac>,
covering macOS Tahoe 26 and earlier), is:

> "If you try to open an app that isn't registered with Apple by a known developer, you get a warning
> dialog."

with the override being: **Apple menu → System Settings → Privacy & Security (sidebar) → Security
section → click "Open" → click "Open Anyway"** (available for about one hour after the failed open) →
enter login password → **OK**.

And critically, as of macOS Sequoia the old shortcut is gone:

> "In macOS Sequoia, users will no longer be able to Control-click to override Gatekeeper when opening
> software that isn't signed correctly or notarized. They'll need to visit System Settings > Privacy
> & Security to review security information for software before allowing it to run."
>
> — <https://developer.apple.com/news/?id=saqachfa>

**The caveat that matters, and it is a big one: that documentation is about *apps*.** Apple's Platform
Security guide frames Gatekeeper around "an app, a plug-in, or an installer package"
(<https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web>).

**UNCONFIRMED — flagged as the single biggest README risk:** for a *quarantined shell script*
double-clicked in Finder and executed by Terminal, the widely-reported behaviour is **not** a
Gatekeeper dialog with an "Open Anyway" button. It is reported to fail with an opaque
`Operation not permitted` in the Terminal window, with **no** dialog and **no** corresponding entry
appearing in System Settings → Privacy & Security. The best available source for this is Armin
Briegel's Scripting OS X — highly regarded in Mac admin circles but **not primary**:
<https://scriptingosx.com/2022/04/launching-scripts-2-launching-scripts-from-finder/>

If that is right, a README that tells users to look for an "Open Anyway" button would send them
hunting for a button that is not there. **This must be tested on hardware before the README ships.**

### 6.3 Recommended README text (verbatim, subject to the §6.2 caveat)

Structured so that most users never hit Gatekeeper at all:

```text
INSTALL (macOS)
---------------

Recommended - no security prompts:

  1. Open Terminal (press Cmd-Space, type "Terminal", press Return).
  2. Paste these three lines and press Return:

       git clone https://github.com/jasonrundell/claude-code-sound-hooks.git
       cd claude-code-sound-hooks
       sh install.sh

  3. Restart Claude Code.

  Files fetched with git are not quarantined by macOS, so this route never
  triggers a Gatekeeper warning.


If you downloaded the ZIP from GitHub instead:

  macOS marks anything downloaded through a web browser as quarantined, and
  will refuse to run the installer. Clear the mark first:

  1. Open Terminal.
  2. Type "xattr -d -r com.apple.quarantine " (with a trailing space) -
     do not press Return yet.
  3. Drag the unzipped claude-code-sound-hooks folder from Finder into the
     Terminal window. This fills in the path for you.
  4. Press Return. No output means it worked.
  5. Then run:

       cd ~/Downloads/claude-code-sound-hooks
       chmod +x install.sh install.command
       sh install.sh

  You can now also double-click install.command in Finder.


If macOS still blocks it and shows a warning dialog:

  1. Open the Apple menu and choose System Settings.
  2. Click Privacy & Security in the sidebar.
  3. Scroll down to the Security section.
  4. Next to the message about install.command, click Open, then click
     Open Anyway.  (This button only appears for about an hour after the
     blocked attempt - if it is not there, try opening the file again first.)
  5. Enter your Mac login password and click OK.

  On macOS Sequoia (15) and later, Control-clicking the file and choosing
  Open no longer works - System Settings is the only route.
```

Two deliberate choices: the drag-to-fill trick in step 3 avoids making non-technical users type a
path, and the "Open Anyway" section is framed as a conditional fallback ("If macOS *still* blocks
it…") rather than as the expected path, which keeps the README honest even if §6.2's caveat turns out
to be correct and that dialog never appears for scripts.

---

## 7. Hook events for the next ticket

### 7.1 The event names in `PROJECT_INDEX.md` are all real

**CONFIRMED** — <https://code.claude.com/docs/en/hooks>,
<https://code.claude.com/docs/en/hooks-guide>. Contrary to reasonable suspicion, both `StopFailure`
and `PostToolUseFailure` are current, documented events. The full documented event list:

`SessionStart`, `SessionEnd`, `Setup`, `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`,
`PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`,
`Notification`, `MessageDisplay`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`,
`Stop`, `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`,
`FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `PostCompact`, `Elicitation`,
`ElicitationResult`.

### 7.2 Payloads

**`SessionStart`** — CONFIRMED:

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../00893aaf-....jsonl",
  "cwd": "/Users/...",
  "hook_event_name": "SessionStart",
  "source": "startup",
  "model": "claude-sonnet-5"
}
```

`source` is one of `startup`, `resume`, `clear`, `compact`, `fork`. Optional: `model`, `agent_type`,
`session_title`.

**`SubagentStop`** — CONFIRMED:

```json
{
  "session_id": "abc123",
  "transcript_path": "/home/user/.claude/projects/.../transcript.jsonl",
  "cwd": "/home/user/my-project",
  "hook_event_name": "SubagentStop",
  "agent_id": "subagent-xyz",
  "agent_type": "Explore",
  "last_assistant_message": "I've explored the codebase...",
  "stop_hook_active": false
}
```

Note it carries `last_assistant_message` too, so the same question-detection could apply if wanted.

**`Notification`** — CONFIRMED:

```json
{
  "session_id": "abc123",
  "transcript_path": "...",
  "cwd": "/home/user/my-project",
  "hook_event_name": "Notification",
  "notification_type": "permission_prompt",
  "message": "Claude wants to run: npm test"
}
```

`notification_type` is one of `permission_prompt`, `idle_prompt`, `auth_success`,
`elicitation_dialog`, `elicitation_complete`, `elicitation_response`, `agent_needs_input`,
`agent_completed`. `message` is "The notification message text".

This is new information relative to the current implementation: `play-sound-decision.ps1` plays the
same sound for *all* notification types, including `auth_success`. A matcher on `permission_prompt`
and `idle_prompt` would be more precise. `PROJECT_INDEX.md` already anticipates this
("The `Notification` hook supports a matcher on notification type").

**`StopFailure`** — CONFIRMED:

```json
{
  "session_id": "abc123",
  "prompt_id": "550e8400-...",
  "transcript_path": "...",
  "cwd": "/home/user/my-project",
  "hook_event_name": "StopFailure",
  "error_type": "rate_limit",
  "error_message": "Rate limit exceeded"
}
```

`error_type` ∈ `rate_limit`, `overloaded`, `authentication_failed`, `oauth_org_not_allowed`,
`billing_error`, `invalid_request`, `model_not_found`, `server_error`, `max_output_tokens`, `unknown`.

**`PostToolUseFailure`** — CONFIRMED:

```json
{
  "session_id": "abc123",
  "prompt_id": "550e8400-...",
  "transcript_path": "...",
  "cwd": "/home/user/my-project",
  "permission_mode": "default",
  "hook_event_name": "PostToolUseFailure",
  "tool_name": "Bash",
  "tool_input": { "command": "npm test", "description": "Run test suite", "timeout": 120000, "run_in_background": false },
  "tool_use_id": "toolu_01ABC123...",
  "tool_error": "Command failed with exit code 1",
  "tool_output": "Tests failed: 5 failures"
}
```

### 7.3 Two design warnings for the wiring ticket

**`StopFailure` does not mean what `PROJECT_INDEX.md` assumes.** The index maps the `error` sound
category to "`StopFailure`, `PostToolUseFailure`". But the docs define `StopFailure` as firing "When
the turn ends due to an API error" — rate limits, auth failures, server errors. It is an
*infrastructure* failure, not "Claude's work failed". That is still a perfectly good thing to play a
sound for (arguably the *best* thing — the user has walked away and the turn died), but the index's
description should be corrected.

Also note, from the docs: for `StopFailure`, "Output and exit code are ignored". Fine for a
sound-playing hook, which returns nothing meaningful anyway.

**`PostToolUseFailure` will be very noisy.** It fires after *every* failed tool call. A failing
`grep` with no matches, a test run that exits non-zero, a `Read` on a missing path — these happen many
times per turn during normal work. Wiring the error sound to it unmatched would produce a near-constant
stream of buzzes and users would uninstall. Recommendation: **wire `error` to `StopFailure` only**, or
gate `PostToolUseFailure` behind a matcher and a rate limit. Flag this to the port ticket.

**`SessionStart` fires on more than startup.** With `source` ∈ `startup`/`resume`/`clear`/`compact`/`fork`,
an unmatched hook plays the boot sound on every `/clear` and every auto-compact. Use a matcher on
`startup` (and possibly `resume`).

### 7.4 Config structure, matchers, timeouts, exit codes

**CONFIRMED** — <https://code.claude.com/docs/en/hooks>:

```json
{
  "hooks": {
    "EVENT_NAME": [
      {
        "matcher": "tool_or_filter",
        "hooks": [
          { "type": "command", "command": "...", "timeout": 600 }
        ]
      }
    ]
  }
}
```

Note the two-level nesting — an array of matcher-groups, each containing an array of hooks. This is
what `install.bat` builds and what the JXA merge in §3.4 must preserve.

- **Matcher support** (<https://code.claude.com/docs/en/hooks-guide>): `SessionStart` matches on
  reason/mode, `Notification` on notification type, `SubagentStop` on agent type, `StopFailure` on
  error type, `PostToolUseFailure` on tool name. **`Stop` takes no matcher** — it always fires. So the
  existing `Stop` entry stays matcher-less, and everything the next ticket adds can be matched.
- **Default timeouts**: `command` hooks 10 minutes; `prompt` 30s; `agent` 60s. `UserPromptSubmit`
  lowers command hooks to 30s and `MessageDisplay` to 10s. Set an explicit short `timeout` (§2.4).
- **Exit codes**: `0` = no decision, proceed (stdout is added to context for `UserPromptSubmit`,
  `UserPromptExpansion`, `SessionStart`); `2` = block the action, stderr goes to Claude; anything else
  = proceed, with a "hook error" notice shown in the transcript.
  **The sound hooks must always `exit 0`.** A non-zero exit from a missing sound file would surface a
  visible error notice in the user's transcript on every turn.
- `Stop` hooks that block are overridden "after it blocks eight times in a row without progress"
  (raisable via `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`). Not relevant here — the sound hooks never exit 2 —
  but worth knowing.
- **Env vars available to hook commands**: `$CLAUDE_PROJECT_DIR`, `$CLAUDE_ENV_FILE`, `$CLAUDE_EFFORT`,
  `$CLAUDE_PLUGIN_ROOT`, `$CLAUDE_PLUGIN_DATA`.

---

## 8. RECOMMENDED SHAPE

Concrete enough to execute the port ticket from. **This section is a specification, not code** — the
port ticket writes the code.

### 8.1 Files to add

```
install.sh              # POSIX sh installer, optional theme arg. The real thing.
install.command         # 3-line Finder wrapper, committed mode 755.
hooks/play-sound.sh     # Stop hook
hooks/play-sound-decision.sh   # Notification hook
tools/merge-settings.js # JXA merge, invoked by install.sh via osascript -l JavaScript
```

Add to `.gitattributes`: `*.sh text eol=lf` and `*.command text eol=lf`. **This is essential.** The
existing `.gitattributes` pins `.bat`/`.ps1` to CRLF; if that leaks to the shell scripts, `sh` fails
with `bad interpreter: /bin/sh^M` — a confusing error for a user to hit. Verify the shebang line
specifically.

### 8.2 `install.sh` — step by step

Mirrors `install.bat` beat for beat, so the two stay comparable:

1. `set -eu`. Resolve `SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"`. Set `CLAUDE_DIR="$HOME/.claude"`.
2. `THEME="${1:-chiptune}"`.
3. **Pre-flight**, each with a clear message and `exit 1`:
   - `[ -d "$SCRIPT_DIR/sounds/$THEME" ]` — else list `sounds/*` as available themes.
   - `sounds/$THEME/task-complete` and `sounds/$THEME/decision-needed` are non-empty.
   - `command -v afplay >/dev/null` (§1.1).
   - `command -v osascript >/dev/null` (§3.4).
4. `mkdir -p "$CLAUDE_DIR/hooks" "$CLAUDE_DIR/sounds"`.
5. `cp -R "$SCRIPT_DIR/sounds/." "$CLAUDE_DIR/sounds/"` — copies every theme, matching `xcopy /E`.
   Note the trailing `/.`; without it `cp -R` nests a `sounds/sounds` directory.
6. `printf '%s\n' "$THEME" > "$CLAUDE_DIR/sound-theme.txt"`.
7. `cp "$SCRIPT_DIR/hooks/play-sound.sh" "$SCRIPT_DIR/hooks/play-sound-decision.sh" "$CLAUDE_DIR/hooks/"`
   then `chmod +x "$CLAUDE_DIR/hooks/"*.sh`. **Do not skip the chmod** — it is the difference between
   working and a silent no-op.
8. **Settings merge** (§3.4, §3.5), in this order:
   - If `settings.json` exists: `plutil -lint` it; abort with a clear message if malformed.
   - Back it up to `settings.json.bak.<timestamp>` and print the path.
   - `osascript -l JavaScript "$SCRIPT_DIR/tools/merge-settings.js" "$CLAUDE_DIR/settings.json" "$CLAUDE_DIR/hooks"`
   - `plutil -lint` the result; restore the backup and abort if it fails.
   - If it did not exist: create it with just the two hook entries (same as `install.bat`'s else branch).
9. Print the same closing message as `install.bat`, plus the backup path.

No `pause` equivalent is needed for the terminal path; `install.command` should end with a
`printf 'Press Return to close...'; read -r _` so Finder users can read the output before the window
is closed.

### 8.3 `hooks/play-sound.sh`

```
#!/bin/sh
# Claude Code Stop hook. POSIX sh only - Claude Code runs this via `sh -c`.
# Always exits 0: a non-zero exit shows a hook-error notice in the transcript.
```

1. `payload=$(cat)` — read all of stdin.
2. Extract `last_assistant_message` (§3.6): `plutil -extract … raw -o - -- -`, falling back to JXA.
   On any failure, set it to empty and carry on.
3. Classify using the **last non-empty line** (§5.4 — this is the one real logic change from Windows).
   Empty message → `task-complete`, matching current Windows behaviour.
4. Resolve theme: read `$HOME/.claude/sound-theme.txt`, trim, default `chiptune` if missing or empty.
   Identical semantics to the PowerShell version.
5. `dir="$HOME/.claude/sounds/$theme/$category"`. If it does not exist or is empty, `exit 0` silently.
6. Pick a random `.wav`/`.mp3`. POSIX-safe approach: list matching files into a numbered stream and
   select with `awk`, seeded from `$$` and the clock — do **not** use `$RANDOM`, which is a bashism and
   is not available under `sh`. This is the trickiest part of the port; give it a test mirroring
   `tests/Test-TaskCompleteRandomness.ps1`.
7. `afplay "$f"` with the 6-second watchdog from §2.4. **No duration detection** (§2.2).
8. `exit 0`.

### 8.4 `hooks/play-sound-decision.sh`

Same as §8.3 minus steps 1–3; category is always `decision-needed`. Factor steps 4–8 into a shared
`_play_from_category()` used by both scripts, or accept the small duplication as `install.bat` does
today — but if factoring, it must be a third file the installer also copies, so prefer duplication
unless it grows.

### 8.5 Settings entries written

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "\"/Users/jason/.claude/hooks/play-sound.sh\"", "timeout": 10 } ] }
    ],
    "Notification": [
      { "hooks": [ { "type": "command", "command": "\"/Users/jason/.claude/hooks/play-sound-decision.sh\"", "timeout": 10 } ] }
    ]
  }
}
```

Absolute path interpolated at install time (§4); inner quotes because the command goes through
`sh -c` (§5.5); no `matcher` on `Stop` because it accepts none (§7.4); explicit short `timeout`
because the 10-minute default is no safety net (§2.4).

### 8.6 Docs to update in the port ticket

- `PROJECT_INDEX.md` — "Supported Platforms" (macOS moves to Supported), the file-responsibilities
  section, and the "Unwired Sound Categories" table (correct the `StopFailure` description per §7.3).
- Add a note explaining **why** macOS has no duration logic (§2.2), so it is not later "fixed".
- `README.txt` — the §6.3 install text.

---

## 9. Assumptions that must be verified on real Mac hardware

Ordered by how badly the port breaks if the assumption is wrong. Items 1–3 are blocking.

| # | Assumption | How to check | If wrong |
| --- | --- | --- | --- |
| **1** | **`afplay` blocks until the clip finishes** (§1.2) | `time afplay clip.wav` — `real` should equal clip length | The whole "no duration logic" design collapses; fall back to §2.3, in that order |
| **2** | **Gatekeeper's behaviour for a quarantined `.command`** (§6.2) — specifically whether the user gets an "Open Anyway" entry in System Settings or an opaque `Operation not permitted` | Download the repo ZIP in Safari, unzip, double-click `install.command`. Record the **exact** dialog text and whether an entry appears under Privacy & Security | The §6.3 README text sends users hunting for a button that does not exist. Rewrite around `xattr -d` only |
| **3** | **`plutil -extract last_assistant_message raw -o - -- -` reads stdin and emits a bare string** (§3.6) | `echo '{"a":"hi"}' \| plutil -extract a raw -o - -- -` | Hook falls back to JXA — works, costs ~100ms per turn |
| 4 | `afplay` is present on a Mac with no Xcode/CLT (§1.1) | `command -v afplay` on a clean machine or fresh VM | Installer needs a Homebrew fallback, or the project cannot support stock Macs |
| 5 | `osascript -l JavaScript` works on current macOS (§3.3) | `osalang -l \| grep -i javascript`; `osascript -l JavaScript -e 'JSON.stringify({a:1})'` | Fall back to `plutil` for the merge, accepting the `null` risk (§3.4) |
| 6 | The JXA ObjC-bridge file read/write in §3.4 works and writes atomically | Run the merge against a fixture `settings.json` containing unrelated hooks, `null` values, and unicode; diff | Use a temp file + `mv` explicitly |
| 7 | `afplay` plays `.mp3` as well as `.wav` (§1.3) | `afplay something.mp3` | Only affects user themes; document `.wav` only |
| 8 | No TCC/permission prompt on first sound playback (§1.4) | Run the hook on a fresh user account | Document the prompt in the README |
| 9 | `.command` double-click runs the script when `chmod +x` is set, and the `cd "$(dirname "$0")"` is genuinely needed (§6.1) | Double-click from Finder with the repo somewhere other than `$HOME` | Adjust the wrapper |
| 10 | `afinfo` prints a parseable `estimated duration:` line (§2.3) | `afinfo clip.wav` | Only matters if #1 is wrong |
| 11 | Files from `git clone` are not quarantined (§6.2) — Apple names `curl` and `scp` but not `git` | `git clone …; xattr -l install.command` (expect no output) | The "no security prompts" README path is wrong; lead with `xattr -d` instead |
| 12 | The POSIX random-selection approach in §8.3 is uniform | Port `tests/Test-TaskCompleteRandomness.ps1` to `sh` and sample | Rework selection |
| 13 | `sh -c` invocation tolerates a quoted absolute path containing spaces (§5.5) | Test with a home dir containing a space | Adjust quoting in the emitted command |
| 14 | Line endings survive as LF (§8.1) | `file install.sh` / `head -1 hooks/play-sound.sh \| xxd \| head -1` | Fix `.gitattributes` |

---

## Sources

Anthropic — Claude Code:

- <https://code.claude.com/docs/en/hooks> — hook reference: event payloads, common fields, config structure, exit codes, timeouts
- <https://code.claude.com/docs/en/hooks-guide> — hooks guide: event list, matcher support, `sh -c` vs Git Bash, env vars
- <https://code.claude.com/docs/en/settings> — settings file locations for macOS and Windows

Apple — developer and support documentation:

- <https://developer.apple.com/documentation/macos-release-notes/macos-catalina-10_15-release-notes> — Scripting Language Runtimes deprecation
- <https://developer.apple.com/documentation/xcode-release-notes/xcode-11-release-notes> — same deprecation
- <https://developer.apple.com/documentation/audiotoolbox/audiofiletypeid> — `kAudioFileWAVEType`, `kAudioFileMP3Type`
- <https://developer.apple.com/documentation/bundleresources/information-property-list/lsfilequarantineenabled> — quarantine opt-in key
- <https://developer.apple.com/news/?id=saqachfa> — macOS Sequoia removes Control-click Gatekeeper override
- <https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac> — "Open Anyway" steps (macOS Tahoe 26 and earlier)
- <https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web> — Apple Platform Security, Gatekeeper
- <https://support.apple.com/guide/terminal/execute-commands-and-run-tools-apdb66b5242-0d18-49fc-9c47-a2498b7c91d5/mac> — Terminal User Guide (checked; does **not** document `.command`)

Apple — DTS engineer statements on Apple Developer Forums:

- <https://developer.apple.com/forums/thread/790807> — "macOS does not come with a built-in copy of Python"
- <https://developer.apple.com/forums/thread/702210> — no index of stock CLI tools; `/usr/bin/nm` trampoline example
- <https://developer.apple.com/forums/thread/666452> — quarantine; "Most Unix-y tools don't quarantine their downloads, including curl and scp"
- <https://developer.apple.com/forums/thread/704099> — built-in Python deprecated, use your own

Apple man pages (via the <https://keith.github.io/xcode-man-pages/> mirror — faithful, but not first-party-hosted):

- <https://keith.github.io/xcode-man-pages/afplay.1.html>
- <https://keith.github.io/xcode-man-pages/afinfo.1.html>
- <https://keith.github.io/xcode-man-pages/plutil.1.html>
- <https://keith.github.io/xcode-man-pages/osascript.1.html>
- <https://keith.github.io/xcode-man-pages/xattr.1.html>

Secondary, used only where explicitly flagged as non-primary:

- <https://scriptingosx.com/2022/04/launching-scripts-2-launching-scripts-from-finder/> — quarantined scripts fail with `Operation not permitted` (§6.2, assumption #2)
- <https://ss64.com/mac/afplay.html> — `afplay` options absent from the man page (§1.2)
