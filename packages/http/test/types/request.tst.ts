// Ported from fastify (test/types/request.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { expect } from 'tstyche'
import xufa, {
  ContextConfigDefault,
  XufaContextConfig,
  XufaLogFn,
  XufaSchema,
  XufaTypeProviderDefault,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RequestBodyDefault,
  RequestGenericInterface,
  RouteHandler,
  RouteHandlerMethod,
  SafePromiseLike
} from '../..'
import { XufaInstance } from '../../types/instance.js'
import { XufaBaseLogger } from '../../types/logger.js'
import { XufaReply } from '../../types/reply.js'
import { XufaRequest, RequestRouteOptions, ValidationFunction } from '../../types/request.js'
import { XufaRouteConfig, RouteGenericInterface } from '../../types/route.js'
import { RequestHeadersDefault, RequestParamsDefault, RequestQuerystringDefault } from '../../types/utils.js'

interface RequestBody {
  content: string;
}

interface RequestQuerystring {
  from: string;
}

interface RequestParams {
  id: number;
}

interface RequestHeaders {
  'x-foobar': string;
}

interface RequestData extends RequestGenericInterface {
  Body: RequestBody;
  Querystring: RequestQuerystring;
  Params: RequestParams;
  Headers: RequestHeaders;
}

type Handler = RouteHandler<RequestData>

type CustomRequest = XufaRequest<{
  Body: RequestBody | undefined;
  Querystring: RequestQuerystring;
  Params: RequestParams;
  Headers: RequestHeaders;
}>

type HTTPRequestPart = 'body' | 'query' | 'querystring' | 'params' | 'headers'
type ExpectedGetValidationFunction = (input: { [key: string]: unknown }) => boolean

interface CustomLoggerInterface extends XufaBaseLogger {
  foo: XufaLogFn; // custom severity logger method
}

const getHandler: RouteHandler = function (request, _reply) {
  expect(request.url).type.toBe<string>()
  expect(request.originalUrl).type.toBe<string>()
  expect(request.method).type.toBe<string>()
  expect(request.routeOptions).type.toBe<Readonly<RequestRouteOptions>>()
  expect(request.is404).type.toBe<boolean>()
  expect(request.hostname).type.toBe<string>()
  expect(request.host).type.toBe<string>()
  expect(request.port).type.toBe<number | null>()
  expect(request.ip).type.toBe<string>()
  expect(request.ips).type.toBe<string[] | undefined>()
  expect(request.raw).type.toBe<RawRequestDefaultExpression>()
  expect(request.body).type.toBe<RequestBodyDefault>()
  expect(request.params).type.toBe<RequestParamsDefault>()
  expect(request.routeOptions.config).type.toBe<ContextConfigDefault & XufaRouteConfig & XufaContextConfig>()
  expect(request.routeOptions.schema).type.toBe<XufaSchema | undefined>()
  expect(request.routeOptions.handler).type.toBe<RouteHandlerMethod>()
  expect(request.routeOptions.url).type.toBe<string | undefined>()
  expect(request.routeOptions.version).type.toBe<string | undefined>()

  expect(request.headers).type.toBe<RequestHeadersDefault & RawRequestDefaultExpression['headers']>()
  request.headers = {}

  expect(request.query).type.toBe<RequestQuerystringDefault>()
  expect(request.id).type.toBe<string>()
  expect(request.log).type.toBe<XufaBaseLogger>()
  expect(request.socket).type.toBe<RawRequestDefaultExpression['socket']>()
  expect(request.signal).type.toBe<AbortSignal>()
  expect(request.validationError).type.toBe<Error & { validation: any; validationContext: string } | undefined>()
  expect(request.server).type.toBe<XufaInstance>()
  expect(request.getValidationFunction).type.toBeAssignableTo<
    (httpPart: HTTPRequestPart) => ExpectedGetValidationFunction | undefined
  >()
  expect(request.getValidationFunction).type.toBeAssignableTo<
    (schema: { [key: string]: unknown }) => ExpectedGetValidationFunction | undefined
  >()
  expect(request.getValidationFunction('body')).type.toBe<ValidationFunction | undefined>()
  expect(request.getValidationFunction({ type: 'object' })).type.toBe<ValidationFunction | undefined>()
  expect(request.validateInput).type.toBeAssignableTo<
    (input: { [key: string]: unknown }, schema: { [key: string]: unknown }, httpPart?: HTTPRequestPart) => boolean
  >()
  expect(request.validateInput).type.toBeAssignableTo<
    (input: { [key: string]: unknown }, httpPart?: HTTPRequestPart) => boolean
  >()
  expect(request.getDecorator<string>('foo')).type.toBe<string>()
  expect(request.setDecorator('foo', 'hello')).type.toBe<void>()
  expect(request.setDecorator<string>('foo', 'hello')).type.toBe<void>()
  expect(request.setDecorator<string>).type.not.toBeCallableWith('foo', true)
}

const getHandlerWithCustomLogger: RouteHandlerMethod<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  RouteGenericInterface,
  ContextConfigDefault,
  XufaSchema,
  XufaTypeProviderDefault,
  CustomLoggerInterface
> = function (request, _reply) {
  expect(request.log).type.toBe<CustomLoggerInterface>()
}

const postHandler: Handler = function (request) {
  expect(request.body).type.toBe<RequestBody>()
  expect(request.params).type.toBe<RequestParams>()
  expect(
    request.headers
  ).type.toBe<RequestHeaders & RawRequestDefaultExpression['headers']>()
  expect(request.query).type.toBe<RequestQuerystring>()
  expect(request.body.content).type.toBe<string>()
  expect(request.query.from).type.toBe<string>()
  expect(request.params.id).type.toBe<number>()
  expect(request.headers['x-foobar']).type.toBe<string>()
  expect(request.server).type.toBe<XufaInstance>()
  expect(request.routeOptions.config).type.toBe<XufaContextConfig & XufaRouteConfig>()
}

function putHandler (request: CustomRequest, reply: XufaReply) {
  expect(request.body).type.toBe<RequestBody | undefined>()
  expect(request.params).type.toBe<RequestParams>()
  expect(request.headers).type.toBe<RequestHeaders & RawRequestDefaultExpression['headers']>()
  expect(request.query).type.toBe<RequestQuerystring>()
  if (request.body === undefined) {
    expect(request.body).type.toBe<undefined>()
  } else {
    expect(request.body.content).type.toBe<string>()
  }
  expect(request.query.from).type.toBe<string>()
  expect(request.params.id).type.toBe<number>()
  expect(request.headers['x-foobar']).type.toBe<string>()
  expect(request.server).type.toBe<XufaInstance>()
  expect(request.routeOptions.config).type.toBe<ContextConfigDefault & XufaRouteConfig & XufaContextConfig>()
}

const server = xufa()
server.get('/get', getHandler)
server.post('/post', postHandler)
server.put('/put', putHandler)

const customLogger: CustomLoggerInterface = {
  level: 'info',
  silent: () => { },
  info: () => { },
  warn: () => { },
  error: () => { },
  fatal: () => { },
  trace: () => { },
  debug: () => { },
  foo: () => { }, // custom severity logger method
  child: () => customLogger
}

const serverWithCustomLogger = xufa({ loggerInstance: customLogger })

expect(serverWithCustomLogger).type.not.toBeAssignableTo<
  XufaInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, CustomLoggerInterface>
  & Promise<
    XufaInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, CustomLoggerInterface>
  >
>()

expect(serverWithCustomLogger).type.toBeAssignableTo<
  XufaInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, CustomLoggerInterface>
  & PromiseLike<
    XufaInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, CustomLoggerInterface>
  >
>()

expect(serverWithCustomLogger).type.toBe<
  XufaInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, CustomLoggerInterface>
  & SafePromiseLike<
    XufaInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, CustomLoggerInterface>
  >
>()

serverWithCustomLogger.get('/get', getHandlerWithCustomLogger)
