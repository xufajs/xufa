// @xufa/inject: calls a request handler with a fake request and response, without a socket, and gives the response.
//
//   const res = await inject(handler, { method: 'POST', url: '/users', payload: { name: 'ada' } });
//   res.statusCode, res.headers, res.payload, res.json(), res.cookies
//
// The API of light-my-request: options or a chain (inject(handler).post('/users').payload(...).end()), a callback
// or a promise.
const Request = require('./lib/request');
const Response = require('./lib/response');
const { validateOptions } = require('./lib/options');

const ALREADY_INVOKED = 'The dispatch function has already been invoked';

// Streams of the old API (data events without _readableState) are read whole before dispatching.
function readOldStream(req, next) {
  const { payload } = req._lightMyRequest;
  if (!payload || payload._readableState || typeof payload.resume !== 'function') {
    next();
    return;
  }
  const chunks = [];
  payload.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  payload.on('end', () => {
    const body = Buffer.concat(chunks);
    req.headers['content-length'] = req.headers['content-length'] || String(body.length);
    delete req.headers['transfer-encoding'];
    req._lightMyRequest.payload = body;
    next();
  });
  payload.resume();
}

function makeRequest(dispatch, server, req, res) {
  req.once('error', function onError(err) {
    if (this.destroyed) res.destroy(err);
  });
  req.once('close', function onClose() {
    if (this.destroyed && !this._error) res.destroy();
  });
  readOldStream(req, () => dispatch.call(server, req, res));
}

function doInject(dispatch, opts, callback) {
  const options = typeof opts === 'string' ? { url: opts } : opts;
  if (options.validate !== false) {
    if (typeof dispatch !== 'function') {
      const err = new Error('dispatchFunc should be a function');
      err.name = 'AssertionError';
      err.code = 'ERR_ASSERTION';
      throw err;
    }
    const errors = validateOptions(options);
    if (errors.length > 0) throw new Error(errors.join(','));
  }
  const server = options.server || {};
  const RequestClass = options.Request ? Request.CustomRequest : Request;

  // Express apps: their requests and responses get the fake ones as prototypes.
  if (dispatch.request && dispatch.request.app === dispatch) {
    Object.setPrototypeOf(Object.getPrototypeOf(dispatch.request), RequestClass.prototype);
    Object.setPrototypeOf(Object.getPrototypeOf(dispatch.response), Response.prototype);
  }

  if (typeof callback === 'function') {
    const req = new RequestClass(options);
    const res = new Response(req, callback);
    makeRequest(dispatch, server, req, res);
    return undefined;
  }
  return new Promise((resolve, reject) => {
    const req = new RequestClass(options);
    const res = new Response(req, resolve, reject);
    makeRequest(dispatch, server, req, res);
  });
}

function Chain(dispatch, option) {
  this.option = typeof option === 'string' ? { url: option } : { ...option };
  this.dispatch = dispatch;
  this._hasInvoked = false;
  this._promise = null;
  if (this.option.autoStart !== false) {
    process.nextTick(() => {
      if (!this._hasInvoked) this.end();
    });
  }
}

for (const method of ['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace']) {
  Chain.prototype[method] = function setMethod(url) {
    if (this._hasInvoked === true || this._promise) throw new Error(ALREADY_INVOKED);
    this.option.url = url;
    this.option.method = method.toUpperCase();
    return this;
  };
}

for (const key of ['body', 'cookies', 'headers', 'payload', 'query']) {
  Chain.prototype[key] = function setOption(value) {
    if (this._hasInvoked === true || this._promise) throw new Error(ALREADY_INVOKED);
    this.option[key] = value;
    return this;
  };
}

Chain.prototype.end = function end(callback) {
  if (this._hasInvoked === true || this._promise) throw new Error(ALREADY_INVOKED);
  this._hasInvoked = true;
  if (typeof callback === 'function') {
    doInject(this.dispatch, this.option, callback);
    return undefined;
  }
  this._promise = doInject(this.dispatch, this.option);
  return this._promise;
};

for (const method of Object.getOwnPropertyNames(Promise.prototype)) {
  if (method === 'constructor') continue;
  Chain.prototype[method] = function promiseMethod(...args) {
    if (!this._promise) {
      if (this._hasInvoked === true) throw new Error(ALREADY_INVOKED);
      this._hasInvoked = true;
      this._promise = doInject(this.dispatch, this.option);
    }
    return this._promise[method](...args);
  };
}

function inject(dispatch, options, callback) {
  if (callback === undefined) return new Chain(dispatch, options);
  return doInject(dispatch, options, callback);
}

function isInjection(obj) {
  return (
    obj instanceof Request ||
    obj instanceof Response ||
    (obj != null && obj.constructor != null && obj.constructor.name === '_CustomLMRRequest')
  );
}

module.exports = inject;
module.exports.default = inject;
module.exports.inject = inject;
module.exports.isInjection = isInjection;
module.exports.Request = Request;
module.exports.Response = Response;
