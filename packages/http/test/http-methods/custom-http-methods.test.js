'use strict'

const http = require('node:http')

const Fastify = require('../..')

function addEcho (fastify, method) {
  fastify.route({
    method,
    url: '/',
    handler: function (req, reply) {
      reply.send(req.body)
    }
  })
}

test('missing method from http client', (done) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.listen({ port: 3000 }, (err) => {
    expect(err).toBeFalsy()

    const port = fastify.server.address().port
    const req = http.request({
      port,
      method: 'REBIND',
      path: '/'
    }, (res) => {
      expect(res.statusCode).toBe(404)
      fastify.close()
      done()
    })

    req.end()
  })
})

test('addHttpMethod increase the supported HTTP methods supported', (done) => {
  expect.assertions(8)
  const app = Fastify()

  expect(() => { addEcho(app, 'REBIND') }).toThrow(/REBIND method is not supported./)
  expect(app.supportedMethods.includes('REBIND')).toBeFalsy()
  expect(app.rebind).toBeFalsy()

  app.addHttpMethod('REBIND')
  expect(() => { addEcho(app, 'REBIND') }).not.toThrow()
  expect(app.supportedMethods.includes('REBIND')).toBeTruthy()
  expect(app.rebind).toBeTruthy()

  app.rebind('/foo', () => 'hello')

  app.inject({
    method: 'REBIND',
    url: '/foo'
  }, (err, response) => {
    expect(err).toBeFalsy()
    expect(response.payload).toBe('hello')
    done()
  })
})

test('addHttpMethod adds a new custom method without body', async () => {
  expect.assertions(3)
  const app = Fastify()

  expect(() => { addEcho(app, 'REBIND') }).toThrow(/REBIND method is not supported./)

  app.addHttpMethod('REBIND')
  expect(() => { addEcho(app, 'REBIND') }).not.toThrow()

  expect(() => {
    app.route({
      url: '/',
      method: 'REBIND',
      schema: {
        body: {
          type: 'object',
          properties: {
            hello: { type: 'string' }
          }
        }
      },
      handler: function (req, reply) {
        reply.send(req.body)
      }
    })
  }).toThrow(/Body validation schema for REBIND:\/ route is not supported!/)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('addHttpMethod adds a new custom method with body', (done) => {
  expect.assertions(3)
  const app = Fastify()

  app.addHttpMethod('REBIND', { hasBody: true })
  expect(() => { addEcho(app, 'REBIND') }).not.toThrow()

  app.inject({
    method: 'REBIND',
    url: '/',
    payload: { hello: 'world' }
  }, (err, response) => {
    expect(err).toBeFalsy()
    expect(response.json()).toEqual({ hello: 'world' })
    done()
  })
})

test('addHttpMethod rejects fake http method', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  expect(() => { fastify.addHttpMethod('FOOO') }).toThrow(/Provided method is invalid!/)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('addHttpMethod rejects an implicit override of an existing method', () => {
  const fastify = Fastify()

  onTestFinished(() => {
    fastify.close()
  })

  expect(() => fastify.addHttpMethod('GET', { hasBody: true })).toThrow(expect.objectContaining({ code: 'XUFA_ERR_ROUTE_METHOD_ALREADY_SUPPORTED', message: 'Method "GET" is already supported. Use `overrideExisting: true` to override it.' }))
})

test('addHttpMethod allows an explicit override of an existing method', () => {
  const fastify = Fastify()
  onTestFinished(() => {
    fastify.close()
  })

  expect(() => {
    fastify.addHttpMethod('POST', { overrideExisting: true })
  }).not.toThrow()
})

test('addHttpMethod can change an existing method body behavior', async () => {
  const fastify = Fastify()

  fastify.addHttpMethod('GET', {
    hasBody: true,
    overrideExisting: true
  })
  fastify.route({
    method: 'GET',
    url: '/',
    exposeHeadRoute: false,
    schema: {
      body: {
        type: 'object'
      }
    },
    handler: async request => request.body
  })

  const response = await fastify.inject({
    method: 'GET',
    url: '/',
    payload: { hello: 'world' }
  })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({ hello: 'world' })
})
