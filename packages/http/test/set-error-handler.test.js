'use strict'


const Fastify = require('..')
const { XUFA_ERR_ERROR_HANDLER_NOT_FN, XUFA_ERR_ERROR_HANDLER_ALREADY_SET } = require('../lib/errors')

test('setErrorHandler should throw an error if the handler is not a function', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  expect(() => fastify.setErrorHandler('not a function')).toThrow(new XUFA_ERR_ERROR_HANDLER_NOT_FN())

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('setErrorHandler can be set independently in parent and child scopes', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  expect(() => {
    fastify.setErrorHandler(() => {})
    fastify.register(async (child) => {
      child.setErrorHandler(() => {})
    })
  }).not.toThrow()
})

test('setErrorHandler can be overridden if allowErrorHandlerOverride is set to true', async () => {
  expect.assertions(2)

  const fastify = Fastify({
    allowErrorHandlerOverride: true
  })
  onTestFinished(() => fastify.close())

  fastify.register(async (child) => {
    child.setErrorHandler(() => {})
    expect(() => child.setErrorHandler(() => {})).not.toThrow()
  })

  fastify.setErrorHandler(() => {})
  expect(() => fastify.setErrorHandler(() => {})).not.toThrow()

  await fastify.ready()
})

test('setErrorHandler should throw by default if called more than once in the same scope', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  fastify.setErrorHandler(() => {})
  expect(() => fastify.setErrorHandler(() => {})).toThrow(new XUFA_ERR_ERROR_HANDLER_ALREADY_SET())

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('setErrorHandler should throw by default if called more than once in a child scope', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.register(async (child) => {
    child.setErrorHandler(() => {})
    expect(() => child.setErrorHandler(() => {})).toThrow(new XUFA_ERR_ERROR_HANDLER_ALREADY_SET())
  })

  await fastify.ready()
})
