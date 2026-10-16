#!/usr/bin/env node
'use strict';

/**
 * Set (or change) the admin username + password.
 *
 *   node set-credentials.js                       # interactive prompts
 *   node set-credentials.js saidhyeya             # prompts only for password
 *   node set-credentials.js saidhyeya MyPass123   # non-interactive
 *
 * Only a salted scrypt hash is written to data/admin.json — never plaintext.
 */

const readline = require('readline');
const { loadEnv } = require('./lib/env');
const { hashPassword } = require('./lib/auth');
const { readJSON, writeJSON } = require('./lib/store');

loadEnv();

const ADMIN_FILE = 'admin.json';

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      // Piped / non-interactive: fall back to a visible line read.
      const rl = readline.createInterface({ input: stdin, output: process.stdout });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }

    process.stdout.write(question);
    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');

    let buffer = '';

    const finish = (value) => {
      stdin.removeListener('data', onData);
      try { stdin.setRawMode(false); } catch { /* ignore */ }
      stdin.pause();
      process.stdout.write('\n');
      resolve(value);
    };

    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') return finish(buffer);
        if (ch === '\u0003') { // Ctrl+C
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') {
          if (buffer.length) {
            buffer = buffer.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (ch === '\u001b') continue; // ignore escape sequences
        buffer += ch;
        process.stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  const argvUser = process.argv[2];
  const argvPass = process.argv[3];

  const existing = readJSON(ADMIN_FILE, null) || {};
  const currentUser = existing.username || 'admin';

  let username = argvUser || (process.stdin.isTTY ? await ask(`Username [${currentUser}]: `) : '');
  if (!username) username = currentUser;

  if (!/^[A-Za-z0-9._@-]{3,40}$/.test(username)) {
    console.error('✖ Username must be 3–40 chars (letters, digits, . _ @ -).');
    process.exit(1);
  }

  let password = argvPass;
  if (!password) {
    password = await askHidden(`New password for "${username}": `);
    const again = await askHidden('Repeat password: ');
    if (password !== again) {
      console.error('✖ Passwords do not match. Nothing was changed.');
      process.exit(1);
    }
  }

  if (typeof password !== 'string' || password.length < 8) {
    console.error('✖ Password must be at least 8 characters.');
    process.exit(1);
  }

  const { salt, hash } = hashPassword(password);
  writeJSON(ADMIN_FILE, {
    username,
    salt,
    hash,
    algorithm: 'scrypt',
    updatedAt: new Date().toISOString()
  });

  console.log(`\n✔ Admin credentials saved to data/admin.json`);
  console.log(`  username: ${username}`);
  console.log(`  password: (hidden — only its scrypt hash is stored)\n`);
}

main().catch((err) => {
  console.error('✖', err.message);
  process.exit(1);
});
