// JSON Web Signatures (RFC 7515), compact form, as the jws package gives them: sign({ header, payload, secret }),
// verify(token, algorithm, key), decode(token), isValid(token), and the streams createSign() and createVerify().
const Stream = require('node:stream');
const jwa = require('./jwa');

const ALGORITHMS = [
  'HS256',
  'HS384',
  'HS512',
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
];

// Header, payload and signature in base64url; the signature can be empty (alg none).
const JWS_REGEX = /^[a-zA-Z0-9\-_]+?\.[a-zA-Z0-9\-_]+?\.([a-zA-Z0-9\-_]+)?$/;

function toString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || Buffer.isBuffer(value)) return value.toString();
  return JSON.stringify(value);
}

const base64url = (text, encoding) =>
  Buffer.from(text, encoding).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

// The header is written as latin1 (as jws does), the payload in `encoding` (utf8).
function securedInput(header, payload, encoding = 'utf8') {
  return `${base64url(toString(header), 'binary')}.${base64url(toString(payload), encoding)}`;
}

function sign(opts) {
  const { header, payload, encoding } = opts;
  const key = opts.secret || opts.privateKey;
  const input = securedInput(header, payload, encoding);
  return `${input}.${jwa(header.alg).sign(input, key)}`;
}

// sign() with a callback(err, token): an RSA signature is made in the thread pool (jwa's signAsync); the others, which
// take microseconds, are made here and given on the next tick.
function signAsync(opts, callback) {
  let input;
  let algorithm;
  try {
    const { header, payload, encoding } = opts;
    input = securedInput(header, payload, encoding);
    algorithm = jwa(header.alg);
  } catch (err) {
    process.nextTick(callback, err);
    return;
  }
  const key = opts.secret || opts.privateKey;
  if (!algorithm.signAsync) {
    let signature;
    try {
      signature = algorithm.sign(input, key);
    } catch (err) {
      process.nextTick(callback, err);
      return;
    }
    process.nextTick(callback, null, `${input}.${signature}`);
    return;
  }
  algorithm.signAsync(input, key, (err, signature) => (err ? callback(err) : callback(null, `${input}.${signature}`)));
}

function isObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function safeJsonParse(value) {
  if (isObject(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

const headerOf = (token) => safeJsonParse(Buffer.from(token.split('.', 1)[0], 'base64').toString('binary'));
const signatureOf = (token) => token.split('.')[2];

function isValid(token) {
  return JWS_REGEX.test(token) && Boolean(headerOf(token));
}

function verify(token, algorithm, secretOrKey) {
  if (!algorithm) {
    const err = new Error('Missing algorithm parameter for jws.verify');
    err.code = 'MISSING_ALGORITHM';
    throw err;
  }
  const text = toString(token);
  return jwa(algorithm).verify(text.split('.', 2).join('.'), signatureOf(text), secretOrKey);
}

// The header, payload (parsed when the header says JWT, or with { json: true }) and signature, or null.
// jws parses the header twice (in isValid and again) and splits the token three times: the regex leaves three parts,
// so one split and one parse give the same.
function decode(token, opts = {}) {
  const text = toString(token);
  if (!JWS_REGEX.test(text)) return null;
  const [encodedHeader, encodedPayload, signature] = text.split('.');
  const header = safeJsonParse(Buffer.from(encodedHeader, 'base64').toString('binary'));
  if (!header) return null;
  // In the encoding it was signed with (utf8 by default; jws reads utf8 whatever is given: jws#106).
  let payload = Buffer.from(encodedPayload, 'base64').toString(opts.encoding || 'utf8');
  if (header.typ === 'JWT' || opts.json) payload = JSON.parse(payload);
  return { header, payload, signature };
}

// A value given at once (string, Buffer, object) or by a stream, read to its end.
class DataStream extends Stream {
  constructor(data) {
    super();
    this.buffer = null;
    this.writable = true;
    this.readable = true;
    if (!data) {
      this.buffer = Buffer.alloc(0);
      return;
    }
    if (typeof data.pipe === 'function') {
      this.buffer = Buffer.alloc(0);
      data.pipe(this);
      return;
    }
    if (data.length || typeof data === 'object') {
      this.buffer = data;
      this.writable = false;
      process.nextTick(() => {
        this.emit('end', data);
        this.readable = false;
        this.emit('close');
      });
      return;
    }
    throw new TypeError(`Unexpected data type (${typeof data})`);
  }

  write(data) {
    this.buffer = Buffer.concat([this.buffer, Buffer.from(data)]);
    this.emit('data', data);
  }

  end(data) {
    if (data) this.write(data);
    this.emit('end', data);
    this.emit('close');
    this.writable = false;
    this.readable = false;
  }
}

// Signs when the secret and the payload have been read: 'done' (and 'data') with the token, or 'error'.
class SignStream extends Stream {
  constructor(opts) {
    super();
    let secret = opts.secret;
    if (secret == null) secret = opts.privateKey;
    if (secret == null) secret = opts.key;
    if (/^hs/i.test(opts.header.alg) && secret == null) {
      throw new TypeError('secret must be a string or buffer or a KeyObject');
    }
    this.readable = true;
    this.header = opts.header;
    this.encoding = opts.encoding;
    const secretStream = new DataStream(secret);
    this.secret = secretStream;
    this.privateKey = secretStream;
    this.key = secretStream;
    this.payload = new DataStream(opts.payload);
    this.secret.once('close', () => {
      if (!this.payload.writable && this.readable) this.sign();
    });
    this.payload.once('close', () => {
      if (!this.secret.writable && this.readable) this.sign();
    });
  }

  sign() {
    try {
      const signature = sign({
        header: this.header,
        payload: this.payload.buffer,
        secret: this.secret.buffer,
        encoding: this.encoding,
      });
      this.emit('done', signature);
      this.emit('data', signature);
      this.emit('end');
      this.readable = false;
      return signature;
    } catch (err) {
      this.readable = false;
      this.emit('error', err);
      this.emit('close');
      return undefined;
    }
  }
}

// Verifies when the key and the signature have been read: 'done' with (valid, decoded), or 'error'.
class VerifyStream extends Stream {
  constructor(opts = {}) {
    super();
    let secretOrKey = opts.secret;
    if (secretOrKey == null) secretOrKey = opts.publicKey;
    if (secretOrKey == null) secretOrKey = opts.key;
    if (/^hs/i.test(opts.algorithm) && secretOrKey == null) {
      throw new TypeError('secret must be a string or buffer or a KeyObject');
    }
    this.readable = true;
    this.algorithm = opts.algorithm;
    this.encoding = opts.encoding;
    this.json = opts.json;
    const secretStream = new DataStream(secretOrKey);
    this.secret = secretStream;
    this.publicKey = secretStream;
    this.key = secretStream;
    this.signature = new DataStream(opts.signature);
    this.secret.once('close', () => {
      if (!this.signature.writable && this.readable) this.verify();
    });
    this.signature.once('close', () => {
      if (!this.secret.writable && this.readable) this.verify();
    });
  }

  verify() {
    try {
      const valid = verify(this.signature.buffer, this.algorithm, this.key.buffer);
      // The options as an object (jws passes the encoding alone, which decode() does not read: jws#106), and json
      // (jws#105).
      const decoded = decode(this.signature.buffer, { encoding: this.encoding, json: this.json });
      this.emit('done', valid, decoded);
      this.emit('data', valid);
      this.emit('end');
      this.readable = false;
      return valid;
    } catch (err) {
      this.readable = false;
      this.emit('error', err);
      this.emit('close');
      return undefined;
    }
  }
}

const createSign = (opts) => new SignStream(opts);
const createVerify = (opts) => new VerifyStream(opts);

// Names only: Node finds them for `import { createSign } from '@xufa/jwt/jws'`.
module.exports = {
  ALGORITHMS,
  sign,
  verify,
  signAsync,
  decode,
  isValid,
  createSign,
  createVerify,
  SignStream,
  VerifyStream,
};
