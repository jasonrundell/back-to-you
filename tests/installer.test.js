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
const { classifyRun, resolvePack, defaultPack, readChoice, planEffects } = require('../src/plan');
const { availablePacks, readInstallState, checkPack, runFullInstall, writeTheme } = require('../src/install');
const { layout } = require('../src/paths');

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${e.message}`);
    process.exitCode = 1;
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
    for (const c of ['task-complete', 'decision-needed', 'error', 'subagent-done']) {
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

console.log('\nsettings merge');

test('an absent settings.json is created with only our hooks', () => {
  const root = sandbox();
  const p = path.join(root, 'settings.json');
  mergeSettings(p, path.join(root, 'hooks'), UNIX_FACTS);
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  assert.deepEqual(Object.keys(cfg), ['hooks']);
  assert.equal(Object.keys(cfg.hooks).length, 5);
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
  assert.equal(second.removed, 5, 'the second run strips the five it finds');
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
  assert.ok(all.length === 5 && all.every((h) => h.timeout === 10));
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
  assert.equal(Object.keys(cfg.hooks).length, 5);
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
  seedHooks(hooks, ['play-sound.js', 'play-category.js', 'play-sound.ps1', 'play-category.ps1']);
  const home = path.join(root, 'home', '.claude');

  runFullInstall({ pack: 'claude', version: '1.2.0', root: home, sourceSounds: src, sourceHooks: hooks });
  writeTheme('claude', home);

  const paths = layout(home);
  assert.ok(fs.existsSync(path.join(paths.soundsDir, 'claude', 'task-complete', 'clip.mp3')));
  assert.ok(fs.existsSync(path.join(paths.soundsDir, 'gigatron', 'task-complete', 'clip.mp3')), 'every pack ships, not just the active one');
  assert.ok(fs.existsSync(paths.settings));
  assert.equal(fs.readFileSync(paths.themeFile, 'utf8').trim(), 'claude');
  assert.equal(fs.readFileSync(paths.versionFile, 'utf8').trim(), '1.2.0');
});

test('installing one pack never deletes a custom one', () => {
  const root = sandbox();
  const src = path.join(root, 'src-sounds');
  const hooks = path.join(root, 'src-hooks');
  seedPacks(src, ['claude']);
  seedHooks(hooks, ['play-sound.js', 'play-category.js', 'play-sound.ps1', 'play-category.ps1']);
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
  seedHooks(hooks, ['play-sound.ps1']); // the Unix ones are absent
  const home = path.join(root, 'home', '.claude');

  const isWindows = process.platform === 'win32';
  if (isWindows) {
    console.log('        (skipped — needs the Unix hook set)');
    return;
  }
  assert.throws(
    () => runFullInstall({ pack: 'claude', version: '1.2.0', root: home, sourceSounds: src, sourceHooks: hooks }),
    /Hook script missing/
  );
  assert.ok(!fs.existsSync(path.join(home, 'sounds')), 'nothing may be written before the check passes');
});

console.log('\nhook classification (must match play-sound.ps1 exactly)');

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

console.log(`\n${passed} passed${process.exitCode ? ', with failures above' : ''}\n`);
