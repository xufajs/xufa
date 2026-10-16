// Writes packages/html/test/wpt-expected.json: what the tests of web-platform-tests (test/wpt, tools/port-wpt/port.js)
// give on @xufa/html's DOM now, where it is not a pass: the subtests that fail, the pages whose harness does not end
// OK, and the pages left out of the run (they never report: they wait for what this DOM does not have), each with its
// reason. test/wpt.test.js expects exactly that: a pass that starts failing fails it, and so does a failure that starts
// passing (this is run again, and the list gets shorter).
//
// The reasons come from PAGES and RULES (a missing feature, by the test's message or source), written again on each
// run; the others are "bug: ...", to be fixed or given a rule.
//
// node tools/port-wpt/expectations.js
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, testFiles, runPages } from '../../packages/html/test/support/wpt.js';

const FILE = path.join(import.meta.dirname, '../../packages/html/test/wpt-expected.json');

// [reason, test of the message (or name) of the subtest, test of the source of the page and its scripts (optional)]
const RULES = [
  ['no iframes (another browsing context)', /contentDocument|contentWindow|documentElement'\)|frames\[|iframe/i],
  ['no iframes (another browsing context)', /./, /<iframe|createElement\(["']iframe/],
  ['no MutationObserver', /MutationObserver|takeRecords/],
  ['no Range', /createRange|\bRange\b|StaticRange|getSelection/],
  ['no events', /addEventListener|dispatchEvent|createEvent|\bEvent\b|EventTarget|CustomEvent|onload/],
  ['no shadow DOM', /attachShadow|shadowRoot|ShadowRoot|slot/i],
  ['no custom elements', /customElements|CustomElement/],
  ['no moveBefore()', /moveBefore/],
  [
    'no layout, styles or animations',
    /requestAnimationFrame|getComputedStyle|offset(Width|Height)|animation|transition/i,
  ],
  ['no styles (element.style)', /setting '(display|visibility)'|\.style\b|CSSStyleDeclaration/],
  ['no focus or user input (testdriver)', /focus|test_driver|testdriver/i],
  ['no attributes of processing instructions (a proposal)', /pi\.|processing instruction attribute/i],
  [
    'no documents of other encodings (they are loaded in frames)',
    /characterSet|charset|inputEncoding/,
    /characterset-helper/,
  ],
  ['no XPath', /evaluate|XPath/],
  ['no scripts run (no browsing context)', /./, /insertion-removing-steps|<script id=|script\.text|scriptRan/],
  [
    'selectors of states of forms and user input (:enabled, :disabled, :active, :invalid...): no forms or input here',
    /:(enabled|disabled|hover|active|focus|invalid|checked|link|visited)/,
    /./,
  ],
];

// Reasons of every failure of a page, or of the pages of a folder (a path ending in /).
const PAGES = {
  'dom/traversal/NodeIterator-removal.html':
    'only the 32 most recent NodeIterators of a document are live (a bound: they are not weak references); the ' +
    'page makes hundreds',
  'dom/nodes/Element-firstElementChild-entity.svg': 'no entities of DTDs in the XML parser',
  'dom/nodes/Element-firstElementChild-entity-xhtml.xhtml': 'no entities of DTDs in the XML parser',
  'dom/nodes/processing-instruction-attributes.html': 'no attributes of processing instructions (a proposal)',
  'dom/nodes/getElementById-namespaced-id.html': 'no form association (input.form)',
  'dom/nodes/moveBefore/': 'no moveBefore()',
  'dom/nodes/ProcessingInstruction-escapes-1.xhtml':
    'no stylesheets (the xml-stylesheet instruction is read through one)',
  'dom/nodes/MutationObserver-textContent.html': 'no MutationObserver',
  'dom/nodes/insertion-removing-steps/': 'no scripts run (no browsing context)',
};
// More missing features, by the message.
RULES.push(
  ['no XMLHttpRequest', /XMLHttpRequest/],
  ['documents have no URL but about:blank (no browsing context)', /URL parsing|document\.URL|documentURI|<base>/],
  ['no layout, styles or animations', /getBoundingClientRect/],
  ['no document.write()', /\.write is not a function/]
);

function reasonOf(message, source, file) {
  const page = Object.keys(PAGES).find((key) => (key.endsWith('/') ? file.startsWith(key) : file === key));
  if (page) return PAGES[page];
  // A name the page reads as a global, that is an element's id there: the named properties of window.
  const global = /^(\w+) is not defined/.exec(message);
  if (global && new RegExp(`id=["']?${global[1]}\\b`).test(source)) {
    return 'no named properties of window (elements as globals, by their id)';
  }
  const rule = RULES.find(([, test, from]) => test.test(message) && (!from || from.test(source)));
  return rule ? rule[0] : `bug: ${message.slice(0, 160)}`;
}

const files = testFiles();
const results = await runPages(files);
const expected = { commit: fs.readFileSync(path.join(ROOT, 'COMMIT'), 'utf8').trim(), skip: {}, files: {} };
for (const [file, result] of Object.entries(results)) {
  // (The page and the scripts of its folder it loads.)
  const page = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const scripts = [...page.matchAll(/src=["']?([\w.-][\w./-]*\.js)/g)]
    .map(([, src]) => path.join(ROOT, path.dirname(file), src))
    .filter((script) => fs.existsSync(script));
  const source = [page, ...scripts.map((script) => fs.readFileSync(script, 'utf8'))].join('\n');
  const entry = {};
  if (!result.harness.startsWith('OK')) {
    // (A page that never reports: left out of the runs, as its reason says.)
    if (result.harness.startsWith('TIMEOUT (of the page)')) {
      expected.skip[file] = reasonOf(result.harness, source, file);
      continue;
    }
    entry.harness = result.harness;
    entry.reason = reasonOf(result.harness, source, file);
  }
  const fail = {};
  for (const test of result.tests.filter(({ status }) => status !== 'PASS')) {
    fail[test.name] = reasonOf(`${test.message ?? test.status} ${test.name}`, source, file);
  }
  if (Object.keys(fail).length > 0) entry.fail = fail;
  if (Object.keys(entry).length > 0) expected.files[file] = entry;
}
fs.writeFileSync(FILE, `${JSON.stringify(expected, null, 2)}\n`);
const counts = {};
let passing = 0;
let failing = 0;
for (const result of Object.values(results)) {
  passing += result.tests.filter(({ status }) => status === 'PASS').length;
  failing += result.tests.filter(({ status }) => status !== 'PASS').length;
}
for (const entry of Object.values(expected.files)) {
  for (const reason of Object.values(entry.fail ?? {})) {
    const key = reason.startsWith('bug:') ? 'bug' : reason;
    counts[key] = (counts[key] ?? 0) + 1;
  }
}
console.log(
  `${files.length} pages (${Object.keys(expected.skip).length} left out): ${passing} subtests pass, ${failing} fail:`
);
Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([reason, count]) => console.log(`  ${count}  ${reason}`));
process.exit(0);
