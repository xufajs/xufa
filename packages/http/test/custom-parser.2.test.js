'use strict'


const Fastify = require('..')

test('Wrong parseAs parameter', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  try {
    fastify.addContentTypeParser('application/json', { parseAs: 'fireworks' }, () => {})
    expect.fail('should throw')
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_CTP_INVALID_PARSE_TYPE')
    expect(err.message).toBe("The body parser can only parse your data as 'string' or 'buffer', you asked 'fireworks' which is not supported.")
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Should allow defining the bodyLimit per parser', async () => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.addContentTypeParser(
    'x/foo',
    { parseAs: 'string', bodyLimit: 5 },
    function (req, body, done) {
      expect.fail('should not be invoked')
      done()
    }
  )

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: '1234567890',
    headers: {
      'Content-Type': 'x/foo'
    }
  })

  expect(result.ok).toBeFalsy()
  expect(await result.json()).toEqual({
    statusCode: 413,
    code: 'XUFA_ERR_CTP_BODY_TOO_LARGE',
    error: 'Payload Too Large',
    message: 'Request body is too large'
  })
})

test('route bodyLimit should take precedence over a custom parser bodyLimit', async () => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.post('/', { bodyLimit: 5 }, (request, reply) => {
    reply.send(request.body)
  })

  fastify.addContentTypeParser(
    'x/foo',
    { parseAs: 'string', bodyLimit: 100 },
    function (req, body, done) {
      expect.fail('should not be invoked')
      done()
    }
  )

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: '1234567890',
    headers: { 'Content-Type': 'x/foo' }
  })

  expect(result.ok).toBeFalsy()
  expect(await result.json()).toEqual({
    statusCode: 413,
    code: 'XUFA_ERR_CTP_BODY_TOO_LARGE',
    error: 'Payload Too Large',
    message: 'Request body is too large'
  })
})
