'use strict'


const Fastify = require('..')

test('default 413 with bodyLimit option', async () => {
  expect.assertions(3)

  const fastify = Fastify({
    bodyLimit: 10
  })

  fastify.post('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  const response = await fastify.inject({
    method: 'POST',
    url: '/',
    body: {
      text: '12345678901234567890123456789012345678901234567890'
    }
  })
  expect(response.statusCode).toBe(413)
  expect(response.headers['content-type']).toBe('application/json; charset=utf-8')
  expect(JSON.parse(response.payload)).toEqual({
    error: 'Payload Too Large',
    code: 'XUFA_ERR_CTP_BODY_TOO_LARGE',
    message: 'Request body is too large',
    statusCode: 413
  })
})

test('default 400 with wrong content-length', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.post('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  const response = await fastify.inject({
    method: 'POST',
    url: '/',
    headers: {
      'content-length': 20
    },
    body: {
      text: '12345678901234567890123456789012345678901234567890'
    }
  })
  expect(response.statusCode).toBe(400)
  expect(response.headers['content-type']).toBe('application/json; charset=utf-8')
  expect(JSON.parse(response.payload)).toEqual({
    error: 'Bad Request',
    code: 'XUFA_ERR_CTP_INVALID_CONTENT_LENGTH',
    message: 'Request body size did not match Content-Length',
    statusCode: 400
  })
})

test('custom 413 with bodyLimit option', async () => {
  expect.assertions(3)

  const fastify = Fastify({
    bodyLimit: 10
  })

  fastify.post('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.setErrorHandler(function (err, request, reply) {
    reply
      .code(err.statusCode)
      .type('application/json; charset=utf-8')
      .send(err)
  })

  const response = await fastify.inject({
    method: 'POST',
    url: '/',
    body: {
      text: '12345678901234567890123456789012345678901234567890'
    }
  })
  expect(response.statusCode).toBe(413)
  expect(response.headers['content-type']).toBe('application/json; charset=utf-8')
  expect(JSON.parse(response.payload)).toEqual({
    error: 'Payload Too Large',
    code: 'XUFA_ERR_CTP_BODY_TOO_LARGE',
    message: 'Request body is too large',
    statusCode: 413
  })
})

test('custom 400 with wrong content-length', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.post('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.setErrorHandler(function (err, request, reply) {
    reply
      .code(err.statusCode)
      .type('application/json; charset=utf-8')
      .send(err)
  })

  const response = await fastify.inject({
    method: 'POST',
    url: '/',
    headers: {
      'content-length': 20
    },
    body: {
      text: '12345678901234567890123456789012345678901234567890'
    }
  })
  expect(response.statusCode).toBe(400)
  expect(response.headers['content-type']).toBe('application/json; charset=utf-8')
  expect(JSON.parse(response.payload)).toEqual({
    error: 'Bad Request',
    code: 'XUFA_ERR_CTP_INVALID_CONTENT_LENGTH',
    message: 'Request body size did not match Content-Length',
    statusCode: 400
  })
})

test('#2214 - wrong content-length', async () => {
  const fastify = Fastify()

  fastify.get('/', async () => {
    const error = new Error('MY_ERROR_MESSAGE')
    error.headers = {
      'content-length': 2
    }
    throw error
  })

  const response = await fastify.inject({
    method: 'GET',
    path: '/'
  })
  expect(response.headers['content-length']).toBe('' + response.rawPayload.length)
})

test('#2543 - wrong content-length with errorHandler', async () => {
  const fastify = Fastify()

  fastify.setErrorHandler((_error, _request, reply) => {
    reply.code(500).send({ message: 'longer than 2 bytes' })
  })

  fastify.get('/', async () => {
    const error = new Error('MY_ERROR_MESSAGE')
    error.headers = {
      'content-length': 2
    }
    throw error
  })

  const response = await fastify.inject({
    method: 'GET',
    path: '/'
  })
  expect(response.statusCode).toBe(500)
  expect(response.headers['content-length']).toBe('' + response.rawPayload.length)
  expect(JSON.parse(response.payload)).toEqual({ message: 'longer than 2 bytes' })
})
