// The part of tape and tap that the suites of jws and jwa use, over vyntra: test(name, (t) => ...) is a test, whose t
// asserts with expect() and ends with t.end(), or after the assertions of t.plan(n).
const util = require('node:util');

function makeT(done) {
  let planned = null;
  let count = 0;
  let ended = false;
  const end = (err) => {
    if (ended) return;
    ended = true;
    done(err);
  };
  // An assertion: its failure ends the test with the error (assertions also run in callbacks of events).
  const check = (fn) => {
    if (ended) return;
    try {
      fn();
    } catch (err) {
      end(err);
      return;
    }
    count += 1;
    if (planned !== null && count === planned) end();
  };
  return {
    plan(n) {
      planned = n;
    },
    end: () => end(),
    ok: (value, message) => check(() => expect(Boolean(value), message).toBe(true)),
    true: (value, message) => check(() => expect(value, message).toBe(true)),
    notOk: (value, message) => check(() => expect(Boolean(value), message).toBe(false)),
    equal: (actual, expected, message) => check(() => expect(actual, message).toBe(expected)),
    same: (actual, expected, message) => check(() => expect(actual, message).toEqual(expected)),
    equivalent: (actual, expected, message) =>
      check(() => expect(util.isDeepStrictEqual(actual, expected), message).toBe(true)),
    throws: (fn, message) => check(() => expect(fn, message).toThrow()),
    fail: (message) => end(new Error(message || 'failed')),
  };
}

function test(name, fn) {
  it(name, (done) => fn(makeT(done)));
}

test.test = test;
module.exports = test;
