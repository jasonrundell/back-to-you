# PROTOTYPE — `npx backtoyou` session shape

Throwaway. Not shipped, not tested, not imported by anything real.

```bash
node prototype/backtoyou-cli/tui.mjs
```

`[1]`–`[0]` pick a scenario, `[v]` cycles the re-run design, `[p]` cycles platform, `[q]` quits.

## The question this answers

Issue #26. What does a `npx backtoyou` session actually look like — on a first run, and on the re-run that switches voice? The original ask had two verbs, *"run the installer and choose a voice"* and *"change the voice to one of the other voices"*, and the second one has no shape yet.

`plan.mjs` is the half worth keeping: a pure planner that takes a description of the world (packs available, what is already installed, args, platform, TTY) and returns the transcript that world produces. `tui.mjs` is the disposable shell that drives it.

## The three designs on offer

**A — re-run is just the installer again.** Identical picker, defaulting to whatever pack is currently active. Re-copies every pack, reinstalls the hooks, re-merges `settings.json`. `sound-theme.txt` stays the documented way to switch, exactly as the README sells it today.

**B — re-run knows it is installed.** Prints the current pack, then the picker. Choosing the active pack exits with "nothing to do". Choosing a different one writes `sound-theme.txt` and stops — no copying, no settings merge, no restart.

**C — bare re-run reports status and changes nothing.** Switching requires `npx backtoyou <pack>`. The safest against a mis-typed re-run; the least discoverable.

## What building it turned up

**1. Variant A rewrites `settings.json` to change one word.** A switch is one line in a text file, but variant A takes the full install path to get there — backup, merge, and a "restart Claude Code" instruction the user does not actually need. The hook re-reads `sound-theme.txt` on every fire.

**2. "Restart Claude Code" is true on install and false on switch.** A fresh install changes `settings.json`, so the restart is real. A switch does not, and the README already advertises that: *"it takes effect on the next sound, with no reinstall and no restart"*. Only variants B and C can tell the truth here; A prints the restart line either way.

**3. Custom packs have no home under npx.** The README's "Make your own theme" says to create `sounds/mytheme/` **in the checkout** and run `./install.sh mytheme`. With npx there is no checkout. The only surviving location is `~/.claude/sounds/mytheme`, which means the CLI has to merge two pack sources — the ones in the tarball and the ones already on disk — and the picker has to show both. Scenario `[0]` assumes it does. Nothing in the map covers this yet.

**4. The unknown-pack error had the wrong path in it.** `install.sh` points the user at its own checkout; under npx that path does not exist. Now fixed to name the pack rather than a directory, but "available packs" still depends on question 3.

**5. Non-interactive is a silent default today.** `install.sh` falls back to `claude` when stdin is not a TTY, with no output. Under `npx` — where piping and CI are more likely — scenario `[8]` prints a line saying so instead. Worth confirming that is wanted.

---

## Verdict (issue #26, closed)

**Variant B wins.** The re-run knows it is installed; the picker defaults to the active pack; a plain switch writes only `sound-theme.txt` — no copy, no settings merge, no restart. Picking the active pack exits "nothing to do". Fresh installs and version upgrades still take the full path.

**Custom packs live in `~/.claude/sounds/`,** and the picker shows the union of those and the packs in the tarball. This is the question above that the ticket had not anticipated.

**Non-TTY installs `claude` and announces it,** rather than choosing silently as `install.sh` does today.

Full reasoning is on the closed issue. `plan.mjs` is the half that lifts into the real CLI (#30); `tui.mjs` stops here.
