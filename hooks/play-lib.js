'use strict';

// Shared by play-sound.js and play-category.js.
//
// The .sh hooks deliberately duplicated this logic, for two reasons: a third
// file for the installer to keep in step, and the cost of a second process on
// a path that runs at the end of every response. The second reason does not
// survive the move to Node - `require` is in-process - and the first is worth
// paying once to avoid two copies of a five-player probe chain drifting apart.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const MARKER = path.join(CLAUDE_DIR, '.subagent-done-at');
const ERROR_FILE = path.join(CLAUDE_DIR, '.backtoyou-playback-error');

// A user can drop a three-minute file into a pack folder, and this runs at the
// end of every single response.
const WATCHDOG_MS = 6000;

/**
 * Players, in probe order. Settled by the Linux audio research (#25).
 *
 * `pw-play` is the only candidate present by default on both a stock Ubuntu
 * desktop and Fedora Workstation - `paplay` lives in pulseaudio-utils, which
 * neither installs. `paplay` stays at rung two anyway because WSLg exposes a
 * PulseAudio server via a preset PULSE_SERVER, where `aplay` cannot work at
 * all (no /dev/snd); stopping the chain at pw-play would break WSL.
 *
 * Two format gates are mandatory, not tidiness:
 *
 *   - `aplay` handed an mp3 does not fail. It replays the compressed bytes as
 *     8 kHz unsigned 8-bit mono noise and exits 0, so in a first-success-wins
 *     chain it wins and emits ~2.3 s of static. Verified.
 *   - `mpg123` cannot play wav, so it needs the inverse gate. Both matter
 *     because the README invites users to drop in either format.
 *
 * `ffplay` is excluded outright: with no audio device it plays nothing and
 * exits 0, which would satisfy the chain, suppress the error file, and produce
 * exactly the undiagnosable silence this project treats as its worst outcome.
 * It is also the second-slowest candidate. Verified both ways - do not add it.
 */
const PLAYERS = [
  { cmd: 'afplay', platform: 'darwin', args: [], formats: ['.mp3', '.wav'] },
  { cmd: 'pw-play', platform: 'linux', args: [], formats: ['.mp3', '.wav'] },
  { cmd: 'paplay', platform: 'linux', args: [], formats: ['.mp3', '.wav'] },
  { cmd: 'mpg123', platform: 'linux', args: ['-q'], formats: ['.mp3'] },
  { cmd: 'play', platform: 'linux', args: ['-q'], formats: ['.mp3', '.wav'] },
  { cmd: 'aplay', platform: 'linux', args: ['-q'], formats: ['.wav'] },
];

/** The active pack. One line of text, read fresh every time, so switching needs no restart. */
function activeTheme() {
  try {
    const t = fs.readFileSync(path.join(CLAUDE_DIR, 'sound-theme.txt'), 'utf8').trim();
    if (t) return t;
  } catch { /* not installed, or unreadable */ }
  return 'claude';
}

/** A random clip from a category folder, or null when there is nothing to play. */
function pickClip(category) {
  const dir = path.join(CLAUDE_DIR, 'sounds', activeTheme(), category);
  let files;
  try {
    files = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && ['.mp3', '.wav'].includes(path.extname(e.name).toLowerCase()))
      .map((e) => path.join(dir, e.name));
  } catch {
    return null;
  }
  // An empty folder is the supported way to switch one sound off.
  if (files.length === 0) return null;
  return files[crypto.randomInt(files.length)];
}

/**
 * Play a clip, blocking until it ends.
 *
 * Blocking is required: the Stop hook must not return before the clip
 * finishes, which is how afplay, pw-play and paplay all behave natively.
 * spawnSync's timeout gives the watchdog for free.
 */
function play(clip) {
  const ext = path.extname(clip).toLowerCase();
  const tried = [];

  for (const p of PLAYERS) {
    if (p.platform !== process.platform) continue;
    if (!p.formats.includes(ext)) continue;

    const r = spawnSync(p.cmd, [...p.args, clip], {
      timeout: WATCHDOG_MS,
      killSignal: 'SIGKILL',
      stdio: 'ignore',
    });

    // Not installed - try the next rung.
    if (r.error && r.error.code === 'ENOENT') continue;
    // The watchdog fired, which means it was playing. Nothing is wrong.
    if (r.error && r.error.code === 'ETIMEDOUT') return true;
    if (r.status === 0) return true;

    // Present but failed - no audio device, no server. Fall through.
    tried.push(`${p.cmd}(status ${r.status === null ? 'killed' : r.status})`);
  }

  noteFailure(clip, tried);
  return false;
}

/**
 * Never fail silently. A hook that plays nothing and says nothing is the
 * hardest thing in this project to diagnose, so the reason lands somewhere a
 * human can find it. Overwritten rather than appended: if playback is broken
 * this runs on every response, and an append would grow without bound.
 */
function noteFailure(clip, tried) {
  const detail = tried.length ? `tried ${tried.join(', ')}` : 'no usable player found on PATH';
  try {
    fs.writeFileSync(
      ERROR_FILE,
      `${new Date().toISOString()}  ${detail}  clip=${clip}\n`,
      'utf8'
    );
  } catch { /* nothing left to do */ }
}

/** Read the hook payload from stdin. Returns {} when there is nothing readable. */
function readPayload() {
  if (process.stdin.isTTY) return {};
  try {
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) return {};
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch {
    return {};
  }
}

/**
 * Drain stdin without parsing it.
 *
 * Claude Code writes JSON to this process's stdin; leaving it unread risks
 * blocking the writer once a payload outgrows the pipe buffer, and the larger
 * events wired here - PreToolUse, SubagentStop - are the ones that can.
 */
function drainStdin() {
  if (process.stdin.isTTY) return;
  try {
    fs.readFileSync(0);
  } catch { /* nothing to drain */ }
}

module.exports = {
  CLAUDE_DIR,
  MARKER,
  ERROR_FILE,
  PLAYERS,
  activeTheme,
  pickClip,
  play,
  readPayload,
  drainStdin,
};
