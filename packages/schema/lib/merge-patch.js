'use strict';

// The keywords $merge and $patch of ajv-merge-patch: a schema made from another one (source) and a JSON Merge Patch
// (RFC 7386, $merge) or a JSON Patch (RFC 6902, $patch), made before the schema is compiled.
//
//   { $merge: { source: { $ref: 'book.json#' }, with: { required: ['isbn'] } } }
//   { $patch: { source: { $ref: '#/definitions/book' }, with: [{ op: 'add', path: '/properties/isbn', value: { type: 'string' } }] } }
//
// The source is a schema, or a $ref to one, resolved from the node as every $ref (a schema of the option `schemas`,
// the document, a JSON Pointer in one of them): see mergedNode() in json-schema.js, which applies them.
const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function mergePatch(target, patch) {
  if (!isPlain(patch)) return clone(patch);
  const out = isPlain(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else out[key] = mergePatch(out[key], value);
  }
  return out;
}

// The parent and the key of a JSON Pointer in a document.
function locate(document, pointer, what) {
  if (pointer === '') return { parent: null, key: null };
  if (!pointer.startsWith('/')) throw new Error(`${what}: ${pointer} is not a JSON Pointer`);
  const keys = pointer
    .slice(1)
    .split('/')
    .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'));
  let parent = document;
  for (const key of keys.slice(0, -1)) {
    parent = parent === null || typeof parent !== 'object' ? undefined : parent[key];
    if (parent === undefined) throw new Error(`${what}: no ${pointer}`);
  }
  return { parent, key: keys[keys.length - 1] };
}

function getAt(document, pointer, what) {
  if (pointer === '') return document;
  const { parent, key } = locate(document, pointer, what);
  if (parent === null || typeof parent !== 'object' || !(key in parent)) throw new Error(`${what}: no ${pointer}`);
  return parent[key];
}

// JSON Patch: add, remove, replace, move, copy and test, on a copy of the document.
function applyPatch(document, operations, what) {
  if (!Array.isArray(operations)) throw new Error(`${what}: "with" is a list of operations (JSON Patch)`);
  let doc = clone(document);
  const put = (pointer, value, replace) => {
    if (pointer === '') {
      doc = value;
      return;
    }
    const { parent, key } = locate(doc, pointer, what);
    if (Array.isArray(parent)) {
      const index = key === '-' ? parent.length : Number(key);
      if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new Error(`${what}: no ${pointer}`);
      if (replace) parent[index] = value;
      else parent.splice(index, 0, value);
    } else if (parent !== null && typeof parent === 'object') {
      if (replace && !(key in parent)) throw new Error(`${what}: no ${pointer} to replace`);
      parent[key] = value;
    } else throw new Error(`${what}: no ${pointer}`);
  };
  const take = (pointer) => {
    const { parent, key } = locate(doc, pointer, what);
    const value = getAt(doc, pointer, what);
    if (Array.isArray(parent)) parent.splice(Number(key), 1);
    else delete parent[key];
    return value;
  };
  for (const operation of operations) {
    const { op, path, from, value } = operation || {};
    if (typeof path !== 'string') throw new Error(`${what}: an operation without a path`);
    if (op === 'add') put(path, clone(value), false);
    else if (op === 'remove') take(path);
    else if (op === 'replace') put(path, clone(value), true);
    else if (op === 'move') put(path, take(from), false);
    else if (op === 'copy') put(path, clone(getAt(doc, from, what)), false);
    else if (op === 'test') {
      if (JSON.stringify(getAt(doc, path, what)) !== JSON.stringify(value)) {
        throw new Error(`${what}: the test of ${path} failed`);
      }
    } else throw new Error(`${what}: ${op} is not an operation of JSON Patch`);
  }
  return doc;
}

module.exports = { mergePatch, applyPatch };
