// Ported from light-my-request (types/index.test-d.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import * as http from 'node:http'
import { inject, isInjection, Response, DispatchFunc, InjectOptions, Chain } from '../..'
import { assertType, expectTypeOf } from '@xufa/test';
import { Readable } from 'node:stream'

assertType<InjectOptions>({ url: '/' });
assertType<InjectOptions>({ autoStart: true });
assertType<InjectOptions>({ autoStart: false });
assertType<InjectOptions>({ validate: true });
assertType<InjectOptions>({ validate: false });

const dispatch: http.RequestListener = function (req, res) {
  assertType<http.IncomingMessage>(req);
  assertType<http.ServerResponse>(res);
  expectTypeOf(isInjection(req)).toEqualTypeOf<boolean>();
  expectTypeOf(isInjection(res)).toEqualTypeOf<boolean>();

  const reply = 'Hello World'
  res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': reply.length })
  res.end(reply)
}

const expectResponse = function (res: Response | undefined) {
  if (!res) {
    return
  }
  expectTypeOf(res).toEqualTypeOf<Response>();
  console.log(res.payload)
  assertType<Function>(res.json);
  assertType<Function>(res.stream);
  assertType<http.ServerResponse>(res.raw.res);
  assertType<http.IncomingMessage>(res.raw.req);
  expectTypeOf(res.stream()).toEqualTypeOf<Readable>();
  expectTypeOf(res.payload).toEqualTypeOf<string>();
  expectTypeOf(res.body).toEqualTypeOf<string>();
  assertType<Array<any>>(res.cookies);
  const cookie = res.cookies[0]
  expectTypeOf(cookie.name).toEqualTypeOf<string>();
  expectTypeOf(cookie.value).toEqualTypeOf<string>();
  expectTypeOf(cookie.expires).toEqualTypeOf<Date | undefined>();
  expectTypeOf(cookie.maxAge).toEqualTypeOf<number | undefined>();
  expectTypeOf(cookie.httpOnly).toEqualTypeOf<boolean | undefined>();
  expectTypeOf(cookie.secure).toEqualTypeOf<boolean | undefined>();
  expectTypeOf(cookie.sameSite).toEqualTypeOf<string | undefined>();
  expectTypeOf(cookie.additional).toEqualTypeOf<unknown | undefined>();
}

expectTypeOf(dispatch).toEqualTypeOf<DispatchFunc>();

inject(dispatch, { method: 'get', url: '/' }, (err, res) => {
  expectTypeOf(err).toEqualTypeOf<Error | undefined>();
  expectResponse(res)
})

const url = {
  protocol: 'http',
  hostname: 'example.com',
  port: '8080',
  pathname: 'hello',
  query: {
    test: '1234'
  }
}
inject(dispatch, { method: 'get', url }, (err, res) => {
  expectTypeOf(err).toEqualTypeOf<Error | undefined>();
  expectResponse(res)
})

inject(dispatch, { method: 'get', url: '/', cookies: { name1: 'value1', value2: 'value2' } }, (err, res) => {
  expectTypeOf(err).toEqualTypeOf<Error | undefined>();
  expectResponse(res)
})

inject(dispatch, { method: 'get', url: '/', query: { name1: 'value1', value2: 'value2' } }, (err, res) => {
  expectTypeOf(err).toEqualTypeOf<Error | undefined>();
  expectResponse(res)
})

inject(dispatch, { method: 'get', url: '/', query: { name1: ['value1', 'value2'] } }, (err, res) => {
  expectTypeOf(err).toEqualTypeOf<Error | undefined>();
  expectResponse(res)
})

inject(dispatch, { method: 'get', url: '/', query: 'name1=value1' }, (err, res) => {
  expectTypeOf(err).toEqualTypeOf<Error | undefined>();
  expectResponse(res)
})

inject(dispatch, { method: 'post', url: '/', payload: { name1: 'value1', value2: 'value2' } }, (err, res) => {
  expectTypeOf(err).toEqualTypeOf<Error | undefined>();
  expectResponse(res)
})

inject(dispatch, { method: 'post', url: '/', body: { name1: 'value1', value2: 'value2' } }, (err, res) => {
  expectTypeOf(err).toEqualTypeOf<Error | undefined>();
  expectResponse(res)
})

expectTypeOf(inject(dispatch)
    .get('/')
    .end((err, res) => {
      expectTypeOf(err).toEqualTypeOf<Error | undefined>();
      expectTypeOf(res).toEqualTypeOf<Response | undefined>();
      console.log(res?.payload)
    })).toEqualTypeOf<void>();

inject(dispatch)
  .get('/')
  .then((value) => {
    expectTypeOf(value).toEqualTypeOf<Response>();
  })

expectTypeOf(inject(dispatch)).toEqualTypeOf<Chain>();
expectTypeOf(inject(dispatch).end()).toEqualTypeOf<Promise<Response>>();
expectTypeOf(inject(dispatch, { method: 'get', url: '/' })).toEqualTypeOf<Chain>();
// @ts-ignore tsd supports top-level await, but normal ts does not so ignore
expectTypeOf(await inject(dispatch, { method: 'get', url: '/' })).toEqualTypeOf<Response>();

type ParsedValue = { field: string }
// @ts-ignore tsd supports top-level await, but normal ts does not so ignore
const response: Response = await inject(dispatch)
const parsedValue: ParsedValue = response.json()
expectTypeOf(parsedValue).toEqualTypeOf<ParsedValue>();

const parsedValueUsingGeneric = response.json<ParsedValue>()
expectTypeOf(parsedValueUsingGeneric).toEqualTypeOf<ParsedValue>();

// @ts-expect-error
assertType<http.ServerResponse>(response);

const httpDispatch = function (req: http.IncomingMessage, res: http.ServerResponse) {
  expectTypeOf(isInjection(req)).toEqualTypeOf<boolean>();
  expectTypeOf(isInjection(res)).toEqualTypeOf<boolean>();

  const reply = 'Hello World'
  res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': reply.length })
  res.end(reply)
}

inject(httpDispatch, { method: 'get', url: '/' }, (err, res) => {
  expectTypeOf(err).toEqualTypeOf<Error | undefined>();
  expectResponse(res)
})

inject(httpDispatch, { method: 'get', url: '/', payloadAsStream: true }, (err, res) => {
  expectTypeOf(err).toEqualTypeOf<Error | undefined>();
  expectResponse(res)
})
