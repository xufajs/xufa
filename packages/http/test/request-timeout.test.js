'use strict'

const http = require('node:http')

const Fastify = require('..')

test('requestTimeout passed to server', async () => {
  expect.assertions(5)

  try {
    Fastify({ requestTimeout: 500.1 })
    expect.fail('option must be an integer')
  } catch (err) {
    expect(err).toBeTruthy()
  }

  try {
    Fastify({ requestTimeout: [] })
    expect.fail('option must be an integer')
  } catch (err) {
    expect(err).toBeTruthy()
  }

  const httpServer = Fastify({ requestTimeout: 1000 }).server
  expect(httpServer.requestTimeout).toBe(1000)

  const httpsServer = Fastify({ requestTimeout: 1000, https: true }).server
  expect(httpsServer.requestTimeout).toBe(1000)

  const serverFactory = (handler, _) => {
    const server = http.createServer((req, res) => {
      handler(req, res)
    })
    server.requestTimeout = 5000
    return server
  }
  const customServer = Fastify({ requestTimeout: 4000, serverFactory }).server
  expect(customServer.requestTimeout).toBe(5000)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('requestTimeout should be set', async () => {
  expect.assertions(1)

  const initialConfig = Fastify({ requestTimeout: 5000 }).initialConfig
  expect(initialConfig.requestTimeout).toBe(5000)
})

test('requestTimeout should 0', async () => {
  expect.assertions(1)

  const initialConfig = Fastify().initialConfig
  expect(initialConfig.requestTimeout).toBe(0)
})
