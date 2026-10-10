// Merging of JSON schemas (for allOf, and the branches of anyOf / oneOf with the keywords around them): each keyword
// is combined by its meaning (types intersected, required united, bounds narrowed...). A keyword with values that can
// not be combined is dropped.
import { deepEqual } from './deep-equal.js';

class MergeError extends Error {
  constructor(keyword, values) {
    super(`Failed to merge "${keyword}" keyword schemas.`);
    this.keyword = keyword;
    this.values = values;
    this.schemas = values;
  }
}

function intersection(arrays) {
  let out = arrays[0];
  for (let i = 1; i < arrays.length; i += 1) out = out.filter((value) => arrays[i].some((v) => deepEqual(v, value)));
  return out;
}

function union(arrays) {
  const out = [];
  for (const array of arrays) for (const value of array) if (!out.some((v) => deepEqual(v, value))) out.push(value);
  return out;
}

function allEqual(keyword, values, merged) {
  for (let i = 1; i < values.length; i += 1) {
    if (!deepEqual(values[i], values[0])) throw new MergeError(keyword, values);
  }
  merged[keyword] = values[0];
}

const resolvers = {
  $id: () => {},
  type(keyword, values, merged) {
    const arrays = values.map((value) => (Array.isArray(value) ? value : [value]));
    const types = intersection(arrays);
    if (types.length === 0) throw new MergeError(keyword, arrays);
    merged[keyword] = types.length === 1 ? types[0] : types;
  },
  enum(keyword, values, merged) {
    const common = intersection(values);
    if (common.length === 0) throw new MergeError(keyword, values);
    merged[keyword] = common;
  },
  minLength: maxNumber,
  maxLength: minNumber,
  minimum: maxNumber,
  maximum: minNumber,
  exclusiveMinimum: maxNumber,
  exclusiveMaximum: minNumber,
  minItems: maxNumber,
  maxItems: minNumber,
  minProperties: maxNumber,
  maxProperties: minNumber,
  multipleOf(keyword, values, merged) {
    const gcd = (a, b) => (!b ? a : gcd(b, a % b));
    let scale = 1;
    for (const value of values) while ((value * scale) % 1 !== 0) scale *= 10;
    let multiple = values[0] * scale;
    for (const value of values) multiple = (multiple * value * scale) / gcd(multiple, value * scale);
    merged[keyword] = multiple / scale;
  },
  const: allEqual,
  default: allEqual,
  format: allEqual,
  required(keyword, values, merged) {
    merged[keyword] = union(values);
  },
  allOf(keyword, values, merged) {
    merged[keyword] = union(values);
  },
  properties(keyword, values, merged, schemas, options) {
    const found = {};
    for (const schema of schemas) {
      for (const name of Object.keys(schema.properties || {})) {
        if (found[name] !== undefined) continue;
        found[name] = [schema.properties[name]];
        for (const other of schemas) {
          if (other === schema) continue;
          const propertySchema = schemaForProperty(other, name);
          if (propertySchema !== undefined) found[name].push(propertySchema);
        }
      }
    }
    const out = {};
    for (const name of Object.keys(found)) out[name] = mergeAll(found[name], options);
    merged[keyword] = out;
  },
  patternProperties: mergeObjects,
  definitions: mergeObjects,
  $defs: mergeObjects,
  dependentSchemas: mergeObjects,
  additionalProperties: mergeSubschemas,
  not: mergeSubschemas,
  propertyNames: mergeSubschemas,
  contains: mergeSubschemas,
  items(keyword, values, merged, schemas, options) {
    const tupleLength = Math.max(0, ...values.map((v) => (Array.isArray(v) ? v.length : 0)));
    if (tupleLength === 0) {
      merged[keyword] = mergeAll(values, options);
      return;
    }
    const items = [];
    for (let i = 0; i < tupleLength; i += 1) {
      const atIndex = [];
      for (const schema of schemas) {
        const itemSchema = schemaForItem(schema, i);
        if (itemSchema !== undefined) atIndex.push(itemSchema);
      }
      items[i] = mergeAll(atIndex, options);
    }
    merged[keyword] = items;
  },
  additionalItems(keyword, values, merged, schemas, options) {
    if (!schemas.some((schema) => Array.isArray(schema.items))) {
      merged[keyword] = mergeAll(values, options);
      return;
    }
    const additional = [];
    for (const schema of schemas) {
      let value = schema.additionalItems;
      if (value === undefined && !Array.isArray(schema.items)) value = schema.items;
      if (value !== undefined) additional.push(value);
    }
    merged[keyword] = mergeAll(additional, options);
  },
  nullable(keyword, values, merged) {
    merged[keyword] = values.every((value) => value !== false);
  },
  uniqueItems(keyword, values, merged) {
    merged[keyword] = values.some((value) => value === true);
  },
  oneOf: mergeOneOf,
  anyOf: mergeOneOf,
  if(keyword, values, merged, schemas, options) {
    for (const schema of schemas) {
      if (schema.if === undefined) continue;
      const sub = { if: schema.if, then: schema.then, else: schema.else };
      if (merged.if === undefined) {
        merged.if = sub.if;
        if (sub.then !== undefined) merged.then = sub.then;
        if (sub.else !== undefined) merged.else = sub.else;
        continue;
      }
      if (merged.then !== undefined) merged.then = mergeAll([merged.then, sub], options);
      if (merged.else !== undefined) merged.else = mergeAll([merged.else, sub], options);
    }
  },
  then: () => {},
  else: () => {},
  dependencies: mergeDependencies,
  dependentRequired: mergeDependencies,
};

function minNumber(keyword, values, merged) {
  merged[keyword] = Math.min(...values);
}

function maxNumber(keyword, values, merged) {
  merged[keyword] = Math.max(...values);
}

function mergeSubschemas(keyword, values, merged, schemas, options) {
  merged[keyword] = mergeAll(values, options);
}

function mergeObjects(keyword, values, merged, schemas, options) {
  const grouped = {};
  for (const value of values) {
    for (const name of Object.keys(value)) (grouped[name] = grouped[name] || []).push(value[name]);
  }
  const out = {};
  for (const name of Object.keys(grouped)) out[name] = mergeAll(grouped[name], options);
  merged[keyword] = out;
}

function mergeDependencies(keyword, values, merged) {
  const out = {};
  for (const dependencies of values) {
    for (const name of Object.keys(dependencies)) {
      out[name] = out[name] || [];
      for (const dependency of dependencies[name]) if (!out[name].includes(dependency)) out[name].push(dependency);
    }
  }
  merged[keyword] = out;
}

function mergeOneOf(keyword, values, merged, schemas, options) {
  if (values.length === 1) {
    merged[keyword] = values[0];
    return;
  }
  let product = [[]];
  for (const array of values) product = product.flatMap((combination) => array.map((item) => [...combination, item]));
  const out = [];
  for (const combination of product) {
    try {
      const schema = mergeAll(combination, options);
      if (schema !== undefined) out.push(schema);
    } catch (err) {
      if (!(err instanceof MergeError)) throw err;
    }
  }
  merged[keyword] = out;
}

function schemaForItem(schema, index) {
  const { items, additionalItems } = schema;
  if (Array.isArray(items)) return index < items.length ? items[index] : additionalItems;
  return items !== undefined ? items : additionalItems;
}

function schemaForProperty(schema, name) {
  if (schema.properties && schema.properties[name] !== undefined) return schema.properties[name];
  for (const pattern of Object.keys(schema.patternProperties || {})) {
    if (new RegExp(pattern).test(name)) return schema.patternProperties[pattern];
  }
  return schema.additionalProperties;
}

// Conflicting values of other keywords: equal ones are kept, different ones dropped.
function defaultResolver(keyword, values, merged) {
  if (values.length === 1 || values.every((value) => deepEqual(value, values[0]))) merged[keyword] = values[0];
}

function mergeAll(schemas, options = {}) {
  if (schemas.length === 0) return {};
  if (schemas.length === 1) return schemas[0];
  const keywords = {};
  let allTrue = true;
  for (const schema of schemas) {
    if (schema === false) return false;
    if (schema === true) continue;
    allTrue = false;
    for (const keyword of Object.keys(schema)) (keywords[keyword] = keywords[keyword] || []).push(schema[keyword]);
  }
  if (allTrue) return true;
  const merged = {};
  const relevant = schemas.filter((schema) => schema !== true);
  for (const keyword of Object.keys(keywords)) {
    const resolver = resolvers[keyword] || defaultResolver;
    resolver(keyword, keywords[keyword], merged, relevant, options);
  }
  return merged;
}

export { mergeAll as mergeSchemas, MergeError };
