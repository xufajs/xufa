'use strict'

const net = require('node:net')

const Fastify = require('..')

test('maxRequestsPerSocket', (done) => {
  expect.assertions(8)

  const fastify = Fastify({ maxRequestsPerSocket: 2 })
  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0 }, function (err) {
    expect(err).toBeFalsy()

    const port = fastify.server.address().port
    const client = net.createConnection({ port }, () => {
      client.write('GET / HTTP/1.1\r\nHost: fastify.test\r\n\r\n')

      client.once('data', data => {
        expect(data.toString()).toMatch(/Connection:\s*keep-alive/i)
        expect(data.toString()).toMatch(/Keep-Alive:\s*timeout=\d+/i)
        expect(data.toString()).toMatch(/200 OK/i)

        client.write('GET / HTTP/1.1\r\nHost: fastify.test\r\n\r\n')

        client.once('data', data => {
          expect(data.toString()).toMatch(/Connection:\s*close/i)
          expect(data.toString()).toMatch(/200 OK/i)

          client.write('GET / HTTP/1.1\r\nHost: fastify.test\r\n\r\n')

          client.once('data', data => {
            expect(data.toString()).toMatch(/Connection:\s*close/i)
            expect(data.toString()).toMatch(/503 Service Unavailable/i)
            client.end()
            fastify.close()
            done()
          })
        })
      })
    })
  })
})

test('maxRequestsPerSocket zero should behave same as null', (done) => {
  expect.assertions(10)

  const fastify = Fastify({ maxRequestsPerSocket: 0 })
  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.listen({ port: 0 }, function (err) {
    expect(err).toBeFalsy()

    const port = fastify.server.address().port
    const client = net.createConnection({ port }, () => {
      client.write('GET / HTTP/1.1\r\nHost: fastify.test\r\n\r\n')

      client.once('data', data => {
        expect(data.toString()).toMatch(/Connection:\s*keep-alive/i)
        expect(data.toString()).toMatch(/Keep-Alive:\s*timeout=\d+/i)
        expect(data.toString()).toMatch(/200 OK/i)

        client.write('GET / HTTP/1.1\r\nHost: fastify.test\r\n\r\n')

        client.once('data', data => {
          expect(data.toString()).toMatch(/Connection:\s*keep-alive/i)
          expect(data.toString()).toMatch(/Keep-Alive:\s*timeout=\d+/i)
          expect(data.toString()).toMatch(/200 OK/i)

          client.write('GET / HTTP/1.1\r\nHost: fastify.test\r\n\r\n')

          client.once('data', data => {
            expect(data.toString()).toMatch(/Connection:\s*keep-alive/i)
            expect(data.toString()).toMatch(/Keep-Alive:\s*timeout=\d+/i)
            expect(data.toString()).toMatch(/200 OK/i)
            client.end()
            fastify.close()
            done()
          })
        })
      })
    })
  })
})

test('maxRequestsPerSocket should be set', async () => {
  expect.assertions(1)

  const initialConfig = Fastify({ maxRequestsPerSocket: 5 }).initialConfig
  expect(initialConfig.maxRequestsPerSocket).toEqual(5)
})

test('maxRequestsPerSocket should 0', async () => {
  expect.assertions(1)

  const initialConfig = Fastify().initialConfig
  expect(initialConfig.maxRequestsPerSocket).toEqual(0)
})

test('requestTimeout passed to server', async () => {
  expect.assertions(2)

  const httpServer = Fastify({ maxRequestsPerSocket: 5 }).server
  expect(httpServer.maxRequestsPerSocket).toBe(5)

  const httpsServer = Fastify({ maxRequestsPerSocket: 5, https: true }).server
  expect(httpsServer.maxRequestsPerSocket).toBe(5)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
