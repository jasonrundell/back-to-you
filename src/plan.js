'use strict';

// Pure planning. No I/O, no console: takes a description of the world and
// returns what should happen. Lifted from the session prototype on branch
// prototype/npx-cli-session, which is where the CLI surface was settled (#26).

// The pack a fresh, non-interactive install takes, and what a bare Enter on
// the picker falls back to. The runtime hooks (hooks/play-lib.js,
// hooks/play-lib.ps1) deliberately keep their own 'claude' fallback literals
// rather than importing this - they run from ~/.claude, not from a checkout
// of this package, and cannot require() an install-time module.
const DEFAULT_PACK = 'claude';

/**
 * Classify a run. Only `fresh` and `upgrade` take the full install path.
 *
 *   fresh    nothing installed yet
 *   upgrade  installed, but at a different version of this package
 *   switch   installed at this version, and a different pack was chosen
 *   same     installed at this version, and the active pack was chosen
 */
function classifyRun({ install, chosen, version }) {
  if (!install.installed) return 'fresh';
  if (install.version !== version) return 'upgrade';
  if (install.activeTheme === chosen) return 'same';
  return 'switch';
}

/**
 * Which pack should this run activate, and what should be said about it?
 *
 * @returns {{ok: true, chosen: string, notes: string[]}
 *          | {ok: false, error: string, detail: string[]}}
 */
function resolvePack({ packs, install, arg, interactive, picked }) {
  const notes = [];

  if (arg !== null && arg !== undefined) {
    if (!packs.includes(arg)) {
      return {
        ok: false,
        // install.sh names a path inside its own checkout here. Under npx
        // there is no checkout, so the path would be a lie.
        error: `No pack named "${arg}".`,
        detail: ['Available packs:', ...packs.map((p) => `  ${p}`)],
      };
    }
    return { ok: true, chosen: arg, notes };
  }

  if (!interactive) {
    // Piped, CI, curl | sh. A fresh run takes the default and says so rather
    // than choosing in silence the way install.sh does. A re-run keeps what
    // is already active - forcing `claude` here would silently switch the
    // pack of anyone automating a reinstall.
    if (install.installed) {
      notes.push(`Not a terminal — keeping the active pack (${install.activeTheme}).`);
      return { ok: true, chosen: install.activeTheme, notes };
    }
    notes.push(`Not a terminal — installing the default pack (${DEFAULT_PACK}).`);
    return { ok: true, chosen: DEFAULT_PACK, notes };
  }

  if (picked === null || picked === undefined) {
    return { ok: false, error: 'No pack chosen.', detail: [] };
  }
  return { ok: true, chosen: picked, notes };
}

/** The pack a bare Enter accepts: whatever is active, else `claude`. */
function defaultPack(packs, install) {
  if (install.installed && packs.includes(install.activeTheme)) return install.activeTheme;
  return packs.includes(DEFAULT_PACK) ? DEFAULT_PACK : packs[0];
}

/** Validate a picker response. Returns a pack name, or null if out of range. */
function readChoice(raw, packs, fallback) {
  const trimmed = String(raw == null ? '' : raw).trim();
  if (trimmed === '') return fallback;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (n < 1 || n > packs.length) return null;
  return packs[n - 1];
}

/**
 * What the run should actually do.
 *
 * @returns {{kind: string, writeTheme: boolean, fullInstall: boolean,
 *            needsRestart: boolean, noop: boolean}}
 */
function planEffects({ install, chosen, version }) {
  const kind = classifyRun({ install, chosen, version });
  const fullInstall = kind === 'fresh' || kind === 'upgrade';
  return {
    kind,
    fullInstall,
    // A switch writes only this. The hooks re-read it on every fire, so it
    // takes effect on the next sound with no restart - which is what the
    // README has always promised.
    writeTheme: kind !== 'same',
    needsRestart: fullInstall,
    noop: kind === 'same',
  };
}

/**
 * Should an uninstall run proceed, refuse, or ask first?
 *
 * The uninstall prompt is the one confirmation in the CLI, and its non-TTY
 * rule is deliberately the **opposite** of installing's: an install without a
 * terminal proceeds and says so, because it is safe and idempotent, but a
 * deletion that proceeds unasked in a script is how someone loses voice packs
 * they made. `--uninstall` off a terminal fails unless `--yes` is passed.
 *
 * @returns {'proceed' | 'refuse' | 'ask'}
 */
function uninstallGate({ assumeYes, interactive }) {
  if (assumeYes) return 'proceed';
  if (!interactive) return 'refuse';
  return 'ask';
}

/** Does an uninstall consent answer mean yes? */
function readConsent(answer) {
  return /^y(es)?$/i.test(String(answer).trim());
}

module.exports = {
  DEFAULT_PACK,
  classifyRun,
  resolvePack,
  defaultPack,
  readChoice,
  planEffects,
  uninstallGate,
  readConsent,
};
