// Merges the Back to You hook entries into Claude Code's settings.json.
//
// Run by install.sh as:
//   osascript -l JavaScript tools/merge-settings.js <settings-path> <hook-dir>
//
// JXA rather than plutil, jq, or python3, because:
//   - macOS ships no python3 (it comes with the Command Line Tools) and no jq.
//   - plutil round-trips JSON through the plist type system, which has no null,
//     sorts keys, and can coerce types. This file belongs to the user and holds
//     configuration this installer knows nothing about, so it must come out the
//     other side byte-for-byte identical apart from what we deliberately added.
//
// Rewrites rather than merges: it strips every entry this project owns, then
// writes the current plan back. That is what lets an upgrade correct an entry
// an older version got wrong. Hooks belonging to the user are untouched.
//
// Exits non-zero on any failure so install.sh can restore its backup.

ObjC.import('Foundation');

function readText(path) {
  var s = $.NSString.stringWithContentsOfFileEncodingError(
    path, $.NSUTF8StringEncoding, null);
  return s.isNil() ? null : ObjC.unwrap(s);
}

function writeTextAtomically(path, text) {
  var ok = $.NSString.alloc.initWithUTF8String(text)
    .writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
  if (!ok) {
    throw new Error('could not write ' + path);
  }
}

// event, matcher (null for none), script, argument (null for none).
//
// Stop is the only event whose script decides its own category, by inspecting
// the assistant's last message. The other four are fixed.
//
// SessionStart is deliberately NOT wired, and the session-start clip no longer
// plays. Even matched to `startup` alone it fired roughly four times an hour
// in real use - `startup` means every new session, not every app launch, and
// short-lived sessions are common. It was 69% of all sounds heard over a
// measured six-hour run, in bursts as tight as four in 43 seconds. It was also
// the least useful of the set: a session starting is the one moment you are
// already looking at the terminal, whereas task-complete and decision-needed
// earn their place precisely because you are not.
//
// StopFailure is unmatched: it fires when a turn ends on an API error, and all
// of its error types deserve the same flat, unalarmed clip.
//
// PostToolUseFailure is deliberately NOT wired. It fires on every failed tool
// call - a grep that matches nothing, a red test run - and would buzz
// constantly.
//
// Notification is matched to the types that are genuinely a request for input.
// Unmatched it also fires on auth_success - a successful login saying "Your
// call." - and on agent_completed, which SubagentStop already owns.
//
// PreToolUse/AskUserQuestion covers the multiple-choice picker, which has no
// notification type of its own and would otherwise be the one decision-shaped
// moment in the product that stays silent.
//
// IMPORTANT: PreToolUse can BLOCK the tool call - exit code 2 means "do not do
// this". play-category.sh exits 0 unconditionally, including on every error
// path, and it must stay that way. A hook here that exits non-zero stops the
// question from being asked at all.
function hookPlan(hookDir) {
  var q = function (p) { return '"' + hookDir + '/' + p + '"'; };
  return [
    { event: 'Stop', matcher: null, script: 'play-sound.sh', arg: null,
      command: q('play-sound.sh') },
    { event: 'Notification', matcher: 'permission_prompt|agent_needs_input|elicitation_dialog',
      script: 'play-category.sh', arg: 'decision-needed',
      command: q('play-category.sh') + ' decision-needed' },
    { event: 'PreToolUse', matcher: 'AskUserQuestion',
      script: 'play-category.sh', arg: 'decision-needed',
      command: q('play-category.sh') + ' decision-needed' },
    { event: 'SubagentStop', matcher: null, script: 'play-category.sh', arg: 'subagent-done',
      command: q('play-category.sh') + ' subagent-done' },
    { event: 'StopFailure', matcher: null, script: 'play-category.sh', arg: 'error',
      command: q('play-category.sh') + ' error' }
  ];
}

// Every script this project has ever installed, including ones no longer
// shipped. play-sound-decision.sh was an earlier build's Notification hook,
// wired with no matcher; upgrading users kept it alongside the current entry
// and heard two clips for every prompt. Anything naming one of these is ours
// to remove and rewrite.
var OWNED_SCRIPTS = ['play-sound.sh', 'play-category.sh', 'play-sound-decision.sh'];

function isOwnedCommand(command) {
  if (typeof command !== 'string') { return false; }
  return OWNED_SCRIPTS.some(function (script) {
    return command.indexOf(script) !== -1;
  });
}

// Strips every entry this project owns, across every event - not just the ones
// in the plan, so an entry left under an event we no longer wire still goes.
// The caller then rebuilds them, which is what makes an upgrade correct a
// stale path, a missing timeout, or a matcher an older version got wrong. The
// previous version skipped any event that already had an entry, so none of
// those could ever be fixed.
function stripOwnedHooks(hooks) {
  var removed = 0;

  Object.keys(hooks).forEach(function (eventName) {
    if (!Array.isArray(hooks[eventName])) {
      hooks[eventName] = [];
      return;
    }

    hooks[eventName] = hooks[eventName].filter(function (group) {
      if (!group || !Array.isArray(group.hooks)) { return false; }

      group.hooks = group.hooks.filter(function (hook) {
        if (hook && isOwnedCommand(hook.command)) {
          removed++;
          return false;
        }
        return !!hook;
      });

      // A group holding nothing but our hooks goes with them. One holding a
      // hook of the user's own is kept, minus ours - its matcher is theirs,
      // not something to rewrite.
      return group.hooks.length > 0;
    });
  });

  return removed;
}

function run(argv) {
  var settingsPath = argv[0];
  var hookDir = argv[1];

  if (!settingsPath || !hookDir) {
    throw new Error('usage: merge-settings.js <settings-path> <hook-dir>');
  }

  var raw = readText(settingsPath);
  var config;

  if (raw === null || raw.trim() === '') {
    config = {};
  } else {
    // A throw here aborts the install with the backup intact. Never fall
    // through to writing a fresh file - that is the clobbering we are
    // specifically avoiding.
    config = JSON.parse(raw);
  }

  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('settings.json does not contain a JSON object');
  }

  if (!config.hooks || typeof config.hooks !== 'object' || Array.isArray(config.hooks)) {
    config.hooks = {};
  }

  var plan = hookPlan(hookDir);

  var removed = stripOwnedHooks(config.hooks);
  if (removed > 0) {
    console.log('  ok  Removed ' + removed + ' existing Back to You hook entr' +
      (removed === 1 ? 'y' : 'ies'));
  }

  for (var i = 0; i < plan.length; i++) {
    var entry = plan[i];

    if (!Array.isArray(config.hooks[entry.event])) {
      config.hooks[entry.event] = [];
    }

    // An explicit short timeout: Claude Code's default for command hooks is
    // ten minutes, which is no safety net at all for something attached to
    // the end of every response.
    var group = { hooks: [{ type: 'command', command: entry.command, timeout: 10 }] };
    if (entry.matcher !== null) {
      group.matcher = entry.matcher;
    }
    config.hooks[entry.event].push(group);
    console.log('  ok  ' + entry.event + ' hook installed');
  }

  // Drop events left empty by the strip, so uninstalling a hook we used to
  // wire does not leave `"SomeEvent": []` behind in the user's file.
  Object.keys(config.hooks).forEach(function (eventName) {
    if (Array.isArray(config.hooks[eventName]) && config.hooks[eventName].length === 0) {
      delete config.hooks[eventName];
    }
  });

  writeTextAtomically(settingsPath, JSON.stringify(config, null, 2) + '\n');
  return '';
}
