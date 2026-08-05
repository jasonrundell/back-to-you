// Exercises tools/lint-json.js under node by stubbing the JXA/ObjC layer,
// the same way test-merge-settings.js does.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.resolve(__dirname, '..', 'tools', 'lint-json.js');

let store = {};

function makeContext() {
  const nsString = {
    stringWithContentsOfFileEncodingError(p) {
      const has = Object.prototype.hasOwnProperty.call(store, p);
      return { isNil: () => !has, __v: has ? store[p] : null };
    }
  };
  return {
    ObjC: { import() {}, unwrap: (o) => (o && '__v' in o ? o.__v : o) },
    $: { NSString: nsString, NSUTF8StringEncoding: 4 },
    module: {}, exports: {}
  };
}

function runLint(settingsPath) {
  const ctx = vm.createContext(makeContext());
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx);
  return vm.runInContext('run', ctx)([settingsPath]);
}

let pass = 0, fail = 0;
function check(desc, cond, detail) {
  if (cond) { pass++; console.log('  ok    ' + desc); }
  else { fail++; console.log('  FAIL  ' + desc + (detail ? '  -> ' + detail : '')); }
}

const P = '/Users/jason/.claude/settings.json';

// --- absent file: valid ------------------------------------------------------
store = {};
check('absent file does not throw', (() => { try { runLint(P); return true; } catch (e) { return false; } })());

// --- empty file: valid --------------------------------------------------------
store = { [P]: '' };
check('empty file does not throw', (() => { try { runLint(P); return true; } catch (e) { return false; } })());

// --- ordinary settings.json: valid -------------------------------------------
store = { [P]: JSON.stringify({ permissions: { allow: ['mcp__pencil'] } }, null, 2) };
check('well-formed object does not throw', (() => { try { runLint(P); return true; } catch (e) { return false; } })());

// --- JSON null survives elsewhere but here the root itself must be an object -
store = { [P]: 'null' };
let threw = false;
try { runLint(P); } catch (e) { threw = true; }
check('bare null is rejected', threw);

// --- a JSON array at the root is not a valid settings file --------------------
store = { [P]: '[1, 2, 3]' };
threw = false;
try { runLint(P); } catch (e) { threw = true; }
check('bare array is rejected', threw);

// --- malformed JSON must throw, matching plutil's old behavior ----------------
store = { [P]: '{ "hooks": { BROKEN' };
threw = false;
try { runLint(P); } catch (e) { threw = true; }
check('malformed JSON is rejected', threw);

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
