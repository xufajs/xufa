// Copies the tests of the DOM standard from web-platform-tests (BSD-3-Clause) to packages/html/test/wpt, where
// test/wpt.test.js runs them on @xufa/html's DOM: the folders dom/nodes, dom/traversal, dom/collections and dom/lists
// whole (tests, their scripts and the documents they load), the files of the suite they load by absolute paths
// (/resources/testharness.js, /common/..., dom/common.js), WPT's license, and the commit they were taken at.
//
// node tools/port-wpt/port.js <wpt>  (a checkout of github.com/web-platform-tests/wpt; dom/, resources/ and common/
// are enough)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [wpt] = process.argv.slice(2);
if (!wpt) {
  console.error('Usage: node tools/port-wpt/port.js <wpt>');
  process.exit(1);
}
const OUT = path.join(import.meta.dirname, '../../packages/html/test/wpt');
const FOLDERS = ['dom/nodes', 'dom/traversal', 'dom/collections', 'dom/lists'];

// The files a test or script names by an absolute path of the suite: <script src="/...">, META: script=/...,
// importScripts and fetches of /common or /resources.
const ABSOLUTE =
  /(?:src|href)=["']?(\/[\w/.-]+)|META:\s*script=(\/[\w/.-]+)|["'](\/(?:common|resources|dom)\/[\w/.-]+)["']/g;

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

fs.rmSync(OUT, { recursive: true, force: true });
const copied = new Set();
const pending = [];
const copy = (relative) => {
  const from = path.join(wpt, relative);
  if (copied.has(relative) || !fs.existsSync(from) || !fs.statSync(from).isFile()) return;
  copied.add(relative);
  const to = path.join(OUT, relative);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  if (/\.(html|xhtml|xml|svg|js)$/.test(relative)) pending.push(relative);
};

FOLDERS.forEach((folder) =>
  walk(path.join(wpt, folder)).forEach((file) => copy(path.relative(wpt, file).split(path.sep).join('/')))
);
['resources/testharness.js', 'dom/common.js', 'dom/constants.js', 'LICENSE.md'].forEach(copy);
// What the copied files load from the rest of the suite (and what those load).
while (pending.length > 0) {
  const text = fs.readFileSync(path.join(wpt, pending.pop()), 'utf8');
  for (const match of text.matchAll(ABSOLUTE)) {
    const absolute = match[1] ?? match[2] ?? match[3];
    if (!absolute.endsWith('testharnessreport.js')) copy(absolute.slice(1));
  }
}
const commit = execFileSync('git', ['-C', wpt, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
fs.writeFileSync(path.join(OUT, 'COMMIT'), `${commit}\n`);
console.log(
  `port-wpt: ${copied.size} files of web-platform-tests ${commit.slice(0, 10)} in ${path.relative(process.cwd(), OUT)}`
);
