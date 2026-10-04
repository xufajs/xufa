'use strict'


const Fastify = require('@xufa/http')
const jsonParser = require('fast-json-body')

test('Should have typeof body object with no custom parser defined, null body and content type = \'text/plain\'', async () => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: null,
    headers: {
      'Content-Type': 'text/plain'
    }
  })

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.text()).toBe('')
})

test('Should have typeof body object with no custom parser defined, undefined body and content type = \'text/plain\'', async () => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: undefined,
    headers: {
      'Content-Type': 'text/plain'
    }
  })

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.text()).toBe('')
})

test('Should get the body as string /1', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.addContentTypeParser('text/plain', { parseAs: 'string' }, function (req, body, done) {
    expect('called').toBeTruthy()
    expect(typeof body === 'string').toBeTruthy()
    try {
      const plainText = body
      done(null, plainText)
    } catch (err) {
      err.statusCode = 400
      done(err, undefined)
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: 'hello world',
    headers: {
      'Content-Type': 'text/plain'
    }
  })

  expect(result.status).toBe(200)
  expect(await result.text()).toBe('hello world')
})

test('Should get the body as buffer', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, function (req, body, done) {
    expect('called').toBeTruthy()
    expect(body instanceof Buffer).toBeTruthy()
    try {
      const json = JSON.parse(body)
      done(null, json)
    } catch (err) {
      err.statusCode = 400
      done(err, undefined)
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: '{"hello":"world"}',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  expect(result.status).toBe(200)
  expect(await result.text()).toBe('{"hello":"world"}')
})

test('Should get the body as buffer', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.addContentTypeParser('text/plain', { parseAs: 'buffer' }, function (req, body, done) {
    expect('called').toBeTruthy()
    expect(body instanceof Buffer).toBeTruthy()
    try {
      const plainText = body
      done(null, plainText)
    } catch (err) {
      err.statusCode = 400
      done(err, undefined)
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: 'hello world',
    headers: {
      'Content-Type': 'text/plain'
    }
  })

  expect(result.status).toBe(200)
  expect(await result.text()).toBe('hello world')
})

test('Should parse empty bodies as a string', async () => {
  expect.assertions(8)
  const fastify = Fastify()

  fastify.addContentTypeParser('text/plain', { parseAs: 'string' }, (req, body, done) => {
    expect(body).toBe('')
    done(null, body)
  })

  fastify.route({
    method: ['POST', 'DELETE'],
    url: '/',
    handler (request, reply) {
      reply.send(request.body)
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const postResult = await fetch(fastifyServer, {
    method: 'POST',
    body: '',
    headers: {
      'Content-Type': 'text/plain'
    }
  })

  expect(postResult.ok).toBeTruthy()
  expect(postResult.status).toBe(200)
  expect(await postResult.text()).toBe('')

  const deleteResult = await fetch(fastifyServer, {
    method: 'DELETE',
    body: '',
    headers: {
      'Content-Type': 'text/plain',
      'Content-Length': '0'
    }
  })

  expect(deleteResult.ok).toBeTruthy()
  expect(deleteResult.status).toBe(200)
  expect(await deleteResult.text()).toBe('')
})

test('Should parse empty bodies as a buffer', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.addContentTypeParser('text/plain', { parseAs: 'buffer' }, function (req, body, done) {
    expect(body instanceof Buffer).toBeTruthy()
    expect(body.length).toBe(0)
    done(null, body)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: '',
    headers: {
      'Content-Type': 'text/plain'
    }
  })

  expect(result.status).toBe(200)
  expect((await result.arrayBuffer()).byteLength).toBe(0)
})

test('The charset should not interfere with the content type handling', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.addContentTypeParser('application/json', function (req, payload, done) {
    expect('called').toBeTruthy()
    jsonParser(payload, function (err, body) {
      done(err, body)
    })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: '{"hello":"world"}',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  })

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.text()).toBe('{"hello":"world"}')
})
