// Reports which Back to You hook entries are wired in settings.json.
//
// Run by tools/doctor.sh as:
//   osascript -l JavaScript tools/doctor.js <settings-path>
//
// Prints one "ok"/"missing" line per event this project wires. Always exits
// 0 - this is a report, not a gate. tools/doctor.sh decides what counts as
// a failure and how to explain it.

ObjC.import('Foundation');

function readText(path) {
  var s = $.NSString.stringWithContentsOfFileEncodingError(
    path, $.NSUTF8StringEncoding, null);
  return s.isNil() ? null : ObjC.unwrap(s);
}

var EXPECTED = [
  { event: 'Stop', script: 'play-sound.sh' },
  { event: 'Notification', script: 'play-category.sh' },
  { event: 'PreToolUse', script: 'play-category.sh' },
  { event: 'SubagentStop', script: 'play-category.sh' },
  { event: 'StopFailure', script: 'play-category.sh' }
];

function hasScript(hooks, event, script) {
  var groups = hooks[event];
  if (!Array.isArray(groups)) { return false; }
  return groups.some(function (group) {
    return group && Array.isArray(group.hooks) && group.hooks.some(function (hook) {
      return hook && typeof hook.command === 'string' && hook.command.indexOf(script) !== -1;
    });
  });
}

function run(argv) {
  var path = argv[0];
  var raw = readText(path);

  if (raw === null || raw.trim() === '') {
    console.log('missing  settings.json not found at ' + path);
    return '';
  }

  var config;
  try {
    config = JSON.parse(raw);
  } catch (e) {
    console.log('missing  settings.json is not valid JSON: ' + e.message);
    return '';
  }

  var hooks = (config && typeof config.hooks === 'object' && config.hooks) || {};

  EXPECTED.forEach(function (entry) {
    var ok = hasScript(hooks, entry.event, entry.script);
    console.log((ok ? 'ok      ' : 'missing ') + entry.event + ' -> ' + entry.script);
  });

  return '';
}
