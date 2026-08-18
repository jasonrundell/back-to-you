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

const VERSION = require('../package.json').version;

const out = (s = '') => process.stdout.write(`${s}\n`);
const err = (s = '') => process.stderr.write(`${s}\n`);

function usage() {
  out('Back to You — a voice for Claude Code, by elevenlabs.io');
  out('');
  out('  npx backtoyou           pick a voice pack, or switch the active one');
  out('  npx backtoyou <pack>    activate <pack> without prompting');
  out('');
  out('  --help      this message');
  out('  --version   print the version');
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

  let lines;
  try {
    lines = runFullInstall({
      pack,
      version: VERSION,
      root: null,
      log: (m) => err(m),
    });
  } catch (e) {
    err(`ERROR: ${e.message}`);
    err('Nothing else has been changed.');
    return 1;
  }

  writeTheme(pack, null);
  lines.splice(1, 0, `ok  Active pack set to ${pack}`);
  lines.forEach((l) => out(`  ${l}`));

  out('');
  out('All done. Restart Claude Code to activate sound notifications.');
  out('To switch packs later, run npx backtoyou again.');
  return 0;
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((e) => {
    err(`ERROR: ${e && e.message ? e.message : e}`);
    process.exit(1);
  });
