// Ported from fastify (test/types/hooks.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import * as http from 'node:http'
import { XufaError } from '@xufa/errors'
import { expectTypeOf } from '@xufa/test';
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
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
  expectTypeOf(done).toMatchTypeOf<(err?: XufaError) => void>();
  expectTypeOf(done).toMatchTypeOf<(err?: NodeJS.ErrnoException) => void>();
  expectTypeOf(done(new Error())).toEqualTypeOf<void>();
})

server.addHook('preParsing', function (request, reply, payload, done) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
  expectTypeOf(payload).toEqualTypeOf<RequestPayload>();
  expectTypeOf(done).toMatchTypeOf<(err?: XufaError) => void>();
  expectTypeOf(done).toMatchTypeOf<(err?: NodeJS.ErrnoException) => void>();
  expectTypeOf(done(new Error())).toEqualTypeOf<void>();
})

server.addHook('preValidation', function (request, reply, done) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
  expectTypeOf(done).toMatchTypeOf<(err?: XufaError) => void>();
  expectTypeOf(done).toMatchTypeOf<(err?: NodeJS.ErrnoException) => void>();
  expectTypeOf(done(new Error())).toEqualTypeOf<void>();
})

server.addHook('preHandler', function (request, reply, done) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
  expectTypeOf(done).toMatchTypeOf<(err?: XufaError) => void>();
  expectTypeOf(done).toMatchTypeOf<(err?: NodeJS.ErrnoException) => void>();
  expectTypeOf(done(new Error())).toEqualTypeOf<void>();
})

server.addHook<TestPayloadType>('preSerialization', function (request, reply, payload, done) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
  expectTypeOf(payload).toEqualTypeOf<TestPayloadType>(); // we expect this to be unknown when not specified like in the previous test
  expectTypeOf(done(new Error())).toEqualTypeOf<void>();
  expectTypeOf(done(null, 'foobar')).toEqualTypeOf<void>();
  expectTypeOf(done()).toEqualTypeOf<void>();
  // @ts-expect-error
  done(new Error(), 'foobar');
})

server.addHook<TestPayloadType>('onSend', function (request, reply, payload, done) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
  expectTypeOf(payload).toEqualTypeOf<TestPayloadType>();
  expectTypeOf(done(new Error())).toEqualTypeOf<void>();
  expectTypeOf(done(null, 'foobar')).toEqualTypeOf<void>();
  expectTypeOf(done()).toEqualTypeOf<void>();
  // @ts-expect-error
  done(new Error(), 'foobar');
})

server.addHook('onResponse', function (request, reply, done) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
  expectTypeOf(done).toMatchTypeOf<(err?: XufaError) => void>();
  expectTypeOf(done).toMatchTypeOf<(err?: NodeJS.ErrnoException) => void>();
  expectTypeOf(done(new Error())).toEqualTypeOf<void>();
})

server.addHook('onTimeout', function (request, reply, done) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
  expectTypeOf(done).toMatchTypeOf<(err?: XufaError) => void>();
  expectTypeOf(done).toMatchTypeOf<(err?: NodeJS.ErrnoException) => void>();
  expectTypeOf(done(new Error())).toEqualTypeOf<void>();
})

server.addHook('onError', function (request, reply, error, done) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
  expectTypeOf(error).toEqualTypeOf<XufaError>();
  expectTypeOf(done).toEqualTypeOf<() => void>();
  expectTypeOf(done()).toEqualTypeOf<void>();
})

server.addHook('onRequestAbort', function (request, done) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(done).toMatchTypeOf<(err?: XufaError) => void>();
  expectTypeOf(done).toMatchTypeOf<(err?: NodeJS.ErrnoException) => void>();
  expectTypeOf(done(new Error())).toEqualTypeOf<void>();
})

server.addHook('onRoute', function (opts) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(opts).toEqualTypeOf<RouteOptions & { routePath: string; path: string; prefix: string }>();
})

server.addHook('onRegister', function (instance, opts) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(instance).toEqualTypeOf<XufaInstance>();
  expectTypeOf(opts).toEqualTypeOf<RegisterOptions & XufaPluginOptions>();
})

server.addHook('onReady', function (done) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(done).toMatchTypeOf<(err?: XufaError) => void>();
  expectTypeOf(done).toMatchTypeOf<(err?: NodeJS.ErrnoException) => void>();
  expectTypeOf(done(new Error())).toEqualTypeOf<void>();
})

server.addHook('onListen', function (done) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(done).toMatchTypeOf<(err?: XufaError) => void>();
  expectTypeOf(done).toMatchTypeOf<(err?: NodeJS.ErrnoException) => void>();
})

server.addHook('onClose', function (instance, done) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(instance).toEqualTypeOf<XufaInstance>();
  expectTypeOf(done).toMatchTypeOf<(err?: XufaError) => void>();
  expectTypeOf(done).toMatchTypeOf<(err?: NodeJS.ErrnoException) => void>();
  expectTypeOf(done(new Error())).toEqualTypeOf<void>();
})

// Asynchronous

server.addHook('onRequest', async function (request, reply) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
})

server.addHook('preParsing', async function (request, reply, payload) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
  expectTypeOf(payload).toEqualTypeOf<RequestPayload>();
})

server.addHook('preValidation', async function (request, reply) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
})

server.addHook('preHandler', async function (request, reply) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
})

server.addHook<TestPayloadType>('preSerialization', async function (request, reply, payload) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
  expectTypeOf(payload).toEqualTypeOf<TestPayloadType>(); // we expect this to be unknown when not specified like in the previous test
})

server.addHook<TestPayloadType>('onSend', async function (request, reply, payload) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
  expectTypeOf(payload).toEqualTypeOf<TestPayloadType>();
})

server.addHook('onResponse', async function (request, reply) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
})

server.addHook('onTimeout', async function (request, reply) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
})

server.addHook('onError', async function (request, reply, error) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
  expectTypeOf(error).toEqualTypeOf<XufaError>();
})

server.addHook('onRequestAbort', async function (request) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
})

server.addHook('onRegister', async (instance, opts) => {
  expectTypeOf(instance).toEqualTypeOf<XufaInstance>();
  expectTypeOf(opts).toEqualTypeOf<RegisterOptions & XufaPluginOptions>();
})

server.addHook('onReady', async function () {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
})

server.addHook('onListen', async function () {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
})

server.addHook('onClose', async function (instance) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(instance).toEqualTypeOf<XufaInstance>();
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
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
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
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  preParsing: (request, reply, payload, done) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  preValidation: (request, reply, done) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  preHandler: (request, reply, done) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  preSerialization: (request, reply, payload, done) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  onSend: (request, reply, payload, done) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  onResponse: (request, reply, done) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  onTimeout: (request, reply, done) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  onError: (request, reply, error, done) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  }
})

server.get<RouteGenericInterface, CustomContextConfig>('/', {
  onRequest: async (request, reply) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  preParsing: async (request, reply) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  preValidation: async (request, reply) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  preHandler: async (request, reply) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  preSerialization: async (request, reply) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  onSend: async (request, reply) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  onResponse: async (request, reply) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  onTimeout: async (request, reply) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  onError: async (request, reply) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  }
}, async (request, reply) => {
  expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
})

type CustomContextRequest = XufaRequest<any, any, any, any, any, CustomContextConfig, any>
type CustomContextReply = XufaReply<any, any, any, any, CustomContextConfig, any, any>
server.route<RouteGenericInterface, CustomContextConfig>({
  method: 'GET',
  url: '/',
  handler: () => { },
  onRequest: async (request: CustomContextRequest, reply: CustomContextReply) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  preParsing: async (request: CustomContextRequest, reply: CustomContextReply, payload: RequestPayload) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  preValidation: async (request: CustomContextRequest, reply: CustomContextReply) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  preHandler: async (request: CustomContextRequest, reply: CustomContextReply) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  preSerialization: async (request: CustomContextRequest, reply: CustomContextReply, payload: any) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  onSend: async (request: CustomContextRequest, reply: CustomContextReply, payload: any) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  onResponse: async (request: CustomContextRequest, reply: CustomContextReply) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  onTimeout: async (request: CustomContextRequest, reply: CustomContextReply) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
  },
  onError: async (request: CustomContextRequest, reply: CustomContextReply, error: XufaError) => {
    expectTypeOf(request.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
    expectTypeOf(reply.routeOptions.config).toEqualTypeOf<CustomContextConfigWithDefault>();
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
    expectTypeOf(request).toEqualTypeOf<XufaRequest>();
    expectTypeOf(reply).toEqualTypeOf<XufaReply>();
  },
  onRequest: (request, reply, done) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
    expectTypeOf(done).toEqualTypeOf<HookHandlerDoneFunction>();
  },
  onRequestAbort: (request, done) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(done).toEqualTypeOf<HookHandlerDoneFunction>();
  },
  preParsing: (request, reply, payload, done) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
    expectTypeOf(payload).toEqualTypeOf<RequestPayload>();
    expectTypeOf(done).toEqualTypeOf<<TError extends Error = XufaError>(
        err?: TError | null | undefined,
        res?: RequestPayload | undefined
      ) => void>();
  },
  preValidation: (request, reply, done) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
    expectTypeOf(done).toEqualTypeOf<HookHandlerDoneFunction>();
  },
  preHandler: (request, reply, done) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
    expectTypeOf(done).toEqualTypeOf<HookHandlerDoneFunction>();
  },
  preSerialization: (request, reply, payload, done) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
    expectTypeOf(payload).toEqualTypeOf<unknown>();
    expectTypeOf(done).toEqualTypeOf<DoneFuncWithErrOrRes>();
  },
  onSend: (request, reply, payload, done) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
    expectTypeOf(payload).toEqualTypeOf<unknown>();
    expectTypeOf(done).toEqualTypeOf<DoneFuncWithErrOrRes>();
  },
  onResponse: (request, reply, done) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
    expectTypeOf(done).toEqualTypeOf<HookHandlerDoneFunction>();
  },
  onTimeout: (request, reply, done) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
    expectTypeOf(done).toEqualTypeOf<HookHandlerDoneFunction>();
  },
  onError: (request, reply, error, done) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
    expectTypeOf(error).toEqualTypeOf<XufaError>();
    expectTypeOf(done).toEqualTypeOf<() => void>();
  }
})

server.get('/', {
  onRequest: async (request, reply) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
  },
  onRequestAbort: async (request, done) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(done).toEqualTypeOf<HookHandlerDoneFunction>();
  },
  preParsing: async (request, reply, payload) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
    expectTypeOf(payload).toEqualTypeOf<RequestPayload>();
  },
  preValidation: async (request, reply) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
  },
  preHandler: async (request, reply) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
  },
  preSerialization: async (request, reply, payload) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
    expectTypeOf(payload).toEqualTypeOf<unknown>();
  },
  onSend: async (request, reply, payload) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
    expectTypeOf(payload).toEqualTypeOf<unknown>();
  },
  onResponse: async (request, reply) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
  },
  onTimeout: async (request, reply) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
  },
  onError: async (request, reply, error) => {
    expectTypeOf(request).toEqualTypeOf<NoInferRequest>();
    expectTypeOf(reply).toEqualTypeOf<NoInferReply>();
    expectTypeOf(error).toEqualTypeOf<XufaError>();
  }
}, async (request, reply) => {
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(reply).toEqualTypeOf<XufaReply>();
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
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(done).toMatchTypeOf<(err?: XufaError) => void>();
  expectTypeOf(done).toMatchTypeOf<(err?: NodeJS.ErrnoException) => void>();
  expectTypeOf(done(new Error())).toEqualTypeOf<void>();
})

const preCloseHandler: preCloseHookHandler = function (done) {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  expectTypeOf(done).toEqualTypeOf<HookHandlerDoneFunction>();
}
server.addHook('preClose', preCloseHandler)

server.addHook('preClose', async function () {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
})

const preCloseAsyncHandler: preCloseAsyncHookHandler = async function () {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
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
