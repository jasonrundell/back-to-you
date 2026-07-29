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
// SessionStart is matched to `startup` alone. It also fires on resume, clear,
// compact, and fork - an unmatched hook would replay the greeting on every
// /clear and after every auto-compaction, which is the fastest way to make a
// pleasant sound into an irritating one.
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
    { event: 'SessionStart', matcher: 'startup', script: 'play-category.sh', arg: 'session-start',
      command: q('play-category.sh') + ' session-start' },
    { event: 'SubagentStop', matcher: null, script: 'play-category.sh', arg: 'subagent-done',
      command: q('play-category.sh') + ' subagent-done' },
    { event: 'StopFailure', matcher: null, script: 'play-category.sh', arg: 'error',
      command: q('play-category.sh') + ' error' }
  ];
}

function alreadyPresent(groups, entry) {
  return groups.some(function (group) {
    if (!group || !Array.isArray(group.hooks)) { return false; }
    return group.hooks.some(function (hook) {
      if (!hook || typeof hook.command !== 'string') { return false; }
      if (hook.command.indexOf(entry.script) === -1) { return false; }
      // Four events share one script, so the argument is what tells them apart.
      return entry.arg === null || hook.command.indexOf(entry.arg) !== -1;
    });
  });
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

  for (var i = 0; i < plan.length; i++) {
    var entry = plan[i];

    if (!Array.isArray(config.hooks[entry.event])) {
      config.hooks[entry.event] = [];
    }
    var groups = config.hooks[entry.event];

    if (alreadyPresent(groups, entry)) {
      console.log('  ok  ' + entry.event + ' hook already present - skipping');
      continue;
    }

    // An explicit short timeout: Claude Code's default for command hooks is
    // ten minutes, which is no safety net at all for something attached to
    // the end of every response.
    var group = { hooks: [{ type: 'command', command: entry.command, timeout: 10 }] };
    if (entry.matcher !== null) {
      group.matcher = entry.matcher;
    }
    groups.push(group);
    console.log('  ok  ' + entry.event + ' hook added');
  }

  writeTextAtomically(settingsPath, JSON.stringify(config, null, 2) + '\n');
  return '';
}
