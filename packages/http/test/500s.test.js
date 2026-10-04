'use strict'


const Fastify = require('..')
const symbols = require('../lib/symbols')
const { XufaError } = require('@xufa/errors')

test('default 500', (done) => {
  expect.assertions(4)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', function (req, reply) {
    reply.send(new Error('kaboom'))
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Internal Server Error',
      message: 'kaboom',
      statusCode: 500
    })
    done()
  })
})

test('default 500 with non-error string', (done) => {
  expect.assertions(4)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', function (req, reply) {
    throw 'kaboom' // eslint-disable-line no-throw-literal
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(res.payload).toEqual('kaboom')
    done()
  })
})

test('default 500 with non-error symbol', (done) => {
  expect.assertions(4)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', function (req, reply) {
    throw Symbol('error')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(res.payload).toEqual('')
    done()
  })
})

test('default 500 with non-error false', (done) => {
  expect.assertions(4)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', function (req, reply) {
    throw false // eslint-disable-line no-throw-literal
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(res.payload).toEqual('false')
    done()
  })
})

test('default 500 with non-error null', (done) => {
  expect.assertions(4)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', function (req, reply) {
    throw null // eslint-disable-line no-throw-literal
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(res.payload).toEqual('null')
    done()
  })
})

test('custom 500', (done) => {
  expect.assertions(6)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', function (req, reply) {
    reply.send(new Error('kaboom'))
  })

  fastify.setErrorHandler(function (err, request, reply) {
    expect(typeof request === 'object').toBeTruthy()
    expect(request instanceof fastify[symbols.kRequest].parent).toBeTruthy()
    reply
      .code(500)
      .type('text/plain')
      .send('an error happened: ' + err.message)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(res.headers['content-type']).toBe('text/plain')
    expect(res.payload.toString()).toEqual('an error happened: kaboom')
    done()
  })
})

test('encapsulated 500', async () => {
  expect.assertions(8)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', function (req, reply) {
    reply.send(new Error('kaboom'))
  })

  fastify.register(function (f, opts, done) {
    f.get('/', function (req, reply) {
      reply.send(new Error('kaboom'))
    })

    f.setErrorHandler(function (err, request, reply) {
      expect(typeof request === 'object').toBeTruthy()
      expect(request instanceof fastify[symbols.kRequest].parent).toBeTruthy()
      reply
        .code(500)
        .type('text/plain')
        .send('an error happened: ' + err.message)
    })

    done()
  }, { prefix: 'test' })

  {
    const response = await fastify.inject({
      method: 'GET',
      url: '/test'
    })

    expect(response.statusCode).toBe(500)
    expect(response.headers['content-type']).toBe('text/plain')
    expect(response.payload.toString()).toEqual('an error happened: kaboom')
  }

  {
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    })

    expect(response.statusCode).toBe(500)
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(JSON.parse(response.payload)).toEqual({
      error: 'Internal Server Error',
      message: 'kaboom',
      statusCode: 500
    })
  }
})

test('custom 500 with hooks', (done) => {
  expect.assertions(7)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', function (req, reply) {
    reply.send(new Error('kaboom'))
  })

  fastify.setErrorHandler(function (err, request, reply) {
    reply
      .code(500)
      .type('text/plain')
      .send('an error happened: ' + err.message)
  })

  fastify.addHook('onSend', (req, res, payload, done) => {
    expect('called').toBeTruthy()
    done()
  })
  fastify.addHook('onRequest', (req, res, done) => {
    expect('called').toBeTruthy()
    done()
  })
  fastify.addHook('onResponse', (request, reply, done) => {
    expect('called').toBeTruthy()
    done()
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(res.headers['content-type']).toBe('text/plain')
    expect(res.payload.toString()).toEqual('an error happened: kaboom')
    done()
  })
})

test('cannot set errorHandler after binding', (done) => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    try {
      fastify.setErrorHandler(() => { })
      expect.fail()
    } catch (e) {
      expect(true).toBeTruthy()
    } finally {
      done()
    }
  })
})

test('cannot set childLoggerFactory after binding', (done) => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    try {
      fastify.setChildLoggerFactory(() => { })
      expect.fail()
    } catch (e) {
      expect(true).toBeTruthy()
    } finally {
      done()
    }
  })
})

test('catch synchronous errors', (done) => {
  expect.assertions(3)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.setErrorHandler((_, req, reply) => {
    throw new Error('kaboom2')
  })

  fastify.post('/', function (req, reply) {
    reply.send(new Error('kaboom'))
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    headers: {
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify({ hello: 'world' }).substring(0, 5)
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({
      error: 'Internal Server Error',
      message: 'kaboom2',
      statusCode: 500
    })
    done()
  })
})

test('custom 500 with non-error and custom errorHandler', (done) => {
  expect.assertions(6)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', function (req, reply) {
    throw 'kaboom' // eslint-disable-line no-throw-literal
  })

  fastify.setErrorHandler(function (err, request, reply) {
    expect(typeof request === 'object').toBeTruthy()
    expect(request instanceof fastify[symbols.kRequest].parent).toBeTruthy()
    reply
      .code(500)
      .type('text/plain')
      .send('an error happened: ' + err.message)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(res.headers['content-type']).toBe('text/plain')
    expect(res.payload).toEqual('an error happened: undefined')
    done()
  })
})

test('custom 500 with XufaError detection', (done) => {
  expect.assertions(18)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/string', function (req, reply) {
    throw 'kaboom' // eslint-disable-line no-throw-literal
  })

  fastify.get('/native-error', function (req, reply) {
    throw new Error('kaboom')
  })

  fastify.get('/fastify-error', function (req, reply) {
    throw new XufaError('kaboom')
  })

  fastify.setErrorHandler(function (err, request, reply) {
    expect(typeof request === 'object').toBeTruthy()
    expect(request instanceof fastify[symbols.kRequest].parent).toBeTruthy()
    if (err instanceof XufaError) {
      reply
        .code(500)
        .type('text/plain')
        .send('XufaError thrown')
    } else if (err instanceof Error) {
      reply
        .code(500)
        .type('text/plain')
        .send('Error thrown')
    } else {
      reply
        .code(500)
        .type('text/plain')
        .send('Primitive thrown')
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/string'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(res.headers['content-type']).toBe('text/plain')
    expect(res.payload).toEqual('Primitive thrown')

    fastify.inject({
      method: 'GET',
      url: '/native-error'
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).toBe(500)
      expect(res.headers['content-type']).toBe('text/plain')
      expect(res.payload).toEqual('Error thrown')

      fastify.inject({
        method: 'GET',
        url: '/fastify-error'
      }, (err, res) => {
        expect(err).toBeFalsy()
        expect(res.statusCode).toBe(500)
        expect(res.headers['content-type']).toBe('text/plain')
        expect(res.payload).toEqual('XufaError thrown')
        done()
      })
    })
  })
})
