'use strict'


const Fastify = require('..')
const fp = require('..').plugin

test('encapsulates an child logger factory', async () => {
  expect.assertions(4)

  const fastify = Fastify()
  fastify.register(async function (fastify) {
    fastify.setChildLoggerFactory(function pluginFactory (logger, bindings, opts) {
      const child = logger.child(bindings, opts)
      child.customLog = function (message) {
        expect(message).toBe('custom')
      }
      return child
    })
    fastify.get('/encapsulated', async (req) => {
      req.log.customLog('custom')
    })
  })

  fastify.setChildLoggerFactory(function globalFactory (logger, bindings, opts) {
    const child = logger.child(bindings, opts)
    child.globalLog = function (message) {
      expect(message).toBe('global')
    }
    return child
  })
  fastify.get('/not-encapsulated', async (req) => {
    req.log.globalLog('global')
  })

  const res1 = await fastify.inject('/encapsulated')
  expect(res1.statusCode).toBe(200)

  const res2 = await fastify.inject('/not-encapsulated')
  expect(res2.statusCode).toBe(200)
})

test('child logger factory set on root scope when using fastify-plugin', async () => {
  expect.assertions(4)

  const fastify = Fastify()
  fastify.register(fp(async function (fastify) {
    // Using fastify-plugin, the factory should be set on the root scope
    fastify.setChildLoggerFactory(function pluginFactory (logger, bindings, opts) {
      const child = logger.child(bindings, opts)
      child.customLog = function (message) {
        expect(message).toBe('custom')
      }
      return child
    })
    fastify.get('/not-encapsulated-1', async (req) => {
      req.log.customLog('custom')
    })
  }))

  fastify.get('/not-encapsulated-2', async (req) => {
    req.log.customLog('custom')
  })

  const res1 = await fastify.inject('/not-encapsulated-1')
  expect(res1.statusCode).toBe(200)

  const res2 = await fastify.inject('/not-encapsulated-2')
  expect(res2.statusCode).toBe(200)
})
