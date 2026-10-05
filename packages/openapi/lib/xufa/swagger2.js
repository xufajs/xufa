'use strict';

// A Swagger 2.0 document as OpenAPI 3.0.3, for openapi.operations: host, basePath and schemes
// are servers; definitions, parameters and responses are components (and their $refs follow); body and formData
// parameters are the requestBody (of the types of consumes); the schemas of responses are their content (of the types
// of produces); the rest of the parameters have a schema, and collectionFormat is their style; securityDefinitions
// are securitySchemes; x-nullable is nullable, and file is binary.

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'];
const SCHEMA_KEYS = [
  'type',
  'format',
  'items',
  'enum',
  'default',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
  'pattern',
  'minItems',
  'maxItems',
  'uniqueItems',
  'multipleOf',
];

// $refs of Swagger 2.0 as those of OpenAPI 3; x-nullable and file as OpenAPI 3 says them.
function schemaOf(node) {
  if (Array.isArray(node)) return node.map(schemaOf);
  if (node === null || typeof node !== 'object') return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string')
      out.$ref = value.replace(/^#\/definitions\//, '#/components/schemas/');
    else if (key === 'x-nullable') out.nullable = value;
    else if (key === 'example' || key === 'default' || key === 'enum') out[key] = value;
    else out[key] = schemaOf(value);
  }
  if (out.type === 'file') {
    out.type = 'string';
    out.format = 'binary';
  }
  return out;
}

// The schema of a parameter that is not the body (its type, items... at its own level).
function parameterSchema(parameter) {
  const schema = {};
  for (const key of SCHEMA_KEYS) if (parameter[key] !== undefined) schema[key] = parameter[key];
  if (parameter['x-nullable'] !== undefined) schema.nullable = parameter['x-nullable'];
  return schemaOf(schema);
}

// collectionFormat as style and explode.
function styleOf(parameter) {
  switch (parameter.collectionFormat) {
    case 'multi':
      return { style: 'form', explode: true };
    case 'ssv':
      return { style: 'spaceDelimited', explode: false };
    case 'pipes':
      return { style: 'pipeDelimited', explode: false };
    case 'csv':
      return parameter.in === 'query' ? { style: 'form', explode: false } : { style: 'simple' };
    default:
      return parameter.type === 'array' && parameter.in === 'query' ? { style: 'form', explode: false } : {};
  }
}

const refOf = (value, from, to) => (typeof value === 'string' ? value.replace(from, to) : value);

function convertParameter(parameter) {
  if (parameter.$ref) return { $ref: refOf(parameter.$ref, /^#\/parameters\//, '#/components/parameters/') };
  const out = { name: parameter.name, in: parameter.in };
  if (parameter.description) out.description = parameter.description;
  if (parameter.required || parameter.in === 'path') out.required = true;
  if (parameter.allowEmptyValue) out.allowEmptyValue = true;
  out.schema = parameterSchema(parameter);
  Object.assign(out, styleOf(parameter));
  for (const [key, value] of Object.entries(parameter)) if (key.startsWith('x-')) out[key] = value;
  return out;
}

function convertResponse(response, produces) {
  if (response.$ref) return { $ref: refOf(response.$ref, /^#\/responses\//, '#/components/responses/') };
  const out = { description: response.description || '' };
  if (response.schema) {
    out.content = Object.fromEntries(produces.map((type) => [type, { schema: schemaOf(response.schema) }]));
  }
  if (response.headers) {
    out.headers = Object.fromEntries(
      Object.entries(response.headers).map(([name, header]) => [
        name,
        { ...(header.description ? { description: header.description } : {}), schema: parameterSchema(header) },
      ])
    );
  }
  return out;
}

// The body and formData parameters of an operation as its requestBody (or the one a $ref names).
function requestBodyOf(parameters, consumes) {
  const body = parameters.find((parameter) => parameter.in === 'body');
  if (body) {
    const out = {
      content: Object.fromEntries(consumes.map((type) => [type, { schema: schemaOf(body.schema || {}) }])),
    };
    if (body.description) out.description = body.description;
    if (body.required) out.required = true;
    return out;
  }
  const form = parameters.filter((parameter) => parameter.in === 'formData');
  if (form.length === 0) return null;
  const properties = Object.fromEntries(form.map((parameter) => [parameter.name, parameterSchema(parameter)]));
  const required = form.filter((parameter) => parameter.required).map((parameter) => parameter.name);
  const schema = { type: 'object', properties, ...(required.length ? { required } : {}) };
  const types = consumes.filter((type) => /form/.test(type));
  const formTypes = types.length
    ? types
    : [
        form.some((parameter) => parameter.type === 'file')
          ? 'multipart/form-data'
          : 'application/x-www-form-urlencoded',
      ];
  return { content: Object.fromEntries(formTypes.map((type) => [type, { schema }])), required: required.length > 0 };
}

const FLOWS = {
  implicit: 'implicit',
  password: 'password',
  application: 'clientCredentials',
  accessCode: 'authorizationCode',
};

function convertSecurity(definition) {
  if (definition.type === 'basic')
    return {
      type: 'http',
      scheme: 'basic',
      ...(definition.description ? { description: definition.description } : {}),
    };
  if (definition.type === 'apiKey') return { type: 'apiKey', in: definition.in, name: definition.name };
  if (definition.type === 'oauth2') {
    const flow = {};
    if (definition.authorizationUrl) flow.authorizationUrl = definition.authorizationUrl;
    if (definition.tokenUrl) flow.tokenUrl = definition.tokenUrl;
    flow.scopes = definition.scopes || {};
    return { type: 'oauth2', flows: { [FLOWS[definition.flow] || definition.flow]: flow } };
  }
  return definition;
}

function fromSwagger2(document) {
  const consumesAll = document.consumes || ['application/json'];
  const producesAll = document.produces || ['application/json'];
  // A parameter of the document that is a body (a $ref to it is the requestBody).
  const bodyParameters = new Map(
    Object.entries(document.parameters || {}).filter(
      ([, parameter]) => parameter.in === 'body' || parameter.in === 'formData'
    )
  );

  const out = { openapi: '3.0.3', info: document.info || { title: '', version: '' } };
  if (document.host || document.basePath) {
    const schemes = document.schemes && document.schemes.length ? document.schemes : [document.host ? 'https' : ''];
    out.servers = schemes.map((scheme) => ({
      url: document.host ? `${scheme}://${document.host}${document.basePath || ''}` : document.basePath,
    }));
  }
  for (const key of ['tags', 'externalDocs', 'security']) if (document[key] !== undefined) out[key] = document[key];
  for (const [key, value] of Object.entries(document)) if (key.startsWith('x-')) out[key] = value;

  out.components = {};
  if (document.definitions) {
    out.components.schemas = Object.fromEntries(
      Object.entries(document.definitions).map(([name, schema]) => [name, schemaOf(schema)])
    );
  }
  const parameters = Object.entries(document.parameters || {}).filter(([name]) => !bodyParameters.has(name));
  if (parameters.length)
    out.components.parameters = Object.fromEntries(
      parameters.map(([name, parameter]) => [name, convertParameter(parameter)])
    );
  if (document.responses) {
    out.components.responses = Object.fromEntries(
      Object.entries(document.responses).map(([name, response]) => [name, convertResponse(response, producesAll)])
    );
  }
  if (document.securityDefinitions) {
    out.components.securitySchemes = Object.fromEntries(
      Object.entries(document.securityDefinitions).map(([name, definition]) => [name, convertSecurity(definition)])
    );
  }

  out.paths = {};
  for (const [route, item] of Object.entries(document.paths || {})) {
    const pathItem = {};
    const shared = item.parameters || [];
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation) continue;
      const consumes = operation.consumes || consumesAll;
      const produces = operation.produces || producesAll;
      // $refs to body parameters of the document: as the parameters they name.
      const given = [...shared, ...(operation.parameters || [])].map((parameter) => {
        const name = parameter.$ref && parameter.$ref.replace(/^#\/parameters\//, '');
        return name && bodyParameters.has(name) ? bodyParameters.get(name) : parameter;
      });
      const converted = {};
      for (const key of ['tags', 'summary', 'description', 'operationId', 'deprecated', 'security', 'externalDocs']) {
        if (operation[key] !== undefined) converted[key] = operation[key];
      }
      for (const [key, value] of Object.entries(operation)) if (key.startsWith('x-')) converted[key] = value;
      const other = given.filter(
        (parameter) => parameter.$ref || (parameter.in !== 'body' && parameter.in !== 'formData')
      );
      if (other.length) converted.parameters = other.map(convertParameter);
      const requestBody = requestBodyOf(given, consumes);
      if (requestBody) converted.requestBody = requestBody;
      converted.responses = Object.fromEntries(
        Object.entries(operation.responses || {}).map(([status, response]) => [
          status,
          convertResponse(response, produces),
        ])
      );
      pathItem[method] = converted;
    }
    out.paths[route] = pathItem;
  }
  return out;
}

module.exports = { fromSwagger2 };
