'use strict';
/* Build a clean static bundle for GitHub Pages in ./docs
   (front-end only — no Node backend, admin panel, or sensitive files). */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'docs');

const PUBLIC_FILES = ['index.html'];
const PUBLIC_DIRS = ['css', 'js', 'assets'];

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}
function cp(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) cp(path.join(src, entry), path.join(dst, entry));
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

for (const f of PUBLIC_FILES) cp(path.join(ROOT, f), path.join(OUT, f));
for (const d of PUBLIC_DIRS) cp(path.join(ROOT, d), path.join(OUT, d));

// GitHub Pages: don't run Jekyll (keeps files starting with "_" and folders intact)
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

console.log('Static bundle written to ./docs');
console.log('Enable GitHub Pages: Settings -> Pages -> Source: Deploy from a branch -> main /docs');
console.log('Note: contact form and admin panel require the Node backend (not included).');
