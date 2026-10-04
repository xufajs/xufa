'use strict'


const Fastify = require('..')

test('route error handler overrides global custom error handler', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  const customGlobalErrorHandler = (error, request, reply) => {
    expect(error).toBeFalsy()
    reply.code(429).send({ message: 'Too much coffee' })
  }

  const customRouteErrorHandler = (error, request, reply) => {
    expect(error.message).toBe('Wrong Pot Error')
    reply.code(418).send({
      message: 'Make a brew',
      statusCode: 418,
      error: 'Wrong Pot Error'
    })
  }

  fastify.setErrorHandler(customGlobalErrorHandler)

  fastify.route({
    method: 'GET',
    path: '/more-coffee',
    handler: (req, res) => {
      res.send(new Error('Wrong Pot Error'))
    },
    errorHandler: customRouteErrorHandler
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/more-coffee'
  })
  expect(res.statusCode).toBe(418)
  expect(JSON.parse(res.payload)).toEqual({
    message: 'Make a brew',
    statusCode: 418,
    error: 'Wrong Pot Error'
  })
})

test('throws when route with empty url', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  try {
    fastify.route({
      method: 'GET',
      url: '',
      handler: (req, res) => {
        res.send('hi!')
      }
    })
  } catch (err) {
    expect(err.message).toBe('The path could not be empty')
  }
})

test('throws when route with empty url in shorthand declaration', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  try {
    fastify.get(
      '',
      async function handler () { return {} }
    )
  } catch (err) {
    expect(err.message).toBe('The path could not be empty')
  }
})

test('throws when route-level error handler is not a function', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  try {
    fastify.route({
      method: 'GET',
      url: '/tea',
      handler: (req, res) => {
        res.send('hi!')
      },
      errorHandler: 'teapot'
    })
  } catch (err) {
    expect(err.message).toBe('Error Handler for GET:/tea route, if defined, must be a function')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('route child logger factory overrides default child logger factory', async () => {
  expect.assertions(2)

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

  const res = await fastify.inject({
    method: 'GET',
    url: '/coffee'
  })

  expect(res.statusCode).toBe(200)
})
