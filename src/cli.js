'use strict';

// The installer's testable body: argument parsing, the interactive picker,
// the uninstall confirmation, and every line of printed output. Holds no
// rules of its own — it asks `plan.js` what should happen and `install.js` /
// `uninstall.js` to do it.
//
// Everything that touches the outside world — stdout/stderr, readline,
// process.stdin.isTTY — comes in through `io`, and everything that touches
// the real ~/.claude — comes in through `opts`, so this module can be
// require()d and driven in a test without either. `bin/cli.js` is the ~15-line
// adapter that supplies the real ones and calls process.exit.

const { layout, packageSoundsDir, platformName } = require('./paths');
const { resolvePack, defaultPack, readChoice, planEffects, uninstallGate, readConsent } = require('./plan');
const {
  availablePacks,
  readInstallState,
  checkPack,
  runFullInstall,
  writeTheme,
} = require('./install');
const { runUninstall, isInstalled } = require('./uninstall');

const VERSION = require('../package.json').version;

function usage(io) {
  io.out('Back to You — a voice for Claude Code, by elevenlabs.io');
  io.out('');
  io.out('  npx backtoyou             pick a voice pack, or switch the active one');
  io.out('  npx backtoyou <pack>      activate <pack> without prompting');
  io.out('  npx backtoyou --uninstall remove it all again');
  io.out('');
  io.out('  --help      this message');
  io.out('  --version   print the version');
  io.out('  --yes       skip the uninstall confirmation (required when not a terminal)');
}

async function pick(io, packs, fallback) {
  io.out('Choose a voice pack:');
  io.out('');
  packs.forEach((p, i) => io.out(`  ${i + 1}) ${p}${p === fallback ? ' (default)' : ''}`));
  io.out('');

  const answer = await io.ask(`Pick a number [${packs.indexOf(fallback) + 1}]: `);
  const chosen = readChoice(answer, packs, fallback);
  if (chosen === null) {
    io.out('');
    io.err(`ERROR: "${String(answer).trim()}" isn't one of the choices above.`);
    return null;
  }
  io.out('');
  return chosen;
}

/**
 * Remove everything this project installed.
 *
 * The only destructive path in the CLI, so it is the only one that asks. See
 * `uninstallGate` in `plan.js` for the non-TTY rule.
 */
async function uninstall(io, opts, { assumeYes, interactive }) {
  const paths = layout(opts.root);

  if (!isInstalled(opts.root || null)) {
    io.out('Back to You is not installed — nothing to remove.');
    return 0;
  }

  const gate = uninstallGate({ assumeYes, interactive });

  if (gate === 'refuse') {
    io.err('ERROR: --uninstall needs confirmation, and this is not a terminal.');
    io.err('Re-run with --yes if you are sure.');
    return 1;
  }

  if (gate === 'ask') {
    io.out('This removes Back to You from ~/.claude:');
    io.out('  the hook scripts, the clips this package shipped, and its settings.json entries.');
    io.out('');
    io.out('Voice packs you made yourself are kept, and so are your settings backups.');
    io.out('');
    const answer = await io.ask('Remove it? [y/N]: ');
    if (!readConsent(answer)) {
      io.out('Left alone.');
      return 0;
    }
    io.out('');
  }

  let result;
  try {
    result = runUninstall({ root: opts.root, sourceSounds: opts.sourceSounds });
  } catch (e) {
    io.err(`ERROR: ${e.message}`);
    io.err('Your settings.json has been restored from its backup.');
    return 1;
  }

  result.removed.forEach((r) => io.out(`  ok  Removed ${r}`));
  if (result.backup) io.out(`  ok  Backed up settings to ${result.backup}`);

  io.out('');
  if (result.survivors > 0) {
    io.out(`Kept ${result.survivors} file${result.survivors === 1 ? '' : 's'} in ${result.soundsDir}`);
    io.out('— packs or clips you added, which this never deletes.');
  }
  if (result.backupsKept.length > 0) {
    io.out(`Kept ${result.backupsKept.length} settings backup${result.backupsKept.length === 1 ? '' : 's'} in ${paths.claudeDir}`);
    io.out('— delete them yourself once you are sure you do not need them.');
  }
  io.out('');
  io.out('Restart Claude Code to stop the hooks running.');
  return 0;
}

async function main(argv, io, opts = {}) {
  const args = argv.filter((a) => a !== '');

  if (args.includes('--help') || args.includes('-h')) {
    usage(io);
    return 0;
  }
  if (args.includes('--version') || args.includes('-v')) {
    io.out(VERSION);
    return 0;
  }

  const positional = args.filter((a) => !a.startsWith('-'));
  if (positional.length > 1) {
    io.err(`ERROR: expected at most one pack name, got ${positional.length}.`);
    return 1;
  }
  const arg = positional.length === 1 ? positional[0] : null;

  if (args.includes('--uninstall')) {
    return uninstall(io, opts, {
      assumeYes: args.includes('--yes') || args.includes('-y'),
      interactive: io.isTTY,
    });
  }

  const paths = layout(opts.root);
  const install = readInstallState(paths);
  const packs = availablePacks(paths, opts.sourceSounds);

  if (packs.length === 0) {
    io.err('ERROR: no voice packs found. The package looks damaged — reinstall it.');
    return 1;
  }

  const interactive = io.isTTY;
  let picked = null;

  if (arg === null && interactive) {
    if (install.installed) {
      io.out(`Back to You ${install.version || '(pre-1.2)'} is already installed.`);
      io.out(`Active pack: ${install.activeTheme}`);
      io.out('');
    }
    picked = await pick(io, packs, defaultPack(packs, install));
    if (picked === null) return 1;
  }

  const resolved = resolvePack({ packs, install, arg, interactive, picked });
  if (!resolved.ok) {
    io.err(`ERROR: ${resolved.error}`);
    resolved.detail.forEach((line) => io.err(line));
    return 1;
  }
  resolved.notes.forEach((n) => io.out(n));

  const pack = resolved.chosen;
  const check = checkPack(pack, [opts.sourceSounds || packageSoundsDir(), paths.soundsDir]);
  if (!check.ok) {
    io.err(`ERROR: ${check.reason}`);
    io.err('Add at least one .mp3 or .wav to that folder and run this installer again.');
    return 1;
  }

  const effects = planEffects({ install, chosen: pack, version: VERSION });

  if (effects.noop) {
    io.out(`${pack} is already active. Nothing to do.`);
    return 0;
  }

  if (!effects.fullInstall) {
    // A switch: one line in one file. The hooks re-read it on every fire.
    writeTheme(pack, opts.root);
    io.out(`Switched to ${pack}.`);
    io.out('');
    io.out('Takes effect on the next sound — no restart needed.');
    return 0;
  }

  io.out(`Installing Back to You for Claude Code (${platformName()})...`);
  io.out(`  Active pack: ${pack}`);
  io.out('');

  const result = runFullInstall({
    pack,
    version: VERSION,
    root: opts.root,
    sourceSounds: opts.sourceSounds,
    sourceHooks: opts.sourceHooks,
  });
  result.steps.forEach((s) => io.out(`  ${renderStep(s)}`));

  if (!result.ok) {
    io.err(`ERROR: ${result.error}`);
    if (result.steps.length === 0) {
      io.err('Nothing has been changed.');
    }
    if (result.settingsRestored) {
      io.err('Your settings.json has been restored from its backup.');
    }
    if (result.steps.length > 0) {
      io.err('Copied files were left in place — running the installer again is safe.');
    }
    return 1;
  }

  io.out('');
  io.out('All done. Restart Claude Code to activate sound notifications.');
  io.out('To switch packs later, run npx backtoyou again.');
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

module.exports = { main };
