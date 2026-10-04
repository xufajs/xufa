'use strict'


const Fastify = require('..')

test('request.mediaType should match the content-type header', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.post('/', (request, reply) => {
    expect(request.mediaType).toBe('application/json')
    reply.send({ mediaType: request.mediaType })
  })

  const response = await fastify.inject({
    method: 'POST',
    url: '/',
    body: JSON.stringify({ hello: 'world' }),
    headers: {
      'content-type': 'application/json'
    }
  })
  const body = await response.json()
  expect(body.mediaType).toBe('application/json')
})

test('request.mediaType should strip the charset parameter', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.post('/', (request, reply) => {
    expect(request.mediaType).toBe('application/json')
    reply.send({ mediaType: request.mediaType })
  })

  const response = await fastify.inject({
    method: 'POST',
    url: '/',
    body: JSON.stringify({ hello: 'world' }),
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  })
  const body = await response.json()
  expect(body.mediaType).toBe('application/json')
})

test('request.mediaType should strip the space', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.post('/', (request, reply) => {
    expect(request.mediaType).toBe('application/json')
    reply.send({ mediaType: request.mediaType })
  })

  const response = await fastify.inject({
    method: 'POST',
    url: '/',
    body: JSON.stringify({ hello: 'world' }),
    headers: {
      'content-type': ' application/json ; charset=utf-8'
    }
  })
  const body = await response.json()
  expect(body.mediaType).toBe('application/json')
})

test('request.mediaType supported in hooks', async () => {
  expect.assertions(5)

  const fastify = Fastify()

  fastify.post('/', {
    preParsing: (request, reply, payload, done) => {
      expect(request.mediaType).toBe('application/json')
      done(null, payload)
    },
    preValidation: (request, reply, done) => {
      expect(request.mediaType).toBe('application/json')
      done()
    },
    preHandler: (request, reply, done) => {
      expect(request.mediaType).toBe('application/json')
      done()
    }
  }, (request, reply) => {
    expect(request.mediaType).toBe('application/json')
    reply.send({ mediaType: request.mediaType })
  })

  const response = await fastify.inject({
    method: 'POST',
    url: '/',
    body: JSON.stringify({ hello: 'world' }),
    headers: {
      'content-type': 'application/json'
    }
  })
  const body = await response.json()
  expect(body.mediaType).toBe('application/json')
})
