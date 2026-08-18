// PROTOTYPE — the throwaway half. Do not ship.
//
// A one-screen driver for plan.mjs. Pick a scenario, cycle the re-run design
// variant and the platform, and watch the transcript and the simulated
// ~/.claude change. Run:  node prototype/backtoyou-cli/tui.mjs

import { planSession, describeInstall } from './plan.mjs';

const B = (s) => `\x1b[1m${s}\x1b[0m`;
const D = (s) => `\x1b[2m${s}\x1b[0m`;
const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;

const PACKS = ['claude', 'gigatron', 'jay-run', 'mistress-of-pain'];
const PACKS_PLUS = [...PACKS, 'mytheme'];

const FRESH = { installed: false, activeTheme: null, version: null };
const HAVE_CLAUDE = { installed: true, activeTheme: 'claude', version: '1.2.0' };
const HAVE_OLD = { installed: true, activeTheme: 'gigatron', version: '1.1.1' };

const SCENARIOS = [
  { key: '1', name: 'Fresh install, press Enter', args: { install: FRESH, typed: '' } },
  { key: '2', name: 'Fresh install, pick gigatron', args: { install: FRESH, typed: '2' } },
  { key: '3', name: 'Re-run, switch claude -> mistress-of-pain', args: { install: HAVE_CLAUDE, typed: '4' } },
  { key: '4', name: 'Re-run, pick the pack already active', args: { install: HAVE_CLAUDE, typed: '1' } },
  { key: '5', name: 'Non-interactive: npx backtoyou gigatron', args: { install: HAVE_CLAUDE, arg: 'gigatron' } },
  { key: '6', name: 'Unknown pack: npx backtoyou nope', args: { install: HAVE_CLAUDE, arg: 'nope' } },
  { key: '7', name: 'Out-of-range number at the picker', args: { install: FRESH, typed: '9' } },
  { key: '8', name: 'Not a TTY (piped / CI)', args: { install: FRESH, interactive: false } },
  { key: '9', name: 'Upgrade from 1.1.1, keep gigatron', args: { install: HAVE_OLD, typed: '2' } },
  { key: '0', name: 'Custom pack on disk (mytheme)', args: { install: HAVE_CLAUDE, typed: '5', packs: PACKS_PLUS } },
];

const VARIANTS = {
  A: 'A — re-run is just the installer again; sound-theme.txt is still the documented switch',
  B: 'B — re-run knows it is installed; a plain switch only rewrites the theme file',
  C: 'C — bare re-run reports status and changes nothing; switching needs an explicit arg',
};
const PLATFORMS = { mac: 'macOS', win: 'Windows', linux: 'Linux' };

let scenarioIdx = 0;
let variant = 'A';
let platform = 'mac';

function render() {
  const s = SCENARIOS[scenarioIdx];
  const packs = s.args.packs ?? PACKS;
  const before = s.args.install;

  const { transcript, exitCode, nextInstall } = planSession({
    packsOnDisk: packs,
    platform,
    variant,
    ...s.args,
  });

  const out = [];
  out.push(B('  npx backtoyou — session prototype') + D('   (issue #26)'));
  out.push('');
  out.push(`  ${B('Scenario')}  ${s.name}`);
  out.push(`  ${B('Variant')}   ${variant === 'A' ? VARIANTS.A : variant === 'B' ? VARIANTS.B : VARIANTS.C}`);
  out.push(`  ${B('Platform')}  ${PLATFORMS[platform]}`);
  out.push('');
  out.push(D('  ──────────────────────────────────────────────────────────────────────'));
  out.push('');

  for (const line of transcript) {
    if (line.type === 'cmd') out.push(`  ${D('$')} ${B(line.text)}`);
    else if (line.type === 'prompt') out.push(`  ${line.text}${Y(line.answer === '' ? '⏎' : line.answer)}`);
    else out.push(`  ${line.text}`);
  }

  out.push('');
  out.push(`  ${exitCode === 0 ? G('exit 0') : R('exit ' + exitCode)}`);
  out.push('');
  out.push(D('  ──────────────────────────────────────────────────────────────────────'));
  out.push('');
  out.push(`  ${B('~/.claude before')}`);
  describeInstall(before, platform).forEach((l) => out.push(D('    ' + l)));
  out.push('');
  out.push(`  ${B('~/.claude after')}`);
  describeInstall(nextInstall, platform).forEach((l) => {
    const changed =
      before.activeTheme !== nextInstall.activeTheme && l.includes('sound-theme.txt');
    out.push(changed ? G('    ' + l) : D('    ' + l));
  });
  out.push('');
  out.push(D('  ──────────────────────────────────────────────────────────────────────'));
  out.push('');
  out.push(
    '  ' +
      SCENARIOS.map((x, i) => (i === scenarioIdx ? B(`[${x.key}]`) : D(`[${x.key}]`))).join(' ') +
      D('  scenario')
  );
  out.push(`  ${B('[v]')}${D(' variant')}   ${B('[p]')}${D(' platform')}   ${B('[q]')}${D(' quit')}`);

  console.clear();
  console.log('\n' + out.join('\n') + '\n');
}

process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', (k) => {
  if (k === 'q' || k === '') {
    console.clear();
    process.exit(0);
  }
  if (k === 'v') variant = variant === 'A' ? 'B' : variant === 'B' ? 'C' : 'A';
  else if (k === 'p') platform = platform === 'mac' ? 'win' : platform === 'win' ? 'linux' : 'mac';
  else {
    const i = SCENARIOS.findIndex((x) => x.key === k);
    if (i >= 0) scenarioIdx = i;
  }
  render();
});

render();
