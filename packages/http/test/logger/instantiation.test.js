'use strict'

const stream = require('node:stream')
const os = require('node:os')
const fs = require('node:fs')


const split = require('split2')

const { streamSym } = require('@xufa/logger').symbols

const Fastify = require('@xufa/http')
const helper = require('../helper')
const { XUFA_ERR_LOG_INVALID_LOGGER } = require('../../lib/errors')
const { once, on } = stream
const { createTempFile, request } = require('./logger-test-utils')
const { partialDeepStrictEqual } = require('../helper')

describe('logger instantiation', () => {
let interfaces, ipv6;
let localhost
let localhostForURL

beforeAll(async function () {
    [localhost, localhostForURL] = await helper.getLoopbackHost()
  })
test('can use external logger instance', async () => {
    const lines = [/^Server listening at /, /^incoming request$/, /^log success$/, /^request completed$/]
    expect.assertions(lines.length + 1)

    const stream = split(JSON.parse)

    const loggerInstance = require('@xufa/logger')(stream)

    const fastify = Fastify({ loggerInstance })
    onTestFinished(() => fastify.close())

    fastify.get('/foo', function (req, reply) {
      expect(req.log).toBeTruthy()
      req.log.info('log success')
      reply.send({ hello: 'world' })
    })

    await fastify.listen({ port: 0, host: localhost })

    await request(`http://${localhostForURL}:` + fastify.server.address().port + '/foo')

    for await (const [line] of on(stream, 'data')) {
      const regex = lines.shift()
      expect(regex.test(line.msg)).toBeTruthy()
      if (lines.length === 0) break
    }
  })
test('should create a default logger if provided one is invalid', async () => {
    expect.assertions(8)

    const logger = new Date()

    const fastify = Fastify({ logger })
    onTestFinished(() => fastify.close())

    expect(typeof fastify.log).toBe('object')
    expect(typeof fastify.log.fatal).toBe('function')
    expect(typeof fastify.log.error).toBe('function')
    expect(typeof fastify.log.warn).toBe('function')
    expect(typeof fastify.log.info).toBe('function')
    expect(typeof fastify.log.debug).toBe('function')
    expect(typeof fastify.log.trace).toBe('function')
    expect(typeof fastify.log.child).toBe('function')
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('expose the logger', async () => {
    expect.assertions(2)
    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: {
        stream,
        level: 'info'
      }
    })
    onTestFinished(() => fastify.close())

    await fastify.ready()

    expect(fastify.log).toBeTruthy()
    expect(typeof fastify.log).toBe('object')
  })
test('(setup)', async () => {
interfaces = os.networkInterfaces();
ipv6 = Object.keys(interfaces)
    .filter(name => name.substr(0, 2) === 'lo')
    .map(name => interfaces[name])
    .reduce((list, set) => list.concat(set), [])
    .filter(info => info.family === 'IPv6')
    .map(info => info.address)
    .shift();
})
test.skipIf(!ipv6)('Wrap IPv6 address in listening log message', async () => {
    expect.assertions(1)

    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: {
        stream,
        level: 'info'
      }
    })
    onTestFinished(() => fastify.close())

    await fastify.ready()
    await fastify.listen({ port: 0, host: ipv6 })

    {
      const [line] = await once(stream, 'data')
      expect(line.msg).toBe(`Server listening at http://[${ipv6}]:${fastify.server.address().port}`)
    }
  })
test('Do not wrap IPv4 address', async () => {
    expect.assertions(1)
    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: {
        stream,
        level: 'info'
      }
    })
    onTestFinished(() => fastify.close())

    await fastify.ready()
    await fastify.listen({ port: 0, host: '127.0.0.1' })

    {
      const [line] = await once(stream, 'data')
      expect(line.msg).toBe(`Server listening at http://127.0.0.1:${fastify.server.address().port}`)
    }
  })
test('file option', async (ctx) => {
    const { file, cleanup } = createTempFile(ctx)
    // 0600 permissions (read/write for owner only)
    if (process.env.CITGM) { fs.writeFileSync(file, '', { mode: 0o600 }) }

    const fastify = Fastify({
      logger: { file }
    })

    onTestFinished(async () => {
      await helper.sleep(250)
      // may fail on win
      try {
        // cleanup the file after sonic-boom closed
        // otherwise we may face racing condition
        fastify.log[streamSym].once('close', cleanup)
        // we must flush the stream ourself
        // otherwise buffer may whole sonic-boom
        fastify.log[streamSym].flushSync()
        // end after flushing to actually close file
        fastify.log[streamSym].end()
      } catch (err) {
        console.warn(err)
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
      { req: { method: 'GET', url: '/' }, msg: 'incoming request' },
      { res: { statusCode: 200 }, msg: 'request completed' }
    ]
    await request(`http://${localhostForURL}:` + fastify.server.address().port)

    await helper.sleep(250)

    const log = fs.readFileSync(file, 'utf8').split('\n')
    // strip last line
    log.pop()

    let id
    for (let line of log) {
      line = JSON.parse(line)
      if (id === undefined && line.reqId) id = line.reqId
      if (id !== undefined && line.reqId) expect(line.reqId).toBe(id)
      expect(partialDeepStrictEqual(line, lines.shift())).toBeTruthy()
    }
  })
test('should be able to use a custom logger', async () => {
    expect.assertions(7)

    const loggerInstance = {
      fatal: (msg) => { expect(msg).toBe('fatal') },
      error: (msg) => { expect(msg).toBe('error') },
      warn: (msg) => { expect(msg).toBe('warn') },
      info: (msg) => { expect(msg).toBe('info') },
      debug: (msg) => { expect(msg).toBe('debug') },
      trace: (msg) => { expect(msg).toBe('trace') },
      child: () => loggerInstance
    }

    const fastify = Fastify({ loggerInstance })
    onTestFinished(() => fastify.close())

    fastify.log.fatal('fatal')
    fastify.log.error('error')
    fastify.log.warn('warn')
    fastify.log.info('info')
    fastify.log.debug('debug')
    fastify.log.trace('trace')
    const child = fastify.log.child()
    expect(child).toBe(loggerInstance)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('should throw in case a partially matching logger is provided', async () => {
    expect.assertions(1)

    try {
      const fastify = Fastify({ logger: console })
      await fastify.ready()
    } catch (err) {
      expect(err instanceof XUFA_ERR_LOG_INVALID_LOGGER).toBe(true)
    }
  })
test('can use external logger instance with custom serializer', async () => {
    const lines = [['level', 30], ['req', { url: '/foo' }], ['level', 30], ['res', { statusCode: 200 }]]
    expect.assertions(lines.length + 1)

    const stream = split(JSON.parse)
    const loggerInstance = require('@xufa/logger')({
      level: 'info',
      serializers: {
        req: function (req) {
          return {
            url: req.url
          }
        }
      }
    }, stream)

    const fastify = Fastify({
      loggerInstance
    })
    onTestFinished(() => fastify.close())

    fastify.get('/foo', function (req, reply) {
      expect(req.log).toBeTruthy()
      req.log.info('log success')
      reply.send({ hello: 'world' })
    })

    await fastify.ready()
    await fastify.listen({ port: 0, host: localhost })

    await request(`http://${localhostForURL}:` + fastify.server.address().port + '/foo')

    for await (const [line] of on(stream, 'data')) {
      const check = lines.shift()
      const key = check[0]
      const value = check[1]
      expect(line[key]).toEqual(value)
      if (lines.length === 0) break
    }
  })
test('The logger should accept custom serializer', async () => {
    const stream = split(JSON.parse)
    const fastify = Fastify({
      logger: {
        stream,
        level: 'info',
        serializers: {
          req: function (req) {
            return {
              url: req.url
            }
          }
        }
      }
    })
    onTestFinished(() => fastify.close())

    fastify.get('/custom', function (req, reply) {
      expect(req.log).toBeTruthy()
      reply.send(new Error('kaboom'))
    })

    await fastify.ready()
    const server = await fastify.listen({ port: 0, host: localhost })
    const lines = [
      { msg: `Server listening at ${server}` },
      { req: { url: '/custom' }, msg: 'incoming request' },
      { res: { statusCode: 500 }, msg: 'kaboom' },
      { res: { statusCode: 500 }, msg: 'request completed' }
    ]
    expect.assertions(lines.length + 1)

    await request(`http://${localhostForURL}:` + fastify.server.address().port + '/custom')

    for await (const [line] of on(stream, 'data')) {
      expect(partialDeepStrictEqual(line, lines.shift())).toBeTruthy()
      if (lines.length === 0) break
    }
  })
test('should throw in case the external logger provided does not have a child method', async () => {
    expect.assertions(1)
    const loggerInstance = {
      info: console.info,
      error: console.error,
      debug: console.debug,
      fatal: console.error,
      warn: console.warn,
      trace: console.trace
    }

    try {
      const fastify = Fastify({ logger: loggerInstance })
      await fastify.ready()
    } catch (err) {
      expect(err instanceof XUFA_ERR_LOG_INVALID_LOGGER).toBe(true)
    }
  })
})
