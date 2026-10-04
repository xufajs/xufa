'use strict'


const Fastify = require('..')
const {
  XUFA_ERR_DEC_ALREADY_PRESENT
} = require('../lib/errors')

test('Should be able to override the default use API', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  fastify.decorate('use', () => true)
  expect(fastify.use()).toBe(true)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Cannot decorate use twice', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  fastify.decorate('use', () => true)
  try {
    fastify.decorate('use', () => true)
  } catch (err) {
    expect(err instanceof XUFA_ERR_DEC_ALREADY_PRESENT).toBeTruthy()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Encapsulation works', () => {
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.decorate('use', () => true)
    expect(instance.use()).toBe(true)
    done()
  })

  fastify.ready()
})
