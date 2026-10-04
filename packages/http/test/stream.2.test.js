'use strict'


const proxyquire = require('proxyquire')
const fs = require('node:fs')
const resolve = require('node:path').resolve
const zlib = require('node:zlib')
const pipeline = require('node:stream').pipeline
const Fastify = require('..')
const { waitForCb } = require('./helper')

test('onSend hook stream', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  const { stepIn, patience } = waitForCb({ steps: 2 })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    const gzStream = zlib.createGzip()

    reply.header('Content-Encoding', 'gzip')
    pipeline(
      fs.createReadStream(resolve(__filename), 'utf8'),
      gzStream,
      (err) => {
        expect(err).toBeFalsy()
        stepIn()
      }
    )
    done(null, gzStream)
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['content-encoding']).toBe('gzip')
    const file = fs.readFileSync(resolve(__filename), 'utf8')
    const payload = zlib.gunzipSync(res.rawPayload)
    expect(payload.toString('utf-8')).toBe(file)
    fastify.close()
    stepIn()
  })

  return patience

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('onSend hook stream should work even if payload is not a proper stream', (testDone) => {
  expect.assertions(1)

  const reply = proxyquire('../lib/reply', {
    'node:stream': {
      finished: (...args) => {
        if (args.length === 2) { args[1](new Error('test-error')) }
      }
    }
  })
  const Fastify = proxyquire('../lib/xufa', {
    './reply': reply
  })
  const spyLogger = {
    fatal: () => { },
    error: () => { },
    warn: (message) => {
      expect(message).toBe('stream payload does not end properly')
      fastify.close()
      testDone()
    },
    info: () => { },
    debug: () => { },
    trace: () => { },
    child: () => { return spyLogger }
  }

  const fastify = Fastify({ loggerInstance: spyLogger })
  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })
  fastify.addHook('onSend', (req, reply, payload, done) => {
    const fakeStream = { pipe: () => { } }
    done(null, fakeStream)
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  })
})

test('onSend hook stream should work on payload with "close" ending function', (testDone) => {
  expect.assertions(1)

  const reply = proxyquire('../lib/reply', {
    'node:stream': {
      finished: (...args) => {
        if (args.length === 2) { args[1](new Error('test-error')) }
      }
    }
  })
  const Fastify = proxyquire('../lib/xufa', {
    './reply': reply
  })

  const fastify = Fastify({ logger: false })
  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })
  fastify.addHook('onSend', (req, reply, payload, done) => {
    const fakeStream = {
      pipe: () => { },
      close: (cb) => {
        cb()
        expect('close callback called').toBeTruthy()
        testDone()
      }
    }
    done(null, fakeStream)
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  })
})
