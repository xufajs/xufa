'use strict'


const Fastify = require('@xufa/http')
const fp = require('@xufa/http').plugin

test('if a plugin raises an error and there is not a callback to handle it, the server must not start', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    done(new Error('err'))
  })

  fastify.listen({ port: 0 }, err => {
    expect(err instanceof Error).toBeTruthy()
    expect(err.message).toBe('err')
    testDone()
  })
})

test('add hooks after route declaration', async () => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  function plugin (instance, opts, done) {
    instance.decorateRequest('check', null)
    instance.addHook('onRequest', (req, reply, done) => {
      req.check = {}
      done()
    })
    setImmediate(done)
  }
  fastify.register(fp(plugin))

  fastify.register((instance, options, done) => {
    instance.addHook('preHandler', function b (req, res, done) {
      req.check.hook2 = true
      done()
    })

    instance.get('/', (req, reply) => {
      reply.send(req.check)
    })

    instance.addHook('preHandler', function c (req, res, done) {
      req.check.hook3 = true
      done()
    })

    done()
  })

  fastify.addHook('preHandler', function a (req, res, done) {
    req.check.hook1 = true
    done()
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(await result.json()).toEqual({ hook1: true, hook2: true, hook3: true })
})

test('nested plugins', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(function (fastify, opts, done) {
    fastify.register((fastify, opts, done) => {
      fastify.get('/', function (req, reply) {
        reply.send('I am child 1')
      })
      done()
    }, { prefix: '/child1' })

    fastify.register((fastify, opts, done) => {
      fastify.get('/', function (req, reply) {
        reply.send('I am child 2')
      })
      done()
    }, { prefix: '/child2' })

    done()
  }, { prefix: '/parent' })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result1 = await fetch(fastifyServer + '/parent/child1')
  expect(result1.ok).toBeTruthy()
  expect(await result1.text()).toEqual('I am child 1')

  const result2 = await fetch(fastifyServer + '/parent/child2')
  expect(result2.ok).toBeTruthy()
  expect(await result2.text()).toEqual('I am child 2')
})

test('nested plugins awaited', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(async function wrap (fastify, opts) {
    await fastify.register(async function child1 (fastify, opts) {
      fastify.get('/', function (req, reply) {
        reply.send('I am child 1')
      })
    }, { prefix: '/child1' })

    await fastify.register(async function child2 (fastify, opts) {
      fastify.get('/', function (req, reply) {
        reply.send('I am child 2')
      })
    }, { prefix: '/child2' })
  }, { prefix: '/parent' })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result1 = await fetch(fastifyServer + '/parent/child1')
  expect(result1.ok).toBeTruthy()
  expect(await result1.text()).toEqual('I am child 1')

  const result2 = await fetch(fastifyServer + '/parent/child2')
  expect(result2.ok).toBeTruthy()
  expect(await result2.text()).toEqual('I am child 2')
})

test('plugin metadata - decorators', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.decorate('plugin1', true)
  fastify.decorateReply('plugin1', true)
  fastify.decorateRequest('plugin1', true)

  plugin[Symbol.for('skip-override')] = true
  plugin[Symbol.for('plugin-meta')] = {
    decorators: {
      xufa: ['plugin1'],
      reply: ['plugin1'],
      request: ['plugin1']
    }
  }

  fastify.register(plugin)

  fastify.ready(() => {
    expect(fastify.plugin).toBeTruthy()
    testDone()
  })

  function plugin (instance, opts, done) {
    instance.decorate('plugin', true)
    done()
  }
})

test('plugin metadata - decorators - should throw', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.decorate('plugin1', true)
  fastify.decorateReply('plugin1', true)

  plugin[Symbol.for('skip-override')] = true
  plugin[Symbol.for('plugin-meta')] = {
    decorators: {
      xufa: ['plugin1'],
      reply: ['plugin1'],
      request: ['plugin1']
    }
  }

  fastify.register(plugin)
  fastify.ready((err) => {
    expect(err.message).toBe("The decorator 'plugin1' is not present in Request")
    testDone()
  })

  function plugin (instance, opts, done) {
    instance.decorate('plugin', true)
    done()
  }
})

test('plugin metadata - decorators - should throw with plugin name', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.decorate('plugin1', true)
  fastify.decorateReply('plugin1', true)

  plugin[Symbol.for('skip-override')] = true
  plugin[Symbol.for('plugin-meta')] = {
    name: 'the-plugin',
    decorators: {
      xufa: ['plugin1'],
      reply: ['plugin1'],
      request: ['plugin1']
    }
  }

  fastify.register(plugin)
  fastify.ready((err) => {
    expect(err.message).toBe("The decorator 'plugin1' required by 'the-plugin' is not present in Request")
    testDone()
  })

  function plugin (instance, opts, done) {
    instance.decorate('plugin', true)
    done()
  }
})

test('plugin metadata - dependencies', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()

  dependency[Symbol.for('skip-override')] = true
  dependency[Symbol.for('plugin-meta')] = {
    name: 'plugin'
  }

  plugin[Symbol.for('skip-override')] = true
  plugin[Symbol.for('plugin-meta')] = {
    dependencies: ['plugin']
  }

  fastify.register(dependency)
  fastify.register(plugin)

  fastify.ready(() => {
    expect('everything right').toBeTruthy()
    testDone()
  })

  function dependency (instance, opts, done) {
    done()
  }

  function plugin (instance, opts, done) {
    done()
  }
})

test('plugin metadata - dependencies (nested)', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()

  dependency[Symbol.for('skip-override')] = true
  dependency[Symbol.for('plugin-meta')] = {
    name: 'plugin'
  }

  nested[Symbol.for('skip-override')] = true
  nested[Symbol.for('plugin-meta')] = {
    dependencies: ['plugin']
  }

  fastify.register(dependency)
  fastify.register(plugin)

  fastify.ready(() => {
    expect('everything right').toBeTruthy()
    testDone()
  })

  function dependency (instance, opts, done) {
    done()
  }

  function plugin (instance, opts, done) {
    instance.register(nested)
    done()
  }

  function nested (instance, opts, done) {
    done()
  }
})
