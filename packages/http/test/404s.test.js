'use strict'


const fp = require('@xufa/http').plugin
const errors = require('http-errors')
const split = require('split2')
const Fastify = require('..')
const { getServerUrl } = require('./helper')

describe('default 404', () => {

const fastify = Fastify()
fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })
afterAll(() => { fastify.close() })
beforeAll(async () => {
await fastify.listen({ port: 0 })
})
test('unsupported method', async () => {
    expect.assertions(3)
    const result = await fetch(getServerUrl(fastify), {
      method: 'PUT'
    })

    expect(result.ok).toBeFalsy()
    expect(result.status).toBe(404)
    expect(result.headers.get('content-type')).toBe('application/json; charset=utf-8')
  })
test('framework-unsupported method', async () => {
    expect.assertions(3)
    const result = await fetch(getServerUrl(fastify), {
      method: 'PROPFIND'
    })

    expect(result.ok).toBeFalsy()
    expect(result.status).toBe(404)
    expect(result.headers.get('content-type')).toBe('application/json; charset=utf-8')
  })
test('unsupported route', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify) + '/notSupported')

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
  })
test('using post method and multipart/formdata', async () => {
    expect.assertions(3)
    const form = new FormData()
    form.set('test-field', 'just some field')

    const response = await fetch(getServerUrl(fastify) + '/notSupported', {
      method: 'POST',
      body: form
    })
    expect(response.status).toBe(404)
    expect(response.statusText).toBe('Not Found')
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
  })
})

describe('customized 404', () => {

const fastify = Fastify()
fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })
fastify.get('/with-error', function (req, reply) {
    reply.send(new errors.NotFound())
  })
fastify.get('/with-error-custom-header', function (req, reply) {
    const err = new errors.NotFound()
    err.headers = { 'x-foo': 'bar' }
    reply.send(err)
  })
fastify.setNotFoundHandler(function (req, reply) {
    reply.code(404).send('this was not found')
  })
afterAll(() => { fastify.close() })
beforeAll(async () => {
await fastify.listen({ port: 0 })
})
test('unsupported method', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify), {
      method: 'PUT',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('this was not found')
  })
test('framework-unsupported method', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify), {
      method: 'PROPFIND',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('this was not found')
  })
test('unsupported route', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify) + '/notSupported')

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('this was not found')
  })
test('with error object', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify) + '/with-error')

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: 'Not Found',
      message: 'Not Found',
      statusCode: 404
    })
  })
test('error object with headers property', async () => {
    expect.assertions(4)
    const response = await fetch(getServerUrl(fastify) + '/with-error-custom-header')

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(response.headers.get('x-foo')).toBe('bar')
    expect(await response.json()).toEqual({
      error: 'Not Found',
      message: 'Not Found',
      statusCode: 404
    })
  })
})

describe('custom header in notFound handler', () => {

const fastify = Fastify()
fastify.setNotFoundHandler(function (req, reply) {
    reply.code(404).header('x-foo', 'bar').send('this was not found')
  })
afterAll(() => { fastify.close() })
beforeAll(async () => {
await fastify.listen({ port: 0 })
})
test('not found with custom header', async () => {
    expect.assertions(4)
    const response = await fetch(getServerUrl(fastify) + '/notSupported')

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(response.headers.get('x-foo')).toBe('bar')
    expect(await response.text()).toBe('this was not found')
  })
})

describe('setting a custom 404 handler multiple times is an error', () => {

test('at the root level', async () => {
    expect.assertions(2)

    const fastify = Fastify()

    fastify.setNotFoundHandler(() => {})

    try {
      fastify.setNotFoundHandler(() => {})
      expect.fail('setting multiple 404 handlers at the same prefix encapsulation level should throw')
    } catch (err) {
      expect(err instanceof Error).toBeTruthy()
      expect(err.message).toBe('Not found handler already set for Xufa instance with prefix: \'/\'')
    }
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('at the plugin level', (done) => {
    expect.assertions(3)

    const fastify = Fastify()

    fastify.register((instance, options, done) => {
      instance.setNotFoundHandler(() => {})

      try {
        instance.setNotFoundHandler(() => {})
        expect.fail('setting multiple 404 handlers at the same prefix encapsulation level should throw')
      } catch (err) {
        expect(err instanceof Error).toBeTruthy()
        expect(err.message).toBe('Not found handler already set for Xufa instance with prefix: \'/prefix\'')
      }

      done()
    }, { prefix: '/prefix' })

    fastify.listen({ port: 0 }, err => {
      expect(err).toBeFalsy()
      fastify.close()
      done()
    })
  })
test('at multiple levels', (done) => {
    expect.assertions(3)

    const fastify = Fastify()

    fastify.register((instance, options, done) => {
      try {
        instance.setNotFoundHandler(() => {})
        expect.fail('setting multiple 404 handlers at the same prefix encapsulation level should throw')
      } catch (err) {
        expect(err instanceof Error).toBeTruthy()
        expect(err.message).toBe('Not found handler already set for Xufa instance with prefix: \'/\'')
      }
      done()
    })

    fastify.setNotFoundHandler(() => {})

    fastify.listen({ port: 0 }, err => {
      expect(err).toBeFalsy()
      fastify.close()
      done()
    })
  })
test('at multiple levels / 2', (done) => {
    expect.assertions(3)

    const fastify = Fastify()

    fastify.register((instance, options, done) => {
      instance.setNotFoundHandler(() => {})

      instance.register((instance2, options, done) => {
        try {
          instance2.setNotFoundHandler(() => {})
          expect.fail('setting multiple 404 handlers at the same prefix encapsulation level should throw')
        } catch (err) {
          expect(err instanceof Error).toBeTruthy()
          expect(err.message).toBe('Not found handler already set for Xufa instance with prefix: \'/prefix\'')
        }
        done()
      })

      done()
    }, { prefix: '/prefix' })

    fastify.setNotFoundHandler(() => {})

    fastify.listen({ port: 0 }, err => {
      expect(err).toBeFalsy()
      fastify.close()
      done()
    })
  })
test('in separate plugins at the same level', (done) => {
    expect.assertions(3)

    const fastify = Fastify()

    fastify.register((instance, options, done) => {
      instance.register((instance2A, options, done) => {
        instance2A.setNotFoundHandler(() => {})
        done()
      })

      instance.register((instance2B, options, done) => {
        try {
          instance2B.setNotFoundHandler(() => {})
          expect.fail('setting multiple 404 handlers at the same prefix encapsulation level should throw')
        } catch (err) {
          expect(err instanceof Error).toBeTruthy()
          expect(err.message).toBe('Not found handler already set for Xufa instance with prefix: \'/prefix\'')
        }
        done()
      })

      done()
    }, { prefix: '/prefix' })

    fastify.setNotFoundHandler(() => {})

    fastify.listen({ port: 0 }, err => {
      expect(err).toBeFalsy()
      fastify.close()
      done()
    })
  })
})

describe('encapsulated 404', () => {

const fastify = Fastify()
fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })
fastify.setNotFoundHandler(function (req, reply) {
    reply.code(404).send('this was not found')
  })
fastify.register(function (f, opts, done) {
    f.setNotFoundHandler(function (req, reply) {
      reply.code(404).send('this was not found 2')
    })
    done()
  }, { prefix: '/test' })
fastify.register(function (f, opts, done) {
    f.setNotFoundHandler(function (req, reply) {
      reply.code(404).send('this was not found 3')
    })
    done()
  }, { prefix: '/test2' })
fastify.register(function (f, opts, done) {
    f.setNotFoundHandler(function (request, reply) {
      reply.code(404).send('this was not found 4')
    })
    done()
  }, { prefix: '/test3/' })
afterAll(() => { fastify.close() })
beforeAll(async () => {
await fastify.listen({ port: 0 })
})
test('root unsupported method', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify), {
      method: 'PUT',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('this was not found')
  })
test('root framework-unsupported method', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify), {
      method: 'PROPFIND',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('this was not found')
  })
test('root unsupported route', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify) + '/notSupported')

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('this was not found')
  })
test('unsupported method', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify) + '/test', {
      method: 'PUT',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('this was not found 2')
  })
test('framework-unsupported method', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify) + '/test', {
      method: 'PROPFIND',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('this was not found 2')
  })
test('unsupported route', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify) + '/test/notSupported')

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('this was not found 2')
  })
test('unsupported method 2', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify) + '/test2', {
      method: 'PUT',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('this was not found 3')
  })
test('framework-unsupported method 2', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify) + '/test2', {
      method: 'PROPFIND',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('this was not found 3')
  })
test('unsupported route 2', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify) + '/test2/notSupported')

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('this was not found 3')
  })
test('unsupported method 3', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify) + '/test3/', {
      method: 'PUT',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('this was not found 4')
  })
test('framework-unsupported method 3', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify) + '/test3/', {
      method: 'PROPFIND',
      body: JSON.stringify({ hello: 'world' }),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('this was not found 4')
  })
test('unsupported route 3', async () => {
    expect.assertions(3)
    const response = await fetch(getServerUrl(fastify) + '/test3/notSupported')

    expect(response.ok).toBeFalsy()
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('this was not found 4')
  })
})

test('custom 404 hook and handler context', async () => {
  expect.assertions(19)

  const fastify = Fastify()

  fastify.decorate('foo', 42)

  fastify.addHook('onRequest', function (req, res, done) {
    expect(this.foo).toBe(42)
    done()
  })
  fastify.addHook('preHandler', function (request, reply, done) {
    expect(this.foo).toBe(42)
    done()
  })
  fastify.addHook('onSend', function (request, reply, payload, done) {
    expect(this.foo).toBe(42)
    done()
  })
  fastify.addHook('onResponse', function (request, reply, done) {
    expect(this.foo).toBe(42)
    done()
  })

  fastify.setNotFoundHandler(function (req, reply) {
    expect(this.foo).toBe(42)
    reply.code(404).send('this was not found')
  })

  fastify.register(function (instance, opts, done) {
    instance.decorate('bar', 84)

    instance.addHook('onRequest', function (req, res, done) {
      expect(this.bar).toBe(84)
      done()
    })
    instance.addHook('preHandler', function (request, reply, done) {
      expect(this.bar).toBe(84)
      done()
    })
    instance.addHook('onSend', function (request, reply, payload, done) {
      expect(this.bar).toBe(84)
      done()
    })
    instance.addHook('onResponse', function (request, reply, done) {
      expect(this.bar).toBe(84)
      done()
    })

    instance.setNotFoundHandler(function (req, reply) {
      expect(this.foo).toBe(42)
      expect(this.bar).toBe(84)
      reply.code(404).send('encapsulated was not found')
    })

    done()
  }, { prefix: '/encapsulated' })

  {
    const res = await fastify.inject('/not-found')
    expect(res.statusCode).toBe(404)
    expect(res.payload).toBe('this was not found')
  }

  {
    const res = await fastify.inject('/encapsulated/not-found')
    expect(res.statusCode).toBe(404)
    expect(res.payload).toBe('encapsulated was not found')
  }
})

test('encapsulated custom 404 without - prefix hook and handler context', (done) => {
  expect.assertions(13)

  const fastify = Fastify()

  fastify.decorate('foo', 42)

  fastify.register(function (instance, opts, done) {
    instance.decorate('bar', 84)

    instance.addHook('onRequest', function (req, res, done) {
      expect(this.foo).toBe(42)
      expect(this.bar).toBe(84)
      done()
    })
    instance.addHook('preHandler', function (request, reply, done) {
      expect(this.foo).toBe(42)
      expect(this.bar).toBe(84)
      done()
    })
    instance.addHook('onSend', function (request, reply, payload, done) {
      expect(this.foo).toBe(42)
      expect(this.bar).toBe(84)
      done()
    })
    instance.addHook('onResponse', function (request, reply, done) {
      expect(this.foo).toBe(42)
      expect(this.bar).toBe(84)
      done()
    })

    instance.setNotFoundHandler(function (request, reply) {
      expect(this.foo).toBe(42)
      expect(this.bar).toBe(84)
      reply.code(404).send('custom not found')
    })

    done()
  })

  fastify.inject('/not-found', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    expect(res.payload).toBe('custom not found')
    done()
  })
})

test('run hooks on default 404', async () => {
  expect.assertions(6)

  const fastify = Fastify()

  fastify.addHook('onRequest', function (req, res, done) {
    expect(true).toBeTruthy()
    done()
  })

  fastify.addHook('preHandler', function (request, reply, done) {
    expect(true).toBeTruthy()
    done()
  })

  fastify.addHook('onSend', function (request, reply, payload, done) {
    expect(true).toBeTruthy()
    done()
  })

  fastify.addHook('onResponse', function (request, reply, done) {
    expect(true).toBeTruthy()
    done()
  })

  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  onTestFinished(() => { fastify.close() })

  await fastify.listen({ port: 0 })

  const response = await fetch(getServerUrl(fastify), {
    method: 'PUT',
    body: JSON.stringify({ hello: 'world' }),
    headers: { 'Content-Type': 'application/json' }
  })

  expect(response.ok).toBeFalsy()
  expect(response.status).toBe(404)
})

test('run non-encapsulated plugin hooks on default 404', (done) => {
  expect.assertions(6)

  const fastify = Fastify()

  fastify.register(fp(function (instance, options, done) {
    instance.addHook('onRequest', function (req, res, done) {
      expect(true).toBeTruthy()
      done()
    })

    instance.addHook('preHandler', function (request, reply, done) {
      expect(true).toBeTruthy()
      done()
    })

    instance.addHook('onSend', function (request, reply, payload, done) {
      expect(true).toBeTruthy()
      done()
    })

    instance.addHook('onResponse', function (request, reply, done) {
      expect(true).toBeTruthy()
      done()
    })

    done()
  }))

  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    done()
  })
})

test('run non-encapsulated plugin hooks on custom 404', (done) => {
  expect.assertions(11)

  const fastify = Fastify()

  const plugin = fp((instance, opts, done) => {
    instance.addHook('onRequest', function (req, res, done) {
      expect(true).toBeTruthy()
      done()
    })

    instance.addHook('preHandler', function (request, reply, done) {
      expect(true).toBeTruthy()
      done()
    })

    instance.addHook('onSend', function (request, reply, payload, done) {
      expect(true).toBeTruthy()
      done()
    })

    instance.addHook('onResponse', function (request, reply, done) {
      expect(true).toBeTruthy()
      done()
    })

    done()
  })

  fastify.register(plugin)

  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.setNotFoundHandler(function (req, reply) {
    reply.code(404).send('this was not found')
  })

  fastify.register(plugin) // Registering plugin after handler also works

  fastify.inject({ url: '/not-found' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    expect(res.payload).toBe('this was not found')
    done()
  })
})

test('run hook with encapsulated 404', async () => {
  expect.assertions(10)

  const fastify = Fastify()

  fastify.addHook('onRequest', function (req, res, done) {
    expect(true).toBeTruthy()
    done()
  })

  fastify.addHook('preHandler', function (request, reply, done) {
    expect(true).toBeTruthy()
    done()
  })

  fastify.addHook('onSend', function (request, reply, payload, done) {
    expect(true).toBeTruthy()
    done()
  })

  fastify.addHook('onResponse', function (request, reply, done) {
    expect(true).toBeTruthy()
    done()
  })

  fastify.register(function (f, opts, done) {
    f.setNotFoundHandler(function (req, reply) {
      reply.code(404).send('this was not found 2')
    })

    f.addHook('onRequest', function (req, res, done) {
      expect(true).toBeTruthy()
      done()
    })

    f.addHook('preHandler', function (request, reply, done) {
      expect(true).toBeTruthy()
      done()
    })

    f.addHook('onSend', function (request, reply, payload, done) {
      expect(true).toBeTruthy()
      done()
    })

    f.addHook('onResponse', function (request, reply, done) {
      expect(true).toBeTruthy()
      done()
    })

    done()
  }, { prefix: '/test' })

  onTestFinished(() => { fastify.close() })

  await fastify.listen({ port: 0 })

  const response = await fetch(getServerUrl(fastify) + '/test', {
    method: 'PUT',
    body: JSON.stringify({ hello: 'world' }),
    headers: { 'Content-Type': 'application/json' }
  })

  expect(response.ok).toBeFalsy()
  expect(response.status).toBe(404)
})

test('run hook with encapsulated 404 and framework-unsupported method', async () => {
  expect.assertions(10)

  const fastify = Fastify()

  fastify.addHook('onRequest', function (req, res, done) {
    expect(true).toBeTruthy()
    done()
  })

  fastify.addHook('preHandler', function (request, reply, done) {
    expect(true).toBeTruthy()
    done()
  })

  fastify.addHook('onSend', function (request, reply, payload, done) {
    expect(true).toBeTruthy()
    done()
  })

  fastify.addHook('onResponse', function (request, reply, done) {
    expect(true).toBeTruthy()
    done()
  })

  fastify.register(function (f, opts, done) {
    f.setNotFoundHandler(function (req, reply) {
      reply.code(404).send('this was not found 2')
    })

    f.addHook('onRequest', function (req, res, done) {
      expect(true).toBeTruthy()
      done()
    })

    f.addHook('preHandler', function (request, reply, done) {
      expect(true).toBeTruthy()
      done()
    })

    f.addHook('onSend', function (request, reply, payload, done) {
      expect(true).toBeTruthy()
      done()
    })

    f.addHook('onResponse', function (request, reply, done) {
      expect(true).toBeTruthy()
      done()
    })

    done()
  }, { prefix: '/test' })

  onTestFinished(() => { fastify.close() })

  await fastify.listen({ port: 0 })

  const response = await fetch(getServerUrl(fastify) + '/test', {
    method: 'PROPFIND',
    body: JSON.stringify({ hello: 'world' }),
    headers: { 'Content-Type': 'application/json' }
  })

  expect(response.ok).toBeFalsy()
  expect(response.status).toBe(404)
})

test('hooks check 404', async () => {
  expect.assertions(12)

  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    expect(req.query).toEqual({ foo: 'asd' })
    expect(true).toBeTruthy()
    done()
  })
  fastify.addHook('onRequest', (req, res, done) => {
    expect(true).toBeTruthy()
    done()
  })
  fastify.addHook('onResponse', (request, reply, done) => {
    expect(true).toBeTruthy()
    done()
  })

  onTestFinished(() => { fastify.close() })

  await fastify.listen({ port: 0 })

  const response1 = await fetch(getServerUrl(fastify) + '?foo=asd', {
    method: 'PUT',
    body: JSON.stringify({ hello: 'world' }),
    headers: { 'Content-Type': 'application/json' }
  })

  expect(response1.ok).toBeFalsy()
  expect(response1.status).toBe(404)

  const response2 = await fetch(getServerUrl(fastify) + '/notSupported?foo=asd')

  expect(response2.ok).toBeFalsy()
  expect(response2.status).toBe(404)
})

test('setNotFoundHandler should not suppress duplicated routes checking', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  try {
    fastify.get('/', function (req, reply) {
      reply.send({ hello: 'world' })
    })
    fastify.get('/', function (req, reply) {
      reply.send({ hello: 'world' })
    })
    fastify.setNotFoundHandler(function (req, reply) {
      reply.code(404).send('this was not found')
    })

    expect.fail('setNotFoundHandler should not interfere duplicated route error')
  } catch (error) {
    expect(error).toBeTruthy()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

describe('log debug for 404', () => {

const Writable = require('node:stream').Writable
const logStream = new Writable()
logStream.logs = []
logStream._write = function (chunk, encoding, callback) {
    this.logs.push(chunk.toString())
    callback()
  }
const fastify = Fastify({
    logger: {
      level: 'trace',
      stream: logStream
    }
  })
fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })
afterAll(() => { fastify.close() })
test('log debug', (done) => {
    expect.assertions(7)
    fastify.inject({
      method: 'GET',
      url: '/not-found'
    }, (err, response) => {
      expect(err).toBeFalsy()
      expect(response.statusCode).toBe(404)

      const INFO_LEVEL = 30
      expect(JSON.parse(logStream.logs[0]).msg).toBe('incoming request')
      expect(JSON.parse(logStream.logs[1]).msg).toBe('Route GET:/not-found not found')
      expect(JSON.parse(logStream.logs[1]).level).toBe(INFO_LEVEL)
      expect(JSON.parse(logStream.logs[2]).msg).toBe('request completed')
      expect(logStream.logs.length).toBe(3)
      done()
    })
  })
})

test('Unknown method', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  onTestFinished(() => { fastify.close() })

  await fastify.listen({ port: 0 })

  const handler = () => {}
  // See https://github.com/fastify/light-my-request/pull/20
  expect(() => fastify.inject({
    method: 'UNKNOWN_METHOD',
    url: '/'
  }, handler)).toThrow(Error)

  const response = await fetch(getServerUrl(fastify), {
    method: 'UNKNOWN_METHOD'
  })

  expect(response.ok).toBeFalsy()
  expect(response.status).toBe(400)

  expect(await response.json()).toEqual({
    error: 'Bad Request',
    message: 'Client Error',
    statusCode: 400
  })
})

test('recognizes errors from the http-errors module', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.send(new errors.NotFound())
  })

  onTestFinished(() => { fastify.close() })

  await fastify.listen({ port: 0 })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
  })

  const response = await fetch(getServerUrl(fastify))

  expect(response.ok).toBeFalsy()
  expect(await response.json()).toEqual({
    error: 'Not Found',
    message: 'Not Found',
    statusCode: 404
  })
})

test('the default 404 handler can be invoked inside a prefixed plugin', (done) => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.register(function (instance, opts, done) {
    instance.get('/path', function (request, reply) {
      reply.send(new errors.NotFound())
    })

    done()
  }, { prefix: '/v1' })

  fastify.inject('/v1/path', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Not Found',
      message: 'Not Found',
      statusCode: 404
    })
    done()
  })
})

test('an inherited custom 404 handler can be invoked inside a prefixed plugin', (done) => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.setNotFoundHandler(function (request, reply) {
    reply.code(404).send('custom handler')
  })

  fastify.register(function (instance, opts, done) {
    instance.get('/path', function (request, reply) {
      reply.send(new errors.NotFound())
    })

    done()
  }, { prefix: '/v1' })

  fastify.inject('/v1/path', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Not Found',
      message: 'Not Found',
      statusCode: 404
    })
    done()
  })
})

test('encapsulated custom 404 handler without a prefix is the handler for the entire 404 level', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.register(function (instance, opts, done) {
    instance.setNotFoundHandler(function (request, reply) {
      reply.code(404).send('custom handler')
    })

    done()
  })

  fastify.register(function (instance, opts, done) {
    instance.register(function (instance2, opts, done) {
      instance2.setNotFoundHandler(function (request, reply) {
        reply.code(404).send('custom handler 2')
      })
      done()
    })

    done()
  }, { prefix: 'prefixed' })

  {
    const res = await fastify.inject('/not-found')
    expect(res.statusCode).toBe(404)
    expect(res.payload).toBe('custom handler')
  }

  {
    const res = await fastify.inject('/prefixed/not-found')
    expect(res.statusCode).toBe(404)
    expect(res.payload).toBe('custom handler 2')
  }
})

test('cannot set notFoundHandler after binding', (done) => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => { fastify.close() })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    try {
      fastify.setNotFoundHandler(() => { })
      expect.fail()
    } catch (e) {
      expect(true).toBeTruthy()
      done()
    }
  })
})

test('404 inside onSend', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  let called = false

  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.addHook('onSend', function (request, reply, payload, done) {
    if (!called) {
      called = true
      done(new errors.NotFound())
    } else {
      done()
    }
  })

  onTestFinished(() => { fastify.close() })

  await fastify.listen({ port: 0 })

  const response = await fetch(getServerUrl(fastify))

  expect(response.ok).toBeFalsy()
  expect(response.status).toBe(404)
})

// https://github.com/fastify/fastify/issues/868
test('onSend hooks run when an encapsulated route invokes the notFound handler', (done) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.register((instance, options, done) => {
    instance.addHook('onSend', (request, reply, payload, done) => {
      expect(true).toBeTruthy()
      done()
    })

    instance.get('/', (request, reply) => {
      reply.send(new errors.NotFound())
    })

    done()
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    done()
  })
})

// https://github.com/fastify/fastify/issues/713
describe('preHandler option for setNotFoundHandler', () => {

test('preHandler option', (done) => {
    expect.assertions(2)
    const fastify = Fastify()

    fastify.setNotFoundHandler({
      preHandler: (req, reply, done) => {
        req.body.preHandler = true
        done()
      }
    }, function (req, reply) {
      reply.code(404).send(req.body)
    })

    fastify.inject({
      method: 'POST',
      url: '/not-found',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(payload).toEqual({ preHandler: true, hello: 'world' })
      done()
    })
  })
test('preHandler hook in setNotFoundHandler should be called when callNotFound', (done) => {
    expect.assertions(3)
    const fastify = Fastify()

    fastify.setNotFoundHandler({
      preHandler: (req, reply, done) => {
        req.body.preHandler = true
        done()
      }
    }, function (req, reply) {
      reply.code(404).send(req.body)
    })

    fastify.post('/', function (req, reply) {
      expect(reply.callNotFound()).toBe(reply)
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(payload).toEqual({ preHandler: true, hello: 'world' })
      done()
    })
  }, 40000)
test('preHandler hook in setNotFoundHandler should be called when callNotFound and the route is registered first', (done) => {
    expect.assertions(3)
    const fastify = Fastify()

    // Register the route before the not-found handler so that the route's
    // preReady callback snapshots the not-found context before its lifecycle
    // hooks are populated.
    fastify.post('/', function (req, reply) {
      expect(reply.callNotFound()).toBe(reply)
    })

    fastify.setNotFoundHandler({
      preHandler: (req, reply, done) => {
        req.body.preHandler = true
        done()
      }
    }, function (req, reply) {
      reply.code(404).send(req.body)
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(payload).toEqual({ preHandler: true, hello: 'world' })
      done()
    })
  })
test('preHandler hook in setNotFoundHandler should accept an array of functions and be called when callNotFound', (done) => {
    expect.assertions(2)
    const fastify = Fastify()

    fastify.setNotFoundHandler({
      preHandler: [
        (req, reply, done) => {
          req.body.preHandler1 = true
          done()
        },
        (req, reply, done) => {
          req.body.preHandler2 = true
          done()
        }
      ]
    }, function (req, reply) {
      reply.code(404).send(req.body)
    })

    fastify.post('/', function (req, reply) {
      reply.callNotFound()
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(payload).toEqual({ preHandler1: true, preHandler2: true, hello: 'world' })
      done()
    })
  })
test('preHandler option should be called after preHandler hook', (done) => {
    expect.assertions(2)
    const fastify = Fastify()

    fastify.addHook('preHandler', (req, reply, done) => {
      req.body.check = 'a'
      done()
    })

    fastify.setNotFoundHandler({
      preHandler: (req, reply, done) => {
        req.body.check += 'b'
        done()
      }
    }, (req, reply) => {
      reply.send(req.body)
    })

    fastify.inject({
      method: 'POST',
      url: '/',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(payload).toEqual({ check: 'ab', hello: 'world' })
      done()
    })
  })
test('preHandler option should be unique per prefix', async () => {
    expect.assertions(2)
    const fastify = Fastify()

    fastify.setNotFoundHandler({
      preHandler: (req, reply, done) => {
        req.body.hello = 'earth'
        done()
      }
    }, (req, reply) => {
      reply.send(req.body)
    })

    fastify.register(function (i, o, n) {
      i.setNotFoundHandler((req, reply) => {
        reply.send(req.body)
      })

      n()
    }, { prefix: '/no' })

    {
      const res = await fastify.inject({
        method: 'POST',
        url: '/not-found',
        payload: { hello: 'world' }
      })

      const payload = JSON.parse(res.payload)
      expect(payload).toEqual({ hello: 'earth' })
    }

    {
      const res = await fastify.inject({
        method: 'POST',
        url: '/no/not-found',
        payload: { hello: 'world' }
      })

      const payload = JSON.parse(res.payload)
      expect(payload).toEqual({ hello: 'world' })
    }
  })
test('preHandler option should handle errors', (done) => {
    expect.assertions(3)
    const fastify = Fastify()

    fastify.setNotFoundHandler({
      preHandler: (req, reply, done) => {
        done(new Error('kaboom'))
      }
    }, (req, reply) => {
      reply.send(req.body)
    })

    fastify.inject({
      method: 'POST',
      url: '/not-found',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(res.statusCode).toBe(500)
      expect(payload).toEqual({
        message: 'kaboom',
        error: 'Internal Server Error',
        statusCode: 500
      })
      done()
    })
  })
test('preHandler option should handle errors with custom status code', (done) => {
    expect.assertions(3)
    const fastify = Fastify()

    fastify.setNotFoundHandler({
      preHandler: (req, reply, done) => {
        reply.code(401)
        done(new Error('go away'))
      }
    }, (req, reply) => {
      reply.send(req.body)
    })

    fastify.inject({
      method: 'POST',
      url: '/not-found',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(res.statusCode).toBe(401)
      expect(payload).toEqual({
        message: 'go away',
        error: 'Unauthorized',
        statusCode: 401
      })
      done()
    })
  })
test('preHandler option could accept an array of functions', (done) => {
    expect.assertions(2)
    const fastify = Fastify()

    fastify.setNotFoundHandler({
      preHandler: [
        (req, reply, done) => {
          req.body.preHandler = 'a'
          done()
        },
        (req, reply, done) => {
          req.body.preHandler += 'b'
          done()
        }
      ]
    }, (req, reply) => {
      reply.send(req.body)
    })

    fastify.inject({
      method: 'POST',
      url: '/not-found',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(payload).toEqual({ preHandler: 'ab', hello: 'world' })
      done()
    })
  })
test('preHandler option does not interfere with preHandler', async () => {
    expect.assertions(2)
    const fastify = Fastify()

    fastify.addHook('preHandler', (req, reply, done) => {
      req.body.check = 'a'
      done()
    })

    fastify.setNotFoundHandler({
      preHandler: (req, reply, done) => {
        req.body.check += 'b'
        done()
      }
    }, (req, reply) => {
      reply.send(req.body)
    })

    fastify.register(function (i, o, n) {
      i.setNotFoundHandler((req, reply) => {
        reply.send(req.body)
      })

      n()
    }, { prefix: '/no' })

    {
      const res = await fastify.inject({
        method: 'post',
        url: '/not-found',
        payload: { hello: 'world' }
      })

      const payload = JSON.parse(res.payload)
      expect(payload).toEqual({ check: 'ab', hello: 'world' })
    }

    {
      const res = await fastify.inject({
        method: 'post',
        url: '/no/not-found',
        payload: { hello: 'world' }
      })

      const payload = JSON.parse(res.payload)
      expect(payload).toEqual({ check: 'a', hello: 'world' })
    }
  })
test('preHandler option should keep the context', (done) => {
    expect.assertions(3)
    const fastify = Fastify()

    fastify.decorate('foo', 42)

    fastify.setNotFoundHandler({
      preHandler: function (req, reply, done) {
        expect(this.foo).toBe(42)
        this.foo += 1
        req.body.foo = this.foo
        done()
      }
    }, (req, reply) => {
      reply.send(req.body)
    })

    fastify.inject({
      method: 'POST',
      url: '/not-found',
      payload: { hello: 'world' }
    }, (err, res) => {
      expect(err).toBeFalsy()
      const payload = JSON.parse(res.payload)
      expect(payload).toEqual({ foo: 43, hello: 'world' })
      done()
    })
  })
})

test('reply.notFound invoked the notFound handler', (done) => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.setNotFoundHandler((req, reply) => {
    reply.code(404).send(new Error('kaboom'))
  })

  fastify.get('/', function (req, reply) {
    reply.callNotFound()
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Not Found',
      message: 'kaboom',
      statusCode: 404
    })
    done()
  })
})

test('The custom error handler should be invoked after the custom not found handler', (done) => {
  expect.assertions(6)

  const fastify = Fastify()
  const order = [1, 2]

  fastify.setErrorHandler((err, req, reply) => {
    expect(order.shift()).toBe(2)
    expect(err instanceof Error).toBeTruthy()
    reply.send(err)
  })

  fastify.setNotFoundHandler((req, reply) => {
    expect(order.shift()).toBe(1)
    reply.code(404).send(new Error('kaboom'))
  })

  fastify.get('/', function (req, reply) {
    reply.callNotFound()
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Not Found',
      message: 'kaboom',
      statusCode: 404
    })
    done()
  })
})

test('If the custom not found handler does not use an Error, the custom error handler should not be called', (done) => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.setErrorHandler((_err, req, reply) => {
    expect.fail('Should not be called')
  })

  fastify.setNotFoundHandler((req, reply) => {
    reply.code(404).send('kaboom')
  })

  fastify.get('/', function (req, reply) {
    reply.callNotFound()
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    expect(res.payload).toBe('kaboom')
    done()
  })
})

test('preValidation option', (done) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.decorate('foo', true)

  fastify.setNotFoundHandler({
    preValidation: function (req, reply, done) {
      expect(this.foo).toBeTruthy()
      done()
    }
  }, function (req, reply) {
    reply.code(404).send(req.body)
  })

  fastify.inject({
    method: 'POST',
    url: '/not-found',
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload).toEqual({ hello: 'world' })
    done()
  })
})

test('preValidation option could accept an array of functions', (done) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.setNotFoundHandler({
    preValidation: [
      (req, reply, done) => {
        expect('called').toBeTruthy()
        done()
      },
      (req, reply, done) => {
        expect('called').toBeTruthy()
        done()
      }
    ]
  }, (req, reply) => {
    reply.send(req.body)
  })

  fastify.inject({
    method: 'POST',
    url: '/not-found',
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload).toEqual({ hello: 'world' })
    done()
  })
})

test('Should fail to invoke callNotFound inside a 404 handler', (done) => {
  expect.assertions(5)

  let fastify = null
  const logStream = split(JSON.parse)
  try {
    fastify = Fastify({
      logger: {
        stream: logStream,
        level: 'warn'
      }
    })
  } catch (e) {
    expect.fail()
  }

  fastify.setNotFoundHandler((req, reply) => {
    reply.callNotFound()
  })

  fastify.get('/', function (req, reply) {
    reply.callNotFound()
  })

  logStream.once('data', line => {
    expect(line.msg).toBe('Trying to send a NotFound error inside a 404 handler. Sending basic 404 response.')
    expect(line.level).toBe(40)
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    expect(res.payload).toBe('404 Not Found')
    done()
  })
})

describe('400 in case of bad url (pre find-my-way v2.2.0 was a 404)', () => {
test('Dynamic route', (done) => {
    expect.assertions(3)
    const fastify = Fastify()
    fastify.get('/hello/:id', () => expect.fail('we should not be here'))
    fastify.inject({
      url: '/hello/%world',
      method: 'GET'
    }, (err, response) => {
      expect(err).toBeFalsy()
      expect(response.statusCode).toBe(400)
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Bad Request',
        message: "'/hello/%world' is not a valid url component",
        statusCode: 400,
        code: 'XUFA_ERR_BAD_URL'
      })
      done()
    })
  })
test('Wildcard', (done) => {
    expect.assertions(3)
    const fastify = Fastify()
    fastify.get('*', () => expect.fail('we should not be here'))
    fastify.inject({
      url: '/hello/%world',
      method: 'GET'
    }, (err, response) => {
      expect(err).toBeFalsy()
      expect(response.statusCode).toBe(400)
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Bad Request',
        message: "'/hello/%world' is not a valid url component",
        statusCode: 400,
        code: 'XUFA_ERR_BAD_URL'
      })
      done()
    })
  })
test('No route registered', (done) => {
    expect.assertions(3)
    const fastify = Fastify()
    fastify.inject({
      url: '/%c0',
      method: 'GET'
    }, (err, response) => {
      expect(err).toBeFalsy()
      expect(response.statusCode).toBe(400)
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Bad Request',
        message: "'/%c0' is not a valid url component",
        statusCode: 400,
        code: 'XUFA_ERR_BAD_URL'
      })
      done()
    })
  })
test('Only / is registered', (done) => {
    expect.assertions(3)
    const fastify = Fastify()
    fastify.get('/', () => expect.fail('we should not be here'))
    fastify.inject({
      url: '/non-existing',
      method: 'GET'
    }, (err, response) => {
      expect(err).toBeFalsy()
      expect(response.statusCode).toBe(404)
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Not Found',
        message: 'Route GET:/non-existing not found',
        statusCode: 404
      })
      done()
    })
  })
test('customized 404', (done) => {
    expect.assertions(3)
    const fastify = Fastify({ logger: true })
    fastify.setNotFoundHandler(function (req, reply) {
      reply.code(404).send('this was not found')
    })
    fastify.inject({
      url: '/%c0',
      method: 'GET'
    }, (err, response) => {
      expect(err).toBeFalsy()
      expect(response.statusCode).toBe(400)
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Bad Request',
        message: "'/%c0' is not a valid url component",
        statusCode: 400,
        code: 'XUFA_ERR_BAD_URL'
      })
      done()
    })
  })
test('Bad URL does not invoke an encapsulated not found handler', async () => {
    const fastify = Fastify()
    let publicHandlerCalls = 0
    let privatePreHandlerCalls = 0
    let privateHandlerCalls = 0

    fastify.register(async function (instance) {
      instance.get('/existing', () => 'public')
      instance.setNotFoundHandler(function (_request, reply) {
        publicHandlerCalls++
        reply.code(404).send('public not found')
      })
    }, { prefix: '/public' })

    fastify.register(async function (instance) {
      instance.setNotFoundHandler({
        preHandler: function (request, reply, done) {
          privatePreHandlerCalls++
          if (request.headers.authorization !== 'Bearer valid') {
            reply.code(401).send('unauthorized')
          }
          done()
        }
      }, function (_request, reply) {
        privateHandlerCalls++
        reply.send('private canary')
      })
    }, { prefix: '/private' })

    const malformed = await fastify.inject({
      method: 'DELETE',
      url: '/public/%c0'
    })
    expect(malformed.statusCode).toBe(400)
    expect(JSON.parse(malformed.payload).code).toBe('XUFA_ERR_BAD_URL')
    expect(publicHandlerCalls).toBe(0)
    expect(privatePreHandlerCalls).toBe(0)
    expect(privateHandlerCalls).toBe(0)

    const unauthorized = await fastify.inject({
      method: 'DELETE',
      url: '/private/missing'
    })
    expect(unauthorized.statusCode).toBe(401)
    expect(unauthorized.payload).toBe('unauthorized')
    expect(privatePreHandlerCalls).toBe(1)
    expect(privateHandlerCalls).toBe(0)

    const authorized = await fastify.inject({
      method: 'DELETE',
      url: '/private/missing',
      headers: { authorization: 'Bearer valid' }
    })
    expect(authorized.statusCode).toBe(200)
    expect(authorized.payload).toBe('private canary')
    expect(privatePreHandlerCalls).toBe(2)
    expect(privateHandlerCalls).toBe(1)
  })
test('Bad URL with special characters should be properly JSON escaped', (done) => {
    expect.assertions(3)
    const fastify = Fastify()
    fastify.get('/hello/:id', () => expect.fail('we should not be here'))
    fastify.inject({
      url: '/hello/%world%22test',
      method: 'GET'
    }, (err, response) => {
      expect(err).toBeFalsy()
      expect(response.statusCode).toBe(400)
      expect(JSON.parse(response.payload)).toEqual({
        error: 'Bad Request',
        message: '\'/hello/%world%22test\' is not a valid url component',
        statusCode: 400,
        code: 'XUFA_ERR_BAD_URL'
      })
      done()
    })
  })
})

describe('setNotFoundHandler should be chaining fastify instance', () => {
test('Register route after setNotFoundHandler', async () => {
    expect.assertions(4)
    const fastify = Fastify()
    fastify.setNotFoundHandler(function (_req, reply) {
      reply.code(404).send('this was not found')
    }).get('/valid-route', function (_req, reply) {
      reply.send('valid route')
    })

    {
      const response = await fastify.inject({
        url: '/invalid-route',
        method: 'GET'
      })
      expect(response.statusCode).toBe(404)
      expect(response.payload).toBe('this was not found')
    }

    {
      const response = await fastify.inject({
        url: '/valid-route',
        method: 'GET'
      })

      expect(response.statusCode).toBe(200)
      expect(response.payload).toBe('valid route')
    }
  })
})

describe('Send 404 when frameworkError calls reply.callNotFound', () => {
test('Dynamic route', (done) => {
    expect.assertions(4)
    const fastify = Fastify({
      frameworkErrors: (error, req, reply) => {
        expect(error.message).toBe("'/hello/%world' is not a valid url component")
        return reply.callNotFound()
      }
    })
    fastify.get('/hello/:id', () => expect.fail('we should not be here'))
    fastify.inject({
      url: '/hello/%world',
      method: 'GET'
    }, (err, response) => {
      expect(err).toBeFalsy()
      expect(response.statusCode).toBe(404)
      expect(response.payload).toBe('404 Not Found')
      done()
    })
  })
})

test('hooks are applied to not found handlers /1', async () => {
  const fastify = Fastify()

  // adding await here is fundamental for this test
  await fastify.register(async function (fastify) {
  })

  fastify.setErrorHandler(function (_, request, reply) {
    return reply.code(401).send({ error: 'Unauthorized' })
  })

  fastify.addHook('preValidation', async function (request, reply) {
    throw new Error('kaboom')
  })

  const { statusCode } = await fastify.inject('/')
  expect(statusCode).toBe(401)
})

test('hooks are applied to not found handlers /2', async () => {
  const fastify = Fastify()

  async function plugin (fastify) {
    fastify.setErrorHandler(function (_, request, reply) {
      return reply.code(401).send({ error: 'Unauthorized' })
    })
  }

  plugin[Symbol.for('skip-override')] = true

  fastify.register(plugin)

  fastify.addHook('preValidation', async function (request, reply) {
    throw new Error('kaboom')
  })

  const { statusCode } = await fastify.inject('/')
  expect(statusCode).toBe(401)
})

test('hooks are applied to not found handlers /3', async () => {
  const fastify = Fastify()

  async function plugin (fastify) {
    fastify.setNotFoundHandler({ errorHandler }, async () => {
      expect.fail('this should never be called')
    })

    function errorHandler (_, request, reply) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  }

  plugin[Symbol.for('skip-override')] = true

  fastify.register(plugin)

  fastify.addHook('preValidation', async function (request, reply) {
    throw new Error('kaboom')
  })

  const { statusCode } = await fastify.inject('/')
  expect(statusCode).toBe(401)
})
