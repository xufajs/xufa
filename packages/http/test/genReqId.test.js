'use strict'

const { Readable } = require('node:stream')

const fp = require('..').plugin
const Fastify = require('..')

test('Should accept a custom genReqId function', (done) => {
  expect.assertions(4)

  const fastify = Fastify({
    genReqId: function (req) {
      return 'a'
    }
  })

  onTestFinished(() => fastify.close())
  fastify.get('/', (req, reply) => {
    expect(req.id).toBeTruthy()
    reply.send({ id: req.id })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    fastify.inject({
      method: 'GET',
      url: `http://localhost:${fastify.server.address().port}`
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(payload.id).toBe('a')
      done()
    })
  })
})

test('Custom genReqId function gets raw request as argument', (done) => {
  expect.assertions(9)

  const REQUEST_ID = 'REQ-1234'

  const fastify = Fastify({
    genReqId: function (req) {
      expect('id' in req).toBe(false)
      expect('raw' in req).toBe(false)
      expect(req instanceof Readable).toBeTruthy()
      // http.IncomingMessage does have `rawHeaders` property, but FastifyRequest does not
      const index = req.rawHeaders.indexOf('x-request-id')
      const xReqId = req.rawHeaders[index + 1]
      expect(xReqId).toBe(REQUEST_ID)
      expect(req.headers['x-request-id']).toBe(REQUEST_ID)
      return xReqId
    }
  })
  onTestFinished(() => fastify.close())

  fastify.get('/', (req, reply) => {
    expect(req.id).toBe(REQUEST_ID)
    reply.send({ id: req.id })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    fastify.inject({
      method: 'GET',
      headers: {
        'x-request-id': REQUEST_ID
      },
      url: `http://localhost:${fastify.server.address().port}`
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(payload.id).toBe(REQUEST_ID)
      done()
    })
  })
})

test('Should handle properly requestIdHeader option', async () => {
  expect.assertions(4)

  expect(Fastify({ requestIdHeader: '' }).initialConfig.requestIdHeader).toBe(false)
  expect(Fastify({ requestIdHeader: false }).initialConfig.requestIdHeader).toBe(false)
  expect(Fastify({ requestIdHeader: true }).initialConfig.requestIdHeader).toBe('request-id')
  expect(Fastify({ requestIdHeader: 'x-request-id' }).initialConfig.requestIdHeader).toBe('x-request-id')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Should expose the genReqId function via the getter', (done) => {
  expect.assertions(5)

  const fastify = Fastify()
  expect(typeof fastify.genReqId).toBe('function')
  expect(typeof fastify.genReqId({ headers: {} })).toBe('string')

  const custom = function (req) {
    return 'custom'
  }

  fastify.register(function (instance, opts, next) {
    instance.setGenReqId(custom)
    expect(instance.genReqId()).toBe('custom')
    next()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    expect(fastify.genReqId).not.toBe(custom)
    done()
  })
})

test('Should accept option to set genReqId with setGenReqId option', (done) => {
  expect.assertions(9)

  const fastify = Fastify({
    genReqId: function (req) {
      return 'base'
    }
  })

  onTestFinished(() => fastify.close())

  fastify.register(function (instance, opts, next) {
    instance.setGenReqId(function (req) {
      return 'foo'
    })
    instance.get('/', (req, reply) => {
      expect(req.id).toBeTruthy()
      reply.send({ id: req.id })
    })
    next()
  }, { prefix: 'foo' })

  fastify.register(function (instance, opts, next) {
    instance.setGenReqId(function (req) {
      return 'bar'
    })
    instance.get('/', (req, reply) => {
      expect(req.id).toBeTruthy()
      reply.send({ id: req.id })
    })
    next()
  }, { prefix: 'bar' })

  fastify.get('/', (req, reply) => {
    expect(req.id).toBeTruthy()
    reply.send({ id: req.id })
  })

  let pending = 3

  function completed () {
    if (--pending === 0) {
      done()
    }
  }

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload.id).toBe('base')
    completed()
  })

  fastify.inject({
    method: 'GET',
    url: '/foo'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload.id).toBe('foo')
    completed()
  })

  fastify.inject({
    method: 'GET',
    url: '/bar'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload.id).toBe('bar')
    completed()
  })
})

test('Should encapsulate setGenReqId', (done) => {
  expect.assertions(12)

  const fastify = Fastify({
    genReqId: function (req) {
      return 'base'
    }
  })

  onTestFinished(() => fastify.close())
  const bazInstance = function (instance, opts, next) {
    instance.register(barInstance, { prefix: 'baz' })

    instance.setGenReqId(function (req) {
      return 'baz'
    })
    instance.get('/', (req, reply) => {
      expect(req.id).toBeTruthy()
      reply.send({ id: req.id })
    })
    next()
  }

  const barInstance = function (instance, opts, next) {
    instance.setGenReqId(function (req) {
      return 'bar'
    })
    instance.get('/', (req, reply) => {
      expect(req.id).toBeTruthy()
      reply.send({ id: req.id })
    })
    next()
  }

  const fooInstance = function (instance, opts, next) {
    instance.register(bazInstance, { prefix: 'baz' })
    instance.register(barInstance, { prefix: 'bar' })

    instance.setGenReqId(function (req) {
      return 'foo'
    })

    instance.get('/', (req, reply) => {
      expect(req.id).toBeTruthy()
      reply.send({ id: req.id })
    })
    next()
  }

  fastify.register(fooInstance, { prefix: 'foo' })

  fastify.get('/', (req, reply) => {
    expect(req.id).toBeTruthy()
    reply.send({ id: req.id })
  })

  let pending = 4

  function completed () {
    if (--pending === 0) {
      done()
    }
  }

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload.id).toBe('base')
    completed()
  })

  fastify.inject({
    method: 'GET',
    url: '/foo'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload.id).toBe('foo')
    completed()
  })

  fastify.inject({
    method: 'GET',
    url: '/foo/bar'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload.id).toBe('bar')
    completed()
  })

  fastify.inject({
    method: 'GET',
    url: '/foo/baz'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload.id).toBe('baz')
    completed()
  })
})

test('Should not alter parent of genReqId', (done) => {
  expect.assertions(6)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  const fooInstance = function (instance, opts, next) {
    instance.setGenReqId(function (req) {
      return 'foo'
    })

    instance.get('/', (req, reply) => {
      expect(req.id).toBeTruthy()
      reply.send({ id: req.id })
    })
    next()
  }

  fastify.register(fooInstance, { prefix: 'foo' })

  fastify.get('/', (req, reply) => {
    expect(req.id).toBeTruthy()
    reply.send({ id: req.id })
  })

  let pending = 2

  function completed () {
    if (--pending === 0) {
      done()
    }
  }

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload.id).toBe('req-1')
    completed()
  })

  fastify.inject({
    method: 'GET',
    url: '/foo'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload.id).toBe('foo')
    completed()
  })
})

test('Should have child instance user parent genReqId', (done) => {
  expect.assertions(6)

  const fastify = Fastify({
    genReqId: function (req) {
      return 'foo'
    }
  })
  onTestFinished(() => fastify.close())

  const fooInstance = function (instance, opts, next) {
    instance.get('/', (req, reply) => {
      expect(req.id).toBeTruthy()
      reply.send({ id: req.id })
    })
    next()
  }

  fastify.register(fooInstance, { prefix: 'foo' })

  fastify.get('/', (req, reply) => {
    expect(req.id).toBeTruthy()
    reply.send({ id: req.id })
  })

  let pending = 2

  function completed () {
    if (--pending === 0) {
      done()
    }
  }

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload.id).toBe('foo')
    completed()
  })

  fastify.inject({
    method: 'GET',
    url: '/foo'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload.id).toBe('foo')
    completed()
  })
})

test('genReqId set on root scope when using fastify-plugin', (done) => {
  expect.assertions(6)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.register(fp(function (fastify, options, done) {
    fastify.setGenReqId(function (req) {
      return 'not-encapsulated'
    })
    fastify.get('/not-encapsulated-1', (req, reply) => {
      expect(req.id).toBeTruthy()
      reply.send({ id: req.id })
    })
    done()
  }))

  fastify.get('/not-encapsulated-2', (req, reply) => {
    expect(req.id).toBeTruthy()
    reply.send({ id: req.id })
  })

  let pending = 2

  function completed () {
    if (--pending === 0) {
      done()
    }
  }

  fastify.inject({
    method: 'GET',
    url: '/not-encapsulated-1'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload.id).toBe('not-encapsulated')
    completed()
  })

  fastify.inject({
    method: 'GET',
    url: '/not-encapsulated-2'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload.id).toBe('not-encapsulated')
    completed()
  })
})
