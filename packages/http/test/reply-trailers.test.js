'use strict'


const Fastify = require('..')
const { Readable } = require('node:stream')
const { createHash } = require('node:crypto')
const { sleep } = require('./helper')

test('send trailers when payload is empty string', (testDone) => {
  expect.assertions(5)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    reply.trailer('ETag', function (reply, payload, done) {
      done(null, 'custom-etag')
    })
    reply.send('')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.headers.trailer).toBe('etag')
    expect(res.trailers.etag).toBe('custom-etag')
    expect(res.headers['content-length']).toBeFalsy()
    testDone()
  })
})

test('send trailers when payload is empty buffer', (testDone) => {
  expect.assertions(5)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    reply.trailer('ETag', function (reply, payload, done) {
      done(null, 'custom-etag')
    })
    reply.send(Buffer.alloc(0))
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.headers.trailer).toBe('etag')
    expect(res.trailers.etag).toBe('custom-etag')
    expect(res.headers['content-length']).toBeFalsy()
    testDone()
  })
})

test('send trailers when payload is undefined', (testDone) => {
  expect.assertions(5)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    reply.trailer('ETag', function (reply, payload, done) {
      done(null, 'custom-etag')
    })
    reply.send(undefined)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.headers.trailer).toBe('etag')
    expect(res.trailers.etag).toBe('custom-etag')
    expect(res.headers['content-length']).toBeFalsy()
    testDone()
  })
})

test('send trailers when payload is json', (testDone) => {
  expect.assertions(7)

  const fastify = Fastify()
  const data = JSON.stringify({ hello: 'world' })
  const hash = createHash('md5')
  hash.update(data)
  const md5 = hash.digest('hex')

  fastify.get('/', function (request, reply) {
    reply.trailer('Content-MD5', function (reply, payload, done) {
      expect(data).toBe(payload)
      const hash = createHash('md5')
      hash.update(payload)
      done(null, hash.digest('hex'))
    })
    reply.send(data)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.headers['transfer-encoding']).toBe('chunked')
    expect(res.headers.trailer).toBe('content-md5')
    expect(res.trailers['content-md5']).toBe(md5)
    expect(res.headers['content-length']).toBeFalsy()
    testDone()
  })
})

test('send trailers when payload is stream', (testDone) => {
  expect.assertions(7)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    reply.trailer('ETag', function (reply, payload, done) {
      expect(payload).toEqual(null)
      done(null, 'custom-etag')
    })
    const stream = Readable.from([JSON.stringify({ hello: 'world' })])
    reply.send(stream)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.headers['transfer-encoding']).toBe('chunked')
    expect(res.headers.trailer).toBe('etag')
    expect(res.trailers.etag).toBe('custom-etag')
    expect(res.headers['content-length']).toBeFalsy()
    testDone()
  })
})

test('remove trailer while stream is being consumed', (testDone) => {
  expect.assertions(5)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    const stream = Readable.from((function * () {
      reply.removeTrailer('ETag')
      yield 'hello'
    })())

    reply.trailer('ETag', function () {
      expect.fail('removed trailer should not be called')
    })

    reply.send(stream)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    expect(res.headers.trailer).toBe('etag')
    expect(res.trailers.etag).toBe(undefined)
    testDone()
  })
})

test('send trailers when using async-await', (testDone) => {
  expect.assertions(5)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    reply.trailer('ETag', async function (reply, payload) {
      return 'custom-etag'
    })
    reply.send('')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.headers.trailer).toBe('etag')
    expect(res.trailers.etag).toBe('custom-etag')
    expect(res.headers['content-length']).toBeFalsy()
    testDone()
  })
})

test('error in trailers should be ignored', (testDone) => {
  expect.assertions(5)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    reply.trailer('ETag', function (reply, payload, done) {
      done('error')
    })
    reply.send('')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.headers.trailer).toBe('etag')
    expect(res.trailers['etag']).toBeFalsy()
    expect(res.headers['content-length']).toBeFalsy()
    testDone()
  })
})

test('send is called once when multiple trailer callbacks run synchronously', (testDone) => {
  expect.assertions(6)
  const fastify = Fastify()
  let endCalls = 0
  let addTrailersCalls = 0

  fastify.get('/', function (request, reply) {
    const originalEnd = reply.raw.end.bind(reply.raw)
    reply.raw.end = function (...args) {
      endCalls++
      return originalEnd(...args)
    }
    const originalAddTrailers = reply.raw.addTrailers.bind(reply.raw)
    reply.raw.addTrailers = function (...args) {
      addTrailersCalls++
      return originalAddTrailers(...args)
    }
    reply.trailer('Return-Early', function (reply, payload, done) {
      done(null, 'a')
    })
    reply.trailer('Content-MD5', function (reply, payload, done) {
      done(null, 'b')
    })
    reply.send('hello')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.trailers['return-early']).toBe('a')
    expect(res.trailers['content-md5']).toBe('b')
    expect(endCalls).toBe(1)
    expect(addTrailersCalls).toBe(1)
    testDone()
  })
})

describe('trailer handler counter', () => {
const data = JSON.stringify({ hello: 'world' })
const hash = createHash('md5')
hash.update(data)
const md5 = hash.digest('hex')
test('callback with timeout', (testDone) => {
    expect.assertions(9)
    const fastify = Fastify()

    fastify.get('/', function (request, reply) {
      reply.trailer('Return-Early', function (reply, payload, done) {
        expect(data).toBe(payload)
        done(null, 'return')
      })
      reply.trailer('Content-MD5', function (reply, payload, done) {
        expect(data).toBe(payload)
        const hash = createHash('md5')
        hash.update(payload)
        setTimeout(() => {
          done(null, hash.digest('hex'))
        }, 500)
      })
      reply.send(data)
    })

    fastify.inject({
      method: 'GET',
      url: '/'
    }, (error, res) => {
      expect(error).toBeFalsy()
      expect(res.statusCode).toBe(200)
      expect(res.headers['transfer-encoding']).toBe('chunked')
      expect(res.headers.trailer).toBe('return-early content-md5')
      expect(res.trailers['return-early']).toBe('return')
      expect(res.trailers['content-md5']).toBe(md5)
      expect(res.headers['content-length']).toBeFalsy()
      testDone()
    })
  })
test('async-await', (testDone) => {
    expect.assertions(9)
    const fastify = Fastify()

    fastify.get('/', function (request, reply) {
      reply.trailer('Return-Early', async function (reply, payload) {
        expect(data).toBe(payload)
        return 'return'
      })
      reply.trailer('Content-MD5', async function (reply, payload) {
        expect(data).toBe(payload)
        const hash = createHash('md5')
        hash.update(payload)
        await sleep(500)
        return hash.digest('hex')
      })
      reply.send(data)
    })

    fastify.inject({
      method: 'GET',
      url: '/'
    }, (error, res) => {
      expect(error).toBeFalsy()
      expect(res.statusCode).toBe(200)
      expect(res.headers['transfer-encoding']).toBe('chunked')
      expect(res.headers.trailer).toBe('return-early content-md5')
      expect(res.trailers['return-early']).toBe('return')
      expect(res.trailers['content-md5']).toBe(md5)
      expect(res.headers['content-length']).toBeFalsy()
      testDone()
    })
  })
test('mixed callback and promise trailers only use the first completion', (testDone) => {
    expect.assertions(7)
    const fastify = Fastify()

    fastify.get('/', function (request, reply) {
      reply.trailer('Async', function (reply, payload, done) {
        setTimeout(() => done(null, 'async'), 10)
      })
      reply.trailer('Mixed', function (reply, payload, done) {
        done(null, 'correct')
        return Promise.resolve('corrupted')
      })
      reply.send('hello')
    })

    fastify.inject({
      method: 'GET',
      url: '/'
    }, (error, res) => {
      expect(error).toBeFalsy()
      expect(res.statusCode).toBe(200)
      expect(res.headers['transfer-encoding']).toBe('chunked')
      expect(res.headers.trailer).toBe('async mixed')
      expect(res.trailers.async).toBe('async')
      expect(res.trailers.mixed).toBe('correct')
      expect(res.headers['content-length']).toBeFalsy()
      testDone()
    })
  })
})

test('removeTrailer', (testDone) => {
  expect.assertions(6)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    reply.removeTrailer('ETag') // remove nothing
    reply.trailer('ETag', function (reply, payload, done) {
      done(null, 'custom-etag')
    })
    reply.trailer('Should-Not-Call', function (reply, payload, done) {
      expect.fail('it should not called as this trailer is removed')
      done(null, 'should-not-call')
    })
    reply.removeTrailer('Should-Not-Call')
    reply.send(undefined)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.headers.trailer).toBe('etag')
    expect(res.trailers.etag).toBe('custom-etag')
    expect(res.trailers['should-not-call']).toBeFalsy()
    expect(res.headers['content-length']).toBeFalsy()
    testDone()
  })
})

test('remove all trailers', (testDone) => {
  expect.assertions(6)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    reply.trailer('ETag', function (reply, payload, done) {
      expect.fail('it should not called as this trailer is removed')
      done(null, 'custom-etag')
    })
    reply.removeTrailer('ETag')
    reply.trailer('Should-Not-Call', function (reply, payload, done) {
      expect.fail('it should not called as this trailer is removed')
      done(null, 'should-not-call')
    })
    reply.removeTrailer('Should-Not-Call')
    reply.send('')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.headers.trailer).toBe(undefined)
    expect(res.trailers.etag).toBe(undefined)
    expect(res.trailers['should-not-call']).toBe(undefined)
    expect(res.headers['content-length']).toBe('0')
    testDone()
  })
})

test('remove some trailers should keep trailer mode for the remaining ones', (testDone) => {
  expect.assertions(6)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    reply.trailer('ETag', function () {
      expect.fail('removed trailer should not be called')
    })
    reply.removeTrailer('ETag')
    reply.trailer('Content-MD5', function (reply, payload, done) {
      done(null, 'custom-md5')
    })
    reply.send('hello')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.headers.trailer).toBe('content-md5')
    expect(res.headers['transfer-encoding']).toBe('chunked')
    expect(res.headers['content-length']).toBe(undefined)
    expect(res.trailers['content-md5']).toBe('custom-md5')
    testDone()
  })
})

test('remove all trailers should behave like no trailers were registered', (testDone) => {
  expect.assertions(6)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    reply.trailer('ETag', function () {
      expect.fail('removed trailer should not be called')
    })
    reply.removeTrailer('ETag')
    reply.send('hello')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.headers.trailer).toBe(undefined)
    expect(res.headers['transfer-encoding']).toBe(undefined)
    expect(res.headers['content-length']).toBe('5')
    expect(res.trailers.etag).toBe(undefined)
    testDone()
  })
})

test('hasTrailer', (testDone) => {
  expect.assertions(10)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    expect(reply.hasTrailer('ETag')).toBe(false)
    reply.trailer('ETag', function (reply, payload, done) {
      done(null, 'custom-etag')
    })
    expect(reply.hasTrailer('ETag')).toBe(true)
    reply.trailer('Should-Not-Call', function (reply, payload, done) {
      expect.fail('it should not called as this trailer is removed')
      done(null, 'should-not-call')
    })
    expect(reply.hasTrailer('Should-Not-Call')).toBe(true)
    reply.removeTrailer('Should-Not-Call')
    expect(reply.hasTrailer('Should-Not-Call')).toBe(false)
    reply.send(undefined)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.headers.trailer).toBe('etag')
    expect(res.trailers.etag).toBe('custom-etag')
    expect(res.trailers['should-not-call']).toBeFalsy()
    expect(res.headers['content-length']).toBeFalsy()
    testDone()
  })
})

test('throw error when trailer header name is not allowed', (testDone) => {
  const INVALID_TRAILERS = [
    'transfer-encoding',
    'content-length',
    'host',
    'cache-control',
    'max-forwards',
    'te',
    'authorization',
    'set-cookie',
    'content-encoding',
    'content-type',
    'content-range',
    'trailer'
  ]
  expect.assertions(INVALID_TRAILERS.length + 2)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    for (const key of INVALID_TRAILERS) {
      try {
        reply.trailer(key, () => { })
      } catch (err) {
        expect(err.message).toBe(`Called reply.trailer with an invalid header name: ${key}`)
      }
    }
    reply.send('')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

test('throw error when trailer header value is not function', (testDone) => {
  const INVALID_TRAILERS_VALUE = [
    undefined,
    null,
    true,
    false,
    'invalid',
    [],
    new Date(),
    {}
  ]
  expect.assertions(INVALID_TRAILERS_VALUE.length + 2)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    for (const value of INVALID_TRAILERS_VALUE) {
      try {
        reply.trailer('invalid', value)
      } catch (err) {
        expect(err.message).toBe(`Called reply.trailer('invalid', fn) with an invalid type: ${typeof value}. Expected a function.`)
      }
    }
    reply.send('')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    testDone()
  })
})
