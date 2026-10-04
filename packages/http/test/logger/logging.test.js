'use strict'

const stream = require('node:stream')


const split = require('split2')
const pino = require('@xufa/logger')

const Fastify = require('@xufa/http')
const { LogController } = require('../../lib/logger')
const helper = require('../helper')
const { on } = stream
const { request } = require('./logger-test-utils')
const { partialDeepStrictEqual } = require('../helper')

describe('logging', () => {
let localhost
let localhostForURL

beforeAll(async function () {
    [localhost, localhostForURL] = await helper.getLoopbackHost()
  })
test('The default 404 handler logs the incoming request', async () => {
    const lines = ['incoming request', 'Route GET:/not-found not found', 'request completed']
    expect.assertions(lines.length + 1)

    const stream = split(JSON.parse)

    const loggerInstance = pino({ level: 'trace' }, stream)

    const fastify = Fastify({
      loggerInstance
    })
    onTestFinished(() => fastify.close())

    await fastify.ready()

    {
      const response = await fastify.inject({ method: 'GET', url: '/not-found' })
      expect(response.statusCode).toBe(404)
    }

    for await (const [line] of on(stream, 'data')) {
      expect(line.msg).toBe(lines.shift())
      if (lines.length === 0) break
    }
  })
test('should not rely on raw request to log errors', async () => {
    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: {
        stream,
        level: 'info'
      }
    })
    onTestFinished(() => fastify.close())
    fastify.get('/error', function (req, reply) {
      expect(req.log).toBeTruthy()
      reply.status(415).send(new Error('something happened'))
    })

    await fastify.ready()
    const server = await fastify.listen({ port: 0, host: localhost })
    const lines = [
      { msg: `Server listening at ${server}` },
      { level: 30, msg: 'incoming request' },
      { res: { statusCode: 415 }, msg: 'something happened' },
      { res: { statusCode: 415 }, msg: 'request completed' }
    ]
    expect.assertions(lines.length + 1)

    await request(`http://${localhostForURL}:` + fastify.server.address().port + '/error')

    for await (const [line] of on(stream, 'data')) {
      expect(partialDeepStrictEqual(line, lines.shift())).toBeTruthy()
      if (lines.length === 0) break
    }
  })
test('should not log if logController option disables logging', async () => {
    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: {
        stream,
        level: 'info'
      },
      logController: new class extends LogController {
        isLogDisabled () {
          expect(true).toBeTruthy()
          return true // disable logging to test that incomingRequest is not called
        }
      }()
    })
    onTestFinished(() => fastify.close())

    fastify.get('/info', function (req, reply) {
      reply.send({ hello: 'world' })
    })

    await fastify.ready()
    const server = await fastify.listen({ port: 0, host: localhost })
    const lines = [
      { msg: `Server listening at ${server}` }
    ]
    // 2:
    // - incoming request
    // - request completed
    expect.assertions(lines.length + 2)

    await request(`http://${localhostForURL}:` + fastify.server.address().port + '/info')

    for await (const [line] of on(stream, 'data')) {
      expect(partialDeepStrictEqual(line, lines.shift())).toBeTruthy()
      if (lines.length === 0) break
    }
  })
test('should log the error if no error handler is defined', async () => {
    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: {
        stream,
        level: 'info'
      }
    })
    onTestFinished(() => fastify.close())

    fastify.get('/error', function (req, reply) {
      expect(req.log).toBeTruthy()
      reply.send(new Error('a generic error'))
    })

    await fastify.ready()
    const server = await fastify.listen({ port: 0, host: localhost })
    const lines = [
      { msg: `Server listening at ${server}` },
      { msg: 'incoming request' },
      { level: 50, msg: 'a generic error' },
      { res: { statusCode: 500 }, msg: 'request completed' }
    ]
    expect.assertions(lines.length + 1)

    await request(`http://${localhostForURL}:` + fastify.server.address().port + '/error')

    for await (const [line] of on(stream, 'data')) {
      expect(partialDeepStrictEqual(line, lines.shift())).toBeTruthy()
      if (lines.length === 0) break
    }
  })
test('should log as info if error status code >= 400 and < 500 if no error handler is defined', async () => {
    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: {
        stream,
        level: 'info'
      }
    })
    onTestFinished(() => fastify.close())

    fastify.get('/400', function (req, reply) {
      expect(req.log).toBeTruthy()
      reply.send(Object.assign(new Error('a 400 error'), { statusCode: 400 }))
    })
    fastify.get('/503', function (req, reply) {
      expect(req.log).toBeTruthy()
      reply.send(Object.assign(new Error('a 503 error'), { statusCode: 503 }))
    })

    await fastify.ready()
    const server = await fastify.listen({ port: 0, host: localhost })
    const lines = [
      { msg: `Server listening at ${server}` },
      { msg: 'incoming request' },
      { level: 30, msg: 'a 400 error' },
      { res: { statusCode: 400 }, msg: 'request completed' }
    ]
    expect.assertions(lines.length + 1)

    await request(`http://${localhostForURL}:` + fastify.server.address().port + '/400')

    for await (const [line] of on(stream, 'data')) {
      expect(partialDeepStrictEqual(line, lines.shift())).toBeTruthy()
      if (lines.length === 0) break
    }
  })
test('should log as error if error status code >= 500 if no error handler is defined', async () => {
    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: {
        stream,
        level: 'info'
      }
    })
    onTestFinished(() => fastify.close())
    fastify.get('/503', function (req, reply) {
      expect(req.log).toBeTruthy()
      reply.send(Object.assign(new Error('a 503 error'), { statusCode: 503 }))
    })

    await fastify.ready()
    const server = await fastify.listen({ port: 0, host: localhost })
    const lines = [
      { msg: `Server listening at ${server}` },
      { msg: 'incoming request' },
      { level: 50, msg: 'a 503 error' },
      { res: { statusCode: 503 }, msg: 'request completed' }
    ]
    expect.assertions(lines.length + 1)

    await request(`http://${localhostForURL}:` + fastify.server.address().port + '/503')

    for await (const [line] of on(stream, 'data')) {
      expect(partialDeepStrictEqual(line, lines.shift())).toBeTruthy()
      if (lines.length === 0) break
    }
  })
test('should not log the error if error handler is defined and it does not error', async () => {
    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: {
        stream,
        level: 'info'
      }
    })
    onTestFinished(() => fastify.close())
    fastify.get('/error', function (req, reply) {
      expect(req.log).toBeTruthy()
      reply.send(new Error('something happened'))
    })
    fastify.setErrorHandler((err, req, reply) => {
      expect(err).toBeTruthy()
      reply.send('something bad happened')
    })

    await fastify.ready()
    const server = await fastify.listen({ port: 0, host: localhost })
    const lines = [
      { msg: `Server listening at ${server}` },
      { level: 30, msg: 'incoming request' },
      { res: { statusCode: 200 }, msg: 'request completed' }
    ]
    expect.assertions(lines.length + 2)

    await request(`http://${localhostForURL}:` + fastify.server.address().port + '/error')

    for await (const [line] of on(stream, 'data')) {
      expect(partialDeepStrictEqual(line, lines.shift())).toBeTruthy()
      if (lines.length === 0) break
    }
  })
test('reply.send logs an error if called twice in a row', async () => {
    const lines = [
      'incoming request',
      'request completed',
      'Reply was already sent, did you forget to "return reply" in "/" (GET)?',
      'Reply was already sent, did you forget to "return reply" in "/" (GET)?'
    ]
    expect.assertions(lines.length + 1)

    const stream = split(JSON.parse)
    const loggerInstance = pino(stream)

    const fastify = Fastify({
      loggerInstance
    })
    onTestFinished(() => fastify.close())

    fastify.get('/', (req, reply) => {
      reply.send({ hello: 'world' })
      reply.send({ hello: 'world2' })
      reply.send({ hello: 'world3' })
    })

    const response = await fastify.inject({ method: 'GET', url: '/' })
    const body = await response.json()
    expect(partialDeepStrictEqual(body, { hello: 'world' })).toBeTruthy()

    for await (const [line] of on(stream, 'data')) {
      expect(line.msg).toBe(lines.shift())
      if (lines.length === 0) break
    }
  })
test('defaults to info level', async () => {
    const lines = [
      { req: { method: 'GET' }, msg: 'incoming request' },
      { res: { statusCode: 200 }, msg: 'request completed' }
    ]
    expect.assertions(lines.length * 2 + 1)
    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: {
        stream
      }
    })
    onTestFinished(() => fastify.close())

    fastify.get('/', function (req, reply) {
      expect(req.log).toBeTruthy()
      reply.send({ hello: 'world' })
    })

    await fastify.ready()
    await fastify.listen({ port: 0 })

    await request(`http://${localhostForURL}:` + fastify.server.address().port)

    let id
    for await (const [line] of on(stream, 'data')) {
      // we skip the non-request log
      if (typeof line.reqId !== 'string') continue
      if (id === undefined && line.reqId) id = line.reqId
      if (id !== undefined && line.reqId) expect(line.reqId).toBe(id)
      expect(partialDeepStrictEqual(line, lines.shift())).toBeTruthy()
      if (lines.length === 0) break
    }
  })
test('test log stream', async () => {
    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: {
        stream,
        level: 'info'
      }
    })
    onTestFinished(() => fastify.close())

    fastify.get('/', function (req, reply) {
      expect(req.log).toBeTruthy()
      reply.send({ hello: 'world' })
    })

    await fastify.ready()
    const server = await fastify.listen({ port: 0, host: localhost })
    const lines = [
      { msg: `Server listening at ${server}` },
      { req: { method: 'GET' }, msg: 'incoming request' },
      { res: { statusCode: 200 }, msg: 'request completed' }
    ]
    expect.assertions(lines.length + 3)

    await request(`http://${localhostForURL}:` + fastify.server.address().port)

    let id
    for await (const [line] of on(stream, 'data')) {
      if (id === undefined && line.reqId) id = line.reqId
      if (id !== undefined && line.reqId) expect(line.reqId).toBe(id)
      expect(partialDeepStrictEqual(line, lines.shift())).toBeTruthy()
      if (lines.length === 0) break
    }
  })
test('test error log stream', async () => {
    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: {
        stream,
        level: 'info'
      }
    })
    onTestFinished(() => fastify.close())

    fastify.get('/error', function (req, reply) {
      expect(req.log).toBeTruthy()
      reply.send(new Error('kaboom'))
    })

    await fastify.ready()
    const server = await fastify.listen({ port: 0, host: localhost })
    const lines = [
      { msg: `Server listening at ${server}` },
      { req: { method: 'GET' }, msg: 'incoming request' },
      { res: { statusCode: 500 }, msg: 'kaboom' },
      { res: { statusCode: 500 }, msg: 'request completed' }
    ]
    expect.assertions(lines.length + 4)

    await request(`http://${localhostForURL}:` + fastify.server.address().port + '/error')

    let id
    for await (const [line] of on(stream, 'data')) {
      if (id === undefined && line.reqId) id = line.reqId
      if (id !== undefined && line.reqId) expect(line.reqId).toBe(id)
      expect(partialDeepStrictEqual(line, lines.shift())).toBeTruthy()
      if (lines.length === 0) break
    }
  })
})
