'use strict'


const Fastify = require('..')
const {
  XUFA_ERR_INSTANCE_ALREADY_STARTED,
  XUFA_ERR_ROUTE_METHOD_INVALID
} = require('../lib/errors')
const { getServerUrl } = require('./helper')

describe('route', () => {

test('route - get', async () => {
    expect.assertions(4)

    const fastify = Fastify()
    expect(() =>
      fastify.route({
        method: 'GET',
        url: '/',
        schema: {
          response: {
            '2xx': {
              type: 'object',
              properties: {
                hello: {
                  type: 'string'
                }
              }
            }
          }
        },
        handler: function (req, reply) {
          reply.send({ hello: 'world' })
        }
      })).not.toThrow()

    await fastify.listen({ port: 0 })
    onTestFinished(() => { fastify.close() })

    const response = await fetch(getServerUrl(fastify) + '/')
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ hello: 'world' })
  })
test('missing schema - route', async () => {
    expect.assertions(4)

    const fastify = Fastify()
    expect(() =>
      fastify.route({
        method: 'GET',
        url: '/missing',
        handler: function (req, reply) {
          reply.send({ hello: 'world' })
        }
      })).not.toThrow()

    await fastify.listen({ port: 0 })
    onTestFinished(() => { fastify.close() })

    const response = await fetch(getServerUrl(fastify) + '/missing')
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ hello: 'world' })
  })
test('invalid handler attribute - route', async () => {
    expect.assertions(1)

    const fastify = Fastify()
    expect(() => fastify.get('/', { handler: 'not a function' }, () => { })).toThrow()
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('Add Multiple methods per route all uppercase', async () => {
    expect.assertions(7)

    const fastify = Fastify()
    expect(() =>
      fastify.route({
        method: ['GET', 'DELETE'],
        url: '/multiple',
        handler: function (req, reply) {
          reply.send({ hello: 'world' })
        }
      })).not.toThrow()

    await fastify.listen({ port: 0 })
    onTestFinished(() => { fastify.close() })

    const getResponse = await fetch(getServerUrl(fastify) + '/multiple')
    expect(getResponse.ok).toBeTruthy()
    expect(getResponse.status).toBe(200)
    expect(await getResponse.json()).toEqual({ hello: 'world' })

    const deleteResponse = await fetch(getServerUrl(fastify) + '/multiple', { method: 'DELETE' })
    expect(deleteResponse.ok).toBeTruthy()
    expect(deleteResponse.status).toBe(200)
    expect(await deleteResponse.json()).toEqual({ hello: 'world' })
  })
test('Add Multiple methods per route all lowercase', async () => {
    expect.assertions(7)

    const fastify = Fastify()
    expect(() =>
      fastify.route({
        method: ['get', 'delete'],
        url: '/multiple',
        handler: function (req, reply) {
          reply.send({ hello: 'world' })
        }
      })).not.toThrow()

    await fastify.listen({ port: 0 })
    onTestFinished(() => { fastify.close() })

    const getResponse = await fetch(getServerUrl(fastify) + '/multiple')
    expect(getResponse.ok).toBeTruthy()
    expect(getResponse.status).toBe(200)
    expect(await getResponse.json()).toEqual({ hello: 'world' })

    const deleteResponse = await fetch(getServerUrl(fastify) + '/multiple', { method: 'DELETE' })
    expect(deleteResponse.ok).toBeTruthy()
    expect(deleteResponse.status).toBe(200)
    expect(await deleteResponse.json()).toEqual({ hello: 'world' })
  })
test('Add Multiple methods per route mixed uppercase and lowercase', async () => {
    expect.assertions(7)

    const fastify = Fastify()
    expect(() =>
      fastify.route({
        method: ['GET', 'delete'],
        url: '/multiple',
        handler: function (req, reply) {
          reply.send({ hello: 'world' })
        }
      })).not.toThrow()

    await fastify.listen({ port: 0 })
    onTestFinished(() => { fastify.close() })

    const getResponse = await fetch(getServerUrl(fastify) + '/multiple')
    expect(getResponse.ok).toBeTruthy()
    expect(getResponse.status).toBe(200)
    expect(await getResponse.json()).toEqual({ hello: 'world' })

    const deleteResponse = await fetch(getServerUrl(fastify) + '/multiple', { method: 'DELETE' })
    expect(deleteResponse.ok).toBeTruthy()
    expect(deleteResponse.status).toBe(200)
    expect(await deleteResponse.json()).toEqual({ hello: 'world' })
  })
test('Add invalid Multiple methods per route', async () => {
    expect.assertions(1)

    const fastify = Fastify()
    expect(() =>
      fastify.route({
        method: ['GET', 1],
        url: '/invalid-method',
        handler: function (req, reply) {
          reply.send({ hello: 'world' })
        }
      })).toThrow(new XUFA_ERR_ROUTE_METHOD_INVALID())
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('Add method', async () => {
    expect.assertions(1)

    const fastify = Fastify()
    expect(() =>
      fastify.route({
        method: 1,
        url: '/invalid-method',
        handler: function (req, reply) {
          reply.send({ hello: 'world' })
        }
      })).toThrow(new XUFA_ERR_ROUTE_METHOD_INVALID())
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('Add additional multiple methods to existing route', async () => {
    expect.assertions(7)

    const fastify = Fastify()
    expect(() => {
      fastify.get('/add-multiple', function (req, reply) {
        reply.send({ hello: 'Bob!' })
      })
      fastify.route({
        method: ['PUT', 'DELETE'],
        url: '/add-multiple',
        handler: function (req, reply) {
          reply.send({ hello: 'world' })
        }
      })
    }).not.toThrow()

    await fastify.listen({ port: 0 })
    onTestFinished(() => { fastify.close() })

    const putResponse = await fetch(getServerUrl(fastify) + '/add-multiple', { method: 'PUT' })
    expect(putResponse.ok).toBeTruthy()
    expect(putResponse.status).toBe(200)
    expect(await putResponse.json()).toEqual({ hello: 'world' })

    const deleteResponse = await fetch(getServerUrl(fastify) + '/add-multiple', { method: 'DELETE' })
    expect(deleteResponse.ok).toBeTruthy()
    expect(deleteResponse.status).toBe(200)
    expect(await deleteResponse.json()).toEqual({ hello: 'world' })
  })
test('cannot add another route after binding', async () => {
    expect.assertions(1)

    const fastify = Fastify()

    await fastify.listen({ port: 0 })
    onTestFinished(() => { fastify.close() })

    expect(() => fastify.route({
      method: 'GET',
      url: '/another-get-route',
      handler: function (req, reply) {
        reply.send({ hello: 'world' })
      }
    })).toThrow(new XUFA_ERR_INSTANCE_ALREADY_STARTED('Cannot add route!'))
  })
})

test('invalid schema - route', (done) => {
  expect.assertions(3)

  const fastify = Fastify()
  fastify.route({
    handler: () => { },
    method: 'GET',
    url: '/invalid',
    schema: {
      querystring: {
        id: 'string'
      }
    }
  })
  fastify.after(err => {
    expect(err).toBeFalsy()
  })
  fastify.ready(err => {
    expect(err.code).toBe('XUFA_ERR_SCH_VALIDATION_BUILD')
    expect(err.message).toMatch(/Failed building the validation schema for GET: \/invalid/)
    done()
  })
})
