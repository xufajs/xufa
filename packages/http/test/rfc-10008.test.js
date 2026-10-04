'use strict'


const Fastify = require('..')

describe('RFC 10008', () => {
test('support adding QUERY method though fastify.route', async () => {
    expect.assertions(2)

    const fastify = Fastify()
    fastify.route({
      method: 'QUERY',
      url: '/query',
      handler: function (request, reply) {
        reply.send(request.body)
      }
    })
    await fastify.ready()

    const res = await fastify.inject({
      method: 'QUERY',
      url: '/query',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' })
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().hello).toBe('world')
  })
test('support adding QUERY method though fastify.query', async () => {
    expect.assertions(2)

    const fastify = Fastify()
    fastify.query('/query', function (request, reply) {
      reply.send(request.body)
    })
    await fastify.ready()

    const res = await fastify.inject({
      method: 'QUERY',
      url: '/query',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' })
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().hello).toBe('world')
  })
test('should return 400 if Content-Type header is missing for QUERY method', async () => {
    // If a request lacks media type information, it is
    // incorrect by definition and needs to fail with a
    // 4xx status code such as 400 (Client Error).
    expect.assertions(2)

    const fastify = Fastify()
    fastify.query('/query', function (request, reply) {
      reply.send(request.body)
    })
    await fastify.ready()

    const res = await fastify.inject({
      method: 'QUERY',
      url: '/query',
      body: JSON.stringify({ hello: 'world' })
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('XUFA_ERR_ROUTE_MISSING_CONTENT_TYPE')
  })
test('should return 400 if invalid content is provided for QUERY method', async () => {
    // If a media type is specified but is inconsistent
    // with the actual request content, a 400 (Bad Request)
    // can be returned. That is, a server is not allowed to
    // infer a media type from the request content and then
    // override a missing or "erroneous" value (i.e., "content sniffing").
    expect.assertions(2)

    const fastify = Fastify()
    fastify.query('/query', function (request, reply) {
      reply.send(request.body)
    })
    await fastify.ready()

    const res = await fastify.inject({
      method: 'QUERY',
      url: '/query',
      headers: { 'Content-Type': 'application/json' },
      body: 'it is not a valid json'
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('XUFA_ERR_CTP_INVALID_JSON_BODY')
  })
test('should return 200 if body is empty but media type allows it for QUERY method', async () => {
    // If a media type is set and allows the body to be empty,
    // the server must allow it.
    expect.assertions(2)

    const fastify = Fastify()
    fastify.query('/query', function (request, reply) {
      reply.send(request.body)
    })
    await fastify.ready()

    const res = await fastify.inject({
      method: 'QUERY',
      url: '/query',
      headers: { 'Content-Type': 'text/plain' }
    })

    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('')
  })
test('should return 415 if unsupported media type is provided for QUERY method', async () => {
    // If a media type is specified but is not supported by the
    // resource, a 415 (Unsupported Media Type) is appropriate.
    expect.assertions(2)

    const fastify = Fastify()
    fastify.query('/query', function (request, reply) {
      reply.send(request.body)
    })
    await fastify.ready()

    const res = await fastify.inject({
      method: 'QUERY',
      url: '/query',
      headers: { 'Content-Type': 'application/ld+json' },
      body: JSON.stringify({ hello: 'world' })
    })

    expect(res.statusCode).toBe(415)
    expect(res.json().code).toBe('XUFA_ERR_CTP_INVALID_MEDIA_TYPE')
  })
})
