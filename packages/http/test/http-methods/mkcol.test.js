'use strict'


const fastify = require('@xufa/http')()
fastify.addHttpMethod('MKCOL')

test('can be created - mkcol', async () => {
  expect.assertions(1)
  try {
    fastify.route({
      method: 'MKCOL',
      url: '*',
      handler: function (req, reply) {
        reply.code(201).send()
      }
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

describe('mkcol test', () => {
let fastifyServer;
afterAll(() => { fastify.close() })
beforeAll(async () => {
fastifyServer = await fastify.listen({ port: 0 });
})
test('request - mkcol', async () => {
    expect.assertions(2)
    const result = await fetch(`${fastifyServer}/test/`, {
      method: 'MKCOL'
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(201)
  })
})
