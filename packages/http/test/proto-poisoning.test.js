'use strict'

const Fastify = require('..')


test('proto-poisoning error', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.post('/', (request, reply) => {
    expect.fail('handler should not be called')
  })

  onTestFinished(() => fastify.close())

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ "__proto__": { "a": 42 } }'
  })

  expect(result.ok).toBeFalsy()
  expect(result.status).toBe(400)
})

test('proto-poisoning remove', async () => {
  expect.assertions(3)

  const fastify = Fastify({ onProtoPoisoning: 'remove' })

  onTestFinished(() => fastify.close())

  fastify.post('/', (request, reply) => {
    expect(undefined).toBe(Object.assign({}, request.body).a)
    reply.send({ ok: true })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ "__proto__": { "a": 42 }, "b": 42 }'
  })

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
})

test('proto-poisoning ignore', async () => {
  expect.assertions(3)

  const fastify = Fastify({ onProtoPoisoning: 'ignore' })

  fastify.post('/', (request, reply) => {
    expect(42).toBe(Object.assign({}, request.body).a)
    reply.send({ ok: true })
  })

  onTestFinished(() => fastify.close())

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ "__proto__": { "a": 42 }, "b": 42 }'
  })

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
})

test('constructor-poisoning error (default in v3)', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.post('/', (request, reply) => {
    reply.send('ok')
  })

  onTestFinished(() => fastify.close())

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ "constructor": { "prototype": { "foo": "bar" } } }'
  })

  expect(result.ok).toBeFalsy()
  expect(result.status).toBe(400)
})

test('constructor-poisoning error', async () => {
  expect.assertions(2)

  const fastify = Fastify({ onConstructorPoisoning: 'error' })

  onTestFinished(() => fastify.close())

  fastify.post('/', (request, reply) => {
    expect.fail('handler should not be called')
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ "constructor": { "prototype": { "foo": "bar" } } }'
  })

  expect(result.ok).toBeFalsy()
  expect(result.status).toBe(400)
})

test('constructor-poisoning remove', async () => {
  expect.assertions(3)

  const fastify = Fastify({ onConstructorPoisoning: 'remove' })

  onTestFinished(() => fastify.close())

  fastify.post('/', (request, reply) => {
    expect(undefined).toBe(Object.assign({}, request.body).foo)
    reply.send({ ok: true })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ "constructor": { "prototype": { "foo": "bar" } } }'
  })

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
})
