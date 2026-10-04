'use strict'



test('should import as default', async () => {
  expect.assertions(2)
  const fastify = require('..')
  expect(fastify).toBeTruthy()
  expect(typeof fastify).toBe('function')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('should import as esm', async () => {
  expect.assertions(2)
  const { xufa: fastify } = require('..')
  expect(fastify).toBeTruthy()
  expect(typeof fastify).toBe('function')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
