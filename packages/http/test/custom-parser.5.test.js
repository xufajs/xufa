'use strict'


const Fastify = require('..')
const jsonParser = require('fast-json-body')
const { plainTextParser } = require('./helper')

test('cannot remove all content type parsers after binding', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  await fastify.listen({ port: 0 })
  expect(() => fastify.removeAllContentTypeParsers()).toThrow()
})

test('cannot remove content type parsers after binding', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  await fastify.listen({ port: 0 })
  expect(() => fastify.removeContentTypeParser('application/json')).toThrow()
})

test('should be able to override the default json parser after removeAllContentTypeParsers', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.removeAllContentTypeParsers()

  fastify.addContentTypeParser('application/json', function (req, payload, done) {
    expect('called').toBeTruthy()
    jsonParser(payload, function (err, body) {
      done(err, body)
    })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: JSON.stringify({ hello: 'world' }),
    headers: {
      'Content-Type': 'application/json'
    }
  })

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.text()).toEqual(JSON.stringify({ hello: 'world' }))
  await fastify.close()
})

test('should be able to override the default plain text parser after removeAllContentTypeParsers', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.removeAllContentTypeParsers()

  fastify.addContentTypeParser('text/plain', function (req, payload, done) {
    expect('called').toBeTruthy()
    plainTextParser(payload, function (err, body) {
      done(err, body)
    })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: 'hello world',
    headers: {
      'Content-Type': 'text/plain'
    }
  })

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.text()).toBe('hello world')
  await fastify.close()
})

test('should be able to add a custom content type parser after removeAllContentTypeParsers', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.removeAllContentTypeParsers()
  fastify.addContentTypeParser('application/jsoff', function (req, payload, done) {
    expect('called').toBeTruthy()
    jsonParser(payload, function (err, body) {
      done(err, body)
    })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: JSON.stringify({ hello: 'world' }),
    headers: {
      'Content-Type': 'application/jsoff'
    }
  })

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.text()).toEqual(JSON.stringify({ hello: 'world' }))
  await fastify.close()
})
