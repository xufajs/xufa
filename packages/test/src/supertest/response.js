'use strict';

// The response of a request, as superagent (10) gives it: status and its flags, headers, type and the parameters of
// Content-Type (charset), links, text and body.

function parseLinks(value) {
  const links = {};
  value.split(/ *, */).forEach((link) => {
    const parts = link.split(/ *; */);
    links[parts[1].split(/ *= */)[1].slice(1, -1)] = parts[0].slice(1, -1);
  });
  return links;
}

class Response {
  constructor(req, res, text, body, redirects = []) {
    this.req = req;
    this.res = res;
    this.text = text;
    this.files = {};
    this.buffered = true;
    this.headers = res.headers;
    this.header = res.headers;
    this.redirects = redirects;
    this.body = body === undefined ? {} : body;
    const status = res.statusCode;
    const type = Math.trunc(status / 100);
    this.statusCode = status;
    this.status = status;
    this.statusType = type;
    this.info = type === 1;
    this.ok = type === 2;
    this.redirect = type === 3;
    this.clientError = type === 4;
    this.serverError = type === 5;
    this.error = type === 4 || type === 5 ? this.toError() : false;
    this.created = status === 201;
    this.accepted = status === 202;
    this.noContent = status === 204;
    this.badRequest = status === 400;
    this.unauthorized = status === 401;
    this.notAcceptable = status === 406;
    this.forbidden = status === 403;
    this.notFound = status === 404;
    this.unprocessableEntity = status === 422;
    const params = (res.headers['content-type'] || '').split(/ *; */);
    this.type = params.shift();
    params.forEach((param) => {
      const [key, value] = param.split(/ *= */);
      if (key && value) this[key] = value;
    });
    this.links = {};
    try {
      if (res.headers.link) this.links = parseLinks(res.headers.link);
    } catch {
      // (As superagent: links it cannot read are left out.)
    }
  }

  get(field) {
    return this.header[field.toLowerCase()];
  }

  toError() {
    const { method, path } = this.req;
    const error = new Error(`cannot ${method} ${path} (${this.status})`);
    error.status = this.status;
    error.text = this.text;
    error.method = method;
    error.path = path;
    return error;
  }

  toJSON() {
    return {
      req: { method: this.req.method, url: this.req.path },
      header: this.header,
      status: this.status,
      text: this.text,
    };
  }
}

module.exports = { Response };
