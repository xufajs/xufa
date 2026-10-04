'use strict'


const Fastify = require('..')

const maxHeaderSize = 1024

test('Should return 431 if request header fields are too large', async () => {
  expect.assertions(2)

  const fastify = Fastify({ http: { maxHeaderSize } })
  fastify.route({
    method: 'GET',
    url: '/',
    handler: (_req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer, {
    method: 'GET',
    headers: {
      'Large-Header': 'a'.repeat(maxHeaderSize)
    }
  })

  expect(result.ok).toBeFalsy()
  expect(result.status).toBe(431)

  onTestFinished(() => fastify.close())
})

test('Should return 431 if URI is too long', async () => {
  expect.assertions(2)

  const fastify = Fastify({ http: { maxHeaderSize } })
  fastify.route({
    method: 'GET',
    url: '/',
    handler: (_req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(`${fastifyServer}/${'a'.repeat(maxHeaderSize)}`)

  expect(result.ok).toBeFalsy()
  expect(result.status).toBe(431)

  onTestFinished(() => fastify.close())
})
