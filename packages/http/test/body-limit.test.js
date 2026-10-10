'use strict'

const Fastify = require('..')
const zlib = require('node:zlib')


test('bodyLimit', async () => {
  expect.assertions(4)

  try {
    Fastify({ bodyLimit: 1.3 })
    expect.fail('option must be an integer')
  } catch (err) {
    expect(err).toBeTruthy()
  }

  try {
    Fastify({ bodyLimit: [] })
    expect.fail('option must be an integer')
  } catch (err) {
    expect(err).toBeTruthy()
  }

  const fastify = Fastify({ bodyLimit: 1 })

  fastify.post('/', (request, reply) => {
    reply.send({ error: 'handler should not be called' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  })

  expect(result.ok).toBeFalsy()
  expect(result.status).toBe(413)
})

describe('bodyLimit is applied to decoded content', () => {

const body = { x: 'x'.repeat(30000) }
const json = JSON.stringify(body)
const encoded = zlib.gzipSync(json)
const fastify = Fastify()
fastify.addHook('preParsing', async (req, reply, payload) => {
    expect(req.headers['content-length']).toBe(`${encoded.length}`)
    const unzip = zlib.createGunzip()
    Object.defineProperty(unzip, 'receivedEncodedLength', {
      get () {
        return unzip.bytesWritten
      }
    })
    payload.pipe(unzip)
    return unzip
  })
fastify.post('/body-limit-40k', {
    bodyLimit: 40000,
    onError: async (req, res, err) => {
      expect.fail('should not be called')
    }
  }, (request, reply) => {
    reply.send({ x: request.body.x })
  })
fastify.post('/body-limit-20k', {
    bodyLimit: 20000,
    onError: async (req, res, err) => {
      expect(err.code).toBe('XUFA_ERR_CTP_BODY_TOO_LARGE')
      expect(err.statusCode).toBe(413)
    }
  }, (request, reply) => {
    reply.send({ x: 'handler should not be called' })
  })
test('bodyLimit 40k', async () => {
    const result = await fastify.inject({
      method: 'POST',
      url: '/body-limit-40k',
      headers: {
        'content-encoding': 'gzip',
        'content-type': 'application/json'
      },
      payload: encoded
    })
    expect(result.statusCode).toBe(200)
    expect(result.json()).toEqual(body)
  })
test('bodyLimit 20k', async () => {
    const result = await fastify.inject({
      method: 'POST',
      url: '/body-limit-20k',
      headers: {
        'content-encoding': 'gzip',
        'content-type': 'application/json'
      },
      payload: encoded
    })
    expect(result.statusCode).toBe(413)
  })
})

test('default request.routeOptions.bodyLimit should be 1048576', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  fastify.post('/default-bodylimit', {
    handler (request, reply) {
      expect(1048576).toBe(request.routeOptions.bodyLimit)
      reply.send({ })
    }
  })
  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result = await fetch(fastifyServer + '/default-bodylimit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  })
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
})

test('request.routeOptions.bodyLimit should be equal to route limit', async () => {
  expect.assertions(3)
  const fastify = Fastify({ bodyLimit: 1 })
  fastify.post('/route-limit', {
    bodyLimit: 1000,
    handler (request, reply) {
      expect(1000).toBe(request.routeOptions.bodyLimit)
      reply.send({})
    }
  })
  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result = await fetch(fastifyServer + '/route-limit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  })
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
})

test('request.routeOptions.bodyLimit should be equal to server limit', async () => {
  expect.assertions(3)
  const fastify = Fastify({ bodyLimit: 100 })
  fastify.post('/server-limit', {
    handler (request, reply) {
      expect(100).toBe(request.routeOptions.bodyLimit)
      reply.send({})
    }
  })
  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result = await fetch(fastifyServer + '/server-limit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  })
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
})

describe('bodyLimit should use byte length for UTF-8 strings, not character length', () => {

const multiByteString = 'あああ'
expect(multiByteString.length).toBe(3)
expect(Buffer.byteLength(multiByteString, 'utf8')).toBe(9)
const fastify = Fastify()
fastify.addContentTypeParser('text/plain', { parseAs: 'string' }, (req, body, done) => {
    done(null, body)
  })
fastify.post('/test-utf8', {
    bodyLimit: 7
  }, (request, reply) => {
    reply.send({ body: request.body, length: request.body.length })
  })
test('should reject body when byte length exceeds limit', async () => {
    const result = await fastify.inject({
      method: 'POST',
      url: '/test-utf8',
      headers: { 'Content-Type': 'text/plain', 'Content-Length': null },
      payload: multiByteString
    })

    expect(result.statusCode).toBe(413)
  })
test('should accept body when byte length is within limit', async () => {
    const smallString = 'あ' // 1 character, 3 bytes, under the 7 byte limit

    const result = await fastify.inject({
      method: 'POST',
      url: '/test-utf8',
      headers: { 'Content-Type': 'text/plain' },
      payload: smallString
    })

    expect(result.statusCode).toBe(200)
    expect(result.json().body).toBe(smallString)
    expect(result.json().length).toBe(1) // 1 character
  })
})
