'use strict'


const stream = require('node:stream')
const Fastify = require('..')
const fp = require('..').plugin
const fs = require('node:fs')
const split = require('split2')
const symbols = require('../lib/symbols')
const payload = { hello: 'world' }
const { connect } = require('node:net')
const { sleep, waitForCb } = require('./helper')
const { fetch } = require('undici')

test('hooks', async () => {
  expect.assertions(48)
  const fastify = Fastify({ exposeHeadRoutes: false })

  try {
    fastify.addHook('preHandler', function (request, reply, done) {
      expect(request.test).toBe('the request is coming')
      expect(reply.test).toBe('the reply has come')
      if (request.raw.method === 'HEAD') {
        done(new Error('some error'))
      } else {
        done()
      }
    })
    expect('should pass').toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  try {
    fastify.addHook('preHandler', null)
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_HOOK_INVALID_HANDLER')
    expect(e.message).toBe('preHandler hook should be a function, instead got null')
    expect('should pass').toBeTruthy()
  }

  try {
    fastify.addHook('preParsing')
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_HOOK_INVALID_HANDLER')
    expect(e.message).toBe('preParsing hook should be a function, instead got undefined')
    expect('should pass').toBeTruthy()
  }

  try {
    fastify.addHook('preParsing', function (request, reply, payload, done) {
      request.preParsing = true
      expect(request.test).toBe('the request is coming')
      expect(reply.test).toBe('the reply has come')
      done()
    })
    expect('should pass').toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  try {
    fastify.addHook('preParsing', function (request, reply, payload, done) {
      request.preParsing = true
      expect(request.test).toBe('the request is coming')
      expect(reply.test).toBe('the reply has come')
      done()
    })
    expect('should pass').toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  try {
    fastify.addHook('preValidation', function (request, reply, done) {
      expect(request.preParsing).toBe(true)
      expect(request.test).toBe('the request is coming')
      expect(reply.test).toBe('the reply has come')
      done()
    })
    expect('should pass').toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  try {
    fastify.addHook('preSerialization', function (request, reply, payload, done) {
      expect('preSerialization called').toBeTruthy()
      done()
    })
    expect('should pass').toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  try {
    fastify.addHook('onRequest', function (request, reply, done) {
      request.test = 'the request is coming'
      reply.test = 'the reply has come'
      if (request.raw.method === 'DELETE') {
        done(new Error('some error'))
      } else {
        done()
      }
    })
    expect('should pass').toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  fastify.addHook('onResponse', function (request, reply, done) {
    expect('onResponse called').toBeTruthy()
    done()
  })

  fastify.addHook('onSend', function (req, reply, thePayload, done) {
    expect('onSend called').toBeTruthy()
    done()
  })

  fastify.route({
    method: 'GET',
    url: '/',
    handler: function (req, reply) {
      expect(req.test).toBe('the request is coming')
      expect(reply.test).toBe('the reply has come')
      reply.code(200).send(payload)
    },
    onResponse: function (req, reply, done) {
      expect('onResponse inside hook').toBeTruthy()
    },
    response: {
      200: {
        type: 'object'
      }
    }
  })

  fastify.head('/', function (req, reply) {
    reply.code(200).send(payload)
  })

  fastify.delete('/', function (req, reply) {
    reply.code(200).send(payload)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const getResult = await fetch(fastifyServer)
  expect(getResult.ok).toBeTruthy()
  expect(getResult.status).toBe(200)
  const getBody = await getResult.text()
  expect(getResult.headers.get('content-length')).toBe('' + getBody.length)
  expect(JSON.parse(getBody)).toEqual({ hello: 'world' })

  const headResult = await fetch(fastifyServer, { method: 'HEAD' })
  expect(headResult.ok).toBeFalsy()
  expect(headResult.status).toBe(500)

  const deleteResult = await fetch(fastifyServer, { method: 'DELETE' })
  expect(deleteResult.ok).toBeFalsy()
  expect(deleteResult.status).toBe(500)
})

test('onRequest hook should support encapsulation / 1', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.addHook('onRequest', (req, reply, done) => {
      expect(req.raw.url).toBe('/plugin')
      done()
    })

    instance.get('/plugin', (request, reply) => {
      reply.send()
    })

    done()
  })

  fastify.get('/root', (request, reply) => {
    reply.send()
  })

  fastify.inject('/root', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)

    fastify.inject('/plugin', (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).toBe(200)
      testDone()
    })
  })
})

test('onRequest hook should support encapsulation / 2', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()
  let pluginInstance

  fastify.addHook('onRequest', () => { })

  fastify.register((instance, opts, done) => {
    instance.addHook('onRequest', () => { })
    pluginInstance = instance
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    expect(fastify[symbols.kHooks].onRequest.length).toBe(1)
    expect(pluginInstance[symbols.kHooks].onRequest.length).toBe(2)
    testDone()
  })
})

test('onRequest hook should support encapsulation / 3', async () => {
  expect.assertions(19)
  const fastify = Fastify()
  fastify.decorate('hello', 'world')

  fastify.addHook('onRequest', function (req, reply, done) {
    expect(this.hello).toBeTruthy()
    expect(this.hello2).toBeTruthy()
    req.first = true
    done()
  })

  fastify.decorate('hello2', 'world')

  fastify.get('/first', (req, reply) => {
    expect(req.first).toBeTruthy()
    expect(req.second).toBeFalsy()
    reply.send({ hello: 'world' })
  })

  fastify.register((instance, opts, done) => {
    instance.decorate('hello3', 'world')
    instance.addHook('onRequest', function (req, reply, done) {
      expect(this.hello).toBeTruthy()
      expect(this.hello2).toBeTruthy()
      expect(this.hello3).toBeTruthy()
      req.second = true
      done()
    })

    instance.get('/second', (req, reply) => {
      expect(req.first).toBeTruthy()
      expect(req.second).toBeTruthy()
      reply.send({ hello: 'world' })
    })

    done()
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const firstResult = await fetch(fastifyServer + '/first', { method: 'GET' })
  expect(firstResult.ok).toBeTruthy()
  expect(firstResult.status).toBe(200)
  const firstBody = await firstResult.text()
  expect(firstResult.headers.get('content-length')).toBe('' + firstBody.length)
  expect(JSON.parse(firstBody)).toEqual({ hello: 'world' })

  const secondResult = await fetch(fastifyServer + '/second', { method: 'GET' })
  expect(secondResult.ok).toBeTruthy()
  expect(secondResult.status).toBe(200)
  const secondBody = await secondResult.text()
  expect(secondResult.headers.get('content-length')).toBe('' + secondBody.length)
  expect(JSON.parse(secondBody)).toEqual({ hello: 'world' })
})

test('preHandler hook should support encapsulation / 5', async () => {
  expect.assertions(16)
  const fastify = Fastify()
  onTestFinished(() => { fastify.close() })
  fastify.decorate('hello', 'world')

  fastify.addHook('preHandler', function (req, res, done) {
    expect(this.hello).toBeTruthy()
    req.first = true
    done()
  })

  fastify.get('/first', (req, reply) => {
    expect(req.first).toBeTruthy()
    expect(req.second).toBeFalsy()
    reply.send({ hello: 'world' })
  })

  fastify.register((instance, opts, done) => {
    instance.decorate('hello2', 'world')
    instance.addHook('preHandler', function (req, res, done) {
      expect(this.hello).toBeTruthy()
      expect(this.hello2).toBeTruthy()
      req.second = true
      done()
    })

    instance.get('/second', (req, reply) => {
      expect(req.first).toBeTruthy()
      expect(req.second).toBeTruthy()
      reply.send({ hello: 'world' })
    })

    done()
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const firstResult = await fetch(fastifyServer + '/first')
  expect(firstResult.ok).toBeTruthy()
  expect(firstResult.status).toBe(200)
  const firstBody = await firstResult.text()
  expect(firstResult.headers.get('content-length')).toBe('' + firstBody.length)
  expect(JSON.parse(firstBody)).toEqual({ hello: 'world' })

  const secondResult = await fetch(fastifyServer + '/second')
  expect(secondResult.ok).toBeTruthy()
  expect(secondResult.status).toBe(200)
  const secondBody = await secondResult.text()
  expect(secondResult.headers.get('content-length')).toBe('' + secondBody.length)
  expect(JSON.parse(secondBody)).toEqual({ hello: 'world' })
})

test('onRoute hook should be called / 1', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', () => {
      expect('should pass').toBeTruthy()
    })
    instance.get('/', opts, function (req, reply) {
      reply.send()
    })
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onRoute hook should be called / 2', (testDone) => {
  expect.assertions(5)
  let firstHandler = 0
  let secondHandler = 0
  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.addHook('onRoute', (route) => {
    expect('should pass').toBeTruthy()
    firstHandler++
  })

  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', (route) => {
      expect('should pass').toBeTruthy()
      secondHandler++
    })
    instance.get('/', opts, function (req, reply) {
      reply.send()
    })
    done()
  })
    .after(() => {
      expect(firstHandler).toBe(1)
      expect(secondHandler).toBe(1)
    })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onRoute hook should be called / 3', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify({ exposeHeadRoutes: false })

  function handler (req, reply) {
    reply.send()
  }

  fastify.addHook('onRoute', (route) => {
    expect('should pass').toBeTruthy()
  })

  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', (route) => {
      expect('should pass').toBeTruthy()
    })
    instance.get('/a', handler)
    done()
  })
    .after((err, done) => {
      expect(err).toBeFalsy()
      setTimeout(() => {
        fastify.get('/b', handler)
        done()
      }, 10)
    })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onRoute hook should be called (encapsulation support) / 4', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.addHook('onRoute', () => {
    expect('should pass').toBeTruthy()
  })

  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', () => {
      expect('should pass').toBeTruthy()
    })
    instance.get('/nested', opts, function (req, reply) {
      reply.send()
    })
    done()
  })

  fastify.get('/', function (req, reply) {
    reply.send()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onRoute hook should be called (encapsulation support) / 5', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.get('/first', function (req, reply) {
    reply.send()
  })

  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', () => {
      expect('should pass').toBeTruthy()
    })
    instance.get('/nested', opts, function (req, reply) {
      reply.send()
    })
    done()
  })

  fastify.get('/second', function (req, reply) {
    reply.send()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onRoute hook should be called (encapsulation support) / 6', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.get('/first', function (req, reply) {
    reply.send()
  })

  fastify.addHook('onRoute', () => {
    expect.fail('This should not be called')
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onRoute should keep the context', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.register((instance, opts, done) => {
    instance.decorate('test', true)
    instance.addHook('onRoute', onRoute)
    expect(instance.prototype === fastify.prototype).toBeTruthy()

    function onRoute (route) {
      expect(this.test).toBeTruthy()
      expect(this).toBe(instance)
    }

    instance.get('/', opts, function (req, reply) {
      reply.send()
    })

    done()
  })

  fastify.close((err) => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onRoute hook should pass correct route', (testDone) => {
  expect.assertions(9)
  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.addHook('onRoute', (route) => {
    expect(route.method).toBe('GET')
    expect(route.url).toBe('/')
    expect(route.path).toBe('/')
    expect(route.routePath).toBe('/')
  })

  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', (route) => {
      expect(route.method).toBe('GET')
      expect(route.url).toBe('/')
      expect(route.path).toBe('/')
      expect(route.routePath).toBe('/')
    })
    instance.get('/', opts, function (req, reply) {
      reply.send()
    })
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onRoute hook should pass correct route with custom prefix', (testDone) => {
  expect.assertions(11)
  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.addHook('onRoute', function (route) {
    expect(route.method).toBe('GET')
    expect(route.url).toBe('/v1/foo')
    expect(route.path).toBe('/v1/foo')
    expect(route.routePath).toBe('/foo')
    expect(route.prefix).toBe('/v1')
  })

  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', function (route) {
      expect(route.method).toBe('GET')
      expect(route.url).toBe('/v1/foo')
      expect(route.path).toBe('/v1/foo')
      expect(route.routePath).toBe('/foo')
      expect(route.prefix).toBe('/v1')
    })
    instance.get('/foo', opts, function (req, reply) {
      reply.send()
    })
    done()
  }, { prefix: '/v1' })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onRoute hook should pass correct route with custom options', (testDone) => {
  expect.assertions(6)
  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', function (route) {
      expect(route.method).toBe('GET')
      expect(route.url).toBe('/foo')
      expect(route.logLevel).toBe('info')
      expect(route.bodyLimit).toBe(100)
      expect(typeof route.logSerializers.test === 'function').toBeTruthy()
    })
    instance.get('/foo', {
      logLevel: 'info',
      bodyLimit: 100,
      logSerializers: {
        test: value => value
      }
    }, function (req, reply) {
      reply.send()
    })
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onRoute hook should receive any route option', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', function (route) {
      expect(route.method).toBe('GET')
      expect(route.url).toBe('/foo')
      expect(route.routePath).toBe('/foo')
      expect(route.auth).toBe('basic')
    })
    instance.get('/foo', { auth: 'basic' }, function (req, reply) {
      reply.send()
    })
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onRoute hook should preserve system route configuration', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', function (route) {
      expect(route.method).toBe('GET')
      expect(route.url).toBe('/foo')
      expect(route.routePath).toBe('/foo')
      expect(route.handler.length).toBe(2)
    })
    instance.get('/foo', { url: '/bar', method: 'POST' }, function (req, reply) {
      reply.send()
    })
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onRoute hook should preserve handler function in options of shorthand route system configuration', (testDone) => {
  expect.assertions(2)

  const handler = (req, reply) => { }

  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', function (route) {
      expect(route.handler).toBe(handler)
    })
    instance.get('/foo', { handler })
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

// issue ref https://github.com/fastify/fastify-compress/issues/140
test('onRoute hook should be called once when prefixTrailingSlash', (testDone) => {
  expect.assertions(3)

  let onRouteCalled = 0
  let routePatched = 0

  const fastify = Fastify({
    exposeHeadRoutes: false,
    routerOptions: {
      ignoreTrailingSlash: false
    }
  })

  // a plugin that patches route options, similar to fastify-compress
  fastify.register(fp(function myPlugin (instance, opts, next) {
    function patchTheRoute () {
      routePatched++
    }

    instance.addHook('onRoute', function (routeOptions) {
      onRouteCalled++
      patchTheRoute(routeOptions)
    })

    next()
  }))

  fastify.register(function routes (instance, opts, next) {
    instance.route({
      method: 'GET',
      url: '/',
      prefixTrailingSlash: 'both',
      handler: (req, reply) => {
        reply.send({ hello: 'world' })
      }
    })

    next()
  }, { prefix: '/prefix' })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    expect(onRouteCalled).toBe(1) // onRoute hook was called once
    expect(routePatched).toBe(1) // and plugin acted once and avoided redundant route patching
    testDone()
  })
})

test('onRoute hook should able to change the route url', async () => {
  expect.assertions(4)

  const fastify = Fastify({ exposeHeadRoutes: false })
  onTestFinished(() => { fastify.close() })

  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', (route) => {
      expect(route.url).toBe('/foo')
      route.url = encodeURI(route.url)
    })

    instance.get('/foo', (request, reply) => {
      reply.send('here /foo')
    })

    done()
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer + encodeURI('/foo'))
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.text()).toBe('here /foo')
})

test('onRoute hook that throws should be caught', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify({ exposeHeadRoutes: false })

  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', () => {
      throw new Error('snap')
    })

    try {
      instance.get('/', opts, function (req, reply) {
        reply.send()
      })

      expect.fail('onRoute should throw sync if error')
    } catch (error) {
      expect(error).toBeTruthy()
    }

    done()
  })

  fastify.ready(testDone)
})

test('onRoute hook with many prefix', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify({ exposeHeadRoutes: false })
  const handler = (req, reply) => { reply.send({}) }

  const onRouteChecks = [
    { routePath: '/anotherPath', prefix: '/one/two', url: '/one/two/anotherPath' },
    { routePath: '/aPath', prefix: '/one', url: '/one/aPath' }
  ]

  fastify.register((instance, opts, done) => {
    instance.addHook('onRoute', ({ routePath, prefix, url }) => {
      expect({ routePath, prefix, url }).toEqual(onRouteChecks.pop())
    })
    instance.route({ method: 'GET', url: '/aPath', handler })

    instance.register((instance, opts, done) => {
      instance.route({ method: 'GET', path: '/anotherPath', handler })
      done()
    }, { prefix: '/two' })
    done()
  }, { prefix: '/one' })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onRoute hook should not be called when it registered after route', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.addHook('onRoute', () => {
    expect('should pass').toBeTruthy()
  })

  fastify.get('/', function (req, reply) {
    reply.send()
  })

  fastify.addHook('onRoute', () => {
    expect.fail('should not be called')
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onResponse hook should log request error', (testDone) => {
  expect.assertions(4)

  let fastify = null
  const logStream = split(JSON.parse)
  try {
    fastify = Fastify({
      logger: {
        stream: logStream,
        level: 'error'
      }
    })
  } catch (e) {
    expect.fail()
  }

  logStream.once('data', line => {
    expect(line.msg).toBe('request errored')
    expect(line.level).toBe(50)
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    done(new Error('kaboom'))
  })

  fastify.get('/root', (request, reply) => {
    reply.send()
  })

  fastify.inject('/root', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

test('onResponse hook should support encapsulation / 1', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.addHook('onResponse', (request, reply, done) => {
      expect(reply.plugin).toBe(true)
      done()
    })

    instance.get('/plugin', (request, reply) => {
      reply.plugin = true
      reply.send()
    })

    done()
  })

  fastify.get('/root', (request, reply) => {
    reply.send()
  })

  fastify.inject('/root', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
  })

  fastify.inject('/plugin', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

test('onResponse hook should support encapsulation / 2', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()
  let pluginInstance

  fastify.addHook('onResponse', () => { })

  fastify.register((instance, opts, done) => {
    instance.addHook('onResponse', () => { })
    pluginInstance = instance
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    expect(fastify[symbols.kHooks].onResponse.length).toBe(1)
    expect(pluginInstance[symbols.kHooks].onResponse.length).toBe(2)
    testDone()
  })
})

test('onResponse hook should support encapsulation / 3', async () => {
  expect.assertions(15)
  const fastify = Fastify()
  onTestFinished(() => { fastify.close() })
  fastify.decorate('hello', 'world')

  fastify.addHook('onResponse', function (request, reply, done) {
    expect(this.hello).toBeTruthy()
    expect('onResponse called').toBeTruthy()
    done()
  })

  fastify.get('/first', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.register((instance, opts, done) => {
    instance.decorate('hello2', 'world')
    instance.addHook('onResponse', function (request, reply, done) {
      expect(this.hello).toBeTruthy()
      expect(this.hello2).toBeTruthy()
      expect('onResponse called').toBeTruthy()
      done()
    })

    instance.get('/second', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    done()
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const firstResult = await fetch(fastifyServer + '/first', { method: 'GET' })
  expect(firstResult.ok).toBeTruthy()
  expect(firstResult.status).toBe(200)
  const firstBody = await firstResult.text()
  expect(firstResult.headers.get('content-length')).toBe('' + firstBody.length)
  expect(JSON.parse(firstBody)).toEqual({ hello: 'world' })

  const secondResult = await fetch(fastifyServer + '/second')
  expect(secondResult.ok).toBeTruthy()
  expect(secondResult.status).toBe(200)
  const secondBody = await secondResult.text()
  expect(secondResult.headers.get('content-length')).toBe('' + secondBody.length)
  expect(JSON.parse(secondBody)).toEqual({ hello: 'world' })
})

test('onSend hook should support encapsulation / 1', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()
  let pluginInstance

  fastify.addHook('onSend', () => { })

  fastify.register((instance, opts, done) => {
    instance.addHook('onSend', () => { })
    pluginInstance = instance
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    expect(fastify[symbols.kHooks].onSend.length).toBe(1)
    expect(pluginInstance[symbols.kHooks].onSend.length).toBe(2)
    testDone()
  })
})

test('onSend hook should support encapsulation / 2', async () => {
  expect.assertions(15)
  const fastify = Fastify()
  onTestFinished(() => { fastify.close() })
  fastify.decorate('hello', 'world')

  fastify.addHook('onSend', function (request, reply, thePayload, done) {
    expect(this.hello).toBeTruthy()
    expect('onSend called').toBeTruthy()
    done()
  })

  fastify.get('/first', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.register((instance, opts, done) => {
    instance.decorate('hello2', 'world')
    instance.addHook('onSend', function (request, reply, thePayload, done) {
      expect(this.hello).toBeTruthy()
      expect(this.hello2).toBeTruthy()
      expect('onSend called').toBeTruthy()
      done()
    })

    instance.get('/second', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    done()
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const firstResult = await fetch(fastifyServer + '/first')
  expect(firstResult.ok).toBeTruthy()
  expect(firstResult.status).toBe(200)
  const firstBody = await firstResult.text()
  expect(firstResult.headers.get('content-length')).toBe('' + firstBody.length)
  expect(JSON.parse(firstBody)).toEqual({ hello: 'world' })

  const secondResult = await fetch(fastifyServer + '/second')
  expect(secondResult.ok).toBeTruthy()
  expect(secondResult.status).toBe(200)
  const secondBody = await secondResult.text()
  expect(secondResult.headers.get('content-length')).toBe('' + secondBody.length)
  expect(JSON.parse(secondBody)).toEqual({ hello: 'world' })
})

test('onSend hook is called after payload is serialized and headers are set', (testDone) => {
  expect.assertions(30)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    const thePayload = { hello: 'world' }

    instance.addHook('onSend', function (request, reply, payload, done) {
      expect(JSON.parse(payload)).toEqual(thePayload)
      expect(reply[symbols.kReplyHeaders]['content-type']).toBe('application/json; charset=utf-8')
      done()
    })

    instance.get('/json', (request, reply) => {
      reply.send(thePayload)
    })

    done()
  })

  fastify.register((instance, opts, done) => {
    instance.addHook('onSend', function (request, reply, payload, done) {
      expect(payload).toBe('some text')
      expect(reply[symbols.kReplyHeaders]['content-type']).toBe('text/plain; charset=utf-8')
      done()
    })

    instance.get('/text', (request, reply) => {
      reply.send('some text')
    })

    done()
  })

  fastify.register((instance, opts, done) => {
    const thePayload = Buffer.from('buffer payload')

    instance.addHook('onSend', function (request, reply, payload, done) {
      expect(payload).toBe(thePayload)
      expect(reply[symbols.kReplyHeaders]['content-type']).toBe('application/octet-stream')
      done()
    })

    instance.get('/buffer', (request, reply) => {
      reply.send(thePayload)
    })

    done()
  })

  fastify.register((instance, opts, done) => {
    let chunk = 'stream payload'
    const thePayload = new stream.Readable({
      read () {
        this.push(chunk)
        chunk = null
      }
    })

    instance.addHook('onSend', function (request, reply, payload, done) {
      expect(payload).toBe(thePayload)
      expect(reply[symbols.kReplyHeaders]['content-type']).toBe('application/octet-stream')
      done()
    })

    instance.get('/stream', (request, reply) => {
      reply.header('content-type', 'application/octet-stream')
      reply.send(thePayload)
    })

    done()
  })

  fastify.register((instance, opts, done) => {
    const serializedPayload = 'serialized'

    instance.addHook('onSend', function (request, reply, payload, done) {
      expect(payload).toBe(serializedPayload)
      expect(reply[symbols.kReplyHeaders]['content-type']).toBe('text/custom')
      done()
    })

    instance.get('/custom-serializer', (request, reply) => {
      reply
        .serializer(() => serializedPayload)
        .type('text/custom')
        .send('needs to be serialized')
    })

    done()
  })

  const completion = waitForCb({ steps: 5 })
  fastify.inject({
    method: 'GET',
    url: '/json'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    expect(res.headers['content-length']).toBe('17')
    completion.stepIn()
  })

  fastify.inject({
    method: 'GET',
    url: '/text'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toEqual('some text')
    expect(res.headers['content-length']).toBe('9')
    completion.stepIn()
  })

  fastify.inject({
    method: 'GET',
    url: '/buffer'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toEqual('buffer payload')
    expect(res.headers['content-length']).toBe('14')
    completion.stepIn()
  })

  fastify.inject({
    method: 'GET',
    url: '/stream'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toEqual('stream payload')
    expect(res.headers['transfer-encoding']).toBe('chunked')
    completion.stepIn()
  })

  fastify.inject({
    method: 'GET',
    url: '/custom-serializer'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toEqual('serialized')
    expect(res.headers['content-type']).toBe('text/custom')
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('modify payload', (testDone) => {
  expect.assertions(10)
  const fastify = Fastify()
  const payload = { hello: 'world' }
  const modifiedPayload = { hello: 'modified' }
  const anotherPayload = '"winter is coming"'

  fastify.addHook('onSend', function (request, reply, thePayload, done) {
    expect('onSend called').toBeTruthy()
    expect(JSON.parse(thePayload)).toEqual(payload)
    thePayload = thePayload.replace('world', 'modified')
    done(null, thePayload)
  })

  fastify.addHook('onSend', function (request, reply, thePayload, done) {
    expect('onSend called').toBeTruthy()
    expect(JSON.parse(thePayload)).toEqual(modifiedPayload)
    done(null, anotherPayload)
  })

  fastify.addHook('onSend', function (request, reply, thePayload, done) {
    expect('onSend called').toBeTruthy()
    expect(thePayload).toBe(anotherPayload)
    done()
  })

  fastify.get('/', (req, reply) => {
    reply.send(payload)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(anotherPayload)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-length']).toBe('18')
    testDone()
  })
})

test('clear payload', (testDone) => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.addHook('onSend', function (request, reply, payload, done) {
    expect('onSend called').toBeTruthy()
    reply.code(304)
    done(null, null)
  })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(304)
    expect(res.payload).toBe('')
    expect(res.headers['content-length']).toBe(undefined)
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    testDone()
  })
})

test('onSend hook throws', async () => {
  expect.assertions(10)
  // Upstream replaced getSchemaSerializer of './schemas' for fastify.js only (proxyquire), which does not call it: the
  // replacement never ran, and the test counts its own assertions only.
  const fastify = Fastify()
  onTestFinished(() => { fastify.close() })
  fastify.addHook('onSend', function (request, reply, payload, done) {
    if (request.raw.method === 'DELETE') {
      done(new Error('some error'))
      return
    }

    if (request.raw.method === 'PUT') {
      throw new Error('some error')
    }

    if (request.raw.method === 'POST') {
      throw new Error('some error')
    }

    done()
  })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.post('/', {
    schema: {
      response: {
        200: {
          content: {
            'application/json': {
              schema: {
                name: { type: 'string' },
                image: { type: 'string' },
                address: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.delete('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.put('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const getResult = await fetch(fastifyServer)
  expect(getResult.ok).toBeTruthy()
  expect(getResult.status).toBe(200)
  const getBody = await getResult.text()
  expect(getResult.headers.get('content-length')).toBe('' + getBody.length)
  expect(JSON.parse(getBody)).toEqual({ hello: 'world' })

  const postResult = await fetch(fastifyServer, { method: 'POST' })
  expect(postResult.ok).toBeFalsy()
  expect(postResult.status).toBe(500)

  const deleteResult = await fetch(fastifyServer, { method: 'DELETE' })
  expect(deleteResult.ok).toBeFalsy()
  expect(deleteResult.status).toBe(500)

  const putResult = await fetch(fastifyServer, { method: 'PUT' })
  expect(putResult.ok).toBeFalsy()
  expect(putResult.status).toBe(500)
})

test('onSend hook should receive valid request and reply objects if onRequest hook fails', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.decorateRequest('testDecorator', 'testDecoratorVal')
  fastify.decorateReply('testDecorator', 'testDecoratorVal')

  fastify.addHook('onRequest', function (req, reply, done) {
    done(new Error('onRequest hook failed'))
  })

  fastify.addHook('onSend', function (request, reply, payload, done) {
    expect(request.testDecorator).toBe('testDecoratorVal')
    expect(reply.testDecorator).toBe('testDecoratorVal')
    done()
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    testDone()
  })
})

test('onSend hook should receive valid request and reply objects if a custom content type parser fails', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.decorateRequest('testDecorator', 'testDecoratorVal')
  fastify.decorateReply('testDecorator', 'testDecoratorVal')

  fastify.addContentTypeParser('*', function (req, payload, done) {
    done(new Error('content type parser failed'))
  })

  fastify.addHook('onSend', function (request, reply, payload, done) {
    expect(request.testDecorator).toBe('testDecoratorVal')
    expect(reply.testDecorator).toBe('testDecoratorVal')
    done()
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello')
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    payload: 'body'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    testDone()
  })
})

test('Content-Length header should be updated if onSend hook modifies the payload', (testDone) => {
  expect.assertions(2)

  const instance = Fastify()

  instance.get('/', async (_, rep) => {
    rep.header('content-length', 3)
    return 'foo'
  })

  instance.addHook('onSend', async () => 'bar12233000')

  instance.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payloadLength = Buffer.byteLength(res.body)
    const contentLength = Number(res.headers['content-length'])

    expect(payloadLength).toBe(contentLength)
    testDone()
  })
})

test('cannot add hook after binding', (testDone) => {
  expect.assertions(1)
  const instance = Fastify()
  onTestFinished(() => instance.close())

  instance.get('/', function (request, reply) {
    reply.send({ hello: 'world' })
  })

  instance.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    try {
      instance.addHook('onRequest', () => { })
      expect.fail()
    } catch (e) {
      testDone()
    }
  })
})

test('onRequest hooks should be able to block a request', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addHook('onRequest', (req, reply, done) => {
    reply.send('hello')
    done()
  })

  fastify.addHook('onRequest', (req, reply, done) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('preHandler', (req, reply, done) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    expect('called').toBeTruthy()
    done()
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    expect('called').toBeTruthy()
    done()
  })

  fastify.get('/', function (request, reply) {
    expect.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    testDone()
  })
})

test('preValidation hooks should be able to block a request', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addHook('preValidation', (req, reply, done) => {
    reply.send('hello')
    done()
  })

  fastify.addHook('preValidation', (req, reply, done) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('preHandler', (req, reply, done) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    expect('called').toBeTruthy()
    done()
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    expect('called').toBeTruthy()
    done()
  })

  fastify.get('/', function (request, reply) {
    expect.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    testDone()
  })
})

test('preValidation hooks should be able to change request body before validation', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.addHook('preValidation', (req, _reply, done) => {
    const buff = Buffer.from(req.body.message, 'base64')
    req.body = JSON.parse(buff.toString('utf-8'))
    done()
  })

  fastify.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            foo: {
              type: 'string'
            },
            bar: {
              type: 'number'
            }
          },
          required: ['foo', 'bar']
        }
      }
    },
    (req, reply) => {
      expect('should pass').toBeTruthy()
      reply.status(200).send('hello')
    }
  )

  fastify.inject({
    url: '/',
    method: 'POST',
    payload: {
      message: Buffer.from(JSON.stringify({ foo: 'example', bar: 1 })).toString('base64')
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    testDone()
  })
})

test('preParsing hooks should be able to block a request', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addHook('preParsing', (req, reply, payload, done) => {
    reply.send('hello')
    done()
  })

  fastify.addHook('preParsing', (req, reply, payload, done) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('preHandler', (req, reply, done) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    expect('called').toBeTruthy()
    done()
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    expect('called').toBeTruthy()
    done()
  })

  fastify.get('/', function (request, reply) {
    expect.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    testDone()
  })
})

test('preHandler hooks should be able to block a request', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addHook('preHandler', (req, reply, done) => {
    reply.send('hello')
    done()
  })

  fastify.addHook('preHandler', (req, reply, done) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    expect(payload).toBe('hello')
    done()
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    expect('called').toBeTruthy()
    done()
  })

  fastify.get('/', function (request, reply) {
    expect.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    testDone()
  })
})

test('onRequest hooks should be able to block a request (last hook)', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addHook('onRequest', (req, reply, done) => {
    reply.send('hello')
    done()
  })

  fastify.addHook('preHandler', (req, reply, done) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    expect('called').toBeTruthy()
    done()
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    expect('called').toBeTruthy()
    done()
  })

  fastify.get('/', function (request, reply) {
    expect.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    testDone()
  })
})

test('preHandler hooks should be able to block a request (last hook)', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addHook('preHandler', (req, reply, done) => {
    reply.send('hello')
    done()
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    expect(payload).toBe('hello')
    done()
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    expect('called').toBeTruthy()
    done()
  })

  fastify.get('/', function (request, reply) {
    expect.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    testDone()
  })
})

test('preParsing hooks should handle errors', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.addHook('preParsing', (req, reply, payload, done) => {
    const e = new Error('kaboom')
    e.statusCode = 501
    throw e
  })

  fastify.post('/', function (request, reply) {
    reply.send(request.body)
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(501)
    expect(JSON.parse(res.payload)).toEqual({ error: 'Not Implemented', message: 'kaboom', statusCode: 501 })
    testDone()
  })
})

test('onRequest respond with a stream', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.addHook('onRequest', (req, reply, done) => {
    const stream = fs.createReadStream(__filename, 'utf8')
    // stream.pipe(res)
    // res.once('finish', done)
    reply.send(stream)
  })

  fastify.addHook('onRequest', (req, res, done) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('preHandler', (req, reply, done) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    expect('called').toBeTruthy()
    done()
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    expect('called').toBeTruthy()
    done()
  })

  fastify.get('/', function (request, reply) {
    expect.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

test('preHandler respond with a stream', (testDone) => {
  expect.assertions(7)
  const fastify = Fastify()

  fastify.addHook('onRequest', (req, reply, done) => {
    expect('called').toBeTruthy()
    done()
  })

  // we are calling `reply.send` inside the `preHandler` hook with a stream,
  // this triggers the `onSend` hook event if `preHandler` has not yet finished
  const order = [1, 2]

  fastify.addHook('preHandler', (req, reply, done) => {
    const stream = fs.createReadStream(__filename, 'utf8')
    reply.send(stream)
    reply.raw.once('finish', () => {
      expect(order.shift()).toBe(2)
      done()
    })
  })

  fastify.addHook('preHandler', (req, reply, done) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('onSend', (req, reply, payload, done) => {
    expect(order.shift()).toBe(1)
    expect(typeof payload.pipe).toBe('function')
    done()
  })

  fastify.addHook('onResponse', (request, reply, done) => {
    expect('called').toBeTruthy()
    done()
  })

  fastify.get('/', function (request, reply) {
    expect.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

test('Register an hook after a plugin inside a plugin', (testDone) => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('preHandler', function (req, reply, done) {
      expect('called').toBeTruthy()
      done()
    })

    instance.get('/', function (request, reply) {
      reply.send({ hello: 'world' })
    })

    done()
  }))

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('preHandler', function (req, reply, done) {
      expect('called').toBeTruthy()
      done()
    })

    instance.addHook('preHandler', function (req, reply, done) {
      expect('called').toBeTruthy()
      done()
    })

    done()
  }))

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    testDone()
  })
})

test('Register an hook after a plugin inside a plugin (with preHandler option)', (testDone) => {
  expect.assertions(7)
  const fastify = Fastify()

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('preHandler', function (req, reply, done) {
      expect('called').toBeTruthy()
      done()
    })

    instance.get('/', {
      preHandler: (req, reply, done) => {
        expect('called').toBeTruthy()
        done()
      }
    }, function (request, reply) {
      reply.send({ hello: 'world' })
    })

    done()
  }))

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('preHandler', function (req, reply, done) {
      expect('called').toBeTruthy()
      done()
    })

    instance.addHook('preHandler', function (req, reply, done) {
      expect('called').toBeTruthy()
      done()
    })

    done()
  }))

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    testDone()
  })
})

test('Register hooks inside a plugin after an encapsulated plugin', (testDone) => {
  expect.assertions(7)
  const fastify = Fastify()

  fastify.register(function (instance, opts, done) {
    instance.get('/', function (request, reply) {
      reply.send({ hello: 'world' })
    })

    done()
  })

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onRequest', function (req, reply, done) {
      expect('called').toBeTruthy()
      done()
    })

    instance.addHook('preHandler', function (request, reply, done) {
      expect('called').toBeTruthy()
      done()
    })

    instance.addHook('onSend', function (request, reply, payload, done) {
      expect('called').toBeTruthy()
      done()
    })

    instance.addHook('onResponse', function (request, reply, done) {
      expect('called').toBeTruthy()
      done()
    })

    done()
  }))

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    testDone()
  })
})

test('onRequest hooks should run in the order in which they are defined', (testDone) => {
  expect.assertions(9)
  const fastify = Fastify()

  fastify.register(function (instance, opts, done) {
    instance.addHook('onRequest', function (req, reply, done) {
      expect(req.previous).toBe(undefined)
      req.previous = 1
      done()
    })

    instance.get('/', function (request, reply) {
      expect(request.previous).toBe(5)
      reply.send({ hello: 'world' })
    })

    instance.register(fp(function (i, opts, done) {
      i.addHook('onRequest', function (req, reply, done) {
        expect(req.previous).toBe(1)
        req.previous = 2
        done()
      })
      done()
    }))

    done()
  })

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onRequest', function (req, reply, done) {
      expect(req.previous).toBe(2)
      req.previous = 3
      done()
    })

    instance.register(fp(function (i, opts, done) {
      i.addHook('onRequest', function (req, reply, done) {
        expect(req.previous).toBe(3)
        req.previous = 4
        done()
      })
      done()
    }))

    instance.addHook('onRequest', function (req, reply, done) {
      expect(req.previous).toBe(4)
      req.previous = 5
      done()
    })

    done()
  }))

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    testDone()
  })
})

test('preHandler hooks should run in the order in which they are defined', (testDone) => {
  expect.assertions(9)
  const fastify = Fastify()

  fastify.register(function (instance, opts, done) {
    instance.addHook('preHandler', function (request, reply, done) {
      expect(request.previous).toBe(undefined)
      request.previous = 1
      done()
    })

    instance.get('/', function (request, reply) {
      expect(request.previous).toBe(5)
      reply.send({ hello: 'world' })
    })

    instance.register(fp(function (i, opts, done) {
      i.addHook('preHandler', function (request, reply, done) {
        expect(request.previous).toBe(1)
        request.previous = 2
        done()
      })
      done()
    }))

    done()
  })

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('preHandler', function (request, reply, done) {
      expect(request.previous).toBe(2)
      request.previous = 3
      done()
    })

    instance.register(fp(function (i, opts, done) {
      i.addHook('preHandler', function (request, reply, done) {
        expect(request.previous).toBe(3)
        request.previous = 4
        done()
      })
      done()
    }))

    instance.addHook('preHandler', function (request, reply, done) {
      expect(request.previous).toBe(4)
      request.previous = 5
      done()
    })

    done()
  }))

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    testDone()
  })
})

test('onSend hooks should run in the order in which they are defined', (testDone) => {
  expect.assertions(8)
  const fastify = Fastify()

  fastify.register(function (instance, opts, done) {
    instance.addHook('onSend', function (request, reply, payload, done) {
      expect(request.previous).toBe(undefined)
      request.previous = 1
      done()
    })

    instance.get('/', function (request, reply) {
      reply.send({})
    })

    instance.register(fp(function (i, opts, done) {
      i.addHook('onSend', function (request, reply, payload, done) {
        expect(request.previous).toBe(1)
        request.previous = 2
        done()
      })
      done()
    }))

    done()
  })

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onSend', function (request, reply, payload, done) {
      expect(request.previous).toBe(2)
      request.previous = 3
      done()
    })

    instance.register(fp(function (i, opts, done) {
      i.addHook('onSend', function (request, reply, payload, done) {
        expect(request.previous).toBe(3)
        request.previous = 4
        done()
      })
      done()
    }))

    instance.addHook('onSend', function (request, reply, payload, done) {
      expect(request.previous).toBe(4)
      done(null, '5')
    })

    done()
  }))

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual(5)
    testDone()
  })
})

test('onResponse hooks should run in the order in which they are defined', (testDone) => {
  expect.assertions(8)
  const fastify = Fastify()

  fastify.register(function (instance, opts, done) {
    instance.addHook('onResponse', function (request, reply, done) {
      expect(reply.previous).toBe(undefined)
      reply.previous = 1
      done()
    })

    instance.get('/', function (request, reply) {
      reply.send({ hello: 'world' })
    })

    instance.register(fp(function (i, opts, done) {
      i.addHook('onResponse', function (request, reply, done) {
        expect(reply.previous).toBe(1)
        reply.previous = 2
        done()
      })
      done()
    }))

    done()
  })

  fastify.register(fp(function (instance, opts, done) {
    instance.addHook('onResponse', function (request, reply, done) {
      expect(reply.previous).toBe(2)
      reply.previous = 3
      done()
    })

    instance.register(fp(function (i, opts, done) {
      i.addHook('onResponse', function (request, reply, done) {
        expect(reply.previous).toBe(3)
        reply.previous = 4
        done()
      })
      done()
    }))

    instance.addHook('onResponse', function (request, reply, done) {
      expect(reply.previous).toBe(4)
      done()
    })

    done()
  }))

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    testDone()
  })
})

test('onRequest, preHandler, and onResponse hooks that resolve to a value do not cause an error', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify
    .addHook('onRequest', () => Promise.resolve(1))
    .addHook('onRequest', () => Promise.resolve(true))
    .addHook('preValidation', () => Promise.resolve(null))
    .addHook('preValidation', () => Promise.resolve('a'))
    .addHook('preHandler', () => Promise.resolve(null))
    .addHook('preHandler', () => Promise.resolve('a'))
    .addHook('onResponse', () => Promise.resolve({}))
    .addHook('onResponse', () => Promise.resolve([]))

  fastify.get('/', (request, reply) => {
    reply.send('hello')
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    testDone()
  })
})

test('If a response header has been set inside an hook it should not be overwritten by the final response handler', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addHook('onRequest', (req, reply, done) => {
    reply.header('X-Custom-Header', 'hello')
    done()
  })

  fastify.get('/', (request, reply) => {
    reply.send('hello')
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['x-custom-header']).toBe('hello')
    expect(res.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    testDone()
  })
})

test('If the content type has been set inside an hook it should not be changed', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addHook('onRequest', (req, reply, done) => {
    reply.header('content-type', 'text/html')
    done()
  })

  fastify.get('/', (request, reply) => {
    expect(reply[symbols.kReplyHeaders]['content-type']).toBeTruthy()
    reply.send('hello')
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['content-type']).toBe('text/html')
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    testDone()
  })
})

test('request in onRequest, preParsing, preValidation and onResponse', (testDone) => {
  expect.assertions(18)
  const fastify = Fastify()

  fastify.addHook('onRequest', function (request, reply, done) {
    expect(request.body).toEqual(undefined)
    expect(request.query.key).toEqual('value')
    expect(request.params.greeting).toEqual('hello')
    expect(request.headers).toEqual({
      'content-length': '17',
      'content-type': 'application/json',
      host: 'localhost:80',
      'user-agent': 'lightMyRequest',
      'x-custom': 'hello'
    })
    done()
  })

  fastify.addHook('preParsing', function (request, reply, payload, done) {
    expect(request.body).toEqual(undefined)
    expect(request.query.key).toEqual('value')
    expect(request.params.greeting).toEqual('hello')
    expect(request.headers).toEqual({
      'content-length': '17',
      'content-type': 'application/json',
      host: 'localhost:80',
      'user-agent': 'lightMyRequest',
      'x-custom': 'hello'
    })
    done()
  })

  fastify.addHook('preValidation', function (request, reply, done) {
    expect(request.body).toEqual({ hello: 'world' })
    expect(request.query.key).toEqual('value')
    expect(request.params.greeting).toEqual('hello')
    expect(request.headers).toEqual({
      'content-length': '17',
      'content-type': 'application/json',
      host: 'localhost:80',
      'user-agent': 'lightMyRequest',
      'x-custom': 'hello'
    })
    done()
  })

  fastify.addHook('onResponse', function (request, reply, done) {
    expect(request.body).toEqual({ hello: 'world' })
    expect(request.query.key).toEqual('value')
    expect(request.params.greeting).toEqual('hello')
    expect(request.headers).toEqual({
      'content-length': '17',
      'content-type': 'application/json',
      host: 'localhost:80',
      'user-agent': 'lightMyRequest',
      'x-custom': 'hello'
    })
    done()
  })

  fastify.post('/:greeting', function (req, reply) {
    reply.send('ok')
  })

  fastify.inject({
    method: 'POST',
    url: '/hello?key=value',
    headers: { 'x-custom': 'hello' },
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

test('preValidation hook should support encapsulation / 1', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.addHook('preValidation', (req, reply, done) => {
      expect(req.raw.url).toBe('/plugin')
      done()
    })

    instance.get('/plugin', (request, reply) => {
      reply.send()
    })

    done()
  })

  fastify.get('/root', (request, reply) => {
    reply.send()
  })

  fastify.inject('/root', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    fastify.inject('/plugin', (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).toBe(200)
      testDone()
    })
  })
})

test('preValidation hook should support encapsulation / 2', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()
  let pluginInstance

  fastify.addHook('preValidation', () => { })

  fastify.register((instance, opts, done) => {
    instance.addHook('preValidation', () => { })
    pluginInstance = instance
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    expect(fastify[symbols.kHooks].preValidation.length).toBe(1)
    expect(pluginInstance[symbols.kHooks].preValidation.length).toBe(2)
    testDone()
  })
})

test('preValidation hook should support encapsulation / 3', async () => {
  expect.assertions(19)
  const fastify = Fastify()
  onTestFinished(() => { fastify.close() })
  fastify.decorate('hello', 'world')

  fastify.addHook('preValidation', function (req, reply, done) {
    expect(this.hello).toBeTruthy()
    expect(this.hello2).toBeTruthy()
    req.first = true
    done()
  })

  fastify.decorate('hello2', 'world')

  fastify.get('/first', (req, reply) => {
    expect(req.first).toBeTruthy()
    expect(req.second).toBeFalsy()
    reply.send({ hello: 'world' })
  })

  fastify.register((instance, opts, done) => {
    instance.decorate('hello3', 'world')
    instance.addHook('preValidation', function (req, reply, done) {
      expect(this.hello).toBeTruthy()
      expect(this.hello2).toBeTruthy()
      expect(this.hello3).toBeTruthy()
      req.second = true
      done()
    })

    instance.get('/second', (req, reply) => {
      expect(req.first).toBeTruthy()
      expect(req.second).toBeTruthy()
      reply.send({ hello: 'world' })
    })

    done()
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result1 = await fetch(fastifyServer + '/first')
  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)
  const body1 = await result1.text()
  expect(result1.headers.get('content-length')).toBe('' + body1.length)
  expect(JSON.parse(body1)).toEqual({ hello: 'world' })

  const result2 = await fetch(fastifyServer + '/second')
  expect(result2.ok).toBeTruthy()
  expect(result2.status).toBe(200)
  const body2 = await result2.text()
  expect(result2.headers.get('content-length')).toBe('' + body2.length)
  expect(JSON.parse(body2)).toEqual({ hello: 'world' })
})

test('onError hook', (testDone) => {
  expect.assertions(3)

  const fastify = Fastify()

  const err = new Error('kaboom')

  fastify.addHook('onError', (request, reply, error, done) => {
    expect(error).toEqual(err)
    done()
  })

  fastify.get('/', (req, reply) => {
    reply.send(err)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Internal Server Error',
      message: 'kaboom',
      statusCode: 500
    })
    testDone()
  })
})

test('reply.send should throw if called inside the onError hook', (testDone) => {
  expect.assertions(3)

  const fastify = Fastify()

  const err = new Error('kaboom')

  fastify.addHook('onError', (request, reply, error, done) => {
    try {
      reply.send()
      expect.fail('Should throw')
    } catch (err) {
      expect(err.code).toBe('XUFA_ERR_SEND_INSIDE_ONERR')
    }
    done()
  })

  fastify.get('/', (req, reply) => {
    reply.send(err)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Internal Server Error',
      message: 'kaboom',
      statusCode: 500
    })
    testDone()
  })
})

test('onError hook with setErrorHandler', (testDone) => {
  expect.assertions(3)

  const fastify = Fastify()

  const external = new Error('ouch')
  const internal = new Error('kaboom')

  fastify.setErrorHandler((_, req, reply) => {
    reply.send(external)
  })

  fastify.addHook('onError', (request, reply, error, done) => {
    expect(error).toEqual(internal)
    done()
  })

  fastify.get('/', (req, reply) => {
    reply.send(internal)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Internal Server Error',
      message: 'ouch',
      statusCode: 500
    })
    testDone()
  })
})

test('preParsing hook should run before parsing and be able to modify the payload', async () => {
  expect.assertions(4)
  const fastify = Fastify()
  onTestFinished(() => { fastify.close() })

  fastify.addHook('preParsing', function (req, reply, payload, done) {
    const modified = new stream.Readable()
    modified.receivedEncodedLength = parseInt(req.headers['content-length'], 10)
    modified.push(JSON.stringify({ hello: 'another world' }))
    modified.push(null)
    done(null, modified)
  })

  fastify.route({
    method: 'POST',
    url: '/first',
    handler: function (req, reply) {
      reply.send(req.body)
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer + '/first', {
    method: 'POST',
    body: JSON.stringify({ hello: 'world' }),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  const body = await result.text()
  expect(result.headers.get('content-length')).toBe('' + body.length)
  expect(JSON.parse(body)).toEqual({ hello: 'another world' })
})

test('preParsing hooks should run in the order in which they are defined', async () => {
  expect.assertions(4)
  const fastify = Fastify()
  onTestFinished(() => { fastify.close() })

  fastify.addHook('preParsing', function (req, reply, payload, done) {
    const modified = new stream.Readable()
    modified.receivedEncodedLength = parseInt(req.headers['content-length'], 10)
    modified.push('{"hello":')
    done(null, modified)
  })

  fastify.addHook('preParsing', function (req, reply, payload, done) {
    payload.push('"another world"}')
    payload.push(null)
    done(null, payload)
  })

  fastify.route({
    method: 'POST',
    url: '/first',
    handler: function (req, reply) {
      reply.send(req.body)
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer + '/first', {
    method: 'POST',
    body: JSON.stringify({ hello: 'world' }),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  const body = await result.text()
  expect(result.headers.get('content-length')).toBe('' + body.length)
  expect(JSON.parse(body)).toEqual({ hello: 'another world' })
})

test('preParsing hooks should support encapsulation', async () => {
  expect.assertions(8)
  const fastify = Fastify()
  onTestFinished(() => { fastify.close() })

  fastify.addHook('preParsing', function (req, reply, payload, done) {
    const modified = new stream.Readable()
    modified.receivedEncodedLength = parseInt(req.headers['content-length'], 10)
    modified.push('{"hello":"another world"}')
    modified.push(null)
    done(null, modified)
  })

  fastify.post('/first', (req, reply) => {
    reply.send(req.body)
  })

  fastify.register((instance, opts, done) => {
    instance.addHook('preParsing', function (req, reply, payload, done) {
      const modified = new stream.Readable()
      modified.receivedEncodedLength = payload.receivedEncodedLength || parseInt(req.headers['content-length'], 10)
      modified.push('{"hello":"encapsulated world"}')
      modified.push(null)
      done(null, modified)
    })

    instance.post('/second', (req, reply) => {
      reply.send(req.body)
    })

    done()
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result1 = await fetch(fastifyServer + '/first', {
    method: 'POST',
    body: JSON.stringify({ hello: 'world' }),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)
  const body1 = await result1.text()
  expect(result1.headers.get('content-length')).toBe('' + body1.length)
  expect(JSON.parse(body1)).toEqual({ hello: 'another world' })

  const result2 = await fetch(fastifyServer + '/second', {
    method: 'POST',
    body: JSON.stringify({ hello: 'world' }),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(result2.ok).toBeTruthy()
  expect(result2.status).toBe(200)
  const body2 = await result2.text()
  expect(result2.headers.get('content-length')).toBe('' + body2.length)
  expect(JSON.parse(body2)).toEqual({ hello: 'encapsulated world' })
})

test('preParsing hook should support encapsulation / 1', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.addHook('preParsing', (req, reply, payload, done) => {
      expect(req.raw.url).toBe('/plugin')
      done()
    })

    instance.get('/plugin', (request, reply) => {
      reply.send()
    })

    done()
  })

  fastify.get('/root', (request, reply) => {
    reply.send()
  })

  fastify.inject('/root', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    fastify.inject('/plugin', (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).toBe(200)
      testDone()
    })
  })
})

test('preParsing hook should support encapsulation / 2', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()
  let pluginInstance

  fastify.addHook('preParsing', function a () { })

  fastify.register((instance, opts, done) => {
    instance.addHook('preParsing', function b () { })
    pluginInstance = instance
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    expect(fastify[symbols.kHooks].preParsing.length).toBe(1)
    expect(pluginInstance[symbols.kHooks].preParsing.length).toBe(2)
    testDone()
  })
})

test('preParsing hook should support encapsulation / 3', async () => {
  expect.assertions(19)
  const fastify = Fastify()
  onTestFinished(() => { fastify.close() })
  fastify.decorate('hello', 'world')

  fastify.addHook('preParsing', function (req, reply, payload, done) {
    expect(this.hello).toBeTruthy()
    expect(this.hello2).toBeTruthy()
    req.first = true
    done()
  })

  fastify.decorate('hello2', 'world')

  fastify.get('/first', (req, reply) => {
    expect(req.first).toBeTruthy()
    expect(req.second).toBeFalsy()
    reply.send({ hello: 'world' })
  })

  fastify.register((instance, opts, done) => {
    instance.decorate('hello3', 'world')
    instance.addHook('preParsing', function (req, reply, payload, done) {
      expect(this.hello).toBeTruthy()
      expect(this.hello2).toBeTruthy()
      expect(this.hello3).toBeTruthy()
      req.second = true
      done()
    })

    instance.get('/second', (req, reply) => {
      expect(req.first).toBeTruthy()
      expect(req.second).toBeTruthy()
      reply.send({ hello: 'world' })
    })

    done()
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result1 = await fetch(fastifyServer + '/first')
  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)
  const body1 = await result1.text()
  expect(result1.headers.get('content-length')).toBe('' + body1.length)
  expect(JSON.parse(body1)).toEqual({ hello: 'world' })

  const result2 = await fetch(fastifyServer + '/second')
  expect(result2.ok).toBeTruthy()
  expect(result2.status).toBe(200)
  const body2 = await result2.text()
  expect(result2.headers.get('content-length')).toBe('' + body2.length)
  expect(JSON.parse(body2)).toEqual({ hello: 'world' })
})

test('preSerialization hook should run before serialization and be able to modify the payload', async () => {
  expect.assertions(4)
  const fastify = Fastify()
  onTestFinished(() => { fastify.close() })

  fastify.addHook('preSerialization', function (req, reply, payload, done) {
    payload.hello += '1'
    payload.world = 'ok'

    done(null, payload)
  })

  fastify.route({
    method: 'GET',
    url: '/first',
    handler: function (req, reply) {
      reply.send({ hello: 'world' })
    },
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            hello: {
              type: 'string'
            },
            world: {
              type: 'string'
            }
          },
          required: ['world'],
          additionalProperties: false
        }
      }
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer + '/first')
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  const body = await result.text()
  expect(result.headers.get('content-length')).toBe('' + body.length)
  expect(JSON.parse(body)).toEqual({ hello: 'world1', world: 'ok' })
})

test('preSerialization hook should be able to throw errors which are validated against schema response', async () => {
  expect.assertions(5)
  const fastify = Fastify()
  onTestFinished(() => { fastify.close() })

  fastify.addHook('preSerialization', function (req, reply, payload, done) {
    done(new Error('preSerialization aborted'))
  })

  fastify.setErrorHandler((err, request, reply) => {
    expect(err.message).toBe('preSerialization aborted')
    err.world = 'error'
    reply.send(err)
  })

  fastify.route({
    method: 'GET',
    url: '/first',
    handler: function (req, reply) {
      reply.send({ world: 'hello' })
    },
    schema: {
      response: {
        500: {
          type: 'object',
          properties: {
            world: {
              type: 'string'
            }
          },
          required: ['world'],
          additionalProperties: false
        }
      }
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer + '/first')
  expect(result.ok).toBeFalsy()
  expect(result.status).toBe(500)
  const body = await result.text()
  expect(result.headers.get('content-length')).toBe('' + body.length)
  expect(JSON.parse(body)).toEqual({ world: 'error' })
})

test('preSerialization hook which returned error should still run onError hooks', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => { fastify.close() })

  fastify.addHook('preSerialization', function (req, reply, payload, done) {
    done(new Error('preSerialization aborted'))
  })

  fastify.addHook('onError', function (req, reply, payload, done) {
    expect('should pass').toBeTruthy()
    done()
  })

  fastify.get('/first', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer + '/first')
  expect(result.ok).toBeFalsy()
  expect(result.status).toBe(500)
})

test('preSerialization hooks should run in the order in which they are defined', async () => {
  expect.assertions(4)
  const fastify = Fastify()
  onTestFinished(() => { fastify.close() })

  fastify.addHook('preSerialization', function (req, reply, payload, done) {
    payload.hello += '2'

    done(null, payload)
  })

  fastify.addHook('preSerialization', function (req, reply, payload, done) {
    payload.hello += '1'

    done(null, payload)
  })

  fastify.get('/first', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer + '/first')
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  const body = await result.text()
  expect(result.headers.get('content-length')).toBe('' + body.length)
  expect(JSON.parse(body)).toEqual({ hello: 'world21' })
})

test('preSerialization hooks should support encapsulation', async () => {
  expect.assertions(8)
  const fastify = Fastify()
  onTestFinished(() => { fastify.close() })

  fastify.addHook('preSerialization', function (req, reply, payload, done) {
    payload.hello += '1'

    done(null, payload)
  })

  fastify.get('/first', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.register((instance, opts, done) => {
    instance.addHook('preSerialization', function (req, reply, payload, done) {
      payload.hello += '2'

      done(null, payload)
    })

    instance.get('/second', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    done()
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result1 = await fetch(fastifyServer + '/first')
  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)
  const body1 = await result1.text()
  expect(result1.headers.get('content-length')).toBe('' + body1.length)
  expect(JSON.parse(body1)).toEqual({ hello: 'world1' })

  const result2 = await fetch(fastifyServer + '/second')
  expect(result2.ok).toBeTruthy()
  expect(result2.status).toBe(200)
  const body2 = await result2.text()
  expect(result2.headers.get('content-length')).toBe('' + body2.length)
  expect(JSON.parse(body2)).toEqual({ hello: 'world12' })
})

test('onRegister hook should be called / 1', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addHook('onRegister', function (instance, opts, done) {
    expect(this.addHook).toBeTruthy()
    expect(instance.addHook).toBeTruthy()
    expect(opts).toEqual(pluginOpts)
    expect(done).toBeFalsy()
  })

  const pluginOpts = { prefix: 'hello', custom: 'world' }
  fastify.register((instance, opts, done) => {
    done()
  }, pluginOpts)

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onRegister hook should be called / 2', (testDone) => {
  expect.assertions(7)
  const fastify = Fastify()

  fastify.addHook('onRegister', function (instance) {
    expect(this.addHook).toBeTruthy()
    expect(instance.addHook).toBeTruthy()
  })

  fastify.register((instance, opts, done) => {
    instance.register((instance, opts, done) => {
      done()
    })
    done()
  })

  fastify.register((instance, opts, done) => {
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onRegister hook should be called / 3', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.decorate('data', [])

  fastify.addHook('onRegister', instance => {
    instance.data = instance.data.slice()
  })

  fastify.register((instance, opts, done) => {
    instance.data.push(1)
    instance.register((instance, opts, done) => {
      instance.data.push(2)
      expect(instance.data).toEqual([1, 2])
      done()
    })
    expect(instance.data).toEqual([1])
    done()
  })

  fastify.register((instance, opts, done) => {
    expect(instance.data).toEqual([])
    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('onRegister hook should be called (encapsulation)', (testDone) => {
  expect.assertions(1)
  const fastify = Fastify()

  function plugin (instance, opts, done) {
    done()
  }
  plugin[Symbol.for('skip-override')] = true

  fastify.addHook('onRegister', (instance, opts) => {
    expect.fail('This should not be called')
  })

  fastify.register(plugin)

  fastify.ready(err => {
    expect(err).toBeFalsy()
    testDone()
  })
})

test('early termination, onRequest', (testDone) => {
  expect.assertions(3)

  const app = Fastify()

  app.addHook('onRequest', (req, reply) => {
    setImmediate(() => reply.send('hello world'))
    return reply
  })

  app.get('/', (req, reply) => {
    expect.fail('should not happen')
  })

  app.inject('/', function (err, res) {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.body.toString()).toBe('hello world')
    testDone()
  })
})

test('reply.send should throw if undefined error is thrown', (testDone) => {
  /* eslint prefer-promise-reject-errors: ["error", {"allowEmptyReject": true}] */

  expect.assertions(3)
  const fastify = Fastify()

  fastify.addHook('onRequest', function (req, reply, done) {
    return Promise.reject()
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Internal Server Error',
      code: 'XUFA_ERR_SEND_UNDEFINED_ERR',
      message: 'Undefined error has occurred',
      statusCode: 500
    })
    testDone()
  })
})

test('reply.send should throw if undefined error is thrown at preParsing hook', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.addHook('preParsing', function (req, reply, done) {
    return Promise.reject()
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Internal Server Error',
      code: 'XUFA_ERR_SEND_UNDEFINED_ERR',
      message: 'Undefined error has occurred',
      statusCode: 500
    })
    testDone()
  })
})

test('reply.send should throw if undefined error is thrown at onSend hook', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.addHook('onSend', function (req, reply, done) {
    return Promise.reject()
  })

  fastify.get('/', (req, reply) => {
    reply.send('hello')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Internal Server Error',
      code: 'XUFA_ERR_SEND_UNDEFINED_ERR',
      message: 'Undefined error has occurred',
      statusCode: 500
    })
    testDone()
  })
})

test('onTimeout should be triggered', async () => {
  expect.assertions(4)
  const fastify = Fastify({ connectionTimeout: 500 })
  onTestFinished(() => { fastify.close() })

  fastify.addHook('onTimeout', function (req, res, done) {
    expect('called').toBeTruthy()
    done()
  })

  fastify.get('/', async (req, reply) => {
    await reply.send({ hello: 'world' })
  })

  fastify.get('/timeout', async (req, reply) => {
    return reply
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result1 = await fetch(fastifyServer)
  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)

  await expect((() => fetch(fastifyServer + '/timeout'))()).rejects.toThrow()
})

test('onTimeout should be triggered and socket _meta is set', async () => {
  expect.assertions(4)
  const fastify = Fastify({ connectionTimeout: 500 })
  onTestFinished(() => { fastify.close() })

  fastify.addHook('onTimeout', function (req, res, done) {
    expect('called').toBeTruthy()
    done()
  })

  fastify.get('/', async (req, reply) => {
    req.raw.socket._meta = {}
    return reply.send({ hello: 'world' })
  })

  fastify.get('/timeout', async (req, reply) => {
    return reply
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result1 = await fetch(fastifyServer)
  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)

  try {
    await fetch(fastifyServer + '/timeout')
    expect.fail('Should have thrown an error')
  } catch (err) {
    expect(err instanceof Error).toBeTruthy()
  }
})

test('socket._meta is cleared after response to prevent keep-alive leaks', async () => {
  expect.assertions(3)
  const fastify = Fastify({ connectionTimeout: 500 })
  onTestFinished(() => { fastify.close() })

  fastify.addHook('onTimeout', function (req, res, done) { done() })

  fastify.addHook('onResponse', function (req, reply, done) {
    expect(req.raw.socket._meta).toBe(null)
    done()
  })

  fastify.get('/', async (req, reply) => {
    return { hello: 'world' }
  })

  const address = await fastify.listen({ port: 0 })
  const result = await fetch(address)
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
})

test('registering invalid hooks should throw an error', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  expect(() => {
    fastify.route({
      method: 'GET',
      path: '/invalidHook',
      onRequest: [undefined],
      async handler () {
        return 'hello world'
      }
    })
  }).toThrow(expect.objectContaining({ message: 'onRequest hook should be a function, instead got [object Undefined]' }))

  expect(() => {
    fastify.route({
      method: 'GET',
      path: '/invalidHook',
      onRequest: null,
      async handler () {
        return 'hello world'
      }
    })
  }).toThrow(expect.objectContaining({ message: 'onRequest hook should be a function, instead got [object Null]' }))

  // undefined is ok
  fastify.route({
    method: 'GET',
    path: '/validhook',
    onRequest: undefined,
    async handler () {
      return 'hello world'
    }
  })

  expect(() => {
    fastify.addHook('onRoute', (routeOptions) => {
      routeOptions.onSend = [undefined]
    })

    fastify.get('/', function (request, reply) {
      reply.send('hello world')
    })
  }).toThrow(expect.objectContaining({ message: 'onSend hook should be a function, instead got [object Undefined]' }))
})

test('onRequestAbort should be triggered', (testDone) => {
  const fastify = Fastify()
  let order = 0

  expect.assertions(7)
  onTestFinished(() => fastify.close())

  const completion = waitForCb({ steps: 2 })
  completion.patience.then(testDone)

  fastify.addHook('onRequestAbort', function (req, done) {
    expect(++order).toBe(1)
    expect(req.pendingResolve).toBeTruthy()
    req.pendingResolve()
    completion.stepIn()
    done()
  })

  fastify.addHook('onError', function hook (request, reply, error, done) {
    expect.fail('onError should not be called')
    done()
  })

  fastify.addHook('onSend', function hook (request, reply, payload, done) {
    expect(payload).toBe('{"hello":"world"}')
    done(null, payload)
  })

  fastify.addHook('onResponse', function hook (request, reply, done) {
    expect.fail('onResponse should not be called')
    done()
  })

  fastify.route({
    method: 'GET',
    path: '/',
    async handler (request, reply) {
      expect('handler called').toBeTruthy()
      let resolvePromise
      const promise = new Promise(resolve => { resolvePromise = resolve })
      request.pendingResolve = resolvePromise
      await promise
      expect('handler promise resolved').toBeTruthy()
      return { hello: 'world' }
    },
    async onRequestAbort (req) {
      expect(++order).toBe(2)
      completion.stepIn()
    }
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const socket = connect(fastify.server.address().port)

    socket.write('GET / HTTP/1.1\r\nHost: fastify.test\r\n\r\n')

    sleep(500).then(() => socket.destroy())
  })
})

test('onRequestAbort should support encapsulation', (testDone) => {
  const fastify = Fastify()
  let order = 0
  let child

  expect.assertions(6)
  onTestFinished(() => fastify.close())

  const completion = waitForCb({ steps: 2 })
  completion.patience.then(testDone)

  fastify.addHook('onRequestAbort', function (req, done) {
    expect(++order).toBe(1)
    expect(this.pluginName).toEqual(child.pluginName)
    completion.stepIn()
    done()
  })

  fastify.register(async function (_child, _) {
    child = _child

    fastify.addHook('onRequestAbort', async function (req) {
      expect(++order).toBe(2)
      expect(this.pluginName).toEqual(child.pluginName)
      completion.stepIn()
    })

    child.route({
      method: 'GET',
      path: '/',
      async handler (request, reply) {
        await sleep(1000)
        return { hello: 'world' }
      },
      async onRequestAbort (_req) {
        expect(++order).toBe(3)
      }
    })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const socket = connect(fastify.server.address().port)

    socket.write('GET / HTTP/1.1\r\nHost: fastify.test\r\n\r\n')

    sleep(500).then(() => socket.destroy())
  })
})

test('onRequestAbort should handle errors / 1', (testDone) => {
  const fastify = Fastify()

  expect.assertions(2)
  onTestFinished(() => fastify.close())

  fastify.addHook('onRequestAbort', function (req, done) {
    process.nextTick(() => {
      expect('should pass').toBeTruthy()
      testDone()
    })
    done(new Error('KABOOM!'))
  })

  fastify.route({
    method: 'GET',
    path: '/',
    async handler (request, reply) {
      await sleep(1000)
      return { hello: 'world' }
    }
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const socket = connect(fastify.server.address().port)

    socket.write('GET / HTTP/1.1\r\nHost: fastify.test\r\n\r\n')

    sleep(500).then(() => socket.destroy())
  })
})

test('onRequestAbort should handle errors / 2', (testDone) => {
  const fastify = Fastify()

  expect.assertions(2)
  onTestFinished(() => fastify.close())

  fastify.addHook('onRequestAbort', function (req, done) {
    process.nextTick(() => {
      expect('should pass').toBeTruthy()
      testDone()
    })
    throw new Error('KABOOM!')
  })

  fastify.route({
    method: 'GET',
    path: '/',
    async handler (request, reply) {
      await sleep(1000)
      return { hello: 'world' }
    }
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const socket = connect(fastify.server.address().port)

    socket.write('GET / HTTP/1.1\r\nHost: fastify.test\r\n\r\n')

    sleep(500).then(() => socket.destroy())
  })
})

test('onRequestAbort should handle async errors / 1', (testDone) => {
  const fastify = Fastify()

  expect.assertions(2)
  onTestFinished(() => fastify.close())

  fastify.addHook('onRequestAbort', async function (req) {
    process.nextTick(() => {
      expect('should pass').toBeTruthy()
      testDone()
    })
    throw new Error('KABOOM!')
  })

  fastify.route({
    method: 'GET',
    path: '/',
    async handler (request, reply) {
      await sleep(1000)
      return { hello: 'world' }
    }
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const socket = connect(fastify.server.address().port)

    socket.write('GET / HTTP/1.1\r\nHost: fastify.test\r\n\r\n')

    sleep(500).then(() => socket.destroy())
  })
})

test('onRequestAbort should handle async errors / 2', (testDone) => {
  const fastify = Fastify()

  expect.assertions(2)
  onTestFinished(() => fastify.close())

  fastify.addHook('onRequestAbort', async function (req) {
    process.nextTick(() => {
      expect('should pass').toBeTruthy()
      testDone()
    })

    return Promise.reject()
  })

  fastify.route({
    method: 'GET',
    path: '/',
    async handler (request, reply) {
      await sleep(1000)
      return { hello: 'world' }
    }
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const socket = connect(fastify.server.address().port)

    socket.write('GET / HTTP/1.1\r\nHost: fastify.test\r\n\r\n')

    sleep(500).then(() => socket.destroy())
  })
})

test('socket timeout listener is removed when socket._meta is cleared after response', async () => {
  expect.assertions(4)

  const fastify = Fastify({ connectionTimeout: 200 })
  onTestFinished(() => fastify.close())

  fastify.addHook('onTimeout', function (req, reply, done) { done() })

  fastify.addHook('onResponse', function (req, reply, done) {
    const socket = req.raw.socket
    expect(socket._meta).toBe(null)
    expect(socket.listeners('timeout').some(listener => listener.name === 'handleTimeout')).toBe(false)
    done()
  })

  fastify.get('/', async () => ({ ok: true }))

  const address = await fastify.listen({ port: 0 })
  const result = await fetch(address)
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
})

test('socket._meta and timeout listener are cleared on reply.hijack() when onTimeout is registered', async () => {
  // reply.hijack() opts out of Fastify's response lifecycle so onResFinished
  // never fires. Before this fix, socket._meta was left pointing at the
  // request/reply objects for the full keep-alive socket lifetime when
  // an onTimeout hook was registered.
  expect.assertions(3)

  const net = require('node:net')
  const fastify = Fastify({ connectionTimeout: 300 })
  onTestFinished(() => fastify.close())

  fastify.addHook('onTimeout', function (req, reply, done) { done() })

  let metaAfterHijack = 'not-set'
  let hasFastifyTimeoutListenerAfterHijack = true
  fastify.get('/', async (req, reply) => {
    reply.hijack()
    // _meta must be cleared synchronously inside hijack()
    metaAfterHijack = req.raw.socket._meta
    hasFastifyTimeoutListenerAfterHijack = req.raw.socket.listeners('timeout').some(listener => listener.name === 'handleTimeout')
    // Write a minimal valid HTTP/1.1 response and close
    reply.raw.write('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok')
    reply.raw.end()
    return reply
  })

  await fastify.listen({ port: 0 })

  // Use raw TCP so we are not affected by fetch() rejecting a closed socket.
  // Extract host/port from the server address object to handle IPv6 (::1) on Windows.
  const { port, address: host } = fastify.server.address()
  await new Promise((resolve, reject) => {
    const socket = net.connect(port, host, () => {
      socket.write('GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n')
    })
    socket.on('data', () => {})
    socket.on('close', resolve)
    socket.on('error', reject)
  })

  expect(true).toBeTruthy()
  expect(metaAfterHijack == null).toBeTruthy()
  expect(hasFastifyTimeoutListenerAfterHijack).toBe(false)
})
