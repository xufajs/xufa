'use strict'

const { AsyncLocalStorage } = require('node:async_hooks')

const Fastify = require('..')

test('Async Local Storage test', async (ctx) => {
  expect.assertions(12)
  if (!AsyncLocalStorage) {
    ctx.skip('AsyncLocalStorage not available, skipping test')
    process.exit(0)
  }

  const storage = new AsyncLocalStorage()
  const app = Fastify({ logger: false })

  onTestFinished(() => app.close())

  let counter = 0
  app.addHook('onRequest', (req, reply, next) => {
    const id = counter++
    storage.run({ id }, next)
  })

  app.get('/', function (request, reply) {
    expect(storage.getStore()).toBeTruthy()
    const id = storage.getStore().id
    reply.send({ id })
  })

  app.post('/', function (request, reply) {
    expect(storage.getStore()).toBeTruthy()
    const id = storage.getStore().id
    reply.send({ id })
  })

  const fastifyServer = await app.listen({ port: 0 })

  // First POST request
  const result1 = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hello: 'world' })
  })
  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)
  expect(await result1.json()).toEqual({ id: 0 })

  const result2 = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hello: 'world' })
  })
  expect(result2.ok).toBeTruthy()
  expect(result2.status).toBe(200)
  expect(await result2.json()).toEqual({ id: 1 })

  // GET request
  const result3 = await fetch(fastifyServer, {
    method: 'GET'
  })
  expect(result3.ok).toBeTruthy()
  expect(result3.status).toBe(200)
  expect(await result3.json()).toEqual({ id: 2 })
})
