'use strict'


const Fastify = require('..')

test('route child logger factory does not affect other routes', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  const customRouteChildLogger = (logger, bindings, opts, req) => {
    const child = logger.child(bindings, opts)
    child.customLog = function (message) {
      expect(message).toBe('custom')
    }
    return child
  }

  fastify.route({
    method: 'GET',
    path: '/coffee',
    handler: (req, res) => {
      req.log.customLog('custom')
      res.send()
    },
    childLoggerFactory: customRouteChildLogger
  })

  fastify.route({
    method: 'GET',
    path: '/tea',
    handler: (req, res) => {
      expect(req.log.customLog instanceof Function).toBeTruthy()
      res.send()
    }
  })

  let res = await fastify.inject({
    method: 'GET',
    url: '/coffee'
  })
  expect(res.statusCode).toBe(200)

  res = await fastify.inject({
    method: 'GET',
    url: '/tea'
  })
  expect(res.statusCode).toBe(200)
})
test('route child logger factory overrides global custom error handler', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  const customGlobalChildLogger = (logger, bindings, opts, req) => {
    const child = logger.child(bindings, opts)
    child.globalLog = function (message) {
      expect(message).toBe('global')
    }
    return child
  }
  const customRouteChildLogger = (logger, bindings, opts, req) => {
    const child = logger.child(bindings, opts)
    child.customLog = function (message) {
      expect(message).toBe('custom')
    }
    return child
  }

  fastify.setChildLoggerFactory(customGlobalChildLogger)

  fastify.route({
    method: 'GET',
    path: '/coffee',
    handler: (req, res) => {
      req.log.customLog('custom')
      res.send()
    },
    childLoggerFactory: customRouteChildLogger
  })
  fastify.route({
    method: 'GET',
    path: '/more-coffee',
    handler: (req, res) => {
      req.log.globalLog('global')
      res.send()
    }
  })

  let res = await fastify.inject({
    method: 'GET',
    url: '/coffee'
  })
  expect(res.statusCode).toBe(200)

  res = await fastify.inject({
    method: 'GET',
    url: '/more-coffee'
  })
  expect(res.statusCode).toBe(200)
})

test('Creates a HEAD route for each GET one (default)', async () => {
  expect.assertions(6)

  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    path: '/more-coffee',
    handler: (req, reply) => {
      reply.send({ here: 'is coffee' })
    }
  })

  fastify.route({
    method: 'GET',
    path: '/some-light',
    handler: (req, reply) => {
      reply.send('Get some light!')
    }
  })

  let res = await fastify.inject({
    method: 'HEAD',
    url: '/more-coffee'
  })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
  expect(res.body).toEqual('')

  res = await fastify.inject({
    method: 'HEAD',
    url: '/some-light'
  })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('text/plain; charset=utf-8')
  expect(res.body).toBe('')
})

test('Do not create a HEAD route for each GET one (exposeHeadRoutes: false)', async () => {
  expect.assertions(2)

  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.route({
    method: 'GET',
    path: '/more-coffee',
    handler: (req, reply) => {
      reply.send({ here: 'is coffee' })
    }
  })

  fastify.route({
    method: 'GET',
    path: '/some-light',
    handler: (req, reply) => {
      reply.send('Get some light!')
    }
  })

  let res = await fastify.inject({
    method: 'HEAD',
    url: '/more-coffee'
  })
  expect(res.statusCode).toBe(404)

  res = await fastify.inject({
    method: 'HEAD',
    url: '/some-light'
  })
  expect(res.statusCode).toBe(404)
})

test('Creates a HEAD route for each GET one', async () => {
  expect.assertions(6)

  const fastify = Fastify({ exposeHeadRoutes: true })

  fastify.route({
    method: 'GET',
    path: '/more-coffee',
    handler: (req, reply) => {
      reply.send({ here: 'is coffee' })
    }
  })

  fastify.route({
    method: 'GET',
    path: '/some-light',
    handler: (req, reply) => {
      reply.send('Get some light!')
    }
  })

  let res = await fastify.inject({
    method: 'HEAD',
    url: '/more-coffee'
  })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
  expect(res.body).toEqual('')

  res = await fastify.inject({
    method: 'HEAD',
    url: '/some-light'
  })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('text/plain; charset=utf-8')
  expect(res.body).toBe('')
})
