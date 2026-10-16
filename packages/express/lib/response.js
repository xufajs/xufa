// Express's response: Node's ServerResponse with status(), send(), json(), jsonp(), sendStatus(), sendFile(),
// download(), type(), format(), attachment(), append(), set(), get(), cookie(), clearCookie(), location(),
// redirect(), vary(), render() and links(). The app's settings ('etag fn', 'json replacer', 'json spaces',
// 'json escape', 'jsonp callback name') are read through res.app.
import http, { STATUS_CODES } from 'node:http';
import path from 'node:path';
import { createError } from './errors.js';
import { contentType } from './mime.js';
import { contentDisposition, encodeUrl, escapeHtml, serializeCookie, setCharset, signCookie, vary } from './headers.js';
import { kHashesStrings, normalizeType, normalizeTypes } from './utils.js';
import { FileSender } from './send.js';
import { finished } from './finished.js';

export const response = Object.create(http.ServerResponse.prototype);

// JSON of a value, with the app's replacer, spaces and escape (<, > and & as <...).
function stringify(value, replacer, spaces, escape) {
  let json = replacer || spaces ? JSON.stringify(value, replacer, spaces) : JSON.stringify(value);
  if (escape && typeof json === 'string') {
    json = json.replace(/[<>&]/g, (char) => {
      if (char === '<') return '\\u003c';
      if (char === '>') return '\\u003e';
      return '\\u0026';
    });
  }
  return json;
}

// A file sent by a FileSender: callback(error) once, at its end, an error (EISDIR for a folder) or an abort.
function sendFile(res, file, options, callback) {
  let done = false;
  let streaming;
  const finish = (error) => {
    if (done) return;
    done = true;
    callback(error);
  };
  const aborted = () => {
    const error = new Error('Request aborted');
    error.code = 'ECONNABORTED';
    finish(error);
  };
  file.on('directory', () => {
    const error = new Error('EISDIR, read');
    error.code = 'EISDIR';
    finish(error);
  });
  file.on('end', () => finish());
  file.on('error', (error) => finish(error));
  file.on('file', () => {
    streaming = false;
  });
  file.on('stream', () => {
    streaming = true;
  });
  finished(res, (error) => {
    if (error && error.code === 'ECONNRESET') {
      aborted();
      return;
    }
    if (error) {
      finish(error);
      return;
    }
    if (done) return;
    setImmediate(() => {
      if (streaming !== false && !done) {
        aborted();
        return;
      }
      finish();
    });
  });
  if (options.headers) {
    file.on('headers', (response) => {
      Object.keys(options.headers).forEach((key) => response.setHeader(key, options.headers[key]));
    });
  }
  file.pipe(res);
}

Object.assign(response, {
  status(code) {
    if (!Number.isInteger(code)) {
      throw new TypeError(`Invalid status code: ${JSON.stringify(code)}. Status code must be an integer.`);
    }
    if (code < 100 || code > 999) {
      throw new RangeError(
        `Invalid status code: ${JSON.stringify(code)}. Status code must be greater than 99 and less than 1000.`
      );
    }
    this.statusCode = code;
    return this;
  },

  links(links) {
    let link = this.get('Link') || '';
    if (link) link += ', ';
    const added = Object.keys(links)
      .map((rel) =>
        Array.isArray(links[rel])
          ? links[rel].map((single) => `<${single}>; rel="${rel}"`).join(', ')
          : `<${links[rel]}>; rel="${rel}"`
      )
      .join(', ');
    return this.set('Link', link + added);
  },

  // A body: a string (text/html unless a type is set; utf-8), a Buffer or typed array (application/octet-stream),
  // null (empty), anything else as JSON. Content-Length, an ETag (the app's 'etag fn'), 304 when the client has it.
  send(body) {
    let chunk = body;
    let encoding;
    const { req } = this;
    switch (typeof chunk) {
      case 'string':
        if (!this.getHeader('Content-Type')) this.type('html');
        break;
      case 'boolean':
      case 'number':
      case 'object':
        if (chunk === null) chunk = '';
        else if (ArrayBuffer.isView(chunk)) {
          if (!this.getHeader('Content-Type')) this.type('bin');
        } else return this.json(chunk);
        break;
      default:
        break;
    }
    if (typeof chunk === 'string') {
      encoding = 'utf8';
      const type = this.getHeader('Content-Type');
      if (typeof type === 'string') this.setHeader('Content-Type', setCharset(type, 'utf-8'));
    }
    const etagFn = this.app.get('etag fn');
    const generateETag = typeof etagFn === 'function' && !this.getHeader('ETag');
    let length;
    if (chunk !== undefined) {
      if (Buffer.isBuffer(chunk)) length = chunk.length;
      else if (encoding === 'utf8' && (!generateETag || (etagFn[kHashesStrings] === true && chunk.length < 16384))) {
        // (A string is written as it is, and hashed so by the ETags of Express; a large one, or for a function of the
        // app's, is made a Buffer once, hashed and written.)
        length = Buffer.byteLength(chunk, 'utf8');
      } else {
        chunk = Buffer.from(chunk, encoding);
        encoding = undefined;
        length = chunk.length;
      }
      this.setHeader('Content-Length', length);
    }
    if (generateETag && length !== undefined) {
      const etag = etagFn(chunk, encoding);
      if (etag) this.setHeader('ETag', etag);
    }
    if (req.fresh) this.statusCode = 304;
    if (this.statusCode === 204 || this.statusCode === 304) {
      this.removeHeader('Content-Type');
      this.removeHeader('Content-Length');
      this.removeHeader('Transfer-Encoding');
      chunk = '';
    }
    if (this.statusCode === 205) {
      this.setHeader('Content-Length', '0');
      this.removeHeader('Transfer-Encoding');
      chunk = '';
    }
    if (req.method === 'HEAD') this.end();
    else this.end(chunk, encoding);
    return this;
  },

  json(obj) {
    const { app } = this;
    const body = stringify(obj, app.get('json replacer'), app.get('json spaces'), app.get('json escape'));
    if (!this.getHeader('Content-Type')) this.setHeader('Content-Type', 'application/json; charset=utf-8');
    return this.send(body);
  },

  jsonp(obj) {
    const { app } = this;
    let body = stringify(obj, app.get('json replacer'), app.get('json spaces'), app.get('json escape'));
    let callback = this.req.query[app.get('jsonp callback name')];
    if (!this.getHeader('Content-Type')) {
      this.setHeader('X-Content-Type-Options', 'nosniff');
      this.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    if (Array.isArray(callback)) [callback] = callback;
    if (typeof callback === 'string' && callback.length !== 0) {
      this.setHeader('X-Content-Type-Options', 'nosniff');
      this.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      callback = callback.replace(/[^[\]\w$.]/g, '');
      if (body === undefined) body = '';
      else if (typeof body === 'string') body = body.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
      // (/**/ against "Rosetta Flash"; the typeof check spares clients an error.)
      body = `/**/ typeof ${callback} === 'function' && ${callback}(${body});`;
    }
    return this.send(body);
  },

  sendStatus(statusCode) {
    const body = STATUS_CODES[statusCode] || String(statusCode);
    this.status(statusCode);
    this.type('txt');
    return this.send(body);
  },

  sendFile(filePath, options, callback) {
    let done = callback;
    const { req } = this;
    const { next } = req;
    let opts = options || {};
    if (!filePath) throw new TypeError('path argument is required to res.sendFile');
    if (typeof filePath !== 'string') throw new TypeError('path must be a string to res.sendFile');
    if (typeof options === 'function') {
      done = options;
      opts = {};
    }
    if (!opts.root && !path.isAbsolute(filePath)) {
      throw new TypeError('path must be absolute or specify root to res.sendFile');
    }
    opts.etag = this.app.enabled('etag');
    const file = new FileSender(req, encodeURI(filePath), opts);
    sendFile(this, file, opts, (error) => {
      if (done) {
        done(error);
        return;
      }
      if (error && error.code === 'EISDIR') {
        next();
        return;
      }
      if (error && error.code !== 'ECONNABORTED' && error.syscall !== 'write') next(error);
    });
  },

  download(filePath, filename, options, callback) {
    let done = callback;
    let name = filename;
    let opts = options || null;
    if (typeof filename === 'function') {
      done = filename;
      name = null;
      opts = null;
    } else if (typeof options === 'function') {
      done = options;
      opts = null;
    }
    if (typeof filename === 'object' && (typeof options === 'function' || options === undefined)) {
      name = null;
      opts = filename;
    }
    const headers = { 'Content-Disposition': contentDisposition(name || filePath) };
    if (opts && opts.headers) {
      Object.keys(opts.headers).forEach((key) => {
        if (key.toLowerCase() !== 'content-disposition') headers[key] = opts.headers[key];
      });
    }
    opts = Object.create(opts);
    opts.headers = headers;
    const fullPath = !opts.root ? path.resolve(filePath) : filePath;
    return this.sendFile(fullPath, opts, done);
  },

  type(type) {
    const value = type.indexOf('/') === -1 ? contentType(type) || 'application/octet-stream' : type;
    return this.set('Content-Type', value);
  },

  // The handler of the type the request prefers (Vary: Accept), the default, or a 406 to next().
  format(obj) {
    const { req } = this;
    const { next } = req;
    const keys = Object.keys(obj).filter((key) => key !== 'default');
    const key = keys.length > 0 ? req.accepts(keys) : false;
    this.vary('Accept');
    if (key) {
      this.set('Content-Type', normalizeType(key).value);
      obj[key](req, this, next);
    } else if (obj.default) obj.default(req, this, next);
    else next(createError(406, { types: normalizeTypes(keys).map((type) => type.value) }));
    return this;
  },

  attachment(filename) {
    if (filename) this.type(path.extname(filename));
    this.set('Content-Disposition', contentDisposition(filename));
    return this;
  },

  append(field, value) {
    const previous = this.get(field);
    let next = value;
    if (previous) {
      if (Array.isArray(previous)) next = previous.concat(value);
      else next = Array.isArray(value) ? [previous].concat(value) : [previous, value];
    }
    return this.set(field, next);
  },

  // A header (strings; a charset added to a Content-Type of a type that has one), or each of an object's.
  set(field, value) {
    if (arguments.length === 2) {
      let text = Array.isArray(value) ? value.map(String) : String(value);
      if (field.toLowerCase() === 'content-type') {
        if (Array.isArray(text)) throw new TypeError('Content-Type cannot be set to an Array');
        text = contentType(text);
      }
      this.setHeader(field, text);
    } else {
      for (const key in field) this.set(key, field[key]);
    }
    return this;
  },

  get(field) {
    return this.getHeader(field);
  },

  clearCookie(name, options) {
    const opts = { path: '/', ...options, expires: new Date(1) };
    delete opts.maxAge;
    return this.cookie(name, '', opts);
  },

  // A cookie: an object as j:<JSON>, signed (s:<value>.<signature>) with req.secret, maxAge in milliseconds.
  cookie(name, value, options) {
    const opts = { ...options };
    const { secret } = this.req;
    if (opts.signed && !secret) throw new Error('cookieParser("secret") required for signed cookies');
    let text = typeof value === 'object' ? `j:${JSON.stringify(value)}` : String(value);
    if (opts.signed) text = `s:${signCookie(text, secret)}`;
    if (opts.maxAge != null) {
      const maxAge = opts.maxAge - 0;
      if (!Number.isNaN(maxAge)) {
        opts.expires = new Date(Date.now() + maxAge);
        opts.maxAge = Math.floor(maxAge / 1000);
      }
    }
    if (opts.path == null) opts.path = '/';
    this.append('Set-Cookie', serializeCookie(name, String(text), opts));
    return this;
  },

  location(url) {
    return this.set('Location', encodeUrl(url));
  },

  // A redirect (302 or the status given): Location, and a body of text or HTML as the request accepts.
  redirect(...args) {
    let address = args[0];
    let status = 302;
    let body;
    if (args.length === 2) [status, address] = args;
    address = this.location(address).get('Location');
    this.format({
      text: () => {
        body = `${STATUS_CODES[status]}. Redirecting to ${address}`;
      },
      html: () => {
        body = `<p>${STATUS_CODES[status]}. Redirecting to ${escapeHtml(address)}</p>`;
      },
      default: () => {
        body = '';
      },
    });
    this.status(status);
    this.set('Content-Length', Buffer.byteLength(body));
    if (this.req.method === 'HEAD') this.end();
    else this.end(body);
  },

  vary(field) {
    vary(this, field);
    return this;
  },

  render(view, options, callback) {
    const { app } = this.req;
    let done = callback;
    let opts = options || {};
    const { req } = this;
    if (typeof options === 'function') {
      done = options;
      opts = {};
    }
    opts._locals = this.locals;
    done =
      done ||
      ((error, text) => {
        if (error) {
          req.next(error);
          return;
        }
        this.send(text);
      });
    app.render(view, opts, done);
  },
});

response.header = response.set;
response.contentType = response.type;
