// Compiling the schemas of a route (validation of params, body, querystring and headers, serialization of
// responses), and validating a request.
const {
  kSchemaHeaders: headersSchema,
  kSchemaParams: paramsSchema,
  kSchemaQuerystring: querystringSchema,
  kSchemaBody: bodySchema,
  kSchemaResponse: responseSchema,
} = require('./symbols');
const { XUFA_ERR_SCH_RESPONSE_SCHEMA_NOT_NESTED_2XX } = require('./errors');
const { XUFAWRN001, XUFASEC002 } = require('./warnings');

const STATUS_CODE = /^[1-5](?:\d{2}|xx)$|^default$/;

function compileSchemasForSerialization(context, compile) {
  if (!context.schema || !context.schema.response) return;
  const { method, url } = context.config || {};
  const compiled = {};
  for (const code of Object.keys(context.schema.response)) {
    const schema = context.schema.response[code];
    const statusCode = code.toLowerCase();
    if (!STATUS_CODE.test(statusCode)) throw new XUFA_ERR_SCH_RESPONSE_SCHEMA_NOT_NESTED_2XX();
    if (schema.content) {
      const byContentType = {};
      for (const mediaName of Object.keys(schema.content)) {
        byContentType[mediaName] = compile({
          schema: schema.content[mediaName].schema,
          url,
          method,
          httpStatus: statusCode,
          contentType: mediaName,
        });
      }
      compiled[statusCode] = byContentType;
    } else {
      compiled[statusCode] = compile({ schema, url, method, httpStatus: statusCode });
    }
  }
  context[responseSchema] = compiled;
}

// Header names are case-insensitive and Node.js gives them in lower case: the names in the schema are lowered too,
// wherever a property name appears (properties, required, dependencies), in every subschema.
function lowerCaseHeadersSchema(schema) {
  if (Array.isArray(schema)) return schema.map(lowerCaseHeadersSchema);
  if (schema === null || typeof schema !== 'object') return schema;
  const result = {};
  for (const key of Object.keys(schema)) {
    const value = schema[key];
    switch (key) {
      case 'properties':
      case 'dependentSchemas':
        if (value === null || typeof value !== 'object') {
          result[key] = value;
          break;
        }
        result[key] = {};
        for (const name of Object.keys(value)) result[key][name.toLowerCase()] = lowerCaseHeadersSchema(value[name]);
        break;
      case 'required':
        result.required = Array.isArray(value) ? value.map((name) => name.toLowerCase()) : value;
        break;
      case 'dependencies':
      case 'dependentRequired':
        if (value === null || typeof value !== 'object') {
          result[key] = value;
          break;
        }
        result[key] = {};
        for (const name of Object.keys(value)) {
          const dep = value[name];
          result[key][name.toLowerCase()] = Array.isArray(dep)
            ? dep.map((item) => item.toLowerCase())
            : lowerCaseHeadersSchema(dep);
        }
        break;
      case 'allOf':
      case 'anyOf':
      case 'oneOf':
      case 'not':
      case 'if':
      case 'then':
      case 'else':
      case 'items':
      case 'additionalItems':
      case 'additionalProperties':
      case 'unevaluatedItems':
      case 'unevaluatedProperties':
      case 'contains':
      case 'propertyNames':
      case 'contentSchema':
        result[key] = lowerCaseHeadersSchema(value);
        break;
      case 'definitions':
      case '$defs':
      case 'patternProperties':
        if (value === null || typeof value !== 'object') {
          result[key] = value;
          break;
        }
        result[key] = {};
        for (const name of Object.keys(value)) result[key][name] = lowerCaseHeadersSchema(value[name]);
        break;
      default:
        result[key] = value;
    }
  }
  return result;
}

// The first $ref to another document in a schema (whose header names can not be lowered), or undefined.
function findExternalRef(schema) {
  if (Array.isArray(schema)) {
    for (const item of schema) {
      const ref = findExternalRef(item);
      if (ref !== undefined) return ref;
    }
    return undefined;
  }
  if (schema === null || typeof schema !== 'object') return undefined;
  if (typeof schema.$ref === 'string' && schema.$ref[0] !== '#') return schema.$ref;
  for (const key of Object.keys(schema)) {
    const ref = findExternalRef(schema[key]);
    if (ref !== undefined) return ref;
  }
  return undefined;
}

function compileSchemasForValidation(context, compile, isCustom) {
  const { schema } = context;
  if (!schema) return;
  const { method, url } = context.config || {};
  const missing = (part) => Object.prototype.hasOwnProperty.call(schema, part) && XUFAWRN001(part, method, url);

  const { headers } = schema;
  if (headers !== undefined) {
    if (
      isCustom ||
      typeof headers !== 'object' ||
      headers === null ||
      Object.getPrototypeOf(headers) !== Object.prototype
    ) {
      // Schemas of custom validators (and booleans) are compiled as they are.
      context[headersSchema] = compile({ schema: headers, method, url, httpPart: 'headers' });
    } else {
      const externalRef = findExternalRef(headers);
      if (externalRef !== undefined) XUFASEC002(method, url, externalRef);
      context[headersSchema] = compile({ schema: lowerCaseHeadersSchema(headers), method, url, httpPart: 'headers' });
    }
  } else {
    missing('headers');
  }

  if (schema.body !== undefined) {
    const content = schema.body !== null && typeof schema.body === 'object' ? schema.body.content : undefined;
    if (content) {
      const byContentType = {};
      for (const contentType of Object.keys(content)) {
        byContentType[contentType] = compile({
          schema: content[contentType].schema,
          method,
          url,
          httpPart: 'body',
          contentType,
        });
      }
      context[bodySchema] = byContentType;
    } else {
      context[bodySchema] = compile({ schema: schema.body, method, url, httpPart: 'body' });
    }
  } else {
    missing('body');
  }

  if (schema.querystring !== undefined) {
    context[querystringSchema] = compile({ schema: schema.querystring, method, url, httpPart: 'querystring' });
  } else {
    missing('querystring');
  }

  if (schema.params !== undefined) {
    context[paramsSchema] = compile({ schema: schema.params, method, url, httpPart: 'params' });
  } else {
    missing('params');
  }

  context.hasValidation =
    context[paramsSchema] !== undefined ||
    context[bodySchema] !== undefined ||
    context[querystringSchema] !== undefined ||
    context[headersSchema] !== undefined;
}

function validateParam(validatorFunction, request, paramName) {
  if (validatorFunction == null) return false;
  const value = request[paramName];
  let ret;
  try {
    const data = value === undefined ? null : value;
    ret = validatorFunction.schemaEnv
      ? validatorFunction(data, { parentData: request, parentDataProperty: paramName })
      : validatorFunction(data);
  } catch (err) {
    // A validator throwing is an internal error.
    err.statusCode = 500; // eslint-disable-line no-param-reassign
    return err;
  }
  if (ret && typeof ret.then === 'function') {
    // An async validator resolves with the data validated: only pass or fail is read from it.
    return ret.then((res) => (res === false ? validatorFunction.errors : false)).catch((err) => err);
  }
  if (ret === false) return validatorFunction.errors;
  if (ret && ret.error) return ret.error;
  if (ret && typeof ret === 'object' && 'value' in ret) request[paramName] = ret.value; // eslint-disable-line no-param-reassign
  return false;
}

function wrapValidationError(result, dataVar, schemaErrorFormatter) {
  if (result instanceof Error) {
    result.statusCode = result.statusCode || 400; // eslint-disable-line no-param-reassign
    result.code = result.code || 'XUFA_ERR_VALIDATION'; // eslint-disable-line no-param-reassign
    result.validationContext = result.validationContext || dataVar; // eslint-disable-line no-param-reassign
    return result;
  }
  const error = schemaErrorFormatter(result, dataVar);
  error.statusCode = error.statusCode || 400;
  error.code = error.code || 'XUFA_ERR_VALIDATION';
  error.validation = result;
  error.validationContext = dataVar;
  return error;
}

function bodyValidator(context, request) {
  const schema = context[bodySchema];
  if (typeof schema === 'function') return schema;
  if (schema) return schema[request.mediaType] || null;
  return null;
}

// false when the request is valid, the error otherwise (or a promise of either, with async validators).
function validate(context, request, execution) {
  const run = execution === undefined;
  if (
    run &&
    context[paramsSchema] === undefined &&
    context[bodySchema] === undefined &&
    context[querystringSchema] === undefined &&
    context[headersSchema] === undefined
  ) {
    return false;
  }
  // Runs for every request of a route with schemas: no allocation unless something fails or is asynchronous.
  if (run || !execution.skipParams) {
    const result = validateParam(context[paramsSchema], request, 'params');
    if (result) return settle(result, context, request, 'params', SKIP_PARAMS);
  }
  if (run || !execution.skipBody) {
    const result = validateParam(bodyValidator(context, request), request, 'body');
    if (result) return settle(result, context, request, 'body', SKIP_BODY);
  }
  if (run || !execution.skipQuery) {
    const result = validateParam(context[querystringSchema], request, 'query');
    if (result) return settle(result, context, request, 'querystring', SKIP_QUERY);
  }
  const result = validateParam(context[headersSchema], request, 'headers');
  if (result) return settle(result, context, request, 'headers', null);
  return false;
}

const SKIP_PARAMS = { skipParams: true, skipBody: false, skipQuery: false };
const SKIP_BODY = { skipParams: true, skipBody: true, skipQuery: false };
const SKIP_QUERY = { skipParams: true, skipBody: true, skipQuery: true };

// The error of a failed validation, or for an asynchronous one, a promise of it (or of the validation of the rest).
function settle(result, context, request, dataVar, next) {
  if (typeof result.then !== 'function') return wrapValidationError(result, dataVar, context.schemaErrorFormatter);
  return result.then((asyncResult) => {
    if (asyncResult) return wrapValidationError(asyncResult, dataVar, context.schemaErrorFormatter);
    return next === null ? false : validate(context, request, next);
  });
}

module.exports = {
  symbols: { bodySchema, querystringSchema, responseSchema, paramsSchema, headersSchema },
  compileSchemasForValidation,
  compileSchemasForSerialization,
  validate,
  lowerCaseHeadersSchema,
};
