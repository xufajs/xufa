// node:test's t.mock.method(object, name, implementation), as helmet's tests use it: the method replaced, its calls
// counted ({ mock: { callCount(), calls: [{ arguments }] } }), and put back by restoreMocks() (after each test).
const restorers = [];

export function mockMethod(object, name, implementation) {
  const original = object[name];
  const calls = [];
  object[name] = function (...args) {
    calls.push({ arguments: args, this: this });
    return implementation.apply(this, args);
  };
  restorers.push(() => {
    object[name] = original;
  });
  return { mock: { callCount: () => calls.length, calls } };
}

export function restoreMocks() {
  while (restorers.length) restorers.pop()();
}
