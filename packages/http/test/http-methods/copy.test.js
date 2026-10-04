'use strict'


const fastify = require('@xufa/http')()
fastify.addHttpMethod('COPY')

test('can be created - copy', async () => {
  expect.assertions(3)

  onTestFinished(() => fastify.close())

  try {
    fastify.route({
      method: 'COPY',
      url: '*',
      handler: function (req, reply) {
        reply.code(204).send()
      }
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(`${fastifyServer}/test.txt`, {
    method: 'COPY',
    headers: {
      Destination: '/test2.txt'
    }
  })
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(204)
})
