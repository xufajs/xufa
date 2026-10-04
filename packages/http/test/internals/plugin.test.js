'use strict'



const pluginUtilsPublic = require('../../lib/plugin-utils')
const symbols = require('../../lib/symbols')
const pluginUtils = require('../../lib/plugin-utils')[symbols.kTestInternals]

test("shouldSkipOverride should check the 'skip-override' symbol", async () => {
  expect.assertions(2)

  yes[Symbol.for('skip-override')] = true

  expect(pluginUtils.shouldSkipOverride(yes)).toBeTruthy()
  expect(pluginUtils.shouldSkipOverride(no)).toBeFalsy()

  function yes () {}
  function no () {}

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('getPluginName should return plugin name if the file is cached', async () => {
  expect.assertions(1)
  const expectedPluginName = 'example'
  const fn = () => console.log('is just an example')
  require.cache[expectedPluginName] = { exports: fn }
  const pluginName = pluginUtilsPublic.getPluginName(fn)

  expect(pluginName).toBe(expectedPluginName)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('getPluginName should not throw when require.cache is undefined', async () => {
  expect.assertions(1)
  function example () {
    console.log('is just an example')
  }
  const cache = require.cache
  require.cache = undefined
  onTestFinished(() => {
    require.cache = cache
  })
  const pluginName = pluginUtilsPublic.getPluginName(example)

  expect(pluginName).toBe('example')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test("getMeta should return the object stored with the 'plugin-meta' symbol", async () => {
  expect.assertions(1)

  const meta = { hello: 'world' }
  fn[Symbol.for('plugin-meta')] = meta

  expect(meta).toEqual(pluginUtils.getMeta(fn))

  function fn () {}

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('checkDecorators should check if the given decorator is present in the instance', async () => {
  expect.assertions(1)

  fn[Symbol.for('plugin-meta')] = {
    decorators: {
      fastify: ['plugin'],
      reply: ['plugin'],
      request: ['plugin']
    }
  }

  function context () {}
  context.plugin = true
  context[symbols.kReply] = { prototype: { plugin: true }, props: [] }
  context[symbols.kRequest] = { prototype: { plugin: true }, props: [] }

  try {
    pluginUtils.checkDecorators.call(context, fn)
    expect('Everything ok').toBeTruthy()
  } catch (err) {
    expect.fail(err)
  }

  function fn () {}

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('checkDecorators should check if the given decorator is present in the instance (errored)', async () => {
  expect.assertions(1)

  fn[Symbol.for('plugin-meta')] = {
    decorators: {
      fastify: ['plugin'],
      reply: ['plugin'],
      request: ['plugin']
    }
  }

  function context () {}
  context.plugin = true
  context[symbols.kReply] = { prototype: { plugin: true }, props: [] }
  context[symbols.kRequest] = { prototype: {}, props: [] }

  try {
    pluginUtils.checkDecorators.call(context, fn)
    expect.fail('should throw')
  } catch (err) {
    expect(err.message).toBe("The decorator 'plugin' is not present in Request")
  }

  function fn () {}

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('checkDecorators should accept optional decorators', async () => {
  expect.assertions(1)

  fn[Symbol.for('plugin-meta')] = {
    decorators: { }
  }

  function context () {}
  context.plugin = true
  context[symbols.kReply] = { prototype: { plugin: true } }
  context[symbols.kRequest] = { prototype: { plugin: true } }

  try {
    pluginUtils.checkDecorators.call(context, fn)
    expect('Everything ok').toBeTruthy()
  } catch (err) {
    expect.fail(err)
  }

  function fn () {}

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('checkDependencies should check if the given dependency is present in the instance', async () => {
  expect.assertions(1)

  fn[Symbol.for('plugin-meta')] = {
    dependencies: ['plugin']
  }

  function context () {}
  context[pluginUtilsPublic.kRegisteredPlugins] = ['plugin']

  try {
    pluginUtils.checkDependencies.call(context, fn)
    expect('Everything ok').toBeTruthy()
  } catch (err) {
    expect.fail(err)
  }

  function fn () {}

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('checkDependencies should check if the given dependency is present in the instance (errored)', async () => {
  expect.assertions(3)

  fn[Symbol.for('plugin-meta')] = {
    name: 'test-plugin',
    dependencies: ['plugin']
  }

  function context () {}
  context[pluginUtilsPublic.kRegisteredPlugins] = []

  try {
    pluginUtils.checkDependencies.call(context, fn)
    expect.fail('should throw')
  } catch (err) {
    expect(err.message).toBe("The dependency 'plugin' of plugin 'test-plugin' is not registered")
    expect(err.code).toBe('XUFA_ERR_PLUGIN_DEPENDENCY_NOT_REGISTERED')
    expect(err.name).toBe('XufaError')
  }

  function fn () {}

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
