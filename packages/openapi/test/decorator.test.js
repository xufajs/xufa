'use strict'


const Fastify = require('@xufa/http')
const fastifySwagger = require('../index')

test('fastify.swagger should exist', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger)

  await fastify.ready()
  expect(fastify.swagger).toBeTruthy()
})

test('fastify.swagger should throw if called before ready', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger)

  expect(fastify.swagger.bind(fastify)).toThrow()
})

test('fastify.swagger should throw if called before ready (openapi)', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, {
    openapi: {}
  })

  expect(fastify.swagger.bind(fastify)).toThrow()
})

test('decorator can be overridden', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  await fastify.register(fastifySwagger, { decorator: 'customSwaggerDecorator' })

  await fastify.ready()
  expect(fastify.customSwaggerDecorator()).toBeTruthy()
})
