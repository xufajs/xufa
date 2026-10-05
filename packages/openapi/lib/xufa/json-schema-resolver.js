'use strict';

// json-schema-resolver 3.0.0 (MIT, Manuel Spigolon), with lib/xufa/uri.js for fast-uri, lib/xufa/clone.js for rfdc
// and without debug: the shared schemas ($id) of an app as definitions, and the $refs to them rewritten to
// '#/definitions/<name>'. Target: JSON Schema draft-07.
const { EventEmitter } = require('node:events');
const URI = require('./uri');
const cloner = require('./clone');

const kIgnore = Symbol('json-schema-resolver.ignore'); // untrack a schema (usually the root one)
const kRefToDef = Symbol('json-schema-resolver.refToDef'); // assign to an external json a new reference
const kConsumed = Symbol('json-schema-resolver.consumed'); // when an external json has been referenced

const defaultOpts = {
  target: 'draft-07',
  clone: false,
  buildLocalReference(json, baseUri, fragment, i) {
    return `def-${i}`;
  },
};

const targetSupported = ['draft-07'];
const targetCfg = {
  'draft-07': { def: 'definitions' },
  'draft-08': { def: '$defs' },
};

function mapIds(ee, baseUri, json) {
  if (!(json instanceof Object)) return;

  if (json.$id) {
    const $idUri = URI.parse(json.$id);
    let fragment = null;

    if ($idUri.reference === 'absolute') {
      // "$id": "http://example.com/root.json"
      baseUri = $idUri; // a new baseURI for children
    } else if ($idUri.reference === 'relative') {
      // "$id": "other.json",
      const newBaseUri = { ...baseUri };
      newBaseUri.path = $idUri.path;
      newBaseUri.fragment = $idUri.fragment;
      baseUri = newBaseUri;
    } else {
      // { "$id": "#bar" }
      fragment = $idUri;
    }
    ee.emit('$id', json, baseUri, fragment);
  }

  for (const prop of Object.keys(json)) {
    if (prop === '$ref') ee.emit('$ref', json, baseUri, json[prop]);
    mapIds(ee, baseUri, json[prop]);
  }
}

function getRootUri(strUri = 'application.uri') {
  // The value of $id must be a URI-reference (RFC 3986), without its fragment.
  const uri = URI.parse(strUri);
  uri.fragment = undefined;
  return uri;
}

// logic: https://json-schema.org/draft/2019-09/json-schema-core.html#rfc.appendix.B.1
function jsonSchemaResolver(options) {
  const ee = new EventEmitter();
  const {
    clone,
    target,
    applicationUri,
    externalSchemas: rootExternalSchemas,
    buildLocalReference,
  } = { ...defaultOpts, ...options };

  const allIds = new Map();
  let rolling = 0;
  const allRefs = [];

  function collectIds(json, baseUri, fragment) {
    if (json[kIgnore]) return;
    const rel = (fragment && URI.serialize(fragment)) || '';
    const id = URI.serialize(baseUri) + rel;
    if (!allIds.has(id)) {
      const value = buildLocalReference(json, baseUri, fragment, rolling++);
      Object.defineProperty(json, kRefToDef, { value, enumerable: false });
      allIds.set(id, json);
    }
  }

  function collectRefs(json, baseUri, refVal) {
    const refUri = URI.parse(refVal);
    if (refUri.reference === 'relative') {
      refUri.scheme = baseUri.scheme;
      refUri.userinfo = baseUri.userinfo;
      refUri.host = baseUri.host;
      refUri.port = baseUri.port;
      const newBaseUri = { ...baseUri };
      newBaseUri.path = refUri.path;
      baseUri = newBaseUri;
    } else if (refUri.reference === 'uri' || refUri.reference === 'absolute') {
      baseUri = { ...refUri, fragment: undefined };
    }
    allRefs.push({ baseUri: URI.serialize(baseUri), refUri, ref: URI.serialize(refUri), json });
  }

  ee.on('$id', collectIds);
  ee.on('$ref', collectRefs);

  if (!targetSupported.includes(target)) throw new Error(`Unsupported JSON schema version ${target}`);

  let defaultUri;
  if (applicationUri) {
    defaultUri = getRootUri(applicationUri);
    if (rootExternalSchemas) for (const es of rootExternalSchemas) mapIds(ee, defaultUri, es);
  } else if (rootExternalSchemas) {
    throw new Error('If you set root externalSchema, the applicationUri option is needed');
  }

  function resolve(rootSchema, opts) {
    const { externalSchemas } = opts || {};
    if (!rootExternalSchemas) allIds.clear();
    allRefs.length = 0;
    if (clone) rootSchema = cloner(rootSchema);

    const appUri = defaultUri || getRootUri(rootSchema.$id);
    if (externalSchemas) for (const es of externalSchemas) mapIds(ee, appUri, es);

    const baseUri = URI.serialize(appUri); // canonical absolute-URI
    if (rootSchema.$id) rootSchema.$id = baseUri; // fix the schema $id value
    Object.defineProperty(rootSchema, kIgnore, { value: true, enumerable: false });

    mapIds(ee, appUri, rootSchema);

    for (const { baseUri: refBase, ref, refUri, json } of allRefs) {
      if (ref[0] === '#') continue;
      const evaluatedJson = allIds.get(refBase);
      if (!evaluatedJson) continue; // an external $ref that was not given
      Object.defineProperty(evaluatedJson, kConsumed, { value: true, enumerable: false });
      json.$ref = `#/definitions/${evaluatedJson[kRefToDef]}${refUri.fragment || ''}`;
    }

    if (externalSchemas) {
      // Only the external schemas that were referenced become definitions.
      const defKey = targetCfg[target].def;
      allIds.forEach((json) => {
        if (json[kConsumed] === true) {
          if (!rootSchema[defKey]) rootSchema[defKey] = {};
          rootSchema[defKey][json[kRefToDef]] = json;
        }
      });
    }
    return rootSchema;
  }

  return {
    resolve,
    definitions() {
      const defKey = targetCfg[target].def;
      const x = { [defKey]: {} };
      allIds.forEach((json) => {
        x[defKey][json[kRefToDef]] = json;
      });
      return x;
    },
  };
}

module.exports = jsonSchemaResolver;
