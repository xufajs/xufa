// Resolution of $ref: schemas are registered by their $id (or a key), with the $id and anchors they hold inside.
// A reference is resolved against the base URI of the schema holding it.

const { deepEqual } = require('./deep-equal');

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function stripHash(uri) {
  return uri.endsWith('#') ? uri.slice(0, -1) : uri;
}

// The URI of a reference relative to a base. Plain names ('user') are kept as they are.
function resolveURI(base, ref) {
  if (ref === '') return base;
  if (SCHEME.test(ref)) return stripHash(ref);
  if (base && SCHEME.test(base)) {
    try {
      return stripHash(new URL(ref, base).href);
    } catch {
      return ref;
    }
  }
  return ref;
}

function unescapePointerSegment(segment) {
  let out = segment.replace(/~1/g, '/').replace(/~0/g, '~');
  if (out.includes('%')) {
    try {
      out = decodeURIComponent(out);
    } catch {
      // kept as written
    }
  }
  return out;
}

class RefResolver {
  constructor() {
    this.docs = new Map(); // URI -> schema
    this.anchors = new Map(); // URI#name -> { schema, base }
    this.bases = new Map(); // schema object -> base URI
  }

  hasSchema(uri) {
    return this.docs.has(stripHash(uri));
  }

  getSchema(uri) {
    return this.docs.get(stripHash(uri));
  }

  addSchema(schema, key) {
    let id = key;
    if (schema && typeof schema === 'object' && typeof schema.$id === 'string' && schema.$id[0] !== '#') {
      id = resolveURI(key && SCHEME.test(key) ? key : '', schema.$id);
    }
    id = stripHash(id);
    if (!this.docs.has(id)) this.docs.set(id, schema);
    if (key !== undefined && stripHash(key) !== id && !this.docs.has(stripHash(key)))
      this.docs.set(stripHash(key), schema);
    this.walk(schema, id, true);
    return id;
  }

  walk(schema, base, isRoot) {
    if (schema === null || typeof schema !== 'object') return;
    if (Array.isArray(schema)) {
      for (const item of schema) this.walk(item, base, false);
      return;
    }
    let current = base;
    if (typeof schema.$id === 'string') {
      if (schema.$id[0] === '#') {
        const key = `${base}${schema.$id}`;
        const existing = this.anchors.get(key);
        if (existing && existing.schema !== schema && !deepEqual(existing.schema, schema)) {
          throw new Error(`There is already another anchor "${schema.$id}" in schema "${base}".`);
        }
        this.anchors.set(key, { schema, base });
      } else if (!isRoot) {
        current = resolveURI(base, schema.$id);
        const existing = this.docs.get(current);
        if (existing !== undefined && existing !== schema && !deepEqual(existing, schema)) {
          throw new Error(`There is already another schema with id "${current}".`);
        }
        if (existing === undefined) this.docs.set(current, schema);
      }
    }
    if (typeof schema.$anchor === 'string') this.anchors.set(`${current}#${schema.$anchor}`, { schema, base: current });
    if (!this.bases.has(schema)) this.bases.set(schema, current);
    for (const key of Object.keys(schema)) {
      // enum and const hold values, not schemas
      if (key === 'enum' || key === 'const' || key === 'default' || key === 'examples') continue;
      const value = schema[key];
      if (value !== null && typeof value === 'object') this.walk(value, current, false);
    }
  }

  baseOf(schema, fallback) {
    return this.bases.get(schema) || fallback;
  }

  // The id of the document a reference points to when no such document is known, else null.
  missingDocument(ref, base) {
    const hash = ref.indexOf('#');
    const uriPart = hash === -1 ? ref : ref.slice(0, hash);
    const uri = uriPart === '' ? base : resolveURI(base, uriPart);
    return this.docs.has(uri) ? null : uri;
  }

  // { schema, base, pointer } of a reference, or null.
  resolve(ref, base) {
    const hash = ref.indexOf('#');
    const uriPart = hash === -1 ? ref : ref.slice(0, hash);
    const fragment = hash === -1 ? '' : ref.slice(hash + 1);
    const uri = uriPart === '' ? base : resolveURI(base, uriPart);
    if (fragment !== '' && fragment[0] !== '/') {
      const anchor = this.anchors.get(`${uri}#${fragment}`);
      return anchor ? { schema: anchor.schema, base: anchor.base, pointer: `#${fragment}` } : null;
    }
    const doc = this.docs.get(uri);
    if (doc === undefined) return null;
    if (fragment === '') return { schema: doc, base: uri, pointer: '#' };
    let schema = doc;
    let current = uri;
    const segments = fragment.slice(1).split('/').map(unescapePointerSegment);
    for (const segment of segments) {
      if (schema === null || typeof schema !== 'object' || !(segment in schema)) return null;
      schema = schema[segment];
      if (schema && typeof schema === 'object' && typeof schema.$id === 'string' && schema.$id[0] !== '#') {
        current = resolveURI(current, schema.$id);
      }
    }
    return { schema, base: current, pointer: `#${fragment}` };
  }
}

module.exports = { RefResolver, resolveURI };
