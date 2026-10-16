// The tests of the DOM standard in web-platform-tests (test/wpt, copied by tools/port-wpt/port.js: dom/nodes,
// dom/traversal, dom/collections, dom/lists) on @xufa/html's DOM, each page as a browser runs it (test/support/wpt.js):
// every subtest passes but those test/wpt-expected.json lists, each with its reason (no frames, events, Range or
// MutationObserver in this DOM; the rest are bugs to fix). A subtest listed that passes fails too: run
// tools/port-wpt/expectations.js again, and the list is shorter. The pages listed in its `skip` (they wait for what
// never comes) run with XUFA_WPT_ALL=1.
import fs from 'node:fs';
import path from 'node:path';
import { testFiles, runPages } from './support/wpt.js';

const expected = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'wpt-expected.json'), 'utf8'));
const files = testFiles().filter((file) => process.env.XUFA_WPT_ALL || !expected.skip[file]);

describe('web-platform-tests: the DOM', () => {
  let results;
  beforeAll(async () => {
    // (The pages expected to time out, waiting for frames or events, wait 1 s, not 10; the others are given 30 s: the
    // pages run 8 at a time in one thread, and some loop for seconds.)
    const multipliers = new Map(
      files.map((file) => [file, expected.files[file]?.harness?.startsWith('TIMEOUT') ? 0.1 : 3])
    );
    results = await runPages(files, { multipliers });
  }, 600000);

  it.each(files)('%s', (file) => {
    const result = results[file];
    const entry = expected.files[file] ?? {};
    expect(result.harness).toBe(entry.harness ?? 'OK');
    const failing = result.tests.filter(({ status }) => status !== 'PASS').map(({ name }) => name);
    expect(failing.sort()).toEqual(Object.keys(entry.fail ?? {}).sort());
  });
});
