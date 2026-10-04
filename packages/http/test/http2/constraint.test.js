'use strict'


const Fastify = require('../..')
const h2url = require('h2url')

const alpha = { res: 'alpha' }
const beta = { res: 'beta' }

const { buildCertificate } = require('../build-certificate')
// Certificates are needed while collecting.
buildCertificate()

describe('A route supports host constraints under http2 protocol and secure connection', () => {

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
const constrain = 'fastify.dev'
fastify.route({
    method: 'GET',
    url: '/',
    handler: function (_, reply) {
      reply.code(200).send(alpha)
    }
  })
fastify.route({
    method: 'GET',
    url: '/beta',
    constraints: { host: constrain },
    handler: function (_, reply) {
      reply.code(200).send(beta)
    }
  })
fastify.route({
    method: 'GET',
    url: '/hostname_port',
    constraints: { host: constrain },
    handler: function (req, reply) {
      reply.code(200).send({ ...beta, hostname: req.hostname })
    }
  })
afterAll(() => { fastify.close() })
beforeAll(async () => {
await fastify.listen({ port: 0 })
})
test('https get request - no constrain', async () => {
    expect.assertions(3)

    const url = `https://localhost:${fastify.server.address().port}`
    const res = await h2url.concat({ url })

    expect(res.headers[':status']).toBe(200)
    expect(res.headers['content-length']).toBe('' + JSON.stringify(alpha).length)
    expect(JSON.parse(res.body)).toEqual(alpha)
  })
test('https get request - constrain', async () => {
    expect.assertions(3)

    const url = `https://localhost:${fastify.server.address().port}/beta`
    const res = await h2url.concat({
      url,
      headers: {
        ':authority': constrain
      }
    })

    expect(res.headers[':status']).toBe(200)
    expect(res.headers['content-length']).toBe('' + JSON.stringify(beta).length)
    expect(JSON.parse(res.body)).toEqual(beta)
  })
test('https get request - constrain - not found', async () => {
    expect.assertions(1)

    const url = `https://localhost:${fastify.server.address().port}/beta`
    const res = await h2url.concat({
      url
    })

    expect(res.headers[':status']).toBe(404)
  })
test('https get request - constrain - verify hostname and port from request', async () => {
    expect.assertions(1)

    const url = `https://localhost:${fastify.server.address().port}/hostname_port`
    const res = await h2url.concat({
      url,
      headers: {
        ':authority': constrain
      }
    })
    const body = JSON.parse(res.body)
    expect(body.hostname).toBe(constrain)
  })
})
