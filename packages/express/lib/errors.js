// Errors of HTTP, as Express makes them (http-errors): an Error with status, statusCode and expose (true for 4xx: its
// message may be shown), named after its status (NotFoundError, PayloadTooLargeError...), and the properties given.
import { STATUS_CODES } from 'node:http';

// The name of a status' class of error: 'Payload Too Large' -> 'PayloadTooLargeError'.
function nameOf(status) {
  const words = (STATUS_CODES[status] || '').split(' ').map((word) => word.replace(/[^ _0-9a-z]/gi, ''));
  const name = words.map((word) => word.slice(0, 1).toUpperCase() + word.slice(1)).join('');
  return name.endsWith('Error') ? name : `${name}Error`;
}

// The base of the errors of a status (instanceof HttpError).
export class HttpError extends Error {}

const classes = new Map();

// The class of the errors of a status of 4xx or 5xx (its own name, status and expose on its prototype).
function classOf(status) {
  let ErrorClass = classes.get(status);
  if (ErrorClass === undefined) {
    const name = nameOf(status);
    ErrorClass = {
      [name]: class extends HttpError {
        constructor(message) {
          super(message ?? STATUS_CODES[status]);
          Object.defineProperty(this, 'message', {
            enumerable: true,
            configurable: true,
            writable: true,
            value: this.message,
          });
          Object.defineProperty(this, 'name', { enumerable: false, configurable: true, writable: true, value: name });
        }
      },
    }[name];
    ErrorClass.prototype.status = status;
    ErrorClass.prototype.statusCode = status;
    ErrorClass.prototype.expose = status < 500;
    classes.set(status, ErrorClass);
  }
  return ErrorClass;
}

const isErrorStatus = (status) => status >= 400 && status < 600;

// createError([status], [error or message], [properties]): an error of HTTP. An error given becomes one (its status
// set, or the one it had), with the properties given (but status and statusCode).
export function createError(...args) {
  let error;
  let message;
  let status = 500;
  let props = {};
  args.forEach((arg, i) => {
    if (arg instanceof Error) {
      error = arg;
      status = error.status || error.statusCode || status;
    } else if (typeof arg === 'number' && i === 0) status = arg;
    else if (typeof arg === 'string') message = arg;
    else if (arg !== null && typeof arg === 'object') props = arg;
    else throw new TypeError(`argument #${i + 1} unsupported type ${typeof arg}`);
  });
  if (typeof status !== 'number' || (!STATUS_CODES[status] && !isErrorStatus(status))) status = 500;
  const known = isErrorStatus(status) && STATUS_CODES[status] ? classOf(status) : null;
  const fallback = isErrorStatus(status) ? classOf(Math.floor(status / 100) * 100) : null;
  const ErrorClass = known || fallback;
  if (!error) {
    error = ErrorClass ? new ErrorClass(message) : new Error(message || STATUS_CODES[status]);
    Error.captureStackTrace(error, createError);
  }
  if (!ErrorClass || !(error instanceof ErrorClass) || error.status !== status) {
    error.expose = status < 500;
    error.status = status;
    error.statusCode = status;
  }
  for (const key in props) {
    if (key !== 'status' && key !== 'statusCode') error[key] = props[key];
  }
  return error;
}
