// The default validator compiler, built on @xufa/schema (loaded when a route has a schema to validate). Validation
// functions have the interface of ajv's, which the rest of the framework and custom error formatters rely on:
// fn(data) returns a boolean and sets fn.errors to ajv-like error objects ({ instancePath, schemaPath, keyword,
// params, message }) when it fails.
//
// The data is changed as fastify's ajv configuration does: coerceTypes 'array', useDefaults, removeAdditional.

const DEFAULT_OPTIONS = Object.freeze({
  coerceTypes: 'array',
  useDefaults: true,
  removeAdditional: true,
  allErrors: false,
  formats: true,
});

// Options of ajv that @xufa/schema has too.
const OPTION_NAMES = ['coerceTypes', 'useDefaults', 'removeAdditional', 'allErrors', 'strict', 'formats', 'keywords'];

let validator = null;

// Loaded when a route first has a schema to validate (apps without schemas never load it).
function loadValidator() {
  if (validator === null) validator = require('@xufa/schema'); // eslint-disable-line global-require
  return validator;
}

const decodePointer = (segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~');

// The schema of the value at a path (to name the expected type in messages), or undefined.
function schemaAt(root, path, resolveRef) {
  let schema = resolve(root, resolveRef);
  for (const key of path) {
    if (!schema || typeof schema !== 'object') return undefined;
    let next;
    if (typeof key === 'number') {
      if (Array.isArray(schema.prefixItems) && key < schema.prefixItems.length) next = schema.prefixItems[key];
      else if (Array.isArray(schema.items)) next = schema.items[key];
      else next = schema.items;
    } else if (schema.properties && schema.properties[key] !== undefined) {
      next = schema.properties[key];
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      next = schema.additionalProperties;
    }
    schema = resolve(next, resolveRef);
  }
  return schema;
}

function resolve(schema, resolveRef) {
  let current = schema;
  for (let i = 0; i < 10 && current && typeof current === 'object' && typeof current.$ref === 'string'; i += 1) {
    current = resolveRef(current.$ref);
  }
  return current;
}

function typeName(schema, fallback) {
  if (schema && typeof schema === 'object' && schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (schema.nullable === true && !types.includes('null')) types.push('null');
    return types.join(',');
  }
  return fallback;
}

function parentPointer(error) {
  const index = error.pointer.lastIndexOf('/');
  return index === -1 ? '' : error.pointer.slice(0, index);
}

// An error of the validator as ajv reports it.
function toAjvError(error, rootSchema, resolveRef) {
  const { keyword, params } = error;
  const instancePath = error.pointer;
  const lastKey = error.path.length > 0 ? error.path[error.path.length - 1] : undefined;
  switch (keyword) {
    case 'type':
    case 'nullable': {
      const schema = schemaAt(rootSchema, error.path, resolveRef);
      const type = typeName(schema, params.type || 'object');
      return { instancePath, schemaPath: '#/type', keyword: 'type', params: { type }, message: `must be ${type}` };
    }
    case 'required':
      return {
        instancePath: parentPointer(error),
        schemaPath: '#/required',
        keyword,
        params: { missingProperty: String(lastKey) },
        message: `must have required property '${lastKey}'`,
      };
    case 'additionalProperties':
    case 'unevaluatedProperties':
      return {
        instancePath: parentPointer(error),
        schemaPath: `#/${keyword}`,
        keyword,
        params: { additionalProperty: params.property !== undefined ? params.property : String(lastKey) },
        message: `must NOT have ${keyword === 'additionalProperties' ? 'additional' : 'unevaluated'} properties`,
      };
    case 'dependentRequired':
    case 'dependencies':
      return {
        instancePath: parentPointer(error),
        schemaPath: `#/${keyword}`,
        keyword: 'dependencies',
        params: { property: params.property, missingProperty: String(lastKey) },
        message: `must have property ${lastKey} when property ${params.property} is present`,
      };
    default:
      break;
  }
  const limit = params.limit;
  let message;
  let ajvParams = params;
  switch (keyword) {
    case 'minLength':
      message = `must NOT have fewer than ${limit} characters`;
      break;
    case 'maxLength':
      message = `must NOT have more than ${limit} characters`;
      break;
    case 'pattern':
      message = `must match pattern "${params.pattern}"`;
      break;
    case 'format':
      message = `must match format "${params.format}"`;
      break;
    case 'minimum':
      message = `must be >= ${limit}`;
      ajvParams = { comparison: '>=', limit };
      break;
    case 'maximum':
      message = `must be <= ${limit}`;
      ajvParams = { comparison: '<=', limit };
      break;
    case 'exclusiveMinimum':
      message = `must be > ${limit}`;
      ajvParams = { comparison: '>', limit };
      break;
    case 'exclusiveMaximum':
      message = `must be < ${limit}`;
      ajvParams = { comparison: '<', limit };
      break;
    case 'multipleOf':
      message = `must be multiple of ${params.multipleOf}`;
      break;
    case 'enum':
      message = 'must be equal to one of the allowed values';
      break;
    case 'const':
      message = 'must be equal to constant';
      break;
    case 'minItems':
      message = `must NOT have fewer than ${limit} items`;
      break;
    case 'maxItems':
      message = `must NOT have more than ${limit} items`;
      break;
    case 'uniqueItems':
      message = `must NOT have duplicate items (items ## ${params.j} and ${params.i} are identical)`;
      break;
    case 'minProperties':
      message = `must NOT have fewer than ${limit} properties`;
      break;
    case 'maxProperties':
      message = `must NOT have more than ${limit} properties`;
      break;
    case 'contains':
    case 'minContains':
      message = `must contain at least ${params.limit || 1} valid item(s)`;
      break;
    case 'maxContains':
      message = `must contain at most ${limit} valid item(s)`;
      break;
    case 'not':
      message = 'must NOT be valid';
      break;
    case 'oneOf':
      message = 'must match exactly one schema in oneOf';
      ajvParams = { passingSchemas: params.passing === undefined ? null : params.passing };
      break;
    case 'anyOf':
      message = 'must match a schema in anyOf';
      break;
    case 'false':
      message = 'boolean schema is false';
      break;
    default:
      message = error.message;
  }
  return { instancePath, schemaPath: `#/${keyword}`, keyword, params: ajvParams, message };
}

function buildResolver(rootSchema, externalSchemas) {
  return function resolveRef(ref) {
    const hash = ref.indexOf('#');
    const id = hash === -1 ? ref : ref.slice(0, hash);
    const pointer = hash === -1 ? '' : ref.slice(hash + 1);
    let doc = rootSchema;
    if (id !== '') {
      doc = externalSchemas.find((schema) => schema.$id === id || schema.$id === `${id}#`);
      if (doc === undefined) return undefined;
    }
    let schema = doc;
    if (pointer.startsWith('/')) {
      for (const segment of pointer.slice(1).split('/').map(decodePointer)) {
        if (!schema || typeof schema !== 'object') return undefined;
        schema = schema[segment];
      }
    }
    return schema;
  };
}

function toAjvErrors(errors, schema, resolveRef) {
  if (errors.length === 0) {
    return [{ instancePath: '', schemaPath: '#', keyword: 'false', params: {}, message: 'must be valid' }];
  }
  return errors.map((error) => toAjvError(error, schema, resolveRef));
}

// Whether the value validated by a schema may be converted itself: schemas of other types than objects.
// The keywords of OpenAPI that describe a schema without checking anything: fastify's ajv ignores unknown keywords,
// and route schemas written for @fastify/swagger (@xufa/openapi) have them. They are declared to the validator as annotations
// (its option `keywords`), with every `x-` extension the schemas have, so other unknown keywords still throw (typos).
const OPENAPI_ANNOTATIONS = ['style', 'explode', 'allowReserved', 'example', 'externalDocs', 'xml'];

// The formats checked with formats: true: the built-in ones of the validator, and those of OpenAPI that fastify knows from
// ajv-formats. byte is base64 (as ajv-formats checks it); binary and password are any string; int32, int64, float
// and double are known but not checked (the validator checks formats of strings only, where ajv-formats checks the range of
// numbers).
let defaultFormats = null;

function formatsOf(given) {
  if (given !== true) return given;
  if (defaultFormats === null) {
    defaultFormats = {
      ...loadValidator().builtInFormats(),
      byte: /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      binary: false,
      password: false,
      int32: false,
      int64: false,
      float: false,
      double: false,
    };
  }
  return defaultFormats;
}

function withAnnotations(keywords, schemas) {
  const found = new Set(OPENAPI_ANNOTATIONS);
  const seen = new Set();
  const walk = (node) => {
    if (node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const key of Object.keys(node)) {
      if (key.startsWith('x-')) found.add(key);
      walk(node[key]);
    }
  };
  schemas.forEach(walk);
  const given = Array.isArray(keywords) ? keywords : [];
  for (const item of given) if (typeof item === 'string') found.delete(item);
  return given.concat([...found]);
}

function coercesRoot(schema) {
  if (schema === null || typeof schema !== 'object' || schema.type === undefined) return false;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  return !types.includes('object');
}

class ValidatorCompiler {
  constructor(externalSchemas, options = {}) {
    const custom = { ...options.customOptions };
    this.options = { ...DEFAULT_OPTIONS };
    for (const name of OPTION_NAMES) if (custom[name] !== undefined) this.options[name] = custom[name];
    // ajv's strict mode for schemas: unknown keywords throw, unless it is off.
    if (custom.strictSchema === false || custom.strict === false) this.options.strict = false;
    if (options.validatorOptions) Object.assign(this.options, options.validatorOptions);
    this.externalSchemas = Object.values(externalSchemas || {});
    this.cache = new Map();
    this.constructorArgs = [externalSchemas, options];
    this.forResponses = null;
  }

  // The compiler of the validators of responses: the same schemas and options, without changing the data.
  responseCompiler() {
    if (this.forResponses === null) {
      const [externalSchemas, options] = this.constructorArgs;
      const customOptions = {
        ...options.customOptions,
        coerceTypes: false,
        useDefaults: false,
        removeAdditional: false,
      };
      this.forResponses = new ValidatorCompiler(externalSchemas, { ...options, customOptions });
    }
    return this.forResponses;
  }

  buildValidatorFunction({ schema, httpPart }) {
    // A response (validated by @xufa/openapi) is checked as it is: nothing converted, filled nor removed.
    if (httpPart === 'response') return this.responseCompiler().buildValidatorFunction({ schema });
    // Schemas with an $id are compiled once.
    if (schema && typeof schema === 'object' && schema.$id && this.cache.has(schema.$id)) {
      return this.cache.get(schema.$id);
    }
    const { compileJsonSchema } = loadValidator();
    const externals = this.externalSchemas.filter((external) => !(schema && external.$id === schema.$id));
    const resolveRef = buildResolver(schema, externals);
    const formats = formatsOf(this.options.formats);
    const keywords =
      this.options.strict === false
        ? this.options.keywords
        : withAnnotations(this.options.keywords, [schema, ...externals]);
    // The validator converts a value it is given only for the validation, where ajv (given the request as parent) converts
    // the request part itself. A schema of something else than an object (a body of "10" for a number) is checked
    // inside a holder object, so that the converted value can be given back.
    if (this.options.coerceTypes && coercesRoot(schema)) {
      const id = typeof schema.$id === 'string' && schema.$id[0] !== '#' ? schema.$id : 'xufa:validated-value';
      const documents = id === schema.$id ? externals.concat([schema]) : externals.concat([{ ...schema, $id: id }]);
      const holderSchema = { type: 'object', properties: { value: { $ref: id } } };
      const options = { ...this.options, formats, keywords, schemas: documents };
      const isValid = compileJsonSchema(holderSchema, { ...options, errors: false });
      let withErrors = null;
      const validateHeld = function validate(data) {
        const holder = { value: data };
        if (isValid(holder)) {
          validateHeld.errors = null;
          return holder.value === data ? true : { value: holder.value };
        }
        if (withErrors === null) withErrors = compileJsonSchema(holderSchema, { ...options, errors: 'objects' });
        validateHeld.errors = toAjvErrors(
          withErrors({ value: data }).map((error) => ({
            ...error,
            path: error.path.slice(1),
            pointer: error.pointer.slice('/value'.length),
          })),
          schema,
          resolveRef
        );
        return false;
      };
      validateHeld.errors = null;
      validateHeld.schema = schema;
      return validateHeld;
    }
    const options = { ...this.options, formats, keywords, schemas: externals };
    const isValid = compileJsonSchema(schema, { ...options, errors: false });
    let withErrors = null;
    function validate(data) {
      if (isValid(data)) {
        validate.errors = null;
        return true;
      }
      // The errors are only built for invalid data, with a second validator compiled the first time.
      if (withErrors === null) withErrors = compileJsonSchema(schema, { ...options, errors: 'objects' });
      validate.errors = toAjvErrors(withErrors(data), schema, resolveRef);
      return false;
    }
    validate.errors = null;
    validate.schema = schema;
    if (schema && typeof schema === 'object' && schema.$id) this.cache.set(schema.$id, validate);
    return validate;
  }
}

// What @fastify/ajv-compiler gives fastify: a builder of compilers, sharing them for equal schemas and options.
function ValidatorSelector() {
  const pool = new Map();
  return function buildCompilerFromPool(externalSchemas, options = {}) {
    const key = `${JSON.stringify(externalSchemas)}${JSON.stringify(options.customOptions)}${JSON.stringify(options.validatorOptions)}`;
    if (pool.has(key)) return pool.get(key);
    const compiler = new ValidatorCompiler(externalSchemas, options);
    const build = compiler.buildValidatorFunction.bind(compiler);
    pool.set(key, build);
    return build;
  };
}

module.exports = { ValidatorSelector, ValidatorCompiler, toAjvError, DEFAULT_OPTIONS };
