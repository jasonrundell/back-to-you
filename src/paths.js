'use strict';

// Where things live, and what differs per platform.
//
// The hook language is split (see docs/adr/0001): Node on macOS and Linux,
// PowerShell on Windows, because Windows plays through System.Windows.Media
// .MediaPlayer - a WPF assembly Node cannot reach.

const os = require('node:os');
const path = require('node:path');

const IS_WINDOWS = process.platform === 'win32';

/** Hook files installed on this platform, and how settings.json invokes them. */
function hookFacts() {
  if (IS_WINDOWS) {
    return {
      soundHook: 'play-sound.ps1',
      categoryHook: 'play-category.ps1',
      // -File keeps arguments out of the parser, and -NoProfile matters: a
      // user profile would run on every single response.
      invoke: (p) => `powershell -NoProfile -ExecutionPolicy Bypass -File "${p}"`,
    };
  }
  return {
    soundHook: 'play-sound.js',
    categoryHook: 'play-category.js',
    // `node <path>` rather than a shebang plus chmod +x. Without the execute
    // bit a shebang hook is a silent no-op, which this project treats as the
    // worst failure mode there is; naming the interpreter removes the failure
    // mode rather than guarding against it.
    invoke: (p) => `node "${p}"`,
  };
}

function claudeDir() {
  return path.join(os.homedir(), '.claude');
}

function layout(root) {
  const base = root || claudeDir();
  return {
    claudeDir: base,
    hooksDir: path.join(base, 'hooks'),
    soundsDir: path.join(base, 'sounds'),
    settings: path.join(base, 'settings.json'),
    themeFile: path.join(base, 'sound-theme.txt'),
    // A dotfile beside .subagent-done-at, which the hooks already use. Kept
    // out of sound-theme.txt deliberately: the README documents that file as
    // one bare pack name, and hand-editing it is a supported way to switch.
    versionFile: path.join(base, '.backtoyou-version'),
  };
}

/** Packs shipped in this package. */
function packageSoundsDir() {
  return path.join(__dirname, '..', 'sounds');
}

module.exports = { IS_WINDOWS, hookFacts, claudeDir, layout, packageSoundsDir };
