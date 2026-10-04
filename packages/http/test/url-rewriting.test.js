'use strict'


const Fastify = require('..')

test('Should rewrite url', async () => {
  expect.assertions(4)
  const fastify = Fastify({
    rewriteUrl (req) {
      expect(req.url).toBe('/this-would-404-without-url-rewrite')
      this.log.info('rewriting url')
      return '/'
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  onTestFinished(() => fastify.close())

  const result = await fetch(`${fastifyServer}/this-would-404-without-url-rewrite`)

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({ hello: 'world' })
})

test('Should not rewrite if the url is the same', async () => {
  expect.assertions(3)
  const fastify = Fastify({
    rewriteUrl (req) {
      expect(req.url).toBe('/this-would-404-without-url-rewrite')
      this.log.info('rewriting url')
      return req.url
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  onTestFinished(() => fastify.close())

  const result = await fetch(`${fastifyServer}/this-would-404-without-url-rewrite`)

  expect(result.ok).toBeFalsy()
  expect(result.status).toBe(404)
})

test('Should throw an error', async () => {
  expect.assertions(2)
  const fastify = Fastify({
    rewriteUrl (req) {
      expect(req.url).toBe('/this-would-404-without-url-rewrite')
      this.log.info('rewriting url')
      return undefined
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  onTestFinished(() => fastify.close())

  try {
    await fetch(`${fastifyServer}/this-would-404-without-url-rewrite`)
    expect.fail('Expected fetch to throw an error')
  } catch (err) {
    expect(err instanceof Error).toBeTruthy()
  }
})

test('Should rewrite url but keep originalUrl unchanged', async () => {
  expect.assertions(6)
  const fastify = Fastify({
    rewriteUrl (req) {
      expect(req.url).toBe('/this-would-404-without-url-rewrite')
      expect(req.originalUrl).toBe('/this-would-404-without-url-rewrite')
      return '/'
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    handler: (req, reply) => {
      reply.send({ hello: 'world', hostname: req.hostname, port: req.port })
      expect(req.originalUrl).toBe('/this-would-404-without-url-rewrite')
    }
  })

  await fastify.listen({ port: 0 })
  const port = fastify.server.address().port

  onTestFinished(() => fastify.close())

  const result = await fetch(`http://localhost:${port}/this-would-404-without-url-rewrite`)

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({ hello: 'world', hostname: 'localhost', port })
})
