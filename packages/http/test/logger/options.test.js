'use strict'

const stream = require('node:stream')


const split = require('split2')
const pino = require('@xufa/logger')

const Fastify = require('../..')
const { on } = stream

describe('logger options', () => {

test('logger can be silenced', async () => {
    expect.assertions(17)
    const fastify = Fastify({
      logger: false
    })
    onTestFinished(() => fastify.close())
    expect(fastify.log).toBeTruthy()
    expect(typeof fastify.log).toEqual('object')
    expect(typeof fastify.log.fatal).toEqual('function')
    expect(typeof fastify.log.error).toEqual('function')
    expect(typeof fastify.log.warn).toEqual('function')
    expect(typeof fastify.log.info).toEqual('function')
    expect(typeof fastify.log.debug).toEqual('function')
    expect(typeof fastify.log.trace).toEqual('function')
    expect(typeof fastify.log.child).toEqual('function')

    const childLog = fastify.log.child()

    expect(typeof childLog).toEqual('object')
    expect(typeof childLog.fatal).toEqual('function')
    expect(typeof childLog.error).toEqual('function')
    expect(typeof childLog.warn).toEqual('function')
    expect(typeof childLog.info).toEqual('function')
    expect(typeof childLog.debug).toEqual('function')
    expect(typeof childLog.trace).toEqual('function')
    expect(typeof childLog.child).toEqual('function')
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('Should set a custom logLevel for a plugin', async () => {
    const lines = ['incoming request', 'Hello', 'request completed']
    expect.assertions(lines.length + 2)

    const stream = split(JSON.parse)

    const loggerInstance = pino({ level: 'error' }, stream)

    const fastify = Fastify({
      loggerInstance
    })
    onTestFinished(() => fastify.close())

    fastify.get('/', (req, reply) => {
      req.log.info('Not Exist') // we should not see this log
      reply.send({ hello: 'world' })
    })

    fastify.register(function (instance, opts, done) {
      instance.get('/plugin', (req, reply) => {
        req.log.info('Hello') // we should see this log
        reply.send({ hello: 'world' })
      })
      done()
    }, { logLevel: 'info' })

    await fastify.ready()

    {
      const response = await fastify.inject({ method: 'GET', url: '/' })
      const body = await response.json()
      expect(body.hello).toEqual('world')
    }

    {
      const response = await fastify.inject({ method: 'GET', url: '/plugin' })
      const body = await response.json()
      expect(body.hello).toEqual('world')
    }

    for await (const [line] of on(stream, 'data')) {
      expect(line.msg).toEqual(lines.shift())
      if (lines.length === 0) break
    }
  })
test('Should set a custom logSerializers for a plugin', async () => {
    const lines = ['incoming request', 'XHello', 'request completed']
    expect.assertions(lines.length + 1)

    const stream = split(JSON.parse)

    const loggerInstance = pino({ level: 'error' }, stream)

    const fastify = Fastify({
      loggerInstance
    })
    onTestFinished(() => fastify.close())

    fastify.register(function (instance, opts, done) {
      instance.get('/plugin', (req, reply) => {
        req.log.info({ test: 'Hello' }) // we should see this log
        reply.send({ hello: 'world' })
      })
      done()
    }, { logLevel: 'info', logSerializers: { test: value => 'X' + value } })

    await fastify.ready()

    {
      const response = await fastify.inject({ method: 'GET', url: '/plugin' })
      const body = await response.json()
      expect(body.hello).toEqual('world')
    }

    for await (const [line] of on(stream, 'data')) {
      // either test or msg
      expect(line.test || line.msg).toEqual(lines.shift())
      if (lines.length === 0) break
    }
  })
test('Should set a custom logLevel for every plugin', async () => {
    const lines = ['incoming request', 'info', 'request completed', 'incoming request', 'debug', 'request completed']
    expect.assertions(lines.length * 2 + 3)

    const stream = split(JSON.parse)

    const loggerInstance = pino({ level: 'error' }, stream)

    const fastify = Fastify({
      loggerInstance
    })
    onTestFinished(() => fastify.close())

    fastify.get('/', (req, reply) => {
      req.log.warn('Hello') // we should not see this log
      reply.send({ hello: 'world' })
    })

    fastify.register(function (instance, opts, done) {
      instance.get('/info', (req, reply) => {
        req.log.info('info') // we should see this log
        req.log.debug('hidden log')
        reply.send({ hello: 'world' })
      })
      done()
    }, { logLevel: 'info' })

    fastify.register(function (instance, opts, done) {
      instance.get('/debug', (req, reply) => {
        req.log.debug('debug') // we should see this log
        req.log.trace('hidden log')
        reply.send({ hello: 'world' })
      })
      done()
    }, { logLevel: 'debug' })

    await fastify.ready()

    {
      const response = await fastify.inject({ method: 'GET', url: '/' })
      const body = await response.json()
      expect(body).toEqual({ hello: 'world' })
    }

    {
      const response = await fastify.inject({ method: 'GET', url: '/info' })
      const body = await response.json()
      expect(body).toEqual({ hello: 'world' })
    }

    {
      const response = await fastify.inject({ method: 'GET', url: '/debug' })
      const body = await response.json()
      expect(body).toEqual({ hello: 'world' })
    }

    for await (const [line] of on(stream, 'data')) {
      expect(line.level === 30 || line.level === 20).toBeTruthy()
      expect(line.msg).toEqual(lines.shift())
      if (lines.length === 0) break
    }
  })
test('Should set a custom logSerializers for every plugin', async () => {
    const lines = ['incoming request', 'Hello', 'request completed', 'incoming request', 'XHello', 'request completed', 'incoming request', 'ZHello', 'request completed']
    expect.assertions(lines.length + 3)

    const stream = split(JSON.parse)

    const loggerInstance = pino({ level: 'info' }, stream)
    const fastify = Fastify({
      loggerInstance
    })
    onTestFinished(() => fastify.close())

    fastify.get('/', (req, reply) => {
      req.log.warn({ test: 'Hello' })
      reply.send({ hello: 'world' })
    })

    fastify.register(function (instance, opts, done) {
      instance.get('/test1', (req, reply) => {
        req.log.info({ test: 'Hello' })
        reply.send({ hello: 'world' })
      })
      done()
    }, { logSerializers: { test: value => 'X' + value } })

    fastify.register(function (instance, opts, done) {
      instance.get('/test2', (req, reply) => {
        req.log.info({ test: 'Hello' })
        reply.send({ hello: 'world' })
      })
      done()
    }, { logSerializers: { test: value => 'Z' + value } })

    await fastify.ready()

    {
      const response = await fastify.inject({ method: 'GET', url: '/' })
      const body = await response.json()
      expect(body).toEqual({ hello: 'world' })
    }

    {
      const response = await fastify.inject({ method: 'GET', url: '/test1' })
      const body = await response.json()
      expect(body).toEqual({ hello: 'world' })
    }

    {
      const response = await fastify.inject({ method: 'GET', url: '/test2' })
      const body = await response.json()
      expect(body).toEqual({ hello: 'world' })
    }

    for await (const [line] of on(stream, 'data')) {
      expect(line.test || line.msg).toEqual(lines.shift())
      if (lines.length === 0) break
    }
  })
test('Should override serializers from route', async () => {
    const lines = ['incoming request', 'ZHello', 'request completed']
    expect.assertions(lines.length + 1)

    const stream = split(JSON.parse)

    const loggerInstance = pino({ level: 'info' }, stream)
    const fastify = Fastify({
      loggerInstance
    })
    onTestFinished(() => fastify.close())

    fastify.register(function (instance, opts, done) {
      instance.get('/', {
        logSerializers: {
          test: value => 'Z' + value // should override
        }
      }, (req, reply) => {
        req.log.info({ test: 'Hello' })
        reply.send({ hello: 'world' })
      })
      done()
    }, { logSerializers: { test: value => 'X' + value } })

    await fastify.ready()

    {
      const response = await fastify.inject({ method: 'GET', url: '/' })
      const body = await response.json()
      expect(body).toEqual({ hello: 'world' })
    }

    for await (const [line] of on(stream, 'data')) {
      expect(line.test || line.msg).toEqual(lines.shift())
      if (lines.length === 0) break
    }
  })
test('Should override serializers from plugin', async () => {
    const lines = ['incoming request', 'ZHello', 'request completed']
    expect.assertions(lines.length + 1)

    const stream = split(JSON.parse)

    const loggerInstance = pino({ level: 'info' }, stream)
    const fastify = Fastify({
      loggerInstance
    })
    onTestFinished(() => fastify.close())

    fastify.register(function (instance, opts, done) {
      instance.register(context1, {
        logSerializers: {
          test: value => 'Z' + value // should override
        }
      })
      done()
    }, { logSerializers: { test: value => 'X' + value } })

    function context1 (instance, opts, done) {
      instance.get('/', (req, reply) => {
        req.log.info({ test: 'Hello' })
        reply.send({ hello: 'world' })
      })
      done()
    }

    await fastify.ready()

    {
      const response = await fastify.inject({ method: 'GET', url: '/' })
      const body = await response.json()
      expect(body).toEqual({ hello: 'world' })
    }

    for await (const [line] of on(stream, 'data')) {
      expect(line.test || line.msg).toEqual(lines.shift())
      if (lines.length === 0) break
    }
  })
test('Should increase the log level for a specific plugin', async () => {
    const lines = ['Hello']
    expect.assertions(lines.length * 2 + 1)

    const stream = split(JSON.parse)

    const loggerInstance = pino({ level: 'info' }, stream)

    const fastify = Fastify({
      loggerInstance
    })
    onTestFinished(() => fastify.close())

    fastify.register(function (instance, opts, done) {
      instance.get('/', (req, reply) => {
        req.log.error('Hello') // we should see this log
        reply.send({ hello: 'world' })
      })
      done()
    }, { logLevel: 'error' })

    await fastify.ready()

    {
      const response = await fastify.inject({ method: 'GET', url: '/' })
      const body = await response.json()
      expect(body).toEqual({ hello: 'world' })
    }

    for await (const [line] of on(stream, 'data')) {
      expect(line.level).toEqual(50)
      expect(line.msg).toEqual(lines.shift())
      if (lines.length === 0) break
    }
  })
test('Should set the log level for the customized 404 handler', async () => {
    const lines = ['Hello']
    expect.assertions(lines.length * 2 + 1)

    const stream = split(JSON.parse)

    const loggerInstance = pino({ level: 'warn' }, stream)

    const fastify = Fastify({
      loggerInstance
    })
    onTestFinished(() => fastify.close())

    fastify.register(function (instance, opts, done) {
      instance.setNotFoundHandler(function (req, reply) {
        req.log.error('Hello')
        reply.code(404).send()
      })
      done()
    }, { logLevel: 'error' })

    await fastify.ready()

    {
      const response = await fastify.inject({ method: 'GET', url: '/' })
      expect(response.statusCode).toEqual(404)
    }

    for await (const [line] of on(stream, 'data')) {
      expect(line.level).toEqual(50)
      expect(line.msg).toEqual(lines.shift())
      if (lines.length === 0) break
    }
  })
test('Should set the log level for the customized 500 handler', async () => {
    const lines = ['Hello']
    expect.assertions(lines.length * 2 + 1)

    const stream = split(JSON.parse)

    const loggerInstance = pino({ level: 'warn' }, stream)

    const fastify = Fastify({
      loggerInstance
    })
    onTestFinished(() => fastify.close())

    fastify.register(function (instance, opts, done) {
      instance.get('/', (req, reply) => {
        req.log.error('kaboom')
        reply.send(new Error('kaboom'))
      })

      instance.setErrorHandler(function (e, request, reply) {
        reply.log.fatal('Hello')
        reply.code(500).send()
      })
      done()
    }, { logLevel: 'fatal' })

    await fastify.ready()

    {
      const response = await fastify.inject({ method: 'GET', url: '/' })
      expect(response.statusCode).toEqual(500)
    }

    for await (const [line] of on(stream, 'data')) {
      expect(line.level).toEqual(60)
      expect(line.msg).toEqual(lines.shift())
      if (lines.length === 0) break
    }
  })
test('Should set a custom log level for a specific route', async () => {
    const lines = ['incoming request', 'Hello', 'request completed']
    expect.assertions(lines.length + 2)

    const stream = split(JSON.parse)

    const loggerInstance = pino({ level: 'error' }, stream)

    const fastify = Fastify({
      loggerInstance
    })
    onTestFinished(() => fastify.close())

    fastify.get('/log', { logLevel: 'info' }, (req, reply) => {
      req.log.info('Hello')
      reply.send({ hello: 'world' })
    })

    fastify.get('/no-log', (req, reply) => {
      req.log.info('Hello')
      reply.send({ hello: 'world' })
    })

    await fastify.ready()

    {
      const response = await fastify.inject({ method: 'GET', url: '/log' })
      const body = await response.json()
      expect(body).toEqual({ hello: 'world' })
    }

    {
      const response = await fastify.inject({ method: 'GET', url: '/no-log' })
      const body = await response.json()
      expect(body).toEqual({ hello: 'world' })
    }

    for await (const [line] of on(stream, 'data')) {
      expect(line.msg).toEqual(lines.shift())
      if (lines.length === 0) break
    }
  })
test('Should throw when custom log level for a route is invalid', async () => {
    expect.assertions(4)

    const fastify = Fastify({
      logger: true
    })
    onTestFinished(() => fastify.close())

    try {
      fastify.get('/log', { logLevel: 'invalid' }, (req, reply) => {
        reply.send({ hello: 'world' })
      })
      expect.fail('fastify.get should throw')
    } catch (err) {
      expect(err).toBeTruthy()
      expect(err.code).toBe('XUFA_ERR_ROUTE_LOG_LEVEL_INVALID')
      expect(err.statusCode).toBe(500)
      expect(err.message).toBe("Log level for 'GET:/log' route must be a valid logger level. Received: 'invalid'")
    }
  })
test('Should allow null custom log level for a route', async () => {
    expect.assertions(1)

    const fastify = Fastify({
      logger: true
    })
    onTestFinished(() => fastify.close())

    fastify.get('/log', { logLevel: null }, (req, reply) => {
      reply.send({ hello: 'world' })
    })

    const response = await fastify.inject({ method: 'GET', url: '/log' })
    expect(await response.json()).toEqual({ hello: 'world' })
  })
test('should pass when using unWritable props in the logger option', async () => {
    expect.assertions(8)
    const fastify = Fastify({
      logger: Object.defineProperty({}, 'level', { value: 'info' })
    })
    onTestFinished(() => fastify.close())

    expect(typeof fastify.log).toEqual('object')
    expect(typeof fastify.log.fatal).toEqual('function')
    expect(typeof fastify.log.error).toEqual('function')
    expect(typeof fastify.log.warn).toEqual('function')
    expect(typeof fastify.log.info).toEqual('function')
    expect(typeof fastify.log.debug).toEqual('function')
    expect(typeof fastify.log.trace).toEqual('function')
    expect(typeof fastify.log.child).toEqual('function')
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('Should throw an error if logger instance is passed to `logger`', async () => {
    expect.assertions(2)
    const stream = split(JSON.parse)

    const logger = require('@xufa/logger')(stream)

    try {
      Fastify({ logger })
    } catch (err) {
      expect(err).toBeTruthy()
      expect(err.code).toEqual('XUFA_ERR_LOG_INVALID_LOGGER_CONFIG')
    }
  })
test('Should throw an error if options are passed to `loggerInstance`', async () => {
    expect.assertions(2)
    try {
      Fastify({ loggerInstance: { level: 'log' } })
    } catch (err) {
      expect(err).toBeTruthy()
      expect(err.code).toBe('XUFA_ERR_LOG_INVALID_LOGGER_INSTANCE')
    }
  })
test('If both `loggerInstance` and `logger` are provided, an error should be thrown', async () => {
    expect.assertions(2)
    const loggerInstanceStream = split(JSON.parse)
    const loggerInstance = pino({ level: 'error' }, loggerInstanceStream)
    const loggerStream = split(JSON.parse)
    try {
      Fastify({
        logger: {
          stream: loggerStream,
          level: 'info'
        },
        loggerInstance
      })
    } catch (err) {
      expect(err).toBeTruthy()
      expect(err.code).toEqual('XUFA_ERR_LOG_LOGGER_AND_LOGGER_INSTANCE_PROVIDED')
    }
  })
test('`logger` should take pino configuration and create a pino logger', async () => {
    const lines = ['hello', 'world']
    expect.assertions(2 * lines.length + 2)
    const loggerStream = split(JSON.parse)
    const fastify = Fastify({
      logger: {
        stream: loggerStream,
        level: 'error'
      }
    })
    onTestFinished(() => fastify.close())
    fastify.get('/hello', (req, reply) => {
      req.log.error('hello')
      reply.code(404).send()
    })

    fastify.get('/world', (req, reply) => {
      req.log.error('world')
      reply.code(201).send()
    })

    await fastify.ready()
    {
      const response = await fastify.inject({ method: 'GET', url: '/hello' })
      expect(response.statusCode).toEqual(404)
    }
    {
      const response = await fastify.inject({ method: 'GET', url: '/world' })
      expect(response.statusCode).toEqual(201)
    }

    for await (const [line] of on(loggerStream, 'data')) {
      expect(line.level).toEqual(50)
      expect(line.msg).toEqual(lines.shift())
      if (lines.length === 0) break
    }
  })
})
