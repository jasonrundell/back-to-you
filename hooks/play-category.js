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
// IMPORTANT: this is wired to PreToolUse, where exit code 2 means "block this
// tool call". A hook that exits non-zero here stops Claude from asking the
// question at all. Every path below must exit 0.

const { pickClip, play, drainStdin } = require('./play-lib');

function main() {
  const category = process.argv[2];
  if (!category) return;

  drainStdin();

  const clip = pickClip(category);
  if (clip) play(clip);
}

try {
  main();
} catch {
  // Deliberately swallowed. See the PreToolUse note at the top.
}
process.exit(0);
