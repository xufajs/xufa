'use strict'


const Fastify = require('..')

const fastify = Fastify()

describe('hasRoute', () => {
test('hasRoute - invalid options', async () => {
    expect.assertions(3)

    expect(fastify.hasRoute({ })).toBe(false)
    expect(fastify.hasRoute({ method: 'GET' })).toBe(false)
    expect(fastify.hasRoute({ constraints: [] })).toBe(false)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('hasRoute - primitive method', async () => {
    expect.assertions(2)
    fastify.route({
      method: 'GET',
      url: '/',
      handler: function (req, reply) {
        reply.send({ hello: 'world' })
      }
    })

    expect(fastify.hasRoute({
      method: 'GET',
      url: '/'
    })).toBe(true)

    expect(fastify.hasRoute({
      method: 'POST',
      url: '/'
    })).toBe(false)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('hasRoute - with constraints', async () => {
    expect.assertions(2)
    fastify.route({
      method: 'GET',
      url: '/',
      constraints: { version: '1.2.0' },
      handler: (req, reply) => {
        reply.send({ hello: 'world' })
      }
    })

    expect(fastify.hasRoute({
      method: 'GET',
      url: '/',
      constraints: { version: '1.2.0' }
    })).toBe(true)

    expect(fastify.hasRoute({
      method: 'GET',
      url: '/',
      constraints: { version: '1.3.0' }
    })).toBe(false)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('hasRoute - parametric route regexp with constraints', async () => {
    expect.assertions(1)
    // parametric with regexp
    fastify.get('/example/:file(^\\d+).png', function (request, reply) { })

    expect(fastify.hasRoute({
      method: 'GET',
      url: '/example/:file(^\\d+).png'
    })).toBe(true)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('hasRoute - finds a route even if method is not uppercased', async () => {
    expect.assertions(1)
    fastify.route({
      method: 'GET',
      url: '/equal',
      handler: function (req, reply) {
        reply.send({ hello: 'world' })
      }
    })

    expect(fastify.hasRoute({
      method: 'get',
      url: '/equal'
    })).toBe(true)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
})
