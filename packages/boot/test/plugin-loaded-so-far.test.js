'use strict'


const fastq = require('../lib/queue').createQueue
const boot = require('..')
const { Plugin } = require('../lib/plugin')

test('loadedSoFar resolves a Promise, if plugin.loaded is set to true', async () => {
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), function (instance, opts, done) {
    done()
  }, false, 0)

  plugin.loaded = true

  await expect((() => plugin.loadedSoFar())()).resolves.not.toThrow()
})

test('loadedSoFar resolves a Promise, if plugin was loaded by avvio', async () => {
  expect.assertions(1)
  const app = boot({})

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), function (instance, opts, done) {
    done()
  }, false, 0)

  app._loadPlugin(plugin, function (err) {
    expect(err).toBeFalsy()
  })

  await app.ready()

  await plugin.loadedSoFar()
})

test('loadedSoFar resolves a Promise, if .after() has no error', async () => {
  const app = boot()

  app.after = function (callback) {
    callback(null, () => {})
  }

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), function (instance, opts, done) {
    done()
  }, false, 0)

  app._loadPlugin(plugin, function () {})

  await plugin.loadedSoFar()
})

test('loadedSoFar rejects a Promise, if .after() has an error', async () => {
  expect.assertions(1)
  const app = boot()

  app.after = function (fn) {
    fn(new Error('ArbitraryError'), () => {})
  }

  const plugin = new Plugin(fastq(app, app._loadPluginNextTick, 1), function (instance, opts, done) {
    done()
  }, false, 0)

  app._loadPlugin(plugin, function () {})

  await expect(plugin.loadedSoFar()).rejects.toThrow(new Error('ArbitraryError'))
})

test('loadedSoFar resolves a Promise, if Plugin is attached to avvio after it the Plugin was instantiated', async () => {
  const plugin = new Plugin(fastq(null, null, 1), function (instance, opts, done) {
    done()
  }, false, 0)

  const promise = plugin.loadedSoFar()

  plugin.server = boot()
  plugin.emit('start')

  await expect(promise).resolves.not.toThrow()
})
