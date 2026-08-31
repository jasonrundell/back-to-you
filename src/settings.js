'use strict';

// Merging our hook entries into Claude Code's settings.json.
//
// A direct port of tools/merge-settings.js (JXA) and its PowerShell twin,
// both of which existed only because there was no JSON parser at install
// time. The semantics are theirs and are deliberate - read the notes before
// changing any of it.
//
// It REWRITES rather than merges: strip every entry this project owns across
// every event, then write the current plan back. That is what lets an upgrade
// correct an entry an older version got wrong - a stale path, a missing
// timeout, a matcher that was too broad. An earlier version skipped any event
// that already had an entry, so none of those could ever be fixed. It is also
// what retires an event outright: SubagentStop was wired up to 1.2.0, and an
// upgrade unwires it with nothing asked of the user.

const fs = require('node:fs');
const path = require('node:path');

/**
 * The four wired events.
 *
 * SessionStart is deliberately NOT wired. Matched even to `startup` alone it
 * fired ~4x an hour in real use and accounted for 69% of all sounds heard
 * over a measured six-hour run.
 *
 * SubagentStop is NOT wired either, as of 1.3.0, and there is no
 * subagent-done category any more. A subagent finishing is not a moment that
 * wants you back - the turn is still running - and a turn that fans out to
 * several of them announced every one. Repetitive enough to be a reason to
 * turn the whole thing off, which costs the events that do earn their sound.
 * The Stop clip at the end of the turn already covers it.
 *
 * Notification is matched to the types that are genuinely a request for
 * input; unmatched it also fires on auth_success, and on agent_completed -
 * the same subagent announcement by another route, out for the same reason.
 *
 * PreToolUse/AskUserQuestion covers the multiple-choice picker, which has no
 * notification type of its own and would otherwise be the one decision-shaped
 * moment in the product that stays silent.
 *
 * IMPORTANT: PreToolUse can BLOCK the tool call - exit code 2 means "do not
 * do this". The category hook exits 0 unconditionally, including on every
 * error path, and it must stay that way.
 */
function hookPlan(hooksDir, facts) {
  const sound = facts.invoke(path.join(hooksDir, facts.soundHook));
  const category = (arg) => `${facts.invoke(path.join(hooksDir, facts.categoryHook))} ${arg}`;

  return [
    { event: 'Stop', matcher: null, command: sound },
    {
      event: 'Notification',
      matcher: 'permission_prompt|agent_needs_input|elicitation_dialog',
      command: category('decision-needed'),
    },
    { event: 'PreToolUse', matcher: 'AskUserQuestion', command: category('decision-needed') },
    { event: 'StopFailure', matcher: null, command: category('error') },
  ];
}

// Every script this project has ever installed, including ones no longer
// shipped. play-sound-decision.sh was an earlier build's Notification hook,
// wired with no matcher; upgrading users kept it alongside the current entry
// and heard two clips for every prompt.
//
// The .js names are here so that upgrading a macOS or Linux machine from a
// pre-Node install unwires the old .sh entries instead of leaving both wired
// and playing two clips. The .ps1 names are here for the same reason in
// reverse - a user can move a ~/.claude between platforms.
//
// play-lib.js and play-lib.ps1 are installed but never named by any settings
// entry - neither is ever wired as a command. They are listed here anyway so
// that an uninstall on EITHER platform removes the other platform's leftover
// lib, for the same move-a-~/.claude-between-platforms case as above.
const OWNED_SCRIPTS = [
  'play-sound.sh',
  'play-category.sh',
  'play-sound-decision.sh',
  'play-sound.ps1',
  'play-category.ps1',
  'play-sound-decision.ps1',
  'play-sound.js',
  'play-category.js',
  'play-lib.js',
  'play-lib.ps1',
];

function isOwnedCommand(command) {
  if (typeof command !== 'string') return false;
  return OWNED_SCRIPTS.some((script) => command.includes(script));
}

/** Strip our entries from every event, not just the ones we currently wire. */
function stripOwnedHooks(hooks) {
  let removed = 0;

  for (const eventName of Object.keys(hooks)) {
    if (!Array.isArray(hooks[eventName])) {
      hooks[eventName] = [];
      continue;
    }

    hooks[eventName] = hooks[eventName].filter((group) => {
      if (!group || !Array.isArray(group.hooks)) return false;

      group.hooks = group.hooks.filter((hook) => {
        if (hook && isOwnedCommand(hook.command)) {
          removed++;
          return false;
        }
        return Boolean(hook);
      });

      // A group holding nothing but our hooks goes with them. One holding a
      // hook of the user's own is kept, minus ours - its matcher is theirs.
      return group.hooks.length > 0;
    });
  }

  return removed;
}

/**
 * Read settings.json, hand the parsed config to `mutate`, write it back.
 *
 * Shared by installing and uninstalling so the delicate parts - BOM handling,
 * refusing to clobber, atomic write - exist once. Throws on any problem,
 * leaving the file untouched, so the caller can restore its backup.
 *
 * @returns whatever `mutate` returns, plus `hadBom`
 */
function editSettings(settingsPath, mutate) {
  let raw = null;
  try {
    raw = fs.readFileSync(settingsPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  // A UTF-8 BOM is not decoration here: PowerShell 5.1 writes UTF-8 *with*
  // BOM by default, so every settings.json that merge-settings.ps1 ever wrote
  // is likely to carry one. JSON.parse rejects it outright, where the JXA and
  // PowerShell readers both tolerated it. Strip it to parse, and put it back
  // on write - the file's encoding signature is the user's, not ours to
  // normalise away.
  const hadBom = raw !== null && raw.charCodeAt(0) === 0xfeff;
  if (hadBom) raw = raw.slice(1);

  let config;
  if (raw === null || raw.trim() === '') {
    config = {};
  } else {
    config = JSON.parse(raw);
  }

  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('settings.json does not contain a JSON object');
  }

  if (!config.hooks || typeof config.hooks !== 'object' || Array.isArray(config.hooks)) {
    config.hooks = {};
  }

  const result = mutate(config);

  // Drop events left empty, so unwiring an event we used to wire does not
  // leave `"SomeEvent": []` behind in the user's file.
  for (const eventName of Object.keys(config.hooks)) {
    if (Array.isArray(config.hooks[eventName]) && config.hooks[eventName].length === 0) {
      delete config.hooks[eventName];
    }
  }

  const body = JSON.stringify(config, null, 2) + '\n';
  writeAtomically(settingsPath, hadBom ? '﻿' + body : body);
  return { ...result, hadBom };
}

/**
 * Strip our entries, then write the current plan back.
 *
 * A rewrite rather than a merge: that is what lets an upgrade correct an
 * entry an older version got wrong.
 *
 * @returns {{removed: number, installed: number, hadBom: boolean}}
 */
function mergeSettings(settingsPath, hooksDir, facts) {
  return editSettings(settingsPath, (config) => {
    const removed = stripOwnedHooks(config.hooks);
    const plan = hookPlan(hooksDir, facts);

    for (const entry of plan) {
      if (!Array.isArray(config.hooks[entry.event])) config.hooks[entry.event] = [];

      // An explicit short timeout: Claude Code's default for command hooks is
      // ten minutes, which is no safety net at all for something attached to
      // the end of every response.
      const group = { hooks: [{ type: 'command', command: entry.command, timeout: 10 }] };
      if (entry.matcher !== null) group.matcher = entry.matcher;
      config.hooks[entry.event].push(group);
    }

    return { removed, installed: plan.length };
  });
}

/**
 * Strip our entries and write nothing back in their place.
 *
 * The uninstall half of mergeSettings: same read, same BOM handling, same
 * refusal to clobber, minus the rewrite. Everything belonging to the user -
 * unrelated top-level keys, third-party hooks sharing a group with ours -
 * survives untouched.
 *
 * @returns {{removed: number, hadBom: boolean}}
 */
function unwireSettings(settingsPath) {
  return editSettings(settingsPath, (config) => ({
    removed: stripOwnedHooks(config.hooks),
  }));
}

function writeAtomically(target, text) {
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, target);
}

module.exports = {
  mergeSettings,
  unwireSettings,
  stripOwnedHooks,
  hookPlan,
  isOwnedCommand,
  OWNED_SCRIPTS,
};
