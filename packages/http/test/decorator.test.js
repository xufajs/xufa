'use strict'


const Fastify = require('..')
const fp = require('@xufa/http').plugin
const symbols = require('../lib/symbols')

test('server methods should exist', async () => {
  expect.assertions(2)
  const fastify = Fastify()
  expect(fastify.decorate).toBeTruthy()
  expect(fastify.hasDecorator).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('should check if the given decoration already exist when null', (done) => {
  expect.assertions(1)
  const fastify = Fastify()
  fastify.decorate('null', null)
  fastify.ready(() => {
    expect(fastify.hasDecorator('null')).toBeTruthy()
    done()
  })
})

test('server methods should be encapsulated via .register', (done) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.decorate('test', () => {})
    expect(instance.test).toBeTruthy()
    done()
  })

  fastify.ready(() => {
    expect(fastify.test).toBe(undefined)
    done()
  })
})

test('hasServerMethod should check if the given method already exist', (done) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.decorate('test', () => {})
    expect(instance.hasDecorator('test')).toBeTruthy()
    done()
  })

  fastify.ready(() => {
    expect(fastify.hasDecorator('test')).toBe(false)
    done()
  })
})

test('decorate should throw if a declared dependency is not present', (done) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    try {
      instance.decorate('test', () => {}, ['dependency'])
      expect.fail()
    } catch (e) {
      expect(e.code).toBe('XUFA_ERR_DEC_MISSING_DEPENDENCY')
      expect(e.message).toBe('The decorator is missing dependency \'dependency\'.')
    }
    done()
  })

  fastify.ready(() => {
    expect('ready').toBeTruthy()
    done()
  })
})

test('decorate should throw if declared dependency is not array', (done) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    try {
      instance.decorate('test', () => {}, {})
      expect.fail()
    } catch (e) {
      expect(e.code).toBe('XUFA_ERR_DEC_DEPENDENCY_INVALID_TYPE')
      expect(e.message).toBe('The dependencies of decorator \'test\' must be of type Array.')
    }
    done()
  })

  fastify.ready(() => {
    expect('ready').toBeTruthy()
    done()
  })
})

// issue #777
test('should pass error for missing request decorator', (done) => {
  expect.assertions(2)
  const fastify = Fastify()

  const plugin = fp(function (instance, opts, done) {
    done()
  }, {
    decorators: {
      request: ['foo']
    }
  })
  fastify
    .register(plugin)
    .ready((err) => {
      expect(err instanceof Error).toBeTruthy()
      expect(err.message.includes("'foo'")).toBeTruthy()
      done()
    })
})

const runTests = async (t, fastifyServer) => {
  const endpoints = [
    { path: '/yes', expectedBody: { hello: 'world' } },
    { path: '/no', expectedBody: { hello: 'world' } }
  ]

  for (const { path, expectedBody } of endpoints) {
    const result = await fetch(`${fastifyServer}${path}`)
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    const body = await result.text()
    expect(result.headers.get('content-length')).toBe('' + body.length)
    expect(JSON.parse(body)).toEqual(expectedBody)
  }
}

test('decorateReply inside register', async (ctx) => {
  expect.assertions(10)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.decorateReply('test', 'test')

    instance.get('/yes', (req, reply) => {
      expect(reply.test).toBeTruthy()
      reply.send({ hello: 'world' })
    })

    done()
  })

  fastify.get('/no', (req, reply) => {
    expect(reply.test).toBeFalsy()
    reply.send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  await runTests(ctx, fastifyServer)
})

test('decorateReply as plugin (inside .after)', async (ctx) => {
  expect.assertions(10)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.register(fp((i, o, n) => {
      instance.decorateReply('test', 'test')
      n()
    })).after(() => {
      instance.get('/yes', (req, reply) => {
        expect(reply.test).toBeTruthy()
        reply.send({ hello: 'world' })
      })
    })
    done()
  })

  fastify.get('/no', (req, reply) => {
    expect(reply.test).toBeFalsy()
    reply.send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  await runTests(ctx, fastifyServer)
})

test('decorateReply as plugin (outside .after)', async (ctx) => {
  expect.assertions(10)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.register(fp((i, o, n) => {
      instance.decorateReply('test', 'test')
      n()
    }))

    instance.get('/yes', (req, reply) => {
      expect(reply.test).toBeTruthy()
      reply.send({ hello: 'world' })
    })
    done()
  })

  fastify.get('/no', (req, reply) => {
    expect(reply.test).toBeFalsy()
    reply.send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  await runTests(ctx, fastifyServer)
})

test('decorateRequest inside register', async (ctx) => {
  expect.assertions(10)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.decorateRequest('test', 'test')

    instance.get('/yes', (req, reply) => {
      expect(req.test).toBeTruthy()
      reply.send({ hello: 'world' })
    })

    done()
  })

  fastify.get('/no', (req, reply) => {
    expect(req.test).toBeFalsy()
    reply.send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  await runTests(ctx, fastifyServer)
})

test('decorateRequest as plugin (inside .after)', async (ctx) => {
  expect.assertions(10)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.register(fp((i, o, n) => {
      instance.decorateRequest('test', 'test')
      n()
    })).after(() => {
      instance.get('/yes', (req, reply) => {
        expect(req.test).toBeTruthy()
        reply.send({ hello: 'world' })
      })
    })
    done()
  })

  fastify.get('/no', (req, reply) => {
    expect(req.test).toBeFalsy()
    reply.send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  await runTests(ctx, fastifyServer)
})

test('decorateRequest as plugin (outside .after)', async (ctx) => {
  expect.assertions(10)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.register(fp((i, o, n) => {
      instance.decorateRequest('test', 'test')
      n()
    }))

    instance.get('/yes', (req, reply) => {
      expect(req.test).toBeTruthy()
      reply.send({ hello: 'world' })
    })
    done()
  })

  fastify.get('/no', (req, reply) => {
    expect(req.test).toBeFalsy()
    reply.send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  await runTests(ctx, fastifyServer)
})

test('decorators should be instance separated', (done) => {
  expect.assertions(1)

  const fastify1 = Fastify()
  const fastify2 = Fastify()

  fastify1.decorate('test', 'foo')
  fastify2.decorate('test', 'foo')

  fastify1.decorateRequest('test', 'foo')
  fastify2.decorateRequest('test', 'foo')

  fastify1.decorateReply('test', 'foo')
  fastify2.decorateReply('test', 'foo')

  expect('Done').toBeTruthy()
  done()
})

describe('hasRequestDecorator', () => {
const requestDecoratorName = 'my-decorator-name'
test('is a function', async () => {
    const fastify = Fastify()
    expect(fastify.hasRequestDecorator).toBeTruthy()
  })
test('should check if the given request decoration already exist', async () => {
    const fastify = Fastify()

    expect(fastify.hasRequestDecorator(requestDecoratorName)).toBeFalsy()
    fastify.decorateRequest(requestDecoratorName, 42)
    expect(fastify.hasRequestDecorator(requestDecoratorName)).toBeTruthy()
  })
test('should check if the given request decoration already exist when null', async () => {
    const fastify = Fastify()

    expect(fastify.hasRequestDecorator(requestDecoratorName)).toBeFalsy()
    fastify.decorateRequest(requestDecoratorName, null)
    expect(fastify.hasRequestDecorator(requestDecoratorName)).toBeTruthy()
  })
test('should be plugin encapsulable', async () => {
    const fastify = Fastify()

    expect(fastify.hasRequestDecorator(requestDecoratorName)).toBeFalsy()

    await fastify.register(async function (fastify2, opts) {
      fastify2.decorateRequest(requestDecoratorName, 42)
      expect(fastify2.hasRequestDecorator(requestDecoratorName)).toBeTruthy()
    })

    expect(fastify.hasRequestDecorator(requestDecoratorName)).toBeFalsy()

    await fastify.ready()
    expect(fastify.hasRequestDecorator(requestDecoratorName)).toBeFalsy()
  })
test('should be inherited', async () => {
    const fastify = Fastify()

    fastify.decorateRequest(requestDecoratorName, 42)

    await fastify.register(async function (fastify2, opts) {
      expect(fastify2.hasRequestDecorator(requestDecoratorName)).toBeTruthy()
    })

    await fastify.ready()
    expect(fastify.hasRequestDecorator(requestDecoratorName)).toBeTruthy()
  })
})

describe('hasReplyDecorator', () => {
const replyDecoratorName = 'my-decorator-name'
test('is a function', async () => {
    const fastify = Fastify()
    expect(fastify.hasReplyDecorator).toBeTruthy()
  })
test('should check if the given reply decoration already exist', async () => {
    const fastify = Fastify()

    expect(fastify.hasReplyDecorator(replyDecoratorName)).toBeFalsy()
    fastify.decorateReply(replyDecoratorName, 42)
    expect(fastify.hasReplyDecorator(replyDecoratorName)).toBeTruthy()
  })
test('should check if the given reply decoration already exist when null', async () => {
    const fastify = Fastify()

    expect(fastify.hasReplyDecorator(replyDecoratorName)).toBeFalsy()
    fastify.decorateReply(replyDecoratorName, null)
    expect(fastify.hasReplyDecorator(replyDecoratorName)).toBeTruthy()
  })
test('should be plugin encapsulable', async () => {
    const fastify = Fastify()

    expect(fastify.hasReplyDecorator(replyDecoratorName)).toBeFalsy()

    await fastify.register(async function (fastify2, opts) {
      fastify2.decorateReply(replyDecoratorName, 42)
      expect(fastify2.hasReplyDecorator(replyDecoratorName)).toBeTruthy()
    })

    expect(fastify.hasReplyDecorator(replyDecoratorName)).toBeFalsy()

    await fastify.ready()
    expect(fastify.hasReplyDecorator(replyDecoratorName)).toBeFalsy()
  })
test('should be inherited', async () => {
    const fastify = Fastify()

    fastify.decorateReply(replyDecoratorName, 42)

    await fastify.register(async function (fastify2, opts) {
      expect(fastify2.hasReplyDecorator(replyDecoratorName)).toBeTruthy()
    })

    await fastify.ready()
    expect(fastify.hasReplyDecorator(replyDecoratorName)).toBeTruthy()
  })
})

test('should register properties via getter/setter objects', (done) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.decorate('test', {
      getter () {
        return 'a getter'
      }
    })
    expect(instance.test).toBeTruthy()
    expect(instance.test).toBeTruthy()
    done()
  })

  fastify.ready(() => {
    expect(fastify.test).toBeFalsy()
    done()
  })
})

test('decorateRequest should work with getter/setter', (done) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.decorateRequest('test', {
      getter () {
        return 'a getter'
      }
    })

    instance.get('/req-decorated-get-set', (req, res) => {
      res.send({ test: req.test })
    })

    done()
  })

  fastify.get('/not-decorated', (req, res) => {
    expect(req.test).toBeFalsy()
    res.send()
  })

  let pending = 2

  function completed () {
    if (--pending === 0) {
      done()
    }
  }

  fastify.ready(() => {
    fastify.inject({ url: '/req-decorated-get-set' }, (err, res) => {
      expect(err).toBeFalsy()
      expect(JSON.parse(res.payload)).toEqual({ test: 'a getter' })
      completed()
    })

    fastify.inject({ url: '/not-decorated' }, (err, res) => {
      expect(err).toBeFalsy()
      expect('ok').toBeTruthy()
      completed()
    })
  })
})

test('decorateReply should work with getter/setter', (done) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.decorateReply('test', {
      getter () {
        return 'a getter'
      }
    })

    instance.get('/res-decorated-get-set', (req, res) => {
      res.send({ test: res.test })
    })

    done()
  })

  fastify.get('/not-decorated', (req, res) => {
    expect(res.test).toBeFalsy()
    res.send()
  })

  let pending = 2

  function completed () {
    if (--pending === 0) {
      done()
    }
  }
  fastify.ready(() => {
    fastify.inject({ url: '/res-decorated-get-set' }, (err, res) => {
      expect(err).toBeFalsy()
      expect(JSON.parse(res.payload)).toEqual({ test: 'a getter' })
      completed()
    })

    fastify.inject({ url: '/not-decorated' }, (err, res) => {
      expect(err).toBeFalsy()
      expect('ok').toBeTruthy()
      completed()
    })
  })
})

test('should register empty values', (done) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.decorate('test', null)
    expect(Object.hasOwn(instance, 'test')).toBeTruthy()
    done()
  })

  fastify.ready(() => {
    expect(fastify.test).toBeFalsy()
    done()
  })
})

test('nested plugins can override things', (done) => {
  expect.assertions(6)
  const fastify = Fastify()

  const rootFunc = () => {}
  fastify.decorate('test', rootFunc)
  fastify.decorateRequest('test', rootFunc)
  fastify.decorateReply('test', rootFunc)

  fastify.register((instance, opts, done) => {
    const func = () => {}
    instance.decorate('test', func)
    instance.decorateRequest('test', func)
    instance.decorateReply('test', func)

    expect(instance.test).toBe(func)
    expect(instance[symbols.kRequest].prototype.test).toBe(func)
    expect(instance[symbols.kReply].prototype.test).toBe(func)
    done()
  })

  fastify.ready(() => {
    expect(fastify.test).toBe(rootFunc)
    expect(fastify[symbols.kRequest].prototype.test).toBe(rootFunc)
    expect(fastify[symbols.kReply].prototype.test).toBe(rootFunc)
    done()
  })
})

test('a decorator should addSchema to all the encapsulated tree', (done) => {
  expect.assertions(1)
  const fastify = Fastify()

  const decorator = function (instance, opts, done) {
    instance.decorate('decoratorAddSchema', function (whereAddTheSchema) {
      instance.addSchema({
        $id: 'schema',
        type: 'string'
      })
    })
    done()
  }

  fastify.register(fp(decorator))

  fastify.register(function (instance, opts, done) {
    instance.register((subInstance, opts, done) => {
      subInstance.decoratorAddSchema()
      done()
    })
    done()
  })

  fastify.ready(() => {
    expect().toBeFalsy()
    done()
  })
})

test('after can access to a decorated instance and previous plugin decoration', (done) => {
  expect.assertions(11)
  const TEST_VALUE = {}
  const OTHER_TEST_VALUE = {}
  const NEW_TEST_VALUE = {}

  const fastify = Fastify()

  fastify.register(fp(function (instance, options, done) {
    instance.decorate('test', TEST_VALUE)

    done()
  })).after(function (err, instance, done) {
    expect(err).toBeFalsy()
    expect(instance.test).toBe(TEST_VALUE)

    instance.decorate('test2', OTHER_TEST_VALUE)
    done()
  })

  fastify.register(fp(function (instance, options, done) {
    expect(instance.test).toBe(TEST_VALUE)
    expect(instance.test2).toBe(OTHER_TEST_VALUE)

    instance.decorate('test3', NEW_TEST_VALUE)

    done()
  })).after(function (err, instance, done) {
    expect(err).toBeFalsy()
    expect(instance.test).toBe(TEST_VALUE)
    expect(instance.test2).toBe(OTHER_TEST_VALUE)
    expect(instance.test3).toBe(NEW_TEST_VALUE)

    done()
  })

  fastify.get('/', function (req, res) {
    expect(this.test).toBe(TEST_VALUE)
    expect(this.test2).toBe(OTHER_TEST_VALUE)
    res.send({})
  })

  fastify.inject('/')
    .then(response => {
      expect(response.statusCode).toBe(200)
      done()
    })
})

test('decorate* should throw if called after ready', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.get('/', (request, reply) => {
    reply.send({
      hello: 'world'
    })
  })

  await fastify.listen({ port: 0 })
  try {
    fastify.decorate('test', true)
    expect.fail('should not decorate')
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_DEC_AFTER_START')
    expect(err.message).toBe("The decorator 'test' has been added after start!")
  }
  try {
    fastify.decorateRequest('test', true)
    expect.fail('should not decorate')
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_DEC_AFTER_START')
    expect(e.message).toBe("The decorator 'test' has been added after start!")
  }
  try {
    fastify.decorateReply('test', true)
    expect.fail('should not decorate')
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_DEC_AFTER_START')
    expect(e.message).toBe("The decorator 'test' has been added after start!")
  }
  await fastify.close()
})

test('decorate* should emit error if an array is passed', async () => {
  expect.assertions(2)

  const fastify = Fastify()
  try {
    fastify.decorateRequest('test_array', [])
    expect.fail('should not decorate')
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_DEC_REFERENCE_TYPE')
    expect(err.message).toBe("The decorator 'test_array' of type 'object' is a reference type. Use the { getter, setter } interface instead.")
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('server.decorate should not emit error if reference type is passed', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  fastify.decorate('test_array', [])
  fastify.decorate('test_object', {})
  await fastify.ready()
  expect('Done').toBeTruthy()
})

test('decorate* should emit warning if object type is passed', async () => {
  expect.assertions(2)

  const fastify = Fastify()
  try {
    fastify.decorateRequest('test_object', { foo: 'bar' })
    expect.fail('should not decorate')
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_DEC_REFERENCE_TYPE')
    expect(err.message).toBe("The decorator 'test_object' of type 'object' is a reference type. Use the { getter, setter } interface instead.")
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('decorate* should not emit warning if object with getter/setter is passed', () => {
  const fastify = Fastify()

  fastify.decorateRequest('test_getter_setter', {
    setter (val) {
      this._ = val
    },
    getter () {
      return 'a getter'
    }
  })
  expect('Done').toBeTruthy()
})

test('decorateRequest with getter/setter can handle encapsulation', async () => {
  expect.assertions(24)

  const fastify = Fastify({ logger: true })

  fastify.decorateRequest('test_getter_setter_holder')
  fastify.decorateRequest('test_getter_setter', {
    getter () {
      this.test_getter_setter_holder ??= {}
      return this.test_getter_setter_holder
    }
  })

  fastify.get('/', async function (req, reply) {
    expect(req.test_getter_setter).toEqual({})
    req.test_getter_setter.a = req.id
    expect(req.test_getter_setter).toEqual({ a: req.id })
  })

  fastify.addHook('onResponse', async function hook (req, reply) {
    expect(req.test_getter_setter).toEqual({ a: req.id })
  })

  await Promise.all([
    fastify.inject('/').then(res => expect(res.statusCode).toBe(200)),
    fastify.inject('/').then(res => expect(res.statusCode).toBe(200)),
    fastify.inject('/').then(res => expect(res.statusCode).toBe(200)),
    fastify.inject('/').then(res => expect(res.statusCode).toBe(200)),
    fastify.inject('/').then(res => expect(res.statusCode).toBe(200)),
    fastify.inject('/').then(res => expect(res.statusCode).toBe(200))
  ])
})

test('decorateRequest with getter/setter can handle encapsulation with arrays', async () => {
  expect.assertions(24)

  const fastify = Fastify({ logger: true })

  fastify.decorateRequest('array_holder')
  fastify.decorateRequest('my_array', {
    getter () {
      this.array_holder ??= []
      return this.array_holder
    }
  })

  fastify.get('/', async function (req, reply) {
    expect(req.my_array).toEqual([])
    req.my_array.push(req.id)
    expect(req.my_array).toEqual([req.id])
  })

  fastify.addHook('onResponse', async function hook (req, reply) {
    expect(req.my_array).toEqual([req.id])
  })

  await Promise.all([
    fastify.inject('/').then(res => expect(res.statusCode).toBe(200)),
    fastify.inject('/').then(res => expect(res.statusCode).toBe(200)),
    fastify.inject('/').then(res => expect(res.statusCode).toBe(200)),
    fastify.inject('/').then(res => expect(res.statusCode).toBe(200)),
    fastify.inject('/').then(res => expect(res.statusCode).toBe(200)),
    fastify.inject('/').then(res => expect(res.statusCode).toBe(200))
  ])
})

test('decorate* should not emit error if string,bool,numbers are passed', () => {
  const fastify = Fastify()

  fastify.decorateRequest('test_str', 'foo')
  fastify.decorateRequest('test_bool', true)
  fastify.decorateRequest('test_number', 42)
  fastify.decorateRequest('test_null', null)
  fastify.decorateRequest('test_undefined', undefined)
  fastify.decorateReply('test_str', 'foo')
  fastify.decorateReply('test_bool', true)
  fastify.decorateReply('test_number', 42)
  fastify.decorateReply('test_null', null)
  fastify.decorateReply('test_undefined', undefined)
  expect('Done').toBeTruthy()
})

test('Request/reply decorators should be able to access the server instance', async () => {
  expect.assertions(6)

  const server = require('..')({ logger: false })
  server.decorateRequest('assert', rootAssert)
  server.decorateReply('assert', rootAssert)

  server.get('/root-assert', async (req, res) => {
    req.assert()
    res.assert()
    return 'done'
  })

  server.register(async instance => {
    instance.decorateRequest('assert', nestedAssert)
    instance.decorateReply('assert', nestedAssert)
    instance.decorate('foo', 'bar')

    instance.get('/nested-assert', async (req, res) => {
      req.assert()
      res.assert()
      return 'done'
    })
  })

  await server.inject({ method: 'GET', url: '/root-assert' })
  await server.inject({ method: 'GET', url: '/nested-assert' })

  // ----
  function rootAssert () {
    expect(this.server).toBe(server)
  }

  function nestedAssert () {
    expect(this.server).not.toBe(server)
    expect(this.server.foo).toBe('bar')
  }
})

test('plugin required decorators', async () => {
  const plugin1 = fp(
    async (instance) => {
      instance.decorateRequest('someThing', null)

      instance.addHook('onRequest', async (request, reply) => {
        request.someThing = 'hello'
      })
    },
    {
      name: 'custom-plugin-one'
    }
  )

  const plugin2 = fp(
    async () => {
      // nothing
    },
    {
      name: 'custom-plugin-two',
      dependencies: ['custom-plugin-one'],
      decorators: {
        request: ['someThing']
      }
    }
  )

  const app = Fastify()
  app.register(plugin1)
  app.register(plugin2)
  await app.ready()
})

test('decorateRequest/decorateReply empty string', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.decorateRequest('test', '')
  fastify.decorateReply('test2', '')
  fastify.get('/yes', (req, reply) => {
    expect(req.test).toBe('')
    expect(reply.test2).toBe('')
    reply.send({ hello: 'world' })
  })
  onTestFinished(() => fastify.close())

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(`${fastifyServer}/yes`)
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  const body = await result.text()
  expect(result.headers.get('content-length')).toBe('' + body.length)
  expect(JSON.parse(body)).toEqual({ hello: 'world' })
})

test('decorateRequest/decorateReply is undefined', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.decorateRequest('test', undefined)
  fastify.decorateReply('test2', undefined)
  fastify.get('/yes', (req, reply) => {
    expect(req.test).toBe(undefined)
    expect(reply.test2).toBe(undefined)
    reply.send({ hello: 'world' })
  })
  onTestFinished(() => fastify.close())

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(`${fastifyServer}/yes`)
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  const body = await result.text()
  expect(result.headers.get('content-length')).toBe('' + body.length)
  expect(JSON.parse(body)).toEqual({ hello: 'world' })
})

test('decorateRequest/decorateReply is not set to a value', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.decorateRequest('test')
  fastify.decorateReply('test2')
  fastify.get('/yes', (req, reply) => {
    expect(req.test).toBe(undefined)
    expect(reply.test2).toBe(undefined)
    reply.send({ hello: 'world' })
  })
  onTestFinished(() => fastify.close())

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(`${fastifyServer}/yes`)
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  const body = await result.text()
  expect(result.headers.get('content-length')).toBe('' + body.length)
  expect(JSON.parse(body)).toEqual({ hello: 'world' })
})

test('decorateRequest with dependencies', (done) => {
  expect.assertions(2)
  const app = Fastify()

  const decorator1 = 'bar'
  const decorator2 = 'foo'

  app.decorate('decorator1', decorator1)
  app.decorateRequest('decorator1', decorator1)

  if (
    app.hasDecorator('decorator1') &&
    app.hasRequestDecorator('decorator1')
  ) {
    expect(() => app.decorateRequest('decorator2', decorator2, ['decorator1'])).not.toThrow()
    expect(app.hasRequestDecorator('decorator2')).toBeTruthy()
    done()
  }
})

test('decorateRequest with dependencies (functions)', (done) => {
  expect.assertions(2)
  const app = Fastify()

  const decorator1 = () => 'bar'
  const decorator2 = () => 'foo'

  app.decorate('decorator1', decorator1)
  app.decorateRequest('decorator1', decorator1)

  if (
    app.hasDecorator('decorator1') &&
    app.hasRequestDecorator('decorator1')
  ) {
    expect(() => app.decorateRequest('decorator2', decorator2, ['decorator1'])).not.toThrow()
    expect(app.hasRequestDecorator('decorator2')).toBeTruthy()
    done()
  }
})

test('chain of decorators on Request', async () => {
  const fastify = Fastify()
  fastify.register(fp(async function (fastify) {
    fastify.decorateRequest('foo', 'toto')
    fastify.decorateRequest('bar', () => 'tata')
  }, {
    name: 'first'
  }))

  fastify.get('/foo', async function (request, reply) {
    return request.foo
  })
  fastify.get('/bar', function (request, reply) {
    return request.bar()
  })
  fastify.register(async function second (fastify) {
    fastify.get('/foo', async function (request, reply) {
      return request.foo
    })
    fastify.get('/bar', async function (request, reply) {
      return request.bar()
    })
    fastify.register(async function fourth (fastify) {
      fastify.get('/plugin3/foo', async function (request, reply) {
        return request.foo
      })
      fastify.get('/plugin3/bar', function (request, reply) {
        return request.bar()
      })
    })
    fastify.register(fp(async function (fastify) {
      fastify.decorateRequest('fooB', 'toto')
      fastify.decorateRequest('barB', () => 'tata')
    }, {
      name: 'third'
    }))
  },
  { prefix: '/plugin2', name: 'plugin2' }
  )

  await fastify.ready()

  {
    const response = await fastify.inject('/foo')
    expect(response.body).toBe('toto')
  }

  {
    const response = await fastify.inject('/bar')
    expect(response.body).toBe('tata')
  }

  {
    const response = await fastify.inject('/plugin2/foo')
    expect(response.body).toBe('toto')
  }

  {
    const response = await fastify.inject('/plugin2/bar')
    expect(response.body).toBe('tata')
  }

  {
    const response = await fastify.inject('/plugin2/plugin3/foo')
    expect(response.body).toBe('toto')
  }

  {
    const response = await fastify.inject('/plugin2/plugin3/bar')
    expect(response.body).toBe('tata')
  }
})

test('chain of decorators on Reply', async () => {
  const fastify = Fastify()
  fastify.register(fp(async function (fastify) {
    fastify.decorateReply('foo', 'toto')
    fastify.decorateReply('bar', () => 'tata')
  }, {
    name: 'first'
  }))

  fastify.get('/foo', async function (request, reply) {
    return reply.foo
  })
  fastify.get('/bar', function (request, reply) {
    return reply.bar()
  })
  fastify.register(async function second (fastify) {
    fastify.get('/foo', async function (request, reply) {
      return reply.foo
    })
    fastify.get('/bar', async function (request, reply) {
      return reply.bar()
    })
    fastify.register(async function fourth (fastify) {
      fastify.get('/plugin3/foo', async function (request, reply) {
        return reply.foo
      })
      fastify.get('/plugin3/bar', function (request, reply) {
        return reply.bar()
      })
    })
    fastify.register(fp(async function (fastify) {
      fastify.decorateReply('fooB', 'toto')
      fastify.decorateReply('barB', () => 'tata')
    }, {
      name: 'third'
    }))
  },
  { prefix: '/plugin2', name: 'plugin2' }
  )

  await fastify.ready()

  {
    const response = await fastify.inject('/foo')
    expect(response.body).toBe('toto')
  }

  {
    const response = await fastify.inject('/bar')
    expect(response.body).toBe('tata')
  }

  {
    const response = await fastify.inject('/plugin2/foo')
    expect(response.body).toBe('toto')
  }

  {
    const response = await fastify.inject('/plugin2/bar')
    expect(response.body).toBe('tata')
  }

  {
    const response = await fastify.inject('/plugin2/plugin3/foo')
    expect(response.body).toBe('toto')
  }

  {
    const response = await fastify.inject('/plugin2/plugin3/bar')
    expect(response.body).toBe('tata')
  }
})

test('getDecorator should return the decorator', (done) => {
  expect.assertions(12)
  const fastify = Fastify()

  fastify.decorate('root', 'from_root')
  fastify.decorateRequest('root', 'from_root_request')
  fastify.decorateReply('root', 'from_root_reply')

  expect(fastify.getDecorator('root')).toBe('from_root')
  fastify.get('/', async (req, res) => {
    expect(req.getDecorator('root')).toBe('from_root_request')
    expect(res.getDecorator('root')).toBe('from_root_reply')

    res.send()
  })

  fastify.register((child) => {
    child.decorate('child', 'from_child')

    expect(child.getDecorator('child')).toBe('from_child')
    expect(child.getDecorator('root')).toBe('from_root')

    child.get('/child', async (req, res) => {
      expect(req.getDecorator('root')).toBe('from_root_request')
      expect(res.getDecorator('root')).toBe('from_root_reply')

      res.send()
    })
  })

  fastify.ready((err) => {
    expect(err).toBeFalsy()
    fastify.inject({ url: '/' }, (err, res) => {
      expect(err).toBeFalsy()
      expect(true).toBeTruthy()
    })

    fastify.inject({ url: '/child' }, (err, res) => {
      expect(err).toBeFalsy()
      expect(true).toBeTruthy()
      done()
    })
  })
})

test('getDecorator should return function decorators with expected binded context', (done) => {
  expect.assertions(12)
  const fastify = Fastify()

  fastify.decorate('a', function () {
    return this
  })
  fastify.decorateRequest('b', function () {
    return this
  })
  fastify.decorateReply('c', function () {
    return this
  })

  fastify.register((child) => {
    child.decorate('a', function () {
      return this
    })

    expect(child.getDecorator('a')()).toEqual(child)
    child.get('/child', async (req, res) => {
      expect(req.getDecorator('b')()).toEqual(req)
      expect(res.getDecorator('c')()).toEqual(res)

      res.send()
    })
  })

  expect(fastify.getDecorator('a')()).toEqual(fastify)
  fastify.get('/', async (req, res) => {
    expect(req.getDecorator('b')()).toEqual(req)
    expect(res.getDecorator('c')()).toEqual(res)
    res.send()
  })

  fastify.ready((err) => {
    expect(err).toBeFalsy()
    fastify.inject({ url: '/' }, (err, res) => {
      expect(err).toBeFalsy()
      expect(true).toBeTruthy()
    })

    fastify.inject({ url: '/child' }, (err, res) => {
      expect(err).toBeFalsy()
      expect(true).toBeTruthy()
      done()
    })
    expect(true).toBeTruthy()
  })
})

test('getDecorator should only return decorators existing in the scope', (done) => {
  expect.assertions(9)

  function assertsThrowOnUndeclaredDecorator (notDecorated, instanceType) {
    try {
      notDecorated.getDecorator('foo')
      expect.fail()
    } catch (e) {
      expect(e.code).toEqual('XUFA_ERR_DEC_UNDECLARED')
      expect(e.message).toEqual(`No decorator 'foo' has been declared on ${instanceType}.`)
    }
  }

  const fastify = Fastify()
  fastify.register(child => {
    child.decorate('foo', true)
    child.decorateRequest('foo', true)
    child.decorateReply('foo', true)
  })

  fastify.get('/', async (req, res) => {
    assertsThrowOnUndeclaredDecorator(req, 'request')
    assertsThrowOnUndeclaredDecorator(res, 'reply')

    return { hello: 'world' }
  })

  fastify.ready((err) => {
    expect(err).toBeFalsy()

    assertsThrowOnUndeclaredDecorator(fastify, 'instance')
    fastify.inject({ url: '/' }, (err, res) => {
      expect(err).toBeFalsy()
      expect(true).toBeTruthy()
      done()
    })
  })
})

test('Request.setDecorator should update an existing decorator', (done) => {
  expect.assertions(7)
  const fastify = Fastify()

  fastify.decorateRequest('session', null)
  fastify.decorateRequest('utility', null)
  fastify.addHook('onRequest', async (req, reply) => {
    req.setDecorator('session', { user: 'Jean' })
    req.setDecorator('utility', function () {
      return this
    })
    try {
      req.setDecorator('foo', { user: 'Jean' })
      expect.fail()
    } catch (e) {
      expect(e.code).toEqual('XUFA_ERR_DEC_UNDECLARED')
      expect(e.message).toEqual("No decorator 'foo' has been declared on request.")
    }
  })

  fastify.get('/', async (req, res) => {
    expect(req.getDecorator('session')).toEqual({ user: 'Jean' })
    expect(req.getDecorator('utility')()).toEqual(req)

    res.send()
  })

  fastify.ready((err) => {
    expect(err).toBeFalsy()
    fastify.inject({ url: '/' }, (err, res) => {
      expect(err).toBeFalsy()
      expect(true).toBeTruthy()
      done()
    })
  })
})
