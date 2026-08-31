#!/usr/bin/env node
'use strict';

// `npx backtoyou` - installs Back to You into ~/.claude, or switches the
// active voice pack.
//
// Zero runtime dependencies, deliberately: install.sh and install.bat are
// shims that exec this file straight from a clone or an unzipped folder,
// with no `npm install` first. See docs/adr/0001.

const readline = require('node:readline');

const { main } = require('../src/cli');

const io = {
  out: (s = '') => process.stdout.write(`${s}\n`),
  err: (s = '') => process.stderr.write(`${s}\n`),
  ask: (question) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  },
  isTTY: Boolean(process.stdin.isTTY),
};

main(process.argv.slice(2), io)
  .then((code) => process.exit(code))
  .catch((e) => {
    io.err(`ERROR: ${e && e.message ? e.message : e}`);
    process.exit(1);
  });
