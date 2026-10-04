// Ported from fastify (test/types/content-type-parser.tst.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { IncomingMessage } from 'node:http'
import { expect } from 'tstyche'
import xufa, { XufaBodyParser } from '../..'
import { XufaRequest } from '../../types/request.js'

expect(xufa().addContentTypeParser('contentType', function (request, payload, done) {
  expect(request).type.toBe<XufaRequest>()
  expect(payload).type.toBe<IncomingMessage>()
  done(null)
})).type.toBe<void>()

// Body limit options

expect(xufa().addContentTypeParser('contentType', { bodyLimit: 99 }, function (request, payload, done) {
  expect(request).type.toBe<XufaRequest>()
  expect(payload).type.toBe<IncomingMessage>()
  done(null)
})).type.toBe<void>()

// Array for contentType

expect(xufa().addContentTypeParser(['contentType'], function (request, payload, done) {
  expect(request).type.toBe<XufaRequest>()
  expect(payload).type.toBe<IncomingMessage>()
  done(null)
})).type.toBe<void>()

// Body Parser - the generic after addContentTypeParser enforces the type of the `body` parameter as well as the value of the `parseAs` property

expect(xufa().addContentTypeParser<string>('bodyContentType', { parseAs: 'string' }, function (request, body, done) {
  expect(request).type.toBe<XufaRequest>()
  expect(body).type.toBe<string>()
  done(null)
})).type.toBe<void>()

expect(xufa().addContentTypeParser<Buffer>('bodyContentType', { parseAs: 'buffer' }, function (request, body, done) {
  expect(request).type.toBe<XufaRequest>()
  expect(body).type.toBe<Buffer>()
  done(null)
})).type.toBe<void>()

expect(xufa().addContentTypeParser('contentType', async function (request: XufaRequest, payload: IncomingMessage) {
  expect(request).type.toBe<XufaRequest>()
  expect(payload).type.toBe<IncomingMessage>()
  return null
})).type.toBe<void>()

expect(xufa().addContentTypeParser<string>('bodyContentType', { parseAs: 'string' }, async function (request: XufaRequest, body: string) {
  expect(request).type.toBe<XufaRequest>()
  expect(body).type.toBe<string>()
  return null
})).type.toBe<void>()

expect(xufa().addContentTypeParser<Buffer>('bodyContentType', { parseAs: 'buffer' }, async function (request: XufaRequest, body: Buffer) {
  expect(request).type.toBe<XufaRequest>()
  expect(body).type.toBe<Buffer>()
  return null
})).type.toBe<void>()

expect(xufa().getDefaultJsonParser('error', 'ignore')).type.toBe<XufaBodyParser<string>>()
expect(xufa().getDefaultJsonParser).type.not.toBeCallableWith('error', 'skip')
expect(xufa().getDefaultJsonParser).type.not.toBeCallableWith('nothing', 'ignore')

expect(xufa().removeAllContentTypeParsers()).type.toBe<void>()
expect(xufa().removeAllContentTypeParsers).type.not.toBeCallableWith('contentType')

expect(xufa().removeContentTypeParser('contentType')).type.toBe<void>()
expect(xufa().removeContentTypeParser(/contentType+.*/)).type.toBe<void>()
expect(xufa().removeContentTypeParser(['contentType', /contentType+.*/])).type.toBe<void>()
expect(xufa().removeContentTypeParser).type.not.toBeCallableWith({})
