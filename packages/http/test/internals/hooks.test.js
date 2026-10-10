'use strict'


const { Hooks } = require('../../lib/hooks')
const { default: fastify } = require('../..')
const noop = () => {}

test('hooks should have 4 array with the registered hooks', () => {
  const hooks = new Hooks()
  expect(typeof hooks).toBe('object')
  expect(Array.isArray(hooks.onRequest)).toBeTruthy()
  expect(Array.isArray(hooks.onSend)).toBeTruthy()
  expect(Array.isArray(hooks.preParsing)).toBeTruthy()
  expect(Array.isArray(hooks.preValidation)).toBeTruthy()
  expect(Array.isArray(hooks.preHandler)).toBeTruthy()
  expect(Array.isArray(hooks.onResponse)).toBeTruthy()
  expect(Array.isArray(hooks.onError)).toBeTruthy()
})

test('hooks.add should add a hook to the given hook', () => {
  const hooks = new Hooks()
  hooks.add('onRequest', noop)
  expect(hooks.onRequest.length).toBe(1)
  expect(typeof hooks.onRequest[0]).toBe('function')

  hooks.add('preParsing', noop)
  expect(hooks.preParsing.length).toBe(1)
  expect(typeof hooks.preParsing[0]).toBe('function')

  hooks.add('preValidation', noop)
  expect(hooks.preValidation.length).toBe(1)
  expect(typeof hooks.preValidation[0]).toBe('function')

  hooks.add('preHandler', noop)
  expect(hooks.preHandler.length).toBe(1)
  expect(typeof hooks.preHandler[0]).toBe('function')

  hooks.add('onResponse', noop)
  expect(hooks.onResponse.length).toBe(1)
  expect(typeof hooks.onResponse[0]).toBe('function')

  hooks.add('onSend', noop)
  expect(hooks.onSend.length).toBe(1)
  expect(typeof hooks.onSend[0]).toBe('function')

  hooks.add('onError', noop)
  expect(hooks.onError.length).toBe(1)
  expect(typeof hooks.onError[0]).toBe('function')
})

test('hooks should throw on unexisting handler', async () => {
  expect.assertions(1)
  const hooks = new Hooks()
  try {
    hooks.add('onUnexistingHook', noop)
    expect.fail()
  } catch (e) {
    expect(true).toBeTruthy()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('should throw on wrong parameters', async () => {
  const hooks = new Hooks()
  expect.assertions(4)
  try {
    hooks.add(null, () => {})
    expect.fail()
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_HOOK_INVALID_TYPE')
    expect(e.message).toBe('The hook name must be a string')
  }

  try {
    hooks.add('onSend', null)
    expect.fail()
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_HOOK_INVALID_HANDLER')
    expect(e.message).toBe('onSend hook should be a function, instead got [object Null]')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Integration test: internal function _addHook should be turned into app.ready() rejection', async () => {
  const app = fastify()

  app.register(async function () {
    app.addHook('notRealHook', async () => {})
  })

  try {
    await app.ready()
    expect.fail('Expected ready() to throw')
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_HOOK_NOT_SUPPORTED')
    expect(err.message).toMatch(/hook not supported/i)
  }
})
