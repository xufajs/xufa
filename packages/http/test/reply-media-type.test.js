'use strict'


const Fastify = require('..')

test('reply.mediaType should match the content-type header', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.get('/', (request, reply) => {
    reply.type('application/json')
    expect(reply.mediaType).toBe('application/json')
    reply.send({ mediaType: reply.mediaType })
  })

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  const body = await response.json()
  expect(body.mediaType).toBe('application/json')
})

test('reply.mediaType should strip the charset parameter', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.get('/', (request, reply) => {
    reply.header('content-type', 'application/json; charset=utf-8')
    expect(reply.mediaType).toBe('application/json')
    reply.send({ mediaType: reply.mediaType })
  })

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  const body = await response.json()
  expect(body.mediaType).toBe('application/json')
})

test('reply.mediaType should strip the space', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.get('/', (request, reply) => {
    reply.header('content-type', ' application/json ; charset=utf-8')
    expect(reply.mediaType).toBe('application/json')
    reply.send({ mediaType: reply.mediaType })
  })

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  const body = await response.json()
  expect(body.mediaType).toBe('application/json')
})

test('reply.mediaType is undefined when content-type is not set', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.get('/', (request, reply) => {
    expect(reply.mediaType).toBe(undefined)
    reply.send({ mediaType: reply.mediaType })
  })

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  const body = await response.json()
  expect(body.mediaType).toBe(undefined)
})

test('reply.mediaType supported in hooks', async () => {
  expect.assertions(5)

  const fastify = Fastify()

  fastify.get('/', {
    preHandler: (request, reply, done) => {
      reply.type('application/json')
      expect(reply.mediaType).toBe('application/json')
      done()
    },
    preSerialization: (request, reply, payload, done) => {
      expect(reply.mediaType).toBe('application/json')
      done(null, payload)
    },
    onSend: (request, reply, payload, done) => {
      expect(reply.mediaType).toBe('application/json')
      done(null, payload)
    }
  }, (request, reply) => {
    expect(reply.mediaType).toBe('application/json')
    reply.send({ mediaType: reply.mediaType })
  })

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  const body = await response.json()
  expect(body.mediaType).toBe('application/json')
})

test('reply.mediaType should reflect the last type set', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.get('/', (request, reply) => {
    reply.type('application/json')
    reply.type('text/plain')
    expect(reply.mediaType).toBe('text/plain')
    reply.send(`mediaType = ${reply.mediaType}`)
  })

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  const body = response.body
  expect(body).toBe('mediaType = text/plain')
})

test('reply.mediaType should match the content-type set via raw.setHeader', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.get('/', (request, reply) => {
    reply.raw.setHeader('content-type', 'application/json; charset=utf-8')
    expect(reply.mediaType).toBe('application/json')
    reply.send({ mediaType: reply.mediaType })
  })

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  const body = await response.json()
  expect(body.mediaType).toBe('application/json')
})

test('reply.mediaType should match case-insensitive content-type set via raw.setHeader', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.get('/', (request, reply) => {
    reply.raw.setHeader('Content-Type', 'text/html; charset=utf-8')
    expect(reply.mediaType).toBe('text/html')
    reply.send(reply.mediaType)
  })

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  expect(response.body).toBe('text/html')
})

test('reply.mediaType should prioritize reply.type over raw.setHeader', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.get('/', (request, reply) => {
    reply.raw.setHeader('content-type', 'application/xml')
    reply.type('application/json')
    expect(reply.mediaType).toBe('application/json')
    reply.send({ mediaType: reply.mediaType })
  })

  const response = await fastify.inject({
    method: 'GET',
    url: '/'
  })
  const body = await response.json()
  expect(body.mediaType).toBe('application/json')
})
