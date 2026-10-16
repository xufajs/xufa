// The part of tap that dotenv's tests use, over @xufa/test: t.test(name, (ct) => ...) is a test, which ends with
// ct.end() or after the assertions of ct.plan(n); t.beforeEach and t.afterEach are hooks; the assertions of t itself
// run at once (the port puts the files that use them in one test).

// tap's t.same: deeply alike, values loosely (1 and '1').
function same(actual, expected) {
  // eslint-disable-next-line eqeqeq
  if (actual == expected) return true;
  if (typeof actual !== 'object' || typeof expected !== 'object' || actual === null || expected === null) return false;
  const keys = Object.keys(actual);
  if (keys.length !== Object.keys(expected).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(expected, key) && same(actual[key], expected[key]));
}
// tap's t.type: an instance of a class, or a value of the type of its name (Object: an object).
function isType(value, type) {
  if (typeof type === 'string') return typeof value === type;
  return value instanceof type || typeof value === type.name.toLowerCase();
}

function assertions(check) {
  return {
    ok: (value, message) => check(() => expect(Boolean(value), message).toBe(true)),
    notOk: (value, message) => check(() => expect(Boolean(value), message).toBe(false)),
    equal: (actual, expected, message) => check(() => expect(actual, message).toBe(expected)),
    not: (actual, expected, message) => check(() => expect(actual, message).not.toBe(expected)),
    same: (actual, expected, message) => check(() => expect(same(actual, expected), message).toBe(true)),
    type: (value, type, message) => check(() => expect(isType(value, type), message).toBe(true)),
  };
}

function makeT(done) {
  let planned = null;
  let count = 0;
  let ended = false;
  const end = (err) => {
    if (ended) return;
    ended = true;
    done(err);
  };
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
    ...assertions(check),
  };
}

const t = {
  test(name, fn) {
    it(name, (done) => fn(makeT(done)));
  },
  // (A test left out on purpose: the port says why above it.)
  skip(name) {
    it.skip(name, () => {});
  },
  beforeEach: (fn) => beforeEach(fn),
  afterEach: (fn) => afterEach(fn),
  plan() {},
  ...assertions((fn) => fn()),
};

module.exports = t;
