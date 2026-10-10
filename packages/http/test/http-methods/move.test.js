'use strict'


const fastify = require('../..')()
fastify.addHttpMethod('MOVE')

test('shorthand - move', async () => {
  expect.assertions(1)
  try {
    fastify.route({
      method: 'MOVE',
      url: '*',
      handler: function (req, reply) {
        const destination = req.headers.destination
        reply.code(201)
          .header('location', destination)
          .send()
      }
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
describe('move test', () => {
let fastifyServer;
afterAll(() => { fastify.close() })
beforeAll(async () => {
fastifyServer = await fastify.listen({ port: 0 });
})
test('request - move', async () => {
    expect.assertions(3)
    const result = await fetch(`${fastifyServer}/test.txt`, {
      method: 'MOVE',
      headers: {
        Destination: '/test2.txt'
      }
    })
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(201)
    expect(result.headers.get('location')).toBe('/test2.txt')
  })
})
