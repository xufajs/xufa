// @xufa/errors: classes of errors with a code, a status code and a message formatted with the arguments given.
//
//   const NotFound = createError('APP_NOT_FOUND', 'User %s not found', 404);
//   throw new NotFound('ada'); // or NotFound('ada'); err.code, err.statusCode, err.message
import { format } from 'node:util';

const genericSym = Symbol.for('xufa-error-generic');
const GENERIC_CODE = 'XUFA_ERR';

function toString() {
  return `${this.name} [${this.code}]: ${this.message}`;
}

function defineHidden(target, key, value) {
  Object.defineProperty(target, key, { value, enumerable: false, writable: false, configurable: false });
}

function createError(code, message, statusCode = 500, Base = Error, captureStackTrace = createError.captureStackTrace) {
  const generic = code === genericSym;
  const errorCode = generic ? GENERIC_CODE : code;
  if (!errorCode) throw new Error('Error code must not be empty');
  if (!message) throw new Error('Error message must not be empty');
  const upperCode = errorCode.toUpperCase();
  const status = statusCode || undefined;
  const specificSym = Symbol.for(`xufa-error ${upperCode}`);
  // Messages without placeholders do not go through util.format, unless arguments have to be appended.
  const plain = message.indexOf('%') === -1;

  function XufaError(...args) {
    if (!new.target) return new XufaError(...args);
    this.code = upperCode;
    this.name = 'XufaError';
    this.statusCode = status;
    const last = args.length - 1;
    if (last !== -1 && args[last] && typeof args[last] === 'object' && 'cause' in args[last]) {
      this.cause = args.pop().cause;
    }
    this.message = plain && args.length === 0 ? message : format(message, ...args);
    if (Error.stackTraceLimit && captureStackTrace) Error.captureStackTrace(this, XufaError);
  }

  XufaError.prototype = Object.create(Base.prototype, {
    constructor: { value: XufaError, enumerable: false, writable: true, configurable: true },
  });
  defineHidden(XufaError.prototype, genericSym, true);
  defineHidden(XufaError.prototype, specificSym, true);
  const instanceSym = generic ? genericSym : specificSym;
  defineHidden(XufaError, Symbol.hasInstance, (instance) => Boolean(instance && instance[instanceSym]));
  XufaError.prototype[Symbol.toStringTag] = 'Error';
  XufaError.prototype.toString = toString;
  return XufaError;
}

createError.captureStackTrace = true;

const XufaError = createError(genericSym, 'Xufa Error', 500, Error);

export default createError;
createError.createError = createError;
createError.XufaError = XufaError;
createError.default = createError;

export { createError as 'module.exports' };

export { createError as createError, XufaError };
