'use strict';

// One document from a document split in files: the $refs to other files (and, with remote: true, to URLs) are taken
// into it. A schema referred to is put in the schemas of the document (components.schemas, or definitions in Swagger
// 2.0) with a name of its own, and the $ref points to it there: schemas used twice are one, and recursive ones work.
// What else is referred to (parameters, responses, path items...) is written where the $ref was. $refs of a file to
// itself (#/...) are of that file. Examples (example), and what schemas have that is not a schema (default, enum,
// const...), are data: not read.
//
//   const document = await bundle('./openapi.yaml');                   // ./schemas/book.yaml#/Book...
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('./yaml');

class BundleError extends Error {}

// The keys whose values are schemas, in a schema (each value of a map, each item of a list, or the value).
const SCHEMA_MAPS = new Set(['properties', 'patternProperties', 'dependentSchemas', '$defs', 'definitions']);
const SCHEMA_LISTS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
const SCHEMA_VALUES = new Set([
  'items',
  'additionalProperties',
  'additionalItems',
  'not',
  'if',
  'then',
  'else',
  'contains',
  'propertyNames',
  'unevaluatedProperties',
  'unevaluatedItems',
]);

const isRemote = (location) => /^https?:\/\//i.test(location);
const unescape = (part) => decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~');

function parse(text, location) {
  try {
    return /\.json$/i.test(location.split('?')[0]) ? JSON.parse(text) : yaml.parse(text);
  } catch (err) {
    throw new BundleError(`${location} cannot be read: ${err.message}`);
  }
}

async function bundle(source, options = {}) {
  const { remote = false, fetch: fetchFn = globalThis.fetch } = options;
  const files = new Map();
  let rootLocation;
  let root;
  if (typeof source === 'string') {
    rootLocation = isRemote(source) ? source : path.resolve(source);
    root = await load(rootLocation);
  } else if (source && typeof source === 'object') {
    // A document given: its relative $refs are of baseDir (the working directory by default).
    rootLocation = path.join(path.resolve(options.baseDir || '.'), '<document>');
    root = structuredClone(source);
    files.set(rootLocation, root);
  } else {
    throw new BundleError('bundle() takes the path of a document, or a document');
  }

  // Where the schemas go: components.schemas (OpenAPI 3) or definitions (Swagger 2.0).
  const swagger2 = typeof root.swagger === 'string';
  const schemas = swagger2
    ? (root.definitions = root.definitions || {})
    : ((root.components = root.components || {}).schemas = root.components.schemas || {});
  const prefix = swagger2 ? '#/definitions/' : '#/components/schemas/';
  const names = new Map(); // the location#pointer of a schema taken in: its name
  const taken = new Set(Object.keys(schemas));

  async function load(location) {
    if (files.has(location)) return files.get(location);
    let text;
    if (isRemote(location)) {
      if (!remote) throw new BundleError(`$refs to URLs need remote: true (${location})`);
      const response = await fetchFn(location);
      if (!response.ok) throw new BundleError(`${location} answered ${response.status}`);
      text = await response.text();
    } else {
      try {
        text = fs.readFileSync(location, 'utf8');
      } catch (err) {
        throw new BundleError(`${location} cannot be read: ${err.message}`);
      }
    }
    const document = parse(text, location);
    files.set(location, document);
    return document;
  }

  // The file and pointer of a $ref of a file.
  function target(ref, location) {
    const hash = ref.indexOf('#');
    const file = hash === -1 ? ref : ref.slice(0, hash);
    const pointer = hash === -1 ? '' : ref.slice(hash + 1);
    if (!file) return { location, pointer };
    if (isRemote(file)) return { location: file, pointer };
    if (isRemote(location)) return { location: new URL(file, location).toString(), pointer };
    return { location: path.resolve(path.dirname(location), file), pointer };
  }

  async function valueAt({ location, pointer }) {
    let node = await load(location);
    if (!pointer || pointer === '/') return node;
    for (const part of pointer.replace(/^\//, '').split('/').map(unescape)) {
      if (node === null || typeof node !== 'object' || !(part in node)) {
        throw new BundleError(`#${pointer} is not in ${location}`);
      }
      node = node[part];
    }
    return node;
  }

  // A name for a schema taken in: the last name of its pointer, or the name of its file; another one when taken.
  function nameFor({ location, pointer }) {
    const last = pointer ? unescape(pointer.split('/').pop()) : path.basename(location).replace(/\.[^.]+$/, '');
    const base = last.replace(/[^\w.-]/g, '_') || 'Schema';
    let name = base;
    for (let i = 2; taken.has(name); i += 1) name = `${base}_${i}`;
    taken.add(name);
    return name;
  }

  async function walk(node, location, inSchema) {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) node[i] = await walk(node[i], location, inSchema);
      return node;
    }
    if (node === null || typeof node !== 'object') return node;
    if (typeof node.$ref === 'string') {
      const ref = node.$ref;
      // A $ref of the document to itself stays.
      if (ref.startsWith('#') && location === rootLocation) return node;
      const at = target(ref, location);
      if (inSchema) {
        const id = `${at.location}#${at.pointer}`;
        // Of the document itself (a file referred to it again): its pointer, as it is.
        if (at.location === rootLocation) return { $ref: `#${at.pointer}` };
        if (!names.has(id)) {
          const name = nameFor(at);
          names.set(id, name);
          schemas[name] = {};
          schemas[name] = await walk(structuredClone(await valueAt(at)), at.location, true);
        }
        return { $ref: `${prefix}${encodeURIComponent(names.get(id)).replace(/%2F/g, '~1')}` };
      }
      if (at.location === rootLocation) return { $ref: `#${at.pointer}` };
      return walk(structuredClone(await valueAt(at)), at.location, false);
    }
    for (const key of Object.keys(node)) {
      // Examples are data: example, and the value of an Example Object (in schemas, only their keywords of schemas are
      // read; examples maps hold $refs).
      if (!inSchema && (key === 'example' || key === 'value')) continue;
      const value = node[key];
      if (inSchema && SCHEMA_MAPS.has(key) && value && typeof value === 'object' && !Array.isArray(value)) {
        for (const name of Object.keys(value)) value[name] = await walk(value[name], location, true);
      } else if (inSchema && SCHEMA_LISTS.has(key)) {
        node[key] = await walk(value, location, true);
      } else if (inSchema && SCHEMA_VALUES.has(key)) {
        node[key] = await walk(value, location, true);
      } else if (key === 'schema') {
        node[key] = await walk(value, location, true);
      } else if (!inSchema) {
        node[key] = await walk(value, location, false);
      }
    }
    return node;
  }

  // The schemas of the document are schemas; the rest is read as OpenAPI objects.
  for (const name of Object.keys(schemas)) schemas[name] = await walk(schemas[name], rootLocation, true);
  for (const key of Object.keys(root)) {
    if (key === 'definitions' && swagger2) continue;
    if (key === 'components' && root.components) {
      for (const part of Object.keys(root.components)) {
        if (part !== 'schemas') root.components[part] = await walk(root.components[part], rootLocation, false);
      }
      continue;
    }
    root[key] = await walk(root[key], rootLocation, false);
  }
  return root;
}

module.exports = { bundle, BundleError };
