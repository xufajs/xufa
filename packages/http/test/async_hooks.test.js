'use strict'

const { createHook } = require('node:async_hooks')

const Fastify = require('..')

const remainingIds = new Set()

createHook({
  init (asyncId, type, triggerAsyncId, resource) {
    if (type === 'content-type-parser:run') {
      remainingIds.add(asyncId)
    }
  },
  destroy (asyncId) {
    remainingIds.delete(asyncId)
  }
})

const app = Fastify({ logger: false })

test('test async hooks', async () => {
  app.get('/', function (request, reply) {
    reply.send({ id: 42 })
  })

  app.post('/', function (request, reply) {
    reply.send({ id: 42 })
  })

  onTestFinished(() => app.close())

  const fastifyServer = await app.listen({ port: 0 })

  const result1 = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hello: 'world' })
  })
  expect(result1.status).toBe(200)

  const result2 = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hello: 'world' })
  })
  expect(result2.status).toBe(200)

  const result3 = await fetch(fastifyServer)
  expect(result3.status).toBe(200)
  expect(remainingIds.size).toBe(0)
})
