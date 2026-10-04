'use strict'


const Fastify = require('..')

test('use semicolon delimiter default false', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.get('/1234;foo=bar', (req, reply) => {
    reply.send(req.query)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result = await fetch(fastifyServer + '/1234;foo=bar', {
    method: 'GET'
  })
  expect(result.status).toBe(200)
  const body = await result.json()
  expect(body).toEqual({})
})

test('use routerOptions semicolon delimiter default false', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/1234;foo=bar', (req, reply) => {
    reply.send(req.query)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result = await fetch(fastifyServer + '/1234;foo=bar')
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({})
})

test('use routerOptions semicolon delimiter set to true', async () => {
  expect.assertions(3)
  const fastify = Fastify({
    routerOptions: {
      useSemicolonDelimiter: true
    }
  })

  fastify.get('/1234', async (req, reply) => {
    reply.send(req.query)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result = await fetch(fastifyServer + '/1234;foo=bar')
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({
    foo: 'bar'
  })
})

test('use routerOptions semicolon delimiter set to false', async () => {
  expect.assertions(3)

  const fastify = Fastify({
    routerOptions: {
      useSemicolonDelimiter: false
    }
  })

  fastify.get('/1234;foo=bar', (req, reply) => {
    reply.send(req.query)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result = await fetch(fastifyServer + '/1234;foo=bar')
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({})
})

test('use routerOptions semicolon delimiter set to false return 404', async () => {
  expect.assertions(2)

  const fastify = Fastify({
    routerOptions: {
      useSemicolonDelimiter: false
    }
  })

  fastify.get('/1234', (req, reply) => {
    reply.send(req.query)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result = await fetch(fastifyServer + '/1234;foo=bar')
  expect(result.ok).toBeFalsy()
  expect(result.status).toBe(404)
})
