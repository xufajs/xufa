// Objects to forms and back, as axios does: toFormData() (nested keys as a[b][c] or a.b.c, arrays as a[] or a[0], a
// visitor to change it), formDataToJSON() (the reverse), the urlencoded form, AxiosURLSearchParams (params of a URL)
// and formDataToStream(): a FormData of the standard as a multipart body for the http adapter.
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { AxiosError } from './errors.js';
import * as util from './util.js';

const { isArray } = Array;

// The FormData of Node in axios is form-data's (Buffers as parts with no file name, streams as files): that of
// @xufa/http/form-data when @xufa/http is there, else Node's own (Buffers as Blobs).
let nodeFormData;
function defaultFormData() {
  if (nodeFormData === undefined) {
    try {
      const loaded = createRequire(import.meta.url)('@xufa/http/form-data');
      nodeFormData = loaded.FormData || loaded;
    } catch {
      nodeFormData = null;
    }
  }
  return nodeFormData || globalThis.FormData;
}

const isVisitable = (value) => util.isPlainObject(value) || isArray(value);

const removeBrackets = (key) => (String(key).endsWith('[]') ? key.slice(0, -2) : key);

// The key of a value at a path: a[b][c], or a.b.c with dots.
function renderKey(path, key, dots) {
  if (!path) return key;
  return path
    .concat(key)
    .map((token, i) => {
      token = removeBrackets(token);
      return !dots && i ? `[${token}]` : token;
    })
    .join(dots ? '.' : '');
}

const isFlatArray = (array) => isArray(array) && !array.some(isVisitable);

const toArray = (value) => {
  if (!value) return null;
  if (isArray(value)) return value;
  if (typeof value.length !== 'number') return null;
  return Array.from({ length: value.length }, (item, i) => value[i]);
};

// The is* checks, as the visitor's helpers have them.
const predicates = {};
for (const [name, fn] of Object.entries(util)) if (/^is[A-Z]/.test(name)) predicates[name] = fn;
predicates.isArray = isArray;

/**
 * The values of an object appended to a form (a new one of Node's FormData kind when none is given). Options:
 * metaTokens (key{} keeps its braces), dots (a.b instead of a[b]), indexes (true: a[0], false: a[], null: a),
 * visitor(value, key, path, helpers) (true walks into the value), Blob.
 */
function toFormData(obj, formData, options) {
  if (!util.isObject(obj)) throw new TypeError('target must be an object');
  formData = formData || new (defaultFormData())();
  options = util.toFlatObject(
    options,
    { metaTokens: true, dots: false, indexes: false },
    false,
    (option, source) => !util.isUndefined(source[option])
  );
  const { metaTokens, dots, indexes } = options;
  const visitor = options.visitor || defaultVisitor;
  const Blob_ = options.Blob || (typeof Blob !== 'undefined' && Blob);
  const useBlob = Blob_ && util.isSpecCompliantForm(formData);
  if (!util.isFunction(visitor)) throw new TypeError('visitor must be a function');

  function convertValue(value) {
    if (value === null) return '';
    if (util.isDate(value)) return value.toISOString();
    if (value === true || value === false) return value.toString();
    if (!useBlob && util.isBlob(value)) throw new AxiosError('Blob is not supported. Use a Buffer instead.');
    if (util.isArrayBuffer(value) || util.isTypedArray(value)) {
      return useBlob && typeof Blob === 'function' ? new Blob([value]) : Buffer.from(value);
    }
    return value;
  }

  function defaultVisitor(value, key, path) {
    let array = value;
    // React Native's FormData takes its file objects ({ uri }) as they are.
    if (formData && typeof formData.getParts !== 'undefined' && value && typeof value.uri !== 'undefined') {
      formData.append(renderKey(path, key, dots), convertValue(value));
      return false;
    }
    if (value && !path && typeof value === 'object') {
      if (String(key).endsWith('{}')) {
        key = metaTokens ? key : key.slice(0, -2);
        value = JSON.stringify(value);
      } else if (
        (isArray(value) && isFlatArray(value)) ||
        ((util.isFileList(value) || String(key).endsWith('[]')) && (array = toArray(value)))
      ) {
        key = removeBrackets(key);
        array.forEach((item, index) => {
          if (item === undefined || item === null) return;
          formData.append(
            indexes === true ? renderKey([key], index, dots) : indexes === null ? key : `${key}[]`,
            convertValue(item)
          );
        });
        return false;
      }
    }
    if (isVisitable(value)) return true;
    formData.append(renderKey(path, key, dots), convertValue(value));
    return false;
  }

  const stack = [];
  const helpers = Object.assign(predicates, { defaultVisitor, convertValue, isVisitable });

  function build(value, path) {
    if (value === undefined) return;
    if (stack.includes(value)) throw Error(`Circular reference detected in ${path.join('.')}`);
    stack.push(value);
    util.forEach(value, (item, key) => {
      const result =
        !(item === undefined || item === null) &&
        visitor.call(formData, item, util.isString(key) ? key.trim() : key, path, helpers);
      if (result === true) build(item, path ? path.concat(key) : [key]);
    });
    stack.pop();
  }

  build(obj);
  return formData;
}

// foo[x][y], foo.x.y, foo-x-y, foo x y: the names of the path.
const parsePropPath = (name) =>
  [...name.matchAll(/\w+|\[(\w*)]/g)].map((match) => (match[0] === '[]' ? '' : match[1] || match[0]));

/** A FormData's entries as an object: names a[b][c] or a.b.c nested, a[] and repeated names as arrays. */
function formDataToJSON(formData) {
  function buildPath(path, value, target, index) {
    let name = path[index++];
    if (name === '__proto__') return true;
    const isNumericKey = Number.isFinite(+name);
    const isLast = index >= path.length;
    name = !name && isArray(target) ? target.length : name;
    if (isLast) {
      if (util.hasOwn(target, name)) target[name] = [target[name], value];
      else target[name] = value;
      return !isNumericKey;
    }
    if (!target[name] || !util.isObject(target[name])) target[name] = [];
    const result = buildPath(path, value, target[name], index);
    if (result && isArray(target[name])) target[name] = { ...target[name] };
    return !isNumericKey;
  }
  if (util.isFormData(formData) && util.isFunction(formData.entries)) {
    const object = {};
    for (const [name, value] of formData.entries()) buildPath(parsePropPath(name), value, object, 0);
    return object;
  }
  return null;
}

/** An object as an urlencoded form (URLSearchParams); Buffers as base64. */
function toURLEncodedForm(data, options) {
  return toFormData(data, new URLSearchParams(), {
    visitor(value, key, path, helpers) {
      if (util.isBuffer(value)) {
        this.append(key, value.toString('base64'));
        return false;
      }
      return helpers.defaultVisitor.apply(this, arguments);
    },
    ...options,
  });
}

const PARAM_CHARS = { '!': '%21', "'": '%27', '(': '%28', ')': '%29', '~': '%7E', '%20': '+', '%00': '\x00' };
const encodeParam = (text) => encodeURIComponent(text).replace(/[!'()~]|%20|%00/g, (match) => PARAM_CHARS[match]);

/** The params of a URL, as toFormData() walks them; toString(encoder) gives the query. */
class AxiosURLSearchParams {
  constructor(params, options) {
    this._pairs = [];
    if (params) toFormData(params, this, options);
  }

  append(name, value) {
    this._pairs.push([name, value]);
  }

  toString(encoder) {
    const encode = encoder
      ? function (value) {
          return encoder.call(this, value, encodeParam);
        }
      : encodeParam;
    return this._pairs.map((pair) => `${encode(pair[0])}=${encode(pair[1])}`).join('&');
  }
}

// formDataToStream: a FormData of the standard as multipart/form-data, its length known (parts are strings or
// Blobs).
const CRLF = '\r\n';
const CRLF_BYTES = Buffer.from(CRLF);
const ALPHA_DIGIT = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const BOUNDARY_ALPHABET = `${ALPHA_DIGIT}-_`;
const ESCAPES = { '\r': '%0D', '\n': '%0A', '"': '%22' };
const escapeName = (name) => String(name).replace(/[\r\n"]/g, (match) => ESCAPES[match]);

function randomString(size, alphabet) {
  const values = new Uint32Array(size);
  crypto.randomFillSync(values);
  let text = '';
  for (let i = 0; i < size; i++) text += alphabet[values[i] % alphabet.length];
  return text;
}

async function* readBlob(blob) {
  if (blob.stream) yield* blob.stream();
  else if (blob.arrayBuffer) yield await blob.arrayBuffer();
  else if (blob[Symbol.asyncIterator]) yield* blob[Symbol.asyncIterator]();
  else yield blob;
}

class FormDataPart {
  constructor(name, value) {
    const isText = util.isString(value);
    let headers = `Content-Disposition: form-data; name="${escapeName(name)}"${
      !isText && value.name ? `; filename="${escapeName(value.name)}"` : ''
    }${CRLF}`;
    if (isText) value = Buffer.from(String(value).replace(/\r?\n|\r\n?/g, CRLF));
    else headers += `Content-Type: ${value.type || 'application/octet-stream'}${CRLF}`;
    this.headers = Buffer.from(headers + CRLF);
    this.contentLength = isText ? value.byteLength : value.size;
    this.size = this.headers.byteLength + this.contentLength + CRLF_BYTES.length;
    this.value = value;
  }

  async *encode() {
    yield this.headers;
    if (util.isTypedArray(this.value)) yield this.value;
    else yield* readBlob(this.value);
    yield CRLF_BYTES;
  }
}

/** A FormData of the standard as a Readable of multipart/form-data; its headers (type, length) to headersHandler. */
function formDataToStream(form, headersHandler, options) {
  const {
    tag = 'form-data-boundary',
    size = 25,
    boundary = `${tag}-${randomString(size, BOUNDARY_ALPHABET)}`,
  } = options || {};
  if (!util.isFormData(form)) throw TypeError('FormData instance required');
  if (boundary.length < 1 || boundary.length > 70) throw Error('boundary must be 10-70 characters long');
  const boundaryBytes = Buffer.from(`--${boundary}${CRLF}`);
  const footerBytes = Buffer.from(`--${boundary}--${CRLF}`);
  let contentLength = footerBytes.byteLength;
  const parts = Array.from(form.entries(), ([name, value]) => {
    const part = new FormDataPart(name, value);
    contentLength += part.size;
    return part;
  });
  contentLength = util.toFiniteNumber(contentLength + boundaryBytes.byteLength * parts.length);
  const headers = { 'Content-Type': `multipart/form-data; boundary=${boundary}` };
  if (Number.isFinite(contentLength)) headers['Content-Length'] = contentLength;
  if (headersHandler) headersHandler(headers);
  return Readable.from(
    (async function* () {
      for (const part of parts) {
        yield boundaryBytes;
        yield* part.encode();
      }
      yield footerBytes;
    })()
  );
}

export {
  toFormData,
  formDataToJSON,
  toURLEncodedForm,
  AxiosURLSearchParams,
  formDataToStream,
  readBlob,
  defaultFormData,
  randomString,
};
