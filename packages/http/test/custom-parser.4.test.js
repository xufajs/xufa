'use strict'


const Fastify = require('@xufa/http')
const jsonParser = require('fast-json-body')

test('parameterized parser matches preserve precedence and encapsulation on repeated requests', async () => {
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.addContentTypeParser('application/custom', { parseAs: 'string' }, (request, body, done) => {
    done(null, 'parent')
  })
  fastify.addContentTypeParser('application/custom; version=2', { parseAs: 'string' }, (request, body, done) => {
    done(null, 'version 2')
  })
  fastify.post('/', request => request.body)

  fastify.register(async child => {
    child.removeContentTypeParser('application/custom')
    child.addContentTypeParser('application/custom', { parseAs: 'string' }, (request, body, done) => {
      done(null, 'child')
    })
    child.post('/child', request => request.body)
  })

  for (let i = 0; i < 3; i++) {
    for (const [url, contentType, expected] of [
      ['/', 'application/custom; charset=utf-8', 'parent'],
      ['/child', 'application/custom; charset=utf-8', 'child'],
      ['/', 'application/custom; version=2', 'version 2'],
      ['/child', 'application/custom; version=2', 'version 2'],
      ['/', 'Application/Custom ; Charset="utf-8"', 'parent']
    ]) {
      const response = await fastify.inject({
        method: 'POST',
        url,
        headers: { 'content-type': contentType },
        payload: 'body'
      })
      expect(response.statusCode).toBe(200)
      expect(response.body).toBe(expected)
    }
  }
})

test('should prefer string content types over RegExp ones', async () => {
  expect.assertions(6)
  const fastify = Fastify()
  onTestFinished(() => { fastify.close() })
  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.addContentTypeParser(/^application\/.*/, function (req, payload, done) {
    let data = ''
    payload.on('data', chunk => { data += chunk })
    payload.on('end', () => {
      done(null, data)
    })
  })

  fastify.addContentTypeParser('application/json', function (req, payload, done) {
    jsonParser(payload, function (err, body) {
      done(err, body)
    })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result1 = await fetch(fastifyServer, {
    method: 'POST',
    body: '{"k1":"myValue", "k2": "myValue"}',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)
  expect(await result1.text()).toBe(JSON.stringify({ k1: 'myValue', k2: 'myValue' }))

  const result2 = await fetch(fastifyServer, {
    method: 'POST',
    body: 'javascript',
    headers: {
      'Content-Type': 'application/javascript'
    }
  })

  expect(result2.ok).toBeTruthy()
  expect(result2.status).toBe(200)
  expect(await result2.text()).toBe('javascript')
})

test('removeContentTypeParser should support arrays of content types to remove', async () => {
  expect.assertions(7)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.addContentTypeParser('application/xml', function (req, payload, done) {
    payload.on('data', () => {})
    payload.on('end', () => {
      done(null, 'xml')
    })
  })

  fastify.addContentTypeParser(/^image\/.*/, function (req, payload, done) {
    payload.on('data', () => {})
    payload.on('end', () => {
      done(null, 'image')
    })
  })

  fastify.removeContentTypeParser([/^image\/.*/, 'application/json'])

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result1 = await fetch(fastifyServer, {
    method: 'POST',
    body: '<?xml version="1.0">',
    headers: {
      'Content-Type': 'application/xml'
    }
  })

  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)
  expect(await result1.text()).toBe('xml')

  const result2 = await fetch(fastifyServer, {
    method: 'POST',
    body: '',
    headers: {
      'Content-Type': 'image/png'
    }
  })

  expect(result2.ok).toBeFalsy()
  expect(result2.status).toBe(415)

  const result3 = await fetch(fastifyServer, {
    method: 'POST',
    body: '{test: "test"}',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  expect(result3.ok).toBeFalsy()
  expect(result3.status).toBe(415)
})

test('removeContentTypeParser should support encapsulation', async () => {
  expect.assertions(5)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.addContentTypeParser('application/xml', function (req, payload, done) {
    payload.on('data', () => {})
    payload.on('end', () => {
      done(null, 'xml')
    })
  })

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.register(function (instance, options, done) {
    instance.removeContentTypeParser('application/xml')

    instance.post('/encapsulated', (req, reply) => {
      reply.send(req.body)
    })

    done()
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result1 = await fetch(fastifyServer + '/encapsulated', {
    method: 'POST',
    body: '<?xml version="1.0">',
    headers: {
      'Content-Type': 'application/xml'
    }
  })

  expect(result1.ok).toBeFalsy()
  expect(result1.status).toBe(415)

  const result2 = await fetch(fastifyServer, {
    method: 'POST',
    body: '<?xml version="1.0">',
    headers: {
      'Content-Type': 'application/xml'
    }
  })

  expect(result2.ok).toBeTruthy()
  expect(result2.status).toBe(200)
  expect(await result2.text()).toBe('xml')
})

test('removeAllContentTypeParsers should support encapsulation', async () => {
  expect.assertions(5)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.register(function (instance, options, done) {
    instance.removeAllContentTypeParsers()

    instance.post('/encapsulated', (req, reply) => {
      reply.send(req.body)
    })

    done()
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result1 = await fetch(fastifyServer + '/encapsulated', {
    method: 'POST',
    body: '{}',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  expect(result1.ok).toBeFalsy()
  expect(result1.status).toBe(415)

  const result2 = await fetch(fastifyServer, {
    method: 'POST',
    body: '{"test":1}',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  expect(result2.ok).toBeTruthy()
  expect(result2.status).toBe(200)
  expect(JSON.parse(await result2.text()).test).toBe(1)
})
