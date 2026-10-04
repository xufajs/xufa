'use strict'


const Fastify = require('..')

test('The request id header key can be customized', async () => {
  expect.assertions(2)
  const REQUEST_ID = '42'

  const fastify = Fastify({
    requestIdHeader: 'my-custom-request-id'
  })

  fastify.get('/', (req, reply) => {
    expect(req.id).toBe(REQUEST_ID)
    reply.send({ id: req.id })
  })

  const response = await fastify.inject({ method: 'GET', url: '/', headers: { 'my-custom-request-id': REQUEST_ID } })
  const body = await response.json()
  expect(body.id).toBe(REQUEST_ID)
})

test('The request id header key can be customized', async () => {
  expect.assertions(2)
  const REQUEST_ID = '42'

  const fastify = Fastify({
    requestIdHeader: 'my-custom-request-id'
  })

  fastify.get('/', (req, reply) => {
    expect(req.id).toBe(REQUEST_ID)
    reply.send({ id: req.id })
  })

  const response = await fastify.inject({ method: 'GET', url: '/', headers: { 'MY-CUSTOM-REQUEST-ID': REQUEST_ID } })
  const body = await response.json()
  expect(body.id).toBe(REQUEST_ID)
})

test('The request id header key can be customized', async () => {
  expect.assertions(3)
  const REQUEST_ID = '42'

  const fastify = Fastify({
    requestIdHeader: 'my-custom-request-id'
  })

  fastify.get('/', (req, reply) => {
    expect(req.id).toBe(REQUEST_ID)
    reply.send({ id: req.id })
  })

  onTestFinished(() => fastify.close())

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer, {
    headers: {
      'my-custom-request-id': REQUEST_ID
    }
  })
  expect(result.ok).toBeTruthy()
  expect(await result.json()).toEqual({ id: REQUEST_ID })
})

test('The request id header key can be customized', async () => {
  expect.assertions(3)
  const REQUEST_ID = '42'

  const fastify = Fastify({
    requestIdHeader: 'my-custom-request-id'
  })

  fastify.get('/', (req, reply) => {
    expect(req.id).toBe(REQUEST_ID)
    reply.send({ id: req.id })
  })

  onTestFinished(() => fastify.close())

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer, {
    headers: {
      'MY-CUSTOM-REQUEST-ID': REQUEST_ID
    }
  })
  expect(result.ok).toBeTruthy()
  expect(await result.json()).toEqual({ id: REQUEST_ID })
})

test('The request id header key can be customized', async () => {
  expect.assertions(3)
  const REQUEST_ID = '42'

  const fastify = Fastify({
    requestIdHeader: 'MY-CUSTOM-REQUEST-ID'
  })

  fastify.get('/', (req, reply) => {
    expect(req.id).toBe(REQUEST_ID)
    reply.send({ id: req.id })
  })

  onTestFinished(() => fastify.close())

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer, {
    headers: {
      'MY-CUSTOM-REQUEST-ID': REQUEST_ID
    }
  })
  expect(result.ok).toBeTruthy()
  expect(await result.json()).toEqual({ id: REQUEST_ID })
})
