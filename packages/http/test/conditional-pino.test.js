'use strict'



test("pino is not require'd if logger is not passed", async () => {
  expect.assertions(1)

  const fastify = require('..')

  fastify()

  expect(require.cache[require.resolve('@xufa/logger')]).toBe(undefined)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test("pino is require'd if logger is passed", async () => {
  expect.assertions(1)

  const fastify = require('..')

  fastify({
    logger: true
  })

  expect(require.cache[require.resolve('@xufa/logger')]).not.toBe(undefined)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test("pino is require'd if loggerInstance is passed", async () => {
  expect.assertions(1)

  const fastify = require('..')

  const loggerInstance = {
    fatal: (msg) => { },
    error: (msg) => { },
    warn: (msg) => { },
    info: (msg) => { },
    debug: (msg) => { },
    trace: (msg) => { },
    child: () => loggerInstance
  }

  fastify({
    loggerInstance
  })

  expect(require.cache[require.resolve('@xufa/logger')]).not.toBe(undefined)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
