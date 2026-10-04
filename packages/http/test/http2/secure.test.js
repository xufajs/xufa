'use strict'


const Fastify = require('../..')
const h2url = require('h2url')
const msg = { hello: 'world' }

const { buildCertificate } = require('../build-certificate')
// Certificates are needed while collecting.
buildCertificate()

describe('secure', () => {

let fastify
try {
    fastify = Fastify({
      http2: true,
      https: {
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
fastify.get('/proto', function (req, reply) {
    reply.code(200).send({ proto: req.protocol })
  })
fastify.get('/hostname_port', function (req, reply) {
    reply.code(200).send({ hostname: req.hostname, port: req.port })
  })
afterAll(() => { fastify.close() })
beforeAll(async () => {
await fastify.listen({ port: 0 })
})
test('https get request', async () => {
    expect.assertions(3)

    const url = `https://localhost:${fastify.server.address().port}`
    const res = await h2url.concat({ url })

    expect(res.headers[':status']).toBe(200)
    expect(res.headers['content-length']).toBe('' + JSON.stringify(msg).length)
    expect(JSON.parse(res.body)).toEqual(msg)
  })
test('https get request without trust proxy - protocol', async () => {
    expect.assertions(2)

    const url = `https://localhost:${fastify.server.address().port}/proto`
    expect(JSON.parse((await h2url.concat({ url })).body)).toEqual({ proto: 'https' })
    expect(JSON.parse((await h2url.concat({ url, headers: { 'X-Forwarded-Proto': 'lorem' } })).body)).toEqual({ proto: 'https' })
  })
test('https get request - test hostname and port', async () => {
    expect.assertions(2)

    const url = `https://localhost:${fastify.server.address().port}/hostname_port`
    const parsedbody = JSON.parse((await h2url.concat({ url })).body)
    expect(parsedbody.hostname).toBe('localhost')
    expect(parsedbody.port).toBe(fastify.server.address().port)
  })
})
