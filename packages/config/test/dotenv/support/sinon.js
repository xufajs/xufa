// The part of sinon that dotenv's tests use: sinon.stub(object, name) puts a stub in the place of a method (or of a
// value, with .value()); it returns nothing, a value (.returns), throws (.throws) or calls a function (.callsFake), and
// records its calls (args, callCount, called, notCalled, getCalls()). .restore() puts back what was there.
function stub(object, name) {
  const had = Object.prototype.hasOwnProperty.call(object, name);
  const original = object[name];
  let behavior = () => undefined;
  const calls = [];
  const fake = function (...args) {
    calls.push(args);
    return behavior.apply(this, args);
  };
  Object.defineProperties(fake, {
    args: { get: () => calls },
    callCount: { get: () => calls.length },
    called: { get: () => calls.length > 0 },
    notCalled: { get: () => calls.length === 0 },
  });
  Object.assign(fake, {
    getCalls: () => calls.map((args) => ({ args })),
    returns(value) {
      behavior = () => value;
      return fake;
    },
    throws(error) {
      behavior = () => {
        throw error || new Error('Error');
      };
      return fake;
    },
    callsFake(fn) {
      behavior = fn;
      return fake;
    },
    value(value) {
      object[name] = value;
      return fake;
    },
    restore() {
      if (had) object[name] = original;
      else delete object[name];
    },
  });
  object[name] = fake;
  return fake;
}

module.exports = { stub };
