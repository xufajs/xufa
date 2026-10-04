'use strict'


const Fastify = require('../..')
const h2url = require('h2url')
const msg = { hello: 'world' }

describe('http2 unknown http method', () => {
const fastify = Fastify({
    http2: true
  })
fastify.get('/', function (req, reply) {
    reply.code(200).send(msg)
  })
afterAll(() => { fastify.close() })
beforeAll(async () => {
await fastify.listen({ port: 0 })
})
test('http UNKNOWN_METHOD request', async () => {
    expect.assertions(2)

    const url = `http://localhost:${fastify.server.address().port}`
    const res = await h2url.concat({ url, method: 'UNKNOWN_METHOD' })

    expect(res.headers[':status']).toBe(404)
    expect(JSON.parse(res.body)).toEqual({
      statusCode: 404,
      code: 'XUFA_ERR_NOT_FOUND',
      error: 'Not Found',
      message: 'Not Found'
    })
  })
})
