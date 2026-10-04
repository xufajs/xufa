'use strict'

const fastq = require('../lib/queue').createQueue
const boot = require('..')

const { Plugin } = require('../lib/plugin')

test('successfully load a plugin with sync function', (testDone) => {
  expect.assertions(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), function (instance, opts, done) {
    done()
  }, false, 0)

  app._loadPlugin(plugin, function (err) {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('catch an error when loading a plugin with sync function', (testDone) => {
  expect.assertions(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), function (instance, opts, done) {
    done(Error('ArbitraryError'))
  }, false, 0)

  app._loadPlugin(plugin, function (err) {
    expect(err.message).toBe('ArbitraryError')
    testDone()
  })
})

test('successfully load a plugin with sync function without done as a parameter', (testDone) => {
  expect.assertions(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), function (instance, opts) { }, false, 0)

  app._loadPlugin(plugin, function (err) {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('successfully load a plugin with async function', (testDone) => {
  expect.assertions(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), async function (instance, opts) { }, false, 0)

  app._loadPlugin(plugin, function (err) {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('catch an error when loading a plugin with async function', (testDone) => {
  expect.assertions(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), async function (instance, opts) {
    throw Error('ArbitraryError')
  }, false, 0)

  app._loadPlugin(plugin, function (err) {
    expect(err.message).toBe('ArbitraryError')
    testDone()
  })
})

test('successfully load a plugin when function is a Promise, which resolves to a function', (testDone) => {
  expect.assertions(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), new Promise(resolve => resolve(function (instance, opts, done) {
    done()
  })), false, 0)

  app._loadPlugin(plugin, function (err) {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('catch an error when loading a plugin when function is a Promise, which resolves to a function', (testDone) => {
  expect.assertions(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), new Promise(resolve => resolve(function (instance, opts, done) {
    done(Error('ArbitraryError'))
  })), false, 0)

  app._loadPlugin(plugin, function (err) {
    expect(err.message).toBe('ArbitraryError')
    testDone()
  })
})

test('successfully load a plugin when function is a Promise, which resolves to a function, which is wrapped in default', (testDone) => {
  expect.assertions(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), new Promise(resolve => resolve({
    default: function (instance, opts, done) {
      done()
    }
  })), false, 0)

  app._loadPlugin(plugin, function (err) {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('catch an error when loading a plugin when function is a Promise, which resolves to a function, which is wrapped in default', (testDone) => {
  expect.assertions(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), new Promise(resolve => resolve({
    default: function (instance, opts, done) {
      done(Error('ArbitraryError'))
    }
  })), false, 0)

  app._loadPlugin(plugin, function (err) {
    expect(err.message).toBe('ArbitraryError')
    testDone()
  })
})
