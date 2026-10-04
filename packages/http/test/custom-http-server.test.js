'use strict'


const http = require('node:http')
const dns = require('node:dns').promises
const Fastify = require('..')
const { XUFA_ERR_FORCE_CLOSE_CONNECTIONS_IDLE_NOT_AVAILABLE } = require('../lib/errors')

async function setup () {
  const localAddresses = await dns.lookup('localhost', { all: true })

  test.skipIf(localAddresses.length < 1)('Should support a custom http server', async () => {
    expect.assertions(5)

    const fastify = Fastify({
      serverFactory: (handler, opts) => {
        expect(opts.serverFactory).toBeTruthy()

        const server = http.createServer((req, res) => {
          req.custom = true
          handler(req, res)
        })

        return server
      }
    })

    onTestFinished(() => fastify.close())
    fastify.get('/', (req, reply) => {
      expect(req.raw.custom).toBeTruthy()
      reply.send({ hello: 'world' })
    })

    await fastify.listen({ port: 0 })

    const response = await fetch('http://localhost:' + fastify.server.address().port, {
      method: 'GET'
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(JSON.parse(body)).toEqual({ hello: 'world' })
  })

  test('Should not allow forceCloseConnection=idle if the server does not support closeIdleConnections', async () => {
    expect.assertions(1)

    expect(() => {
        Fastify({
          forceCloseConnections: 'idle',
          serverFactory (handler, opts) {
            return {
              on () {

              }
            }
          }
        })
      }).toThrow(XUFA_ERR_FORCE_CLOSE_CONNECTIONS_IDLE_NOT_AVAILABLE)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

  test('Should not make an extra closeIdleConnections call for native servers', async () => {
    const fastify = Fastify({
      forceCloseConnections: 'idle'
    })

    await fastify.listen({ port: 0 })

    let called = 0
    fastify.server.closeIdleConnections = function () {
      called++
    }

    await fastify.close()

    expect(called).toBe(1)
  })

  test('Should preserve the extra closeIdleConnections call for custom servers', async () => {
    let called = 0
    const fastify = Fastify({
      forceCloseConnections: 'idle',
      serverFactory (handler) {
        const server = http.createServer(handler)
        const originalCloseIdleConnections = server.closeIdleConnections.bind(server)
        server.closeIdleConnections = function () {
          called++
          return originalCloseIdleConnections()
        }
        return server
      }
    })

    await fastify.listen({ port: 0 })
    await fastify.close()

    expect(called).toBe(2)
  })

  test('Should accept user defined serverFactory and ignore secondary server creation', async () => {
    const server = http.createServer(() => { })
    onTestFinished(() => new Promise(resolve => server.close(resolve)))
    const app = Fastify({
      serverFactory: () => server
    })
    await expect((async () => { await app.listen({ port: 0 }) })()).resolves.not.toThrow()
  })

  test('Should not call close on the server if it has not created it', async () => {
    const server = http.createServer()

    const serverFactory = (handler, opts) => {
      server.on('request', handler)
      return server
    }

    const fastify = Fastify({ serverFactory })

    fastify.get('/', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    await fastify.ready()

    await new Promise((resolve, reject) => {
      server.listen(0)
      server.on('listening', resolve)
      server.on('error', reject)
    })

    const address = server.address()
    expect(server.listening).toBe(true)
    await fastify.close()

    expect(server.listening).toBe(true)
    expect(server.address()).toEqual(address)
    expect(fastify.addresses()).toEqual([address])

    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          return reject(err)
        }
        resolve()
      })
    })
    expect(server.listening).toBe(false)
    expect(server.address()).toEqual(null)
  })
}

describe('server', async () => {
  await setup()
})
