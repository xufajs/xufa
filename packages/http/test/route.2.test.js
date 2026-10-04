'use strict'


const Fastify = require('@xufa/http')

test('same route definition object on multiple prefixes', async () => {
  expect.assertions(2)

  const routeObject = {
    handler: () => { },
    method: 'GET',
    url: '/simple'
  }

  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.register(async function (f) {
    f.addHook('onRoute', (routeOptions) => {
      expect(routeOptions.url).toBe('/v1/simple')
    })
    f.route(routeObject)
  }, { prefix: '/v1' })
  fastify.register(async function (f) {
    f.addHook('onRoute', (routeOptions) => {
      expect(routeOptions.url).toBe('/v2/simple')
    })
    f.route(routeObject)
  }, { prefix: '/v2' })

  await fastify.ready()
})

test('path can be specified in place of uri', (done) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    path: '/path',
    handler: function (req, reply) {
      reply.send({ hello: 'world' })
    }
  })

  const reqOpts = {
    method: 'GET',
    url: '/path'
  }

  fastify.inject(reqOpts, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    done()
  })
})

test('invalid bodyLimit option - route', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  try {
    fastify.route({
      bodyLimit: false,
      method: 'PUT',
      handler: () => null
    })
    expect.fail('bodyLimit must be an integer')
  } catch (err) {
    expect(err.message).toBe("'bodyLimit' option must be an integer > 0. Got 'false'")
  }

  try {
    fastify.post('/url', { bodyLimit: 10000.1 }, () => null)
    expect.fail('bodyLimit must be an integer')
  } catch (err) {
    expect(err.message).toBe("'bodyLimit' option must be an integer > 0. Got '10000.1'")
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('handler function in options of shorthand route should works correctly', (done) => {
  expect.assertions(3)

  const fastify = Fastify()
  fastify.get('/foo', {
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/foo'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    done()
  })
})
