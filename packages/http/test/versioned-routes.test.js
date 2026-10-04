'use strict'


const helper = require('./helper')
const Fastify = require('..')
const http = require('node:http')
const split = require('split2')
const append = require('vary').append

let localhost
beforeAll(async function () {
  [localhost] = await helper.getLoopbackHost()
})

test('Should register a versioned route (inject)', (done) => {
  expect.assertions(11)
  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { version: '1.2.0' },
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'Accept-Version': '1.x'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    expect(res.statusCode).toBe(200)
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'Accept-Version': '1.2.x'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    expect(res.statusCode).toBe(200)
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'Accept-Version': '1.2.0'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    expect(res.statusCode).toBe(200)
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'Accept-Version': '1.2.1'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    done()
  })
})

test('Should register a versioned route via route constraints', (done) => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { version: '1.2.0' },
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'Accept-Version': '1.x'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    expect(res.statusCode).toBe(200)
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'Accept-Version': '1.2.x'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    expect(res.statusCode).toBe(200)
    done()
  })
})

test('Should register the same route with different versions', (done) => {
  expect.assertions(8)
  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { version: '1.2.0' },
    handler: (req, reply) => {
      reply.send('1.2.0')
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { version: '1.3.0' },
    handler: (req, reply) => {
      reply.send('1.3.0')
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'Accept-Version': '1.x'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('1.3.0')
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'Accept-Version': '1.2.x'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('1.2.0')
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'Accept-Version': '2.x'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    done()
  })
})

test('The versioned route should take precedence', (done) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    url: '/',
    handler: (req, reply) => {
      reply.send({ winter: 'is coming' })
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { version: '1.2.0' },
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'Accept-Version': '1.x'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    expect(res.statusCode).toBe(200)
    done()
  })
})

test('Versioned route but not version header should return a 404', (done) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { version: '1.2.0' },
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    done()
  })
})

test('Should register a versioned route (server)', async () => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { version: '1.2.0' },
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result1 = await fetch(fastifyServer, {
    headers: {
      'Accept-Version': '1.x'
    }
  })
  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)
  const body1 = await result1.json()
  expect(body1).toEqual({ hello: 'world' })

  const result2 = await fetch(fastifyServer, {
    headers: {
      'Accept-Version': '2.x'
    }
  })

  expect(result2.ok).toBeFalsy()
  expect(result2.status).toBe(404)
})

test('Shorthand route declaration', (done) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.get('/', { constraints: { version: '1.2.0' } }, (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'Accept-Version': '1.x'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    expect(res.statusCode).toBe(200)
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'Accept-Version': '1.2.1'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    done()
  })
})

test('The not found handler should not erase the Accept-Version header', (done) => {
  expect.assertions(13)
  const fastify = Fastify()

  fastify.addHook('onRequest', function (req, reply, done) {
    expect(req.headers['accept-version']).toEqual('2.x')
    done()
  })

  fastify.addHook('preValidation', function (req, reply, done) {
    expect(req.headers['accept-version']).toEqual('2.x')
    done()
  })

  fastify.addHook('preHandler', function (req, reply, done) {
    expect(req.headers['accept-version']).toEqual('2.x')
    done()
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { version: '1.2.0' },
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  fastify.setNotFoundHandler(function (req, reply) {
    expect(req.headers['accept-version']).toEqual('2.x')
    // we check if the symbol is exposed on key or not
    for (const key in req.headers) {
      expect(typeof key).toEqual('string')
    }

    for (const key of Object.keys(req.headers)) {
      expect(typeof key).toEqual('string')
    }

    reply.code(404).send('not found handler')
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'Accept-Version': '2.x'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toEqual('not found handler')
    expect(res.statusCode).toBe(404)
    done()
  })
})

test('Bad accept version (inject)', (done) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { version: '1.2.0' },
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'Accept-Version': 'a.b.c'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'Accept-Version': 12
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    done()
  })
})

test('Bad accept version (server)', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { version: '1.2.0' },
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result1 = await fetch(fastifyServer, {
    headers: {
      'Accept-Version': 'a.b.c'
    }
  })
  expect(result1.ok).toBeFalsy()
  expect(result1.status).toBe(404)

  const result2 = await fetch(fastifyServer, {
    headers: {
      'Accept-Version': '12'
    }
  })
  expect(result2.ok).toBeFalsy()
  expect(result2.status).toBe(404)
})

test('test log stream', (done) => {
  expect.assertions(3)
  const stream = split(JSON.parse)
  const fastify = Fastify({
    logger: {
      stream,
      level: 'info'
    }
  })

  fastify.get('/', { constraints: { version: '1.2.0' } }, function (req, reply) {
    reply.send(new Error('kaboom'))
  })

  fastify.listen({ port: 0, host: localhost }, err => {
    expect(err).toBeFalsy()
    onTestFinished(() => { fastify.close() })

    http.get({
      host: fastify.server.address().hostname,
      port: fastify.server.address().port,
      path: '/',
      method: 'GET',
      headers: {
        'Accept-Version': '1.x'
      }
    })

    stream.once('data', listenAtLogLine => {
      stream.once('data', line => {
        expect(line.req.version).toBe('1.x')
        stream.once('data', line => {
          expect(line.req.version).toBe('1.x')
          done()
        })
      })
    })
  })
})

test('Should register a versioned route with custom versioning strategy', (done) => {
  expect.assertions(8)

  const customVersioning = {
    name: 'version',
    storage: function () {
      const versions = {}
      return {
        get: (version) => { return versions[version] || null },
        set: (version, store) => { versions[version] = store }
      }
    },
    deriveConstraint: (req, ctx) => {
      return req.headers.accept
    },
    mustMatchWhenDerived: true,
    validate: () => true
  }

  const fastify = Fastify({
    constraints: {
      version: customVersioning
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { version: 'application/vnd.example.api+json;version=2' },
    handler: (req, reply) => {
      reply.send({ hello: 'from route v2' })
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { version: 'application/vnd.example.api+json;version=3' },
    handler: (req, reply) => {
      reply.send({ hello: 'from route v3' })
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      Accept: 'application/vnd.example.api+json;version=2'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'from route v2' })
    expect(res.statusCode).toBe(200)
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      Accept: 'application/vnd.example.api+json;version=3'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'from route v3' })
    expect(res.statusCode).toBe(200)
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      Accept: 'application/vnd.example.api+json;version=4'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    done()
  })
})

test('Vary header check (for documentation example)', (done) => {
  expect.assertions(8)
  const fastify = Fastify()
  fastify.addHook('onSend', async (req, reply) => {
    if (req.headers['accept-version']) { // or the custom header you are using
      let value = reply.getHeader('Vary') || ''
      const header = Array.isArray(value) ? value.join(', ') : String(value)
      if ((value = append(header, 'Accept-Version'))) { // or the custom header you are using
        reply.header('Vary', value)
      }
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { version: '1.2.0' },
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'Accept-Version': '1.x'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    expect(res.statusCode).toBe(200)
    expect(res.headers.vary).toBe('Accept-Version')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    expect(res.statusCode).toBe(200)
    expect(res.headers.vary).toBe(undefined)
    done()
  })
})
