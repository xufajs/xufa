// mime-types' lookup and contentType on the table of mime-db (./mime-db.js): the types of files of @xufa/http (form-data)
// and of @xufa/express.
import path from 'node:path';
import { TYPES, EXTENSIONS, CHARSETS } from './mime-db.js';

// The type of a path or an extension ('html', '.html', 'a/b.html'), or false.
export function lookup(name) {
  if (!name || typeof name !== 'string') return false;
  const extension = path.extname(`x.${name}`).toLowerCase().slice(1);
  return (extension && TYPES[extension]) || false;
}

// The charset of a type: its own, or UTF-8 for text/*; false without one.
export function charset(type) {
  if (!type || typeof type !== 'string') return false;
  const match = /^\s*([^;\s]*)(?:;|\s|$)/.exec(type);
  const name = match && match[1].toLowerCase();
  if (name && CHARSETS[name]) return CHARSETS[name];
  if (match && /^text\//i.test(match[1])) return 'UTF-8';
  return false;
}

// A Content-Type of a type or an extension, with its charset; false for an unknown extension. (The answers are kept,
// up to 100 values: an app sets the same few types again and again.)
const answers = new Map();
export function contentType(value) {
  let type = answers.get(value);
  if (type === undefined) {
    type = findContentType(value);
    if (typeof value === 'string') {
      if (answers.size >= 100) answers.clear();
      answers.set(value, type);
    }
  }
  return type;
}

function findContentType(value) {
  if (!value || typeof value !== 'string') return false;
  let type = value.indexOf('/') === -1 ? lookup(value) : value;
  if (!type) return false;
  if (type.indexOf('charset') === -1) {
    const set = charset(type);
    if (set) type += `; charset=${set.toLowerCase()}`;
  }
  return type;
}

// The extension of a type (its first in mime-db), or false.
export function extension(type) {
  if (!type || typeof type !== 'string') return false;
  const match = /^\s*([^;\s]*)(?:;|\s|$)/.exec(type);
  const extensions = match && EXTENSIONS[match[1].toLowerCase()];
  return extensions && extensions.length ? extensions[0] : false;
}
