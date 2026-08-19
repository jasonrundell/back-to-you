'use strict';

// The effects: everything that touches disk.

const fs = require('node:fs');
const path = require('node:path');

const { hookFacts, layout, packageSoundsDir } = require('./paths');
const { mergeSettings } = require('./settings');

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
 * Copy packs and hooks, wire settings.json.
 *
 * @returns {string[]} the `ok` lines to print
 */
function runFullInstall({ pack, version, root, sourceSounds, sourceHooks, log }) {
  const paths = layout(root);
  const facts = hookFacts();
  const lines = [];
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
      throw new Error(`Hook script missing from the package: hooks/${name}`);
    }
  }

  fs.mkdirSync(paths.hooksDir, { recursive: true });
  fs.mkdirSync(paths.soundsDir, { recursive: true });

  // Every pack comes along, so installing one never deletes a custom one.
  copyDir(soundsFrom, paths.soundsDir);
  lines.push('ok  Sound packs copied');

  for (const name of hookFiles) {
    fs.copyFileSync(path.join(hooksFrom, name), path.join(paths.hooksDir, name));
  }
  lines.push('ok  Hook scripts installed');

  const backup = backupSettings(paths);
  if (backup) lines.push(`ok  Backed up settings to ${backup}`);

  try {
    const { removed } = mergeSettings(paths.settings, paths.hooksDir, facts);
    if (removed > 0) {
      lines.push(`ok  Removed ${removed} existing Back to You hook entr${removed === 1 ? 'y' : 'ies'}`);
    }
    lines.push('ok  settings.json updated');
  } catch (err) {
    if (backup) {
      fs.copyFileSync(backup, paths.settings);
      if (log) log(`  Restored settings from ${backup}`);
    }
    throw err;
  }

  fs.writeFileSync(paths.versionFile, `${version}\n`, 'utf8');
  return lines;
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
