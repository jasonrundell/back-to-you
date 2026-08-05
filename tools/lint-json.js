// Validates that a file is either absent/empty or holds a JSON object,
// using the same JXA JSON.parse that tools/merge-settings.js merges through.
//
// Run by install.sh as:
//   osascript -l JavaScript tools/lint-json.js <path>
//
// install.sh previously shelled out to `plutil -lint` for this. plutil
// round-trips JSON through the plist type system to validate it, and on at
// least one real machine that round-trip rejected a settings.json a plain
// JSON.parse accepts without complaint - a false positive that blocked a
// perfectly good install. Linting with the exact parser the merge itself
// uses means a pass here is a guarantee the merge will parse the file too.
//
// Exits non-zero with a message on stderr when the file is not valid JSON.

ObjC.import('Foundation');

function readText(path) {
  var s = $.NSString.stringWithContentsOfFileEncodingError(
    path, $.NSUTF8StringEncoding, null);
  return s.isNil() ? null : ObjC.unwrap(s);
}

function run(argv) {
  var path = argv[0];
  if (!path) {
    throw new Error('usage: lint-json.js <path>');
  }

  var raw = readText(path);
  if (raw === null || raw.trim() === '') {
    return '';
  }

  var config = JSON.parse(raw);
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('does not contain a JSON object');
  }

  return '';
}
