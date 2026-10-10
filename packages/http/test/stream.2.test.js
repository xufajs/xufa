'use strict'


// The library with some of the modules it imports replaced (its modules are ES modules: proxyquire, which replaced
// the requires of CommonJS, cannot reach them; vyntra's doMock and a fresh import can).
async function xufaWith (mocks) {
  vi.resetModules()
  for (const [name, factory] of Object.entries(mocks)) vi.doMock(name, factory)
  try {
    return (await import('../lib/xufa.js')).default
  } finally {
    for (const name of Object.keys(mocks)) vi.doUnmock(name)
  }
}
// finished() fails when lib/reply.js calls it with a callback only; the real one runs for the other modules (doMock
// replaces it for every module, proxyquire did for reply.js only).
const stream = require('node:stream')
const failingFinished = () => ({
  ...stream,
  finished: (...args) => {
    if (!/[\\/]lib[\\/]reply\.js/.test(new Error().stack)) return stream.finished(...args)
    if (args.length === 2) { args[1](new Error('test-error')) }
  }
})
const fs = require('node:fs')
const resolve = require('node:path').resolve
const zlib = require('node:zlib')
const pipeline = stream.pipeline
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

test('onSend hook stream should work even if payload is not a proper stream', async () => {
  expect.assertions(1)

  const Fastify = await xufaWith({ 'node:stream': failingFinished })
  await new Promise((testDone) => {
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

})

test('onSend hook stream should work on payload with "close" ending function', async () => {
  expect.assertions(1)

  const Fastify = await xufaWith({ 'node:stream': failingFinished })
  await new Promise((testDone) => {

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

})
