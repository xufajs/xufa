'use strict'



const { kRouteContext } = require('../lib/symbols')
const Fastify = require('..')

const schema = {
  schema: { },
  config: {
    value1: 'foo',
    value2: true
  }
}

function handler (req, reply) {
  reply.send(reply[kRouteContext].config)
}

test('config', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.get('/get', {
    schema: schema.schema,
    config: Object.assign({}, schema.config)
  }, handler)

  fastify.route({
    method: 'GET',
    url: '/route',
    schema: schema.schema,
    handler,
    config: Object.assign({}, schema.config)
  })

  fastify.route({
    method: 'GET',
    url: '/no-config',
    schema: schema.schema,
    handler
  })

  let response = await fastify.inject({
    method: 'GET',
    url: '/route'
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual(Object.assign({ url: '/route', method: 'GET' }, schema.config))

  response = await fastify.inject({
    method: 'GET',
    url: '/route'
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual(Object.assign({ url: '/route', method: 'GET' }, schema.config))

  response = await fastify.inject({
    method: 'GET',
    url: '/no-config'
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({ url: '/no-config', method: 'GET' })
})

test('config with exposeHeadRoutes', async () => {
  expect.assertions(6)
  const fastify = Fastify({ exposeHeadRoutes: true })

  fastify.get('/get', {
    schema: schema.schema,
    config: Object.assign({}, schema.config)
  }, handler)

  fastify.route({
    method: 'GET',
    url: '/route',
    schema: schema.schema,
    handler,
    config: Object.assign({}, schema.config)
  })

  fastify.route({
    method: 'GET',
    url: '/no-config',
    schema: schema.schema,
    handler
  })

  let response = await fastify.inject({
    method: 'GET',
    url: '/get'
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual(Object.assign({ url: '/get', method: 'GET' }, schema.config))

  response = await fastify.inject({
    method: 'GET',
    url: '/route'
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual(Object.assign({ url: '/route', method: 'GET' }, schema.config))

  response = await fastify.inject({
    method: 'GET',
    url: '/no-config'
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({ url: '/no-config', method: 'GET' })
})

test('config without exposeHeadRoutes', async () => {
  expect.assertions(6)
  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.get('/get', {
    schema: schema.schema,
    config: Object.assign({}, schema.config)
  }, handler)

  fastify.route({
    method: 'GET',
    url: '/route',
    schema: schema.schema,
    handler,
    config: Object.assign({}, schema.config)
  })

  fastify.route({
    method: 'GET',
    url: '/no-config',
    schema: schema.schema,
    handler
  })

  let response = await fastify.inject({
    method: 'GET',
    url: '/get'
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual(Object.assign({ url: '/get', method: 'GET' }, schema.config))

  response = await fastify.inject({
    method: 'GET',
    url: '/route'
  })
  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual(Object.assign({ url: '/route', method: 'GET' }, schema.config))

  response = await fastify.inject({
    method: 'GET',
    url: '/no-config'
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({ url: '/no-config', method: 'GET' })
})
