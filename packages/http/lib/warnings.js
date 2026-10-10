// Process warnings, each emitted once unless unlimited (what process-warning does for fastify), and spyWarning()
// to watch them in tests.
import { format } from 'node:util';

const kWarningFn = Symbol('xufa.warning.fn');
const kWarningSpyData = Symbol('xufa.warning.spyData');

function createWarning({ name, code, message, unlimited = false } = {}) {
  if (!name) throw new Error('Warning name must not be empty');
  if (!code) throw new Error('Warning code must not be empty');
  if (!message) throw new Error('Warning message must not be empty');
  if (typeof unlimited !== 'boolean') throw new Error('Warning opts.unlimited must be a boolean');
  const upperCode = code.toUpperCase();

  // Returns whether the warning was emitted.
  function emit(a, b, c) {
    if (warning.emitted === true && warning.unlimited !== true) return false;
    warning.emitted = true;
    process.emitWarning(warning.format(a, b, c), warning.name, warning.code);
    return true;
  }

  // A function named as the warning (its name is the type of the warning emitted).
  const container = {
    [name](a, b, c) {
      return warning[kWarningFn](a, b, c);
    },
  };
  const warning = container[name];
  warning.emitted = false;
  warning.message = message;
  warning.unlimited = unlimited;
  warning.code = upperCode;
  warning[kWarningFn] = emit;
  warning[kWarningSpyData] = null;
  warning.format = function formatWarning(a, b, c) {
    if (a && b && c) return format(message, a, b, c);
    if (a && b) return format(message, a, b);
    if (a) return format(message, a);
    return message;
  };
  return warning;
}

function createDeprecation(params) {
  return createWarning({ ...params, name: 'DeprecationWarning' });
}

// Records the calls of a warning: { calls: [{ arguments, result }], callCount(), reset(), restore() }.
function spyWarning(warning) {
  if (warning[kWarningSpyData] === null) {
    const original = warning[kWarningFn];
    const spyData = {
      calls: [],
      callCount() {
        return spyData.calls.length;
      },
      reset() {
        warning.emitted = false;
        spyData.calls.length = 0;
      },
      restore() {
        spyData.reset();
        warning[kWarningFn] = original;
        warning[kWarningSpyData] = null;
      },
    };
    warning[kWarningFn] = function spied(a, b, c) {
      // Warnings are called as fn(a, b, c): trailing undefined arguments are not recorded.
      const args = c ? [a, b, c] : b ? [a, b] : a ? [a] : [];
      spyData.calls.push({ arguments: args, result: original(a, b, c) });
    };
    warning[kWarningSpyData] = spyData;
  }
  return warning[kWarningSpyData];
}

const XUFAWRN001 = createWarning({
  name: 'XufaWarning',
  code: 'XUFAWRN001',
  message: 'The %s schema for %s: %s is missing. This may indicate the schema is not well specified.',
  unlimited: true,
});

const XUFAWRN003 = createWarning({
  name: 'XufaWarning',
  code: 'XUFAWRN003',
  message: 'The %s mixes async and callback styles that may lead to unhandled rejections. Please use only one of them.',
  unlimited: true,
});

const XUFASEC001 = createWarning({
  name: 'XufaSecurity',
  code: 'XUFASEC001',
  message:
    'You are using /%s/ Content-Type which may be vulnerable to CORS attack. Please make sure your RegExp start with "^" or include ";?" to proper detection of the essence MIME type.',
  unlimited: true,
});

const XUFASEC002 = createWarning({
  name: 'XufaSecurity',
  code: 'XUFASEC002',
  message:
    'The headers schema for %s: %s references an external $ref (%s) that is not case-normalized. Header names in the referenced schema keep their original case and will not match the lowercased request headers, so case-insensitive assertions such as required and dependencies may not apply. Inline the header schema instead of referencing it with an external $ref.',
  unlimited: true,
});

export { createWarning, createDeprecation, spyWarning, XUFAWRN001, XUFAWRN003, XUFASEC001, XUFASEC002 };
