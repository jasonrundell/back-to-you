'use strict';

// The effects: everything that touches disk.

const fs = require('node:fs');
const path = require('node:path');

const { hookFacts, layout, packageSoundsDir } = require('./paths');
const { mergeSettings } = require('./settings');
const { removeLegacyClips } = require('./uninstall');

const REQUIRED_CATEGORIES = ['task-complete', 'decision-needed'];
const CLIP_EXTENSIONS = new Set(['.mp3', '.wav']);

function dirsIn(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function hasClips(dir) {
  try {
    return fs.readdirSync(dir).some((f) => CLIP_EXTENSIONS.has(path.extname(f).toLowerCase()));
  } catch {
    return false;
  }
}

/**
 * Every pack the picker should offer: the ones shipped in this package, union
 * anything already under ~/.claude/sounds.
 *
 * The union is what keeps custom packs alive under npx, where there is no
 * checkout to hold them. The installer has always copied packs in without
 * deleting, so a custom pack in ~/.claude/sounds is already the steady state
 * - what is new is the CLI being able to see it.
 */
function availablePacks(paths, sourceDir) {
  const shipped = dirsIn(sourceDir || packageSoundsDir());
  const installed = dirsIn(paths.soundsDir);
  const all = new Set([...shipped, ...installed]);
  return [...all].sort((a, b) => (a === 'claude' ? -1 : b === 'claude' ? 1 : a.localeCompare(b)));
}

/** Read what is currently installed. */
function readInstallState(paths) {
  let activeTheme = null;
  let version = null;

  try {
    activeTheme = fs.readFileSync(paths.themeFile, 'utf8').trim() || null;
  } catch { /* not installed */ }

  try {
    version = fs.readFileSync(paths.versionFile, 'utf8').trim() || null;
  } catch { /* pre-versioning install, or not installed */ }

  return { installed: Boolean(activeTheme), activeTheme, version };
}

/** Pre-flight, matching the shell installers': the pack must exist and be usable. */
function checkPack(pack, searchDirs) {
  for (const base of searchDirs) {
    const dir = path.join(base, pack);
    if (!fs.existsSync(dir)) continue;
    const empty = REQUIRED_CATEGORIES.filter((c) => !hasClips(path.join(dir, c)));
    if (empty.length > 0) {
      return { ok: false, reason: `"${pack}" has no clips in: ${empty.join(', ')}` };
    }
    return { ok: true, dir };
  }
  return { ok: false, reason: `No pack folder named "${pack}"` };
}

/** Recursive copy. Hand-rolled rather than fs.cpSync, which warns as experimental on Node 18/20. */
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else if (entry.isFile()) fs.copyFileSync(src, dst);
  }
}

function backupSettings(paths) {
  if (!fs.existsSync(paths.settings)) return null;
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const backup = `${paths.settings}.bak.${stamp}`;
  fs.copyFileSync(paths.settings, backup);
  return backup;
}

/**
 * Copy packs and hooks, wire settings.json, set the active pack.
 *
 * Never throws. Effects are wrapped in try/catch so that any failure -
 * expected (a bad settings.json) or not (an unexpected fs error) - comes
 * back as `{ ok: false, ... }` rather than an exception the caller has to
 * plan around.
 *
 * @returns {{ok: true, steps: object[]} | {ok: false, error: string, settingsRestored: boolean, steps: object[]}}
 */
function runFullInstall({ pack, version, root, sourceSounds, sourceHooks }) {
  const paths = layout(root);
  const facts = hookFacts();
  const steps = [];
  const soundsFrom = sourceSounds || packageSoundsDir();
  const hooksFrom = sourceHooks || path.join(__dirname, '..', 'hooks');

  // Every file the hooks need, including the shared library they require but
  // that settings.json never names.
  const hookFiles = [facts.soundHook, facts.categoryHook, ...(facts.support || [])];

  // These must exist before anything is written. A missing hook is the silent
  // no-op this project treats as its worst failure mode, so it is caught here
  // rather than discovered later - and a missing support file would break the
  // hooks just as completely while being far less obvious.
  for (const name of hookFiles) {
    if (!fs.existsSync(path.join(hooksFrom, name))) {
      return {
        ok: false,
        error: `Hook script missing from the package: hooks/${name}`,
        settingsRestored: false,
        steps: [],
      };
    }
  }

  try {
    fs.mkdirSync(paths.hooksDir, { recursive: true });
    fs.mkdirSync(paths.soundsDir, { recursive: true });

    // Every pack comes along, so installing one never deletes a custom one.
    copyDir(soundsFrom, paths.soundsDir);
    steps.push({ kind: 'packs-copied' });

    // Copying never deletes, so a category this package has retired would sit
    // in ~/.claude for ever otherwise - and play again the moment someone
    // wired the event back by hand. Unwiring it is only half the job.
    const legacy = removeLegacyClips(paths.soundsDir);
    if (legacy > 0) {
      steps.push({ kind: 'legacy-clips-removed', count: legacy });
    }

    // The subagent-done marker, left behind by hooks older than 1.3.0.
    try {
      fs.unlinkSync(paths.markerFile);
    } catch { /* not there, which is the normal case */ }

    for (const name of hookFiles) {
      fs.copyFileSync(path.join(hooksFrom, name), path.join(paths.hooksDir, name));
    }
    steps.push({ kind: 'hooks-installed' });

    const backup = backupSettings(paths);
    if (backup) steps.push({ kind: 'settings-backed-up', backup });

    try {
      const { removed } = mergeSettings(paths.settings, paths.hooksDir, facts);
      if (removed > 0) {
        steps.push({ kind: 'owned-entries-removed', count: removed });
      }
      steps.push({ kind: 'settings-updated' });
    } catch (err) {
      if (backup) fs.copyFileSync(backup, paths.settings);
      return { ok: false, error: err.message, settingsRestored: Boolean(backup), steps };
    }

    fs.writeFileSync(paths.versionFile, `${version}\n`, 'utf8');

    writeTheme(pack, root);
    steps.push({ kind: 'theme-set', pack });

    return { ok: true, steps };
  } catch (err) {
    return { ok: false, error: err.message, settingsRestored: false, steps };
  }
}

/** A pack switch: one line in one file, nothing else. */
function writeTheme(pack, root) {
  const paths = layout(root);
  fs.mkdirSync(paths.claudeDir, { recursive: true });
  fs.writeFileSync(paths.themeFile, `${pack}\n`, 'utf8');
}

module.exports = {
  availablePacks,
  readInstallState,
  checkPack,
  runFullInstall,
  writeTheme,
  copyDir,
};
