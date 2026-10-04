// Ported from fastify (test/types/register.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { IncomingMessage, Server, ServerResponse } from 'node:http'
import { Http2Server, Http2ServerRequest, Http2ServerResponse } from 'node:http2'
import { expect } from 'tstyche'
import xufa, {
  XufaInstance,
  XufaError,
  XufaBaseLogger,
  XufaPluginAsync,
  XufaPluginCallback,
  XufaPluginOptions,
  RawServerDefault
} from '../..'

const testPluginCallback: XufaPluginCallback = function (instance, opts, done) { }
const testPluginAsync: XufaPluginAsync = async function (instance, opts) { }

const testPluginOpts: XufaPluginCallback = function (instance, opts, done) { }
const testPluginOptsAsync: XufaPluginAsync = async function (instance, opts) { }

const testPluginOptsWithType = (
  instance: XufaInstance,
  opts: XufaPluginOptions,
  done: (error?: XufaError) => void
) => { }
const testPluginOptsWithTypeAsync = async (instance: XufaInstance, opts: XufaPluginOptions) => { }

interface TestOptions extends XufaPluginOptions {
  option1: string;
  option2: boolean;
}

// Type validation
expect(xufa().register).type.not.toBeCallableWith(testPluginOptsAsync, { prefix: 1 })
expect(xufa().register).type.not.toBeCallableWith(testPluginOptsAsync, { logLevel: () => ({}) })
expect(xufa().register).type.not.toBeCallableWith(testPluginOptsAsync, { logSerializers: () => ({}) })
expect(xufa().register).type.not.toBeCallableWith({})

expect(
  xufa().register(
    testPluginOptsAsync, { prefix: '/example', logLevel: 'info', logSerializers: { key: (value: any) => `${value}` } }
  )
).type.toBeAssignableTo<XufaInstance>()

expect(
  xufa().register(testPluginOptsAsync, () => {
    return {}
  })
).type.toBeAssignableTo<XufaInstance>()

expect(
  xufa().register(testPluginOptsAsync, (instance) => {
    expect(instance).type.toBe<XufaInstance>()
  })
).type.toBeAssignableTo<XufaInstance>()

// With Http2
const serverWithHttp2 = xufa({ http2: true })
type ServerWithHttp2 = XufaInstance<Http2Server, Http2ServerRequest, Http2ServerResponse>
const testPluginWithHttp2: XufaPluginCallback<TestOptions, Http2Server> = function (instance, opts, done) { }
const testPluginWithHttp2Async: XufaPluginAsync<TestOptions, Http2Server> = async function (instance, opts) { }
const testPluginWithHttp2WithType = (
  instance: ServerWithHttp2,
  opts: XufaPluginOptions,
  done: (error?: XufaError) => void
) => { }
const testPluginWithHttp2WithTypeAsync = async (
  instance: ServerWithHttp2,
  opts: XufaPluginOptions
) => { }
const testOptions: TestOptions = {
  option1: 'a',
  option2: false
}
expect(serverWithHttp2.register(testPluginCallback)).type.toBeAssignableTo<ServerWithHttp2>()
expect(serverWithHttp2.register(testPluginAsync)).type.toBeAssignableTo<ServerWithHttp2>()
expect(serverWithHttp2.register(testPluginOpts)).type.toBeAssignableTo<ServerWithHttp2>()
expect(serverWithHttp2.register(testPluginOptsAsync)).type.toBeAssignableTo<ServerWithHttp2>()
expect(serverWithHttp2.register(testPluginOptsWithType)).type.toBeAssignableTo<ServerWithHttp2>()
expect(serverWithHttp2.register(testPluginOptsWithTypeAsync)).type.toBeAssignableTo<ServerWithHttp2>()
expect(serverWithHttp2.register).type.not.toBeCallableWith(testPluginWithHttp2)
expect(serverWithHttp2.register(testPluginWithHttp2, testOptions)).type.toBeAssignableTo<ServerWithHttp2>()
expect(serverWithHttp2.register).type.not.toBeCallableWith(testPluginWithHttp2Async)
expect(serverWithHttp2.register(testPluginWithHttp2Async, testOptions)).type.toBeAssignableTo<ServerWithHttp2>()
expect(serverWithHttp2.register(testPluginWithHttp2WithType)).type.toBeAssignableTo<ServerWithHttp2>()
expect(serverWithHttp2.register(testPluginWithHttp2WithTypeAsync)).type.toBeAssignableTo<ServerWithHttp2>()
expect(serverWithHttp2.register((instance) => {
  expect(instance).type.toBe<XufaInstance>()
})).type.toBeAssignableTo<ServerWithHttp2>()
expect(serverWithHttp2.register((instance: ServerWithHttp2) => {
  expect(instance).type.toBe<ServerWithHttp2>()
})).type.toBeAssignableTo<ServerWithHttp2>()
expect(serverWithHttp2.register(async (instance) => {
  expect(instance).type.toBe<XufaInstance>()
})).type.toBeAssignableTo<ServerWithHttp2>()
expect(serverWithHttp2.register(async (instance: ServerWithHttp2) => {
  expect(instance).type.toBe<ServerWithHttp2>()
})).type.toBeAssignableTo<ServerWithHttp2>()

// With Type Provider
type TestTypeProvider = { schema: 'test', validator: 'test', serializer: 'test' }
const serverWithTypeProvider = xufa().withTypeProvider<TestTypeProvider>()
type ServerWithTypeProvider = XufaInstance<
  Server,
  IncomingMessage,
  ServerResponse,
  XufaBaseLogger,
  TestTypeProvider
>
const testPluginWithTypeProvider: XufaPluginCallback<
  TestOptions,
  RawServerDefault,
  TestTypeProvider
> = function (instance, opts, done) { }
const testPluginWithTypeProviderAsync: XufaPluginAsync<
  TestOptions,
  RawServerDefault,
  TestTypeProvider
> = async function (instance, opts) { }
const testPluginWithTypeProviderWithType = (
  instance: ServerWithTypeProvider,
  opts: XufaPluginOptions,
  done: (error?: XufaError) => void
) => { }
const testPluginWithTypeProviderWithTypeAsync = async (
  instance: ServerWithTypeProvider,
  opts: XufaPluginOptions
) => { }
expect(serverWithTypeProvider.register(testPluginCallback)).type.toBeAssignableTo<ServerWithTypeProvider>()
expect(serverWithTypeProvider.register(testPluginAsync)).type.toBeAssignableTo<ServerWithTypeProvider>()
expect(serverWithTypeProvider.register(testPluginOpts)).type.toBeAssignableTo<ServerWithTypeProvider>()
expect(serverWithTypeProvider.register(testPluginOptsAsync)).type.toBeAssignableTo<ServerWithTypeProvider>()
expect(serverWithTypeProvider.register(testPluginOptsWithType)).type.toBeAssignableTo<ServerWithTypeProvider>()
expect(serverWithTypeProvider.register(testPluginOptsWithTypeAsync)).type.toBeAssignableTo<ServerWithTypeProvider>()
expect(serverWithTypeProvider.register).type.not.toBeCallableWith(testPluginWithTypeProvider)
expect(serverWithTypeProvider.register(testPluginWithTypeProvider, testOptions))
  .type.toBeAssignableTo<ServerWithTypeProvider>()
expect(serverWithTypeProvider.register).type.not.toBeCallableWith(testPluginWithTypeProviderAsync)
expect(serverWithTypeProvider.register(testPluginWithTypeProviderAsync, testOptions))
  .type.toBeAssignableTo<ServerWithTypeProvider>()
expect(serverWithTypeProvider.register(testPluginWithTypeProviderWithType))
  .type.toBeAssignableTo<ServerWithTypeProvider>()
expect(serverWithTypeProvider.register(testPluginWithTypeProviderWithTypeAsync))
  .type.toBeAssignableTo<ServerWithTypeProvider>()
expect(serverWithTypeProvider.register((instance) => {
  expect(instance).type.toBe<XufaInstance>()
})).type.toBeAssignableTo<ServerWithTypeProvider>()
expect(serverWithTypeProvider.register((instance: ServerWithTypeProvider) => {
  expect(instance).type.toBe<ServerWithTypeProvider>()
})).type.toBeAssignableTo<ServerWithTypeProvider>()
expect(serverWithTypeProvider.register(async (instance) => {
  expect(instance).type.toBe<XufaInstance>()
})).type.toBeAssignableTo<ServerWithTypeProvider>()
expect(serverWithTypeProvider.register(async (instance: ServerWithTypeProvider) => {
  expect(instance).type.toBe<ServerWithTypeProvider>()
})).type.toBeAssignableTo<ServerWithTypeProvider>()

// With Type Provider and logger
const customLogger = {
  level: 'info',
  info: () => { },
  warn: () => { },
  error: () => { },
  fatal: () => { },
  trace: () => { },
  debug: () => { },
  child: () => customLogger,
  silent: () => { }
}
const serverWithTypeProviderAndLogger = xufa({
  loggerInstance: customLogger
}).withTypeProvider<TestTypeProvider>()
type ServerWithTypeProviderAndLogger = XufaInstance<
  Server,
  IncomingMessage,
  ServerResponse,
  typeof customLogger,
  TestTypeProvider
>
const testPluginWithTypeProviderAndLogger: XufaPluginCallback<
  TestOptions,
  RawServerDefault,
  TestTypeProvider,
  typeof customLogger
> = function (instance, opts, done) { }
const testPluginWithTypeProviderAndLoggerAsync: XufaPluginAsync<
  TestOptions,
  RawServerDefault,
  TestTypeProvider,
  typeof customLogger
> = async function (instance, opts) { }
const testPluginWithTypeProviderAndLoggerWithType = (
  instance: ServerWithTypeProviderAndLogger,
  opts: XufaPluginOptions,
  done: (error?: XufaError) => void
) => { }
const testPluginWithTypeProviderAndLoggerWithTypeAsync = async (
  instance: ServerWithTypeProviderAndLogger,
  opts: XufaPluginOptions
) => { }
expect(serverWithTypeProviderAndLogger.register(testPluginCallback))
  .type.toBeAssignableTo<ServerWithTypeProviderAndLogger>()
expect(serverWithTypeProviderAndLogger.register(testPluginAsync))
  .type.toBeAssignableTo<ServerWithTypeProviderAndLogger>()
expect(serverWithTypeProviderAndLogger.register(testPluginOpts))
  .type.toBeAssignableTo<ServerWithTypeProviderAndLogger>()
expect(serverWithTypeProviderAndLogger.register(testPluginOptsAsync))
  .type.toBeAssignableTo<ServerWithTypeProviderAndLogger>()
expect(serverWithTypeProviderAndLogger.register(testPluginOptsWithType))
  .type.toBeAssignableTo<ServerWithTypeProviderAndLogger>()
expect(serverWithTypeProviderAndLogger.register(testPluginOptsWithTypeAsync))
  .type.toBeAssignableTo<ServerWithTypeProviderAndLogger>()
expect(serverWithTypeProviderAndLogger.register).type.not.toBeCallableWith(testPluginWithTypeProviderAndLogger)
expect(
  serverWithTypeProviderAndLogger.register(testPluginWithTypeProviderAndLogger, testOptions)
).type.toBeAssignableTo<ServerWithTypeProviderAndLogger>()
expect(serverWithTypeProviderAndLogger.register).type.not.toBeCallableWith(testPluginWithTypeProviderAndLoggerAsync)
expect(
  serverWithTypeProviderAndLogger.register(testPluginWithTypeProviderAndLoggerAsync, testOptions)
).type.toBeAssignableTo<ServerWithTypeProviderAndLogger>()
expect(
  serverWithTypeProviderAndLogger.register(testPluginWithTypeProviderAndLoggerWithType)
).type.toBeAssignableTo<ServerWithTypeProviderAndLogger>()
expect(
  serverWithTypeProviderAndLogger.register(testPluginWithTypeProviderAndLoggerWithTypeAsync)
).type.toBeAssignableTo<ServerWithTypeProviderAndLogger>()
expect(
  serverWithTypeProviderAndLogger.register((instance) => {
    expect(instance).type.toBe<XufaInstance>()
  })
).type.toBeAssignableTo<ServerWithTypeProviderAndLogger>()
expect(
  serverWithTypeProviderAndLogger.register((instance: ServerWithTypeProviderAndLogger) => {
    expect(instance).type.toBe<ServerWithTypeProviderAndLogger>()
  })
).type.toBeAssignableTo<ServerWithTypeProviderAndLogger>()
expect(
  serverWithTypeProviderAndLogger.register(async (instance) => {
    expect(instance).type.toBe<XufaInstance>()
  })
).type.toBeAssignableTo<ServerWithTypeProviderAndLogger>()
expect(
  serverWithTypeProviderAndLogger.register(async (instance: ServerWithTypeProviderAndLogger) => {
    expect(instance).type.toBe<ServerWithTypeProviderAndLogger>()
  })
).type.toBeAssignableTo<ServerWithTypeProviderAndLogger>()
