// Ported from fastify (test/types/fastify.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import Ajv, { ErrorObject as AjvErrorObject } from 'ajv'
import * as http from 'node:http'
import * as http2 from 'node:http2'
import * as https from 'node:https'
import { Socket } from 'node:net'
import pino from '@xufa/logger'
import { expect } from 'tstyche'
import xufa, {
  ConnectionError,
  XufaBaseLogger,
  XufaError,
  XufaErrorCodes,
  XufaInstance,
  XufaPluginAsync,
  XufaPluginCallback,
  InjectOptions,
  LightMyRequestCallback,
  LightMyRequestChain,
  LightMyRequestResponse,
  RawRequestDefaultExpression,
  RouteGenericInterface,
  SafePromiseLike
} from '../..'
import { Bindings, ChildLoggerOptions } from '../../types/logger.js'

// XufaInstance
// http server
expect(xufa()).type.not.toBeAssignableTo<
  XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse> &
  Promise<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse>>
>()
expect(xufa()).type.toBeAssignableTo<
  XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse> &
  PromiseLike<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse>>
>()
expect(xufa()).type.toBe<
  XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse>>
>()
expect(xufa({})).type.toBe<
  XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse>>
>()
expect(xufa({ http: {} })).type.toBe<
  XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse>>
>()
// https server
expect(xufa({ https: {} })).type.toBe<
  XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse>>
>()
expect(xufa({ https: null })).type.toBe<
  XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse>>
>()
// http2 server
expect(xufa({ http2: true, http2SessionTimeout: 1000 })).type.toBe<
  XufaInstance<http2.Http2Server, http2.Http2ServerRequest, http2.Http2ServerResponse> &
  SafePromiseLike<XufaInstance<http2.Http2Server, http2.Http2ServerRequest, http2.Http2ServerResponse>>
>()
expect(xufa({ http2: true, https: {}, http2SessionTimeout: 1000 })).type.toBe<
  XufaInstance<http2.Http2SecureServer, http2.Http2ServerRequest, http2.Http2ServerResponse> &
  SafePromiseLike<XufaInstance<http2.Http2SecureServer, http2.Http2ServerRequest, http2.Http2ServerResponse>>
>()
expect(xufa({ http2: true, https: {} }).inject()).type.toBe<LightMyRequestChain>()
expect(xufa({ schemaController: {} })).type.toBe<
  XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse>>
>()

expect(xufa({ http2: false })).type.toBe<
  XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse>>
>()

expect(xufa({ https: {}, http2: false })).type.toBe<
  XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse>>
>()

expect(
  xufa({
    schemaController: {
      compilersFactory: {}
    }
  })
).type.toBe<
  XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse>>
>()

// @ts-expect-error  Type 'false' is not assignable to type 'true'.
xufa<http2.Http2Server>({ http2: false })
// @ts-expect-error  Type 'false' is not assignable to type 'true'.
xufa<http2.Http2SecureServer>({ http2: false })
xufa({
  schemaController: {
    // @ts-expect-error  No overload matches this call.
    bucket: () => ({})
  }
})

// light-my-request
expect<InjectOptions>().type.toBeAssignableFrom({ query: '' })
xufa({ http2: true, https: {} }).inject().then((resp) => {
  expect(resp).type.toBe<LightMyRequestResponse>()
})
const lightMyRequestCallback: LightMyRequestCallback = (
  err: Error | undefined,
  response: LightMyRequestResponse | undefined
) => {
  if (err) throw err
}
xufa({ http2: true, https: {} }).inject({}, lightMyRequestCallback)

// server options
expect(xufa({ http2: true })).type.toBeAssignableTo<
  XufaInstance<http2.Http2Server, http2.Http2ServerRequest, http2.Http2ServerResponse>
>()
expect(xufa({ ignoreTrailingSlash: true })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ ignoreDuplicateSlashes: true })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ connectionTimeout: 1000 })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ forceCloseConnections: true })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ keepAliveTimeout: 1000 })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ pluginTimeout: 1000 })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ bodyLimit: 100 })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ handlerTimeout: 5000 })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ maxParamLength: 100 })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ onProtoPoisoning: 'error' })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ onConstructorPoisoning: 'error' })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ serializerOpts: { rounding: 'ceil' } })).type.toBeAssignableTo<XufaInstance>()
expect(
  xufa({ serializerOpts: { ajv: { missingRefs: 'ignore' } } })
).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ serializerOpts: { schema: {} } })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ serializerOpts: { otherProp: {} } })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ logger: true })).type.toBeAssignableTo<
  XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse, XufaBaseLogger>
>()
expect(xufa({ logger: true })).type.toBeAssignableTo<
  XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse, XufaBaseLogger>
>()
expect(xufa({
  logger: {
    level: 'info',
    genReqId: () => 'request-id',
    serializers: {
      req: () => {
        return {
          method: 'GET',
          url: '/',
          version: '1.0.0',
          host: 'localhost',
          remoteAddress: '127.0.0.1',
          remotePort: 3000
        }
      },
      res: () => {
        return {
          statusCode: 200
        }
      },
      err: () => {
        return {
          type: 'Error',
          message: 'foo',
          stack: ''
        }
      }
    }
  }
})).type.toBeAssignableTo<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse, XufaBaseLogger>>()
const customLogger = {
  level: 'info',
  info: () => { },
  warn: () => { },
  error: () => { },
  fatal: () => { },
  trace: () => { },
  debug: () => { },
  child: () => customLogger
}
const pinoLogger = pino()
const pinoLoggerServer: XufaInstance = xufa({ loggerInstance: pinoLogger })

expect(pinoLoggerServer).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ logger: customLogger })).type.toBeAssignableTo<
  XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse, XufaBaseLogger>
>()
expect(xufa({ serverFactory: () => http.createServer() })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ routerOptions: { caseSensitive: true } })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ requestIdHeader: 'request-id' })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ requestIdHeader: false })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({
  genReqId: (req) => {
    expect(req).type.toBe<RawRequestDefaultExpression>()
    return 'foo'
  }
})).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ trustProxy: true })).type.toBeAssignableTo<XufaInstance>()
// @ts-expect-error  No overload matches this call.
xufa({ trustProxy: 1 })
expect(xufa({ routerOptions: { querystringParser: () => ({ foo: 'bar' }) } })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ routerOptions: { querystringParser: () => ({ foo: { bar: 'fuzz' } }) } })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ routerOptions: { querystringParser: () => ({ foo: ['bar', 'fuzz'] }) } })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ routerOptions: { constraints: {} } })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({
  routerOptions: {
    constraints: {
      version: {
        name: 'version',
        storage: () => ({
          get: () => () => { },
          set: () => { },
          del: () => { },
          empty: () => { }
        }),
        validate () { },
        deriveConstraint: () => 'foo'
      },
      host: {
        name: 'host',
        storage: () => ({
          get: () => () => { },
          set: () => { },
          del: () => { },
          empty: () => { }
        }),
        validate () { },
        deriveConstraint: () => 'foo'
      },
      withObjectValue: {
        name: 'withObjectValue',
        storage: () => ({
          get: () => () => { },
          set: () => { },
          del: () => { },
          empty: () => { }
        }),
        validate () { },
        deriveConstraint: () => { }
      }
    }
  }
})).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ return503OnClosing: true })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ frameworkErrors: () => { } })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({
  rewriteUrl: function (req) {
    this.log.debug('rewrite url')
    return req.url === '/hi' ? '/hello' : req.url!
  }
})).type.toBeAssignableTo<XufaInstance>()
expect(xufa({
  schemaErrorFormatter: (errors, dataVar) => {
    console.log(
      errors[0].keyword.toLowerCase(),
      errors[0].message?.toLowerCase(),
      errors[0].params,
      errors[0].instancePath.toLowerCase(),
      errors[0].schemaPath.toLowerCase()
    )
    return new Error()
  }
})).type.toBeAssignableTo<XufaInstance>()
expect(xufa({
  clientErrorHandler: (err, socket) => {
    expect(err).type.toBe<ConnectionError>()
    expect(socket).type.toBe<Socket>()
  }
})).type.toBeAssignableTo<XufaInstance>()

expect(xufa({
  childLoggerFactory: function (
    this,
    logger,
    bindings,
    opts,
    req
  ) {
    expect(logger).type.toBe<XufaBaseLogger>()
    expect(bindings).type.toBe<Bindings>()
    expect(opts).type.toBe<ChildLoggerOptions>()
    expect(req).type.toBe<RawRequestDefaultExpression>()
    expect(this).type.toBeAssignableTo<XufaInstance>()
    return logger.child(bindings, opts)
  }
})).type.toBeAssignableTo<XufaInstance>()

// Thenable
expect(xufa({ return503OnClosing: true })).type.toBeAssignableTo<PromiseLike<XufaInstance>>()
xufa().then(fastifyInstance => expect(fastifyInstance).type.toBeAssignableTo<XufaInstance>())

expect<XufaPluginAsync>().type.toBeAssignableFrom(async () => { })
expect<XufaPluginCallback>().type.toBeAssignableFrom(() => { })

const ajvErrorObject: AjvErrorObject = {
  keyword: '',
  instancePath: '',
  schemaPath: '',
  params: {},
  message: ''
}
expect<AjvErrorObject>().type.not.toBeAssignableFrom({
  keyword: '',
  instancePath: '',
  schemaPath: '',
  params: '',
  message: ''
})

expect<XufaError['validation']>().type.toBeAssignableFrom([ajvErrorObject])
expect<XufaError['validationContext']>().type.toBeAssignableFrom('body')
expect<XufaError['validationContext']>().type.toBeAssignableFrom('headers')
expect<XufaError['validationContext']>().type.toBeAssignableFrom('params')
expect<XufaError['validationContext']>().type.toBeAssignableFrom('querystring')

expect<RouteGenericInterface['Body']>().type.toBe<unknown>()
expect<RouteGenericInterface['Headers']>().type.toBe<unknown>()
expect<RouteGenericInterface['Params']>().type.toBe<unknown>()
expect<RouteGenericInterface['Querystring']>().type.toBe<unknown>()
expect<RouteGenericInterface['Reply']>().type.toBe<unknown>()

// ErrorCodes
expect(xufa.errorCodes).type.toBe<XufaErrorCodes>()

xufa({ routerOptions: { allowUnsafeRegex: true } })
xufa({ routerOptions: { allowUnsafeRegex: false } })
expect(xufa).type.not.toBeCallableWith({ routerOptions: { allowUnsafeRegex: 'invalid' } })

expect(xufa({ allowErrorHandlerOverride: true })).type.toBeAssignableTo<XufaInstance>()
expect(xufa({ allowErrorHandlerOverride: false })).type.toBeAssignableTo<XufaInstance>()
