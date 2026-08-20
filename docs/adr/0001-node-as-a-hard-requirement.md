# Node is a hard requirement, and the shell installers become shims

To ship on npm as `npx backtoyou`, Node became a hard requirement of this project — at install time, and at hook runtime on macOS and Linux. In exchange, the runtime hooks split by platform (Node on Unix, PowerShell on Windows), and `install.sh` / `install.bat` are reduced to thin shims that exec the Node CLI.

This reverses the project's original stated position, which the README advertised as *"Needs nothing beyond a stock macOS — no Homebrew, no `jq`, no Python, no Node."* A reader finding a three-line `install.sh` in this repo deserves to know that was deliberate.

## Considered options

**All-Node hooks, including Windows — rejected on measurement.** `play-category.ps1` plays through `System.Windows.Media.MediaPlayer`, a WPF assembly Node cannot reach, so a Node hook must spawn PowerShell to play anything. Measured on Windows: the existing PowerShell path costs ~1,212 ms before audio starts (~364 ms interpreter startup, ~509 ms once `PresentationCore` loads, the rest resolving the clip duration), while Node spawning that same path costs ~1,590 ms. Node can only add to Windows, never subtract.

**All-native hooks — rejected because every problem Node solves is a Unix problem.** `plutil`, the inline JXA fallback, and the `awk` JSON scanner all existed to read one field of the hook payload without a JSON parser. Windows never had that problem; PowerShell parses JSON natively. Splitting takes the payoff without the cost.

**A `cmd` shim preferring Node when present — rejected on measurement.** 369.6 ms versus 353.4 ms for plain PowerShell: `cmd` startup (78.7 ms) plus the `where node` lookup consumes the entire saving.

**Full parity between the shell installers and the CLI — rejected as pointless.** Parity existed to serve users without Node, a group that no longer exists by definition. A shim cannot drift, which closes the question permanently rather than deferring it.

## Consequences

- **Zero runtime dependencies is binding**, not a preference. The package must run as `node bin/cli.js` from a clone or an unzipped folder with no `npm install` first, because the shims depend on exactly that.
- **444 lines of installer tooling were deleted** — `tools/merge-settings.js` (JXA), `tools/merge-settings.ps1`, `tools/lint-json.js` — all of which existed only to work around the absence of a JSON parser at install time.
- **macOS and Linux pay ~40–110 ms per response** in Node startup, against a hook that already blocks 1.0–1.5 s waiting for the clip to finish.
- **Windows keeps its ~1.2 s of hook overhead.** Reducing it needs a Node-reachable Windows player — a native module or a bundled binary — and is out of scope for the npm effort.
- **The classification logic now exists in two languages** and must stay byte-identical. Both implementations share one `~/.claude`, so anything either writes there is a compatibility surface: a user can switch platforms against it. Up to 1.2.0 that included `.subagent-done-at`, written by whichever platform's hook fired; `SubagentStop` is unwired as of 1.3.0 and nothing writes it now.

## Provenance

Decided across [the wayfinder map for shipping on npm](https://github.com/jasonrundell/back-to-you/issues/23) — specifically [the hook-language ticket](https://github.com/jasonrundell/back-to-you/issues/27) and [the shell-installer ticket](https://github.com/jasonrundell/back-to-you/issues/28), which carry the full measurements and reasoning.

The macOS figures were never measured — no Mac was available — and the Linux Node figure (113 ms) was measured under WSL, where filesystem overhead inflates it; bare metal is typically 40–60 ms.
