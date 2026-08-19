'use strict';

// Taking it all back out again.
//
// The governing rule, from the design ticket: never delete anything the user
// made. That is not only whole custom packs - the README invites people to
// drop extra clips into a shipped pack's folder, so user content lives inside
// our directories too. Everything under sounds/ is therefore matched by exact
// relative path against what this package ships, never by directory name.

const fs = require('node:fs');
const path = require('node:path');

const { layout, hookFacts, ownedStateFiles, packageSoundsDir } = require('./paths');
const { unwireSettings, OWNED_SCRIPTS } = require('./settings');

/** Relative paths of every file this package ships under sounds/. */
function shippedClips(sourceDir) {
  const base = sourceDir || packageSoundsDir();
  const out = [];
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const next = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), next);
      else if (e.isFile()) out.push(next);
    }
  };
  walk(base, '');
  return out;
}

/** Count the files left under a directory. */
function countFiles(dir) {
  let n = 0;
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else n++;
    }
  };
  walk(dir);
  return n;
}

/** Remove directories that are now empty, deepest first. Never removes `root` itself if it still holds anything. */
function pruneEmptyDirs(root) {
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) walk(path.join(dir, e.name));
    }
    try {
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch { /* not empty, or gone */ }
  };
  walk(root);
}

function removeFile(p) {
  try {
    fs.unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Is anything of ours actually here? */
function isInstalled(root) {
  const paths = layout(root);
  if (ownedStateFiles(paths).some((f) => fs.existsSync(f))) return true;
  const facts = hookFacts();
  const names = new Set([...OWNED_SCRIPTS, ...(facts.support || [])]);
  return [...names].some((n) => fs.existsSync(path.join(paths.hooksDir, n)));
}

/**
 * Remove everything this project installed, and nothing else.
 *
 * @returns {{removed: string[], survivors: number, backup: string|null,
 *            unwired: number, soundsDir: string, backupsKept: string[]}}
 */
function runUninstall({ root, sourceSounds } = {}) {
  const paths = layout(root);
  const facts = hookFacts();
  const removed = [];

  // --- hook scripts -------------------------------------------------------
  // Every script this project has ever installed, not just the current
  // platform's: OWNED_SCRIPTS is the same list stripOwnedHooks unwires from
  // settings.json, so the two halves cannot drift. play-lib.js is not in it -
  // it is required by the hooks, never invoked as a command - so the
  // platform's support files are added here.
  const hookNames = new Set([...OWNED_SCRIPTS, ...(facts.support || [])]);
  for (const name of hookNames) {
    if (removeFile(path.join(paths.hooksDir, name))) removed.push(`hooks/${name}`);
  }

  // --- state files --------------------------------------------------------
  for (const f of ownedStateFiles(paths)) {
    if (removeFile(f)) removed.push(path.basename(f));
  }

  // --- clips --------------------------------------------------------------
  // Exact relative paths only. A pack the user made survives whole, and so
  // does a take they added inside a shipped pack.
  let clipCount = 0;
  for (const rel of shippedClips(sourceSounds)) {
    if (removeFile(path.join(paths.soundsDir, rel))) clipCount++;
  }
  if (clipCount > 0) removed.push(`${clipCount} clip${clipCount === 1 ? '' : 's'}`);
  pruneEmptyDirs(paths.soundsDir);

  // --- settings.json ------------------------------------------------------
  // Backed up first, exactly as installing does. Removing hooks is a smaller
  // change than adding them, but it is still someone's configuration.
  let backup = null;
  let unwired = 0;
  if (fs.existsSync(paths.settings)) {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    backup = `${paths.settings}.bak.${stamp}`;
    fs.copyFileSync(paths.settings, backup);
    try {
      unwired = unwireSettings(paths.settings).removed;
    } catch (err) {
      fs.copyFileSync(backup, paths.settings);
      throw err;
    }
    if (unwired > 0) removed.push(`${unwired} settings.json entr${unwired === 1 ? 'y' : 'ies'}`);
  }

  // Deliberately kept: their contents are the user's prior configuration, and
  // they are the recovery path if this went wrong.
  let backupsKept = [];
  try {
    backupsKept = fs
      .readdirSync(paths.claudeDir)
      .filter((f) => f.startsWith('settings.json.bak.'));
  } catch { /* no ~/.claude */ }

  return {
    removed,
    survivors: countFiles(paths.soundsDir),
    soundsDir: paths.soundsDir,
    backup,
    unwired,
    backupsKept,
  };
}

module.exports = { runUninstall, isInstalled, shippedClips, countFiles, pruneEmptyDirs };
