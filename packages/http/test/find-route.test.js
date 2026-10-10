'use strict'


const Fastify = require('..')
const fastifyPlugin = require('..').plugin

test('findRoute should return null when route cannot be found due to a different method', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.get('/artists/:artistId', {
    schema: {
      params: { artistId: { type: 'integer' } }
    },
    handler: (req, reply) => reply.send(typeof req.params.artistId)
  })

  expect(fastify.findRoute({
    method: 'POST',
    url: '/artists/:artistId'
  })).toBe(null)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('findRoute should return an immutable route to avoid leaking and runtime route modifications', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.get('/artists/:artistId', {
    schema: {
      params: { artistId: { type: 'integer' } }
    },
    handler: (req, reply) => reply.send(typeof req.params.artistId)
  })

  let route = fastify.findRoute({
    method: 'GET',
    url: '/artists/:artistId'
  })

  route.params = {
    ...route.params,
    id: ':id'
  }

  route = fastify.findRoute({
    method: 'GET',
    url: '/artists/:artistId'
  })

  expect(route.params.artistId).toBe(':artistId')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('findRoute should return null when when url is not passed', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.get('/artists/:artistId', {
    schema: {
      params: { artistId: { type: 'integer' } }
    },
    handler: (req, reply) => reply.send(typeof req.params.artistId)
  })

  expect(fastify.findRoute({
    method: 'POST'
  })).toBe(null)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('findRoute should return null when method is not passed', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.get('/artists/:artistId', {
    schema: {
      params: { artistId: { type: 'integer' } }
    },
    handler: (req, reply) => reply.send(typeof req.params.artistId)
  })

  expect(fastify.findRoute({
    url: '/artists/:artistId'
  })).toBe(null)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('findRoute should return null when route cannot be found due to a different path', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.get('/artists/:artistId', {
    schema: {
      params: { artistId: { type: 'integer' } }
    },
    handler: (req, reply) => reply.send(typeof req.params.artistId)
  })

  expect(fastify.findRoute({
    method: 'GET',
    url: '/books/:bookId'
  })).toBe(null)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('findRoute should return the route when found', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  const handler = (req, reply) => reply.send(typeof req.params.artistId)

  fastify.get('/artists/:artistId', {
    schema: {
      params: { artistId: { type: 'integer' } }
    },
    handler
  })

  const route = fastify.findRoute({
    method: 'GET',
    url: '/artists/:artistId'
  })
  expect(route.params.artistId).toBe(':artistId')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('findRoute should find a route even if method is not uppercased', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.get('/artists/:artistId', {
    schema: {
      params: { artistId: { type: 'integer' } }
    },
    handler: (req, reply) => reply.send(typeof req.params.artistId)
  })

  const route = fastify.findRoute({
    method: 'get',
    url: '/artists/:artistId'
  })
  expect(route).not.toBe(null)
  expect(route.params.artistId).toBe(':artistId')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('findRoute should work correctly when used within plugins', (done) => {
  expect.assertions(1)
  const fastify = Fastify()
  const handler = (req, reply) => reply.send(typeof req.params.artistId)
  fastify.get('/artists/:artistId', {
    schema: {
      params: { artistId: { type: 'integer' } }
    },
    handler
  })

  function validateRoutePlugin (instance, opts, done) {
    const validateParams = function () {
      return instance.findRoute({
        method: 'GET',
        url: '/artists/:artistId'
      }) !== null
    }
    instance.decorate('validateRoutes', { validateParams })
    done()
  }

  fastify.register(fastifyPlugin(validateRoutePlugin))

  fastify.ready(() => {
    expect(fastify.validateRoutes.validateParams()).toBe(true)
    done()
  })
})

test('findRoute should not expose store', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.get('/artists/:artistId', {
    schema: {
      params: { artistId: { type: 'integer' } }
    },
    handler: (req, reply) => reply.send(typeof req.params.artistId)
  })

  const route = fastify.findRoute({
    method: 'GET',
    url: '/artists/:artistId'
  })
  expect(route.store).toBe(undefined)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
