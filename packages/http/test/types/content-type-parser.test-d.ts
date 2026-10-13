// Ported from fastify (test/types/content-type-parser.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { IncomingMessage } from 'node:http'
import { expectTypeOf } from '@xufa/test';
import xufa, { XufaBodyParser } from '../..'
import { XufaRequest } from '../../types/request.js'

expectTypeOf(xufa().addContentTypeParser('contentType', function (request, payload, done) {
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(payload).toEqualTypeOf<IncomingMessage>();
  done(null)
})).toEqualTypeOf<void>();

// Body limit options

expectTypeOf(xufa().addContentTypeParser('contentType', { bodyLimit: 99 }, function (request, payload, done) {
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(payload).toEqualTypeOf<IncomingMessage>();
  done(null)
})).toEqualTypeOf<void>();

// Array for contentType

expectTypeOf(xufa().addContentTypeParser(['contentType'], function (request, payload, done) {
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(payload).toEqualTypeOf<IncomingMessage>();
  done(null)
})).toEqualTypeOf<void>();

// Body Parser - the generic after addContentTypeParser enforces the type of the `body` parameter as well as the value of the `parseAs` property

expectTypeOf(xufa().addContentTypeParser<string>('bodyContentType', { parseAs: 'string' }, function (request, body, done) {
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(body).toEqualTypeOf<string>();
  done(null)
})).toEqualTypeOf<void>();

expectTypeOf(xufa().addContentTypeParser<Buffer>('bodyContentType', { parseAs: 'buffer' }, function (request, body, done) {
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(body).toEqualTypeOf<Buffer>();
  done(null)
})).toEqualTypeOf<void>();

expectTypeOf(xufa().addContentTypeParser('contentType', async function (request: XufaRequest, payload: IncomingMessage) {
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(payload).toEqualTypeOf<IncomingMessage>();
  return null
})).toEqualTypeOf<void>();

expectTypeOf(xufa().addContentTypeParser<string>('bodyContentType', { parseAs: 'string' }, async function (request: XufaRequest, body: string) {
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(body).toEqualTypeOf<string>();
  return null
})).toEqualTypeOf<void>();

expectTypeOf(xufa().addContentTypeParser<Buffer>('bodyContentType', { parseAs: 'buffer' }, async function (request: XufaRequest, body: Buffer) {
  expectTypeOf(request).toEqualTypeOf<XufaRequest>();
  expectTypeOf(body).toEqualTypeOf<Buffer>();
  return null
})).toEqualTypeOf<void>();

expectTypeOf(xufa().getDefaultJsonParser('error', 'ignore')).toEqualTypeOf<XufaBodyParser<string>>();
// @ts-expect-error
(xufa().getDefaultJsonParser)('error', 'skip');
// @ts-expect-error
(xufa().getDefaultJsonParser)('nothing', 'ignore');

expectTypeOf(xufa().removeAllContentTypeParsers()).toEqualTypeOf<void>();
// @ts-expect-error
(xufa().removeAllContentTypeParsers)('contentType');

expectTypeOf(xufa().removeContentTypeParser('contentType')).toEqualTypeOf<void>();
expectTypeOf(xufa().removeContentTypeParser(/contentType+.*/)).toEqualTypeOf<void>();
expectTypeOf(xufa().removeContentTypeParser(['contentType', /contentType+.*/])).toEqualTypeOf<void>();
// @ts-expect-error
(xufa().removeContentTypeParser)({});
