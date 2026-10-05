// @xufa/openapi: OpenAPI (and Swagger 2) documents of the routes of an app of @xufa/http (and fastify), from their
// schemas, or a static document. The code is the one of @fastify/swagger (MIT, LICENSE.fastify-swagger), with the
// API of its plugin: app.register(openapi, { openapi: { info: { title, version } } }); app.swagger() is the document.
// What xufa adds (lib/xufa/xufa.js): routes documented by their config `openapi` (the resources of @xufa/orm), and
// the security schemes of @xufa/auth. lib/ui.js is the explorer (@xufa/openapi/ui).
const { formatParamUrl } = require('./lib/util/format-param-url');
const { withXufa } = require('./lib/xufa/xufa');
const { operations, OpenapiError, ResponseValidationError } = require('./lib/xufa/operations');
const { bundle, BundleError } = require('./lib/xufa/bundle');
const { fromSwagger2 } = require('./lib/xufa/swagger2');

function fastifySwagger(fastify, opts, next) {
  // by default the mode is dynamic, as plugin initially was developed
  opts.mode = opts.mode || 'dynamic';

  switch (opts.mode) {
    case 'static': {
      const setup = require('./lib/mode/static');
      setup(fastify, opts, next);
      break;
    }
    case 'dynamic': {
      const setup = require('./lib/mode/dynamic');
      // With what xufa adds: the route config openapi, and the security of @xufa/auth (lib/xufa/xufa.js).
      setup(fastify, withXufa(fastify, opts), next);
      break;
    }
    default: {
      next(new Error("unsupported mode, should be one of ['static', 'dynamic']"));
    }
  }
}

// As fastify-plugin does: the plugin sees the routes of the app it is registered in (not an encapsulated child).
fastifySwagger[Symbol.for('skip-override')] = true;
fastifySwagger[Symbol.for('fastify.display-name')] = '@fastify/swagger';
fastifySwagger[Symbol.for('plugin-meta')] = { name: '@fastify/swagger', fastify: '5.x' };

module.exports = fastifySwagger;
module.exports.fastifySwagger = fastifySwagger;
module.exports.default = fastifySwagger;
module.exports.formatParamUrl = formatParamUrl;
// Routes made from an OpenAPI 3 document (design first): lib/xufa/operations.js.
module.exports.operations = operations;
module.exports.OpenapiError = OpenapiError;
module.exports.ResponseValidationError = ResponseValidationError;
// A document split in files as one (its $refs to other files taken in), and Swagger 2.0 as OpenAPI 3.
module.exports.bundle = bundle;
module.exports.BundleError = BundleError;
module.exports.fromSwagger2 = fromSwagger2;
