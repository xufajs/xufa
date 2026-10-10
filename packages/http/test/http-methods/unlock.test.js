'use strict'


const fastify = require('../..')()
fastify.addHttpMethod('UNLOCK')

test('can be created - unlock', async () => {
  expect.assertions(1)
  try {
    fastify.route({
      method: 'UNLOCK',
      url: '*',
      handler: function (req, reply) {
        reply.code(204).send()
      }
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

describe('unlock test', () => {
let fastifyServer;
afterAll(() => { fastify.close() })
beforeAll(async () => {
fastifyServer = await fastify.listen({ port: 0 });
})
test('request - unlock', async () => {
    expect.assertions(2)
    const result = await fetch(`${fastifyServer}/test/a.txt`, {
      method: 'UNLOCK',
      headers: {
        'Lock-Token': 'urn:uuid:a515cfa4-5da4-22e1-f5b5-00a0451e6bf7'
      }
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(204)
  })
})
