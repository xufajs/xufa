'use strict'

const stream = require('node:stream')
const { ReadableStream } = require('node:stream/web')
const split = require('split2')

const Fastify = require('..')
const createError = require('@xufa/errors')

test("HEAD route should handle stream.on('error')", (done) => {
  expect.assertions(6)

  const resStream = stream.Readable.from('Hello with error!')
  const logStream = split(JSON.parse)
  const expectedError = new Error('Hello!')
  const fastify = Fastify({
    logger: {
      stream: logStream,
      level: 'error'
    }
  })

  fastify.route({
    method: 'GET',
    path: '/more-coffee',
    exposeHeadRoute: true,
    handler: (req, reply) => {
      process.nextTick(() => resStream.emit('error', expectedError))
      return resStream
    }
  })

  logStream.once('data', line => {
    const { message, stack } = expectedError
    expect(line.err).toEqual({ type: 'Error', message, stack })
    expect(line.msg).toBe('Error on Stream found for HEAD route')
    expect(line.level).toBe(50)
  })

  fastify.inject({
    method: 'HEAD',
    url: '/more-coffee'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe(undefined)
    done()
  })
})

test('HEAD route should handle ReadableStream.cancel() error', (done) => {
  expect.assertions(7)

  const logStream = split(JSON.parse)
  const expectedError = new Error('Cancel error!')
  const fastify = Fastify({
    logger: {
      stream: logStream,
      level: 'error'
    }
  })

  fastify.route({
    method: 'GET',
    path: '/web-stream',
    exposeHeadRoute: true,
    handler: (req, reply) => {
      const webStream = new ReadableStream({
        start (controller) {
          controller.enqueue('Hello from web stream!')
        },
        cancel (reason) {
          expect(reason).toBe('Stream cancelled by HEAD route')
          throw expectedError
        }
      })
      return webStream
    }
  })

  logStream.once('data', line => {
    const { message, stack } = expectedError
    expect(line.err).toEqual({ type: 'Error', message, stack })
    expect(line.msg).toBe('Error on Stream found for HEAD route')
    expect(line.level).toBe(50)
  })

  fastify.inject({
    method: 'HEAD',
    url: '/web-stream'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe(undefined)
    done()
  })
})

test('HEAD route should be exposed by default', async () => {
  expect.assertions(5)

  const resStream = stream.Readable.from('Hello with error!')
  const resJson = { hello: 'world' }
  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    path: '/without-flag',
    handler: (req, reply) => {
      return resStream
    }
  })

  fastify.route({
    exposeHeadRoute: true,
    method: 'GET',
    path: '/with-flag',
    handler: (req, reply) => {
      return resJson
    }
  })

  let res = await fastify.inject({
    method: 'HEAD',
    url: '/without-flag'
  })
  expect(res.statusCode).toBe(200)

  res = await fastify.inject({
    method: 'HEAD',
    url: '/with-flag'
  })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
  expect(res.headers['content-length']).toBe(`${Buffer.byteLength(JSON.stringify(resJson))}`)
  expect(res.body).toBe('')
})

test('HEAD route should be exposed if route exposeHeadRoute is set', async () => {
  expect.assertions(5)

  const resBuffer = Buffer.from('I am a coffee!')
  const resJson = { hello: 'world' }
  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.route({
    exposeHeadRoute: true,
    method: 'GET',
    path: '/one',
    handler: (req, reply) => {
      return resBuffer
    }
  })

  fastify.route({
    method: 'GET',
    path: '/two',
    handler: (req, reply) => {
      return resJson
    }
  })

  let res = await fastify.inject({
    method: 'HEAD',
    url: '/one'
  })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('application/octet-stream')
  expect(res.headers['content-length']).toBe(`${resBuffer.byteLength}`)
  expect(res.body).toBe('')

  res = await fastify.inject({
    method: 'HEAD',
    url: '/two'
  })
  expect(res.statusCode).toBe(404)
})

test('Set a custom HEAD route before GET one without disabling exposeHeadRoutes (global)', (done) => {
  expect.assertions(6)

  const resBuffer = Buffer.from('I am a coffee!')
  const fastify = Fastify({
    exposeHeadRoutes: true
  })

  fastify.route({
    method: 'HEAD',
    path: '/one',
    handler: (req, reply) => {
      reply.header('content-type', 'application/pdf')
      reply.header('content-length', `${resBuffer.byteLength}`)
      reply.header('x-custom-header', 'some-custom-header')
      reply.send()
    }
  })

  fastify.route({
    method: 'GET',
    path: '/one',
    handler: (req, reply) => {
      return resBuffer
    }
  })

  fastify.inject({
    method: 'HEAD',
    url: '/one'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-length']).toBe(`${resBuffer.byteLength}`)
    expect(res.headers['x-custom-header']).toBe('some-custom-header')
    expect(res.body).toBe('')
    done()
  })
})

test('Set a custom HEAD route before GET one without disabling exposeHeadRoutes (route)', (done) => {
  expect.assertions(6)

  const fastify = Fastify()

  const resBuffer = Buffer.from('I am a coffee!')

  fastify.route({
    method: 'HEAD',
    path: '/one',
    handler: (req, reply) => {
      reply.header('content-type', 'application/pdf')
      reply.header('content-length', `${resBuffer.byteLength}`)
      reply.header('x-custom-header', 'some-custom-header')
      reply.send()
    }
  })

  fastify.route({
    method: 'GET',
    exposeHeadRoute: true,
    path: '/one',
    handler: (req, reply) => {
      return resBuffer
    }
  })

  fastify.inject({
    method: 'HEAD',
    url: '/one'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-length']).toBe(`${resBuffer.byteLength}`)
    expect(res.headers['x-custom-header']).toBe('some-custom-header')
    expect(res.body).toBe('')
    done()
  })
})

test('HEAD routes properly auto created for GET routes when prefixTrailingSlash: \'no-slash\'', (done) => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.register(function routes (f, opts, next) {
    f.route({
      method: 'GET',
      url: '/',
      exposeHeadRoute: true,
      prefixTrailingSlash: 'no-slash',
      handler: (req, reply) => {
        reply.send({ hello: 'world' })
      }
    })

    next()
  }, { prefix: '/prefix' })

  fastify.inject({ url: '/prefix/prefix', method: 'HEAD' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    done()
  })
})

test('HEAD routes properly auto created for GET routes when prefixTrailingSlash: \'both\'', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.register(function routes (f, opts, next) {
    f.route({
      method: 'GET',
      url: '/',
      exposeHeadRoute: true,
      prefixTrailingSlash: 'both',
      handler: (req, reply) => {
        reply.send({ hello: 'world' })
      }
    })

    next()
  }, { prefix: '/prefix' })

  const doublePrefixReply = await fastify.inject({ url: '/prefix/prefix', method: 'HEAD' })
  const trailingSlashReply = await fastify.inject({ url: '/prefix/', method: 'HEAD' })
  const noneTrailingReply = await fastify.inject({ url: '/prefix', method: 'HEAD' })

  expect(doublePrefixReply.statusCode).toBe(404)
  expect(trailingSlashReply.statusCode).toBe(200)
  expect(noneTrailingReply.statusCode).toBe(200)
})

test('GET route with body schema should throw', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  expect(() => {
    fastify.route({
      method: 'GET',
      path: '/get',
      schema: {
        body: {}
      },
      handler: function (req, reply) {
        reply.send({ hello: 'world' })
      }
    })
  }).toThrow(createError('XUFA_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED', 'Body validation schema for GET:/get route is not supported!')())

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('HEAD route with body schema should throw', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  expect(() => {
    fastify.route({
      method: 'HEAD',
      path: '/shouldThrow',
      schema: {
        body: {}
      },
      handler: function (req, reply) {
        reply.send({ hello: 'world' })
      }
    })
  }).toThrow(createError('XUFA_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED', 'Body validation schema for HEAD:/shouldThrow route is not supported!')())

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('[HEAD, GET] route with body schema should throw', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  expect(() => {
    fastify.route({
      method: ['HEAD', 'GET'],
      path: '/shouldThrowHead',
      schema: {
        body: {}
      },
      handler: function (req, reply) {
        reply.send({ hello: 'world' })
      }
    })
  }).toThrow(createError('XUFA_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED', 'Body validation schema for HEAD:/shouldThrowHead route is not supported!')())

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('GET route with body schema should throw - shorthand', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  expect(() => {
    fastify.get('/shouldThrow', {
      schema: {
        body: {}
      }
    },
    function (req, reply) {
      reply.send({ hello: 'world' })
    }
    )
  }).toThrow(createError('XUFA_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED', 'Body validation schema for GET:/shouldThrow route is not supported!')())

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('HEAD route with body schema should throw - shorthand', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  expect(() => {
    fastify.head('/shouldThrow2', {
      schema: {
        body: {}
      }
    },
    function (req, reply) {
      reply.send({ hello: 'world' })
    }
    )
  }).toThrow(createError('XUFA_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED', 'Body validation schema for HEAD:/shouldThrow2 route is not supported!')())

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
