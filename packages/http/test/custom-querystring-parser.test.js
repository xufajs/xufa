'use strict'


const querystring = require('node:querystring')
const Fastify = require('..')

test('Custom querystring parser', async () => {
  expect.assertions(7)

  const fastify = Fastify({
    querystringParser: function (str) {
      expect(str).toBe('foo=bar&baz=faz')
      return querystring.parse(str)
    }
  })

  fastify.get('/', (req, reply) => {
    expect(req.query).toEqual({
      foo: 'bar',
      baz: 'faz'
    })
    reply.send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(`${fastifyServer}?foo=bar&baz=faz`)
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)

  const injectResponse = await fastify.inject({
    method: 'GET',
    url: `${fastifyServer}?foo=bar&baz=faz`
  })
  expect(injectResponse.statusCode).toBe(200)
})

test('Custom querystring parser should be called also if there is nothing to parse', async () => {
  expect.assertions(7)

  const fastify = Fastify({
    querystringParser: function (str) {
      expect(str).toBe('')
      return querystring.parse(str)
    }
  })

  fastify.get('/', (req, reply) => {
    expect(req.query).toEqual({})
    reply.send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)

  const injectResponse = await fastify.inject({
    method: 'GET',
    url: fastifyServer
  })
  expect(injectResponse.statusCode).toBe(200)
})

test('Querystring without value', async () => {
  expect.assertions(7)

  const fastify = Fastify({
    querystringParser: function (str) {
      expect(str).toBe('foo')
      return querystring.parse(str)
    }
  })

  fastify.get('/', (req, reply) => {
    expect(req.query).toEqual({ foo: '' })
    reply.send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(`${fastifyServer}?foo`)
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)

  const injectResponse = await fastify.inject({
    method: 'GET',
    url: `${fastifyServer}?foo`
  })
  expect(injectResponse.statusCode).toBe(200)
})

test('Custom querystring parser should be a function', async () => {
  expect.assertions(1)

  try {
    Fastify({
      routerOptions: {
        querystringParser: 10
      }
    })
    expect.fail('Should throw')
  } catch (err) {
    expect(err.message).toBe("querystringParser option should be a function, instead got 'number'")
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
