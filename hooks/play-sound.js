#!/usr/bin/env node
'use strict';

// Claude Code Stop hook - plays a task-complete clip, or a decision-needed
// clip when the last assistant message ends in a question.
//
// Always exits 0. A non-zero exit surfaces a hook error in the transcript, and
// a missing sound is never worth interrupting someone's session over.
//
// The Windows twin is play-sound.ps1 and must stay behaviourally identical.
// Windows keeps PowerShell because it plays through System.Windows.Media
// .MediaPlayer, a WPF assembly Node cannot reach - see docs/adr/0001.

const { pickClip, play, readPayload } = require('./play-lib');

/**
 * task-complete, unless the message ends in a question.
 *
 * Matches play-sound.ps1's `-match '\?[^a-zA-Z0-9]*$'` exactly: a question
 * mark followed only by non-alphanumerics at the end of the whole message, so
 * `right?"` and `...ok?)` both count. Trailing whitespace is trimmed first,
 * which is what .NET's `$` does for a trailing newline.
 *
 * The old sh hook compared only the last non-empty line, because `grep`
 * anchors at the end of every line - matching the whole message there would
 * have fired decision-needed for any multi-line answer merely containing a
 * question. Node's regex has no such problem, so the whole message is tested,
 * which is what Windows has always done.
 *
 * An empty message means task-complete, matching Windows.
 */
function classify(message) {
  if (typeof message !== 'string' || message.trim() === '') return 'task-complete';
  return /\?[^a-zA-Z0-9]*$/.test(message.replace(/\s+$/, '')) ? 'decision-needed' : 'task-complete';
}

// This hook used to suppress its own clip when a subagent had just
// finished: SubagentStop's subagent-done clip landed moments earlier and
// the two read as one completion. SubagentStop is no longer wired and the
// category is gone, so there is nothing left to double up with - see the
// note in src/settings.js.

function main() {
  const payload = readPayload();
  const category = classify(payload.last_assistant_message);

  const clip = pickClip(category);
  if (clip) play(clip);
}

// Guarded so the tests can require this file for `classify` without the hook
// firing and exiting the test process.
if (require.main === module) {
  try {
    main();
  } catch {
    // Deliberately swallowed. See the exit-0 note at the top.
  }
  process.exit(0);
}

module.exports = { classify };
