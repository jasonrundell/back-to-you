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

const fs = require('node:fs');
const { MARKER, pickClip, play, readPayload } = require('./play-lib');

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

/**
 * Skip a redundant clip right after a subagent finished.
 *
 * When a subagent is the last thing a turn does, SubagentStop's subagent-done
 * clip plays moments before this hook fires - two "done" clips back to back
 * for one completion. play-category timestamps that moment.
 *
 * The marker is single-use either way, and only task-complete is skipped: a
 * real decision-needed question is a distinct request for input, not a
 * duplicate announcement.
 */
function shouldSkip(category) {
  let marked = null;
  try {
    marked = parseInt(String(fs.readFileSync(MARKER, 'utf8')).replace(/\D/g, ''), 10);
  } catch {
    return false;
  }
  try {
    fs.unlinkSync(MARKER);
  } catch { /* already gone */ }

  if (category !== 'task-complete' || !Number.isFinite(marked)) return false;
  return Math.floor(Date.now() / 1000) - marked <= 5;
}

function main() {
  const payload = readPayload();
  const category = classify(payload.last_assistant_message);

  if (shouldSkip(category)) return;

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

module.exports = { classify, shouldSkip };
