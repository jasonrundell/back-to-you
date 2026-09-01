'use strict';

// Installer tests. Plain node:assert, no framework - the package has zero
// runtime dependencies and there is no reason for the tests to add any.
//
//   node tests/installer.test.js

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { mergeSettings, isOwnedCommand } = require('../src/settings');
const { classifyRun, resolvePack, defaultPack, readChoice, planEffects, uninstallGate, readConsent } = require('../src/plan');
const { availablePacks, readInstallState, checkPack, runFullInstall, writeTheme } = require('../src/install');
const { layout, hookFacts } = require('../src/paths');
const { main } = require('../src/cli');

let passed = 0;
const pending = [];
const test = (name, fn) => {
  const report = (e) => {
    if (e) {
      console.error(`  FAIL  ${name}`);
      console.error(`        ${e.message}`);
      process.exitCode = 1;
    } else {
      passed++;
      console.log(`  ok  ${name}`);
    }
  };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      pending.push(r.then(() => report(null), (e) => report(e)));
      return;
    }
    report(null);
  } catch (e) {
    report(e);
  }
};

const sandbox = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bty-test-'));

// Unix facts regardless of host platform, so the merge is testable everywhere.
const UNIX_FACTS = {
  soundHook: 'play-sound.js',
  categoryHook: 'play-category.js',
  invoke: (p) => `node "${p}"`,
};

function seedPacks(root, names) {
  for (const n of names) {
    for (const c of ['task-complete', 'decision-needed', 'error']) {
      const dir = path.join(root, n, c);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'clip.mp3'), 'not really audio');
    }
  }
}

function seedHooks(dir, names) {
  fs.mkdirSync(dir, { recursive: true });
  for (const n of names) fs.writeFileSync(path.join(dir, n), '// stub hook\n');
}

/** A fake io for driving main() without a real terminal. isTTY is overridable per test. */
function makeIO(answers = []) {
  const out = [];
  const errLines = [];
  return {
    io: {
      out: (s = '') => out.push(s),
      err: (s = '') => errLines.push(s),
      ask: async () => (answers.length ? answers.shift() : ''),
      isTTY: false,
    },
    out,
    errLines,
  };
}

console.log('\nplan');

test('classifyRun distinguishes all four runs', () => {
  const v = '1.2.0';
  assert.equal(classifyRun({ install: { installed: false }, chosen: 'claude', version: v }), 'fresh');
  assert.equal(classifyRun({ install: { installed: true, activeTheme: 'claude', version: '1.1.1' }, chosen: 'claude', version: v }), 'upgrade');
  assert.equal(classifyRun({ install: { installed: true, activeTheme: 'claude', version: v }, chosen: 'gigatron', version: v }), 'switch');
  assert.equal(classifyRun({ install: { installed: true, activeTheme: 'claude', version: v }, chosen: 'claude', version: v }), 'same');
});

test('a switch writes only the theme file, and needs no restart', () => {
  const e = planEffects({ install: { installed: true, activeTheme: 'claude', version: '1.2.0' }, chosen: 'gigatron', version: '1.2.0' });
  assert.equal(e.writeTheme, true);
  assert.equal(e.fullInstall, false);
  assert.equal(e.needsRestart, false);
});

test('picking the active pack is a no-op', () => {
  const e = planEffects({ install: { installed: true, activeTheme: 'claude', version: '1.2.0' }, chosen: 'claude', version: '1.2.0' });
  assert.equal(e.noop, true);
  assert.equal(e.writeTheme, false);
});

test('the picker defaults to the active pack, not to claude', () => {
  const packs = ['claude', 'gigatron'];
  assert.equal(defaultPack(packs, { installed: true, activeTheme: 'gigatron' }), 'gigatron');
  assert.equal(defaultPack(packs, { installed: false }), 'claude');
});

test('bare Enter takes the default; out-of-range is rejected', () => {
  const packs = ['claude', 'gigatron'];
  assert.equal(readChoice('', packs, 'gigatron'), 'gigatron');
  assert.equal(readChoice('2', packs, 'claude'), 'gigatron');
  assert.equal(readChoice('9', packs, 'claude'), null);
  assert.equal(readChoice('abc', packs, 'claude'), null);
});

test('a non-TTY re-run keeps the active pack rather than forcing claude', () => {
  const r = resolvePack({
    packs: ['claude', 'gigatron'],
    install: { installed: true, activeTheme: 'gigatron' },
    arg: null,
    interactive: false,
    picked: null,
  });
  assert.equal(r.ok, true);
  assert.equal(r.chosen, 'gigatron');
});

test('a non-TTY fresh install takes claude and announces it', () => {
  const r = resolvePack({ packs: ['claude'], install: { installed: false }, arg: null, interactive: false, picked: null });
  assert.equal(r.chosen, 'claude');
  assert.match(r.notes.join(' '), /Not a terminal/);
});

test('an unknown pack names the pack, not a checkout path', () => {
  const r = resolvePack({ packs: ['claude'], install: { installed: false }, arg: 'nope', interactive: true, picked: null });
  assert.equal(r.ok, false);
  assert.match(r.error, /No pack named "nope"/);
  assert.ok(!/\/sounds\//.test(r.error), 'must not name a filesystem path');
});

test('uninstallGate: --yes always proceeds, TTY or not', () => {
  assert.equal(uninstallGate({ assumeYes: true, interactive: true }), 'proceed');
  assert.equal(uninstallGate({ assumeYes: true, interactive: false }), 'proceed');
});

test('uninstallGate: no --yes and no terminal refuses', () => {
  assert.equal(uninstallGate({ assumeYes: false, interactive: false }), 'refuse');
});

test('uninstallGate: no --yes but a terminal asks', () => {
  assert.equal(uninstallGate({ assumeYes: false, interactive: true }), 'ask');
});

test('readConsent accepts y/yes, case-insensitively and trimmed', () => {
  assert.equal(readConsent('y'), true);
  assert.equal(readConsent('Y'), true);
  assert.equal(readConsent('yes'), true);
  assert.equal(readConsent('YES '), true);
  assert.equal(readConsent(' n'), false);
  assert.equal(readConsent(''), false);
  assert.equal(readConsent('nope'), false);
});

console.log('\nsettings merge');

test('an absent settings.json is created with only our hooks', () => {
  const root = sandbox();
  const p = path.join(root, 'settings.json');
  mergeSettings(p, path.join(root, 'hooks'), UNIX_FACTS);
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.deepEqual(Object.keys(cfg), ['hooks']);
  assert.equal(Object.keys(cfg.hooks).length, 4);
});

test('unrelated user config survives the merge untouched', () => {
  const root = sandbox();
  const p = path.join(root, 'settings.json');
  const original = {
    model: 'claude-opus-5',
    env: { FOO: 'bar', NOTHING: null },
    permissions: { allow: ['Bash(npm run test)'] },
    hooks: {},
  };
  fs.writeFileSync(p, JSON.stringify(original, null, 2));
  mergeSettings(p, path.join(root, 'hooks'), UNIX_FACTS);
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.deepEqual(cfg.model, original.model);
  assert.deepEqual(cfg.env, original.env, 'null values must survive - this is why JXA replaced plutil');
  assert.deepEqual(cfg.permissions, original.permissions);
  assert.deepEqual(Object.keys(cfg).slice(0, 3), ['model', 'env', 'permissions'], 'key order preserved');
});

test('hooks belonging to the user are kept', () => {
  const root = sandbox();
  const p = path.join(root, 'settings.json');
  fs.writeFileSync(p, JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'my-own-script.sh', timeout: 5 }] }] },
  }, null, 2));
  mergeSettings(p, path.join(root, 'hooks'), UNIX_FACTS);
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  const commands = cfg.hooks.Stop.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(commands.includes('my-own-script.sh'), 'user hook must survive');
  assert.ok(commands.some((c) => c.includes('play-sound.js')), 'our hook must be added');
});

test('merging twice does not duplicate our entries', () => {
  const root = sandbox();
  const p = path.join(root, 'settings.json');
  const hooksDir = path.join(root, 'hooks');
  mergeSettings(p, hooksDir, UNIX_FACTS);
  const once = fs.readFileSync(p, 'utf8');
  const second = mergeSettings(p, hooksDir, UNIX_FACTS);
  assert.equal(second.removed, 4, 'the second run strips the four it finds');
  assert.equal(fs.readFileSync(p, 'utf8'), once, 'output must be byte-identical on re-run');
});

test('upgrading from a .sh install unwires the old entries', () => {
  const root = sandbox();
  const p = path.join(root, 'settings.json');
  fs.writeFileSync(p, JSON.stringify({
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: '"/home/j/.claude/hooks/play-sound.sh"', timeout: 10 }] }],
      Notification: [{ hooks: [{ type: 'command', command: '"/home/j/.claude/hooks/play-sound-decision.sh"', timeout: 10 }] }],
    },
  }, null, 2));
  const { removed } = mergeSettings(p, path.join(root, 'hooks'), UNIX_FACTS);
  assert.equal(removed, 2);
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  const all = Object.values(cfg.hooks).flatMap((g) => g.flatMap((x) => x.hooks.map((h) => h.command)));
  assert.ok(!all.some((c) => c.includes('.sh')), 'no .sh entry may survive');
  assert.ok(!all.some((c) => c.includes('play-sound-decision')), 'the legacy decision hook must go');
});

test('SubagentStop is never wired, and a 1.2.0 entry is unwired', () => {
  const root = sandbox();
  const p = path.join(root, 'settings.json');
  fs.writeFileSync(p, JSON.stringify({
    hooks: {
      SubagentStop: [{ hooks: [{ type: 'command', command: 'node "/home/j/.claude/hooks/play-category.js" subagent-done', timeout: 10 }] }],
    },
  }, null, 2));
  const { removed } = mergeSettings(p, path.join(root, 'hooks'), UNIX_FACTS);
  assert.equal(removed, 1, 'the old entry must be stripped on upgrade');
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(cfg.hooks.SubagentStop, undefined, 'and not written back');
  const all = Object.values(cfg.hooks).flatMap((g) => g.flatMap((x) => x.hooks.map((h) => h.command)));
  assert.ok(!all.some((c) => c.includes('subagent-done')), 'no subagent-done clip may be wired');
});

test('SessionStart is never wired', () => {
  const root = sandbox();
  const p = path.join(root, 'settings.json');
  mergeSettings(p, path.join(root, 'hooks'), UNIX_FACTS);
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.equal(cfg.hooks.SessionStart, undefined);
});

test('every entry carries the 10s timeout', () => {
  const root = sandbox();
  const p = path.join(root, 'settings.json');
  mergeSettings(p, path.join(root, 'hooks'), UNIX_FACTS);
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  const all = Object.values(cfg.hooks).flatMap((g) => g.flatMap((x) => x.hooks));
  assert.ok(all.length === 4 && all.every((h) => h.timeout === 10));
});

test('emptied events are dropped, not left as []', () => {
  const root = sandbox();
  const p = path.join(root, 'settings.json');
  fs.writeFileSync(p, JSON.stringify({
    hooks: { SessionStart: [{ hooks: [{ type: 'command', command: '"~/.claude/hooks/play-category.sh" session-start' }] }] },
  }, null, 2));
  mergeSettings(p, path.join(root, 'hooks'), UNIX_FACTS);
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.ok(!('SessionStart' in cfg.hooks), 'SessionStart must be removed entirely');
});

test('a UTF-8 BOM is tolerated and preserved', () => {
  // PowerShell 5.1 writes UTF-8 with BOM by default, so anything
  // merge-settings.ps1 ever wrote is likely to have one. JSON.parse rejects
  // it, where the JXA and PowerShell readers did not.
  const root = sandbox();
  const p = path.join(root, 'settings.json');
  fs.writeFileSync(p, '﻿' + JSON.stringify({ model: 'claude-opus-5', hooks: {} }, null, 2));

  const result = mergeSettings(p, path.join(root, 'hooks'), UNIX_FACTS);
  assert.equal(result.hadBom, true);

  const written = fs.readFileSync(p, 'utf8');
  assert.equal(written.charCodeAt(0), 0xfeff, 'the BOM must be preserved, not silently dropped');
  const cfg = JSON.parse(written.slice(1));
  assert.equal(cfg.model, 'claude-opus-5');
  assert.equal(Object.keys(cfg.hooks).length, 4);
});

test('a file without a BOM does not gain one', () => {
  const root = sandbox();
  const p = path.join(root, 'settings.json');
  fs.writeFileSync(p, JSON.stringify({ hooks: {} }, null, 2));
  const result = mergeSettings(p, path.join(root, 'hooks'), UNIX_FACTS);
  assert.equal(result.hadBom, false);
  assert.notEqual(fs.readFileSync(p, 'utf8').charCodeAt(0), 0xfeff);
});

test('malformed settings.json throws rather than clobbering', () => {
  const root = sandbox();
  const p = path.join(root, 'settings.json');
  fs.writeFileSync(p, '{ this is not json');
  assert.throws(() => mergeSettings(p, path.join(root, 'hooks'), UNIX_FACTS));
  assert.equal(fs.readFileSync(p, 'utf8'), '{ this is not json', 'the file must be left alone');
});

test('isOwnedCommand recognises every script ever shipped', () => {
  for (const s of ['play-sound.sh', 'play-category.sh', 'play-sound-decision.sh', 'play-sound.ps1', 'play-sound.js']) {
    assert.ok(isOwnedCommand(`"/x/${s}"`), s);
  }
  assert.ok(!isOwnedCommand('"/x/somebody-elses.sh"'));
});

console.log('\nagainst the real settings.json on this machine');

test('a real populated settings.json survives semantically intact', () => {
  const real = path.join(os.homedir(), '.claude', 'settings.json');
  if (!fs.existsSync(real)) {
    console.log('        (skipped — no ~/.claude/settings.json on this machine)');
    return;
  }
  const root = sandbox();
  const p = path.join(root, 'settings.json');
  fs.copyFileSync(real, p);
  const rawBefore = fs.readFileSync(p, 'utf8');
  const bomBefore = rawBefore.charCodeAt(0) === 0xfeff;
  const before = JSON.parse(bomBefore ? rawBefore.slice(1) : rawBefore);

  mergeSettings(p, path.join(root, 'hooks'), UNIX_FACTS);
  const rawAfter = fs.readFileSync(p, 'utf8');
  assert.equal(rawAfter.charCodeAt(0) === 0xfeff, bomBefore, 'BOM presence must be unchanged');
  const after = JSON.parse(bomBefore ? rawAfter.slice(1) : rawAfter);

  for (const key of Object.keys(before)) {
    if (key === 'hooks') continue;
    assert.deepEqual(after[key], before[key], `top-level key "${key}" must be untouched`);
  }
  assert.deepEqual(
    Object.keys(after).filter((k) => k !== 'hooks'),
    Object.keys(before).filter((k) => k !== 'hooks'),
    'key order of unrelated config must be preserved'
  );

  // Every hook of the user's own must still be there.
  const theirs = (cfg) =>
    Object.entries(cfg.hooks || {}).flatMap(([ev, groups]) =>
      (groups || []).flatMap((g) => (g.hooks || []).map((h) => h.command))
    ).filter((c) => !isOwnedCommand(c));
  assert.deepEqual(theirs(after).sort(), theirs(before).sort(), 'third-party hooks must survive');
  console.log(`        (used the real file: ${Object.keys(before).length} top-level keys, ${theirs(before).length} third-party hooks)`);
});

console.log('\ninstall effects');

test('a full install lands packs, hooks, theme and version', () => {
  const root = sandbox();
  const src = path.join(root, 'src-sounds');
  const hooks = path.join(root, 'src-hooks');
  seedPacks(src, ['claude', 'gigatron']);
  seedHooks(hooks, ['play-sound.js', 'play-category.js', 'play-lib.js', 'play-sound.ps1', 'play-category.ps1']);
  const home = path.join(root, 'home', '.claude');

  const result = runFullInstall({ pack: 'claude', version: '1.2.0', root: home, sourceSounds: src, sourceHooks: hooks });
  assert.equal(result.ok, true);

  const kinds = result.steps.map((s) => s.kind);
  assert.ok(kinds.includes('packs-copied'));
  assert.ok(kinds.includes('hooks-installed'));
  assert.ok(kinds.includes('settings-updated'));
  assert.equal(kinds[kinds.length - 1], 'theme-set', 'the theme write is the last step');

  const paths = layout(home);
  assert.ok(fs.existsSync(path.join(paths.soundsDir, 'claude', 'task-complete', 'clip.mp3')));
  assert.ok(fs.existsSync(path.join(paths.soundsDir, 'gigatron', 'task-complete', 'clip.mp3')), 'every pack ships, not just the active one');
  assert.ok(fs.existsSync(paths.settings));

  // Including the support file, which settings.json never names and so would
  // go missing without anyone noticing until a hook tried to require it.
  const facts = hookFacts();
  for (const hook of [facts.soundHook, facts.categoryHook, ...(facts.support || [])]) {
    assert.ok(fs.existsSync(path.join(paths.hooksDir, hook)), `${hook} must be installed`);
  }

  assert.equal(fs.readFileSync(paths.themeFile, 'utf8').trim(), 'claude');
  assert.equal(fs.readFileSync(paths.versionFile, 'utf8').trim(), '1.2.0');
});

test('installing removes a retired subagent-done clip but keeps a user take', () => {
  const root = sandbox();
  const src = path.join(root, 'src-sounds');
  const hooks = path.join(root, 'src-hooks');
  seedPacks(src, ['claude', 'gigatron']);
  seedHooks(hooks, ['play-sound.js', 'play-category.js', 'play-lib.js', 'play-sound.ps1', 'play-category.ps1']);
  const home = path.join(root, 'home', '.claude');
  const paths = layout(home);

  // A 1.2.0 install: our clip in every pack, plus a take of the user's own
  // sitting in the same folder.
  for (const pack of ['claude', 'gigatron']) {
    const dir = path.join(paths.soundsDir, pack, 'subagent-done');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'vo-subagents-done.mp3'), 'ours');
  }
  fs.writeFileSync(path.join(paths.soundsDir, 'gigatron', 'subagent-done', 'mine.mp3'), 'theirs');
  fs.writeFileSync(paths.markerFile, '1755000000', 'utf8');

  runFullInstall({ pack: 'claude', version: '1.3.0', root: home, sourceSounds: src, sourceHooks: hooks });

  assert.equal(
    fs.existsSync(path.join(paths.soundsDir, 'claude', 'subagent-done')),
    false,
    'the emptied folder goes with the clip'
  );
  assert.ok(
    fs.existsSync(path.join(paths.soundsDir, 'gigatron', 'subagent-done', 'mine.mp3')),
    'a take the user added is theirs and stays'
  );
  assert.equal(
    fs.existsSync(path.join(paths.soundsDir, 'gigatron', 'subagent-done', 'vo-subagents-done.mp3')),
    false,
    'ours goes even when the folder survives'
  );
  assert.equal(fs.existsSync(paths.markerFile), false, 'the stale marker is cleaned up too');
});

test('installing one pack never deletes a custom one', () => {
  const root = sandbox();
  const src = path.join(root, 'src-sounds');
  const hooks = path.join(root, 'src-hooks');
  seedPacks(src, ['claude']);
  seedHooks(hooks, ['play-sound.js', 'play-category.js', 'play-lib.js', 'play-sound.ps1', 'play-category.ps1']);
  const home = path.join(root, 'home', '.claude');

  // A custom pack the user made, already on disk.
  seedPacks(path.join(home, 'sounds'), ['mytheme']);

  runFullInstall({ pack: 'claude', version: '1.2.0', root: home, sourceSounds: src, sourceHooks: hooks });
  assert.ok(fs.existsSync(path.join(home, 'sounds', 'mytheme', 'task-complete', 'clip.mp3')), 'custom pack must survive');
});

test('the picker sees custom packs already in ~/.claude/sounds', () => {
  const root = sandbox();
  const src = path.join(root, 'src-sounds');
  seedPacks(src, ['claude', 'gigatron']);
  const home = path.join(root, 'home', '.claude');
  seedPacks(path.join(home, 'sounds'), ['mytheme']);

  const packs = availablePacks(layout(home), src);
  assert.deepEqual(packs, ['claude', 'gigatron', 'mytheme']);
  assert.equal(packs[0], 'claude', 'claude sorts first');
});

test('readInstallState reports a pre-versioning install', () => {
  const root = sandbox();
  const home = path.join(root, '.claude');
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, 'sound-theme.txt'), 'gigatron\n');
  const s = readInstallState(layout(home));
  assert.equal(s.installed, true);
  assert.equal(s.activeTheme, 'gigatron');
  assert.equal(s.version, null, 'a pre-1.2 install has no version file, and must upgrade');
});

test('a pack with an empty required category is rejected', () => {
  const root = sandbox();
  const src = path.join(root, 'sounds');
  seedPacks(src, ['good']);
  fs.mkdirSync(path.join(src, 'bad', 'task-complete'), { recursive: true });
  fs.mkdirSync(path.join(src, 'bad', 'decision-needed'), { recursive: true });
  assert.equal(checkPack('good', [src]).ok, true);
  const bad = checkPack('bad', [src]);
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /task-complete/);
});

test('a missing hook script aborts before anything is written', () => {
  const root = sandbox();
  const src = path.join(root, 'src-sounds');
  const hooks = path.join(root, 'src-hooks');
  seedPacks(src, ['claude']);
  const facts = hookFacts();
  const required = [facts.soundHook, facts.categoryHook, ...(facts.support || [])];
  seedHooks(hooks, required.slice(1)); // the first required file is missing
  const home = path.join(root, 'home', '.claude');

  const result = runFullInstall({ pack: 'claude', version: '1.2.0', root: home, sourceSounds: src, sourceHooks: hooks });
  assert.equal(result.ok, false);
  assert.equal(result.steps.length, 0);
  assert.equal(result.settingsRestored, false);
  assert.ok(result.error.includes(required[0]), 'error names the missing file');
  assert.ok(!fs.existsSync(path.join(home, 'hooks')), 'nothing may be written before the check passes');
  assert.ok(!fs.existsSync(path.join(home, 'sounds')), 'nothing may be written before the check passes');
});

test('a mergeSettings failure restores settings.json from backup', () => {
  const root = sandbox();
  const src = path.join(root, 'src-sounds');
  const hooks = path.join(root, 'src-hooks');
  seedPacks(src, ['claude']);
  seedHooks(hooks, ['play-sound.js', 'play-category.js', 'play-lib.js', 'play-sound.ps1', 'play-category.ps1']);
  const home = path.join(root, 'home', '.claude');
  fs.mkdirSync(home, { recursive: true });

  // mergeSettings refuses to clobber a settings.json it cannot parse.
  const malformed = '{ this is not valid json';
  fs.writeFileSync(path.join(home, 'settings.json'), malformed, 'utf8');

  const result = runFullInstall({ pack: 'claude', version: '1.2.0', root: home, sourceSounds: src, sourceHooks: hooks });

  assert.equal(result.ok, false);
  assert.equal(result.settingsRestored, true);

  const kinds = result.steps.map((s) => s.kind);
  assert.ok(kinds.includes('packs-copied'));
  assert.ok(kinds.includes('hooks-installed'));
  assert.ok(kinds.includes('settings-backed-up'));
  assert.ok(!kinds.includes('settings-updated'));
  assert.ok(!kinds.includes('theme-set'));

  assert.equal(
    fs.readFileSync(path.join(home, 'settings.json'), 'utf8'),
    malformed,
    'settings.json is restored to exactly what it was'
  );
});

console.log('\nuninstall');

const { runUninstall, isInstalled, shippedClips } = require('../src/uninstall');
const { unwireSettings } = require('../src/settings');

function freshInstall(names = ['claude', 'gigatron']) {
  const root = sandbox();
  const src = path.join(root, 'src-sounds');
  const hooks = path.join(root, 'src-hooks');
  seedPacks(src, names);
  seedHooks(hooks, ['play-sound.js', 'play-category.js', 'play-lib.js', 'play-sound.ps1', 'play-category.ps1']);
  const home = path.join(root, 'home', '.claude');
  runFullInstall({ pack: 'claude', version: '1.2.0', root: home, sourceSounds: src, sourceHooks: hooks });
  writeTheme('claude', home);
  return { root, src, home, paths: layout(home) };
}

test('a full uninstall leaves no Back to You files', () => {
  const { src, home, paths } = freshInstall();
  runUninstall({ root: home, sourceSounds: src });

  for (const f of [paths.themeFile, paths.versionFile]) {
    assert.equal(fs.existsSync(f), false, `${path.basename(f)} must be gone`);
  }
  const facts = hookFacts();
  for (const h of [facts.soundHook, facts.categoryHook, ...(facts.support || [])]) {
    assert.equal(fs.existsSync(path.join(paths.hooksDir, h)), false, `${h} must be gone`);
  }
  const cfg = JSON.parse(fs.readFileSync(paths.settings, 'utf8'));
  assert.deepEqual(cfg.hooks, {}, 'no hook entries may survive');
});

test('a pack the user made survives', () => {
  const { src, home, paths } = freshInstall();
  seedPacks(paths.soundsDir, ['mytheme']);
  runUninstall({ root: home, sourceSounds: src });
  assert.ok(
    fs.existsSync(path.join(paths.soundsDir, 'mytheme', 'task-complete', 'clip.mp3')),
    'a custom pack must never be deleted'
  );
});

test('a clip added inside a SHIPPED pack survives', () => {
  // The case that makes directory-name matching wrong. The README invites
  // dropping extra takes into a shipped pack's folder, so user content lives
  // inside our directories.
  const { src, home, paths } = freshInstall();
  const shippedDir = path.join(paths.soundsDir, 'claude', 'task-complete');
  fs.writeFileSync(path.join(shippedDir, 'my-take.mp3'), 'mine');

  runUninstall({ root: home, sourceSounds: src });

  assert.ok(fs.existsSync(path.join(shippedDir, 'my-take.mp3')), 'the user take must survive');
  assert.equal(
    fs.existsSync(path.join(shippedDir, 'clip.mp3')),
    false,
    'the shipped clip must go'
  );
});

test('emptied pack folders are pruned, but populated ones stay', () => {
  const { src, home, paths } = freshInstall();
  fs.writeFileSync(path.join(paths.soundsDir, 'claude', 'error', 'mine.mp3'), 'x');
  const r = runUninstall({ root: home, sourceSounds: src });
  assert.equal(fs.existsSync(path.join(paths.soundsDir, 'gigatron')), false, 'fully-emptied pack pruned');
  assert.ok(fs.existsSync(path.join(paths.soundsDir, 'claude', 'error')), 'folder with a survivor stays');
  assert.equal(r.survivors, 1);
});

test('settings backups are kept, and reported', () => {
  const { src, home, paths } = freshInstall();
  const r = runUninstall({ root: home, sourceSounds: src });
  assert.ok(r.backupsKept.length >= 1, 'backups are the recovery path and must survive');
  for (const b of r.backupsKept) {
    assert.ok(fs.existsSync(path.join(paths.claudeDir, b)));
  }
});

test('unrelated config and third-party hooks survive', () => {
  const { src, home, paths } = freshInstall();
  const cfg = JSON.parse(fs.readFileSync(paths.settings, 'utf8'));
  cfg.model = 'claude-opus-5';
  cfg.env = { KEEP_ME: 'yes' };
  cfg.hooks.Stop.push({ hooks: [{ type: 'command', command: 'my-own.sh', timeout: 5 }] });
  fs.writeFileSync(paths.settings, JSON.stringify(cfg, null, 2));

  runUninstall({ root: home, sourceSounds: src });

  const after = JSON.parse(fs.readFileSync(paths.settings, 'utf8'));
  assert.equal(after.model, 'claude-opus-5');
  assert.deepEqual(after.env, { KEEP_ME: 'yes' });
  const all = Object.values(after.hooks).flatMap((g) => g.flatMap((x) => x.hooks.map((h) => h.command)));
  assert.deepEqual(all, ['my-own.sh'], 'only the third-party hook remains');
});

test('a legacy .sh install is unwired and its files removed', () => {
  const { src, home, paths } = freshInstall();
  // Simulate a pre-1.2 machine: old scripts on disk, old entries wired.
  for (const n of ['play-sound.sh', 'play-category.sh', 'play-sound-decision.sh']) {
    fs.writeFileSync(path.join(paths.hooksDir, n), '# old\n');
  }
  fs.writeFileSync(paths.settings, JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: 'command', command: '"~/.claude/hooks/play-sound.sh"', timeout: 10 }] }] },
  }, null, 2));

  runUninstall({ root: home, sourceSounds: src });

  for (const n of ['play-sound.sh', 'play-category.sh', 'play-sound-decision.sh']) {
    assert.equal(fs.existsSync(path.join(paths.hooksDir, n)), false, `${n} must be removed`);
  }
  const after = JSON.parse(fs.readFileSync(paths.settings, 'utf8'));
  assert.deepEqual(after.hooks, {});
});

test('uninstalling twice is a no-op, not an error', () => {
  const { src, home } = freshInstall();
  runUninstall({ root: home, sourceSounds: src });
  assert.equal(isInstalled(home), false);
  const second = runUninstall({ root: home, sourceSounds: src });
  assert.deepEqual(second.removed, [], 'nothing left to remove');
});

test('isInstalled is honest before and after', () => {
  const { src, home } = freshInstall();
  assert.equal(isInstalled(home), true);
  runUninstall({ root: home, sourceSounds: src });
  assert.equal(isInstalled(home), false);
});

test('install -> uninstall -> install lands where a first install does', () => {
  const { src, home, paths } = freshInstall();
  const hooks = path.join(path.dirname(path.dirname(paths.claudeDir)), 'src-hooks');
  const first = fs.readFileSync(paths.settings, 'utf8');

  runUninstall({ root: home, sourceSounds: src });
  runFullInstall({ pack: 'claude', version: '1.2.0', root: home, sourceSounds: src, sourceHooks: hooks });
  writeTheme('claude', home);

  const again = JSON.parse(fs.readFileSync(paths.settings, 'utf8'));
  assert.deepEqual(again.hooks, JSON.parse(first).hooks, 'reinstall must match a first install');
  assert.equal(fs.readFileSync(paths.versionFile, 'utf8').trim(), '1.2.0');
});

test('unwireSettings preserves a UTF-8 BOM', () => {
  const root = sandbox();
  const p = path.join(root, 'settings.json');
  fs.writeFileSync(p, '﻿' + JSON.stringify({
    model: 'x',
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node "/h/play-sound.js"' }] }] },
  }, null, 2));
  const r = unwireSettings(p);
  assert.equal(r.removed, 1);
  assert.equal(r.hadBom, true);
  const written = fs.readFileSync(p, 'utf8');
  assert.equal(written.charCodeAt(0), 0xfeff, 'BOM must survive the unwire');
  assert.equal(JSON.parse(written.slice(1)).model, 'x');
});

test('shippedClips enumerates by relative path', () => {
  const root = sandbox();
  seedPacks(root, ['claude']);
  const rels = shippedClips(root).map((r) => r.split(path.sep).join('/'));
  assert.ok(rels.includes('claude/task-complete/clip.mp3'));
  assert.equal(rels.length, 3, 'one per wired category');
});

console.log('\nhook classification (must match play-sound.ps1 exactly)');

// play-lib resolves ~/.claude at require time, so the sandbox has to be in
// place before these are loaded. Everything above this line has already run.
const HOOK_HOME = sandbox();
process.env.HOME = HOOK_HOME;
process.env.USERPROFILE = HOOK_HOME;
os.homedir = () => HOOK_HOME;

const { classify } = require('../hooks/play-sound');
const { PLAYERS } = require('../hooks/play-lib');

test('a trailing question mark means decision-needed', () => {
  assert.equal(classify('Want me to push it?'), 'decision-needed');
});

test('a question mark followed by punctuation still counts', () => {
  // The PowerShell regex is '\?[^a-zA-Z0-9]*$' - `right?"` and `ok?)` count.
  assert.equal(classify('You said "is it right?"'), 'decision-needed');
  assert.equal(classify('(shall I?)'), 'decision-needed');
  assert.equal(classify('Done?  '), 'decision-needed', 'trailing whitespace is trimmed first');
});

test('a statement means task-complete', () => {
  assert.equal(classify('That is finished.'), 'task-complete');
  assert.equal(classify(''), 'task-complete');
  assert.equal(classify(undefined), 'task-complete');
});

test('a question mid-message does not count', () => {
  // This is the case the sh hook took the last non-empty line to protect
  // against, because grep anchors at the end of every line.
  assert.equal(classify('Is it right? Yes. I pushed it.'), 'task-complete');
  assert.equal(classify('Should I?\nI went ahead and did it.'), 'task-complete');
});

test('a question on the last line of a multi-line message counts', () => {
  assert.equal(classify('Pushed the branch.\n\nAnything else?'), 'decision-needed');
});

console.log('\nplayer probe order (settled by #25)');

test('aplay is gated to wav — it renders an mp3 as noise and exits 0', () => {
  const aplay = PLAYERS.find((p) => p.cmd === 'aplay');
  assert.deepEqual(aplay.formats, ['.wav']);
});

test('mpg123 is gated to mp3 — it cannot play wav', () => {
  const mpg = PLAYERS.find((p) => p.cmd === 'mpg123');
  assert.deepEqual(mpg.formats, ['.mp3']);
});

test('ffplay is excluded — it exits 0 with no audio device', () => {
  assert.equal(PLAYERS.find((p) => p.cmd === 'ffplay'), undefined);
});

test('pw-play is probed before paplay, and paplay is kept for WSL', () => {
  const linux = PLAYERS.filter((p) => p.platform === 'linux').map((p) => p.cmd);
  assert.deepEqual(linux, ['pw-play', 'paplay', 'mpg123', 'play', 'aplay']);
});

test('macOS uses afplay and nothing else', () => {
  const mac = PLAYERS.filter((p) => p.platform === 'darwin').map((p) => p.cmd);
  assert.deepEqual(mac, ['afplay']);
});

console.log('\ncli main (through a fake io, against sandbox roots)');

test('main --help prints usage and exits 0', async () => {
  const { io, out } = makeIO();
  const code = await main(['--help'], io, {});
  assert.equal(code, 0);
  assert.ok(out.some((l) => l.includes('Back to You')), 'usage must be printed');
  assert.ok(out.some((l) => l.includes('--uninstall')), 'usage must list --uninstall');
});

test('main --version prints just the package version and exits 0', async () => {
  const { io, out } = makeIO();
  const code = await main(['--version'], io, {});
  assert.equal(code, 0);
  assert.deepEqual(out, [require('../package.json').version]);
});

test('main rejects more than one pack name', async () => {
  const { io, errLines } = makeIO();
  const code = await main(['a', 'b'], io, {});
  assert.equal(code, 1);
  assert.ok(errLines.some((l) => l.includes('at most one pack name')));
});

test('uninstall refuses without a terminal, and leaves the sandbox untouched', async () => {
  const root = sandbox();
  const home = path.join(root, 'home', '.claude');
  const paths = layout(home);
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(paths.themeFile, 'claude\n');
  const before = fs.readdirSync(home).sort();

  const { io, errLines } = makeIO();
  const code = await main(['--uninstall'], io, { root: home });

  assert.equal(code, 1);
  assert.ok(errLines.some((l) => l.includes('not a terminal')));
  assert.deepEqual(fs.readdirSync(home).sort(), before, 'nothing may be touched when it refuses');
});

test('uninstall declines and leaves everything in place', async () => {
  const root = sandbox();
  const home = path.join(root, 'home', '.claude');
  const paths = layout(home);
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(paths.themeFile, 'claude\n');

  const { io, out } = makeIO(['n']);
  io.isTTY = true;
  const code = await main(['--uninstall'], io, { root: home });

  assert.equal(code, 0);
  assert.ok(out.includes('Left alone.'));
  assert.ok(fs.existsSync(paths.themeFile), 'declining must not remove anything');
});

test('uninstall with consent actually runs', async () => {
  const root = sandbox();
  const home = path.join(root, 'home', '.claude');
  const paths = layout(home);
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(paths.themeFile, 'claude\n');

  const { io } = makeIO(['y']);
  io.isTTY = true;
  const code = await main(['--uninstall'], io, { root: home });

  assert.equal(code, 0);
  assert.equal(fs.existsSync(paths.themeFile), false, 'consenting must remove the theme file');
});

test('uninstall on a root where nothing is installed says so', async () => {
  const root = sandbox();
  const home = path.join(root, 'home', '.claude');
  const { io, out } = makeIO();
  const code = await main(['--uninstall'], io, { root: home });
  assert.equal(code, 0);
  assert.ok(out.some((l) => l.includes('not installed')));
});

test('main fails when no voice packs are found', async () => {
  const root = sandbox();
  const src = path.join(root, 'empty-sounds');
  fs.mkdirSync(src, { recursive: true });
  const home = path.join(root, 'home', '.claude');

  const { io, errLines } = makeIO();
  const code = await main([], io, { root: home, sourceSounds: src });

  assert.equal(code, 1);
  assert.ok(errLines.some((l) => l.includes('no voice packs found')));
});

test('a non-interactive fresh install installs the default pack, claude', async () => {
  const root = sandbox();
  const src = path.join(root, 'src-sounds');
  const hooks = path.join(root, 'src-hooks');
  seedPacks(src, ['claude', 'gigatron']);
  seedHooks(hooks, ['play-sound.js', 'play-category.js', 'play-lib.js', 'play-sound.ps1', 'play-category.ps1']);
  const home = path.join(root, 'home', '.claude');

  const { io, out } = makeIO();
  const code = await main([], io, { root: home, sourceSounds: src, sourceHooks: hooks });

  assert.equal(code, 0);
  assert.ok(out.some((l) => l.includes('Not a terminal')), 'the non-TTY note must be printed');
  const okLines = out.filter((l) => l.trim().startsWith('ok'));
  assert.ok(okLines.length > 0, 'the install steps must be rendered');
  assert.ok(
    okLines[okLines.length - 1].includes('Active pack set to claude'),
    'the theme write is the last ok line'
  );

  const paths = layout(home);
  assert.equal(fs.readFileSync(paths.themeFile, 'utf8').trim(), 'claude');
});

test('main is a no-op when the chosen pack is already active at this version', async () => {
  const root = sandbox();
  const src = path.join(root, 'src-sounds');
  seedPacks(src, ['claude']);
  const home = path.join(root, 'home', '.claude');
  const paths = layout(home);
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(paths.themeFile, 'claude\n');
  fs.writeFileSync(paths.versionFile, `${require('../package.json').version}\n`);

  const { io, out } = makeIO();
  const code = await main(['claude'], io, { root: home, sourceSounds: src });

  assert.equal(code, 0);
  assert.ok(out.some((l) => l.includes('Nothing to do')));
});

test('main switches packs without a full install', async () => {
  const root = sandbox();
  const src = path.join(root, 'src-sounds');
  const hooks = path.join(root, 'src-hooks');
  seedPacks(src, ['claude', 'gigatron']);
  seedHooks(hooks, ['play-sound.js', 'play-category.js', 'play-lib.js', 'play-sound.ps1', 'play-category.ps1']);
  const home = path.join(root, 'home', '.claude');
  const version = require('../package.json').version;
  runFullInstall({ pack: 'claude', version, root: home, sourceSounds: src, sourceHooks: hooks });
  const paths = layout(home);

  const { io, out } = makeIO();
  const code = await main(['gigatron'], io, { root: home, sourceSounds: src, sourceHooks: hooks });

  assert.equal(code, 0);
  assert.ok(out.some((l) => l.includes('Switched to')));
  assert.equal(fs.readFileSync(paths.themeFile, 'utf8').trim(), 'gigatron');
  assert.ok(!out.some((l) => l.includes('Hook scripts installed')), 'a switch must not do a full install');
});

test('a full install failure is reported honestly, and touches nothing extra', async () => {
  const root = sandbox();
  const src = path.join(root, 'src-sounds');
  const hooks = path.join(root, 'src-hooks');
  seedPacks(src, ['claude']);
  const facts = hookFacts();
  const required = [facts.soundHook, facts.categoryHook, ...(facts.support || [])];
  seedHooks(hooks, required.slice(1)); // the first required hook file is missing
  const home = path.join(root, 'home', '.claude');

  const { io, errLines } = makeIO();
  const code = await main([], io, { root: home, sourceSounds: src, sourceHooks: hooks });

  assert.equal(code, 1);
  assert.ok(errLines.some((l) => l.includes('Nothing has been changed.')));
  assert.ok(!fs.existsSync(path.join(home, 'hooks')), 'nothing may be written when the pre-flight fails');
});

test('the interactive picker installs the chosen pack', async () => {
  const root = sandbox();
  const src = path.join(root, 'src-sounds');
  const hooks = path.join(root, 'src-hooks');
  seedPacks(src, ['claude', 'gigatron']);
  seedHooks(hooks, ['play-sound.js', 'play-category.js', 'play-lib.js', 'play-sound.ps1', 'play-category.ps1']);
  const home = path.join(root, 'home', '.claude');

  const { io } = makeIO(['2']);
  io.isTTY = true;
  const code = await main([], io, { root: home, sourceSounds: src, sourceHooks: hooks });

  assert.equal(code, 0);
  const paths = layout(home);
  assert.equal(fs.readFileSync(paths.themeFile, 'utf8').trim(), 'gigatron', 'the 2nd listed pack must be chosen');
});

test('an out-of-range picker choice is rejected', async () => {
  const root = sandbox();
  const src = path.join(root, 'src-sounds');
  seedPacks(src, ['claude', 'gigatron']);
  const home = path.join(root, 'home', '.claude');

  const { io, errLines } = makeIO(['99']);
  io.isTTY = true;
  const code = await main([], io, { root: home, sourceSounds: src });

  assert.equal(code, 1);
  assert.ok(errLines.some((l) => l.includes("isn't one of the choices")));
});

Promise.all(pending).then(() => {
  console.log(`\n${passed} passed${process.exitCode ? ', with failures above' : ''}\n`);
});
