// Validation of schemas against the meta-schema of draft-07, reporting the first error the way ajv does
// ("data/properties/claws/type must be equal to one of the allowed values"). Keywords are checked in the order of the
// meta-schema, as ajv checks them.

const SIMPLE_TYPES = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);

class SchemaError extends Error {}

function fail(path, message) {
  throw new SchemaError(`data${path} ${message}`);
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isSchema = (value) => typeof value === 'boolean' || isObject(value);

function isRegex(source) {
  try {
    // eslint-disable-next-line no-new
    new RegExp(source, 'u');
    return true;
  } catch {
    return false;
  }
}

function nonNegativeInteger(value, path) {
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(path, 'must be integer');
  if (value < 0) fail(path, 'must be >= 0');
}

function number(value, path) {
  if (typeof value !== 'number') fail(path, 'must be number');
}

function schema(value, path) {
  if (!isSchema(value)) fail(path, 'must be object,boolean');
  if (typeof value === 'boolean') return;
  const s = value;
  if (s.$id !== undefined && typeof s.$id !== 'string') fail(`${path}/$id`, 'must be string');
  if (s.$schema !== undefined && typeof s.$schema !== 'string') fail(`${path}/$schema`, 'must be string');
  if (s.$ref !== undefined && typeof s.$ref !== 'string') fail(`${path}/$ref`, 'must be string');
  if (s.$comment !== undefined && typeof s.$comment !== 'string') fail(`${path}/$comment`, 'must be string');
  if (s.title !== undefined && typeof s.title !== 'string') fail(`${path}/title`, 'must be string');
  if (s.description !== undefined && typeof s.description !== 'string') fail(`${path}/description`, 'must be string');
  if (s.readOnly !== undefined && typeof s.readOnly !== 'boolean') fail(`${path}/readOnly`, 'must be boolean');
  if (s.examples !== undefined && !Array.isArray(s.examples)) fail(`${path}/examples`, 'must be array');
  if (s.multipleOf !== undefined) {
    number(s.multipleOf, `${path}/multipleOf`);
    if (s.multipleOf <= 0) fail(`${path}/multipleOf`, 'must be > 0');
  }
  for (const key of ['maximum', 'exclusiveMaximum', 'minimum', 'exclusiveMinimum']) {
    // draft-04 schemas have booleans for the exclusive ones
    if (s[key] !== undefined && typeof s[key] !== 'boolean') number(s[key], `${path}/${key}`);
  }
  if (s.maxLength !== undefined) nonNegativeInteger(s.maxLength, `${path}/maxLength`);
  if (s.minLength !== undefined) nonNegativeInteger(s.minLength, `${path}/minLength`);
  if (s.pattern !== undefined) {
    if (typeof s.pattern !== 'string') fail(`${path}/pattern`, 'must be string');
    if (!isRegex(s.pattern)) fail(`${path}/pattern`, 'must match format "regex"');
  }
  if (s.additionalItems !== undefined) schema(s.additionalItems, `${path}/additionalItems`);
  if (s.items !== undefined) {
    if (Array.isArray(s.items)) {
      if (s.items.length === 0) fail(`${path}/items`, 'must NOT have fewer than 1 items');
      s.items.forEach((item, i) => schema(item, `${path}/items/${i}`));
    } else {
      schema(s.items, `${path}/items`);
    }
  }
  if (s.maxItems !== undefined) nonNegativeInteger(s.maxItems, `${path}/maxItems`);
  if (s.minItems !== undefined) nonNegativeInteger(s.minItems, `${path}/minItems`);
  if (s.uniqueItems !== undefined && typeof s.uniqueItems !== 'boolean') fail(`${path}/uniqueItems`, 'must be boolean');
  if (s.contains !== undefined) schema(s.contains, `${path}/contains`);
  if (s.maxProperties !== undefined) nonNegativeInteger(s.maxProperties, `${path}/maxProperties`);
  if (s.minProperties !== undefined) nonNegativeInteger(s.minProperties, `${path}/minProperties`);
  if (s.required !== undefined) {
    if (!Array.isArray(s.required)) fail(`${path}/required`, 'must be array');
    s.required.forEach((item, i) => {
      if (typeof item !== 'string') fail(`${path}/required/${i}`, 'must be string');
    });
  }
  if (s.additionalProperties !== undefined) schema(s.additionalProperties, `${path}/additionalProperties`);
  schemaMap(s.definitions, `${path}/definitions`);
  schemaMap(s.properties, `${path}/properties`);
  if (s.patternProperties !== undefined) {
    if (!isObject(s.patternProperties)) fail(`${path}/patternProperties`, 'must be object');
    for (const key of Object.keys(s.patternProperties)) {
      if (!isRegex(key)) fail(`${path}/patternProperties`, 'must match format "regex"');
    }
    schemaMap(s.patternProperties, `${path}/patternProperties`);
  }
  if (s.dependencies !== undefined) {
    if (!isObject(s.dependencies)) fail(`${path}/dependencies`, 'must be object');
    for (const key of Object.keys(s.dependencies)) {
      const dep = s.dependencies[key];
      if (!Array.isArray(dep)) schema(dep, `${path}/dependencies/${key}`);
    }
  }
  if (s.propertyNames !== undefined) schema(s.propertyNames, `${path}/propertyNames`);
  if (s.enum !== undefined && !Array.isArray(s.enum)) fail(`${path}/enum`, 'must be array');
  if (s.type !== undefined) {
    if (Array.isArray(s.type)) {
      s.type.forEach((type, i) => {
        if (!SIMPLE_TYPES.has(type)) fail(`${path}/type/${i}`, 'must be equal to one of the allowed values');
      });
    } else if (!SIMPLE_TYPES.has(s.type)) {
      fail(`${path}/type`, 'must be equal to one of the allowed values');
    }
  }
  if (s.format !== undefined && typeof s.format !== 'string') fail(`${path}/format`, 'must be string');
  if (s.if !== undefined) schema(s.if, `${path}/if`);
  if (s.then !== undefined) schema(s.then, `${path}/then`);
  if (s.else !== undefined) schema(s.else, `${path}/else`);
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (s[key] === undefined) continue;
    if (!Array.isArray(s[key])) fail(`${path}/${key}`, 'must be array');
    if (s[key].length === 0) fail(`${path}/${key}`, 'must NOT have fewer than 1 items');
    s[key].forEach((item, i) => schema(item, `${path}/${key}/${i}`));
  }
  if (s.not !== undefined) schema(s.not, `${path}/not`);
}

function schemaMap(map, path) {
  if (map === undefined) return;
  if (!isObject(map)) fail(path, 'must be object');
  for (const key of Object.keys(map)) schema(map[key], `${path}/${key}`);
}

// Throws "<name> schema is invalid: data... <message>" for the first error found.
function validateSchema(value, name) {
  try {
    schema(value, '');
  } catch (err) {
    if (!(err instanceof SchemaError)) throw err;
    throw new Error(`${name ? `"${name}" ` : ''}schema is invalid: ${err.message}`);
  }
}

export { validateSchema };
