'use strict'



const Fastify = require('..')
const fp = require('..').plugin

test('require a plugin', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()
  fastify.register(require('./plugin.helper'))
  fastify.ready(() => {
    expect(fastify.test).toBeTruthy()
    testDone()
  })
})

test('plugin metadata - ignore prefix', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  plugin[Symbol.for('skip-override')] = true
  fastify.register(plugin, { prefix: 'foo' })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, function (err, res) {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('hello')
    testDone()
  })

  function plugin (instance, opts, done) {
    instance.get('/', function (request, reply) {
      reply.send('hello')
    })
    done()
  }
})

test('plugin metadata - naming plugins', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.register(require('./plugin.name.display'))
  fastify.register(function (fastify, opts, done) {
    // one line
    expect(fastify.pluginName).toBe('function (fastify, opts, done) { -- // one line')
    done()
  })
  fastify.register(function fooBar (fastify, opts, done) {
    expect(fastify.pluginName).toBe('fooBar')
    done()
  })

  await fastify.ready()
})

test('fastify.register with fastify-plugin should not encapsulate his code', async () => {
  expect.assertions(9)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.register(fp((i, o, n) => {
      i.decorate('test', () => {})
      expect(i.test).toBeTruthy()
      n()
    }))

    expect(instance.test).toBeFalsy()

    // the decoration is added at the end
    instance.after(() => {
      expect(instance.test).toBeTruthy()
    })

    instance.get('/', (req, reply) => {
      expect(instance.test).toBeTruthy()
      reply.send({ hello: 'world' })
    })

    done()
  })

  fastify.ready(() => {
    expect(fastify.test).toBeFalsy()
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  const body = await result.text()
  expect(result.headers.get('content-length')).toBe('' + body.length)
  expect(JSON.parse(body)).toEqual({ hello: 'world' })
})

test('fastify.register with fastify-plugin should provide access to external fastify instance if opts argument is a function', async () => {
  expect.assertions(21)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.register(fp((i, o, n) => {
      i.decorate('global', () => {})
      expect(i.global).toBeTruthy()
      n()
    }))

    instance.register((i, o, n) => n(), p => {
      expect(p === instance || p === fastify).toBeFalsy()
      expect(Object.prototype.isPrototypeOf.call(instance, p)).toBeTruthy()
      expect(Object.prototype.isPrototypeOf.call(fastify, p)).toBeTruthy()
      expect(p.global).toBeTruthy()
    })

    instance.register((i, o, n) => {
      i.decorate('local', () => {})
      n()
    })

    instance.register((i, o, n) => n(), p => expect(p.local).toBeFalsy())

    instance.register((i, o, n) => {
      expect(i.local).toBeTruthy()
      n()
    }, p => p.decorate('local', () => {}))

    instance.register((i, o, n) => n(), p => expect(p.local).toBeFalsy())

    instance.register(fp((i, o, n) => {
      expect(i.global_2).toBeTruthy()
      n()
    }), p => p.decorate('global_2', () => 'hello'))

    instance.register((i, o, n) => {
      i.decorate('global_2', () => 'world')
      n()
    }, p => p.get('/', (req, reply) => {
      expect(p.global_2).toBeTruthy()
      reply.send({ hello: p.global_2() })
    }))

    expect(instance.global).toBeFalsy()
    expect(instance.global_2).toBeFalsy()
    expect(instance.local).toBeFalsy()

    // the decoration is added at the end
    instance.after(() => {
      expect(instance.global).toBeTruthy()
      expect(instance.global_2()).toBe('hello')
      expect(instance.local).toBeFalsy()
    })

    done()
  })

  fastify.ready(() => {
    expect(fastify.global).toBeFalsy()
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  const body = await result.text()
  expect(result.headers.get('content-length')).toBe('' + body.length)
  expect(JSON.parse(body)).toEqual({ hello: 'world' })
})

test('fastify.register with fastify-plugin registers fastify level plugins', async () => {
  expect.assertions(14)
  const fastify = Fastify()

  function fastifyPlugin (instance, opts, done) {
    instance.decorate('test', 'first')
    expect(instance.test).toBeTruthy()
    done()
  }

  function innerPlugin (instance, opts, done) {
    instance.decorate('test2', 'second')
    done()
  }

  fastify.register(fp(fastifyPlugin))

  fastify.register((instance, opts, done) => {
    expect(instance.test).toBeTruthy()
    instance.register(fp(innerPlugin))

    instance.get('/test2', (req, reply) => {
      expect(instance.test2).toBeTruthy()
      reply.send({ test2: instance.test2 })
    })

    done()
  })

  fastify.ready(() => {
    expect(fastify.test).toBeTruthy()
    expect(fastify.test2).toBeFalsy()
  })

  fastify.get('/', (req, reply) => {
    expect(fastify.test).toBeTruthy()
    reply.send({ test: fastify.test })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result1 = await fetch(fastifyServer)
  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)
  const body1 = await result1.text()
  expect(result1.headers.get('content-length')).toBe('' + body1.length)
  expect(JSON.parse(body1)).toEqual({ test: 'first' })

  const result2 = await fetch(fastifyServer + '/test2')
  expect(result2.ok).toBeTruthy()
  expect(result2.status).toBe(200)
  const body2 = await result2.text()
  expect(result2.headers.get('content-length')).toBe('' + body2.length)
  expect(JSON.parse(body2)).toEqual({ test2: 'second' })
})
