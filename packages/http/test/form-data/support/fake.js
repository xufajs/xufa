// The part of fake that form-data's tests use: fake.create(), its callback(name) (a function that records its calls)
// and expectAnytime(callback, args): the process fails at its exit if the callback was not called with those
// arguments. expectAnytime gives { calls }, the calls of the callback so far.
const assert = require('assert');
const util = require('util');

function create() {
  const expectations = [];
  process.on('exit', () => {
    for (const { callback, args } of expectations) {
      const called = callback.calls.some((call) => util.isDeepStrictEqual(call, args));
      assert.ok(called, `fake: ${callback.fakeName} was not called with ${util.inspect(args)}`);
    }
  });
  return {
    callback(name) {
      const callback = (...args) => {
        callback.calls.push(args);
      };
      callback.calls = [];
      callback.fakeName = name;
      return callback;
    },
    // (Its calls so far are in what it gives.)
    expectAnytime(callback, args = []) {
      expectations.push({ callback, args });
      return { calls: callback.calls };
    },
  };
}

module.exports = { create };
