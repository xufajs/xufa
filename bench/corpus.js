'use strict';

// Code written by others, for the checks of @xufa/lint against ESLint and prettier beyond this repository
// (bench/format-corpus.js, bench/lint-corpus.js): files of the packages installed for the repository
// (node_modules/.pnpm), the same every time. Of each package, at most PER_PACKAGE files of each kind (JavaScript,
// TypeScript, declarations, markdown, JSON), by name; not minified (lines of 500 characters on average), not below 200
// bytes or above 200 KB, each text once.
//
//   corpus() -> { js: [file...], ts: [...], dts: [...], md: [...], json: [...] }

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const STORE = path.join(__dirname, '../node_modules/.pnpm');
const PER_PACKAGE = 8;
const KINDS = [
  ['dts', /\.d\.[cm]?ts$/],
  ['js', /\.(?:[cm]?js|jsx)$/],
  ['ts', /\.(?:[cm]?ts|tsx)$/],
  ['md', /\.md$/],
  ['json', /\.json$/],
];
const SKIPPED = new Set(['node_modules', '.git', 'test-fixtures', 'fixtures', '__fixtures__']);

const kindOf = (file) => KINDS.find(([, pattern]) => pattern.test(file))?.[0];

// The files of a package, by name (folders walked; its own node_modules not).
function filesOf(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory() && !SKIPPED.has(entry.name)) filesOf(file, out);
    else if (entry.isFile() && kindOf(entry.name)) out.push(file);
  }
  return out;
}

// The folders of the packages of the store: .pnpm/<id>/node_modules/<name> (and @scope/<name>).
function packages() {
  const out = [];
  for (const id of fs.readdirSync(STORE).sort()) {
    const modules = path.join(STORE, id, 'node_modules');
    if (!fs.existsSync(modules)) continue;
    // The package of the id: its name is the id before its version.
    const name = id.replace(/^(@[^+]+)\+/, '$1/').replace(/@[^@/]+$/, '');
    const dir = path.join(modules, name);
    if (fs.existsSync(dir) && !fs.lstatSync(dir).isSymbolicLink()) out.push(dir);
  }
  return out;
}

let cached;
function corpus() {
  if (cached) return cached;
  const seen = new Set();
  cached = Object.fromEntries(KINDS.map(([kind]) => [kind, []]));
  for (const dir of packages()) {
    const taken = {};
    for (const file of filesOf(dir)) {
      const kind = kindOf(file);
      if ((taken[kind] ?? 0) >= PER_PACKAGE) continue;
      const { size } = fs.statSync(file);
      if (size < 200 || size > 200 * 1024) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (text.length / (text.split('\n').length || 1) > 500) continue;
      const hash = crypto.createHash('sha1').update(text).digest('hex');
      if (seen.has(hash)) continue;
      seen.add(hash);
      taken[kind] = (taken[kind] ?? 0) + 1;
      cached[kind].push(file);
    }
  }
  return cached;
}

module.exports = { corpus };

if (require.main === module) {
  const files = corpus();
  console.log(
    Object.entries(files)
      .map(([kind, list]) => `${kind} ${list.length}`)
      .join(', ')
  );
}
