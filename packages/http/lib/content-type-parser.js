// Parsers of request bodies by content type: JSON and plain text by default, others added with
// addContentTypeParser (strings, regular expressions, or '*' for any).
import { AsyncResource } from 'node:async_hooks';
import secureJson from './secure-json.js';
import ContentType from './content-type.js';
import {
  kDefaultJsonParse,
  kContentTypeParser,
  kBodyLimit,
  kRequestPayloadStream,
  kState,
  kTestInternals,
  kReplyIsError,
  kRouteContext,
} from './symbols.js';
import {
  XUFA_ERR_CTP_INVALID_TYPE,
  XUFA_ERR_CTP_EMPTY_TYPE,
  XUFA_ERR_CTP_ALREADY_PRESENT,
  XUFA_ERR_CTP_INVALID_HANDLER,
  XUFA_ERR_CTP_INVALID_PARSE_TYPE,
  XUFA_ERR_CTP_BODY_TOO_LARGE,
  XUFA_ERR_CTP_INVALID_MEDIA_TYPE,
  XUFA_ERR_CTP_INVALID_CONTENT_LENGTH,
  XUFA_ERR_CTP_EMPTY_JSON_BODY,
  XUFA_ERR_CTP_INSTANCE_ALREADY_STARTED,
  XUFA_ERR_CTP_INVALID_JSON_BODY,
} from './errors.js';
import { XUFASEC001 } from './warnings.js';

const { LruMap } = ContentType;

function Parser(asString, asBuffer, bodyLimit, fn) {
  this.asString = asString;
  this.asBuffer = asBuffer;
  this.bodyLimit = bodyLimit;
  this.fn = fn;
}

function ContentTypeParser(bodyLimit, onProtoPoisoning, onConstructorPoisoning) {
  this[kDefaultJsonParse] = getDefaultJsonParser(onProtoPoisoning, onConstructorPoisoning);
  // A Map, so that keys can not reach the prototype of an object.
  this.customParsers = new Map();
  this.customParsers.set('application/json', new Parser(true, false, bodyLimit, this[kDefaultJsonParse]));
  this.customParsers.set('text/plain', new Parser(true, false, bodyLimit, defaultPlainTextParser));
  this.parserList = ['application/json', 'text/plain'];
  this.parserRegExpList = [];
  this.cache = new LruMap(100);
  // Header values as they come (not normalized) -> parser: headers seen before are not parsed again.
  this.rawCache = new LruMap(100);
}

ContentTypeParser.prototype.add = function add(contentTypeArg, opts, parserFn) {
  let contentType = contentTypeArg;
  const isString = typeof contentType === 'string';
  if (isString) {
    contentType = contentType.trim().toLowerCase();
    if (contentType.length === 0) throw new XUFA_ERR_CTP_EMPTY_TYPE();
  } else if (!(contentType instanceof RegExp)) {
    throw new XUFA_ERR_CTP_INVALID_TYPE();
  }
  if (typeof parserFn !== 'function') throw new XUFA_ERR_CTP_INVALID_HANDLER();
  if (this.existingParser(contentType)) throw new XUFA_ERR_CTP_ALREADY_PRESENT(contentType);
  if (opts.parseAs !== undefined && opts.parseAs !== 'string' && opts.parseAs !== 'buffer') {
    throw new XUFA_ERR_CTP_INVALID_PARSE_TYPE(opts.parseAs);
  }
  const parser = new Parser(opts.parseAs === 'string', opts.parseAs === 'buffer', opts.bodyLimit, parserFn);
  this.cache.clear();
  this.rawCache.clear();
  if (contentType === '*') {
    this.customParsers.set('', parser);
  } else if (isString) {
    const ct = new ContentType(contentType);
    if (ct.isValid === false) throw new XUFA_ERR_CTP_INVALID_TYPE();
    const normalized = ct.toString();
    this.parserList.unshift(normalized);
    this.customParsers.set(normalized, parser);
  } else {
    validateRegExp(contentType);
    this.parserRegExpList.unshift(contentType);
    this.customParsers.set(contentType.toString(), parser);
  }
};

function keyOf(contentType) {
  if (typeof contentType === 'string') return contentType === '*' ? '' : new ContentType(contentType).toString();
  if (!(contentType instanceof RegExp)) throw new XUFA_ERR_CTP_INVALID_TYPE();
  return contentType.toString();
}

ContentTypeParser.prototype.hasParser = function hasParser(contentType) {
  return this.customParsers.has(keyOf(contentType));
};

// Whether a parser of the user is set for the type (the default ones can be replaced).
ContentTypeParser.prototype.existingParser = function existingParser(contentType) {
  if (contentType === '*') return false;
  if (typeof contentType === 'string') {
    const ct = keyOf(contentType);
    if (contentType === 'application/json' && this.customParsers.has(contentType)) {
      return this.customParsers.get(ct).fn !== this[kDefaultJsonParse];
    }
    if (contentType === 'text/plain' && this.customParsers.has(contentType)) {
      return this.customParsers.get(ct).fn !== defaultPlainTextParser;
    }
  }
  return this.hasParser(contentType);
};

ContentTypeParser.prototype.getParser = function getParser(contentTypeArg) {
  let contentType = contentTypeArg;
  if (typeof contentType === 'string') {
    const cached = this.rawCache.get(contentType);
    if (cached !== undefined) return cached;
    contentType = new ContentType(contentType);
  }
  const ct = contentType.toString();
  let parser = this.cache.get(ct);
  if (parser !== undefined) return parser;
  // The exact type with its parameters, then its media type, then the regular expressions.
  parser = this.customParsers.get(ct);
  if (parser === undefined) parser = this.customParsers.get(contentType.mediaType);
  if (parser === undefined) {
    for (const regex of this.parserRegExpList) {
      // A g or y flag keeps a lastIndex between calls.
      regex.lastIndex = 0;
      if (regex.test(ct)) {
        parser = this.customParsers.get(regex.toString());
        break;
      }
    }
  }
  if (parser !== undefined) {
    this.cache.set(ct, parser);
    if (typeof contentTypeArg === 'string') this.rawCache.set(contentTypeArg, parser);
    return parser;
  }
  return this.customParsers.get('');
};

ContentTypeParser.prototype.removeAll = function removeAll() {
  this.customParsers = new Map();
  this.parserRegExpList = [];
  this.parserList = [];
  this.cache = new LruMap(100);
  this.rawCache = new LruMap(100);
};

ContentTypeParser.prototype.remove = function remove(contentType) {
  let key;
  let parsers;
  if (typeof contentType === 'string') {
    key = keyOf(contentType);
    parsers = this.parserList;
  } else {
    if (!(contentType instanceof RegExp)) throw new XUFA_ERR_CTP_INVALID_TYPE();
    key = contentType.toString();
    parsers = this.parserRegExpList;
  }
  this.cache.clear();
  this.rawCache.clear();
  const removed = this.customParsers.delete(key);
  const index = parsers.findIndex((ct) => ct.toString() === key);
  if (index > -1) parsers.splice(index, 1);
  return removed || index > -1;
};

ContentTypeParser.prototype.run = function run(contentType, handler, request, reply) {
  const parser = this.getParser(contentType);
  if (parser === undefined) {
    if (request.is404 === true) {
      handler(request, reply);
      return;
    }
    reply[kReplyIsError] = true;
    reply.send(new XUFA_ERR_CTP_INVALID_MEDIA_TYPE());
    return;
  }

  // The body arrives in the context of the socket: the rest of the request goes on in its own.
  const resource = new AsyncResource('content-type-parser:run', request);
  function onDone(error, body) {
    resource.emitDestroy();
    if (error != null) {
      // The client may send more data: the connection is closed.
      reply.header('connection', 'close');
      reply[kReplyIsError] = true;
      reply.send(error);
      return;
    }
    request.body = body;
    handler(request, reply);
  }
  function done(error, body) {
    resource.runInAsyncScope(onDone, undefined, error, body);
  }

  if (parser.asString === true || parser.asBuffer === true) {
    rawBody(request, reply, reply[kRouteContext]._parserOptions, parser, done);
    return;
  }
  const result = parser.fn(request, request[kRequestPayloadStream], done);
  if (result && typeof result.then === 'function') result.then((body) => done(null, body), done);
};

function rawBody(request, reply, options, parser, done) {
  const asString = parser.asString === true;
  const limit = options.limit === null ? parser.bodyLimit : options.limit;
  const contentLength = Number(request.headers['content-length']);
  if (contentLength > limit) {
    done(new XUFA_ERR_CTP_BODY_TOO_LARGE(), undefined);
    return;
  }
  let received = 0;
  let first = null;
  let chunks = null;
  const payload = request[kRequestPayloadStream] || request.raw;

  function cleanup() {
    payload.removeListener('data', onData);
    payload.removeListener('end', onEnd);
    payload.removeListener('error', onEnd);
  }

  function onData(data) {
    // A stream of a preParsing hook may give strings.
    const chunk = typeof data === 'string' ? Buffer.from(data) : data;
    received += chunk.length;
    const encodedLength = payload.receivedEncodedLength || 0;
    // The decoded body must not exceed the limit either ("zip bombs").
    if (received > limit || encodedLength > limit) {
      cleanup();
      done(new XUFA_ERR_CTP_BODY_TOO_LARGE(), undefined);
      return;
    }
    if (first === null) first = chunk;
    else if (chunks === null) chunks = [first, chunk];
    else chunks.push(chunk);
  }

  function onEnd(err) {
    cleanup();
    if (err != null) {
      if (!(typeof err.statusCode === 'number' && err.statusCode >= 400)) err.statusCode = 400; // eslint-disable-line no-param-reassign
      done(err, undefined);
      return;
    }
    if (!Number.isNaN(contentLength) && (payload.receivedEncodedLength || received) !== contentLength) {
      done(new XUFA_ERR_CTP_INVALID_CONTENT_LENGTH(), undefined);
      return;
    }
    let body;
    if (first === null) {
      body = asString ? '' : Buffer.alloc(0);
    } else if (asString) {
      // Decoded at once, so that characters split between chunks are kept whole.
      body = chunks === null ? first.toString('utf8') : Buffer.concat(chunks, received).toString('utf8');
    } else {
      // A copy: the parser never gets a view of the buffer of the socket.
      body = chunks === null ? Buffer.from(first) : Buffer.concat(chunks, received);
    }
    const result = parser.fn(request, body, done);
    if (result && typeof result.then === 'function') result.then((value) => done(null, value), done);
  }

  payload.on('data', onData);
  payload.on('end', onEnd);
  payload.on('error', onEnd);
  payload.resume();
}

function getDefaultJsonParser(onProtoPoisoning, onConstructorPoisoning) {
  const options = { protoAction: onProtoPoisoning, constructorAction: onConstructorPoisoning };
  return function defaultJsonParser(req, body, done) {
    if (body.length === 0) {
      done(new XUFA_ERR_CTP_EMPTY_JSON_BODY(), undefined);
      return;
    }
    let value;
    try {
      value = secureJson.parse(body, options);
    } catch {
      done(new XUFA_ERR_CTP_INVALID_JSON_BODY(), undefined);
      return;
    }
    done(null, value);
  };
}

function defaultPlainTextParser(req, body, done) {
  done(null, body);
}

function buildContentTypeParser(parent) {
  const parser = new ContentTypeParser();
  parser[kDefaultJsonParse] = parent[kDefaultJsonParse];
  parser.customParsers = new Map(parent.customParsers.entries());
  parser.parserList = parent.parserList.slice();
  parser.parserRegExpList = parent.parserRegExpList.slice();
  return parser;
}

function addContentTypeParser(contentType, optsArg, parserArg) {
  if (this[kState].started) throw new XUFA_ERR_CTP_INSTANCE_ALREADY_STARTED('addContentTypeParser');
  let opts = optsArg;
  let parser = parserArg;
  if (typeof opts === 'function') {
    parser = opts;
    opts = {};
  }
  opts = { ...opts };
  if (!opts.bodyLimit) opts.bodyLimit = this[kBodyLimit];
  if (Array.isArray(contentType)) {
    for (const type of contentType) this[kContentTypeParser].add(type, opts, parser);
  } else {
    this[kContentTypeParser].add(contentType, opts, parser);
  }
  return this;
}

function hasContentTypeParser(contentType) {
  return this[kContentTypeParser].hasParser(contentType);
}

function removeContentTypeParser(contentType) {
  if (this[kState].started) throw new XUFA_ERR_CTP_INSTANCE_ALREADY_STARTED('removeContentTypeParser');
  if (Array.isArray(contentType)) {
    for (const type of contentType) this[kContentTypeParser].remove(type);
  } else {
    this[kContentTypeParser].remove(contentType);
  }
}

function removeAllContentTypeParsers() {
  if (this[kState].started) throw new XUFA_ERR_CTP_INSTANCE_ALREADY_STARTED('removeAllContentTypeParsers');
  this[kContentTypeParser].removeAll();
}

// A regular expression should start with ^ or allow parameters (;?), not to match a type inside another one.
function validateRegExp(regex) {
  if (regex.source[0] !== '^' && !regex.source.includes(';?')) XUFASEC001(regex.source);
}

export default ContentTypeParser;
ContentTypeParser.helpers = {
  buildContentTypeParser,
  addContentTypeParser,
  hasContentTypeParser,
  removeContentTypeParser,
  removeAllContentTypeParsers,
};
const __helpers = ContentTypeParser.helpers;
ContentTypeParser.defaultParsers = { getDefaultJsonParser, defaultTextParser: defaultPlainTextParser };
const __defaultParsers = ContentTypeParser.defaultParsers;
ContentTypeParser[kTestInternals] = { rawBody };

export { __helpers as helpers, __defaultParsers as defaultParsers };

// What require() gives (the tests of fastify are CommonJS).
export { ContentTypeParser as 'module.exports' };
