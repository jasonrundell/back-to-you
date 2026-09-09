#!/usr/bin/env node
'use strict';

// Claude Code hook: plays a random clip from one named sound category.
//
// Used by every wired event except Stop, which has to work out its own
// category from the assistant's last message before it can play anything.
//
//   node play-category.js decision-needed
//   node play-category.js error
//
// Exits quietly - and with status 0 - when the category folder is missing or
// empty. That is the supported way to switch a sound off: delete the clips you
// do not want.
//
// Always exits 0. Nothing wired today can block on this hook's exit code,
// but PreToolUse hooks can (exit 2 blocks the tool call) and this script was
// attached to one until 1.5.1. Keeping every path at exit 0 is cheap
// insurance against it being wired there again.

const { pickClip, play, drainStdin } = require('./play-lib');

function main(category = process.argv[2]) {
  if (!category) return;

  drainStdin();

  const clip = pickClip(category);
  if (clip) play(clip);
}

// Guarded so the tests can require this file for `main` without the hook
// firing and exiting the test process.
if (require.main === module) {
  try {
    main();
  } catch {
    // Deliberately swallowed. See the exit-0 note at the top.
  }
  process.exit(0);
}

module.exports = { main };
