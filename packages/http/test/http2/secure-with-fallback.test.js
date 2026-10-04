'use strict'


const Fastify = require('../..')
const h2url = require('h2url')
const msg = { hello: 'world' }

const { buildCertificate } = require('../build-certificate')
const { Agent, fetch } = require('undici')
// Certificates are needed while collecting.
buildCertificate()

describe('secure with fallback', () => {
let fastifyServer;

let fastify
try {
    fastify = Fastify({
      http2: true,
      https: {
        allowHTTP1: true,
        key: global.context.key,
        cert: global.context.cert
      }
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail('Key/cert loading failed')
  }
fastify.get('/', function (req, reply) {
    reply.code(200).send(msg)
  })
fastify.post('/', function (req, reply) {
    reply.code(200).send(req.body)
  })
fastify.get('/error', async function (req, reply) {
    throw new Error('kaboom')
  })
afterAll(() => fastify.close())
beforeAll(async () => {
fastifyServer = await fastify.listen({ port: 0 });
})
test('https get error', async () => {
    expect.assertions(1)

    const url = `${fastifyServer}/error`
    const res = await h2url.concat({ url })

    expect(res.headers[':status']).toBe(500)
  })
test('https post', async () => {
    expect.assertions(2)

    const res = await h2url.concat({
      url: fastifyServer,
      method: 'POST',
      body: JSON.stringify({ hello: 'http2' }),
      headers: {
        'content-type': 'application/json'
      }
    })

    expect(res.headers[':status']).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ hello: 'http2' })
  })
test('https get request', async () => {
    expect.assertions(3)

    const res = await h2url.concat({ url: fastifyServer })

    expect(res.headers[':status']).toBe(200)
    expect(res.headers['content-length']).toBe('' + JSON.stringify(msg).length)
    expect(JSON.parse(res.body)).toEqual(msg)
  })
test('http1 get request', async () => {
    expect.assertions(4)

    const result = await fetch(fastifyServer, {
      dispatcher: new Agent({
        connect: {
          rejectUnauthorized: false
        }
      })
    })

    const body = await result.text()
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual(msg)
  })
test('http1 get error', async () => {
    expect.assertions(2)

    const result = await fetch(`${fastifyServer}/error`, {
      dispatcher: new Agent({
        connect: {
          rejectUnauthorized: false
        }
      })
    })

    expect(result.ok).toBeFalsy()
    expect(result.status).toBe(500)
  })
})
