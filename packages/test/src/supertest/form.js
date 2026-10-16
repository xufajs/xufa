'use strict';

// The bodies superagent sends: a form of an object (qs.stringify), a query of an object (qs.stringify with
// indices: false and strictNullHandling) and multipart/form-data of .field() and .attach() (as form-data writes it).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const isObject = (value) => value !== null && typeof value === 'object';

// RFC 3986, as qs encodes.
function encode(text) {
  return encodeURIComponent(text).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

// qs.stringify(value): a[b]=c for nested objects, a[0]=1&a[1]=2 for arrays (a=1&a=2 with indices false), a= for null
// (a bare a with strictNullHandling), nothing for undefined.
function stringify(value, { indices = true, strictNullHandling = false } = {}, prefix = undefined) {
  if (value === undefined) return [];
  if (value === null) return [strictNullHandling ? encode(prefix) : `${encode(prefix)}=`];
  if (value instanceof Date) return [`${encode(prefix)}=${encode(value.toISOString())}`];
  if (!isObject(value) || Buffer.isBuffer(value)) return [`${encode(prefix)}=${encode(String(value))}`];
  const options = { indices, strictNullHandling };
  return Object.keys(value).flatMap((key) => {
    let name = key;
    if (prefix !== undefined) name = Array.isArray(value) && !indices ? prefix : `${prefix}[${key}]`;
    return stringify(value[key], options, name);
  });
}

// qs.parse(text), as superagent reads a form it is answered: a[b]=c nested objects, a[]=1 and repeated keys arrays,
// a[0]=1 arrays (up to index 20, objects past it); + is a space.
function parse(text) {
  const result = {};
  const decode = (value) => {
    try {
      return decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      return value;
    }
  };
  text.split('&').forEach((pair) => {
    if (!pair) return;
    const equals = pair.indexOf('=');
    const key = decode(equals === -1 ? pair : pair.slice(0, equals));
    const value = equals === -1 ? '' : decode(pair.slice(equals + 1));
    const bracket = key.indexOf('[');
    const segments =
      bracket > 0
        ? [key.slice(0, bracket), ...[...key.slice(bracket).matchAll(/\[([^\]]*)\]/g)].map((m) => m[1])]
        : [key];
    let node = result;
    segments.forEach((segment, i) => {
      const last = i === segments.length - 1;
      let name = segment;
      if (name === '' && Array.isArray(node)) name = String(node.length);
      if (last) {
        if (node[name] === undefined) node[name] = value;
        else if (Array.isArray(node[name])) node[name].push(value);
        else node[name] = [node[name], value];
        return;
      }
      const next = segments[i + 1];
      if (node[name] === undefined) node[name] = next === '' || (/^\d+$/.test(next) && Number(next) <= 20) ? [] : {};
      else if (Array.isArray(node[name]) && next !== '' && !/^\d+$/.test(next)) node[name] = { ...node[name] };
      node = node[name];
    });
  });
  return result;
}

// The types of files by their extension, as mime-types gives them for the files a test attaches (others are
// application/octet-stream, as form-data sends a file of a type it does not know).
const TYPES = {
  avif: 'image/avif',
  bmp: 'image/bmp',
  css: 'text/css',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  gif: 'image/gif',
  gz: 'application/gzip',
  heic: 'image/heic',
  heif: 'image/heif',
  htm: 'text/html',
  html: 'text/html',
  ico: 'image/vnd.microsoft.icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'application/javascript',
  json: 'application/json',
  md: 'text/markdown',
  mjs: 'application/javascript',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  pdf: 'application/pdf',
  png: 'image/png',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  svg: 'image/svg+xml',
  tar: 'application/x-tar',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  ts: 'video/mp2t',
  txt: 'text/plain',
  wav: 'audio/wav',
  webm: 'video/webm',
  webp: 'image/webp',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xml: 'application/xml',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  zip: 'application/zip',
};

function typeOf(filename) {
  const extension = path
    .extname(filename || '')
    .slice(1)
    .toLowerCase();
  return TYPES[extension];
}

// multipart/form-data of form-data 4: a boundary of 26 dashes and 24 hexadecimal digits, each part its
// Content-Disposition (name, and filename: the file's base name) and, for files, its Content-Type (that of the
// file's path, else of the filename given).
class Multipart {
  constructor() {
    this.boundary = `--------------------------${crypto.randomBytes(12).toString('hex')}`;
    this.parts = [];
  }

  field(name, value) {
    if (Array.isArray(value)) throw new Error('Arrays are not supported.');
    this.parts.push({ name, value: typeof value === 'number' ? String(value) : value });
  }

  file(name, file, options) {
    const filename = options.filename !== undefined ? path.basename(String(options.filename)) : undefined;
    const contentType =
      options.contentType ||
      (typeof file === 'string' && typeOf(file)) ||
      typeOf(options.filename) ||
      'application/octet-stream';
    this.parts.push({ name, file, filename, contentType });
  }

  contentType() {
    return `multipart/form-data; boundary=${this.boundary}`;
  }

  // The whole body (files read now).
  body() {
    const chunks = [];
    this.parts.forEach((part) => {
      let head = `--${this.boundary}\r\nContent-Disposition: form-data; name="${part.name}"`;
      if (part.filename !== undefined) head += `; filename="${part.filename}"`;
      head += '\r\n';
      if (part.file !== undefined) head += `Content-Type: ${part.contentType}\r\n`;
      chunks.push(Buffer.from(`${head}\r\n`));
      if (part.file === undefined)
        chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(String(part.value)));
      else chunks.push(typeof part.file === 'string' ? fs.readFileSync(part.file) : Buffer.from(part.file));
      chunks.push(Buffer.from('\r\n'));
    });
    chunks.push(Buffer.from(`--${this.boundary}--\r\n`));
    return Buffer.concat(chunks);
  }
}

module.exports = { encode, stringify, parse, Multipart, typeOf };
