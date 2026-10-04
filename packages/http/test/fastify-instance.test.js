'use strict'


const Fastify = require('..')
const os = require('node:os')

const {
  kOptions,
  kErrorHandler,
  kChildLoggerFactory,
  kState
} = require('../lib/symbols')

const isIPv6Missing = !Object.values(os.networkInterfaces()).flat().some(({ family }) => family === 'IPv6')

test('root fastify instance is an object', async () => {
  expect.assertions(1)
  expect(typeof Fastify()).toBe('object')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('fastify instance should contains ajv options', async () => {
  expect.assertions(1)
  const fastify = Fastify({
    ajv: {
      customOptions: {
        nullable: false
      }
    }
  })
  expect(fastify[kOptions].ajv).toEqual({
    customOptions: {
      nullable: false
    },
    plugins: []
  })

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('fastify instance should contains ajv options.plugins nested arrays', async () => {
  expect.assertions(1)
  const fastify = Fastify({
    ajv: {
      customOptions: {
        nullable: false
      },
      plugins: [[]]
    }
  })
  expect(fastify[kOptions].ajv).toEqual({
    customOptions: {
      nullable: false
    },
    plugins: [[]]
  })

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('fastify instance get invalid ajv options', async () => {
  expect.assertions(1)
  expect(() => Fastify({
    ajv: {
      customOptions: 8
    }
  })).toThrow()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('fastify instance get invalid ajv options.plugins', async () => {
  expect.assertions(1)
  expect(() => Fastify({
    ajv: {
      customOptions: {},
      plugins: 8
    }
  })).toThrow()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('fastify instance should contain default errorHandler', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  expect(fastify[kErrorHandler].func instanceof Function).toBeTruthy()
  expect(fastify.errorHandler).toEqual(fastify[kErrorHandler].func)
  expect(Object.getOwnPropertyDescriptor(fastify, 'errorHandler').set).toEqual(undefined)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('errorHandler in plugin should be separate from the external one', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    const inPluginErrHandler = (_, __, reply) => {
      reply.send({ plugin: 'error-object' })
    }

    instance.setErrorHandler(inPluginErrHandler)

    expect(instance.errorHandler).not.toEqual(fastify.errorHandler)
    expect(instance.errorHandler.name).toBe('bound inPluginErrHandler')

    done()
  })

  await fastify.ready()

  expect(fastify[kErrorHandler].func instanceof Function).toBeTruthy()
  expect(fastify.errorHandler).toEqual(fastify[kErrorHandler].func)
})

test('fastify instance should contain default childLoggerFactory', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  expect(fastify[kChildLoggerFactory] instanceof Function).toBeTruthy()
  expect(fastify.childLoggerFactory).toEqual(fastify[kChildLoggerFactory])
  expect(Object.getOwnPropertyDescriptor(fastify, 'childLoggerFactory').set).toEqual(undefined)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('childLoggerFactory in plugin should be separate from the external one', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    const inPluginLoggerFactory = function (logger, bindings, opts) {
      return logger.child(bindings, opts)
    }

    instance.setChildLoggerFactory(inPluginLoggerFactory)

    expect(instance.childLoggerFactory).not.toEqual(fastify.childLoggerFactory)
    expect(instance.childLoggerFactory.name).toBe('inPluginLoggerFactory')

    done()
  })

  await fastify.ready()

  expect(fastify[kChildLoggerFactory] instanceof Function).toBeTruthy()
  expect(fastify.childLoggerFactory).toEqual(fastify[kChildLoggerFactory])
})

test('ready should resolve in order when called multiply times (promises only)', async () => {
  const app = Fastify()
  const expectedOrder = [1, 2, 3, 4, 5]
  const result = []

  const promises = [1, 2, 3, 4, 5]
    .map((id) => app.ready().then(() => result.push(id)))

  await Promise.all(promises)

  expect(result).toEqual(expectedOrder)
})

test('ready should reject in order when called multiply times (promises only)', async () => {
  const app = Fastify()
  const expectedOrder = [1, 2, 3, 4, 5]
  const result = []

  app.register((instance, opts, done) => {
    setTimeout(() => done(new Error('test')), 500)
  })

  const promises = [1, 2, 3, 4, 5]
    .map((id) => app.ready().catch(() => result.push(id)))

  await Promise.all(promises)

  expect(result).toEqual(expectedOrder)
})

test('ready should reject in order when called multiply times (callbacks only)', async () => {
  const app = Fastify()
  const expectedOrder = [1, 2, 3, 4, 5]
  const result = []

  app.register((instance, opts, done) => {
    setTimeout(() => done(new Error('test')), 500)
  })

  expectedOrder.map((id) => app.ready(() => result.push(id)))

  await app.ready().catch(err => {
    expect(err.message).toBe('test')
  })

  expect(result).toEqual(expectedOrder)
})

test('ready should resolve in order when called multiply times (callbacks only)', async () => {
  const app = Fastify()
  const expectedOrder = [1, 2, 3, 4, 5]
  const result = []

  expectedOrder.map((id) => app.ready(() => result.push(id)))

  await app.ready()

  expect(result).toEqual(expectedOrder)
})

test('ready should resolve in order when called multiply times (mixed)', async () => {
  const app = Fastify()
  const expectedOrder = [1, 2, 3, 4, 5, 6]
  const result = []

  for (const order of expectedOrder) {
    if (order % 2) {
      app.ready(() => result.push(order))
    } else {
      app.ready().then(() => result.push(order))
    }
  }

  await app.ready()

  expect(result).toEqual(expectedOrder)
})

test('ready should reject in order when called multiply times (mixed)', async () => {
  const app = Fastify()
  const expectedOrder = [1, 2, 3, 4, 5, 6]
  const result = []

  app.register((instance, opts, done) => {
    setTimeout(() => done(new Error('test')), 500)
  })

  for (const order of expectedOrder) {
    if (order % 2) {
      app.ready(() => result.push(order))
    } else {
      app.ready().then(null, () => result.push(order))
    }
  }

  await app.ready().catch(err => {
    expect(err.message).toBe('test')
  })

  expect(result).toEqual(expectedOrder)
})

test('ready should resolve in order when called multiply times (mixed)', async () => {
  const app = Fastify()
  const expectedOrder = [1, 2, 3, 4, 5, 6]
  const result = []

  for (const order of expectedOrder) {
    if (order % 2) {
      app.ready().then(() => result.push(order))
    } else {
      app.ready(() => result.push(order))
    }
  }

  await app.ready()

  expect(result).toEqual(expectedOrder)
})

test('fastify instance should contains listeningOrigin property (with port and host)', async () => {
  expect.assertions(1)
  const port = 3000
  const host = '127.0.0.1'
  const fastify = Fastify()
  await fastify.listen({ port, host })
  expect(fastify.listeningOrigin).toEqual(`http://${host}:${port}`)
  await fastify.close()
})

test('fastify instance should contains listeningOrigin property (with port and https)', async () => {
  expect.assertions(1)
  const port = 3000
  const host = '127.0.0.1'
  const fastify = Fastify({ https: {} })
  await fastify.listen({ port, host })
  expect(fastify.listeningOrigin).toEqual(`https://${host}:${port}`)
  await fastify.close()
})

test.skipIf(os.platform() === 'win32')('fastify instance should contains listeningOrigin property (unix socket)', async () => {
  const fastify = Fastify()
  const path = `fastify.${Date.now()}.sock`
  await fastify.listen({ path })
  expect(fastify.listeningOrigin).toEqual(path)
  await fastify.close()
})

test.skipIf(isIPv6Missing)('fastify instance should contains listeningOrigin property (IPv6)', async () => {
  expect.assertions(1)
  const port = 3000
  const host = '::1'
  const fastify = Fastify()
  await fastify.listen({ port, host })
  expect(fastify.listeningOrigin).toEqual(`http://[::1]:${port}`)
  await fastify.close()
})

test('fastify instance should ensure ready promise cleanup on ready', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  await fastify.ready()
  expect(fastify[kState].readyResolver).toBe(null)
})
