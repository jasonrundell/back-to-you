// PROTOTYPE — the portable half.
//
// Pure install planner for `npx backtoyou`. No I/O, no console, no terminal
// codes: it takes a description of the world and returns the transcript that
// world would produce. That is what makes it liftable into the real CLI later —
// the TUI shell next door is throwaway, this is not.
//
// Question it exists to answer: issue #26 — what does a `npx backtoyou` session
// actually look like, on a first run and on the re-run that switches voice?

export const CATEGORIES = ['task-complete', 'decision-needed', 'error', 'subagent-done'];

/** Platform-specific surface. Mirrors install.sh / install.bat exactly where they agree. */
export function platformFacts(platform) {
  switch (platform) {
    case 'win':
      return {
        label: 'Windows',
        home: 'C:\\Users\\jason',
        claudeDir: 'C:\\Users\\jason\\.claude',
        sep: '\\',
        hookExt: '.ps1',
        restartTarget: 'Claude Code / Cowork',
        player: 'PowerShell',
      };
    case 'linux':
      return {
        label: 'Linux',
        home: '/home/jason',
        claudeDir: '/home/jason/.claude',
        sep: '/',
        hookExt: '.sh',
        restartTarget: 'Claude Code',
        player: 'pw-play',
      };
    default:
      return {
        label: 'macOS',
        home: '/Users/jason',
        claudeDir: '/Users/jason/.claude',
        sep: '/',
        hookExt: '.sh',
        restartTarget: 'Claude Code',
        player: 'afplay',
      };
  }
}

/**
 * What kind of run is this? The distinction the ticket turns on.
 *   fresh          — nothing installed yet
 *   switch         — installed, and the chosen pack differs from the active one
 *   same           — installed, and the chosen pack is the one already active
 *   upgrade        — installed, but at an older package version
 */
export function classifyRun({ install, chosen, version }) {
  if (!install.installed) return 'fresh';
  if (install.version !== version) return 'upgrade';
  if (install.activeTheme === chosen) return 'same';
  return 'switch';
}

/** The numbered picker, shared by every variant. `defaultPack` is what bare Enter takes. */
function pickerLines(packs, defaultPack) {
  const out = ['Choose a voice pack:', ''];
  packs.forEach((p, i) => {
    out.push(`  ${i + 1}) ${p}${p === defaultPack ? ' (default)' : ''}`);
  });
  out.push('');
  return out;
}

function defaultIndex(packs, defaultPack) {
  const i = packs.indexOf(defaultPack);
  return i < 0 ? 1 : i + 1;
}

/**
 * Plan a whole session.
 *
 * @param packsOnDisk  pack names shipped in the tarball, plus any the user added
 * @param install      { installed, activeTheme, version }
 * @param arg          positional pack argument, or null for interactive
 * @param platform     'mac' | 'win' | 'linux'
 * @param interactive  is stdin a TTY
 * @param variant      're-run design': 'A' | 'B' | 'C'
 * @param typed        what the user types at the picker ('' = bare Enter)
 * @param version      version of the package being run
 * @returns { transcript, exitCode, nextInstall }
 */
export function planSession({
  packsOnDisk,
  install,
  arg = null,
  platform = 'mac',
  interactive = true,
  variant = 'A',
  typed = '',
  version = '1.2.0',
}) {
  const f = platformFacts(platform);
  const t = [];
  const say = (text = '') => t.push({ type: 'out', text });
  const cmd = (text) => t.push({ type: 'cmd', text });
  const ask = (q, a) => t.push({ type: 'prompt', text: q, answer: a });

  cmd(`npx backtoyou${arg ? ' ' + arg : ''}`);

  // --- resolve which pack -------------------------------------------------

  let chosen;

  if (arg !== null) {
    // Non-interactive form. install.sh takes a positional theme and skips the
    // prompt entirely, which is what makes scripted installs work.
    if (!packsOnDisk.includes(arg)) {
      // NOTE: install.sh points this error at its own checkout. Under npx there
      // is no checkout, so the only two places a pack can live are the package
      // itself and ~/.claude/sounds. Naming the package path here is a guess —
      // see the "where does a custom pack live" question in README.md.
      say(`ERROR: No pack named "${arg}".`);
      say('Available packs:');
      packsOnDisk.forEach((p) => say(`  ${p}`));
      return { transcript: t, exitCode: 1, nextInstall: install };
    }
    chosen = arg;
  } else if (!interactive) {
    // Piped, CI, curl | sh. install.sh silently falls back to `claude`.
    chosen = 'claude';
    say('Not a terminal — installing the default pack (claude).');
  } else {
    const activeOrDefault = install.installed ? install.activeTheme : 'claude';

    // Variant C short-circuits before the picker: a bare re-run reports status
    // and changes nothing, so switching must be asked for explicitly.
    if (variant === 'C' && install.installed) {
      say(`Back to You ${install.version} is installed.`);
      say(`  Active pack: ${install.activeTheme}`);
      say('');
      say('To switch:  npx backtoyou <pack>');
      say(`Packs:      ${packsOnDisk.join(', ')}`);
      return { transcript: t, exitCode: 0, nextInstall: install };
    }

    if (variant === 'B' && install.installed) {
      say(`Back to You ${install.version} is already installed.`);
      say(`Active pack: ${install.activeTheme}`);
      say('');
    }

    pickerLines(packsOnDisk, activeOrDefault).forEach(say);
    const di = defaultIndex(packsOnDisk, activeOrDefault);
    ask(`Pick a number [${di}]: `, typed);

    const raw = typed === '' ? String(di) : typed;
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > packsOnDisk.length) {
      say('');
      say(`ERROR: "${raw}" isn't one of the choices above.`);
      return { transcript: t, exitCode: 1, nextInstall: install };
    }
    chosen = packsOnDisk[Number(raw) - 1];
    say('');
  }

  const kind = classifyRun({ install, chosen, version });

  // --- variant B: nothing to do -------------------------------------------

  if (variant === 'B' && kind === 'same') {
    say(`${chosen} is already active. Nothing to do.`);
    return { transcript: t, exitCode: 0, nextInstall: install };
  }

  // --- variant B on a plain switch: touch only the theme file --------------

  if (variant === 'B' && kind === 'switch') {
    say(`Switched to ${chosen}.`);
    say('');
    say('Takes effect on the next sound — no restart needed.');
    return {
      transcript: t,
      exitCode: 0,
      nextInstall: { ...install, activeTheme: chosen },
    };
  }

  // --- the full install ----------------------------------------------------

  say(`Installing Back to You for ${f.restartTarget} (${f.label})...`);
  say(`  Active pack: ${chosen}`);
  say('');
  say('  ok  Sound packs copied');
  say(`  ok  Active pack set to ${chosen}`);
  say('  ok  Hook scripts installed');
  if (install.installed) {
    say(`  ok  Backed up settings to ${f.claudeDir}${f.sep}settings.json.bak.20260818T0230`);
  }
  say('  ok  settings.json updated');
  say('');
  say(`All done. Restart ${f.restartTarget} to activate sound notifications.`);
  if (variant === 'A') {
    say(`To switch packs later, edit ${f.claudeDir}${f.sep}sound-theme.txt`);
  } else {
    say('To switch packs later, run npx backtoyou again.');
  }

  return {
    transcript: t,
    exitCode: 0,
    nextInstall: { installed: true, activeTheme: chosen, version },
  };
}

/** Render the simulated ~/.claude, so the effect of a run is visible, not inferred. */
export function describeInstall(install, platform) {
  const f = platformFacts(platform);
  if (!install.installed) return [`${f.claudeDir}${f.sep}  — no Back to You files`];
  return [
    `${f.claudeDir}${f.sep}`,
    `  hooks${f.sep}play-sound${f.hookExt}`,
    `  hooks${f.sep}play-category${f.hookExt}`,
    `  sounds${f.sep}  (all packs)`,
    `  sound-theme.txt  ->  ${install.activeTheme}`,
    `  settings.json    ->  5 hook entries wired`,
    `  [version ${install.version}]`,
  ];
}
