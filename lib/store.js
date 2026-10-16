'use strict';

/**
 * Tiny JSON file store with atomic writes (no dependencies).
 */

const fs = require('fs');
const path = require('path');
const { ROOT } = require('./env');

const DATA_DIR = path.join(ROOT, 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function fileFor(name) {
  return path.join(DATA_DIR, name);
}

function readJSON(name, fallback) {
  const file = fileFor(name);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
  if (!text.trim()) return fallback;
  return JSON.parse(text); // throws on corrupt data — surfaced to the caller
}

function writeJSON(name, value) {
  ensureDataDir();
  const file = fileFor(name);
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

module.exports = { DATA_DIR, fileFor, readJSON, writeJSON, ensureDataDir };
