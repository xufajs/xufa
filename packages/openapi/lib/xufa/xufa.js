'use strict';

// What @xufa/openapi adds to the documents of @fastify/swagger (OpenAPI 3, dynamic mode; `xufa: false` leaves it
// out), through its options transform and transformObject (yours still run, after):
//
// - The route config `openapi`: a schema that only documents a route (the resources of @xufa/orm give theirs), under
//   its own schema, which wins: it is never used to validate or serialize.
// - The strategies of @xufa/auth: components.securitySchemes from the `openapi` of each (bearer JWTs, API keys, HTTP
//   Basic, OAuth 2.0 of Passport...), and the `security` of the routes with config.auth (any of their strategies:
//   those of the rule, or every one).

// The strategies of the auth plugin with a security scheme, by name (none without the plugin).
function schemesOf(app) {
  const auth = app.auth;
  const strategies = auth && auth.strategies instanceof Map ? auth.strategies : null;
  if (!strategies) return null;
  const schemes = {};
  for (const [name, strategy] of strategies) if (strategy && strategy.openapi) schemes[name] = strategy.openapi;
  return Object.keys(schemes).length ? schemes : null;
}

// The security requirement of a rule of config.auth: any of its strategies (OpenAPI: a list is "or").
function securityOf(app, rule) {
  if (rule === undefined || rule === null || rule === false) return undefined;
  const schemes = schemesOf(app);
  if (!schemes) return undefined;
  const named = rule && typeof rule === 'object' && !Array.isArray(rule) && rule.strategy !== undefined;
  const names = named ? [].concat(rule.strategy) : Object.keys(schemes);
  const security = names.filter((name) => schemes[name]).map((name) => ({ [name]: [] }));
  return security.length ? security : undefined;
}

// The schemes in the document (yours win): before its routes, whose security is read against them.
function addSchemes(app, document) {
  const schemes = schemesOf(app);
  if (!schemes || !document) return;
  document.components = document.components || {};
  document.components.securitySchemes = { ...schemes, ...(document.components.securitySchemes || {}) };
}

function withXufa(app, opts) {
  if (opts.mode === 'static' || !opts.openapi || opts.xufa === false) return opts;
  const { transform, transformObject } = opts;
  return {
    ...opts,
    transform(args) {
      addSchemes(app, args.openapiObject);
      const config = (args.route && args.route.config) || {};
      let schema = args.schema;
      if (config.openapi && typeof config.openapi === 'object') schema = { ...config.openapi, ...(schema || {}) };
      if (!(schema && schema.security)) {
        const security = securityOf(app, config.auth);
        if (security) schema = { ...(schema || {}), security };
      }
      if (transform) return transform({ ...args, schema });
      return { schema, url: args.url };
    },
    transformObject(args) {
      // A document without routes has them too.
      addSchemes(app, args.openapiObject);
      return transformObject ? transformObject(args) : args.openapiObject;
    },
  };
}

module.exports = { withXufa, schemesOf, securityOf };
