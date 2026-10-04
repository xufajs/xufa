// Ported from fastify (test/types/route.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { XufaError } from '@xufa/errors'
import * as http from 'node:http'
import { expect } from 'tstyche'
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
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
}

const routeHandlerWithReturnValue: RouteHandlerMethod = function (request, reply) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()

  return reply.send()
}

const asyncPreHandler = async (request: XufaRequest) => {
  expect(request).type.toBe<XufaRequest>()
}

xufa().get('/', { preHandler: asyncPreHandler }, async () => 'this is an example')

xufa().route({
  method: 'GET',
  url: '/',
  onRequest: async function () {
    expect(this).type.toBe<XufaInstance>()
  },
  handler: async () => 'ok'
})

xufa().get(
  '/',
  { config: { foo: 'bar', bar: 100, includeMessage: true } },
  (req) => {
    expect(req.message).type.toBe<string>()
  }
)

xufa().get(
  '/',
  { config: { foo: 'bar', bar: 100, includeMessage: false } },
  (req) => {
    expect(req.message).type.toBe<null>()
  }
)

type LowerCaseHTTPMethods = 'delete' | 'get' | 'head' | 'patch' | 'post' | 'put' |
  'options' | 'query' | 'propfind' | 'proppatch' | 'mkcol' | 'copy' | 'move' | 'lock' |
  'unlock' | 'trace' | 'search' | 'mkcalendar' | 'report'

  ;['DELETE', 'GET', 'HEAD', 'PATCH', 'POST', 'PUT', 'OPTIONS', 'QUERY', 'PROPFIND',
  'PROPPATCH', 'MKCOL', 'COPY', 'MOVE', 'LOCK', 'UNLOCK', 'TRACE', 'SEARCH', 'MKCALENDAR', 'REPORT'
].forEach(method => {
  // route method
  expect(xufa().route({
    method: method as HTTPMethods,
    url: '/',
    handler: routeHandler
  })).type.toBe<XufaInstance>()

  const lowerCaseMethod: LowerCaseHTTPMethods = method.toLowerCase() as LowerCaseHTTPMethods

  // method as method
  expect(xufa()[lowerCaseMethod]('/', routeHandler)).type.toBe<XufaInstance>()
  expect(xufa()[lowerCaseMethod]('/', {}, routeHandler)).type.toBe<XufaInstance>()
  expect(xufa()[lowerCaseMethod]('/', { handler: routeHandler })).type.toBe<XufaInstance>()

  expect(xufa()[lowerCaseMethod]('/', {
    handler: routeHandler,
    errorHandler: (error, request, reply) => {
      expect(error).type.toBe<XufaError>()
      reply.send('error')
    },
    childLoggerFactory: function (logger, bindings, opts) {
      return logger.child(bindings, opts)
    }
  })).type.toBe<XufaInstance>()

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
    expect(req.body).type.toBe<BodyInterface>()
    expect(req.query).type.toBe<QuerystringInterface>()
    expect(req.params).type.toBe<ParamsInterface>()
    expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
    expect(req.routeOptions.config.foo).type.toBe<string>()
    expect(req.routeOptions.config.bar).type.toBe<number>()
    expect(req.routeOptions.config.extra).type.toBe<boolean>()
    expect(req.routeOptions.config.url).type.toBe<string>()
    expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    expect(res.routeOptions.config.foo).type.toBe<string>()
    expect(res.routeOptions.config.bar).type.toBe<number>()
    expect(res.routeOptions.config.extra).type.toBe<boolean>()
    expect(req.routeOptions.config.url).type.toBe<string>()
    expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
  })

  xufa().route<RouteGeneric>({
    url: '/',
    method: method as HTTPMethods,
    config: { foo: 'bar', bar: 100 },
    prefixTrailingSlash: 'slash',
    onRequest: (req, res, done) => { // these handlers are tested in `hooks.test-d.ts`
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    },
    preParsing: (req, res, payload, done) => {
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(payload).type.toBe<RequestPayload>()
      expect(done).type.toBeAssignableTo<(err?: XufaError | null, res?: RequestPayload) => void>()
      expect(done).type.toBeAssignableTo<(err?: NodeJS.ErrnoException) => void>()
    },
    preValidation: (req, res, done) => {
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    },
    preHandler: (req, res, done) => {
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    },
    onResponse: (req, res, done) => {
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.statusCode).type.toBe<number>()
    },
    onError: (req, res, error, done) => {
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    },
    preSerialization: (req, res, payload, done) => {
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    },
    onSend: (req, res, payload, done) => {
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    },
    handler: (req, res) => {
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    }
  })

  xufa().route<RouteGeneric>({
    url: '/',
    method: method as HTTPMethods,
    config: { foo: 'bar', bar: 100 },
    prefixTrailingSlash: 'slash',
    onRequest: async (req, res, done) => { // these handlers are tested in `hooks.test-d.ts`
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    },
    preParsing: async (req, res, payload, done) => {
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(payload).type.toBe<RequestPayload>()
      expect(done).type.toBeAssignableTo<(err?: XufaError | null, res?: RequestPayload) => void>()
      expect(done).type.toBeAssignableTo<(err?: NodeJS.ErrnoException) => void>()
    },
    preValidation: async (req, res, done) => {
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    },
    preHandler: async (req, res, done) => {
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    },
    onResponse: async (req, res, done) => {
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.statusCode).type.toBe<number>()
    },
    onError: async (req, res, error, done) => {
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    },
    preSerialization: async (req, res, payload, done) => {
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    },
    onSend: async (req, res, payload, done) => {
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    },
    handler: (req, res) => {
      expect(req.body).type.toBe<BodyInterface>()
      expect(req.query).type.toBe<QuerystringInterface>()
      expect(req.params).type.toBe<ParamsInterface>()
      expect(req.headers).type.toBe<http.IncomingHttpHeaders & HeadersInterface>()
      expect(req.routeOptions.config.foo).type.toBe<string>()
      expect(req.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
      expect(res.routeOptions.config.foo).type.toBe<string>()
      expect(res.routeOptions.config.bar).type.toBe<number>()
      expect(req.routeOptions.config.url).type.toBe<string>()
      expect(req.routeOptions.config.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    }
  })
})

expect(xufa().route({
  url: '/',
  method: 'CONNECT', // not a valid method but could be implemented by the user
  handler: routeHandler
})).type.toBe<XufaInstance>()

expect(xufa().route({
  url: '/',
  method: 'OPTIONS',
  handler: routeHandler
})).type.toBe<XufaInstance>()

expect(xufa().route({
  url: '/',
  method: 'OPTION', // OPTION is a typo for OPTIONS
  handler: routeHandler
})).type.toBe<XufaInstance>()

expect(xufa().route({
  url: '/',
  method: ['GET', 'POST'],
  handler: routeHandler
})).type.toBe<XufaInstance>()

expect(xufa().route({
  url: '/',
  method: ['GET', 'POST', 'OPTION'], // OPTION is a typo for OPTIONS
  handler: routeHandler
})).type.toBe<XufaInstance>()

expect(xufa().route({
  url: '/',
  method: 'GET',
  handler: routeHandler,
  schemaErrorFormatter: (errors, dataVar) => new Error('')
})).type.toBe<XufaInstance>()

expect(xufa().route).type.not.toBeCallableWith({
  url: '/',
  method: 'GET',
  handler: routeHandler,
  schemaErrorFormatter: 500
})

expect(xufa().route({
  url: '/',
  method: 'GET',
  handler: routeHandler,
  prefixTrailingSlash: 'slash'
})).type.toBe<XufaInstance>()

expect(xufa().route({
  url: '/',
  method: 'GET',
  handler: routeHandler,
  prefixTrailingSlash: 'no-slash'
})).type.toBe<XufaInstance>()

expect(xufa().route({
  url: '/',
  method: 'GET',
  handler: routeHandler,
  prefixTrailingSlash: 'both'
})).type.toBe<XufaInstance>()

expect(xufa().route).type.not.toBeCallableWith({
  url: '/',
  method: 'GET',
  handler: routeHandler,
  prefixTrailingSlash: true
})

expect(xufa().route({
  url: '/',
  method: 'GET',
  handler: routeHandlerWithReturnValue
})).type.toBe<XufaInstance>()

expect(xufa().hasRoute({
  url: '/',
  method: 'GET'
})).type.toBe<boolean>()

xufa().hasRoute({
  url: '/',
  // @ts-expect-error  Type 'string[]' is not assignable to type 'HTTPMethods'.
  method: ['GET', 'POST']
})

expect(xufa().hasRoute({
  url: '/',
  method: 'GET',
  constraints: { version: '1.2.0' }
})).type.toBe<boolean>()

expect(xufa().hasRoute({
  url: '/',
  method: 'GET',
  constraints: { host: 'auth.xufa.test' }
})).type.toBe<boolean>()

expect(xufa().hasRoute({
  url: '/',
  method: 'GET',
  constraints: { host: /.*\.xufa\.test$/ }
})).type.toBe<boolean>()

expect(xufa().hasRoute({
  url: '/',
  method: 'GET',
  constraints: { host: /.*\.xufa\.test$/, version: '1.2.3' }
})).type.toBe<boolean>()

expect(xufa().hasRoute({
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
})).type.toBe<boolean>()

expect(
  xufa().findRoute({
    url: '/',
    method: 'get'
  })
).type.toBe<Omit<FindMyWayFindResult<RawServerDefault>, 'store'>>()

xufa().findRoute({
  url: '/',
  // @ts-expect-error  Type 'string[]' is not assignable to type 'HTTPMethods'.
  method: ['GET', 'POST']
})

// we should not expose store
expect(xufa().findRoute({
  url: '/',
  method: 'get'
})).type.not.toHaveProperty('store')

expect(xufa().route({
  url: '/',
  method: 'get',
  handler: routeHandlerWithReturnValue
})).type.toBe<XufaInstance>()

expect(xufa().route({
  url: '/',
  method: ['put', 'patch'],
  handler: routeHandlerWithReturnValue
})).type.toBe<XufaInstance>()

expect(xufa().route({
  url: '/',
  method: 'GET',
  handler: (req) => {
    expect(req.routeOptions.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    expect(req.routeOptions.method).type.toBeAssignableTo<string | Array<string>>()
  }
})).type.toBe<XufaInstance>()

expect(xufa().route({
  url: '/',
  method: ['HEAD', 'GET'],
  handler: (req) => {
    expect(req.routeOptions.method).type.toBe<HTTPMethods | HTTPMethods[]>()
    expect(req.routeOptions.method).type.toBeAssignableTo<string | Array<string>>()
  }
})).type.toBe<XufaInstance>()
