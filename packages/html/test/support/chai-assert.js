// The part of chai's assert that parse5's tests use, on node:assert: deepEqual is deep and strict in chai, and
// throws(fn, text) means an error whose message has the text (a RegExp: matches it; a class: an instance of it).
import nodeAssert from 'node:assert';

function throws(fn, expected, message) {
  if (typeof expected === 'string') {
    return nodeAssert.throws(fn, (err) => String(err && err.message).includes(expected), message);
  }
  return expected === undefined ? nodeAssert.throws(fn) : nodeAssert.throws(fn, expected, message);
}

const assert = (value, message) => nodeAssert.ok(value, message);
Object.assign(assert, {
  ok: nodeAssert.ok,
  equal: nodeAssert.equal,
  strictEqual: nodeAssert.strictEqual,
  notStrictEqual: nodeAssert.notStrictEqual,
  deepEqual: nodeAssert.deepStrictEqual,
  deepStrictEqual: nodeAssert.deepStrictEqual,
  throws,
  doesNotThrow: nodeAssert.doesNotThrow,
});

export { assert };
