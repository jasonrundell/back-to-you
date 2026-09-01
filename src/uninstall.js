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

const { layout, hookFacts, ownedStateFiles, packageSoundsDir, LEGACY_CLIPS } = require('./paths');
const { unwireSettings, backupSettingsFile, OWNED_SCRIPTS } = require('./settings');

/** Relative paths of every file under a directory, depth-first. `[]` if it cannot be read. */
function filesUnder(dir) {
  const out = [];
  const walk = (d, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const next = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), next);
      else if (e.isFile()) out.push(next);
    }
  };
  walk(dir, '');
  return out;
}

/** Relative paths of every file this package ships under sounds/. */
function shippedClips(sourceDir) {
  return filesUnder(sourceDir || packageSoundsDir());
}

/** Count the files left under a directory. */
function countFiles(dir) {
  return filesUnder(dir).length;
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

/**
 * Delete clips an older version shipped and this one does not.
 *
 * Installing calls this too: retiring a category means taking its clips off
 * the machine, not only unwiring the event that played them. Exact relative
 * paths, so a take the user added to the same folder survives - and the empty
 * folder goes only if nothing of theirs is left in it.
 *
 * @returns {number} how many were there
 */
function removeLegacyClips(soundsDir) {
  let n = 0;
  for (const rel of LEGACY_CLIPS) {
    if (removeFile(path.join(soundsDir, rel))) n++;
  }
  if (n > 0) pruneEmptyDirs(soundsDir);
  return n;
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
  // settings.json, so the two halves cannot drift. The shared libraries
  // (play-lib.js, play-lib.ps1) are in it too - never invoked as commands,
  // but listed so an uninstall on either platform removes the other
  // platform's leftover lib from a ~/.claude that has moved between them.
  // The current platform's support files are unioned in as well, so a new
  // support file is removed even before it joins the list.
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
  // does a take they added inside a shipped pack. LEGACY_CLIPS covers what
  // older versions shipped, so uninstalling from a machine that never took
  // an upgrade still leaves nothing of ours behind.
  let clipCount = 0;
  for (const rel of [...shippedClips(sourceSounds), ...LEGACY_CLIPS]) {
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
    backup = backupSettingsFile(paths.settings);
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
    const prefix = `${path.basename(paths.settings)}.bak.`;
    backupsKept = fs
      .readdirSync(paths.claudeDir)
      .filter((f) => f.startsWith(prefix));
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

module.exports = {
  runUninstall,
  isInstalled,
  shippedClips,
  removeLegacyClips,
};
