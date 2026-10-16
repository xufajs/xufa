// The part of request (2.87) that form-data's tests use. request(url) is a stream of the response to a GET: it has
// httpModule and the path of its URL (what form-data looks at to wait for its length and name its file), says
// 'response', and its data while not paused. request.post(url, callback) sends a form: r.form() is the form (the
// tests set request.prototype.form to make it a FormData of theirs), its headers and length are set, and it is piped
// to the request; callback(err, response, body) at the end of the response.
const http = require('http');
const { Stream } = require('stream');

class Request extends Stream {
  constructor(method, url, callback) {
    super();
    this.method = method;
    this.uri = new URL(url);
    this.path = this.uri.pathname + this.uri.search;
    this.httpModule = http;
    this.headers = {};
    this.readable = true;
    this.writable = true;
    this.callback = callback;
    this.paused = false;
    process.nextTick(() => this.start());
  }

  getHeader(name) {
    return this.headers[name.toLowerCase()];
  }

  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  start() {
    if (this.aborted) return;
    if (!this._form) {
      this.send();
      return;
    }
    const formHeaders = this._form.getHeaders();
    for (const name of Object.keys(formHeaders)) this.setHeader(name, formHeaders[name]);
    this._form.getLength((err, length) => {
      if (!err && !Number.isNaN(length)) this.setHeader('content-length', length);
      this.send();
    });
  }

  send() {
    const req = http.request({
      method: this.method,
      host: this.uri.hostname,
      port: this.uri.port,
      path: this.path,
      headers: this.headers,
    });
    this.req = req;
    req.on('response', (response) => {
      this.response = response;
      if (this.paused) response.pause();
      this.emit('response', response);
      const chunks = [];
      response.on('data', (chunk) => {
        chunks.push(chunk);
        this.emit('data', chunk);
      });
      response.on('end', () => {
        this.emit('end');
        if (this.callback) this.callback(null, response, Buffer.concat(chunks).toString());
      });
    });
    req.on('error', (err) => {
      if (this.callback) this.callback(err);
      else this.emit('error', err);
    });
    if (this._form) this._form.pipe(req);
    else req.end();
  }

  pause() {
    this.paused = true;
    if (this.response) this.response.pause();
  }

  resume() {
    this.paused = false;
    if (this.response) this.response.resume();
  }

  abort() {
    this.aborted = true;
    if (this.req) this.req.destroy();
  }
}

function request(url, callback) {
  return new Request('GET', url, callback);
}
request.post = (url, callback) => new Request('POST', url, callback);
request.Request = Request;
// (What the tests set on request.prototype is on the requests.)
request.prototype = Request.prototype;

module.exports = request;
