// The request: the raw IncomingMessage with its route context, parameters, query and body.
const proxyAddr = require('./proxy-addr');
const {
  kHasBeenDecorated,
  kSchemaBody,
  kSchemaHeaders,
  kSchemaParams,
  kSchemaQuerystring,
  kSchemaController,
  kOptions,
  kRequestCacheValidateFns,
  kRequestContentType,
  kRouteContext,
  kRequestOriginalUrl,
  kRequestSignal,
  kOnAbort,
  kRequestQuery,
  kRequestQuerystring,
} = require('./symbols');
const { XUFA_ERR_REQ_INVALID_VALIDATION_INVOCATION, XUFA_ERR_DEC_UNDECLARED } = require('./errors');
const decorators = require('./decorate');
const ContentType = require('./content-type');
const querystring = require('./querystring');

const HTTP_PART_SYMBOL_MAP = {
  body: kSchemaBody,
  headers: kSchemaHeaders,
  params: kSchemaParams,
  querystring: kSchemaQuerystring,
  query: kSchemaQuerystring,
};

// The query: parsed when it is read, from the query string the route sets, unless it is given.
function Request(id, params, req, query, log, context) {
  this.id = id;
  this[kRouteContext] = context;
  this.params = params;
  this.raw = req;
  this[kRequestQuerystring] = '';
  this[kRequestQuery] = query;
  this.log = log;
  this.body = undefined;
}
Request.props = [];
Request.instanceProperties = new Set(['id', 'params', 'raw', 'query', 'log', 'body']);

function getTrustProxyFn(trustProxy) {
  if (typeof trustProxy === 'function') return trustProxy;
  if (trustProxy === true) return () => true;
  // A count of hops can not validate the closest peer: nothing is trusted, so clients can not spoof the headers.
  if (typeof trustProxy === 'number') return () => false;
  if (typeof trustProxy === 'string') return proxyAddr.compile(trustProxy.split(',').map((value) => value.trim()));
  return proxyAddr.compile(trustProxy);
}

function buildRequest(R, trustProxy) {
  return trustProxy ? buildRequestWithTrustProxy(R, trustProxy) : buildRegularRequest(R);
}

function buildRegularRequest(R) {
  const props = R.props.slice();
  function XufaRequest(id, params, req, query, log, context) {
    this.id = id;
    this[kRouteContext] = context;
    this.params = params;
    this.raw = req;
    this[kRequestQuerystring] = '';
    this[kRequestQuery] = query;
    this.log = log;
    this.body = undefined;
    for (let i = 0; i < props.length; i += 1) {
      const prop = props[i];
      this[prop.key] = prop.value;
    }
  }
  Object.setPrototypeOf(XufaRequest.prototype, R.prototype);
  Object.setPrototypeOf(XufaRequest, R);
  XufaRequest.props = props;
  XufaRequest.parent = R;
  return XufaRequest;
}

// The last value of a header that may have been set several times ("a, b" -> "b").
function lastEntry(value) {
  const index = value.lastIndexOf(',');
  return index === -1 ? value.trim() : value.slice(index + 1).trim();
}

function buildRequestWithTrustProxy(R, trustProxy) {
  const XufaRequest = buildRegularRequest(R);
  const proxyFn = getTrustProxyFn(trustProxy);
  XufaRequest[kHasBeenDecorated] = true;
  Object.defineProperties(XufaRequest.prototype, {
    ip: {
      get() {
        const addresses = proxyAddr.all(this.raw, proxyFn);
        return addresses[addresses.length - 1];
      },
    },
    ips: {
      get() {
        return proxyAddr.all(this.raw, proxyFn);
      },
    },
    host: {
      get() {
        const socket = this.raw.socket;
        const { headers } = this;
        if (headers['x-forwarded-host'] && socket != null && proxyFn(socket.remoteAddress, 0)) {
          return lastEntry(headers['x-forwarded-host']);
        }
        return headers.host ?? headers[':authority'] ?? '';
      },
    },
    protocol: {
      get() {
        const socket = this.raw.socket;
        const { headers } = this;
        if (headers['x-forwarded-proto'] && socket != null && proxyFn(socket.remoteAddress, 0)) {
          return lastEntry(headers['x-forwarded-proto']);
        }
        if (this.socket) return this.socket.encrypted ? 'https' : 'http';
        return undefined;
      },
    },
  });
  return XufaRequest;
}

function assertRequestDecoration(request, name) {
  if (!decorators.hasKey(request, name) && !decorators.exist(request, name)) {
    throw new XUFA_ERR_DEC_UNDECLARED(name, 'request');
  }
}

const PORT = /:(\d+)$/;

Object.defineProperties(Request.prototype, {
  query: {
    get() {
      let query = this[kRequestQuery];
      if (query === undefined) {
        const context = this[kRouteContext];
        const parser = context && context.querystringParser;
        query = parser ? parser(this[kRequestQuerystring]) : querystring.parse(this[kRequestQuerystring]);
        this[kRequestQuery] = query;
      }
      return query;
    },
    set(value) {
      this[kRequestQuery] = value;
    },
    enumerable: true,
  },
  server: {
    get() {
      return this[kRouteContext].server;
    },
  },
  url: {
    get() {
      return this.raw.url;
    },
  },
  originalUrl: {
    get() {
      if (!this[kRequestOriginalUrl]) this[kRequestOriginalUrl] = this.raw.originalUrl || this.raw.url;
      return this[kRequestOriginalUrl];
    },
  },
  method: {
    get() {
      return this.raw.method;
    },
  },
  routeOptions: {
    get() {
      const context = this[kRouteContext];
      const routeLimit = context._parserOptions.limit;
      const serverLimit = context.server.initialConfig.bodyLimit;
      const version = context.server.hasConstraintStrategy('version') ? this.raw.headers['accept-version'] : undefined;
      return {
        method: context.config && context.config.method,
        url: context.config && context.config.url,
        bodyLimit: routeLimit || serverLimit,
        handlerTimeout: context.handlerTimeout,
        attachValidation: context.attachValidation,
        logLevel: context.logLevel,
        exposeHeadRoute: context.exposeHeadRoute,
        prefixTrailingSlash: context.prefixTrailingSlash,
        handler: context.handler,
        config: context.config,
        schema: context.schema,
        version,
      };
    },
  },
  is404: {
    get() {
      const { config } = this[kRouteContext];
      return !config || config.url === undefined;
    },
  },
  socket: {
    get() {
      return this.raw.socket;
    },
  },
  signal: {
    get() {
      let controller = this[kRequestSignal];
      if (controller) return controller.signal;
      controller = new AbortController();
      this[kRequestSignal] = controller;
      const onAbort = () => {
        if (!controller.signal.aborted) controller.abort();
      };
      this.raw.on('close', onAbort);
      this[kOnAbort] = onAbort;
      return controller.signal;
    },
  },
  ip: {
    get() {
      return this.socket ? this.socket.remoteAddress : undefined;
    },
  },
  host: {
    get() {
      return this.raw.headers.host ?? this.raw.headers[':authority'] ?? '';
    },
  },
  hostname: {
    get() {
      const { host } = this;
      if (host[0] === '[') {
        // An IPv6 host: [::1]:3000
        const end = host.indexOf(']');
        return end === -1 ? host : host.slice(0, end + 1);
      }
      return host.split(':', 1)[0];
    },
  },
  port: {
    get() {
      const match = PORT.exec(this.host);
      return match === null ? null : Number.parseInt(match[1], 10);
    },
  },
  protocol: {
    get() {
      if (this.socket) return this.socket.encrypted ? 'https' : 'http';
      return undefined;
    },
  },
  headers: {
    get() {
      if (this.additionalHeaders) return { ...this.raw.headers, ...this.additionalHeaders };
      return this.raw.headers;
    },
    set(headers) {
      this.additionalHeaders = headers;
    },
  },
  mediaType: {
    get() {
      if (!this[kRequestContentType] && this.headers['content-type'] !== undefined) {
        this[kRequestContentType] = ContentType.from(this.headers['content-type']);
      }
      return this[kRequestContentType] ? this[kRequestContentType].mediaType : undefined;
    },
  },
  getValidationFunction: {
    value: function getValidationFunction(httpPartOrSchema) {
      const context = this[kRouteContext];
      if (typeof httpPartOrSchema === 'string') return context[HTTP_PART_SYMBOL_MAP[httpPartOrSchema]];
      if (typeof httpPartOrSchema === 'object') {
        return context[kRequestCacheValidateFns] ? context[kRequestCacheValidateFns].get(httpPartOrSchema) : undefined;
      }
      return undefined;
    },
  },
  compileValidationSchema: {
    value: function compileValidationSchema(schema, httpPart = null) {
      const context = this[kRouteContext];
      if (context[kRequestCacheValidateFns] && context[kRequestCacheValidateFns].has(schema)) {
        return context[kRequestCacheValidateFns].get(schema);
      }
      const controller = this.server[kSchemaController];
      let compiler = context.validatorCompiler || controller.validatorCompiler;
      if (!compiler) {
        controller.setupValidator(this.server[kOptions]);
        compiler = controller.validatorCompiler;
      }
      const validateFn = compiler({ schema, method: this.method, url: this.url, httpPart });
      if (context[kRequestCacheValidateFns] == null) context[kRequestCacheValidateFns] = new WeakMap();
      context[kRequestCacheValidateFns].set(schema, validateFn);
      return validateFn;
    },
  },
  validateInput: {
    value: function validateInput(input, schema, httpPartArg) {
      const httpPart = typeof schema === 'string' ? schema : httpPartArg;
      const symbol = httpPart != null && typeof httpPart === 'string' && HTTP_PART_SYMBOL_MAP[httpPart];
      const context = this[kRouteContext];
      let validate;
      if (symbol) validate = context[symbol];
      if (validate == null && (schema == null || typeof schema !== 'object' || Array.isArray(schema))) {
        throw new XUFA_ERR_REQ_INVALID_VALIDATION_INVOCATION(httpPart);
      }
      if (validate == null) {
        validate =
          context[kRequestCacheValidateFns] && context[kRequestCacheValidateFns].has(schema)
            ? context[kRequestCacheValidateFns].get(schema)
            : this.compileValidationSchema(schema, httpPart);
      }
      return validate(input);
    },
  },
  getDecorator: {
    value: function getDecorator(name) {
      assertRequestDecoration(this, name);
      const decorator = this[name];
      return typeof decorator === 'function' ? decorator.bind(this) : decorator;
    },
  },
  setDecorator: {
    value: function setDecorator(name, value) {
      assertRequestDecoration(this, name);
      this[name] = value;
    },
  },
});

module.exports = Request;
module.exports.buildRequest = buildRequest;
