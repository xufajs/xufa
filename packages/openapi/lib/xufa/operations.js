'use strict';

// Routes made from an OpenAPI 3 document (design first): each operation of its paths is a route of the app, with the
// schemas of its parameters, body and responses (validated and serialized by @xufa/http), and the handler of its
// operationId. Operations without a handler answer 501, so a document can be served before it is written.
//
//   app.register(openapi.operations, {
//     path: './openapi.yaml',                        // or document: { openapi: '3.1.0', ... }
//     handlers: { listBooks: async (request) => Book.objects.all(), getBook: { preHandler, handler } },
//     prefix: '/api',
//   });
//
// - components.schemas are shared schemas (app.addSchema) of their names (schemaPrefix before them), and the $refs to
//   them follow: recursive schemas work. Each has a variant for requests (.request), where readOnly properties are
//   not required, and the one of responses, where writeOnly properties are not.
// - Parameters (of the path and of the operation; in path, query and header; cookies are not validated) become the
//   params, querystring and headers of the route; '/books/{id}' is '/books/:id'.
// - The JSON body (application/json, or +json) is the body; an optional one may be left out (the handler gets null).
// - Responses with JSON are the response schemas ('2XX' as '2xx', and default).
// - Security (of the operation, or of the document) is the config.auth of the route for @xufa/auth: the strategies of
//   its schemes (names mapped by `security`: { scheme: 'strategy' }); security: [] makes an operation public. With
//   operations that need security, the app must have @xufa/auth.
// - validateResponses (or validateResponse of a handler): what a handler answers is checked against the schema of its
//   status (the code, its class '2xx', or default) before it is written; a response out of its contract is a 500
//   (ResponseValidationError, with the errors). request.operation.validateResponse(payload, status) and
//   validateRequest() check by hand (validateRequest throws request.validationError, with attachValidation: true).
// - missingStatus: what operations without a handler answer (501, or 404); requestIdHeader: the header
//   the id of each request is answered in (x-request-id).
// - Documents split in files: their $refs to other files (to URLs with remote: true) are taken in first (bundle()),
//   relative to the path of the document (or baseDir, for a document given). Swagger 2.0 documents are read as
//   OpenAPI 3 (lib/xufa/swagger2.js).
const { bundle } = require('./bundle');
const { fromSwagger2 } = require('./swagger2');

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

class OpenapiError extends Error {}

// A response out of its contract: answered with 500.
class ResponseValidationError extends OpenapiError {
  constructor(operationId, status, errors) {
    const list = errors.map((error) => `${error.instancePath || '/'} ${error.message}`).join(', ');
    super(`The response ${status} of ${operationId} does not match its schema: ${list}`);
    this.name = 'ResponseValidationError';
    this.code = 'XUFA_OPENAPI_INVALID_RESPONSE';
    this.statusCode = 500;
    this.errors = errors;
  }
}

const kInvalidResponse = Symbol('xufa.openapi.invalidResponse');
const kCheckedStatus = Symbol('xufa.openapi.checkedStatus');

// The compiler of validators of responses: the one of the app (app.validatorCompiler, set once its routes are: the
// ajv of fastify, @xufa/schema in @xufa/http), so responses are checked as its requests are; or, in an app without one, the
// compiler of @xufa/http with the shared schemas of the app.
function compilerOf(app) {
  const own = app.validatorCompiler;
  if (typeof own === 'function') return own;
  let ValidatorCompiler;
  try {
    ({ ValidatorCompiler } = require('@xufa/http/lib/validator-compiler')); // eslint-disable-line global-require
  } catch (err) {
    throw new OpenapiError(
      `Validating responses needs the validator compiler of the app, or @xufa/http (${err.message})`
    );
  }
  const compiler = new ValidatorCompiler(app.getSchemas(), {
    customOptions: { coerceTypes: false, useDefaults: false, removeAdditional: false, allErrors: true },
  });
  return (options) => compiler.buildValidatorFunction(options);
}

// Whether a validator accepts data: true (or a value converted, as the compiler of @xufa/http gives for some).
const accepts = (result) =>
  result === true || (result !== null && typeof result === 'object' && typeof result.then !== 'function');

// The validators of the responses of a route, by status: of data as JSON gives it (parsed from what is sent).
function responseValidators(app, responses, method, url) {
  const compile = compilerOf(app);
  const validators = {};
  for (const [code, schema] of Object.entries(responses || {})) {
    validators[code] = compile({ schema, method, url, httpPart: 'response' });
  }
  return validators;
}

// A copy of plain JSON data (null, strings, booleans, finite numbers, arrays, plain objects), or NOT_PLAIN for anything
// that JSON would write in other words (dates, toJSON(), instances, undefined, bigints, NaN): what the serializers
// write of plain data is the same data, with the properties out of the schema left out.
const NOT_PLAIN = Symbol('not plain');
function plainCopy(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NOT_PLAIN;
  if (typeof value !== 'object') return NOT_PLAIN;
  if (Array.isArray(value)) {
    const copy = new Array(value.length);
    for (let i = 0; i < value.length; i += 1) {
      const item = plainCopy(value[i]);
      if (item === NOT_PLAIN) return NOT_PLAIN;
      copy[i] = item;
    }
    return copy;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return NOT_PLAIN;
  const copy = {};
  for (const key in value) {
    const item = plainCopy(value[key]);
    if (item === NOT_PLAIN) return NOT_PLAIN;
    copy[key] = item;
  }
  return copy;
}

// The validator of a status: of its code, of its class (2xx), or the default one.
const validatorFor = (validators, status) =>
  validators[String(status)] || validators[`${String(status)[0]}xx`] || validators.default;

// The document of the options, in one piece (its files taken in), as OpenAPI 3.
async function prepare(options) {
  let source;
  if (options.document) {
    if (typeof options.document !== 'object') throw new OpenapiError('document is an OpenAPI document (an object)');
    source = options.document;
  } else if (options.path) source = options.path;
  else throw new OpenapiError('openapi.operations needs a document or the path of one');
  let document = await bundle(source, { baseDir: options.baseDir, remote: options.remote === true });
  if (typeof document.swagger === 'string' && document.swagger.startsWith('2.')) document = fromSwagger2(document);
  if (!document || typeof document.openapi !== 'string' || !document.openapi.startsWith('3.')) {
    throw new OpenapiError('openapi.operations reads OpenAPI 3 and Swagger 2.0 documents');
  }
  return document;
}

const unescape = (part) => decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~');

// The value of a reference of the document ('#/components/...').
function pointer(document, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    throw new OpenapiError(`Only references inside the document are followed: ${ref}`);
  }
  let node = document;
  for (const part of ref.slice(2).split('/').map(unescape)) {
    if (node === null || typeof node !== 'object' || !(part in node)) {
      throw new OpenapiError(`The reference ${ref} is not in the document`);
    }
    node = node[part];
  }
  return node;
}

// A parameter, body or response, through its references.
function follow(document, node) {
  const seen = new Set();
  let current = node;
  while (current && typeof current === 'object' && typeof current.$ref === 'string') {
    if (seen.has(current.$ref)) throw new OpenapiError(`The reference ${current.$ref} refers to itself`);
    seen.add(current.$ref);
    current = pointer(document, current.$ref);
  }
  return current;
}

const SCHEMA_REF = /^#\/components\/schemas\/([^/]+)$/;

// A schema of the document for a route: $refs to components.schemas point to their shared schemas (of the variant
// of `side`: 'request' or 'response'), and the properties the other side owns (readOnly in requests, writeOnly in
// responses) are not required.
// Data of schemas, copied as it is (a $ref in an example is not a reference).
const DATA = new Set(['example', 'examples', 'default', 'enum', 'const', 'x-examples']);
// Maps of names to schemas (their names are not keywords).
const SCHEMA_MAPS = new Set(['properties', 'patternProperties', 'dependentSchemas', '$defs', 'definitions']);

function convert(schema, side, idOf) {
  if (Array.isArray(schema)) return schema.map((item) => convert(item, side, idOf));
  if (schema === null || typeof schema !== 'object') return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (DATA.has(key)) {
      out[key] = value;
    } else if (
      key !== 'properties' &&
      SCHEMA_MAPS.has(key) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      out[key] = Object.fromEntries(Object.entries(value).map(([name, item]) => [name, convert(item, side, idOf)]));
    } else if (key === '$ref' && typeof value === 'string') {
      const match = SCHEMA_REF.exec(value);
      if (!match) throw new OpenapiError(`Schemas can refer to components.schemas only: ${value}`);
      out.$ref = `${idOf(unescape(match[1]), side)}#`;
    } else if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      out.properties = Object.fromEntries(
        Object.entries(value).map(([name, item]) => [name, convert(item, side, idOf)])
      );
    } else {
      out[key] = convert(value, side, idOf);
    }
  }
  // writeOnly properties (passwords...) are not answered: out of the schema of responses, the serializer leaves them
  // out. readOnly ones may be sent, and are not required.
  const removed = new Set();
  if (side === 'response' && out.properties) {
    for (const [name, item] of Object.entries(out.properties)) {
      if (item && item.writeOnly === true) {
        delete out.properties[name];
        removed.add(name);
      }
    }
  }
  if (Array.isArray(out.required) && out.properties) {
    const owned = side === 'request' ? 'readOnly' : 'writeOnly';
    out.required = out.required.filter(
      (name) => !removed.has(name) && !(out.properties[name] && out.properties[name][owned] === true)
    );
    if (out.required.length === 0) delete out.required;
  }
  return out;
}

// The schema of the JSON content of a body or response (application/json, or a type ending in +json), or null.
function jsonSchemaOf(content) {
  if (!content || typeof content !== 'object') return null;
  const type = Object.keys(content).find((name) => /^application\/(?:[\w.-]+\+)?json(?:;|$)/i.test(name));
  return type && content[type] && content[type].schema ? content[type].schema : null;
}

const toUrl = (path) => path.replace(/\{([^}]+)\}/g, ':$1');

function operations(app, options, next) {
  prepare(options).then(
    (document) => register(app, options, document, next),
    (err) => next(err.name === 'BundleError' ? new OpenapiError(err.message) : err)
  );
}

function register(app, options, document, next) {
  const { handlers = {}, schemaPrefix = '', security: schemeNames = {}, missing = 'answer' } = options;
  const { validateResponses = false, missingStatus = 501, requestIdHeader = null } = options;
  if (missingStatus !== 501 && missingStatus !== 404) {
    next(new OpenapiError('missingStatus is 501 or 404'));
    return;
  }
  const idOf = (name, side) => `${schemaPrefix}${name}${side === 'request' ? '.request' : ''}`;
  const routeOptions = (handler) => (typeof handler === 'function' ? { handler } : handler);
  const secured = [];
  const missingIds = [];

  try {
    // The shared schemas, in both variants.
    const schemas = (document.components && document.components.schemas) || {};
    for (const [name, schema] of Object.entries(schemas)) {
      for (const side of ['response', 'request']) {
        app.addSchema({ ...convert(schema, side, idOf), $id: idOf(name, side) });
      }
    }

    for (const [path, item] of Object.entries(document.paths || {})) {
      const pathItem = follow(document, item) || {};
      for (const method of METHODS) {
        const operation = pathItem[method];
        if (!operation) continue;
        const key = operation.operationId || `${method.toUpperCase()} ${path}`;
        const schema = {};
        for (const field of ['operationId', 'tags', 'summary', 'description', 'deprecated']) {
          if (operation[field] !== undefined) schema[field] = operation[field];
        }

        // Parameters: those of the path, replaced by those of the operation of the same name and place.
        const parameters = new Map();
        for (const given of [...(pathItem.parameters || []), ...(operation.parameters || [])]) {
          const parameter = follow(document, given);
          parameters.set(`${parameter.in}:${parameter.name}`, parameter);
        }
        const groups = { path: 'params', query: 'querystring', header: 'headers' };
        for (const parameter of parameters.values()) {
          const group = groups[parameter.in];
          if (!group) continue;
          const name = parameter.in === 'header' ? parameter.name.toLowerCase() : parameter.name;
          const target = (schema[group] = schema[group] || { type: 'object', properties: {} });
          const given = parameter.schema || jsonSchemaOf(parameter.content) || {};
          target.properties[name] = convert(
            parameter.description ? { ...given, description: parameter.description } : given,
            'request',
            idOf
          );
          if (parameter.required || parameter.in === 'path') (target.required = target.required || []).push(name);
        }

        // The body: JSON; an optional one may be left out (null).
        let optionalBody = false;
        const requestBody = follow(document, operation.requestBody);
        const bodySchema = requestBody && jsonSchemaOf(requestBody.content);
        if (bodySchema) {
          const body = convert(bodySchema, 'request', idOf);
          optionalBody = requestBody.required !== true;
          schema.body = optionalBody ? { anyOf: [body, { type: 'null' }] } : body;
        }

        // The responses with JSON.
        for (const [status, given] of Object.entries(operation.responses || {})) {
          const response = follow(document, given);
          const responseSchema = response && jsonSchemaOf(response.content);
          if (!responseSchema) continue;
          const code = status === 'default' ? 'default' : status.toLowerCase();
          schema.response = schema.response || {};
          schema.response[code] = {
            ...convert(responseSchema, 'response', idOf),
            ...(response.description ? { description: response.description } : {}),
          };
        }

        // Security: the strategies of its schemes.
        const requirements = operation.security !== undefined ? operation.security : document.security;
        const config = {};
        if (Array.isArray(requirements) && requirements.length) {
          const names = [...new Set(requirements.flatMap((requirement) => Object.keys(requirement)))];
          if (names.length) {
            config.auth = { strategy: names.map((name) => schemeNames[name] || name) };
            secured.push(key);
          }
        }

        const given = handlers[key];
        let own = given ? { ...routeOptions(given) } : null;
        if (!own) {
          missingIds.push(key);
          own = {
            handler: async (request, reply) => {
              reply.code(missingStatus);
              const error = missingStatus === 404 ? 'Not Found' : 'Not Implemented';
              return { statusCode: missingStatus, error, message: `${key} is not implemented` };
            },
          };
        }
        const checkResponses = own.validateResponse !== undefined ? own.validateResponse : validateResponses;
        delete own.validateResponse;

        // Checks by hand (request.operation), and of every response when asked. The validators are made on first use,
        // not when the app is ready: compiling (a first ajv compile above all) before any request has been served
        // fills the shapes V8 gives plain objects, and the requests of the whole app are slower from then on (a
        // third, on fastify). A schema that does not compile is the 500 of the responses of its route.
        let validators = null;
        let compileError = null;
        const validatorsOf = () => {
          if (validators !== null) return validators;
          if (compileError === null) {
            try {
              validators = responseValidators(app, schema.response, method.toUpperCase(), toUrl(path));
              return validators;
            } catch (err) {
              compileError = new OpenapiError(`The response schemas of ${key} do not compile: ${err.message}`);
              compileError.code = 'XUFA_OPENAPI_RESPONSE_SCHEMA';
              compileError.statusCode = 500;
            }
          }
          throw compileError;
        };
        const routeOperation = {
          id: key,
          // A payload checked by hand: as it would be sent (JSON: its toJSON(), dates as text), on a copy.
          validateResponse(payload, status = 200) {
            const validate = validatorFor(validatorsOf(), status);
            if (!validate) return;
            const data = payload === undefined ? undefined : JSON.parse(JSON.stringify(payload));
            if (!accepts(validate(data))) throw new ResponseValidationError(key, status, validate.errors || []);
          },
          validateRequest(request) {
            if (request.validationError) throw request.validationError;
          },
        };
        config.operation = routeOperation;
        const route = {
          ...own,
          method: method.toUpperCase(),
          url: toUrl(path),
          schema: { ...schema, ...(own.schema || {}) },
          config: { ...config, ...(own.config || {}) },
        };
        if (checkResponses && schema.response) {
          // The validators of a status, or the error of schemas that do not compile (answered once, as a 500).
          const validatorOf = (request, reply, done) => {
            try {
              return validatorFor(validatorsOf(), reply.statusCode);
            } catch (err) {
              request[kInvalidResponse] = true;
              done(err);
              return false;
            }
          };
          // What is sent is checked. First, before it is serialized, a copy of the payload when it is plain data (the
          // object of the handler is not touched: a compiler for requests converts and removes): valid, what is
          // written of it is valid too (the same data), and it is not checked again.
          const checkPayload = (request, reply, payload, done) => {
            if (request[kInvalidResponse]) {
              done(null, payload);
              return;
            }
            const validate = validatorOf(request, reply, done);
            if (validate === false) return;
            if (validate) {
              const data = plainCopy(payload);
              if (data !== NOT_PLAIN && accepts(validate(data))) request[kCheckedStatus] = reply.statusCode;
            }
            done(null, payload);
          };
          // Else (not plain, out of the schema as it is, or a text) the JSON written, parsed: what the client
          // receives (dates as text, values the serializer converts). Bodies that are not JSON text (buffers,
          // streams) are not checked.
          const checkResponse = (request, reply, payload, done) => {
            if (request[kCheckedStatus] === reply.statusCode) {
              request[kCheckedStatus] = undefined;
              done(null, payload);
              return;
            }
            request[kCheckedStatus] = undefined;
            // Once: the 500 of a response out of its contract (or of schemas that do not compile) is not checked.
            if (request[kInvalidResponse]) {
              done(null, payload);
              return;
            }
            const validate = validatorOf(request, reply, done);
            if (validate === false) return;
            if (!validate || typeof payload !== 'string') {
              done(null, payload);
              return;
            }
            let data;
            try {
              data = payload === '' ? undefined : JSON.parse(payload);
            } catch {
              done(null, payload);
              return;
            }
            if (accepts(validate(data))) {
              done(null, payload);
              return;
            }
            request[kInvalidResponse] = true;
            done(new ResponseValidationError(key, reply.statusCode, validate.errors || []));
          };
          route.preSerialization = [...[].concat(own.preSerialization || []), checkPayload];
          route.onSend = [...[].concat(own.onSend || []), checkResponse];
        }
        if (optionalBody) {
          const nullBody = (request, reply, done) => {
            if (request.body === undefined) request.body = null;
            done();
          };
          route.preValidation = [nullBody, ...[].concat(own.preValidation || [])];
        }
        app.route(route);
      }
    }

    const unknown = Object.keys(handlers).filter((name) => !hasOperation(document, name));
    if (unknown.length) throw new OpenapiError(`Handlers of no operation of the document: ${unknown.join(', ')}`);
    if (missing === 'throw' && missingIds.length) {
      throw new OpenapiError(`Operations without a handler: ${missingIds.join(', ')}`);
    }
  } catch (err) {
    next(err);
    return;
  }

  // request.operation: the operation of the route ({ id, validateRequest(), validateResponse(payload, status) }).
  app.decorateRequest('operation', {
    getter() {
      const config = this.routeOptions && this.routeOptions.config;
      const operation = config && config.operation;
      if (!operation) return null;
      const request = this;
      return {
        id: operation.id,
        validateResponse: (payload, status) => operation.validateResponse(payload, status),
        validateRequest: () => operation.validateRequest(request),
      };
    },
  });
  if (requestIdHeader) {
    app.addHook('onSend', async (request, reply) => {
      reply.header(requestIdHeader, request.id);
    });
  }

  // Operations that need security, in an app that cannot check it, would be open.
  if (secured.length) {
    app.addHook('onReady', async function checkAuth() {
      if (!this.hasDecorator('auth')) {
        throw new OpenapiError(`The operations ${secured.join(', ')} need security: register @xufa/auth first`);
      }
    });
  }
  next();
}

// Whether a name is the operationId (or "METHOD /path") of an operation of the document.
function hasOperation(document, name) {
  for (const [path, item] of Object.entries(document.paths || {})) {
    for (const method of METHODS) {
      const operation = item && item[method];
      if (operation && (operation.operationId === name || `${method.toUpperCase()} ${path}` === name)) return true;
    }
  }
  return false;
}

operations[Symbol.for('fastify.display-name')] = '@xufa/openapi operations';
operations[Symbol.for('plugin-meta')] = { name: '@xufa/openapi/operations' };

module.exports = { operations, OpenapiError, ResponseValidationError, convert };
