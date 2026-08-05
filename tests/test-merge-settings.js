// Exercises tools/merge-settings.js under node by stubbing the JXA/ObjC layer.
// The Foundation calls are trivial file IO; the logic worth testing is the hook
// plan, the duplicate detection, and the preservation of foreign config.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.resolve(__dirname, '..', 'tools', 'merge-settings.js');

let store = {};

function makeContext() {
  const nsString = {
    stringWithContentsOfFileEncodingError(p) {
      const has = Object.prototype.hasOwnProperty.call(store, p);
      return { isNil: () => !has, __v: has ? store[p] : null };
    },
    alloc: {
      initWithUTF8String(text) {
        return {
          writeToFileAtomicallyEncodingError(p) { store[p] = text; return true; }
        };
      }
    }
  };
  return {
    ObjC: { import() {}, unwrap: (o) => (o && '__v' in o ? o.__v : o) },
    $: { NSString: nsString, NSUTF8StringEncoding: 4 },
    console: { log() {} },
    module: {}, exports: {}
  };
}

function runMerge(settingsPath, hookDir) {
  const ctx = vm.createContext(makeContext());
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx);
  return vm.runInContext('run', ctx)([settingsPath, hookDir]);
}

let pass = 0, fail = 0;
function check(desc, cond, detail) {
  if (cond) { pass++; console.log('  ok    ' + desc); }
  else { fail++; console.log('  FAIL  ' + desc + (detail ? '  -> ' + detail : '')); }
}

const P = '/Users/jason/.claude/settings.json';
const H = '/Users/jason/.claude/hooks';

// --- case 1: absent file ---------------------------------------------------
store = {};
runMerge(P, H);
let cfg = JSON.parse(store[P]);
const events = Object.keys(cfg.hooks);
check('absent file: five events wired',
  events.length === 5, events.join(','));
check('absent file: event order preserved',
  events.join(',') === 'Stop,Notification,PreToolUse,SubagentStop,StopFailure', events.join(','));
check('Notification is matched to input requests only',
  cfg.hooks.Notification[0].matcher === 'permission_prompt|agent_needs_input|elicitation_dialog',
  String(cfg.hooks.Notification[0].matcher));
check('Notification does NOT match auth_success or agent_completed',
  !/auth_success|agent_completed/.test(cfg.hooks.Notification[0].matcher || ''));
check('PreToolUse matched to AskUserQuestion',
  cfg.hooks.PreToolUse[0].matcher === 'AskUserQuestion', String(cfg.hooks.PreToolUse[0].matcher));
check('PreToolUse plays decision-needed',
  cfg.hooks.PreToolUse[0].hooks[0].command.endsWith(' decision-needed'));
// SessionStart is deliberately unwired: matched to `startup` it still fired
// ~4x/hour and made up 69% of all sounds heard in a measured six-hour run.
check('SessionStart deliberately absent',
  !('SessionStart' in cfg.hooks), Object.keys(cfg.hooks).join(','));
check('no command mentions session-start',
  !JSON.stringify(cfg).includes('session-start'));
check('Stop carries NO matcher',
  !('matcher' in cfg.hooks.Stop[0]), JSON.stringify(cfg.hooks.Stop[0]));
check('StopFailure carries NO matcher',
  !('matcher' in cfg.hooks.StopFailure[0]));
check('PostToolUseFailure deliberately absent',
  !('PostToolUseFailure' in cfg.hooks));
check('commands quote the hook path',
  cfg.hooks.Notification[0].hooks[0].command.startsWith('"' + H + '/play-category.sh"'),
  cfg.hooks.Notification[0].hooks[0].command);
check('each shared-script event gets its own category arg',
  cfg.hooks.SubagentStop[0].hooks[0].command.endsWith(' subagent-done') &&
  cfg.hooks.StopFailure[0].hooks[0].command.endsWith(' error'));
check('explicit timeout set',
  cfg.hooks.Stop[0].hooks[0].timeout === 10);

// --- case 2: foreign config must survive -----------------------------------
store = {};
store[P] = JSON.stringify({
  model: 'claude-opus-5',
  env: { MY_VAR: 'keepme' },
  permissions: { allow: ['Bash(git:*)'] },
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: '/usr/local/bin/my-notifier.sh' }] }],
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'audit.sh' }] }]
  }
}, null, 2);
runMerge(P, H);
cfg = JSON.parse(store[P]);
check('foreign top-level key preserved (model)', cfg.model === 'claude-opus-5');
check('foreign nested key preserved (env)', cfg.env.MY_VAR === 'keepme');
check('foreign array preserved (permissions)', cfg.permissions.allow[0] === 'Bash(git:*)');
check('foreign hook event preserved (PreToolUse)',
  cfg.hooks.PreToolUse[0].hooks[0].command === 'audit.sh');
check('foreign PreToolUse hook survives alongside ours',
  cfg.hooks.PreToolUse.length === 2 &&
  cfg.hooks.PreToolUse[0].hooks[0].command === 'audit.sh' &&
  cfg.hooks.PreToolUse[1].matcher === 'AskUserQuestion',
  'len=' + cfg.hooks.PreToolUse.length);
check('user Stop hook survives alongside ours',
  cfg.hooks.Stop.length === 2 &&
  cfg.hooks.Stop[0].hooks[0].command === '/usr/local/bin/my-notifier.sh',
  'len=' + cfg.hooks.Stop.length);

// --- case 3: idempotency ---------------------------------------------------
const afterFirst = store[P];
runMerge(P, H);
cfg = JSON.parse(store[P]);
check('re-run adds nothing (Stop still 2)', cfg.hooks.Stop.length === 2, 'len=' + cfg.hooks.Stop.length);
check('re-run adds nothing (StopFailure still 1)', cfg.hooks.StopFailure.length === 1);
check('re-run adds nothing (PreToolUse still 2: theirs + ours)', cfg.hooks.PreToolUse.length === 2, 'len=' + cfg.hooks.PreToolUse.length);
check('re-run is byte-identical', store[P] === afterFirst);

// --- case 4: null survives round-trip (the whole reason for JXA over plutil) -
store = {};
store[P] = JSON.stringify({ someSetting: null, hooks: {} });
runMerge(P, H);
cfg = JSON.parse(store[P]);
check('JSON null survives (plutil could not do this)',
  Object.prototype.hasOwnProperty.call(cfg, 'someSetting') && cfg.someSetting === null);

// --- case 5: upgrading from an older install -------------------------------
// The bug this guards: an earlier build wired play-sound-decision.sh to
// Notification with no matcher. The old duplicate check only looked for the
// script named in the current plan, so it never saw that entry, left it in
// place, and every permission prompt played two clips. The same blind spot
// meant an entry already present was skipped wholesale - so a stale path or a
// missing timeout could never be corrected by reinstalling.
store = {};
store[P] = JSON.stringify({
  hooks: {
    Stop: [{ hooks: [{ type: 'command', command: '"' + H + '/play-sound.sh"' }] }],
    Notification: [
      { hooks: [{ type: 'command', command: '"' + H + '/play-sound-decision.sh"' }] },
      { matcher: 'permission_prompt|agent_needs_input|elicitation_dialog',
        hooks: [{ type: 'command', command: '"' + H + '/play-category.sh" decision-needed', timeout: 10 }] }
    ]
  }
}, null, 2);
runMerge(P, H);
cfg = JSON.parse(store[P]);
check('upgrade: legacy play-sound-decision entry removed',
  !JSON.stringify(cfg).includes('play-sound-decision'),
  JSON.stringify(cfg.hooks.Notification));
check('upgrade: Notification collapses to a single entry',
  cfg.hooks.Notification.length === 1, 'len=' + cfg.hooks.Notification.length);
check('upgrade: surviving Notification entry keeps its matcher',
  cfg.hooks.Notification[0].matcher === 'permission_prompt|agent_needs_input|elicitation_dialog');
check('upgrade: pre-existing Stop entry gains the missing timeout',
  cfg.hooks.Stop.length === 1 && cfg.hooks.Stop[0].hooks[0].timeout === 10,
  JSON.stringify(cfg.hooks.Stop));

// A legacy entry parked under an event the current plan no longer wires must
// still go, and must not leave an empty array behind. SessionStart is the live
// case: every install before it was unwired carries one, and reinstalling is
// what removes it.
store = {};
store[P] = JSON.stringify({
  hooks: {
    SessionStart: [{ matcher: 'startup',
      hooks: [{ type: 'command', command: '"' + H + '/play-category.sh" session-start', timeout: 10 }] }],
    PostToolUseFailure: [{ hooks: [{ type: 'command', command: '"' + H + '/play-category.sh" error' }] }]
  }
}, null, 2);
runMerge(P, H);
cfg = JSON.parse(store[P]);
check('upgrade: stale SessionStart entry is removed',
  !('SessionStart' in cfg.hooks), Object.keys(cfg.hooks).join(','));
check('upgrade: entry under an unplanned event is removed',
  !('PostToolUseFailure' in cfg.hooks), Object.keys(cfg.hooks).join(','));

// ...but a SessionStart hook that is not ours must survive. Unwiring our own
// greeting is not licence to remove someone else's context-loading hook.
store = {};
store[P] = JSON.stringify({
  hooks: {
    SessionStart: [{ matcher: 'startup',
      hooks: [{ type: 'command', command: 'load-my-project-context.sh' }] }]
  }
}, null, 2);
runMerge(P, H);
cfg = JSON.parse(store[P]);
check('upgrade: a foreign SessionStart hook is left alone',
  cfg.hooks.SessionStart &&
  cfg.hooks.SessionStart[0].hooks[0].command === 'load-my-project-context.sh',
  JSON.stringify(cfg.hooks.SessionStart));

// --- case 6: malformed input must throw, not overwrite ---------------------
store = {};
store[P] = '{ "hooks": { BROKEN';
let threw = false;
try { runMerge(P, H); } catch (e) { threw = true; }
check('malformed input throws', threw);
check('malformed input left untouched', store[P] === '{ "hooks": { BROKEN');

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
