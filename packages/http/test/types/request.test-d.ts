// Ported from fastify (test/types/request.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { expectTypeOf } from '@xufa/test';
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
  expectTypeOf(request.url).toEqualTypeOf<string>();
  expectTypeOf(request.originalUrl).toEqualTypeOf<string>();
  expectTypeOf(request.method).toEqualTypeOf<string>();
  expectTypeOf(request.routeOptions).toEqualTypeOf<Readonly<RequestRouteOptions>>();
  expectTypeOf(request.is404).toEqualTypeOf<boolean>();
  expectTypeOf(request.hostname).toEqualTypeOf<string>();
  expectTypeOf(request.host).toEqualTypeOf<string>();
  expectTypeOf(request.port).toEqualTypeOf<number | null>();
  expectTypeOf(request.ip).toEqualTypeOf<string>();
  expectTypeOf(request.ips).toEqualTypeOf<string[] | undefined>();
  expectTypeOf(request.raw).toEqualTypeOf<RawRequestDefaultExpression>();
  expectTypeOf(request.body).toEqualTypeOf<RequestBodyDefault>();
  expectTypeOf(request.params).toEqualTypeOf<RequestParamsDefault>();
  expectTypeOf(request.routeOptions.config).toEqualTypeOf<ContextConfigDefault & XufaRouteConfig & XufaContextConfig>();
  expectTypeOf(request.routeOptions.schema).toEqualTypeOf<XufaSchema | undefined>();
  expectTypeOf(request.routeOptions.handler).toEqualTypeOf<RouteHandlerMethod>();
  expectTypeOf(request.routeOptions.url).toEqualTypeOf<string | undefined>();
  expectTypeOf(request.routeOptions.version).toEqualTypeOf<string | undefined>();

  expectTypeOf(request.headers).toEqualTypeOf<RequestHeadersDefault & RawRequestDefaultExpression['headers']>();
  request.headers = {}

  expectTypeOf(request.query).toEqualTypeOf<RequestQuerystringDefault>();
  expectTypeOf(request.id).toEqualTypeOf<string>();
  expectTypeOf(request.log).toEqualTypeOf<XufaBaseLogger>();
  expectTypeOf(request.socket).toEqualTypeOf<RawRequestDefaultExpression['socket']>();
  expectTypeOf(request.signal).toEqualTypeOf<AbortSignal>();
  expectTypeOf(request.validationError).toEqualTypeOf<Error & { validation: any; validationContext: string } | undefined>();
  expectTypeOf(request.server).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request.getValidationFunction).toMatchTypeOf<(httpPart: HTTPRequestPart) => ExpectedGetValidationFunction | undefined>();
  expectTypeOf(request.getValidationFunction).toMatchTypeOf<(schema: { [key: string]: unknown }) => ExpectedGetValidationFunction | undefined>();
  expectTypeOf(request.getValidationFunction('body')).toEqualTypeOf<ValidationFunction | undefined>();
  expectTypeOf(request.getValidationFunction({ type: 'object' })).toEqualTypeOf<ValidationFunction | undefined>();
  expectTypeOf(request.validateInput).toMatchTypeOf<(input: { [key: string]: unknown }, schema: { [key: string]: unknown }, httpPart?: HTTPRequestPart) => boolean>();
  expectTypeOf(request.validateInput).toMatchTypeOf<(input: { [key: string]: unknown }, httpPart?: HTTPRequestPart) => boolean>();
  expectTypeOf(request.getDecorator<string>('foo')).toEqualTypeOf<string>();
  expectTypeOf(request.setDecorator('foo', 'hello')).toEqualTypeOf<void>();
  expectTypeOf(request.setDecorator<string>('foo', 'hello')).toEqualTypeOf<void>();
  // @ts-expect-error
  request.setDecorator<string>('foo', true);
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
  expectTypeOf(request.log).toEqualTypeOf<CustomLoggerInterface>();
}

const postHandler: Handler = function (request) {
  expectTypeOf(request.body).toEqualTypeOf<RequestBody>();
  expectTypeOf(request.params).toEqualTypeOf<RequestParams>();
  expectTypeOf(request.headers).toEqualTypeOf<RequestHeaders & RawRequestDefaultExpression['headers']>();
  expectTypeOf(request.query).toEqualTypeOf<RequestQuerystring>();
  expectTypeOf(request.body.content).toEqualTypeOf<string>();
  expectTypeOf(request.query.from).toEqualTypeOf<string>();
  expectTypeOf(request.params.id).toEqualTypeOf<number>();
  expectTypeOf(request.headers['x-foobar']).toEqualTypeOf<string>();
  expectTypeOf(request.server).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request.routeOptions.config).toEqualTypeOf<XufaContextConfig & XufaRouteConfig>();
}

function putHandler (request: CustomRequest, reply: XufaReply) {
  expectTypeOf(request.body).toEqualTypeOf<RequestBody | undefined>();
  expectTypeOf(request.params).toEqualTypeOf<RequestParams>();
  expectTypeOf(request.headers).toEqualTypeOf<RequestHeaders & RawRequestDefaultExpression['headers']>();
  expectTypeOf(request.query).toEqualTypeOf<RequestQuerystring>();
  if (request.body === undefined) {
    expectTypeOf(request.body).toEqualTypeOf<undefined>();
  } else {
    expectTypeOf(request.body.content).toEqualTypeOf<string>();
  }
  expectTypeOf(request.query.from).toEqualTypeOf<string>();
  expectTypeOf(request.params.id).toEqualTypeOf<number>();
  expectTypeOf(request.headers['x-foobar']).toEqualTypeOf<string>();
  expectTypeOf(request.server).toEqualTypeOf<XufaInstance>();
  expectTypeOf(request.routeOptions.config).toEqualTypeOf<ContextConfigDefault & XufaRouteConfig & XufaContextConfig>();
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

expectTypeOf(serverWithCustomLogger).not.toMatchTypeOf<XufaInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, CustomLoggerInterface>
  & Promise<
    XufaInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, CustomLoggerInterface>
  >>();

expectTypeOf(serverWithCustomLogger).toMatchTypeOf<XufaInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, CustomLoggerInterface>
  & PromiseLike<
    XufaInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, CustomLoggerInterface>
  >>();

expectTypeOf(serverWithCustomLogger).toEqualTypeOf<XufaInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, CustomLoggerInterface>
  & SafePromiseLike<
    XufaInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, CustomLoggerInterface>
  >>();

serverWithCustomLogger.get('/get', getHandlerWithCustomLogger)
