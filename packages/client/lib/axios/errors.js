// axios's errors: AxiosError (a code, the config, the request and the response), CanceledError, the CancelToken of
// the old API, and the checks isCancel() and isAxiosError().
import { isObject, toJSONObject } from './util.js';

const CODES = [
  'ERR_BAD_OPTION_VALUE',
  'ERR_BAD_OPTION',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ERR_NETWORK',
  'ERR_FR_TOO_MANY_REDIRECTS',
  'ERR_DEPRECATED',
  'ERR_BAD_RESPONSE',
  'ERR_BAD_REQUEST',
  'ERR_CANCELED',
  'ERR_NOT_SUPPORT',
  'ERR_INVALID_URL',
];

class AxiosError extends Error {
  /** An error as an AxiosError: its message, name and status, the error itself as `cause`. */
  static from(error, code, config, request, response, customProps) {
    const axiosError = new AxiosError(error.message, code || error.code, config, request, response);
    axiosError.cause = error;
    axiosError.name = error.name;
    if (error.status != null && axiosError.status == null) axiosError.status = error.status;
    if (customProps) Object.assign(axiosError, customProps);
    return axiosError;
  }

  constructor(message, code, config, request, response) {
    super(message);
    // Enumerable, as in axios before 1.13.3 ({ ...error } keeps it).
    Object.defineProperty(this, 'message', { value: message, enumerable: true, writable: true, configurable: true });
    this.name = 'AxiosError';
    this.isAxiosError = true;
    if (code) this.code = code;
    if (config) this.config = config;
    if (request) this.request = request;
    if (response) {
      this.response = response;
      this.status = response.status;
    }
  }

  /** What can be logged or sent: no request and no response (they hold sockets and cycles). */
  toJSON() {
    return {
      message: this.message,
      name: this.name,
      description: this.description,
      number: this.number,
      fileName: this.fileName,
      lineNumber: this.lineNumber,
      columnNumber: this.columnNumber,
      stack: this.stack,
      config: toJSONObject(this.config),
      code: this.code,
      status: this.status,
    };
  }
}

for (const code of CODES) AxiosError[code] = code;

/** A request cancelled (by its signal or CancelToken): code ERR_CANCELED, isCancel() true. */
class CanceledError extends AxiosError {
  constructor(message, config, request) {
    super(message == null ? 'canceled' : message, AxiosError.ERR_CANCELED, config, request);
    this.name = 'CanceledError';
    this.__CANCEL__ = true;
  }
}

/** The cancellation of axios before AbortSignal: new CancelToken((cancel) => ...) or CancelToken.source(). */
class CancelToken {
  constructor(executor) {
    if (typeof executor !== 'function') throw new TypeError('executor must be a function.');
    let resolvePromise;
    this.promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    this.promise.then((reason) => {
      const listeners = this._listeners;
      if (!listeners) return;
      for (let i = listeners.length - 1; i >= 0; i--) listeners[i](reason);
      this._listeners = null;
    });
    // token.promise.then(fn) is a listener that can be removed: .cancel() on what it returns.
    this.promise.then = (onfulfilled) => {
      let listener;
      const promise = new Promise((resolve) => {
        listener = resolve;
        this.subscribe(resolve);
      }).then(onfulfilled);
      promise.cancel = () => this.unsubscribe(listener);
      return promise;
    };
    executor((message, config, request) => {
      if (this.reason) return;
      this.reason = new CanceledError(message, config, request);
      resolvePromise(this.reason);
    });
  }

  throwIfRequested() {
    if (this.reason) throw this.reason;
  }

  subscribe(listener) {
    if (this.reason) {
      listener(this.reason);
      return;
    }
    if (this._listeners) this._listeners.push(listener);
    else this._listeners = [listener];
  }

  unsubscribe(listener) {
    if (!this._listeners) return;
    const index = this._listeners.indexOf(listener);
    if (index !== -1) this._listeners.splice(index, 1);
  }

  /** An AbortSignal aborted when the token is cancelled (its unsubscribe() lets go of the token). */
  toAbortSignal() {
    const controller = new AbortController();
    const abort = (reason) => controller.abort(reason);
    this.subscribe(abort);
    controller.signal.unsubscribe = () => this.unsubscribe(abort);
    return controller.signal;
  }

  static source() {
    let cancel;
    const token = new CancelToken((c) => {
      cancel = c;
    });
    return { token, cancel };
  }
}

const isCancel = (value) => !!(value && value.__CANCEL__);

const isAxiosError = (payload) => isObject(payload) && payload.isAxiosError === true;

export { AxiosError, CanceledError, CancelToken, isCancel, isAxiosError };
