// Ported from fastify (test/types/fastify.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import Ajv, { ErrorObject as AjvErrorObject } from 'ajv'
import * as http from 'node:http'
import * as http2 from 'node:http2'
import * as https from 'node:https'
import { Socket } from 'node:net'
import pino from '@xufa/logger'
import { assertType, expectTypeOf } from '@xufa/test';
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
expectTypeOf(xufa()).not.toMatchTypeOf<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse> &
  Promise<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse>>>();
expectTypeOf(xufa()).toMatchTypeOf<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse> &
  PromiseLike<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse>>>();
expectTypeOf(xufa()).toEqualTypeOf<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse>>>();
expectTypeOf(xufa({})).toEqualTypeOf<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse>>>();
expectTypeOf(xufa({ http: {} })).toEqualTypeOf<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse>>>();
// https server
expectTypeOf(xufa({ https: {} })).toEqualTypeOf<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse>>>();
expectTypeOf(xufa({ https: null })).toEqualTypeOf<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse>>>();
// http2 server
expectTypeOf(xufa({ http2: true, http2SessionTimeout: 1000 })).toEqualTypeOf<XufaInstance<http2.Http2Server, http2.Http2ServerRequest, http2.Http2ServerResponse> &
  SafePromiseLike<XufaInstance<http2.Http2Server, http2.Http2ServerRequest, http2.Http2ServerResponse>>>();
expectTypeOf(xufa({ http2: true, https: {}, http2SessionTimeout: 1000 })).toEqualTypeOf<XufaInstance<http2.Http2SecureServer, http2.Http2ServerRequest, http2.Http2ServerResponse> &
  SafePromiseLike<XufaInstance<http2.Http2SecureServer, http2.Http2ServerRequest, http2.Http2ServerResponse>>>();
expectTypeOf(xufa({ http2: true, https: {} }).inject()).toEqualTypeOf<LightMyRequestChain>();
expectTypeOf(xufa({ schemaController: {} })).toEqualTypeOf<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse>>>();

expectTypeOf(xufa({ http2: false })).toEqualTypeOf<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse>>>();

expectTypeOf(xufa({ https: {}, http2: false })).toEqualTypeOf<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<https.Server, http.IncomingMessage, http.ServerResponse>>>();

expectTypeOf(xufa({
    schemaController: {
      compilersFactory: {}
    }
  })).toEqualTypeOf<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse> &
  SafePromiseLike<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse>>>();

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
assertType<InjectOptions>({ query: '' });
xufa({ http2: true, https: {} }).inject().then((resp) => {
  expectTypeOf(resp).toEqualTypeOf<LightMyRequestResponse>();
})
const lightMyRequestCallback: LightMyRequestCallback = (
  err: Error | undefined,
  response: LightMyRequestResponse | undefined
) => {
  if (err) throw err
}
xufa({ http2: true, https: {} }).inject({}, lightMyRequestCallback)

// server options
expectTypeOf(xufa({ http2: true })).toMatchTypeOf<XufaInstance<http2.Http2Server, http2.Http2ServerRequest, http2.Http2ServerResponse>>();
expectTypeOf(xufa({ ignoreTrailingSlash: true })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ ignoreDuplicateSlashes: true })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ connectionTimeout: 1000 })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ forceCloseConnections: true })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ keepAliveTimeout: 1000 })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ pluginTimeout: 1000 })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ bodyLimit: 100 })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ handlerTimeout: 5000 })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ maxParamLength: 100 })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ onProtoPoisoning: 'error' })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ onConstructorPoisoning: 'error' })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ serializerOpts: { rounding: 'ceil' } })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ serializerOpts: { ajv: { missingRefs: 'ignore' } } })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ serializerOpts: { schema: {} } })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ serializerOpts: { otherProp: {} } })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ logger: true })).toMatchTypeOf<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse, XufaBaseLogger>>();
expectTypeOf(xufa({ logger: true })).toMatchTypeOf<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse, XufaBaseLogger>>();
expectTypeOf(xufa({
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
})).toMatchTypeOf<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse, XufaBaseLogger>>();
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

expectTypeOf(pinoLoggerServer).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ logger: customLogger })).toMatchTypeOf<XufaInstance<http.Server, http.IncomingMessage, http.ServerResponse, XufaBaseLogger>>();
expectTypeOf(xufa({ serverFactory: () => http.createServer() })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ routerOptions: { caseSensitive: true } })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ requestIdHeader: 'request-id' })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ requestIdHeader: false })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({
  genReqId: (req) => {
    expectTypeOf(req).toEqualTypeOf<RawRequestDefaultExpression>();
    return 'foo'
  }
})).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ trustProxy: true })).toMatchTypeOf<XufaInstance>();
// @ts-expect-error  No overload matches this call.
xufa({ trustProxy: 1 })
expectTypeOf(xufa({ routerOptions: { querystringParser: () => ({ foo: 'bar' }) } })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ routerOptions: { querystringParser: () => ({ foo: { bar: 'fuzz' } }) } })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ routerOptions: { querystringParser: () => ({ foo: ['bar', 'fuzz'] }) } })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ routerOptions: { constraints: {} } })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({
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
})).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ return503OnClosing: true })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ fastHead: false })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ validation: { foldMessages: true } })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ ajv: { validatorOptions: { foldMessages: true } } })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ frameworkErrors: () => { } })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({
  rewriteUrl: function (req) {
    this.log.debug('rewrite url')
    return req.url === '/hi' ? '/hello' : req.url!
  }
})).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({
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
})).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({
  clientErrorHandler: (err, socket) => {
    expectTypeOf(err).toEqualTypeOf<ConnectionError>();
    expectTypeOf(socket).toEqualTypeOf<Socket>();
  }
})).toMatchTypeOf<XufaInstance>();

expectTypeOf(xufa({
  childLoggerFactory: function (
    this,
    logger,
    bindings,
    opts,
    req
  ) {
    expectTypeOf(logger).toEqualTypeOf<XufaBaseLogger>();
    expectTypeOf(bindings).toEqualTypeOf<Bindings>();
    expectTypeOf(opts).toEqualTypeOf<ChildLoggerOptions>();
    expectTypeOf(req).toEqualTypeOf<RawRequestDefaultExpression>();
    expectTypeOf(this).toMatchTypeOf<XufaInstance>();
    return logger.child(bindings, opts)
  }
})).toMatchTypeOf<XufaInstance>();

// Thenable
expectTypeOf(xufa({ return503OnClosing: true })).toMatchTypeOf<PromiseLike<XufaInstance>>();
xufa().then(fastifyInstance => expectTypeOf(fastifyInstance).toMatchTypeOf<XufaInstance>())

assertType<XufaPluginAsync>(async () => { });
assertType<XufaPluginCallback>(() => { });

const ajvErrorObject: AjvErrorObject = {
  keyword: '',
  instancePath: '',
  schemaPath: '',
  params: {},
  message: ''
}
assertType<AjvErrorObject>({
  keyword: '',
  instancePath: '',
  schemaPath: '',
  // @ts-expect-error
  params: '',
  message: ''
});

assertType<XufaError['validation']>([ajvErrorObject]);
assertType<XufaError['validationContext']>('body');
assertType<XufaError['validationContext']>('headers');
assertType<XufaError['validationContext']>('params');
assertType<XufaError['validationContext']>('querystring');

expectTypeOf<RouteGenericInterface['Body']>().toEqualTypeOf<unknown>();
expectTypeOf<RouteGenericInterface['Headers']>().toEqualTypeOf<unknown>();
expectTypeOf<RouteGenericInterface['Params']>().toEqualTypeOf<unknown>();
expectTypeOf<RouteGenericInterface['Querystring']>().toEqualTypeOf<unknown>();
expectTypeOf<RouteGenericInterface['Reply']>().toEqualTypeOf<unknown>();

// ErrorCodes
expectTypeOf(xufa.errorCodes).toEqualTypeOf<XufaErrorCodes>();

xufa({ routerOptions: { allowUnsafeRegex: true } })
xufa({ routerOptions: { allowUnsafeRegex: false } })
// @ts-expect-error
xufa({ routerOptions: { allowUnsafeRegex: 'invalid' } });

expectTypeOf(xufa({ allowErrorHandlerOverride: true })).toMatchTypeOf<XufaInstance>();
expectTypeOf(xufa({ allowErrorHandlerOverride: false })).toMatchTypeOf<XufaInstance>();
