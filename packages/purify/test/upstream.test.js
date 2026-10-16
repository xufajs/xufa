// DOMPurify's tests (upstream/test-suite.cjs and the XSS vectors of upstream/fixtures, ported by tools/port-purify) on
// @xufa/purify, as DOMPurify runs them on jsdom (test/jsdom-node.js): QUnit's tests are tests of @xufa/test. Skipped,
// with the reason: the XSS tests that insert what DOMPurify gives into a page and wait for alert() (native, jQuery,
// document.write), as the DOM of @xufa/html runs no scripts; and DOMPurify's bootstrap tests (not ported), which load
// it into a page by a <script>.
import nodeAssert from 'node:assert';
import { createRequire } from 'node:module';
import { createWindow } from '@xufa/html/dom';
import DOMPurify from '../index.js';
import fixtures from './upstream/fixtures/expect.mjs';

const require = createRequire(import.meta.url);
const SKIPPED = [[/^XSS test: /, 'the DOM of @xufa/html runs no scripts: it checks that a browser does not run them']];

// QUnit's assert, on node:assert: contains(actual, expected) is DOMPurify's (expected.indexOf(actual) > -1).
function makeAssert() {
  const pending = [];
  return {
    pending,
    ok: (value, message) => nodeAssert.ok(value, message),
    notOk: (value, message) => nodeAssert.ok(!value, message),
    equal: (actual, expected, message) => nodeAssert.equal(actual, expected, message),
    notEqual: (actual, expected, message) => nodeAssert.notEqual(actual, expected, message),
    strictEqual: (actual, expected, message) => nodeAssert.strictEqual(actual, expected, message),
    notStrictEqual: (actual, expected, message) => nodeAssert.notStrictEqual(actual, expected, message),
    deepEqual: (actual, expected, message) => nodeAssert.deepStrictEqual(actual, expected, message),
    propEqual: (actual, expected, message) => nodeAssert.deepStrictEqual({ ...actual }, { ...expected }, message),
    throws: (fn, expected, message) =>
      expected === undefined || typeof expected === 'string'
        ? nodeAssert.throws(fn, message ?? expected)
        : nodeAssert.throws(fn, expected, message),
    contains: (actual, expected, message) =>
      nodeAssert.ok(expected.indexOf(actual) > -1, `${message}\nactual: ${JSON.stringify(actual)}\nexpected: ${JSON.stringify(expected)}`),
    expect() {},
    async() {
      let done;
      pending.push(new Promise((resolve) => (done = resolve)));
      return done;
    },
  };
}

globalThis.QUnit = {
  module() {},
  test(name, callback) {
    const skip = SKIPPED.find(([pattern]) => pattern.test(name));
    if (skip) {
      it.skip(`${name} (${skip[1]})`, () => {});
      return;
    }
    it(name, async () => {
      const assert = makeAssert();
      await callback(assert);
      await Promise.all(assert.pending);
    });
  },
};

const window = createWindow('<html><head></head><body><div id="qunit-fixture"></div></body></html>');
const testSuite = require('./upstream/test-suite.cjs');

describe("DOMPurify's tests", () => {
  testSuite(
    DOMPurify(window),
    window,
    fixtures,
    fixtures.filter((fixture) => /alert/.test(fixture.payload))
  );
});
