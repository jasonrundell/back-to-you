#!/usr/bin/env node
'use strict';

// `npx backtoyou` - installs Back to You into ~/.claude, or switches the
// active voice pack.
//
// Zero runtime dependencies, deliberately: install.sh and install.bat are
// shims that exec this file straight from a clone or an unzipped folder,
// with no `npm install` first. See docs/adr/0001.

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const { layout, hookFacts, packageSoundsDir, IS_WINDOWS } = require('../src/paths');
const { resolvePack, defaultPack, readChoice, planEffects } = require('../src/plan');
const {
  availablePacks,
  readInstallState,
  checkPack,
  runFullInstall,
  writeTheme,
} = require('../src/install');
const { runUninstall, isInstalled } = require('../src/uninstall');

const VERSION = require('../package.json').version;

const out = (s = '') => process.stdout.write(`${s}\n`);
const err = (s = '') => process.stderr.write(`${s}\n`);

function usage() {
  out('Back to You — a voice for Claude Code, by elevenlabs.io');
  out('');
  out('  npx backtoyou             pick a voice pack, or switch the active one');
  out('  npx backtoyou <pack>      activate <pack> without prompting');
  out('  npx backtoyou --uninstall remove it all again');
  out('');
  out('  --help      this message');
  out('  --version   print the version');
  out('  --yes       skip the uninstall confirmation (required when not a terminal)');
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function pick(packs, fallback) {
  out('Choose a voice pack:');
  out('');
  packs.forEach((p, i) => out(`  ${i + 1}) ${p}${p === fallback ? ' (default)' : ''}`));
  out('');

  const answer = await ask(`Pick a number [${packs.indexOf(fallback) + 1}]: `);
  const chosen = readChoice(answer, packs, fallback);
  if (chosen === null) {
    out('');
    err(`ERROR: "${String(answer).trim()}" isn't one of the choices above.`);
    return null;
  }
  out('');
  return chosen;
}

/**
 * Remove everything this project installed.
 *
 * The only destructive path in the CLI, so it is the only one that asks. The
 * non-TTY rule is deliberately the opposite of installing: an install without
 * a terminal proceeds and says so, because it is safe and idempotent, but a
 * deletion that proceeds unasked in a script is how someone loses voice packs
 * they made.
 */
async function uninstall({ assumeYes, interactive }) {
  const paths = layout();

  if (!isInstalled(null)) {
    out('Back to You is not installed — nothing to remove.');
    return 0;
  }

  if (!assumeYes) {
    if (!interactive) {
      err('ERROR: --uninstall needs confirmation, and this is not a terminal.');
      err('Re-run with --yes if you are sure.');
      return 1;
    }
    out('This removes Back to You from ~/.claude:');
    out('  the hook scripts, the clips this package shipped, and its settings.json entries.');
    out('');
    out('Voice packs you made yourself are kept, and so are your settings backups.');
    out('');
    const answer = await ask('Remove it? [y/N]: ');
    if (!/^y(es)?$/i.test(String(answer).trim())) {
      out('Left alone.');
      return 0;
    }
    out('');
  }

  let result;
  try {
    result = runUninstall({});
  } catch (e) {
    err(`ERROR: ${e.message}`);
    err('Your settings.json has been restored from its backup.');
    return 1;
  }

  result.removed.forEach((r) => out(`  ok  Removed ${r}`));
  if (result.backup) out(`  ok  Backed up settings to ${result.backup}`);

  out('');
  if (result.survivors > 0) {
    out(`Kept ${result.survivors} file${result.survivors === 1 ? '' : 's'} in ${result.soundsDir}`);
    out('— packs or clips you added, which this never deletes.');
  }
  if (result.backupsKept.length > 0) {
    out(`Kept ${result.backupsKept.length} settings backup${result.backupsKept.length === 1 ? '' : 's'} in ${paths.claudeDir}`);
    out('— delete them yourself once you are sure you do not need them.');
  }
  out('');
  out('Restart Claude Code to stop the hooks running.');
  return 0;
}

async function main(argv) {
  const args = argv.filter((a) => a !== '');

  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return 0;
  }
  if (args.includes('--version') || args.includes('-v')) {
    out(VERSION);
    return 0;
  }

  const positional = args.filter((a) => !a.startsWith('-'));
  if (positional.length > 1) {
    err(`ERROR: expected at most one pack name, got ${positional.length}.`);
    return 1;
  }
  const arg = positional.length === 1 ? positional[0] : null;

  if (args.includes('--uninstall')) {
    return uninstall({
      assumeYes: args.includes('--yes') || args.includes('-y'),
      interactive: Boolean(process.stdin.isTTY),
    });
  }

  const paths = layout();
  const install = readInstallState(paths);
  const packs = availablePacks(paths);

  if (packs.length === 0) {
    err('ERROR: no voice packs found. The package looks damaged — reinstall it.');
    return 1;
  }

  const interactive = Boolean(process.stdin.isTTY);
  let picked = null;

  if (arg === null && interactive) {
    if (install.installed) {
      out(`Back to You ${install.version || '(pre-1.2)'} is already installed.`);
      out(`Active pack: ${install.activeTheme}`);
      out('');
    }
    picked = await pick(packs, defaultPack(packs, install));
    if (picked === null) return 1;
  }

  const resolved = resolvePack({ packs, install, arg, interactive, picked });
  if (!resolved.ok) {
    err(`ERROR: ${resolved.error}`);
    resolved.detail.forEach((line) => err(line));
    return 1;
  }
  resolved.notes.forEach((n) => out(n));

  const pack = resolved.chosen;
  const check = checkPack(pack, [packageSoundsDir(), paths.soundsDir]);
  if (!check.ok) {
    err(`ERROR: ${check.reason}`);
    err('Add at least one .mp3 or .wav to that folder and run this installer again.');
    return 1;
  }

  const effects = planEffects({ install, chosen: pack, version: VERSION });

  if (effects.noop) {
    out(`${pack} is already active. Nothing to do.`);
    return 0;
  }

  if (!effects.fullInstall) {
    // A switch: one line in one file. The hooks re-read it on every fire.
    writeTheme(pack, null);
    out(`Switched to ${pack}.`);
    out('');
    out('Takes effect on the next sound — no restart needed.');
    return 0;
  }

  out(`Installing Back to You for Claude Code (${IS_WINDOWS ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux'})...`);
  out(`  Active pack: ${pack}`);
  out('');

  const result = runFullInstall({ pack, version: VERSION, root: null });
  result.steps.forEach((s) => out(`  ${renderStep(s)}`));

  if (!result.ok) {
    err(`ERROR: ${result.error}`);
    if (result.steps.length === 0) {
      err('Nothing has been changed.');
    }
    if (result.settingsRestored) {
      err('Your settings.json has been restored from its backup.');
    }
    if (result.steps.length > 0) {
      err('Copied files were left in place — running the installer again is safe.');
    }
    return 1;
  }

  out('');
  out('All done. Restart Claude Code to activate sound notifications.');
  out('To switch packs later, run npx backtoyou again.');
  return 0;
}

/** Render one completed install step as the `ok  ...` line the CLI prints. */
function renderStep(step) {
  switch (step.kind) {
    case 'packs-copied':
      return 'ok  Sound packs copied';
    case 'legacy-clips-removed':
      return `ok  Removed ${step.count} retired subagent-done clip${step.count === 1 ? '' : 's'}`;
    case 'hooks-installed':
      return 'ok  Hook scripts installed';
    case 'settings-backed-up':
      return `ok  Backed up settings to ${step.backup}`;
    case 'owned-entries-removed':
      return `ok  Removed ${step.count} existing Back to You hook entr${step.count === 1 ? 'y' : 'ies'}`;
    case 'settings-updated':
      return 'ok  settings.json updated';
    case 'theme-set':
      return `ok  Active pack set to ${step.pack}`;
    default:
      return `ok  ${step.kind}`;
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((e) => {
    err(`ERROR: ${e && e.message ? e.message : e}`);
    process.exit(1);
  });
