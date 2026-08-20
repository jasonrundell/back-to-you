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
      support: [],
      // -File keeps arguments out of the parser, and -NoProfile matters: a
      // user profile would run on every single response.
      invoke: (p) => `powershell -NoProfile -ExecutionPolicy Bypass -File "${p}"`,
    };
  }
  return {
    soundHook: 'play-sound.js',
    categoryHook: 'play-category.js',
    // Both Unix hooks require this; it is never invoked directly.
    support: ['play-lib.js'],
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
    // A dotfile rather than a line in sound-theme.txt, deliberately: the
    // README documents that file as one bare pack name, and hand-editing it
    // is a supported way to switch.
    versionFile: path.join(base, '.backtoyou-version'),

    // The subagent-done marker, written by the hooks up to 1.2.0 to stop
    // SubagentStop and Stop doubling up. Nothing writes or reads it now that
    // SubagentStop is unwired; it stays listed so installing and uninstalling
    // both clear it off an older machine.
    markerFile: path.join(base, '.subagent-done-at'),
    playbackErrorFile: path.join(base, '.backtoyou-playback-error'),
    // A debug artifact from an August 2026 build. Nothing writes it now, it
    // carries this project's name, and nothing else will ever clean it up.
    legacyLogFile: path.join(base, 'back-to-you-hook.log'),
  };
}

/** Every file this project puts in ~/.claude, settings.json aside. */
function ownedStateFiles(paths) {
  return [
    paths.themeFile,
    paths.versionFile,
    paths.markerFile,
    paths.playbackErrorFile,
    paths.legacyLogFile,
  ];
}

/**
 * Clips this package used to ship and no longer does.
 *
 * subagent-done was retired in 1.3.0 (see the note in settings.js). Installing
 * deletes these as well as unwiring the event, so an upgrade is enough to stop
 * hearing them even where someone had wired the category up by hand.
 *
 * Exact relative paths under sounds/, matching how uninstall matches its own
 * files: a take the user dropped into that folder is theirs, and survives.
 */
const LEGACY_CLIPS = ['claude', 'gigatron', 'jay-run', 'mistress-of-pain'].map((pack) =>
  path.join(pack, 'subagent-done', 'vo-subagents-done.mp3')
);

/** Packs shipped in this package. */
function packageSoundsDir() {
  return path.join(__dirname, '..', 'sounds');
}

module.exports = {
  IS_WINDOWS,
  hookFacts,
  claudeDir,
  layout,
  ownedStateFiles,
  packageSoundsDir,
  LEGACY_CLIPS,
};
