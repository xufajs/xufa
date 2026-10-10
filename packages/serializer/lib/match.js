// Predicates compiled from JSON schemas: whether a value matches a schema. Used to choose the branch of anyOf, oneOf
// and if/then/else to serialize a value with. Strings also match values with a toJSON() method (Dates), as they are
// written as strings.
import { deepEqual } from './deep-equal.js';

const FORMATS = {
  'date-time': /^\d{4}-\d\d-\d\d[tT ]\d\d:\d\d:\d\d(?:\.\d+)?(?:[zZ]|[+-]\d\d(?::?\d\d)?)$/,
  date: /^\d{4}-\d\d-\d\d$/,
  time: /^\d\d:\d\d:\d\d(?:\.\d+)?(?:[zZ]|[+-]\d\d(?::?\d\d)?)?$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
  ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/,
  uri: /^[a-z][a-z0-9+.-]*:[^\s]*$/i,
};

const ALWAYS = () => true;
const NEVER = () => false;

const NUMERIC = /^\s*-?\d+(\.\d+)?([eE][+-]?\d+)?\s*$/;
const isTyped = (v, types) => types.includes(typeof v);

// With coercion (ajv's coerceTypes), the values ajv would convert to the type match it too.
function coercedTypeCheck(type) {
  switch (type) {
    case 'string':
      return (v) =>
        isTyped(v, ['string', 'number', 'boolean']) ||
        (v !== null && typeof v === 'object' && typeof v.toJSON === 'function');
    case 'number':
      return (v) =>
        (typeof v === 'number' && Number.isFinite(v)) ||
        typeof v === 'boolean' ||
        v === null ||
        (typeof v === 'string' && NUMERIC.test(v));
    case 'integer':
      return (v) =>
        Number.isInteger(v) ||
        typeof v === 'boolean' ||
        v === null ||
        (typeof v === 'string' && NUMERIC.test(v) && Number.isInteger(Number(v)));
    case 'boolean':
      return (v) => typeof v === 'boolean' || v === 'true' || v === 'false' || v === 1 || v === 0 || v === null;
    case 'null':
      return (v) => v === null || v === '' || v === 0 || v === false;
    default:
      return typeCheck(type);
  }
}

function typeCheck(type) {
  switch (type) {
    case 'null':
      return (v) => v === null;
    case 'boolean':
      return (v) => typeof v === 'boolean';
    case 'integer':
      return (v) => Number.isInteger(v);
    case 'number':
      return (v) => typeof v === 'number' && Number.isFinite(v);
    case 'string':
      return (v) => typeof v === 'string' || (v !== null && typeof v === 'object' && typeof v.toJSON === 'function');
    case 'array':
      return (v) => Array.isArray(v);
    case 'object':
      return (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    default:
      return NEVER;
  }
}

const length = (str) => [...str].length;

// compile(schema, base) -> (value) => boolean; refs are resolved by `resolver` against the base URI.
function createMatcher(resolver, options = {}) {
  const cache = new Map();
  const checkType = options.coerceTypes ? coercedTypeCheck : typeCheck;

  function compile(schema, base) {
    if (schema === true || schema === undefined) return ALWAYS;
    if (schema === false) return NEVER;
    if (cache.has(schema)) return cache.get(schema);
    // Placeholder for recursive schemas, replaced below.
    let compiled = null;
    const lazy = (value) => compiled(value);
    cache.set(schema, lazy);
    const checks = [];
    const schemaBase = resolver.baseOf(schema, base);

    if (schema.$ref !== undefined) {
      const target = resolver.resolve(schema.$ref, schemaBase);
      if (target === null) throw new Error(`Cannot find reference "${schema.$ref}"`);
      checks.push(compile(target.schema, target.base));
    }
    if (schema.type !== undefined) {
      const types = (Array.isArray(schema.type) ? schema.type : [schema.type]).map(checkType);
      if (schema.nullable === true) types.push(typeCheck('null'));
      checks.push(types.length === 1 ? types[0] : (v) => types.some((check) => check(v)));
    }
    if (schema.const !== undefined) {
      const expected = schema.const;
      checks.push((v) => deepEqual(v, expected) || (schema.nullable === true && v === null));
    }
    if (Array.isArray(schema.enum)) {
      const values = schema.enum;
      checks.push((v) => values.some((e) => deepEqual(v, e)) || (schema.nullable === true && v === null));
    }
    addStringChecks(schema, checks);
    addNumberChecks(schema, checks);
    addObjectChecks(schema, checks, schemaBase);
    addArrayChecks(schema, checks, schemaBase);
    for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
      if (!Array.isArray(schema[keyword])) continue;
      const subs = schema[keyword].map((sub) => compile(sub, schemaBase));
      if (keyword === 'allOf') checks.push((v) => subs.every((check) => check(v)));
      else if (keyword === 'anyOf') checks.push((v) => subs.some((check) => check(v)));
      else checks.push((v) => subs.filter((check) => check(v)).length === 1);
    }
    if (schema.not !== undefined) {
      const not = compile(schema.not, schemaBase);
      checks.push((v) => !not(v));
    }
    if (schema.if !== undefined) {
      const test = compile(schema.if, schemaBase);
      const then = compile(schema.then, schemaBase);
      const otherwise = compile(schema.else, schemaBase);
      checks.push((v) => (test(v) ? then(v) : otherwise(v)));
    }
    compiled = checks.length === 0 ? ALWAYS : checks.length === 1 ? checks[0] : (v) => checks.every((c) => c(v));
    cache.set(schema, compiled);
    return compiled;
  }

  function addStringChecks(schema, checks) {
    const isString = (v) => typeof v === 'string';
    if (schema.minLength !== undefined) checks.push((v) => !isString(v) || length(v) >= schema.minLength);
    if (schema.maxLength !== undefined) checks.push((v) => !isString(v) || length(v) <= schema.maxLength);
    if (schema.pattern !== undefined) {
      const regex = new RegExp(schema.pattern, 'u');
      checks.push((v) => !isString(v) || regex.test(v));
    }
    if (schema.format !== undefined && FORMATS[schema.format]) {
      const regex = FORMATS[schema.format];
      checks.push((v) => !isString(v) || regex.test(v));
    }
  }

  function addNumberChecks(schema, checks) {
    const isNumber = (v) => typeof v === 'number';
    const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf } = schema;
    if (minimum !== undefined) checks.push((v) => !isNumber(v) || v >= minimum);
    if (maximum !== undefined) checks.push((v) => !isNumber(v) || v <= maximum);
    if (typeof exclusiveMinimum === 'number') checks.push((v) => !isNumber(v) || v > exclusiveMinimum);
    if (typeof exclusiveMaximum === 'number') checks.push((v) => !isNumber(v) || v < exclusiveMaximum);
    if (multipleOf !== undefined) {
      checks.push((v) => !isNumber(v) || Math.abs(v / multipleOf - Math.round(v / multipleOf)) < 1e-9);
    }
  }

  function addObjectChecks(schema, checks, base) {
    const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (Array.isArray(schema.required) && schema.required.length > 0) {
      const required = schema.required;
      checks.push((v) => !isObject(v) || required.every((key) => v[key] !== undefined));
    }
    const properties = schema.properties ? Object.keys(schema.properties) : [];
    const propertyChecks = properties.map((key) => [key, compile(schema.properties[key], base)]);
    const patterns = schema.patternProperties
      ? Object.keys(schema.patternProperties).map((p) => [
          new RegExp(p, 'u'),
          compile(schema.patternProperties[p], base),
        ])
      : [];
    const additional = schema.additionalProperties;
    if (propertyChecks.length > 0) {
      checks.push((v) => {
        if (!isObject(v)) return true;
        for (const [key, check] of propertyChecks) if (v[key] !== undefined && !check(v[key])) return false;
        return true;
      });
    }
    if (patterns.length > 0 || (additional !== undefined && additional !== true)) {
      const additionalCheck = compile(additional, base);
      const known = new Set(properties);
      checks.push((v) => {
        if (!isObject(v)) return true;
        for (const key of Object.keys(v)) {
          if (v[key] === undefined) continue;
          let matched = known.has(key);
          for (const [regex, check] of patterns) {
            if (regex.test(key)) {
              matched = true;
              if (!check(v[key])) return false;
            }
          }
          if (!matched && additional !== undefined && !additionalCheck(v[key])) return false;
        }
        return true;
      });
    }
    if (schema.minProperties !== undefined) {
      checks.push((v) => !isObject(v) || Object.keys(v).length >= schema.minProperties);
    }
    if (schema.maxProperties !== undefined) {
      checks.push((v) => !isObject(v) || Object.keys(v).length <= schema.maxProperties);
    }
    if (schema.dependentRequired || schema.dependencies) {
      const deps = { ...schema.dependencies, ...schema.dependentRequired };
      const entries = Object.keys(deps).map((key) => [key, deps[key]]);
      const schemaDeps = entries
        .filter(([, value]) => !Array.isArray(value))
        .map(([key, value]) => [key, compile(value, base)]);
      checks.push((v) => {
        if (!isObject(v)) return true;
        for (const [key, value] of entries) {
          if (v[key] === undefined) continue;
          if (Array.isArray(value) && !value.every((k) => v[k] !== undefined)) return false;
        }
        for (const [key, check] of schemaDeps) if (v[key] !== undefined && !check(v)) return false;
        return true;
      });
    }
  }

  function addArrayChecks(schema, checks, base) {
    const { items, prefixItems, additionalItems, minItems, maxItems, uniqueItems, contains } = schema;
    if (minItems !== undefined) checks.push((v) => !Array.isArray(v) || v.length >= minItems);
    if (maxItems !== undefined) checks.push((v) => !Array.isArray(v) || v.length <= maxItems);
    const tuple = Array.isArray(prefixItems) ? prefixItems : Array.isArray(items) ? items : null;
    if (tuple) {
      const tupleChecks = tuple.map((s) => compile(s, base));
      const rest = Array.isArray(prefixItems) ? items : additionalItems;
      const restCheck = compile(rest, base);
      checks.push((v) => {
        if (!Array.isArray(v)) return true;
        for (let i = 0; i < v.length; i += 1) {
          if (i < tupleChecks.length ? !tupleChecks[i](v[i]) : !restCheck(v[i])) return false;
        }
        return true;
      });
    } else if (items !== undefined) {
      const itemCheck = compile(items, base);
      checks.push((v) => !Array.isArray(v) || v.every((item) => itemCheck(item)));
    }
    if (contains !== undefined) {
      const containsCheck = compile(contains, base);
      checks.push((v) => !Array.isArray(v) || v.some((item) => containsCheck(item)));
    }
    if (uniqueItems === true) {
      checks.push((v) => {
        if (!Array.isArray(v)) return true;
        for (let i = 0; i < v.length; i += 1)
          for (let j = i + 1; j < v.length; j += 1) if (deepEqual(v[i], v[j])) return false;
        return true;
      });
    }
  }

  return compile;
}

export { createMatcher };
