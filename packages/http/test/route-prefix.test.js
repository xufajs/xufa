'use strict'


const Fastify = require('..')
const { waitForCb } = require('./helper')

test('Prefix options should add a prefix for all the routes inside a register / 1', (testDone) => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.get('/first', (req, reply) => {
    reply.send({ route: '/first' })
  })

  fastify.register(function (fastify, opts, done) {
    fastify.get('/first', (req, reply) => {
      reply.send({ route: '/v1/first' })
    })

    fastify.register(function (fastify, opts, done) {
      fastify.get('/first', (req, reply) => {
        reply.send({ route: '/v1/v2/first' })
      })
      done()
    }, { prefix: '/v2' })

    done()
  }, { prefix: '/v1' })

  const completion = waitForCb({ steps: 3 })
  fastify.inject({
    method: 'GET',
    url: '/first'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ route: '/first' })
    completion.stepIn()
  })

  fastify.inject({
    method: 'GET',
    url: '/v1/first'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ route: '/v1/first' })
    completion.stepIn()
  })

  fastify.inject({
    method: 'GET',
    url: '/v1/v2/first'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ route: '/v1/v2/first' })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Prefix options should add a prefix for all the routes inside a register / 2', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.register(function (fastify, opts, done) {
    fastify.get('/first', (req, reply) => {
      reply.send({ route: '/v1/first' })
    })

    fastify.get('/second', (req, reply) => {
      reply.send({ route: '/v1/second' })
    })
    done()
  }, { prefix: '/v1' })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/v1/first'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ route: '/v1/first' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/v1/second'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ route: '/v1/second' })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Prefix options should add a prefix for all the chained routes inside a register / 3', (testDone) => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.register(function (fastify, opts, done) {
    fastify
      .get('/first', (req, reply) => {
        reply.send({ route: '/v1/first' })
      })
      .get('/second', (req, reply) => {
        reply.send({ route: '/v1/second' })
      })
    done()
  }, { prefix: '/v1' })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/v1/first'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ route: '/v1/first' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/v1/second'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ route: '/v1/second' })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Prefix should support parameters as well', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.register(function (fastify, opts, done) {
    fastify.get('/hello', (req, reply) => {
      reply.send({ id: req.params.id })
    })
    done()
  }, { prefix: '/v1/:id' })

  fastify.inject({
    method: 'GET',
    url: '/v1/param/hello'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ id: 'param' })
    testDone()
  })
})

test('Prefix should support /', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.register(function (fastify, opts, done) {
    fastify.get('/', (req, reply) => {
      reply.send({ hello: 'world' })
    })
    done()
  }, { prefix: '/v1' })

  fastify.inject({
    method: 'GET',
    url: '/v1'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    testDone()
  })
})

test('Prefix without /', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.register(function (fastify, opts, done) {
    fastify.get('/', (req, reply) => {
      reply.send({ hello: 'world' })
    })
    done()
  }, { prefix: 'v1' })

  fastify.inject({
    method: 'GET',
    url: '/v1'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    testDone()
  })
})

test('Prefix with trailing /', (testDone) => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.register(function (fastify, opts, done) {
    fastify.get('/route1', (req, reply) => {
      reply.send({ hello: 'world1' })
    })
    fastify.get('route2', (req, reply) => {
      reply.send({ hello: 'world2' })
    })

    fastify.register(function (fastify, opts, done) {
      fastify.get('/route3', (req, reply) => {
        reply.send({ hello: 'world3' })
      })
      done()
    }, { prefix: '/inner/' })

    done()
  }, { prefix: '/v1/' })

  const completion = waitForCb({ steps: 3 })
  fastify.inject({
    method: 'GET',
    url: '/v1/route1'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world1' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/v1/route2'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world2' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/v1/inner/route3'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world3' })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Prefix with trailing / and nested prefix without leading /', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.register(function (fastify, opts, done) {
    fastify.register(function (fastify, opts, done) {
      fastify.get('/route', (req, reply) => {
        reply.send({ hello: 'world' })
      })
      done()
    }, { prefix: 'inner' })
    done()
  }, { prefix: '/v1/' })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/v1/inner/route'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/v1//inner/route'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Prefix works multiple levels deep', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.register(function (fastify, opts, done) {
    fastify.register(function (fastify, opts, done) {
      fastify.register(function (fastify, opts, done) {
        fastify.register(function (fastify, opts, done) {
          fastify.get('/', (req, reply) => {
            reply.send({ hello: 'world' })
          })
          done()
        }, { prefix: '/v3' })
        done()
      }) // No prefix on this level
      done()
    }, { prefix: 'v2' })
    done()
  }, { prefix: '/v1' })

  fastify.inject({
    method: 'GET',
    url: '/v1/v2/v3'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    testDone()
  })
})

test('Different register - encapsulation check', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.get('/first', (req, reply) => {
    reply.send({ route: '/first' })
  })

  fastify.register(function (instance, opts, done) {
    instance.register(function (f, opts, done) {
      f.get('/', (req, reply) => {
        reply.send({ route: '/v1/v2' })
      })
      done()
    }, { prefix: '/v2' })
    done()
  }, { prefix: '/v1' })

  fastify.register(function (instance, opts, done) {
    instance.register(function (f, opts, done) {
      f.get('/', (req, reply) => {
        reply.send({ route: '/v3/v4' })
      })
      done()
    }, { prefix: '/v4' })
    done()
  }, { prefix: '/v3' })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/v1/v2'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ route: '/v1/v2' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/v3/v4'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ route: '/v3/v4' })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('Can retrieve prefix within encapsulated instances', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.register(function (instance, opts, done) {
    instance.get('/one', function (req, reply) {
      reply.send(instance.prefix)
    })

    instance.register(function (instance, opts, done) {
      instance.get('/two', function (req, reply) {
        reply.send(instance.prefix)
      })
      done()
    }, { prefix: '/v2' })

    done()
  }, { prefix: '/v1' })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/v1/one'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toEqual('/v1')
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/v1/v2/two'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toEqual('/v1/v2')
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('matches both /prefix and /prefix/ with a / route', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.register(function (fastify, opts, done) {
    fastify.get('/', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    done()
  }, { prefix: '/prefix' })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/prefix'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/prefix/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('prefix "/prefix/" does not match "/prefix" with a / route', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.register(function (fastify, opts, done) {
    fastify.get('/', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    done()
  }, { prefix: '/prefix/' })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/prefix'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toEqual(404)
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/prefix/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('matches both /prefix and /prefix/ with a / route - ignoreTrailingSlash: true', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify({
    routerOptions: {
      ignoreTrailingSlash: true
    }
  })

  fastify.register(function (fastify, opts, done) {
    fastify.get('/', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    done()
  }, { prefix: '/prefix' })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/prefix'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/prefix/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('matches both /prefix and /prefix/ with a / route - ignoreDuplicateSlashes: true', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify({
    routerOptions: {
      ignoreDuplicateSlashes: true
    }
  })

  fastify.register(function (fastify, opts, done) {
    fastify.get('/', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    done()
  }, { prefix: '/prefix' })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/prefix'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/prefix/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('matches both /prefix and /prefix/  with a / route - prefixTrailingSlash: "both", ignoreTrailingSlash: false', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify({
    routerOptions: {
      ignoreTrailingSlash: false
    }
  })

  fastify.register(function (fastify, opts, done) {
    fastify.route({
      method: 'GET',
      url: '/',
      prefixTrailingSlash: 'both',
      handler: (req, reply) => {
        reply.send({ hello: 'world' })
      }
    })

    done()
  }, { prefix: '/prefix' })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/prefix'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/prefix/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('reports the canonical route url for hidden prefix trailing slash route', async () => {
  expect.assertions(4)

  const fastify = Fastify({
    ignoreTrailingSlash: false,
    exposeHeadRoutes: false
  })

  const onRouteUrls = []

  fastify.addHook('onRoute', routeOptions => {
    onRouteUrls.push(routeOptions.url)
  })

  fastify.register(async instance => {
    instance.get('/', async request => {
      return request.routeOptions.url
    })

    instance.get('/bar/', async request => {
      return request.routeOptions.url
    })
  }, { prefix: '/prefix' })

  expect((await fastify.inject('/prefix')).payload).toBe('/prefix')
  expect((await fastify.inject('/prefix/')).payload).toBe('/prefix')
  expect((await fastify.inject('/prefix/bar/')).payload).toBe('/prefix/bar/')
  expect(onRouteUrls).toEqual(['/prefix', '/prefix/bar/'])

  await fastify.close()
})

test('matches both /prefix and /prefix/  with a / route - prefixTrailingSlash: "both", ignoreDuplicateSlashes: false', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify({
    routerOptions: {
      ignoreDuplicateSlashes: false
    }
  })

  fastify.register(function (fastify, opts, done) {
    fastify.route({
      method: 'GET',
      url: '/',
      prefixTrailingSlash: 'both',
      handler: (req, reply) => {
        reply.send({ hello: 'world' })
      }
    })

    done()
  }, { prefix: '/prefix' })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/prefix'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/prefix/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('matches both /prefix and /prefix/ with a / route - ignoreTrailingSlash: true, ignoreDuplicateSlashes: true', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify({
    routerOptions: {
      ignoreTrailingSlash: true,
      ignoreDuplicateSlashes: true
    }
  })

  fastify.register(function (fastify, opts, done) {
    fastify.get('/', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    done()
  }, { prefix: '/prefix' })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/prefix'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/prefix/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('matches both /prefix and /prefix/ with a / route - ignoreTrailingSlash: true, ignoreDuplicateSlashes: false', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify({
    routerOptions: {
      ignoreTrailingSlash: true,
      ignoreDuplicateSlashes: false
    }
  })

  fastify.register(function (fastify, opts, done) {
    fastify.get('/', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    done()
  }, { prefix: '/prefix' })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/prefix'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/prefix/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('returns 404 status code with /prefix/ and / route - prefixTrailingSlash: "both" (default), ignoreTrailingSlash: true', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify({
    routerOptions: {
      ignoreTrailingSlash: true
    }
  })

  fastify.register(function (fastify, opts, done) {
    fastify.route({
      method: 'GET',
      url: '/',
      handler: (req, reply) => {
        reply.send({ hello: 'world' })
      }
    })

    done()
  }, { prefix: '/prefix/' })

  fastify.inject({
    method: 'GET',
    url: '/prefix//'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Not Found',
      message: 'Route GET:/prefix// not found',
      statusCode: 404
    })
    testDone()
  })
})

test('matches both /prefix and /prefix/  with a / route - prefixTrailingSlash: "both", ignoreDuplicateSlashes: true', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify({
    routerOptions: {
      ignoreDuplicateSlashes: true
    }
  })

  fastify.register(function (fastify, opts, done) {
    fastify.route({
      method: 'GET',
      url: '/',
      handler: (req, reply) => {
        reply.send({ hello: 'world' })
      }
    })

    done()
  }, { prefix: '/prefix/' })

  fastify.inject({
    method: 'GET',
    url: '/prefix//'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    testDone()
  })
})

test('matches both /prefix and /prefix/  with a / route - prefixTrailingSlash: "both", ignoreTrailingSlash: true, ignoreDuplicateSlashes: true', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify({
    routerOptions: {
      ignoreTrailingSlash: true,
      ignoreDuplicateSlashes: true
    }
  })

  fastify.register(function (fastify, opts, done) {
    fastify.route({
      method: 'GET',
      url: '/',
      handler: (req, reply) => {
        reply.send({ hello: 'world' })
      }
    })

    done()
  }, { prefix: '/prefix/' })

  fastify.inject({
    method: 'GET',
    url: '/prefix//'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    testDone()
  })
})

test('matches both /prefix and /prefix/  with a / route - prefixTrailingSlash: "both", ignoreDuplicateSlashes: true', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify({
    routerOptions: {
      ignoreTrailingSlash: true,
      ignoreDuplicateSlashes: true
    }
  })

  fastify.register(function (fastify, opts, done) {
    fastify.route({
      method: 'GET',
      url: '/',
      handler: (req, reply) => {
        reply.send({ hello: 'world' })
      }
    })

    done()
  }, { prefix: '/prefix/' })

  fastify.inject({
    method: 'GET',
    url: '/prefix//'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    testDone()
  })
})

test('matches only /prefix  with a / route - prefixTrailingSlash: "no-slash", ignoreTrailingSlash: false', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify({
    routerOptions: {
      ignoreTrailingSlash: false
    }
  })

  fastify.register(function (fastify, opts, done) {
    fastify.route({
      method: 'GET',
      url: '/',
      prefixTrailingSlash: 'no-slash',
      handler: (req, reply) => {
        reply.send({ hello: 'world' })
      }
    })

    done()
  }, { prefix: '/prefix' })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/prefix'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/prefix/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload).statusCode).toEqual(404)
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('matches only /prefix  with a / route - prefixTrailingSlash: "no-slash", ignoreDuplicateSlashes: false', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify({
    routerOptions: {
      ignoreDuplicateSlashes: false
    }
  })

  fastify.register(function (fastify, opts, done) {
    fastify.route({
      method: 'GET',
      url: '/',
      prefixTrailingSlash: 'no-slash',
      handler: (req, reply) => {
        reply.send({ hello: 'world' })
      }
    })

    done()
  }, { prefix: '/prefix' })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/prefix'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/prefix/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload).statusCode).toEqual(404)
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('matches only /prefix/  with a / route - prefixTrailingSlash: "slash", ignoreTrailingSlash: false', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify({
    routerOptions: {
      ignoreTrailingSlash: false
    }
  })

  fastify.register(function (fastify, opts, done) {
    fastify.route({
      method: 'GET',
      url: '/',
      prefixTrailingSlash: 'slash',
      handler: (req, reply) => {
        reply.send({ hello: 'world' })
      }
    })

    done()
  }, { prefix: '/prefix' })

  const completion = waitForCb({ steps: 2 })
  fastify.inject({
    method: 'GET',
    url: '/prefix/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    completion.stepIn()
  })
  fastify.inject({
    method: 'GET',
    url: '/prefix'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload).statusCode).toEqual(404)
    completion.stepIn()
  })
  completion.patience.then(testDone)
})

test('calls onRoute only once when prefixing', async () => {
  expect.assertions(1)
  const fastify = Fastify({
    routerOptions: {
      ignoreTrailingSlash: false
    },
    exposeHeadRoutes: false
  })

  let onRouteCalled = 0
  fastify.register(function (fastify, opts, next) {
    fastify.addHook('onRoute', () => {
      onRouteCalled++
    })

    fastify.route({
      method: 'GET',
      url: '/',
      prefixTrailingSlash: 'both',
      handler: (req, reply) => {
        reply.send({ hello: 'world' })
      }
    })

    next()
  }, { prefix: '/prefix' })

  await fastify.ready()

  expect(onRouteCalled).toEqual(1)
})
