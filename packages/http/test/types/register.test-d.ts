// Ported from fastify (test/types/register.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { IncomingMessage, Server, ServerResponse } from 'node:http'
import { Http2Server, Http2ServerRequest, Http2ServerResponse } from 'node:http2'
import { expectTypeOf } from '@xufa/test';
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
// @ts-expect-error
(xufa().register)(testPluginOptsAsync, { prefix: 1 });
// @ts-expect-error
(xufa().register)(testPluginOptsAsync, { logLevel: () => ({}) });
// @ts-expect-error
(xufa().register)(testPluginOptsAsync, { logSerializers: () => ({}) });
// @ts-expect-error
(xufa().register)({});

expectTypeOf(xufa().register(
    testPluginOptsAsync, { prefix: '/example', logLevel: 'info', logSerializers: { key: (value: any) => `${value}` } }
  )).toMatchTypeOf<XufaInstance>();

expectTypeOf(xufa().register(testPluginOptsAsync, () => {
    return {}
  })).toMatchTypeOf<XufaInstance>();

expectTypeOf(xufa().register(testPluginOptsAsync, (instance) => {
    expectTypeOf(instance).toEqualTypeOf<XufaInstance>();
  })).toMatchTypeOf<XufaInstance>();

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
expectTypeOf(serverWithHttp2.register(testPluginCallback)).toMatchTypeOf<ServerWithHttp2>();
expectTypeOf(serverWithHttp2.register(testPluginAsync)).toMatchTypeOf<ServerWithHttp2>();
expectTypeOf(serverWithHttp2.register(testPluginOpts)).toMatchTypeOf<ServerWithHttp2>();
expectTypeOf(serverWithHttp2.register(testPluginOptsAsync)).toMatchTypeOf<ServerWithHttp2>();
expectTypeOf(serverWithHttp2.register(testPluginOptsWithType)).toMatchTypeOf<ServerWithHttp2>();
expectTypeOf(serverWithHttp2.register(testPluginOptsWithTypeAsync)).toMatchTypeOf<ServerWithHttp2>();
// @ts-expect-error
serverWithHttp2.register(testPluginWithHttp2);
expectTypeOf(serverWithHttp2.register(testPluginWithHttp2, testOptions)).toMatchTypeOf<ServerWithHttp2>();
// @ts-expect-error
serverWithHttp2.register(testPluginWithHttp2Async);
expectTypeOf(serverWithHttp2.register(testPluginWithHttp2Async, testOptions)).toMatchTypeOf<ServerWithHttp2>();
expectTypeOf(serverWithHttp2.register(testPluginWithHttp2WithType)).toMatchTypeOf<ServerWithHttp2>();
expectTypeOf(serverWithHttp2.register(testPluginWithHttp2WithTypeAsync)).toMatchTypeOf<ServerWithHttp2>();
expectTypeOf(serverWithHttp2.register((instance) => {
  expectTypeOf(instance).toEqualTypeOf<XufaInstance>();
})).toMatchTypeOf<ServerWithHttp2>();
expectTypeOf(serverWithHttp2.register((instance: ServerWithHttp2) => {
  expectTypeOf(instance).toEqualTypeOf<ServerWithHttp2>();
})).toMatchTypeOf<ServerWithHttp2>();
expectTypeOf(serverWithHttp2.register(async (instance) => {
  expectTypeOf(instance).toEqualTypeOf<XufaInstance>();
})).toMatchTypeOf<ServerWithHttp2>();
expectTypeOf(serverWithHttp2.register(async (instance: ServerWithHttp2) => {
  expectTypeOf(instance).toEqualTypeOf<ServerWithHttp2>();
})).toMatchTypeOf<ServerWithHttp2>();

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
expectTypeOf(serverWithTypeProvider.register(testPluginCallback)).toMatchTypeOf<ServerWithTypeProvider>();
expectTypeOf(serverWithTypeProvider.register(testPluginAsync)).toMatchTypeOf<ServerWithTypeProvider>();
expectTypeOf(serverWithTypeProvider.register(testPluginOpts)).toMatchTypeOf<ServerWithTypeProvider>();
expectTypeOf(serverWithTypeProvider.register(testPluginOptsAsync)).toMatchTypeOf<ServerWithTypeProvider>();
expectTypeOf(serverWithTypeProvider.register(testPluginOptsWithType)).toMatchTypeOf<ServerWithTypeProvider>();
expectTypeOf(serverWithTypeProvider.register(testPluginOptsWithTypeAsync)).toMatchTypeOf<ServerWithTypeProvider>();
// @ts-expect-error
serverWithTypeProvider.register(testPluginWithTypeProvider);
expectTypeOf(serverWithTypeProvider.register(testPluginWithTypeProvider, testOptions)).toMatchTypeOf<ServerWithTypeProvider>();
// @ts-expect-error
serverWithTypeProvider.register(testPluginWithTypeProviderAsync);
expectTypeOf(serverWithTypeProvider.register(testPluginWithTypeProviderAsync, testOptions)).toMatchTypeOf<ServerWithTypeProvider>();
expectTypeOf(serverWithTypeProvider.register(testPluginWithTypeProviderWithType)).toMatchTypeOf<ServerWithTypeProvider>();
expectTypeOf(serverWithTypeProvider.register(testPluginWithTypeProviderWithTypeAsync)).toMatchTypeOf<ServerWithTypeProvider>();
expectTypeOf(serverWithTypeProvider.register((instance) => {
  expectTypeOf(instance).toEqualTypeOf<XufaInstance>();
})).toMatchTypeOf<ServerWithTypeProvider>();
expectTypeOf(serverWithTypeProvider.register((instance: ServerWithTypeProvider) => {
  expectTypeOf(instance).toEqualTypeOf<ServerWithTypeProvider>();
})).toMatchTypeOf<ServerWithTypeProvider>();
expectTypeOf(serverWithTypeProvider.register(async (instance) => {
  expectTypeOf(instance).toEqualTypeOf<XufaInstance>();
})).toMatchTypeOf<ServerWithTypeProvider>();
expectTypeOf(serverWithTypeProvider.register(async (instance: ServerWithTypeProvider) => {
  expectTypeOf(instance).toEqualTypeOf<ServerWithTypeProvider>();
})).toMatchTypeOf<ServerWithTypeProvider>();

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
expectTypeOf(serverWithTypeProviderAndLogger.register(testPluginCallback)).toMatchTypeOf<ServerWithTypeProviderAndLogger>();
expectTypeOf(serverWithTypeProviderAndLogger.register(testPluginAsync)).toMatchTypeOf<ServerWithTypeProviderAndLogger>();
expectTypeOf(serverWithTypeProviderAndLogger.register(testPluginOpts)).toMatchTypeOf<ServerWithTypeProviderAndLogger>();
expectTypeOf(serverWithTypeProviderAndLogger.register(testPluginOptsAsync)).toMatchTypeOf<ServerWithTypeProviderAndLogger>();
expectTypeOf(serverWithTypeProviderAndLogger.register(testPluginOptsWithType)).toMatchTypeOf<ServerWithTypeProviderAndLogger>();
expectTypeOf(serverWithTypeProviderAndLogger.register(testPluginOptsWithTypeAsync)).toMatchTypeOf<ServerWithTypeProviderAndLogger>();
// @ts-expect-error
serverWithTypeProviderAndLogger.register(testPluginWithTypeProviderAndLogger);
expectTypeOf(serverWithTypeProviderAndLogger.register(testPluginWithTypeProviderAndLogger, testOptions)).toMatchTypeOf<ServerWithTypeProviderAndLogger>();
// @ts-expect-error
serverWithTypeProviderAndLogger.register(testPluginWithTypeProviderAndLoggerAsync);
expectTypeOf(serverWithTypeProviderAndLogger.register(testPluginWithTypeProviderAndLoggerAsync, testOptions)).toMatchTypeOf<ServerWithTypeProviderAndLogger>();
expectTypeOf(serverWithTypeProviderAndLogger.register(testPluginWithTypeProviderAndLoggerWithType)).toMatchTypeOf<ServerWithTypeProviderAndLogger>();
expectTypeOf(serverWithTypeProviderAndLogger.register(testPluginWithTypeProviderAndLoggerWithTypeAsync)).toMatchTypeOf<ServerWithTypeProviderAndLogger>();
expectTypeOf(serverWithTypeProviderAndLogger.register((instance) => {
    expectTypeOf(instance).toEqualTypeOf<XufaInstance>();
  })).toMatchTypeOf<ServerWithTypeProviderAndLogger>();
expectTypeOf(serverWithTypeProviderAndLogger.register((instance: ServerWithTypeProviderAndLogger) => {
    expectTypeOf(instance).toEqualTypeOf<ServerWithTypeProviderAndLogger>();
  })).toMatchTypeOf<ServerWithTypeProviderAndLogger>();
expectTypeOf(serverWithTypeProviderAndLogger.register(async (instance) => {
    expectTypeOf(instance).toEqualTypeOf<XufaInstance>();
  })).toMatchTypeOf<ServerWithTypeProviderAndLogger>();
expectTypeOf(serverWithTypeProviderAndLogger.register(async (instance: ServerWithTypeProviderAndLogger) => {
    expectTypeOf(instance).toEqualTypeOf<ServerWithTypeProviderAndLogger>();
  })).toMatchTypeOf<ServerWithTypeProviderAndLogger>();
