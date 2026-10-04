'use strict'

const Fastify = require('..')
const http = require('node:http')


test('connectionTimeout', async () => {
  expect.assertions(6)

  try {
    Fastify({ connectionTimeout: 1.3 })
    expect.fail('option must be an integer')
  } catch (err) {
    expect(err).toBeTruthy()
  }

  try {
    Fastify({ connectionTimeout: [] })
    expect.fail('option must be an integer')
  } catch (err) {
    expect(err).toBeTruthy()
  }

  const httpServer = Fastify({ connectionTimeout: 1 }).server
  expect(httpServer.timeout).toBe(1)

  const httpsServer = Fastify({ connectionTimeout: 2, https: {} }).server
  expect(httpsServer.timeout).toBe(2)

  const http2Server = Fastify({ connectionTimeout: 3, http2: true }).server
  expect(http2Server.timeout).toBe(3)

  const serverFactory = (handler, _) => {
    const server = http.createServer((req, res) => {
      handler(req, res)
    })
    server.setTimeout(5)
    return server
  }
  const customServer = Fastify({ connectionTimeout: 4, serverFactory }).server
  expect(customServer.timeout).toBe(5)
})
