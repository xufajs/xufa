'use strict'

const Fastify = require('..')
const http = require('node:http')


test('keepAliveTimeout', async () => {
  expect.assertions(6)

  try {
    Fastify({ keepAliveTimeout: 1.3 })
    expect.fail('option must be an integer')
  } catch (err) {
    expect(err).toBeTruthy()
  }

  try {
    Fastify({ keepAliveTimeout: [] })
    expect.fail('option must be an integer')
  } catch (err) {
    expect(err).toBeTruthy()
  }

  const httpServer = Fastify({ keepAliveTimeout: 1 }).server
  expect(httpServer.keepAliveTimeout).toBe(1)

  const httpsServer = Fastify({ keepAliveTimeout: 2, https: {} }).server
  expect(httpsServer.keepAliveTimeout).toBe(2)

  const http2Server = Fastify({ keepAliveTimeout: 3, http2: true }).server
  expect(http2Server.keepAliveTimeout).not.toBe(3)

  const serverFactory = (handler, _) => {
    const server = http.createServer((req, res) => {
      handler(req, res)
    })
    server.keepAliveTimeout = 5
    return server
  }
  const customServer = Fastify({ keepAliveTimeout: 4, serverFactory }).server
  expect(customServer.keepAliveTimeout).toBe(5)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
