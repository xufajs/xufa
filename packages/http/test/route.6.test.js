'use strict'

const stream = require('node:stream')
const { ReadableStream } = require('node:stream/web')

const Fastify = require('..')
const { assertNoWarning } = require('./helper')

test('Creates a HEAD route for a GET one with prefixTrailingSlash', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  const arr = []
  fastify.register((instance, opts, next) => {
    instance.addHook('onRoute', (routeOptions) => {
      arr.push(`${routeOptions.method} ${routeOptions.url}`)
    })

    instance.route({
      method: 'GET',
      path: '/',
      exposeHeadRoute: true,
      prefixTrailingSlash: 'both',
      handler: (req, reply) => {
        reply.send({ here: 'is coffee' })
      }
    })

    next()
  }, { prefix: '/v1' })

  await fastify.ready()

  expect(true).toBeTruthy()
})

test('Will not create a HEAD route that is not GET', async () => {
  expect.assertions(8)

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
      reply.send()
    }
  })

  fastify.route({
    method: 'POST',
    path: '/something',
    handler: (req, reply) => {
      reply.send({ look: 'It is something!' })
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
  expect(res.headers['content-type']).toBe(undefined)
  expect(res.headers['content-length']).toBe('0')
  expect(res.body).toBe('')

  res = await fastify.inject({
    method: 'HEAD',
    url: '/something'
  })

  expect(res.statusCode).toBe(404)
})

test('HEAD route should handle properly each response type', async () => {
  expect.assertions(24)

  const fastify = Fastify({ exposeHeadRoutes: true })
  const resString = 'Found me!'
  const resJSON = { here: 'is Johnny' }
  const resBuffer = Buffer.from('I am a buffer!')
  const resStream = stream.Readable.from('I am a stream!')
  const resWebStream = ReadableStream.from('I am a web stream!')

  fastify.route({
    method: 'GET',
    path: '/json',
    handler: (req, reply) => {
      reply.send(resJSON)
    }
  })

  fastify.route({
    method: 'GET',
    path: '/string',
    handler: (req, reply) => {
      reply.send(resString)
    }
  })

  fastify.route({
    method: 'GET',
    path: '/buffer',
    handler: (req, reply) => {
      reply.send(resBuffer)
    }
  })

  fastify.route({
    method: 'GET',
    path: '/buffer-with-content-type',
    handler: (req, reply) => {
      reply.headers({ 'content-type': 'image/jpeg' })
      reply.send(resBuffer)
    }
  })

  fastify.route({
    method: 'GET',
    path: '/stream',
    handler: (req, reply) => {
      return resStream
    }
  })

  fastify.route({
    method: 'GET',
    path: '/web-stream',
    handler: (req, reply) => {
      return resWebStream
    }
  })

  let res = await fastify.inject({
    method: 'HEAD',
    url: '/json'
  })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
  expect(res.headers['content-length']).toBe(`${Buffer.byteLength(JSON.stringify(resJSON))}`)
  expect(res.body).toEqual('')

  res = await fastify.inject({
    method: 'HEAD',
    url: '/string'
  })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('text/plain; charset=utf-8')
  expect(res.headers['content-length']).toBe(`${Buffer.byteLength(resString)}`)
  expect(res.body).toBe('')

  res = await fastify.inject({
    method: 'HEAD',
    url: '/buffer'
  })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('application/octet-stream')
  expect(res.headers['content-length']).toBe(`${resBuffer.byteLength}`)
  expect(res.body).toBe('')

  res = await fastify.inject({
    method: 'HEAD',
    url: '/buffer-with-content-type'
  })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('image/jpeg')
  expect(res.headers['content-length']).toBe(`${resBuffer.byteLength}`)
  expect(res.body).toBe('')

  res = await fastify.inject({
    method: 'HEAD',
    url: '/stream'
  })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe(undefined)
  expect(res.headers['content-length']).toBe(undefined)
  expect(res.body).toBe('')

  res = await fastify.inject({
    method: 'HEAD',
    url: '/web-stream'
  })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe(undefined)
  expect(res.headers['content-length']).toBe(undefined)
  expect(res.body).toBe('')
})

test('HEAD route should respect custom onSend handlers', async () => {
  expect.assertions(5)

  let counter = 0
  const resBuffer = Buffer.from('I am a coffee!')
  const fastify = Fastify({ exposeHeadRoutes: true })
  const customOnSend = (res, reply, payload, done) => {
    counter = counter + 1
    done(null, payload)
  }

  fastify.route({
    method: 'GET',
    path: '/more-coffee',
    handler: (req, reply) => {
      reply.send(resBuffer)
    },
    onSend: [customOnSend, customOnSend]
  })

  const res = await fastify.inject({
    method: 'HEAD',
    url: '/more-coffee'
  })

  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('application/octet-stream')
  expect(res.headers['content-length']).toBe(`${resBuffer.byteLength}`)
  expect(res.body).toBe('')
  expect(counter).toBe(2)
})

test('route onSend can be function or array of functions', async () => {
  expect.assertions(10)
  const counters = { single: 0, multiple: 0 }

  const resBuffer = Buffer.from('I am a coffee!')
  const fastify = Fastify({ exposeHeadRoutes: true })

  fastify.route({
    method: 'GET',
    path: '/coffee',
    handler: () => resBuffer,
    onSend: (res, reply, payload, done) => {
      counters.single += 1
      done(null, payload)
    }
  })

  const customOnSend = (res, reply, payload, done) => {
    counters.multiple += 1
    done(null, payload)
  }

  fastify.route({
    method: 'GET',
    path: '/more-coffee',
    handler: () => resBuffer,
    onSend: [customOnSend, customOnSend]
  })

  let res = await fastify.inject({ method: 'HEAD', url: '/coffee' })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('application/octet-stream')
  expect(res.headers['content-length']).toBe(`${resBuffer.byteLength}`)
  expect(res.body).toBe('')
  expect(counters.single).toBe(1)

  res = await fastify.inject({ method: 'HEAD', url: '/more-coffee' })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('application/octet-stream')
  expect(res.headers['content-length']).toBe(`${resBuffer.byteLength}`)
  expect(res.body).toBe('')
  expect(counters.multiple).toBe(2)
})

test('no warning for exposeHeadRoute', async (ctx) => {
  assertNoWarning(ctx)

  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    path: '/more-coffee',
    exposeHeadRoute: true,
    async handler () {
      return 'hello world'
    }
  })

  await fastify.ready()
})
