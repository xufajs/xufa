'use strict'


const { request, Agent, fetch } = require('undici')
const Fastify = require('../..')

const { buildCertificate } = require('../build-certificate')
// Certificates are needed while collecting.
buildCertificate()

describe('https', () => {

let fastify
try {
    fastify = Fastify({
      https: {
        key: global.context.key,
        cert: global.context.cert
      }
    })
    expect('Key/cert successfully loaded').toBeTruthy()
  } catch (e) {
    expect.fail('Key/cert loading failed')
  }
fastify.get('/', function (req, reply) {
    reply.code(200).send({ hello: 'world' })
  })
fastify.get('/proto', function (req, reply) {
    reply.code(200).send({ proto: req.protocol })
  })
afterAll(() => { fastify.close() })
beforeAll(async () => {
await fastify.listen({ port: 0 })
})
test('https get request', async () => {
    expect.assertions(4)
    const result = await fetch('https://localhost:' + fastify.server.address().port, {
      dispatcher: new Agent({
        connect: {
          rejectUnauthorized: false
        }
      })
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual({ hello: 'world' })
  })
test('https get request without trust proxy - protocol', async () => {
    expect.assertions(3)
    const result1 = await fetch(`${'https://localhost:' + fastify.server.address().port}/proto`, {
      dispatcher: new Agent({
        connect: {
          rejectUnauthorized: false
        }
      })
    })
    expect(result1.ok).toBeTruthy()
    expect(await result1.json()).toEqual({ proto: 'https' })

    const result2 = await fetch(`${'https://localhost:' + fastify.server.address().port}/proto`, {
      dispatcher: new Agent({
        connect: {
          rejectUnauthorized: false
        }
      }),
      headers: {
        'x-forwarded-proto': 'lorem'
      }
    })
    expect(await result2.json()).toEqual({ proto: 'https' })
  })
})

describe('https - headers', () => {

let fastify
try {
    fastify = Fastify({
      https: {
        key: global.context.key,
        cert: global.context.cert
      }
    })
    expect('Key/cert successfully loaded').toBeTruthy()
  } catch (e) {
    expect.fail('Key/cert loading failed')
  }
fastify.get('/', function (req, reply) {
    reply.code(200).send({ hello: 'world', hostname: req.hostname, port: req.port })
  })
afterAll(async () => { await fastify.close() })
beforeAll(async () => {
await fastify.listen({ port: 0 })
})
test('https get request', async () => {
    expect.assertions(3)
    const result = await fetch('https://localhost:' + fastify.server.address().port, {
      dispatcher: new Agent({
        connect: {
          rejectUnauthorized: false
        }
      })
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ hostname: 'localhost', port: fastify.server.address().port, hello: 'world' })
  })
test('https get request - test port fall back', async () => {
    expect.assertions(2)

    const result = await request('https://localhost:' + fastify.server.address().port, {
      method: 'GET',
      headers: {
        host: 'fastify.test'
      },
      dispatcher: new Agent({
        connect: {
          rejectUnauthorized: false
        }
      })
    })

    expect(result.statusCode).toBe(200)
    expect(await result.body.json()).toEqual({ hello: 'world', hostname: 'fastify.test', port: null })
  })
})
