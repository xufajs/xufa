'use strict'


const fastify = require('@xufa/http')()
fastify.addHttpMethod('TRACE', { overrideExisting: true })

test('shorthand - trace', async () => {
  expect.assertions(1)
  try {
    fastify.route({
      method: 'TRACE',
      url: '/',
      handler: function (request, reply) {
        reply.code(200).send('TRACE OK')
      }
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
