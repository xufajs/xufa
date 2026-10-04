// Ported from fastify (test/types/hooks.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import * as http from 'node:http'
import { XufaError } from '@xufa/errors'
import { expect } from 'tstyche'
import xufa, {
  ContextConfigDefault, XufaContextConfig,
  XufaInstance,
  XufaPluginOptions,
  XufaReply,
  XufaRequest,
  XufaSchema,
  XufaTypeProviderDefault,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RegisterOptions,
  RouteOptions,
  preCloseAsyncHookHandler,
  preCloseHookHandler
} from '../..'
import { DoneFuncWithErrOrRes, HookHandlerDoneFunction, RequestPayload, preHandlerAsyncHookHandler } from '../../types/hooks.js'
import { XufaRouteConfig, RouteGenericInterface } from '../../types/route.js'

const server = xufa()

// Test payload generic pass through for preSerialization and onSend

type TestPayloadType = {
  foo: string;
  bar: number;
}

// Synchronous Tests

server.addHook('onRequest', function (request, reply, done) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
  expect(done).type.toBeAssignableTo<(err?: XufaError) => void>()
  expect(done).type.toBeAssignableTo<(err?: NodeJS.ErrnoException) => void>()
  expect(done(new Error())).type.toBe<void>()
})

server.addHook('preParsing', function (request, reply, payload, done) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
  expect(payload).type.toBe<RequestPayload>()
  expect(done).type.toBeAssignableTo<(err?: XufaError) => void>()
  expect(done).type.toBeAssignableTo<(err?: NodeJS.ErrnoException) => void>()
  expect(done(new Error())).type.toBe<void>()
})

server.addHook('preValidation', function (request, reply, done) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
  expect(done).type.toBeAssignableTo<(err?: XufaError) => void>()
  expect(done).type.toBeAssignableTo<(err?: NodeJS.ErrnoException) => void>()
  expect(done(new Error())).type.toBe<void>()
})

server.addHook('preHandler', function (request, reply, done) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
  expect(done).type.toBeAssignableTo<(err?: XufaError) => void>()
  expect(done).type.toBeAssignableTo<(err?: NodeJS.ErrnoException) => void>()
  expect(done(new Error())).type.toBe<void>()
})

server.addHook<TestPayloadType>('preSerialization', function (request, reply, payload, done) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
  expect(payload).type.toBe<TestPayloadType>() // we expect this to be unknown when not specified like in the previous test
  expect(done(new Error())).type.toBe<void>()
  expect(done(null, 'foobar')).type.toBe<void>()
  expect(done()).type.toBe<void>()
  expect(done).type.not.toBeCallableWith(new Error(), 'foobar')
})

server.addHook<TestPayloadType>('onSend', function (request, reply, payload, done) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
  expect(payload).type.toBe<TestPayloadType>()
  expect(done(new Error())).type.toBe<void>()
  expect(done(null, 'foobar')).type.toBe<void>()
  expect(done()).type.toBe<void>()
  expect(done).type.not.toBeCallableWith(new Error(), 'foobar')
})

server.addHook('onResponse', function (request, reply, done) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
  expect(done).type.toBeAssignableTo<(err?: XufaError) => void>()
  expect(done).type.toBeAssignableTo<(err?: NodeJS.ErrnoException) => void>()
  expect(done(new Error())).type.toBe<void>()
})

server.addHook('onTimeout', function (request, reply, done) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
  expect(done).type.toBeAssignableTo<(err?: XufaError) => void>()
  expect(done).type.toBeAssignableTo<(err?: NodeJS.ErrnoException) => void>()
  expect(done(new Error())).type.toBe<void>()
})

server.addHook('onError', function (request, reply, error, done) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
  expect(error).type.toBe<XufaError>()
  expect(done).type.toBe<() => void>()
  expect(done()).type.toBe<void>()
})

server.addHook('onRequestAbort', function (request, done) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(done).type.toBeAssignableTo<(err?: XufaError) => void>()
  expect(done).type.toBeAssignableTo<(err?: NodeJS.ErrnoException) => void>()
  expect(done(new Error())).type.toBe<void>()
})

server.addHook('onRoute', function (opts) {
  expect(this).type.toBe<XufaInstance>()
  expect(opts).type.toBe<RouteOptions & { routePath: string; path: string; prefix: string }>()
})

server.addHook('onRegister', function (instance, opts) {
  expect(this).type.toBe<XufaInstance>()
  expect(instance).type.toBe<XufaInstance>()
  expect(opts).type.toBe<RegisterOptions & XufaPluginOptions>()
})

server.addHook('onReady', function (done) {
  expect(this).type.toBe<XufaInstance>()
  expect(done).type.toBeAssignableTo<(err?: XufaError) => void>()
  expect(done).type.toBeAssignableTo<(err?: NodeJS.ErrnoException) => void>()
  expect(done(new Error())).type.toBe<void>()
})

server.addHook('onListen', function (done) {
  expect(this).type.toBe<XufaInstance>()
  expect(done).type.toBeAssignableTo<(err?: XufaError) => void>()
  expect(done).type.toBeAssignableTo<(err?: NodeJS.ErrnoException) => void>()
})

server.addHook('onClose', function (instance, done) {
  expect(this).type.toBe<XufaInstance>()
  expect(instance).type.toBe<XufaInstance>()
  expect(done).type.toBeAssignableTo<(err?: XufaError) => void>()
  expect(done).type.toBeAssignableTo<(err?: NodeJS.ErrnoException) => void>()
  expect(done(new Error())).type.toBe<void>()
})

// Asynchronous

server.addHook('onRequest', async function (request, reply) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
})

server.addHook('preParsing', async function (request, reply, payload) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
  expect(payload).type.toBe<RequestPayload>()
})

server.addHook('preValidation', async function (request, reply) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
})

server.addHook('preHandler', async function (request, reply) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
})

server.addHook<TestPayloadType>('preSerialization', async function (request, reply, payload) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
  expect(payload).type.toBe<TestPayloadType>() // we expect this to be unknown when not specified like in the previous test
})

server.addHook<TestPayloadType>('onSend', async function (request, reply, payload) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
  expect(payload).type.toBe<TestPayloadType>()
})

server.addHook('onResponse', async function (request, reply) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
})

server.addHook('onTimeout', async function (request, reply) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
})

server.addHook('onError', async function (request, reply, error) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
  expect(error).type.toBe<XufaError>()
})

server.addHook('onRequestAbort', async function (request) {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
})

server.addHook('onRegister', async (instance, opts) => {
  expect(instance).type.toBe<XufaInstance>()
  expect(opts).type.toBe<RegisterOptions & XufaPluginOptions>()
})

server.addHook('onReady', async function () {
  expect(this).type.toBe<XufaInstance>()
})

server.addHook('onListen', async function () {
  expect(this).type.toBe<XufaInstance>()
})

server.addHook('onClose', async function (instance) {
  expect(this).type.toBe<XufaInstance>()
  expect(instance).type.toBe<XufaInstance>()
})

// Use case to monitor any regression on issue #3620
// ref.: https://github.com/fastify/fastify/issues/3620
const customTypedHook: preHandlerAsyncHookHandler<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  RouteGenericInterface,
  ContextConfigDefault,
  XufaSchema,
  XufaTypeProviderDefault
> = async function (request, reply): Promise<void> {
  expect(this).type.toBe<XufaInstance>()
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
}

server.register(async (instance) => {
  instance.addHook('preHandler', customTypedHook)
})

// Test custom Context Config types for hooks
type CustomContextConfig = XufaContextConfig & {
  foo: string;
  bar: number;
}
type CustomContextConfigWithDefault = CustomContextConfig & XufaRouteConfig

server.route<RouteGenericInterface, CustomContextConfig>({
  method: 'GET',
  url: '/',
  handler: () => { },
  onRequest: (request, reply, done) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  preParsing: (request, reply, payload, done) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  preValidation: (request, reply, done) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  preHandler: (request, reply, done) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  preSerialization: (request, reply, payload, done) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  onSend: (request, reply, payload, done) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  onResponse: (request, reply, done) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  onTimeout: (request, reply, done) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  onError: (request, reply, error, done) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  }
})

server.get<RouteGenericInterface, CustomContextConfig>('/', {
  onRequest: async (request, reply) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  preParsing: async (request, reply) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  preValidation: async (request, reply) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  preHandler: async (request, reply) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  preSerialization: async (request, reply) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  onSend: async (request, reply) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  onResponse: async (request, reply) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  onTimeout: async (request, reply) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  onError: async (request, reply) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  }
}, async (request, reply) => {
  expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
})

type CustomContextRequest = XufaRequest<any, any, any, any, any, CustomContextConfig, any>
type CustomContextReply = XufaReply<any, any, any, any, CustomContextConfig, any, any>
server.route<RouteGenericInterface, CustomContextConfig>({
  method: 'GET',
  url: '/',
  handler: () => { },
  onRequest: async (request: CustomContextRequest, reply: CustomContextReply) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  preParsing: async (request: CustomContextRequest, reply: CustomContextReply, payload: RequestPayload) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  preValidation: async (request: CustomContextRequest, reply: CustomContextReply) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  preHandler: async (request: CustomContextRequest, reply: CustomContextReply) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  preSerialization: async (request: CustomContextRequest, reply: CustomContextReply, payload: any) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  onSend: async (request: CustomContextRequest, reply: CustomContextReply, payload: any) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  onResponse: async (request: CustomContextRequest, reply: CustomContextReply) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  onTimeout: async (request: CustomContextRequest, reply: CustomContextReply) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  },
  onError: async (request: CustomContextRequest, reply: CustomContextReply, error: XufaError) => {
    expect(request.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
    expect(reply.routeOptions.config).type.toBe<CustomContextConfigWithDefault>()
  }
})

type NoInferRequest = XufaRequest<RouteGenericInterface, http.Server, http.IncomingMessage, NoInfer<XufaSchema>>
type NoInferReply = XufaReply<
  RouteGenericInterface, http.Server, http.IncomingMessage, http.ServerResponse, unknown, NoInfer<XufaSchema>
>
server.route({
  method: 'GET',
  url: '/',
  handler: (request, reply) => {
    expect(request).type.toBe<XufaRequest>()
    expect(reply).type.toBe<XufaReply>()
  },
  onRequest: (request, reply, done) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
    expect(done).type.toBe<HookHandlerDoneFunction>()
  },
  onRequestAbort: (request, done) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(done).type.toBe<HookHandlerDoneFunction>()
  },
  preParsing: (request, reply, payload, done) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
    expect(payload).type.toBe<RequestPayload>()
    expect(done).type.toBe<
      <TError extends Error = XufaError>(
        err?: TError | null | undefined,
        res?: RequestPayload | undefined
      ) => void
        >()
  },
  preValidation: (request, reply, done) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
    expect(done).type.toBe<HookHandlerDoneFunction>()
  },
  preHandler: (request, reply, done) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
    expect(done).type.toBe<HookHandlerDoneFunction>()
  },
  preSerialization: (request, reply, payload, done) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
    expect(payload).type.toBe<unknown>()
    expect(done).type.toBe<DoneFuncWithErrOrRes>()
  },
  onSend: (request, reply, payload, done) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
    expect(payload).type.toBe<unknown>()
    expect(done).type.toBe<DoneFuncWithErrOrRes>()
  },
  onResponse: (request, reply, done) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
    expect(done).type.toBe<HookHandlerDoneFunction>()
  },
  onTimeout: (request, reply, done) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
    expect(done).type.toBe<HookHandlerDoneFunction>()
  },
  onError: (request, reply, error, done) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
    expect(error).type.toBe<XufaError>()
    expect(done).type.toBe<() => void>()
  }
})

server.get('/', {
  onRequest: async (request, reply) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
  },
  onRequestAbort: async (request, done) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(done).type.toBe<HookHandlerDoneFunction>()
  },
  preParsing: async (request, reply, payload) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
    expect(payload).type.toBe<RequestPayload>()
  },
  preValidation: async (request, reply) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
  },
  preHandler: async (request, reply) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
  },
  preSerialization: async (request, reply, payload) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
    expect(payload).type.toBe<unknown>()
  },
  onSend: async (request, reply, payload) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
    expect(payload).type.toBe<unknown>()
  },
  onResponse: async (request, reply) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
  },
  onTimeout: async (request, reply) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
  },
  onError: async (request, reply, error) => {
    expect(request).type.toBe<NoInferRequest>()
    expect(reply).type.toBe<NoInferReply>()
    expect(error).type.toBe<XufaError>()
  }
}, async (request, reply) => {
  expect(request).type.toBe<XufaRequest>()
  expect(reply).type.toBe<XufaReply>()
})

// TODO: Should throw errors
// server.get('/', { onRequest: async (request, reply, done) => {} }, async (request, reply) => {})
// server.get('/', { onRequestAbort: async (request, done) => {} }, async (request, reply) => {})
// server.get('/', { preParsing: async (request, reply, payload, done) => {} }, async (request, reply) => {})
// server.get('/', { preValidation: async (request, reply, done) => {} }, async (request, reply) => {})
// server.get('/', { preHandler: async (request, reply, done) => {} }, async (request, reply) => {})
// server.get('/', { preSerialization: async (request, reply, payload, done) => {} }, async (request, reply) => {})
// server.get('/', { onSend: async (request, reply, payload, done) => {} }, async (request, reply) => {})
// server.get('/', { onResponse: async (request, reply, done) => {} }, async (request, reply) => {})
// server.get('/', { onTimeout: async (request, reply, done) => {} }, async (request, reply) => {})
// server.get('/', { onError: async (request, reply, error, done) => {} }, async (request, reply) => {})

server.addHook('preClose', function (done) {
  expect(this).type.toBe<XufaInstance>()
  expect(done).type.toBeAssignableTo<(err?: XufaError) => void>()
  expect(done).type.toBeAssignableTo<(err?: NodeJS.ErrnoException) => void>()
  expect(done(new Error())).type.toBe<void>()
})

const preCloseHandler: preCloseHookHandler = function (done) {
  expect(this).type.toBe<XufaInstance>()
  expect(done).type.toBe<HookHandlerDoneFunction>()
}
server.addHook('preClose', preCloseHandler)

server.addHook('preClose', async function () {
  expect(this).type.toBe<XufaInstance>()
})

const preCloseAsyncHandler: preCloseAsyncHookHandler = async function () {
  expect(this).type.toBe<XufaInstance>()
}
server.addHook('preClose', preCloseAsyncHandler)

// @ts-expect-error  No overload matches this call.
server.addHook('onClose', async function (instance, done) {})
// @ts-expect-error  No overload matches this call.
server.addHook('onError', async function (request, reply, error, done) {})
// @ts-expect-error  No overload matches this call.
server.addHook('onReady', async function (done) {})
// @ts-expect-error  No overload matches this call.
server.addHook('onListen', async function (done) {})
// @ts-expect-error  No overload matches this call.
server.addHook('onRequest', async function (request, reply, done) {})
// @ts-expect-error  No overload matches this call.
server.addHook('onRequestAbort', async function (request, done) {})
// @ts-expect-error  No overload matches this call.
server.addHook('onResponse', async function (request, reply, done) {})
// @ts-expect-error  No overload matches this call.
server.addHook('onSend', async function (request, reply, payload, done) {})
// @ts-expect-error  No overload matches this call.
server.addHook('onTimeout', async function (request, reply, done) {})
// @ts-expect-error  No overload matches this call.
server.addHook('preClose', async function (done) {})
// @ts-expect-error  No overload matches this call.
server.addHook('preHandler', async function (request, reply, done) {})
// @ts-expect-error  No overload matches this call.
server.addHook('preSerialization', async function (request, reply, payload, done) {})
// @ts-expect-error  No overload matches this call.
server.addHook('preValidation', async function (request, reply, done) {})
