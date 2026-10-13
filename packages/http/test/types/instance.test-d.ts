// Ported from fastify (test/types/instance.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { AddressInfo } from 'node:net'
import { ConstraintStrategy, Config as FindMyWayConfig } from '@xufa/router'
import { expectTypeOf } from '@xufa/test';
import xufa, {
  XufaBaseLogger,
  XufaBodyParser,
  XufaError,
  XufaInstance,
  XufaListenOptions,
  XufaRouterOptions,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RouteGenericInterface
} from '../..'
import { HookHandlerDoneFunction } from '../../types/hooks.js'
import { FindMyWayVersion } from '../../types/instance.js'
import { Bindings, ChildLoggerOptions } from '../../types/logger.js'
import { XufaReply } from '../../types/reply.js'
import { XufaRequest } from '../../types/request.js'
import { XufaSchemaCompiler, XufaSchemaControllerOptions, XufaSerializerCompiler } from '../../types/schema.js'

const server = xufa()

expectTypeOf(server.addSchema({ type: 'null' })).toEqualTypeOf<XufaInstance>();
expectTypeOf(server.addSchema({ schemaId: 'id' })).toEqualTypeOf<XufaInstance>();
expectTypeOf(server.addSchema({ schemas: [] })).toEqualTypeOf<XufaInstance>();

expectTypeOf(server.pluginName).toEqualTypeOf<string>();

expectTypeOf(server.getSchemas()).toEqualTypeOf<Record<string, unknown>>();
expectTypeOf(server.addresses()).toEqualTypeOf<AddressInfo[]>();
expectTypeOf(server.getSchema('SchemaId')).toEqualTypeOf<unknown>();
expectTypeOf(server.printRoutes()).toEqualTypeOf<string>();
expectTypeOf(server.printPlugins()).toEqualTypeOf<string>();
expectTypeOf(server.listeningOrigin).toEqualTypeOf<string>();
expectTypeOf(server.supportedMethods).toEqualTypeOf<string[]>();

expectTypeOf(server.setErrorHandler(function (error, request, reply) {
    expectTypeOf(error).toEqualTypeOf<unknown>();
    expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  })).toEqualTypeOf<XufaInstance>();

expectTypeOf(server.setErrorHandler<XufaError>(function (error, request, reply) {
    expectTypeOf(error).toEqualTypeOf<XufaError>();
  })).toEqualTypeOf<XufaInstance>();

expectTypeOf(server.setGenReqId(function (req) {
    expectTypeOf(req).toEqualTypeOf<RawRequestDefaultExpression>();
    return 'foo'
  })).toEqualTypeOf<XufaInstance>();

function fastifySetGenReqId (req: RawRequestDefaultExpression) {
  return 'foo'
}
server.setGenReqId(fastifySetGenReqId)

function fastifyErrorHandler (this: XufaInstance, error: XufaError) { }
server.setErrorHandler(fastifyErrorHandler)

async function asyncXufaErrorHandler (this: XufaInstance, error: XufaError) { }
server.setErrorHandler(asyncXufaErrorHandler)

function nodeJSErrorHandler (error: NodeJS.ErrnoException) {
  if (error) { throw error }
}
server.setErrorHandler(nodeJSErrorHandler)

function asyncNodeJSErrorHandler (error: NodeJS.ErrnoException) {
  if (error) { throw error }
}
server.setErrorHandler(asyncNodeJSErrorHandler)

class CustomError extends Error {
  private __brand: any
}
interface ReplyPayload {
  Reply: {
    test: boolean;
  };
}
// typed sync error handler
server.setErrorHandler<CustomError, ReplyPayload>((error, request, reply) => {
  expectTypeOf(error).toEqualTypeOf<CustomError>();
  expectTypeOf(reply.send).toEqualTypeOf<((...args: [payload: ReplyPayload['Reply']]) => XufaReply<ReplyPayload, RawServerDefault, RawRequestDefaultExpression<RawServerDefault>, RawReplyDefaultExpression<RawServerDefault>>)>();
})
// typed async error handler send
server.setErrorHandler<CustomError, ReplyPayload>(async (error, request, reply) => {
  expectTypeOf(error).toEqualTypeOf<CustomError>();
  expectTypeOf(reply.send).toEqualTypeOf<((...args: [payload: ReplyPayload['Reply']]) => XufaReply<ReplyPayload, RawServerDefault, RawRequestDefaultExpression<RawServerDefault>, RawReplyDefaultExpression<RawServerDefault>>)>();
})
// typed async error handler return
server.setErrorHandler<CustomError, ReplyPayload>(async (error, request, reply) => {
  expectTypeOf(error).toEqualTypeOf<CustomError>();
  return { test: true }
})
// typed sync error handler send error
server.setErrorHandler<CustomError, ReplyPayload>((error, request, reply) => {
  expectTypeOf(error).toEqualTypeOf<CustomError>();
  // @ts-expect-error  Type 'string' is not assignable to type 'boolean'.
  reply.send({ test: 'foo' })
})
// typed sync error handler return error
server.setErrorHandler<CustomError, ReplyPayload>((error, request, reply) => {
  expectTypeOf(error).toEqualTypeOf<CustomError>();
  return { test: 'foo' }
})
// typed async error handler send error
server.setErrorHandler<CustomError, ReplyPayload>(async (error, request, reply) => {
  expectTypeOf(error).toEqualTypeOf<CustomError>();
  // @ts-expect-error  Type 'string' is not assignable to type 'boolean'.
  reply.send({ test: 'foo' })
})
// typed async error handler return error
server.setErrorHandler<CustomError, ReplyPayload>(async (error, request, reply) => {
  expectTypeOf(error).toEqualTypeOf<CustomError>();
  return { test: 'foo' }
})

function notFoundHandler (request: XufaRequest, reply: XufaReply) { }
async function notFoundAsyncHandler (request: XufaRequest, reply: XufaReply) { }
function notFoundpreHandlerHandler (
  request: XufaRequest,
  reply: XufaReply,
  done: HookHandlerDoneFunction
) { done() }
async function notFoundpreHandlerAsyncHandler (
  request: XufaRequest,
  reply: XufaReply
) { }
function notFoundpreValidationHandler (
  request: XufaRequest,
  reply: XufaReply,
  done: HookHandlerDoneFunction
) { done() }
async function notFoundpreValidationAsyncHandler (
  request: XufaRequest,
  reply: XufaReply
) { }

server.setNotFoundHandler(notFoundHandler)
server.setNotFoundHandler({ preHandler: notFoundpreHandlerHandler }, notFoundHandler)
server.setNotFoundHandler({ preHandler: notFoundpreHandlerAsyncHandler }, notFoundHandler)
server.setNotFoundHandler({ preValidation: notFoundpreValidationHandler }, notFoundHandler)
server.setNotFoundHandler({ preValidation: notFoundpreValidationAsyncHandler }, notFoundHandler)
server.setNotFoundHandler(
  { preHandler: notFoundpreHandlerHandler, preValidation: notFoundpreValidationHandler },
  notFoundHandler
)

server.setNotFoundHandler(notFoundAsyncHandler)
server.setNotFoundHandler({ preHandler: notFoundpreHandlerHandler }, notFoundAsyncHandler)
server.setNotFoundHandler({ preHandler: notFoundpreHandlerAsyncHandler }, notFoundAsyncHandler)
server.setNotFoundHandler({ preValidation: notFoundpreValidationHandler }, notFoundAsyncHandler)
server.setNotFoundHandler({ preValidation: notFoundpreValidationAsyncHandler }, notFoundAsyncHandler)
server.setNotFoundHandler(
  { preHandler: notFoundpreHandlerHandler, preValidation: notFoundpreValidationHandler },
  notFoundAsyncHandler
)

server.setNotFoundHandler(function (_, reply) {
  return reply.send('')
})

server.setSchemaController({
  bucket: (parentSchemas) => {
    expectTypeOf(parentSchemas).toEqualTypeOf<unknown>();

    return {
      add (schema) {
        expectTypeOf(schema).toEqualTypeOf<unknown>();
        expectTypeOf(server.addSchema({ type: 'null' })).toEqualTypeOf<XufaInstance>();
        return server.addSchema({ type: 'null' })
      },
      getSchema (schemaId) {
        expectTypeOf(schemaId).toEqualTypeOf<string>();
        return server.getSchema('SchemaId')
      },
      getSchemas () {
        expectTypeOf(server.getSchemas()).toEqualTypeOf<Record<string, unknown>>();
        return server.getSchemas()
      }
    }
  }
})

function invalidSchemaController (schemaControllerOptions: XufaSchemaControllerOptions) { }
// @ts-expect-error  Type '(schemaControllerOptions: XufaSchemaControllerOptions) => void' has no properties in common with type 'XufaSchemaControllerOptions'.
server.setSchemaController(invalidSchemaController)

server.setReplySerializer(function (payload, statusCode) {
  expectTypeOf(payload).toEqualTypeOf<unknown>();
  expectTypeOf(statusCode).toEqualTypeOf<number>();
  return 'serialized'
})

function invalidReplySerializer (payload: number, statusCode: string) { }
// @ts-expect-error  Argument of type '(payload: number, statusCode: string) => void' is not assignable to parameter of type '(payload: unknown, statusCode: number) => string'.
server.setReplySerializer(invalidReplySerializer)

function serializerWithInvalidReturn (payload: unknown, statusCode: number) { }
// @ts-expect-error  Argument of type '(payload: unknown, statusCode: number) => void' is not assignable to parameter of type '(payload: unknown, statusCode: number) => string'.
server.setReplySerializer(serializerWithInvalidReturn)

function invalidSchemaErrorFormatter (err: Error) {
  if (err) { throw err }
}
// @ts-expect-error  Argument of type '(err: Error) => void' is not assignable to parameter of type 'SchemaErrorFormatter'.
server.setSchemaErrorFormatter(invalidSchemaErrorFormatter)

expectTypeOf(server.addHttpMethod('SEARCH', { hasBody: true })).toEqualTypeOf<XufaInstance>();
expectTypeOf(server.addHttpMethod('GET', { overrideExisting: true })).toEqualTypeOf<XufaInstance>();
expectTypeOf(server.addHttpMethod('POST', { hasBody: true, overrideExisting: true })).toEqualTypeOf<XufaInstance>();

// test listen opts objects
const options: XufaListenOptions = {}

expectTypeOf(server.listen()).toEqualTypeOf<Promise<string>>();
expectTypeOf(server.listen(options)).toEqualTypeOf<Promise<string>>();
expectTypeOf(server.listen({ port: 3000 })).toEqualTypeOf<Promise<string>>();
expectTypeOf(server.listen({ port: 3000, listenTextResolver: (address) => { return `address: ${address}` } })).toEqualTypeOf<Promise<string>>();
expectTypeOf(server.listen({ port: 3000, host: '0.0.0.0' })).toEqualTypeOf<Promise<string>>();
expectTypeOf(server.listen({ port: 3000, host: '0.0.0.0', backlog: 42 })).toEqualTypeOf<Promise<string>>();
expectTypeOf(server.listen({ port: 3000, host: '0.0.0.0', backlog: 42, exclusive: true })).toEqualTypeOf<Promise<string>>();
expectTypeOf(server.listen({ port: 3000, host: '::/0', ipv6Only: true })).toEqualTypeOf<Promise<string>>();

expectTypeOf(server.listen(() => { })).toEqualTypeOf<void>();
expectTypeOf(server.listen({ port: 3000 }, () => { })).toEqualTypeOf<void>();
expectTypeOf(server.listen({ port: 3000, listenTextResolver: (address) => { return `address: ${address}` } }, () => { })).toEqualTypeOf<void>();
expectTypeOf(server.listen({ port: 3000, host: '0.0.0.0' }, () => { })).toEqualTypeOf<void>();
expectTypeOf(server.listen({ port: 3000, host: '0.0.0.0', backlog: 42 }, () => { })).toEqualTypeOf<void>();
expectTypeOf(server.listen({ port: 3000, host: '0.0.0.0', backlog: 42, exclusive: true }, () => { })).toEqualTypeOf<void>();
expectTypeOf(server.listen({ port: 3000, host: '::/0', ipv6Only: true }, () => { })).toEqualTypeOf<void>();

// test after method
expectTypeOf(server.after()).toMatchTypeOf<XufaInstance>();
expectTypeOf(server.after((err) => {
  expectTypeOf(err).toEqualTypeOf<Error | null>();
})).toMatchTypeOf<XufaInstance>();

// test ready method
expectTypeOf(server.ready()).toMatchTypeOf<XufaInstance>();
expectTypeOf(server.ready((err) => {
  expectTypeOf(err).toEqualTypeOf<Error | null>();
})).toMatchTypeOf<XufaInstance>();
expectTypeOf(server.ready(async (err) => {
  expectTypeOf(err).toEqualTypeOf<Error | null>();
})).toMatchTypeOf<XufaInstance>();

expectTypeOf(server.routing({} as RawRequestDefaultExpression, {} as RawReplyDefaultExpression)).toEqualTypeOf<void>();

expectTypeOf(xufa().get<RouteGenericInterface, { contextKey: string }>('/', {
  handler: () => { },
  errorHandler: (error, request, reply) => {
    expectTypeOf(error).toEqualTypeOf<XufaError>();
    expectTypeOf(request).toMatchTypeOf<XufaRequest>();
    expectTypeOf(request.routeOptions.config).toMatchTypeOf<{ contextKey: string }>();
    expectTypeOf(reply).toMatchTypeOf<XufaReply>();
    expectTypeOf(server.errorHandler(error, request, reply)).toEqualTypeOf<void>();
  }
})).toEqualTypeOf<XufaInstance>();

expectTypeOf(xufa().get('/', {
  handler: () => { },
  childLoggerFactory: (logger, bindings, opts, req) => {
    expectTypeOf(server.childLoggerFactory(logger, bindings, opts, req)).toEqualTypeOf<XufaBaseLogger>();
    return server.childLoggerFactory(logger, bindings, opts, req)
  }
})).toEqualTypeOf<XufaInstance>();

expectTypeOf(server.setChildLoggerFactory(function (logger, bindings, opts, req) {
    expectTypeOf(logger).toEqualTypeOf<XufaBaseLogger>();
    expectTypeOf(bindings).toEqualTypeOf<Bindings>();
    expectTypeOf(opts).toEqualTypeOf<ChildLoggerOptions>();
    expectTypeOf(req).toEqualTypeOf<RawRequestDefaultExpression>();
    expectTypeOf(this).toEqualTypeOf<XufaInstance>();
    return logger.child(bindings, opts)
  })).toEqualTypeOf<XufaInstance>();

expectTypeOf(server.setErrorHandler<XufaError>(function (error, request, reply) {
    expectTypeOf(error).toEqualTypeOf<XufaError>();
  })).toEqualTypeOf<XufaInstance>();

function childLoggerFactory (
  this: XufaInstance,
  logger: XufaBaseLogger,
  bindings: Bindings,
  opts: ChildLoggerOptions,
  req: RawRequestDefaultExpression
) {
  return logger.child(bindings, opts)
}
server.setChildLoggerFactory(childLoggerFactory)
server.setChildLoggerFactory(server.childLoggerFactory)

type InitialConfig = Readonly<{
  connectionTimeout?: number,
  keepAliveTimeout?: number,
  bodyLimit?: number,
  caseSensitive?: boolean,
  allowUnsafeRegex?: boolean,
  forceCloseConnections?: boolean,
  http2?: boolean,
  https?: boolean | Readonly<{ allowHTTP1: boolean }>,
  ignoreTrailingSlash?: boolean,
  ignoreDuplicateSlashes?: boolean,
  maxParamLength?: number,
  onProtoPoisoning?: 'error' | 'remove' | 'ignore',
  onConstructorPoisoning?: 'error' | 'remove' | 'ignore',
  pluginTimeout?: number,
  requestIdHeader?: string | false,
  http2SessionTimeout?: number,
  useSemicolonDelimiter?: boolean,
  routerOptions?: XufaRouterOptions<RawServerDefault>
}>

expectTypeOf(xufa().initialConfig).toEqualTypeOf<InitialConfig>();

// TODO: we accept wider types than find-my-way and it cannot be assign to a restricted types
// expect<XufaRouterOptions<RawServerDefault>>().type.toBeAssignableTo<
//   FindMyWayConfig<FindMyWayVersion<RawServerDefault>>
// >()

xufa({
  routerOptions: {
    defaultRoute: (req, res) => {
      expectTypeOf(req).toEqualTypeOf<RawRequestDefaultExpression<RawServerDefault>>();
      expectTypeOf(res).toEqualTypeOf<RawReplyDefaultExpression<RawServerDefault>>();
      expectTypeOf(res).not.toMatchTypeOf<XufaReply>();
      res.end('foo')
    },
    onBadUrl: (path, req, res) => {
      expectTypeOf(path).toEqualTypeOf<string>();
      expectTypeOf(req).toEqualTypeOf<RawRequestDefaultExpression<RawServerDefault>>();
      expectTypeOf(res).toEqualTypeOf<RawReplyDefaultExpression<RawServerDefault>>();
      expectTypeOf(res).not.toMatchTypeOf<XufaReply>();
      res.end('foo')
    },
    onMaxParamLength (path, req, res) {
      expectTypeOf(path).toEqualTypeOf<string>();
      expectTypeOf(req).toEqualTypeOf<RawRequestDefaultExpression<RawServerDefault>>();
      expectTypeOf(res).toEqualTypeOf<RawReplyDefaultExpression<RawServerDefault>>();
      expectTypeOf(res).not.toMatchTypeOf<XufaReply>();
      res.end('foo')
    }
  }
})

expectTypeOf(server.defaultTextParser).toEqualTypeOf<XufaBodyParser<string>>();

expectTypeOf(server.getDefaultJsonParser('ignore', 'error')).toEqualTypeOf<XufaBodyParser<string>>();

expectTypeOf(server.printRoutes({ includeHooks: true, commonPrefix: false, includeMeta: true })).toEqualTypeOf<string>();

expectTypeOf(server.printRoutes({ includeMeta: ['key1', Symbol('key2')] })).toEqualTypeOf<string>();

expectTypeOf(server.printRoutes({ method: 'GET' })).toEqualTypeOf<string>();

expectTypeOf(server.printRoutes()).toEqualTypeOf<string>();

server.decorate<(x: string) => void>('test', function (x: string): void {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
})
server.decorate('test', function (x: string): void {
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
})
server.decorate<string>('test', {
  getter () {
    expectTypeOf(this).toEqualTypeOf<XufaInstance>();
    return 'foo'
  }
})
server.decorate<string>('test', {
  getter () {
    expectTypeOf(this).toEqualTypeOf<XufaInstance>();
    return 'foo'
  },
  setter (x) {
    expectTypeOf(x).toEqualTypeOf<string>();
    expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  }
})
server.decorate('test')
server.decorate('test', null, ['foo'])

server.decorateRequest<(x: string, y: number) => void>('test', function (x: string, y: number): void {
  expectTypeOf(this).toEqualTypeOf<XufaRequest>();
})
server.decorateRequest('test', function (x: string, y: number): void {
  expectTypeOf(this).toEqualTypeOf<XufaRequest>();
})
server.decorateRequest('test')
server.decorateRequest('test', null, ['foo'])

server.decorateReply<(x: string) => void>('test', function (x: string): void {
  expectTypeOf(this).toEqualTypeOf<XufaReply>();
})
server.decorateReply('test', function (x: string): void {
  expectTypeOf(this).toEqualTypeOf<XufaReply>();
})
server.decorateReply('test')
server.decorateReply('test', null, ['foo'])

// @ts-expect-error  Argument of type 'boolean' is not assignable to parameter of type 'GetterSetter...'.
server.decorate<string>('test', true)
// @ts-expect-error  Type 'string' is not assignable to type 'number'.
server.decorate<(myNumber: number) => number>('test', function (myNumber: number): string {
  return ''
})
server.decorate<string>('test', {
  // @ts-expect-error  Type 'boolean' is not assignable to type 'string'.
  getter () {
    return true
  }
})
// @ts-expect-error  Property 'getter' is missing in type
server.decorate<string>('test', {
  setter (x) { }
})

declare module '../..' {
  interface XufaInstance {
    typedTestProperty: boolean
    typedTestPropertyGetterSetter: string
    typedTestMethod(x: string): string
  }

  interface XufaRequest {
    typedTestRequestProperty: boolean
    typedTestRequestPropertyGetterSetter: string
    typedTestRequestMethod(x: string): string
  }

  interface XufaReply {
    typedTestReplyProperty: boolean
    typedTestReplyPropertyGetterSetter: string
    typedTestReplyMethod(x: string): string
  }
}

server.decorate('typedTestProperty', false)
server.decorate('typedTestProperty', {
  getter () {
    return false
  }
})
server.decorate('typedTestProperty', {
  getter (): boolean {
    return true
  },
  setter (x) {
    expectTypeOf(x).toEqualTypeOf<boolean>();
    expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  }
})
server.decorate('typedTestProperty')
server.decorate('typedTestProperty', null, ['foo'])
// @ts-expect-error
server.decorate('typedTestProperty', null);
// @ts-expect-error
server.decorate('typedTestProperty', 'foo');
server.decorate('typedTestProperty', {
  // @ts-expect-error
  getter () {
    return 'foo'
  }
});
server.decorate('typedTestMethod', function (x) {
  expectTypeOf(x).toEqualTypeOf<string>();
  expectTypeOf(this).toEqualTypeOf<XufaInstance>();
  return 'foo'
})
server.decorate('typedTestMethod', x => x)
// @ts-expect-error  Type 'string' is not assignable to type 'boolean'.
server.decorate('typedTestMethod', function (x: boolean) {
  return 'foo'
})
// @ts-expect-error  Type 'boolean' is not assignable to type 'string'.
server.decorate('typedTestMethod', function () {
  return true
})
// @ts-expect-error  Type 'Promise<string>' is not assignable to type 'string'.
server.decorate('typedTestMethod', async function () {
  return 'foo'
})

server.decorateRequest('typedTestRequestProperty', false)
server.decorateRequest('typedTestRequestProperty', {
  getter () {
    return false
  }
})
server.decorateRequest('typedTestRequestProperty', {
  getter (): boolean {
    return true
  },
  setter (x) {
    expectTypeOf(x).toEqualTypeOf<boolean>();
    expectTypeOf(this).toEqualTypeOf<XufaRequest>();
  }
})
server.decorateRequest('typedTestRequestProperty')
server.decorateRequest('typedTestRequestProperty', null, ['foo'])
// @ts-expect-error
server.decorateRequest('typedTestRequestProperty', null);
// @ts-expect-error
server.decorateRequest('typedTestRequestProperty', 'foo');
server.decorateRequest('typedTestRequestProperty', {
  // @ts-expect-error
  getter () {
    return 'foo'
  }
});
server.decorateRequest('typedTestRequestMethod', function (x) {
  expectTypeOf(x).toEqualTypeOf<string>();
  expectTypeOf(this).toEqualTypeOf<XufaRequest>();
  return 'foo'
})
server.decorateRequest('typedTestRequestMethod', x => x)
// @ts-expect-error  Type 'string' is not assignable to type 'boolean'.
server.decorateRequest('typedTestRequestMethod', function (x: boolean) {
  return 'foo'
})
// @ts-expect-error  Type 'boolean' is not assignable to type 'string'.
server.decorateRequest('typedTestRequestMethod', function () {
  return true
})
// @ts-expect-error  Type 'Promise<string>' is not assignable to type 'string'.
server.decorateRequest('typedTestRequestMethod', async function () {
  return 'foo'
})

server.decorateReply('typedTestReplyProperty', false)
server.decorateReply('typedTestReplyProperty', {
  getter () {
    return false
  }
})
server.decorateReply('typedTestReplyProperty', {
  getter (): boolean {
    return true
  },
  setter (x) {
    expectTypeOf(x).toEqualTypeOf<boolean>();
    expectTypeOf(this).toEqualTypeOf<XufaReply>();
  }
})
server.decorateReply('typedTestReplyProperty')
server.decorateReply('typedTestReplyProperty', null, ['foo'])
// @ts-expect-error
server.decorateReply('typedTestReplyProperty', null);
// @ts-expect-error
server.decorateReply('typedTestReplyProperty', 'foo');
server.decorateReply('typedTestReplyProperty', {
  // @ts-expect-error
  getter () {
    return 'foo'
  }
});
server.decorateReply('typedTestReplyMethod', function (x) {
  expectTypeOf(x).toEqualTypeOf<string>();
  expectTypeOf(this).toEqualTypeOf<XufaReply>();
  return 'foo'
})
server.decorateReply('typedTestReplyMethod', x => x)
// @ts-expect-error  Type 'string' is not assignable to type 'boolean'
server.decorateReply('typedTestReplyMethod', function (x: boolean) {
  return 'foo'
})
// @ts-expect-error  Type 'boolean' is not assignable to type 'string'
server.decorateReply('typedTestReplyMethod', function (x) {
  return true
})
// @ts-expect-error  Type 'Promise<string>' is not assignable to type 'string'.
server.decorateReply('typedTestReplyMethod', async function () {
  return 'foo'
})

const foo = server.getDecorator<string>('foo')
expectTypeOf(foo).toEqualTypeOf<string>();

const versionConstraintStrategy: ConstraintStrategy<FindMyWayVersion<RawServerDefault>> = {
  name: 'version',
  storage: () => ({
    get: () => () => { },
    set: () => { },
    del: () => { },
    empty: () => { }
  }),
  validate () { },
  deriveConstraint: () => 'foo'
}
expectTypeOf(server.addConstraintStrategy(versionConstraintStrategy)).toEqualTypeOf<void>();
expectTypeOf(server.hasConstraintStrategy(versionConstraintStrategy.name)).toEqualTypeOf<boolean>();

expectTypeOf(server.validatorCompiler).toEqualTypeOf<XufaSchemaCompiler<any> | undefined>();
expectTypeOf(server.serializerCompiler).toEqualTypeOf<XufaSerializerCompiler<any> | undefined>();
