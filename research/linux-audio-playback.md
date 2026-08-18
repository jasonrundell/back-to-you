# Playing audio from a POSIX `sh` hook on Linux

Research for [#25](https://github.com/jasonrundell/back-to-you/issues/25), part of the
npm map [#23](https://github.com/jasonrundell/back-to-you/issues/23). Investigated
2026-08-18.

Unlike the macOS research ([#5](https://github.com/jasonrundell/back-to-you/issues/5)),
**most of this was verified by running it**, not read about. Every claim below is tagged:

- **MEASURED** — I ran it and this is the number/behaviour I got.
- **CONFIRMED** — stated by a primary source (distro manifest, upstream docs, package metadata).
- **INFERRED** — reasoned from the two above; flagged where it matters.

---

## The answer in one paragraph

Probe **`pw-play` → `paplay` → `mpg123` (mp3 only) → `play` (SoX) → `aplay` (wav only)**,
taking the first one that both exists and exits 0. `pw-play` is the only candidate present
on a stock Ubuntu desktop *and* a stock Fedora Workstation, it decodes mp3, it blocks until
the clip ends exactly like `afplay`, and it costs **~85 ms** on top of the clip's own
length. `paplay` is its equal on every measure and covers the machines PipeWire has not
reached — plus it is the only thing that works under WSL. Two candidates must be handled
specially: **`aplay` must never be given an mp3** (it replays the compressed bytes as
8 kHz unsigned 8-bit mono — 2.3 s of noise, exit code 0), and **`ffplay` must be left out
of the chain entirely** (with no audio device it prints nothing, plays nothing, and exits
**0**, which would swallow the failure this project most wants to be loud about).

---

## 1. The test rig

| | |
| --- | --- |
| Host | Windows 11 Pro 26200, WSL2 |
| Distro under test | Ubuntu 24.04.2 LTS (Noble), kernel 5.15.167.4-microsoft-standard-WSL2 |
| `/bin/sh` | `dash` (so bashisms fail loudly, which is what we want) |
| Audio hardware | **none** — no `/dev/snd` at all |
| Players installed for the test | `pipewire` 1.0.5, `pipewire-bin` 1.0.5, `pulseaudio-utils` 16.1, `alsa-utils` 1.2.9, `mpg123` 1.32.5, `sox` 14.4.2, `ffmpeg` 6.1.1, `libsndfile1` 1.2.2 |
| Test clip | 1.000 s 440 Hz sine → mp3 128 kbps 44.1 kHz stereo. **Real decoded duration 1.044898 s** (encoder delay/padding), 17 180 bytes. A 1.000 s wav and a 3.030 s mp3 were used as controls. |
| Sink | a local PipeWire + `pipewire-pulse` with `module-null-sink`, which paces in real time |

Docker Desktop is installed on the machine but would not start, so everything ran in WSL.
Two consequences worth stating plainly:

1. **All latency numbers below come from one machine, one distro, one kernel.** They are
   good for *ranking* the candidates — the gaps are 3–5x, far larger than the noise — but
   the absolute milliseconds will differ on real hardware with a real sound card.
2. **WSL ships its own PulseAudio server** (WSLg, at `unix:/mnt/wslg/PulseServer`, exposed
   via `$PULSE_SERVER`). Early runs were silently measuring *that* — a PulseAudio 16.1
   feeding an RDP sink — and it adds roughly a second of buffering. Every number in the
   comparison table was re-taken with `PULSE_SERVER` unset and a local PipeWire null sink,
   so all candidates are measured against the same thing. The WSLg numbers are reported
   separately in §7, because for WSL users they *are* the real numbers.

---

## 2. What is actually installed on a stock desktop

This is the question that decides the probe order, and it has a surprising answer:
**`paplay` is not on a stock Ubuntu desktop or a stock Fedora Workstation.** The README's
current guess — "Would need `paplay` / `aplay`" — is close to backwards.

### Ubuntu 26.04 LTS "Resolute Raccoon" (released 2026-04-23) — CONFIRMED

From the official live-filesystem manifest,
`https://releases.ubuntu.com/26.04/ubuntu-26.04-desktop-amd64.manifest`:

| Package | In desktop manifest? | Gives us |
| --- | :---: | --- |
| `pipewire` 1.6.2 | yes | the server |
| `pipewire-bin` 1.6.2 | **yes** | **`pw-play`, `pw-cat`** |
| `pipewire-pulse` 1.6.2 | yes | the PulseAudio protocol shim |
| `pipewire-alsa` 1.6.2 | yes | the ALSA `default` device shim |
| `wireplumber` 0.5.13 | yes | session manager |
| `alsa-utils` 1.2.15.2 | yes | `aplay` |
| `libsndfile1` 1.2.2 | yes | the decoder `pw-play`/`paplay` use |
| `libmpg123-0t64`, `libmp3lame0` | yes | **mp3 in/out for libsndfile** |
| **`pulseaudio-utils`** | **NO** | would have given `paplay` |
| `mpg123`, `sox`, `ffmpeg`, `vlc`, `mpv` | no | — |

Only `libpulse0` (the client *library*) ships; the `paplay` binary lives in
`pulseaudio-utils`, which is absent. Verified that `pipewire-bin` is what carries the
binary via the package file list at
`https://packages.ubuntu.com/resolute/amd64/pipewire-bin/filelist` — it lists
`/usr/bin/pw-play`, `/usr/bin/pw-cat`, `/usr/bin/pw-dsdplay` and friends.

The **server** manifest (`ubuntu-26.04-live-server-amd64.manifest`, 728 packages) contains
no `pipewire`, no `alsa-utils`, no `pulseaudio` — nothing but `libgstreamer1.0-0` pulled in
as a transitive dependency. The **WSL** manifest (544 packages) is the same. A headless
Ubuntu has no player at all, by design.

Incidentally, Ubuntu 26.04 desktop *does* ship `jq` 1.8.1 and `python3` 3.14 — relevant to
§10.

### Fedora Workstation — CONFIRMED

From `comps-f43.xml.in` in the official
[fedora-comps](https://pagure.io/fedora-comps) repository. The
`workstation-product-environment` environment's `<grouplist>` (i.e. groups installed by
default, not the optional list) includes `multimedia`, and the `multimedia` group contains:

```xml
<packagereq>alsa-utils</packagereq>
<packagereq>pipewire-utils</packagereq>
<packagereq>wireplumber</packagereq>
```

`pipewire-utils` is Fedora's name for the package carrying `pw-cat`/`pw-play`. So Fedora
Workstation gets **`pw-play` and `aplay`**. `pulseaudio-utils` appears **only** in the `i3`,
`miraclewm-desktop` and `swaywm-extended` groups — the tiling-WM spins — never in
Workstation. `sox` is `type="optional"` in `sound-and-video`. Same shape as Ubuntu.

### Arch Linux — CONFIRMED

Arch has no default desktop, so "stock" means "whatever the user assembled". But the
packaging makes both candidates likely together:

- `pw-play`/`pw-cat` are in **`pipewire-audio`**, not the base `pipewire` package
  (`https://archlinux.org/packages/extra/x86_64/pipewire-audio/files/`).
- `paplay`/`pacat`/`pactl` are in **`libpulse`**
  (`https://archlinux.org/packages/extra/x86_64/libpulse/files/`) — *not* in a separate
  utils package the way Debian and Fedora split it.
- `pipewire-pulse` **depends on both** `pipewire-audio` and `libpulse`
  (`https://archlinux.org/packages/extra/x86_64/pipewire-pulse/`).

So any Arch desktop running the now-standard `pipewire-pulse` has **both `pw-play` and
`paplay`** (INFERRED from the dependency graph, not from a running Arch box). An Arch
system on bare ALSA has neither, and only `aplay` if `alsa-utils` was installed.

### Summary

| | Ubuntu 26.04 desktop | Fedora Workstation | Arch + pipewire-pulse | Ubuntu server / WSL |
| --- | :---: | :---: | :---: | :---: |
| `pw-play` | **yes** | **yes** | **yes** | no |
| `paplay` | no | no | **yes** | no |
| `aplay` | yes | yes | if `alsa-utils` | no |
| `mpg123` / `sox` / `ffplay` | no | no | no | no |

**`pw-play` is the only candidate that is present by default everywhere a desktop exists.**
That settles the head of the probe order. `paplay` goes second because it is the one that
covers what `pw-play` cannot: pre-PipeWire systems still running PulseAudio proper, Arch,
and WSL.

---

## 3. PipeWire vs PulseAudio vs bare ALSA in 2026

PipeWire has won on the mainstream desktops. Ubuntu 26.04 ships `pipewire` + `wireplumber`
+ `pipewire-pulse` + `pipewire-alsa` and no PulseAudio server (CONFIRMED, manifest);
Fedora Workstation ships `pipewire-utils` + `wireplumber` (CONFIRMED, comps); Arch's
`pipewire-pulse` package explicitly `Conflicts`/`Replaces` `pulseaudio` (CONFIRMED,
package metadata).

**`paplay` survives on PipeWire systems** — MEASURED, and this is the important half. With
`pipewire-pulse` running, `pactl info` reports:

```
Server Name: PulseAudio (on PipeWire 1.0.5)
Server Version: 15.0.0
```

and `paplay clip.mp3` played correctly in 1 130 ms — statistically identical to `pw-play`'s
1 132 ms. The compatibility shim is not a degraded path; it is the same graph reached
through a different socket. So listing `paplay` after `pw-play` costs nothing and buys the
non-PipeWire world.

Likewise `pipewire-alsa` installs `/usr/share/alsa/alsa.conf.d/50-pipewire.conf` and
`99-pipewire-default.conf`, which makes ALSA's `default` device route into PipeWire —
MEASURED via `aplay -L`, which reports `default → Default ALSA Output (currently PipeWire
Media Server)`. That is why `aplay` and SoX's `play` work at all on a modern desktop that
has no raw ALSA device of its own.

Bare ALSA (no server) still exists on minimal/embedded installs. There, only `aplay` and
SoX are reachable, and `aplay` cannot decode mp3 — see §4.

---

## 4. mp3 specifically

The packs are mp3, and this is where two of the six candidates fall over.

### `pw-play` and `paplay` both decode mp3 — CONFIRMED + MEASURED

Upstream `pw-cat(1)` says it "understands all audio file formats supported by libsndfile
for PCM capture and playback" (`https://docs.pipewire.org/page_man_pw-cat_1.html`). The doc
does not mention mp3, and it is easy to conclude from that that mp3 is unsupported — that
conclusion is **wrong** as of libsndfile 1.1.0 (2022), whose release notes add MPEG
"Layers I/II/III decoding" using libmpg123
(`https://github.com/libsndfile/libsndfile/releases/tag/1.1.0`).

Whether a given distro *enabled* it is a build question, so I checked both ends:

- MEASURED on Ubuntu 24.04: `ldd /usr/lib/x86_64-linux-gnu/libsndfile.so.1` lists
  `libmpg123.so.0` and `libmp3lame.so.0`, and `pw-play clip.mp3` / `paplay clip.mp3` both
  played it correctly, exit 0.
- CONFIRMED for Ubuntu 26.04: `libsndfile1` there declares `Depends: … libmp3lame0,
  libmpg123-0t64, …` (`https://packages.ubuntu.com/resolute/libsndfile1`), and both
  libraries are in the desktop manifest.

`paplay` is a symlink to `pacat`; `pw-play` is a symlink to `pw-cat` (MEASURED, `ls -l`).

### `aplay` does **not** decode mp3, and does not tell you so — MEASURED, and this is the trap

`aplay` handles WAVE/VOC/AU/raw. Handed an mp3 it does **not** error. It falls back to its
raw-PCM interpretation:

```
$ aplay clip.mp3
Playing raw data 'clip.mp3' : Unsigned 8 bit, Rate 8000 Hz, Mono
$ echo $?
0
```

17 180 bytes at 8 kHz mono = **2.3 s of loud noise, exit code 0**. MEASURED wall time
2 326–2 332 ms across 6 runs, versus 1 045 ms of actual audio. On a chain that stops at the
first success, `aplay` would win, emit garbage, and report victory.

So `aplay` may only be reached **when the clip is a `.wav`**. The repo's `find` already
matches `*.mp3` *and* `*.wav`, so the extension gate is not hypothetical — it is the
difference between a working wav fallback and a noise generator.

### `mpg123` decodes mp3 and **nothing else** — MEASURED

`mpg123 -q clip.wav` exits 1. It is an mp3 decoder, not a general player, so it too needs an
extension gate — the opposite one from `aplay`.

### SoX `play` needs an extra package on Debian/Ubuntu — MEASURED

`sox --help` lists `mp3` among AUDIO FILE FORMATS, but on Debian/Ubuntu that comes from the
separate `libsox-fmt-mp3` package. Without it, `play clip.mp3` fails cleanly ("no handler
for file extension"), which is at least honest. More restricting: Ubuntu's SoX reports

```
AUDIO DEVICE DRIVERS: alsa
```

— **only ALSA**. It has no PulseAudio driver at all, so on a PipeWire desktop it works
solely through the `pipewire-alsa` shim, and `AUDIODRIVER=pulseaudio play …` fails with
"no handler for given file type `pulseaudio'" (MEASURED).

### `ffplay` decodes mp3 fine — and lies about failure

See §6. It is excluded for that reason, not for a codec reason.

---

## 5. Startup latency — MEASURED

All runs against the same local PipeWire + `module-null-sink`, `PULSE_SERVER` unset, 6 runs
each, first (cold) run discarded where it differed. The clip is **1.044898 s** of real
audio, so overhead = wall − 1 045 ms.

| Candidate | Wall clock (ms), 6 runs | Overhead | Verdict |
| --- | --- | ---: | --- |
| **`pw-play`** | 1128 1130 1131 1131 1131 1132 | **+85 ms** | best |
| **`paplay`** | 1128 1129 1127 1130 1129 1127 | **+83 ms** | tied best |
| `ffplay -nodisp -autoexit` | 1248 1254 1264 1309 1295 1298 | +205…265 ms | excluded, §6 |
| `play` (SoX) | 1366 1399 1412 1391 1419 1820 | +320…375 ms | usable fallback |
| `mpg123 -q` | 1387 1836 1387 1445 1434 1391 | +345…790 ms | usable, jittery |
| `aplay` on **mp3** | 2332 2331 2327 2327 2326 2328 | — | **wrong output** |
| `aplay` on wav (1.000 s) | 1217 1219 1219 1221 1218 1217 | +217 ms | wav-only fallback |

Process startup measured separately, with no audio involved (`--version`/`--help`), against
a `/bin/true` floor of 1–2 ms:

| | ms |
| --- | --- |
| `aplay --version` | 2–4 |
| `mpg123 --version` | 1–4 |
| `sox --version` | 2–4 |
| `pw-play --help` | 3–6 |
| `paplay --version` | 3–8 |
| **`ffplay -version`** | **89–105** |

`ffplay` costs ~100 ms before it has done anything at all — that is ffmpeg's library
initialisation, and it is unavoidable.

A 3.030 s control clip confirms the overhead is **fixed startup + drain, not proportional**:
`pw-play` +110 ms, `paplay` +105 ms, `ffplay` +205…224 ms, `mpg123` +370…890 ms. So the
ranking holds at any clip length the README's ~1.5 s cap allows.

**Conclusion.** `pw-play`/`paplay` at ~85 ms are cheap enough to sit in the `Stop` hook
unremarked. `mpg123` and SoX at 320–790 ms are a noticeable fraction of a short clip, but
they are fallbacks that only run on machines lacking both leaders, so the trade is
acceptable.

---

## 6. `ffplay` is disqualified — MEASURED

This is the single most important negative result, because it interacts directly with the
project's stated worst-case ("a silent no-op is the hardest kind of failure to diagnose").

With no audio server reachable:

| Candidate | Time to fail | Exit code |
| --- | ---: | --- |
| `paplay` | 6–10 ms | 1 |
| `aplay` | 9–13 ms | 1 |
| `pw-play` | 9–37 ms | 1 |
| `play` (SoX) | 13–34 ms | 1 |
| `mpg123` | 340–397 ms | **139** (SIGSEGV) |
| **`ffplay`** | **210–257 ms** | **0** |

`ffplay -nodisp -autoexit -loglevel quiet clip.mp3` on a box with no audio device produces
no sound, no diagnostic, and **exit status 0**. In a first-success-wins chain that means it
terminates the chain, suppresses the "nothing could play this" log line, and leaves the user
with exactly the undiagnosable silence this repo is built to avoid. I verified this end to
end: with `ffplay` in the chain, a machine with no audio stack returned success and wrote
nothing to the log; with it removed, the same machine returned 1 and logged a dated line.

`mpg123`'s SIGSEGV (exit 139, on mpg123 1.32.5 with `$PULSE_SERVER` pointing at a socket
that does not exist) is ugly but *harmless* here — 139 is non-zero, so `&&` chaining moves
on correctly. Worth knowing it exists; no special handling needed.

The other four all fail fast and honestly. Note that the fail-fast cost is only paid by a
machine where the binary **exists** but has no device — if it is not installed, `command -v`
short-circuits for free. So the expensive tail of the chain is only ever reached by someone
who installed `mpg123`/SoX and *then* has no working audio.

---

## 7. The degenerate cases

| Case | Behaviour | Evidence |
| --- | --- | --- |
| **Headless / SSH, no audio device** | Every retained candidate fails in <40 ms with a non-zero status. Whole chain costs ~600–870 ms only if `mpg123` is installed (its 350 ms crash dominates); ~60 ms otherwise. | MEASURED |
| **No `XDG_RUNTIME_DIR`** (cron, bare `ssh -c`) | `pw-play` → `pw_context_connect() failed: Host is down`, rc 1, 11 ms. `paplay` → `Connection failure: Connection refused`, rc 1, 8 ms. `aplay` → `audio open error: Host is down`, rc 1, 13 ms. All correct. | MEASURED |
| **Server dies mid-session** | Same fail-fast behaviour; the chain simply finds nothing and logs. | MEASURED (killed PipeWire between runs) |
| **root** | root's `XDG_RUNTIME_DIR` is `/run/user/0`, not the desktop user's, so it cannot see their PipeWire/PulseAudio socket. All candidates fail fast and cleanly. Hooks run as the user in practice, so this only bites `sudo claude`. | MEASURED (the whole test suite ran as root) |
| **Containers** | No `/dev/snd`, no session bus, no server. Fails fast. This is the same shape as the README's existing note about cloud sessions — the hook runs, there is simply nothing to play through. | MEASURED (WSL image has no `/dev/snd` whatsoever) |
| **WSL** | Special, and better than expected — see below. | MEASURED |

### WSL deserves its own paragraph

A stock WSL Ubuntu has **no audio player installed at all** (MEASURED: `pw-play`, `paplay`,
`aplay`, `ffplay`, `mpg123`, `play`, `pactl`, `pipewire` — all absent; the 544-package WSL
manifest confirms it) and **no `/dev/snd`**. But WSLg *does* provide a working PulseAudio
16.1 server on the Windows side, advertised through a preset environment variable:

```
PULSE_SERVER=unix:/mnt/wslg/PulseServer
```

MEASURED: with `pulseaudio-utils` installed, `paplay clip.mp3` plays through to Windows
audio. `aplay` cannot (no `/dev/snd`), and `pw-play` only works if the user runs their own
PipeWire. **So on WSL the winner is `paplay`, and it is reached only because the chain does
not stop at `pw-play`.** That is the concrete payoff for keeping both.

The cost is real, though: through WSLg's RDP sink, `paplay` took **1 976–2 353 ms** for the
1.045 s clip — roughly a **second** of extra latency versus 83 ms on a native PipeWire. That
is WSLg's buffering, not `paplay`'s. It is still under the 6 s watchdog, but a WSL user will
notice the hook hanging on. Worth a README line rather than a code change.

### What to do when nothing works

The repo's position is that silence is the worst outcome, so the no-player path must leave a
trace. The recommended snippet appends one dated line to `~/.claude/back-to-you.log`:

```
2026-08-18T02:11:49 back-to-you: no usable audio player for /tmp/bty6/clip.mp3 (tried afplay, pw-play, paplay, mpg123, play, aplay)
```

MEASURED end to end. This is cheap, needs no dependency, and gives `tools/` (the diagnostic
added in 331b191) something concrete to read. The hook still exits 0 — a missing sound is
never worth surfacing a hook error, per the existing comment in `play-sound.sh`.

One thing I deliberately did **not** recommend: caching the winning player in a dotfile.
The probe is `command -v` builtins, which cost nothing when the binary is absent, and a
stale cache would survive a user installing PipeWire and quietly keep them on a worse path.

---

## 8. Is `sh` still safe? — MEASURED, yes

Claude Code spawns hooks via `sh -c`, and on Ubuntu `/bin/sh` is **dash** (MEASURED:
`/bin/sh -> dash`), which is the strictest common case. The recommended snippet passes all
three checks:

```
dash -n snippet.sh       → OK
checkbashisms -f         → rc=0, no output
shellcheck -s sh         → rc=0, no output
```

The constructs used are all POSIX: `command -v`, `case`/`esac` with character-class patterns
(`*.[Mm][Pp]3`), `&&`/`||`, function definitions with `name() { … }`, `printf`, and
`$(…)`. No `[[ ]]`, no arrays, no `$RANDOM`, no `<<<`, no `export -n` (which, incidentally,
dash rejects — I tripped over it in a test harness).

The existing background-player + watchdog pattern ports unchanged, because `pw-play` and
`paplay` block until the clip finishes exactly as `afplay` does (MEASURED — that is what the
1 130 ms figure for a 1.045 s clip *is*). No duration probing needed, same as macOS.

One nit: the watchdog wrapper's return value is meaningless — it is the status of `wait` on
the killed guard (MEASURED: rc 143). Both existing hooks follow it with `exit 0`, so this is
latent rather than a bug, but the wrapper should `return 0` explicitly if it is ever reused.

---

## 9. Recommended implementation

Drop-in replacement for the `afplay "$clip"` block in **both** `hooks/play-sound.sh` and
`hooks/play-category.sh`. Keeping `afplay` at the head means one script serves macOS and
Linux, which matters given the two files already duplicate their playback logic on purpose.

```sh
BTY_LOG="${HOME}/.claude/back-to-you.log"

bty_note() {
    # A silent no-op is the worst failure this project can have, so the one
    # case we cannot recover from leaves a dated line behind to find later.
    printf '%s back-to-you: %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "$1" \
        >> "$BTY_LOG" 2>/dev/null || true
}

# Play one clip, blocking until it finishes. Returns 0 if some player
# reported success, 1 if nothing on this machine could play it.
bty_play() {
    clip=$1
    ext=""
    case "$clip" in
        *.[Mm][Pp]3)    ext=mp3 ;;
        *.[Ww][Aa][Vv]) ext=wav ;;
    esac

    # macOS. Kept first so one script serves both platforms.
    if command -v afplay >/dev/null 2>&1; then
        afplay "$clip" 2>/dev/null && return 0
    fi

    # PipeWire. Stock on Ubuntu desktop and Fedora Workstation; decodes mp3
    # through libsndfile. ~85 ms over the clip's own length.
    if command -v pw-play >/dev/null 2>&1; then
        pw-play "$clip" 2>/dev/null && return 0
    fi

    # PulseAudio client. Works unchanged against pipewire-pulse, and is the
    # only thing that works under WSLg. Same libsndfile decoder, ~85 ms.
    if command -v paplay >/dev/null 2>&1; then
        paplay "$clip" 2>/dev/null && return 0
    fi

    # Dedicated mp3 decoder. Cannot play wav, so gate it.
    if [ "$ext" = mp3 ] && command -v mpg123 >/dev/null 2>&1; then
        mpg123 -q "$clip" 2>/dev/null && return 0
    fi

    # SoX. mp3 needs libsox-fmt-mp3 on Debian/Ubuntu; fails cleanly without it.
    if command -v play >/dev/null 2>&1; then
        play -q "$clip" 2>/dev/null && return 0
    fi

    # ffplay is deliberately NOT in this chain. Measured on a box with no
    # audio server it prints nothing, plays nothing, and exits 0 - so it would
    # swallow the failure below and leave no trace at all.

    # aplay understands wav/au/voc and NOTHING else. Handed an mp3 it does not
    # fail - it replays the compressed bytes as 8 kHz unsigned 8-bit mono and
    # exits 0. Never let it near an mp3.
    if [ "$ext" = wav ] && command -v aplay >/dev/null 2>&1; then
        aplay -q "$clip" 2>/dev/null && return 0
    fi

    bty_note "no usable audio player for $clip (tried afplay, pw-play, paplay, mpg123, play, aplay)"
    return 1
}
```

Called from the existing watchdog, unchanged in shape:

```sh
bty_play "$clip" &
player=$!
( sleep 6; kill "$player" 2>/dev/null ) >/dev/null 2>&1 &
guard=$!
wait "$player" 2>/dev/null
kill "$guard" 2>/dev/null
wait "$guard" 2>/dev/null
exit 0
```

### Verified behaviour of exactly this code

Each rung was tested by hiding the binaries above it (`mv /usr/bin/pw-play …`) — MEASURED:

| Scenario | Result |
| --- | --- |
| PipeWire up | `pw-play` wins, rc 0 |
| `pw-play` hidden | falls through to `paplay`, rc 0 |
| `pw-play` + `paplay` hidden | falls through to `mpg123`, rc 0 |
| + `mpg123` hidden | falls through to SoX `play`, rc 0 |
| + `play` hidden, clip is mp3 | **rc 1, log line written** — `aplay` correctly skipped |
| + `play` hidden, clip is wav | `aplay` wins, rc 0 |
| no audio stack at all | rc 1, log line written |

The last two rows are the ones that matter: given an mp3 and nothing but `aplay`, this code
refuses and logs, where the naive version would have played 2.3 s of noise.

---

## 10. Reading `last_assistant_message` on Linux (for #31)

`plutil` and JXA are both macOS-only, and the project cannot assume `jq` or `python3`. But
it can assume **`awk`** — POSIX requires it, and every distro in scope has one (`mawk` and
`gawk` on Debian/Ubuntu, `gawk` on Fedora and Arch, `busybox awk` on minimal images).

Recommended order: **`jq` → `python3` → a bundled `awk` extractor**. The first two are one
line each and are present more often than not (Ubuntu 26.04 desktop ships both — CONFIRMED
from the manifest); the awk fallback is what makes the hook dependency-free.

I wrote and tested that fallback. It is a real JSON scanner, not a regex: it walks the
document tracking string/escape state, reads keys at the top level only, skips over nested
objects and arrays, and decodes `\n \t \r \b \f \/ \\ \"` plus `\uXXXX` including surrogate
pairs, re-encoding to UTF-8. About 100 lines of POSIX awk.

MEASURED against 10 payloads, run under **both `mawk` and `gawk`** with identical results,
and cross-checked against `python3 -c 'json.load(...)'`:

| Case | Result |
| --- | --- |
| plain message | correct |
| embedded `\n`, question on last line | correct |
| **nested decoy** `{"a":{"last_assistant_message":"NESTED"},…}` | returns the real top-level value |
| **decoy inside a string value** — another field whose *content* is the literal text `"last_assistant_message":"FAKE"` | returns the genuine value |
| escaped quotes `He said \"go\", right?` | correct |
| `"last_assistant_message": null` | exit 1 (not a string) |
| key absent | exit 1 |
| unicode escapes / emoji / CJK | correct, byte-identical to `python3` |
| values after arrays, booleans, nulls | correct |
| trailing backslash | correct |

All 8 comparable cases were **byte-identical to `python3`'s `json.load`**. The two decoy
cases are the reason a regex or a naive `index(buf, "\"last_assistant_message\"")` is not
good enough — the assistant's own message can contain arbitrary text, including that key.

Performance, on a realistic ~7 KB payload, 5 runs each — MEASURED:

| | ms |
| --- | --- |
| `mawk` + the extractor | 8, 8, 8, 9, 11 |
| `python3` + `json.load` | 29, 30, 32, 33, 35 |

The awk fallback is ~4x *faster* than `python3`, because it pays no interpreter startup.
That is a genuine argument for reaching for it early rather than treating it as a last
resort — though `jq`/`python3` remain more obviously correct to a reader, so the ordering
above trades a few milliseconds for reviewability.

The classification logic that follows needs no change: the existing "compare only the last
non-empty line" approach from #5 is orthogonal to how the field is read.

The extractor source is not committed here — this is a research note, not an
implementation. It lives in the scratch used for this investigation and should be written
fresh (and re-tested against the table above) when #31 is implemented.

---

## 11. What I could not verify

Stated plainly, because the numbers above are otherwise unusually solid:

1. **No real sound hardware was involved.** Every measurement used a null sink or WSLg's RDP
   sink. Real ALSA hardware adds device-open time that could differ per driver. The
   *ranking* is safe (3–5x gaps); the absolute milliseconds are not gospel.
2. **Only Ubuntu was executed.** Fedora and Arch conclusions are from package manifests and
   dependency graphs (CONFIRMED as packaging facts) but nobody ran `pw-play` on them.
3. **The Ubuntu box was 24.04, the manifest evidence is 26.04.** Package versions differ
   (`pipewire` 1.0.5 vs 1.6.2, `libsndfile` 1.2.2 in both). No behavioural difference is
   expected, but it is an interpolation.
4. **Everything ran as root**, which is the pessimistic case for session-socket access. That
   makes the fail-fast numbers trustworthy and the success numbers slightly unusual — a real
   user session would if anything be faster to connect.
5. **Arch was never booted.** The "both `pw-play` and `paplay` are present" claim is INFERRED
   from `pipewire-pulse`'s declared dependencies.
6. **`mpg123`'s SIGSEGV** was seen only with a deliberately bogus `$PULSE_SERVER`. I did not
   chase whether it reproduces on a real system with a stale socket.

---

## Sources

Ubuntu (Canonical, first-party):

- <https://releases.ubuntu.com/> — release list; 26.04 LTS "Resolute Raccoon", 2026-04-23
- <https://releases.ubuntu.com/26.04/ubuntu-26.04-desktop-amd64.manifest> — desktop live-filesystem contents
- <https://releases.ubuntu.com/26.04/ubuntu-26.04-live-server-amd64.manifest> — server contents
- <https://releases.ubuntu.com/26.04/ubuntu-26.04-wsl-amd64.manifest> — WSL image contents
- <https://packages.ubuntu.com/resolute/libsndfile1> — `Depends: libmp3lame0, libmpg123-0t64`
- <https://packages.ubuntu.com/resolute/amd64/pipewire-bin/filelist> — `/usr/bin/pw-play`

Fedora (first-party):

- <https://pagure.io/fedora-comps> — `comps-f43.xml.in`: `workstation-product-environment` grouplist, `multimedia` and `audio` groups, `pulseaudio-utils` confined to i3/sway/miraclewm

Arch Linux (first-party package database):

- <https://archlinux.org/packages/extra/x86_64/pipewire-audio/files/> — ships `pw-play`, `pw-cat`
- <https://archlinux.org/packages/extra/x86_64/libpulse/files/> — ships `paplay`, `pacat`, `pactl`
- <https://archlinux.org/packages/extra/x86_64/pipewire-pulse/> — depends on `pipewire-audio` and `libpulse`; conflicts/replaces `pulseaudio`
- <https://archlinux.org/packages/extra/x86_64/pipewire/> — base package, no `pw-cat`

Upstream projects:

- <https://docs.pipewire.org/page_man_pw-cat_1.html> — `pw-cat(1)`; aliases `pw-play`/`pw-record`; "all audio file formats supported by libsndfile"
- <https://github.com/libsndfile/libsndfile/releases/tag/1.1.0> — MPEG Layer I/II/III decoding via libmpg123

Everything tagged MEASURED came from the WSL Ubuntu 24.04 rig described in §1. The probe
scripts were throwaway and are not committed.
