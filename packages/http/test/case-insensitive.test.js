'use strict'


const Fastify = require('..')

test('case insensitive', async () => {
  expect.assertions(3)

  const fastify = Fastify({
    routerOptions: {
      caseSensitive: false
    }
  })
  onTestFinished(() => fastify.close())

  fastify.get('/foo', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(`${fastifyServer}/FOO`)

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({
    hello: 'world'
  })
})

test('case insensitive inject', async () => {
  expect.assertions(2)

  const fastify = Fastify({
    routerOptions: {
      caseSensitive: false
    }
  })
  onTestFinished(() => fastify.close())

  fastify.get('/foo', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fastify.inject({
    method: 'GET',
    url: fastifyServer + '/FOO'
  })

  expect(result.statusCode).toBe(200)
  expect(result.json()).toEqual({
    hello: 'world'
  })
})

test('case insensitive (parametric)', async () => {
  expect.assertions(4)

  const fastify = Fastify({
    routerOptions: {
      caseSensitive: false
    }
  })
  onTestFinished(() => fastify.close())

  fastify.get('/foo/:param', (req, reply) => {
    expect(req.params.param).toBe('bAr')
    reply.send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(`${fastifyServer}/FoO/bAr`, {
    method: 'GET'
  })

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({
    hello: 'world'
  })
})

test('case insensitive (wildcard)', async () => {
  expect.assertions(4)

  const fastify = Fastify({
    routerOptions: {
      caseSensitive: false
    }
  })
  onTestFinished(() => fastify.close())

  fastify.get('/foo/*', (req, reply) => {
    expect(req.params['*']).toBe('bAr/baZ')
    reply.send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(`${fastifyServer}/FoO/bAr/baZ`)

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({
    hello: 'world'
  })
})
