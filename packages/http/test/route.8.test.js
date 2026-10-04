'use strict'


const Fastify = require('..')
const {
  XUFA_ERR_INVALID_URL
} = require('../lib/errors')

test('Request and Reply share the route options', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  const config = {
    this: 'is a string',
    thisIs: function aFunction () {}
  }

  fastify.route({
    method: 'GET',
    url: '/',
    config,
    handler: (req, reply) => {
      expect(req.routeOptions).toEqual(reply.routeOptions)
      expect(req.routeOptions.config).toEqual(reply.routeOptions.config)
      expect(req.routeOptions.config).toMatch(config)

      reply.send({ hello: 'world' })
    }
  })

  await fastify.inject('/')
})

test('Will not try to re-createprefixed HEAD route if it already exists and exposeHeadRoutes is true', async () => {
  expect.assertions(1)

  const fastify = Fastify({ exposeHeadRoutes: true })

  fastify.register((scope, opts, next) => {
    scope.route({
      method: 'HEAD',
      path: '/route',
      handler: (req, reply) => {
        reply.header('content-type', 'text/plain')
        reply.send('custom HEAD response')
      }
    })
    scope.route({
      method: 'GET',
      path: '/route',
      handler: (req, reply) => {
        reply.send({ ok: true })
      }
    })

    next()
  }, { prefix: '/prefix' })

  await fastify.ready()

  expect(true).toBeTruthy()
})

test('route with non-english characters', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/föö', (request, reply) => {
    reply.send('here /föö')
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const response = await fetch(fastifyServer + encodeURI('/föö'))
  expect(response.ok).toBeTruthy()
  expect(response.status).toBe(200)
  const body = await response.text()
  expect(body).toBe('here /föö')
})

test('invalid url attribute - non string URL', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  try {
    fastify.get(/^\/(donations|skills|blogs)/, () => { })
  } catch (error) {
    expect(error.code).toBe(XUFA_ERR_INVALID_URL().code)
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('exposeHeadRoute should not reuse the same route option', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  // we update the onRequest hook in onRoute hook
  // if we reuse the same route option
  // that means we will append another function inside the array
  fastify.addHook('onRoute', function (routeOption) {
    if (Array.isArray(routeOption.onRequest)) {
      routeOption.onRequest.push(() => {})
    } else {
      routeOption.onRequest = [() => {}]
    }
  })

  fastify.addHook('onRoute', function (routeOption) {
    expect(routeOption.onRequest.length).toBe(1)
  })

  fastify.route({
    method: 'GET',
    path: '/more-coffee',
    async handler () {
      return 'hello world'
    }
  })
})

test('using fastify.all when a catchall is defined does not degrade performance', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  fastify.get('/*', async (_, reply) => reply.json({ ok: true }))

  for (let i = 0; i < 100; i++) {
    fastify.all(`/${i}`, async (_, reply) => reply.json({ ok: true }))
  }

  expect("fastify.all doesn't degrade performance").toBeTruthy()
}, 30000)

test('Adding manually HEAD route after GET with the same path throws Fastify duplicated route instance error', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    path: '/:param1',
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  try {
    fastify.route({
      method: 'HEAD',
      path: '/:param2',
      handler: (req, reply) => {
        reply.send({ hello: 'world' })
      }
    })
    expect.fail('Should throw fastify duplicated route declaration')
  } catch (error) {
    expect(error.code).toBe('XUFA_ERR_DUPLICATED_ROUTE')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Will pass onSend hook to HEAD method if exposeHeadRoutes is true /1', async () => {
  expect.assertions(1)

  const fastify = Fastify({ exposeHeadRoutes: true })

  await fastify.register((scope, opts, next) => {
    scope.route({
      method: 'GET',
      path: '/route',
      handler: (req, reply) => {
        reply.send({ ok: true })
      },
      onSend: (req, reply, payload, done) => {
        reply.header('x-content-type', 'application/fastify')
        done(null, payload)
      }
    })

    next()
  }, { prefix: '/prefix' })

  await fastify.ready()

  const result = await fastify.inject({
    url: '/prefix/route',
    method: 'HEAD'
  })

  expect(result.headers['x-content-type']).toBe('application/fastify')
})

test('Will pass onSend hook to HEAD method if exposeHeadRoutes is true /2', async () => {
  expect.assertions(1)

  const fastify = Fastify({ exposeHeadRoutes: true })

  await fastify.register((scope, opts, next) => {
    scope.route({
      method: 'get',
      path: '/route',
      handler: (req, reply) => {
        reply.send({ ok: true })
      },
      onSend: (req, reply, payload, done) => {
        reply.header('x-content-type', 'application/fastify')
        done(null, payload)
      }
    })

    next()
  }, { prefix: '/prefix' })

  await fastify.ready()

  const result = await fastify.inject({
    url: '/prefix/route',
    method: 'HEAD'
  })

  expect(result.headers['x-content-type']).toBe('application/fastify')
})
