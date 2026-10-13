// Ported from fastify (test/types/route.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { XufaError } from '@xufa/errors'
import * as http from 'node:http'
import { expectTypeOf } from '@xufa/test';
import xufa, { XufaInstance, XufaReply, XufaRequest, RouteHandlerMethod } from '../..'
import { RequestPayload } from '../../types/hooks.js'
import { FindMyWayFindResult } from '../../types/instance.js'
import { HTTPMethods, RawServerDefault } from '../../types/utils.js'

/*
 * Testing Xufa HTTP Routes and Route Shorthands.
 * Verifies Request and Reply types as well.
 * For the route shorthand tests the argument orders are:
 * - `(path, handler)`
 * - `(path, options, handler)`
 * - `(path, options)`
 */

declare module '../..' {
  interface XufaContextConfig {
    foo: string;
    bar: number;
    includeMessage?: boolean;
  }

  interface XufaRequest<
    RouteGeneric,
    RawServer,
    RawRequest,
    SchemaCompiler,
    TypeProvider,
    ContextConfig,
    Logger,
    RequestType
  > {
    message: ContextConfig extends { includeMessage: true }
      ? string
      : null;
  }
}

const routeHandler: RouteHandlerMethod = function (request, reply) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
}

const routeHandlerWithReturnValue: RouteHandlerMethod = function (request, reply) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();

  return reply.send()
}

const asyncPreHandler = async (request: XufaRequest) => {
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
}

xufa().get('/', { preHandler: asyncPreHandler }, async () => 'this is an example')

xufa().route({
  method: 'GET',
  url: '/',
  onRequest: async function () {
    expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  },
  handler: async () => 'ok'
})

xufa().get(
  '/',
  { config: { foo: 'bar', bar: 100, includeMessage: true } },
  (req) => {
    expectTypeOf(req.message).toEqualTypeOf<string>();
  }
)

xufa().get(
  '/',
  { config: { foo: 'bar', bar: 100, includeMessage: false } },
  (req) => {
    expectTypeOf(req.message).toEqualTypeOf<null>();
  }
)

type LowerCaseHTTPMethods = 'delete' | 'get' | 'head' | 'patch' | 'post' | 'put' |
  'options' | 'query' | 'propfind' | 'proppatch' | 'mkcol' | 'copy' | 'move' | 'lock' |
  'unlock' | 'trace' | 'search' | 'mkcalendar' | 'report'

  ;['DELETE', 'GET', 'HEAD', 'PATCH', 'POST', 'PUT', 'OPTIONS', 'QUERY', 'PROPFIND',
  'PROPPATCH', 'MKCOL', 'COPY', 'MOVE', 'LOCK', 'UNLOCK', 'TRACE', 'SEARCH', 'MKCALENDAR', 'REPORT'
].forEach(method => {
  // route method
  expectTypeOf(xufa().route({
    method: method as HTTPMethods,
    url: '/',
    handler: routeHandler
  })).toEqualTypeOf<XufaInstance>();

  const lowerCaseMethod: LowerCaseHTTPMethods = method.toLowerCase() as LowerCaseHTTPMethods

  // method as method
  expectTypeOf(xufa()[lowerCaseMethod]('/', routeHandler)).toEqualTypeOf<XufaInstance>();
  expectTypeOf(xufa()[lowerCaseMethod]('/', {}, routeHandler)).toEqualTypeOf<XufaInstance>();
  expectTypeOf(xufa()[lowerCaseMethod]('/', { handler: routeHandler })).toEqualTypeOf<XufaInstance>();

  expectTypeOf(xufa()[lowerCaseMethod]('/', {
    handler: routeHandler,
    errorHandler: (error, request, reply) => {
      expectTypeOf(error).toEqualTypeOf<XufaError>();
      reply.send('error')
    },
    childLoggerFactory: function (logger, bindings, opts) {
      return logger.child(bindings, opts)
    }
  })).toEqualTypeOf<XufaInstance>();

  interface BodyInterface { prop: string }
  interface QuerystringInterface { prop: number }
  interface ParamsInterface { prop: boolean }
  interface HeadersInterface { prop: string }
  interface RouteSpecificContextConfigType {
    extra: boolean
  }
  interface RouteGeneric {
    Body: BodyInterface;
    Querystring: QuerystringInterface;
    Params: ParamsInterface;
    Headers: HeadersInterface;
  }

  xufa()[lowerCaseMethod]<RouteGeneric, RouteSpecificContextConfigType>('/', { config: { foo: 'bar', bar: 100, extra: true } }, (req, res) => {
    expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
    expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
    expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
    expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
    expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
    expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
    expectTypeOf(req.routeOptions.config.extra).toEqualTypeOf<boolean>();
    expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
    expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
    expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
    expectTypeOf(res.routeOptions.config.extra).toEqualTypeOf<boolean>();
    expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
    expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
  })

  xufa().route<RouteGeneric>({
    url: '/',
    method: method as HTTPMethods,
    config: { foo: 'bar', bar: 100 },
    prefixTrailingSlash: 'slash',
    onRequest: (req, res, done) => { // these handlers are tested in `hooks.test-d.ts`
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    },
    preParsing: (req, res, payload, done) => {
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(payload).toEqualTypeOf<RequestPayload>();
      expectTypeOf(done).toMatchTypeOf<(err?: XufaError | null, res?: RequestPayload) => void>();
      expectTypeOf(done).toMatchTypeOf<(err?: NodeJS.ErrnoException) => void>();
    },
    preValidation: (req, res, done) => {
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    },
    preHandler: (req, res, done) => {
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    },
    onResponse: (req, res, done) => {
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.statusCode).toEqualTypeOf<number>();
    },
    onError: (req, res, error, done) => {
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    },
    preSerialization: (req, res, payload, done) => {
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    },
    onSend: (req, res, payload, done) => {
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    },
    handler: (req, res) => {
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    }
  })

  xufa().route<RouteGeneric>({
    url: '/',
    method: method as HTTPMethods,
    config: { foo: 'bar', bar: 100 },
    prefixTrailingSlash: 'slash',
    onRequest: async (req, res, done) => { // these handlers are tested in `hooks.test-d.ts`
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    },
    preParsing: async (req, res, payload, done) => {
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(payload).toEqualTypeOf<RequestPayload>();
      expectTypeOf(done).toMatchTypeOf<(err?: XufaError | null, res?: RequestPayload) => void>();
      expectTypeOf(done).toMatchTypeOf<(err?: NodeJS.ErrnoException) => void>();
    },
    preValidation: async (req, res, done) => {
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    },
    preHandler: async (req, res, done) => {
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    },
    onResponse: async (req, res, done) => {
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.statusCode).toEqualTypeOf<number>();
    },
    onError: async (req, res, error, done) => {
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    },
    preSerialization: async (req, res, payload, done) => {
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    },
    onSend: async (req, res, payload, done) => {
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    },
    handler: (req, res) => {
      expectTypeOf(req.body).toEqualTypeOf<BodyInterface>();
      expectTypeOf(req.query).toEqualTypeOf<QuerystringInterface>();
      expectTypeOf(req.params).toEqualTypeOf<ParamsInterface>();
      expectTypeOf(req.headers).toEqualTypeOf<http.IncomingHttpHeaders & HeadersInterface>();
      expectTypeOf(req.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
      expectTypeOf(res.routeOptions.config.foo).toEqualTypeOf<string>();
      expectTypeOf(res.routeOptions.config.bar).toEqualTypeOf<number>();
      expectTypeOf(req.routeOptions.config.url).toEqualTypeOf<string>();
      expectTypeOf(req.routeOptions.config.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    }
  })
})

expectTypeOf(xufa().route({
  url: '/',
  method: 'CONNECT', // not a valid method but could be implemented by the user
  handler: routeHandler
})).toEqualTypeOf<XufaInstance>();

expectTypeOf(xufa().route({
  url: '/',
  method: 'OPTIONS',
  handler: routeHandler
})).toEqualTypeOf<XufaInstance>();

expectTypeOf(xufa().route({
  url: '/',
  method: 'OPTION', // OPTION is a typo for OPTIONS
  handler: routeHandler
})).toEqualTypeOf<XufaInstance>();

expectTypeOf(xufa().route({
  url: '/',
  method: ['GET', 'POST'],
  handler: routeHandler
})).toEqualTypeOf<XufaInstance>();

expectTypeOf(xufa().route({
  url: '/',
  method: ['GET', 'POST', 'OPTION'], // OPTION is a typo for OPTIONS
  handler: routeHandler
})).toEqualTypeOf<XufaInstance>();

expectTypeOf(xufa().route({
  url: '/',
  method: 'GET',
  handler: routeHandler,
  schemaErrorFormatter: (errors, dataVar) => new Error('')
})).toEqualTypeOf<XufaInstance>();

(xufa().route)({
  url: '/',
  method: 'GET',
  handler: routeHandler,
  // @ts-expect-error
  schemaErrorFormatter: 500
});

expectTypeOf(xufa().route({
  url: '/',
  method: 'GET',
  handler: routeHandler,
  prefixTrailingSlash: 'slash'
})).toEqualTypeOf<XufaInstance>();

expectTypeOf(xufa().route({
  url: '/',
  method: 'GET',
  handler: routeHandler,
  prefixTrailingSlash: 'no-slash'
})).toEqualTypeOf<XufaInstance>();

expectTypeOf(xufa().route({
  url: '/',
  method: 'GET',
  handler: routeHandler,
  prefixTrailingSlash: 'both'
})).toEqualTypeOf<XufaInstance>();

(xufa().route)({
  url: '/',
  method: 'GET',
  handler: routeHandler,
  // @ts-expect-error
  prefixTrailingSlash: true
});

expectTypeOf(xufa().route({
  url: '/',
  method: 'GET',
  handler: routeHandlerWithReturnValue
})).toEqualTypeOf<XufaInstance>();

expectTypeOf(xufa().hasRoute({
  url: '/',
  method: 'GET'
})).toEqualTypeOf<boolean>();

xufa().hasRoute({
  url: '/',
  // @ts-expect-error  Type 'string[]' is not assignable to type 'HTTPMethods'.
  method: ['GET', 'POST']
})

expectTypeOf(xufa().hasRoute({
  url: '/',
  method: 'GET',
  constraints: { version: '1.2.0' }
})).toEqualTypeOf<boolean>();

expectTypeOf(xufa().hasRoute({
  url: '/',
  method: 'GET',
  constraints: { host: 'auth.xufa.test' }
})).toEqualTypeOf<boolean>();

expectTypeOf(xufa().hasRoute({
  url: '/',
  method: 'GET',
  constraints: { host: /.*\.xufa\.test$/ }
})).toEqualTypeOf<boolean>();

expectTypeOf(xufa().hasRoute({
  url: '/',
  method: 'GET',
  constraints: { host: /.*\.xufa\.test$/, version: '1.2.3' }
})).toEqualTypeOf<boolean>();

expectTypeOf(xufa().hasRoute({
  url: '/',
  method: 'GET',
  constraints: {
    // constraints value should accept any value
    number: 12,
    date: new Date(),
    boolean: true,
    function: () => { },
    object: { foo: 'bar' }
  }
})).toEqualTypeOf<boolean>();

expectTypeOf(xufa().findRoute({
    url: '/',
    method: 'get'
  })).toEqualTypeOf<Omit<FindMyWayFindResult<RawServerDefault>, 'store'>>();

xufa().findRoute({
  url: '/',
  // @ts-expect-error  Type 'string[]' is not assignable to type 'HTTPMethods'.
  method: ['GET', 'POST']
})

// we should not expose store
expectTypeOf(xufa().findRoute({
  url: '/',
  method: 'get'
})).not.toHaveProperty('store');

expectTypeOf(xufa().route({
  url: '/',
  method: 'get',
  handler: routeHandlerWithReturnValue
})).toEqualTypeOf<XufaInstance>();

expectTypeOf(xufa().route({
  url: '/',
  method: ['put', 'patch'],
  handler: routeHandlerWithReturnValue
})).toEqualTypeOf<XufaInstance>();

expectTypeOf(xufa().route({
  url: '/',
  method: 'GET',
  handler: (req) => {
    expectTypeOf(req.routeOptions.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    expectTypeOf(req.routeOptions.method).toMatchTypeOf<string | Array<string>>();
  }
})).toEqualTypeOf<XufaInstance>();

expectTypeOf(xufa().route({
  url: '/',
  method: ['HEAD', 'GET'],
  handler: (req) => {
    expectTypeOf(req.routeOptions.method).toEqualTypeOf<HTTPMethods | HTTPMethods[]>();
    expectTypeOf(req.routeOptions.method).toMatchTypeOf<string | Array<string>>();
  }
})).toEqualTypeOf<XufaInstance>();
