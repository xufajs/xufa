'use strict'


const Fastify = require('..')

// asyncDispose doesn't exist in node <= 16
test.skipIf(!('asyncDispose' in Symbol))('async dispose should close fastify', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  await fastify.listen({ port: 0 })

  expect(fastify.server.listening).toBe(true)

  // the same as syntax sugar for
  // await using app = fastify()
  await fastify[Symbol.asyncDispose]()
  expect(fastify.server.listening).toBe(false)
})
