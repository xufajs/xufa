// The texts of the page that are translated: the first argument of each t() and tj(), the second and third of each
// tn() in client/src (literal texts only: a test checks that every one has its translation in each language), and
// the words of the statuses the page shows (t(status) of statusLabel).
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, 'src');

// Statuses of jobs, runs, steps, schedules and health (format.js).
const STATUSES = [
  'pending',
  'running',
  'done',
  'failed',
  'retrying',
  'cancelled',
  'skipped',
  'waiting',
  'paused',
  'ok',
  'up',
  'down',
  'degraded',
  'ready',
  'error',
];

const STRING = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`;
const unquote = (match) => (match[1] !== undefined ? match[1] : match[2]).replace(/\\(.)/g, '$1');

function filesOf(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesOf(full);
    return /\.(jsx?|mjs)$/.test(entry.name) ? [full] : [];
  });
}

// Texts of the document of the page (lib/page.js), on the server.
const SERVER = ['The admin needs JavaScript.', 'Log in · {title}'];

// The texts: a sorted list.
function texts() {
  const found = new Set([...STATUSES, ...SERVER]);
  const single = new RegExp(String.raw`\bt[j]?\(\s*(?:${STRING})`, 'g');
  const plural = new RegExp(String.raw`\btn\(\s*[^,]+,\s*(?:${STRING})\s*,\s*(?:${STRING})`, 'g');
  // (i18n.js itself has examples in its comments.)
  for (const file of filesOf(SRC).filter((name) => path.basename(name) !== 'i18n.js')) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(single)) found.add(unquote(match));
    for (const match of source.matchAll(plural)) {
      found.add(match[1] !== undefined ? match[1] : match[2]);
      found.add(match[3] !== undefined ? match[3] : match[4]);
    }
  }
  return [...found].sort();
}

if (process.argv[1] === import.meta.filename) console.log(JSON.stringify(texts(), null, 2));

export { texts, STATUSES, SERVER };
