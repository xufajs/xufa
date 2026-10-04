'use strict'

const stream = require('node:stream')


const split = require('split2')

const Fastify = require('@xufa/http')
const helper = require('../helper')
const { on } = stream
const { request } = require('./logger-test-utils')
const { partialDeepStrictEqual } = require('../helper')

describe('request', () => {
let localhost

beforeAll(async function () {
    [localhost] = await helper.getLoopbackHost()
  })
test('The request id header key can be customized', async () => {
    const lines = ['incoming request', 'some log message', 'request completed']
    expect.assertions(lines.length * 2 + 2)
    const REQUEST_ID = '42'

    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: { stream, level: 'info' },
      requestIdHeader: 'my-custom-request-id'
    })
    onTestFinished(() => fastify.close())

    fastify.get('/', (req, reply) => {
      expect(req.id).toBe(REQUEST_ID)
      req.log.info('some log message')
      reply.send({ id: req.id })
    })

    const response = await fastify.inject({ method: 'GET', url: '/', headers: { 'my-custom-request-id': REQUEST_ID } })
    const body = await response.json()
    expect(body.id).toBe(REQUEST_ID)

    for await (const [line] of on(stream, 'data')) {
      expect(line.reqId).toBe(REQUEST_ID)
      expect(line.msg).toBe(lines.shift())
      if (lines.length === 0) break
    }
  })
test('The request id header key can be ignored', async () => {
    const lines = ['incoming request', 'some log message', 'request completed']
    expect.assertions(lines.length * 2 + 2)
    const REQUEST_ID = 'ignore-me'

    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: { stream, level: 'info' },
      requestIdHeader: false
    })
    onTestFinished(() => fastify.close())

    fastify.get('/', (req, reply) => {
      expect(req.id).toBe('req-1')
      req.log.info('some log message')
      reply.send({ id: req.id })
    })
    const response = await fastify.inject({ method: 'GET', url: '/', headers: { 'request-id': REQUEST_ID } })
    const body = await response.json()
    expect(body.id).toBe('req-1')

    for await (const [line] of on(stream, 'data')) {
      expect(line.reqId).toBe('req-1')
      expect(line.msg).toBe(lines.shift())
      if (lines.length === 0) break
    }
  })
test('The request id header key can be customized along with a custom id generator', async () => {
    const REQUEST_ID = '42'
    const matches = [
      { reqId: REQUEST_ID, msg: 'incoming request' },
      { reqId: REQUEST_ID, msg: 'some log message' },
      { reqId: REQUEST_ID, msg: 'request completed' },
      { reqId: 'foo', msg: 'incoming request' },
      { reqId: 'foo', msg: 'some log message 2' },
      { reqId: 'foo', msg: 'request completed' }
    ]
    expect.assertions(matches.length + 4)

    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: { stream, level: 'info' },
      requestIdHeader: 'my-custom-request-id',
      genReqId (req) {
        return 'foo'
      }
    })
    onTestFinished(() => fastify.close())

    fastify.get('/one', (req, reply) => {
      expect(req.id).toBe(REQUEST_ID)
      req.log.info('some log message')
      reply.send({ id: req.id })
    })

    fastify.get('/two', (req, reply) => {
      expect(req.id).toBe('foo')
      req.log.info('some log message 2')
      reply.send({ id: req.id })
    })

    {
      const response = await fastify.inject({ method: 'GET', url: '/one', headers: { 'my-custom-request-id': REQUEST_ID } })
      const body = await response.json()
      expect(body.id).toBe(REQUEST_ID)
    }

    {
      const response = await fastify.inject({ method: 'GET', url: '/two' })
      const body = await response.json()
      expect(body.id).toBe('foo')
    }

    for await (const [line] of on(stream, 'data')) {
      expect(partialDeepStrictEqual(line, matches.shift())).toBeTruthy()
      if (matches.length === 0) break
    }
  })
test('The request id header key can be ignored along with a custom id generator', async () => {
    const REQUEST_ID = 'ignore-me'
    const matches = [
      { reqId: 'foo', msg: 'incoming request' },
      { reqId: 'foo', msg: 'some log message' },
      { reqId: 'foo', msg: 'request completed' },
      { reqId: 'foo', msg: 'incoming request' },
      { reqId: 'foo', msg: 'some log message 2' },
      { reqId: 'foo', msg: 'request completed' }
    ]
    expect.assertions(matches.length + 4)

    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: { stream, level: 'info' },
      requestIdHeader: false,
      genReqId (req) {
        return 'foo'
      }
    })
    onTestFinished(() => fastify.close())

    fastify.get('/one', (req, reply) => {
      expect(req.id).toBe('foo')
      req.log.info('some log message')
      reply.send({ id: req.id })
    })

    fastify.get('/two', (req, reply) => {
      expect(req.id).toBe('foo')
      req.log.info('some log message 2')
      reply.send({ id: req.id })
    })

    {
      const response = await fastify.inject({ method: 'GET', url: '/one', headers: { 'request-id': REQUEST_ID } })
      const body = await response.json()
      expect(body.id).toBe('foo')
    }

    {
      const response = await fastify.inject({ method: 'GET', url: '/two' })
      const body = await response.json()
      expect(body.id).toBe('foo')
    }

    for await (const [line] of on(stream, 'data')) {
      expect(partialDeepStrictEqual(line, matches.shift())).toBeTruthy()
      if (matches.length === 0) break
    }
  })
test('should redact the authorization header if so specified', async () => {
    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: {
        stream,
        redact: ['req.headers.authorization'],
        level: 'info',
        serializers: {
          req (req) {
            return {
              method: req.method,
              url: req.url,
              headers: req.headers,
              hostname: req.hostname,
              remoteAddress: req.ip,
              remotePort: req.socket.remotePort
            }
          }
        }
      }
    })
    onTestFinished(() => fastify.close())

    fastify.get('/', function (req, reply) {
      expect(req.headers.authorization).toEqual('Bearer abcde')
      reply.send({ hello: 'world' })
    })

    await fastify.ready()
    const server = await fastify.listen({ port: 0, host: localhost })

    const lines = [
      { msg: `Server listening at ${server}` },
      { req: { headers: { authorization: '[Redacted]' } }, msg: 'incoming request' },
      { res: { statusCode: 200 }, msg: 'request completed' }
    ]
    expect.assertions(lines.length + 3)

    await request({
      method: 'GET',
      path: '/',
      host: localhost,
      port: fastify.server.address().port,
      headers: {
        authorization: 'Bearer abcde'
      }
    }, function (response, body) {
      expect(response.statusCode).toBe(200)
      expect(body).toEqual(JSON.stringify({ hello: 'world' }))
    })

    for await (const [line] of on(stream, 'data')) {
      expect(partialDeepStrictEqual(line, lines.shift())).toBeTruthy()
      if (lines.length === 0) break
    }
  })
test('should not throw error when serializing custom req', async () => {
    expect.assertions(1)

    const lines = []
    const dest = new stream.Writable({
      write: function (chunk, enc, cb) {
        lines.push(JSON.parse(chunk))
        cb()
      }
    })
    const fastify = Fastify({ logger: { level: 'info', stream: dest } })
    onTestFinished(() => fastify.close())

    fastify.log.info({ req: {} })

    expect(lines[0].req).toEqual({})
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
})
