# README banner fragment

Drop this at the very top of `README.md`, above the H1. Draft output of the hero-banner
ticket; the README ticket owns everything below it.

```html
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">
    <img src="assets/banner-light.svg" alt="Back to You — a voice for Claude Code" width="820">
  </picture>
</p>
```

Then the H1, which carries the ElevenLabs attribution required by free-tier terms:

```markdown
# Back to You — voices by elevenlabs.io
```

## Why two files instead of one self-theming SVG

An SVG can carry its own `@media (prefers-color-scheme: dark)` block, but GitHub serves
README images through an `<img>` element and a proxy, and the media query is not reliably
evaluated there. `<picture>` with a `media` source is the pattern GitHub documents and it
degrades correctly everywhere else — npm, forks, raw markdown viewers — falling back to
the light file.

Keep both files in step. Any edit to one needs the same edit to the other; the only
differences should be the three colour values.

## Colours

| Role | Light | Dark |
| --- | --- | --- |
| Wordmark | `#16191c` | `#e9ecec` |
| Tagline | `#5f6b72` | `#97a3aa` |
| Arc and dot | `#a4692a` | `#e0a85c` |

The accent is a desaturated terminal amber — the one saturated element in the whole
identity, which is where the boldness is deliberately spent.

## Known caveat: the wordmark is live text

Both files set the wordmark in a system font stack, so it renders as Segoe UI on Windows,
San Francisco on macOS, and something else again on Linux. The composition holds, but the
letterforms are not fixed, which is not what a wordmark should do.

Converting the wordmark to outlines locks it. The tagline can stay live text — it is
copy, not a logo. This is tracked as an open follow-up rather than done, because it needs
a font decision first.
