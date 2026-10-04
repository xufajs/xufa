'use strict'


const Fastify = require('../..')
const h2url = require('h2url')
const msg = { hello: 'world' }

describe('http2 HEAD test', () => {
let fastify
try {
    fastify = Fastify({
      http2: true
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail('http2 loading failed')
  }
fastify.all('/', function (req, reply) {
    reply.code(200).send(msg)
  })
afterAll(() => { fastify.close() })
beforeAll(async () => {
await fastify.listen({ port: 0 })
})
test('http HEAD request', async () => {
    expect.assertions(1)

    const url = `http://localhost:${fastify.server.address().port}`
    const res = await h2url.concat({ url, method: 'HEAD' })

    expect(res.headers[':status']).toBe(200)
  })
})
