// Ported from fastify (test/types/reply.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { Buffer } from 'node:buffer'
import { expectTypeOf } from '@xufa/test';
import xufa, {
  XufaContextConfig,
  XufaReply,
  XufaRequest,
  XufaSchema,
  XufaTypeProviderDefault,
  RawRequestDefaultExpression,
  RouteHandler,
  RouteHandlerMethod
} from '../..'
import { XufaInstance } from '../../types/instance.js'
import { XufaBaseLogger } from '../../types/logger.js'
import { ResolveReplyTypeWithRouteGeneric } from '../../types/reply.js'
import { XufaRouteConfig, RouteGenericInterface } from '../../types/route.js'
import { ContextConfigDefault, RawReplyDefaultExpression, RawServerDefault } from '../../types/utils.js'

type DefaultSerializationFunction = (payload: { [key: string]: unknown }) => string
type DefaultXufaReplyWithCode<Code extends number> = XufaReply<RouteGenericInterface, RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, ContextConfigDefault, XufaSchema, XufaTypeProviderDefault, ResolveReplyTypeWithRouteGeneric<RouteGenericInterface['Reply'], Code, XufaSchema, XufaTypeProviderDefault>>

const getHandler: RouteHandlerMethod = function (_request, reply) {
  expectTypeOf(reply.raw).toEqualTypeOf<RawReplyDefaultExpression>();
  expectTypeOf(reply.log).toEqualTypeOf<XufaBaseLogger>();
  expectTypeOf(reply.request).toEqualTypeOf<XufaRequest<RouteGenericInterface, RawServerDefault, RawRequestDefaultExpression>>();
  expectTypeOf(reply.code).toEqualTypeOf<<Code extends number>(statusCode: Code) => DefaultXufaReplyWithCode<Code>>();
  expectTypeOf(reply.status).toEqualTypeOf<<Code extends number>(statusCode: Code) => DefaultXufaReplyWithCode<Code>>();
  expectTypeOf(reply.code(100 as number).send).toEqualTypeOf<(...args: [payload?: unknown]) => XufaReply>();
  expectTypeOf(reply.elapsedTime).toEqualTypeOf<number>();
  expectTypeOf(reply.statusCode).toEqualTypeOf<number>();
  expectTypeOf(reply.sent).toEqualTypeOf<boolean>();
  expectTypeOf(reply.writeEarlyHints).toEqualTypeOf<(hints: Record<string, string | string[]>, callback?: (() => void) | undefined) => void>();
  expectTypeOf(reply.send).toEqualTypeOf<((...args: [payload?: unknown]) => XufaReply)>();
  expectTypeOf(reply.header).toMatchTypeOf<(key: string, value: any) => XufaReply>();
  expectTypeOf(reply.headers).toMatchTypeOf<(values: { [key: string]: any }) => XufaReply>();
  expectTypeOf(reply.getHeader).toMatchTypeOf<(key: string) => number | string | string[] | undefined>();
  expectTypeOf(reply.getHeaders).toMatchTypeOf<() => { [key: string]: number | string | string[] | undefined }>();
  expectTypeOf(reply.removeHeader).toMatchTypeOf<(key: string) => XufaReply>();
  expectTypeOf(reply.hasHeader).toMatchTypeOf<(key: string) => boolean>();
  expectTypeOf(reply.redirect).toEqualTypeOf<(url: string, statusCode?: number) => XufaReply>();
  expectTypeOf(reply.hijack).toEqualTypeOf<() => XufaReply>();
  expectTypeOf(reply.callNotFound).toEqualTypeOf<() => void>();
  expectTypeOf(reply.type).toEqualTypeOf<(contentType: string) => XufaReply>();
  expectTypeOf(reply.serializer).toEqualTypeOf<(fn: (payload: any) => string) => XufaReply>();
  expectTypeOf(reply.serialize).toEqualTypeOf<(payload: any) => string | ArrayBuffer | Buffer>();
  expectTypeOf(reply.then).toEqualTypeOf<(fulfilled: () => void, rejected: (err: Error) => void) => void>();
  expectTypeOf(reply.trailer).toEqualTypeOf<(
      key: string,
      fn: ((reply: XufaReply, payload: string | Buffer | null) => Promise<string>) |
      ((reply: XufaReply, payload: string | Buffer | null,
        done: (err: Error | null, value?: string) => void) => void)
    ) => XufaReply>();
  expectTypeOf(reply.hasTrailer).toEqualTypeOf<(key: string) => boolean>();
  expectTypeOf(reply.removeTrailer).toEqualTypeOf<(key: string) => XufaReply>();
  expectTypeOf(reply.server).toEqualTypeOf<XufaInstance>();
  expectTypeOf(reply.getSerializationFunction).toMatchTypeOf<((httpStatus: string) => DefaultSerializationFunction | undefined)>();
  expectTypeOf(reply.getSerializationFunction).toMatchTypeOf<((schema: { [key: string]: unknown }) => DefaultSerializationFunction | undefined)>();
  expectTypeOf(reply.compileSerializationSchema).toMatchTypeOf<((schema: { [key: string]: unknown }, httpStatus?: string) => DefaultSerializationFunction)>();
  expectTypeOf(reply.serializeInput).toMatchTypeOf<((input: { [key: string]: unknown }, schema: { [key: string]: unknown }, httpStatus?: string) => unknown)>();
  expectTypeOf(reply.serializeInput).toMatchTypeOf<((input: { [key: string]: unknown }, httpStatus: string) => unknown)>();
  expectTypeOf(reply.routeOptions.config).toEqualTypeOf<ContextConfigDefault & XufaRouteConfig & XufaContextConfig>();
  expectTypeOf(reply.getDecorator<string>('foo')).toEqualTypeOf<string>();
}

interface ReplyPayload {
  Reply: {
    test: boolean;
  };
}

interface ReplyArrayPayload {
  Reply: string[]
}

interface ReplyUnion {
  Reply: {
    success: boolean;
  } | {
    error: string;
  }
}

interface ReplyHttpCodes {
  Reply: {
    '1xx': number,
    200: 'abc',
    201: boolean,
    300: { foo: string },
  }
}

interface InvalidReplyHttpCodes {
  Reply: {
    '1xx': number,
    200: string,
    999: boolean,
  }
}

interface ReplyVoid {
  Reply: void;
}

interface ReplyUndefined {
  Reply: undefined;
}

// Issue #5534 scenario: 204 No Content should allow empty send(), 201 Created should require payload
// Note: `204: undefined` gets converted to `unknown` via UndefinedToUnknown in type-provider.d.ts,
// meaning send() is optional but send({}) is also allowed. Use `void` instead of `undefined`
// if you want stricter "no payload allowed" semantics.
interface ReplyHttpCodesWithNoContent {
  Reply: {
    201: { id: string };
    204: undefined;
  }
}

const typedHandler: RouteHandler<ReplyPayload> = async (request, reply) => {
  // When Reply type is specified, send() requires a payload argument
  expectTypeOf(reply.send).toEqualTypeOf<((...args: [payload: ReplyPayload['Reply']]) => XufaReply<ReplyPayload, RawServerDefault, RawRequestDefaultExpression<RawServerDefault>, RawReplyDefaultExpression<RawServerDefault>>)>();
  expectTypeOf(reply.code(100).send).toEqualTypeOf<((...args: [payload: ReplyPayload['Reply']]) => XufaReply<ReplyPayload, RawServerDefault, RawRequestDefaultExpression<RawServerDefault>, RawReplyDefaultExpression<RawServerDefault>>)>();
}

const server = xufa()
server.get('/get', getHandler)
server.get('/typed', typedHandler)
server.get<ReplyPayload>('/get-generic-send', async function handler (request, reply) {
  reply.send({ test: true })
})
// When Reply type is specified, send() requires a payload - calling without arguments should error
server.get<ReplyPayload>('/get-generic-send-missing-payload', async function handler (request, reply) {
  reply
  // @ts-expect-error  Expected 1 arguments, but got 0.
    .send()
})
server.get<ReplyPayload>('/get-generic-return', async function handler (request, reply) {
  return { test: false }
})
server.get<ReplyPayload>('/get-generic-send-error', async function handler (request, reply) {
  reply.send({
    // @ts-expect-error  'foo' does not exist in type '{ test: boolean; }'.
    foo: 'bar'
  })
})
// @ts-expect-error  No overload matches this call.
server.get<ReplyPayload>('/get-generic-return-error', async function handler (request, reply) {
  return { foo: 'bar' }
})
server.get<ReplyUnion>('/get-generic-union-send', async function handler (request, reply) {
  if (0 as number === 0) {
    reply.send({ success: true })
  } else {
    reply.send({ error: 'error' })
  }
})
server.get<ReplyUnion>('/get-generic-union-return', async function handler (request, reply) {
  if (0 as number === 0) {
    return { success: true }
  } else {
    return { error: 'error' }
  }
})
server.get<ReplyUnion>('/get-generic-union-send-error-1', async function handler (request, reply) {
  reply.send({
    // @ts-expect-error  'successes' does not exist in type '{ success: boolean; } | { error: string; }'.
    successes: true
  })
})
server.get<ReplyUnion>('/get-generic-union-send-error-2', async function handler (request, reply) {
  reply.send({
    // @ts-expect-error  Type 'number' is not assignable to type 'string'.
    error: 500
  })
})
// @ts-expect-error  No overload matches this call.
server.get<ReplyUnion>('/get-generic-union-return-error-1', async function handler (request, reply) {
  return { successes: true }
})
// @ts-expect-error  No overload matches this call.
server.get<ReplyUnion>('/get-generic-union-return-error-2', async function handler (request, reply) {
  return { error: 500 }
})
server.get<ReplyHttpCodes>('/get-generic-http-codes-send', async function handler (request, reply) {
  reply.code(200).send('abc')
  reply.code(201).send(true)
  reply.code(300).send({ foo: 'bar' })
  reply.code(101).send(123)
})
server.get<ReplyHttpCodes>('/get-generic-http-codes-send-error-1', async function handler (request, reply) {
  reply.code(200)
  // @ts-expect-error  Argument of type '"def"' is not assignable to parameter of type '"abc"'.
    .send('def')
})
server.get<ReplyHttpCodes>('/get-generic-http-codes-send-error-2', async function handler (request, reply) {
  reply.code(201)
  // @ts-expect-error  Argument of type 'number' is not assignable to parameter of type 'boolean'.
    .send(0)
})
server.get<ReplyHttpCodes>('/get-generic-http-codes-send-error-3', async function handler (request, reply) {
  reply.code(300).send({
    // @ts-expect-error  Type 'number' is not assignable to type 'string'.
    foo: 123
  })
})
server.get<ReplyHttpCodes>('/get-generic-http-codes-send-error-4', async function handler (request, reply) {
  reply.code(100)
  // @ts-expect-error  Argument of type 'string' is not assignable to parameter of type 'number'.
    .send('asdasd')
})
server.get<ReplyHttpCodes>('/get-generic-http-codes-send-error-5', async function handler (request, reply) {
  reply
  // @ts-expect-error  Argument of type '401' is not assignable to parameter of type '100 | 101 | 102 | ... | 300'.
    .code(401).send({
    // @ts-expect-error  Type 'number' is not assignable to type 'string'.
      foo: 123
    })
})
server.get<ReplyArrayPayload>('/get-generic-array-send', async function handler (request, reply) {
  reply.code(200).send([''])
})
server.get<InvalidReplyHttpCodes>('get-invalid-http-codes-reply-error', async function handler (request, reply) {
  reply.code(200)
  // @ts-expect-error  Argument of type 'string' is not assignable to parameter of type '{ '1xx': number; 200: string; 999: boolean; }'.
    .send('')
})
server.get<InvalidReplyHttpCodes>('get-invalid-http-codes-reply-error', async function handler (request, reply) {
  reply.code(200).send({
    '1xx': 0,
    200: '',
    999: false
  })
})

const httpHeaderHandler: RouteHandlerMethod = function (_request, reply) {
  // accept is a header provided by @types/node
  reply.getHeader('accept')
  expectTypeOf(reply.getHeaders()).toHaveProperty('accept');
  reply.hasHeader('accept')
  reply.header('accept', 'test')
  reply.headers({ accept: 'test' })
  reply.removeHeader('accept')

  // x-xufa-test is not a header provided by @types/node
  // and should not result in a typing error
  reply.getHeader('x-xufa-test')
  expectTypeOf(reply.getHeaders()).toHaveProperty('x-xufa-test');
  reply.hasHeader('x-xufa-test')
  reply.header('x-xufa-test', 'test')
  reply.headers({ 'x-xufa-test': 'test' })
  reply.removeHeader('x-xufa-test')
}

// Test: send() without arguments is valid when no Reply type is specified (default unknown)
server.get('/get-no-type-send-empty', async function handler (request, reply) {
  reply.send()
})

// Test: send() without arguments is valid when Reply type is void
server.get<ReplyVoid>('/get-void-send-empty', async function handler (request, reply) {
  reply.send()
})

// Test: send() without arguments is valid when Reply type is undefined
server.get<ReplyUndefined>('/get-undefined-send-empty', async function handler (request, reply) {
  reply.send()
})

// Issue #5534 scenario: HTTP status codes with 204 No Content
server.get<ReplyHttpCodesWithNoContent>('/get-http-codes-no-content', async function handler (request, reply) {
  // 204 No Content - send() without payload is valid because Reply is undefined
  reply.code(204).send()
  // 201 Created - send() requires payload
  reply.code(201).send({ id: '123' })
})
// 201 Created without payload should error
server.get<ReplyHttpCodesWithNoContent>('/get-http-codes-201-missing-payload', async function handler (request, reply) {
  reply.code(201)
  // @ts-expect-error  Expected 1 arguments, but got 0.
    .send()
})
