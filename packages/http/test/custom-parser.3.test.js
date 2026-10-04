'use strict'


const Fastify = require('..')
const jsonParser = require('fast-json-body')

test('should be able to use default parser for extra content type', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.post('/', (request, reply) => {
    reply.send(request.body)
  })

  fastify.addContentTypeParser('text/json', { parseAs: 'string' }, fastify.getDefaultJsonParser('ignore', 'ignore'))

  const fastifyServer = await fastify.listen({ port: 0 })

  const response = await fetch(fastifyServer, {
    method: 'POST',
    body: '{"hello":"world"}',
    headers: {
      'Content-Type': 'text/json'
    }
  })
  expect(response.ok).toBeTruthy()
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ hello: 'world' })
})

describe('contentTypeParser should add a custom parser with RegExp value', () => {
let fastifyServer;
const fastify = Fastify()
afterAll(() => fastify.close())
fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })
fastify.options('/', (req, reply) => {
    reply.send(req.body)
  })
fastify.addContentTypeParser(/.*\+json$/, function (req, payload, done) {
    jsonParser(payload, function (err, body) {
      done(err, body)
    })
  })
beforeAll(async () => {
fastifyServer = await fastify.listen({ port: 0 });
})
test('in POST', async () => {
    expect.assertions(3)

    const response = await fetch(fastifyServer, {
      method: 'POST',
      body: '{"hello":"world"}',
      headers: {
        'Content-Type': 'application/vnd.test+json'
      }
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body.toString()).toEqual(JSON.stringify({ hello: 'world' }))
  })
test('in OPTIONS', async () => {
    expect.assertions(3)

    const response = await fetch(fastifyServer, {
      method: 'OPTIONS',
      body: '{"hello":"world"}',
      headers: {
        'Content-Type': 'weird/content-type+json'
      }
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body.toString()).toEqual(JSON.stringify({ hello: 'world' }))
  })
})

test('contentTypeParser should add multiple custom parsers with RegExp values', async () => {
  expect.assertions(6)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.addContentTypeParser(/.*\+json$/, function (req, payload, done) {
    jsonParser(payload, function (err, body) {
      done(err, body)
    })
  })

  fastify.addContentTypeParser(/.*\+xml$/, function (req, payload, done) {
    done(null, 'xml')
  })

  fastify.addContentTypeParser(/.*\+myExtension$/i, function (req, payload, done) {
    let data = ''
    payload.on('data', chunk => { data += chunk })
    payload.on('end', () => {
      done(null, data + 'myExtension')
    })
  })

  await fastify.ready()

  {
    const response = await fastify.inject({
      method: 'POST',
      url: '/',
      body: '{"hello":"world"}',
      headers: {
        'Content-Type': 'application/vnd.hello+json'
      }
    })
    expect(response.statusCode).toBe(200)
    expect(response.payload.toString()).toEqual('{"hello":"world"}')
  }

  {
    const response = await fastify.inject({
      method: 'POST',
      url: '/',
      body: '{"hello":"world"}',
      headers: {
        'Content-Type': 'application/test+xml'
      }
    })
    expect(response.statusCode).toBe(200)
    expect(response.payload.toString()).toEqual('xml')
  }

  await fastify.inject({
    method: 'POST',
    path: '/',
    payload: 'abcdefg',
    headers: {
      'Content-Type': 'application/+myExtension'
    }
  }).then((response) => {
    expect(response.statusCode).toBe(200)
    expect(response.payload.toString()).toEqual('abcdefgmyExtension')
  }).catch((err) => {
    expect(err).toBeFalsy()
  })
})

test('catch all content type parser should not interfere with content type parser', async () => {
  expect.assertions(9)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.addContentTypeParser('*', function (req, payload, done) {
    let data = ''
    payload.on('data', chunk => { data += chunk })
    payload.on('end', () => {
      done(null, data)
    })
  })

  fastify.addContentTypeParser(/^application\/.*/, function (req, payload, done) {
    jsonParser(payload, function (err, body) {
      done(err, body)
    })
  })

  fastify.addContentTypeParser('text/html', function (req, payload, done) {
    let data = ''
    payload.on('data', chunk => { data += chunk })
    payload.on('end', () => {
      done(null, data + 'html')
    })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const assertions = [
    { body: '{"myKey":"myValue"}', contentType: 'application/json', expected: JSON.stringify({ myKey: 'myValue' }) },
    { body: 'body', contentType: 'very-weird-content-type/foo', expected: 'body' },
    { body: 'my text', contentType: 'text/html', expected: 'my texthtml' }
  ]

  for (const { body, contentType, expected } of assertions) {
    const response = await fetch(fastifyServer, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': contentType
      }
    })
    expect(response.ok).toBeTruthy()
    expect(response.status).toBe(200)
    expect(await response.text()).toEqual(expected)
  }
})
