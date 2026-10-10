'use strict'


const Fastify = require('..')

test('Should register a host constrained route', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { host: 'fastify.dev' },
    handler: (req, reply) => {
      reply.send({ hello: 'world' })
    }
  })

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        host: 'fastify.dev'
      }
    })
    expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
    expect(res.statusCode).toBe(200)
  }

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        host: 'fastify.test'
      }
    })

    expect(res.statusCode).toBe(404)
  }

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/'
    })
    expect(res.statusCode).toBe(404)
  }
})

test('Should register the same route with host constraints', async () => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { host: 'fastify.dev' },
    handler: (req, reply) => {
      reply.send('fastify.dev')
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { host: 'fastify.test' },
    handler: (req, reply) => {
      reply.send('fastify.test')
    }
  })

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        host: 'fastify.dev'
      }
    })
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('fastify.dev')
  }

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        host: 'fastify.test'
      }
    })

    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('fastify.test')
  }

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        host: 'fancy.ca'
      }
    })
    expect(res.statusCode).toBe(404)
  }
})

test('Should allow registering custom constrained routes', async () => {
  expect.assertions(5)

  const constraint = {
    name: 'secret',
    storage: function () {
      const secrets = {}
      return {
        get: (secret) => { return secrets[secret] || null },
        set: (secret, store) => { secrets[secret] = store }
      }
    },
    deriveConstraint: (req, ctx) => {
      return req.headers['x-secret']
    },
    validate () { return true }
  }

  const fastify = Fastify({ constraints: { secret: constraint } })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'alpha' },
    handler: (req, reply) => {
      reply.send({ hello: 'from alpha' })
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'beta' },
    handler: (req, reply) => {
      reply.send({ hello: 'from beta' })
    }
  })

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        'X-Secret': 'alpha'
      }
    })
    expect(JSON.parse(res.payload)).toEqual({ hello: 'from alpha' })
    expect(res.statusCode).toBe(200)
  }

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        'X-Secret': 'beta'
      }
    })
    expect(JSON.parse(res.payload)).toEqual({ hello: 'from beta' })
    expect(res.statusCode).toBe(200)
  }

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        'X-Secret': 'gamma'
      }
    })
    expect(res.statusCode).toBe(404)
  }
})

test('Should allow registering custom constrained routes outside constructor', async () => {
  expect.assertions(5)

  const constraint = {
    name: 'secret',
    storage: function () {
      const secrets = {}
      return {
        get: (secret) => { return secrets[secret] || null },
        set: (secret, store) => { secrets[secret] = store }
      }
    },
    deriveConstraint: (req, ctx) => {
      return req.headers['x-secret']
    },
    validate () { return true }
  }

  const fastify = Fastify()
  fastify.addConstraintStrategy(constraint)

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'alpha' },
    handler: (req, reply) => {
      reply.send({ hello: 'from alpha' })
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'beta' },
    handler: (req, reply) => {
      reply.send({ hello: 'from beta' })
    }
  })

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        'X-Secret': 'alpha'
      }
    })

    expect(JSON.parse(res.payload)).toEqual({ hello: 'from alpha' })
    expect(res.statusCode).toBe(200)
  }

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        'X-Secret': 'beta'
      }
    })
    expect(JSON.parse(res.payload)).toEqual({ hello: 'from beta' })
    expect(res.statusCode).toBe(200)
  }

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        'X-Secret': 'gamma'
      }
    })
    expect(res.statusCode).toBe(404)
  }
})

test('Custom constrained routes registered also for HEAD method generated by fastify', (done) => {
  expect.assertions(3)

  const constraint = {
    name: 'secret',
    storage: function () {
      const secrets = {}
      return {
        get: (secret) => { return secrets[secret] || null },
        set: (secret, store) => { secrets[secret] = store }
      }
    },
    deriveConstraint: (req, ctx) => {
      return req.headers['x-secret']
    },
    validate () { return true }
  }

  const fastify = Fastify({ constraints: { secret: constraint } })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'mySecret' },
    handler: (req, reply) => {
      reply.send('from mySecret - my length is 31')
    }
  })

  fastify.inject({
    method: 'HEAD',
    url: '/',
    headers: {
      'X-Secret': 'mySecret'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['content-length']).toEqual('31')
    expect(res.statusCode).toBe(200)
    done()
  })
})

test('Custom constrained routes registered with addConstraintStrategy apply also for HEAD method generated by fastify', (done) => {
  expect.assertions(3)

  const constraint = {
    name: 'secret',
    storage: function () {
      const secrets = {}
      return {
        get: (secret) => { return secrets[secret] || null },
        set: (secret, store) => { secrets[secret] = store }
      }
    },
    deriveConstraint: (req, ctx) => {
      return req.headers['x-secret']
    },
    validate () { return true }
  }

  const fastify = Fastify()
  fastify.addConstraintStrategy(constraint)

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'mySecret' },
    handler: (req, reply) => {
      reply.send('from mySecret - my length is 31')
    }
  })

  fastify.inject({
    method: 'HEAD',
    url: '/',
    headers: {
      'X-Secret': 'mySecret'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['content-length']).toEqual('31')
    expect(res.statusCode).toBe(200)
    done()
  })
})

test('Add a constraint strategy after fastify instance was started', (done) => {
  expect.assertions(4)

  const constraint = {
    name: 'secret',
    storage: function () {
      const secrets = {}
      return {
        get: (secret) => { return secrets[secret] || null },
        set: (secret, store) => { secrets[secret] = store }
      }
    },
    deriveConstraint: (req, ctx) => {
      return req.headers['x-secret']
    },
    validate () { return true }
  }

  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    url: '/',
    handler: (req, reply) => { reply.send('ok') }
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toEqual('ok')
    expect(res.statusCode).toBe(200)

    expect(() => fastify.addConstraintStrategy(constraint)).toThrow()
    done()
  })
})

test('Add a constraint strategy should throw an error if there already exist custom strategy with the same name', async () => {
  expect.assertions(1)

  const constraint = {
    name: 'secret',
    storage: function () {
      const secrets = {}
      return {
        get: (secret) => { return secrets[secret] || null },
        set: (secret, store) => { secrets[secret] = store }
      }
    },
    deriveConstraint: (req, ctx) => {
      return req.headers['x-secret']
    },
    validate () { return true }
  }

  const fastify = Fastify()

  fastify.addConstraintStrategy(constraint)
  expect(() => fastify.addConstraintStrategy(constraint)).toThrow(/^There already exists a custom constraint with the name secret.$/)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Add a constraint strategy shouldn\'t throw an error if default constraint with the same name isn\'t used', async () => {
  expect.assertions(1)

  const constraint = {
    name: 'version',
    storage: function () {
      const secrets = {}
      return {
        get: (secret) => { return secrets[secret] || null },
        set: (secret, store) => { secrets[secret] = store }
      }
    },
    deriveConstraint: (req, ctx) => {
      return req.headers['x-secret']
    },
    validate () { return true }
  }

  const fastify = Fastify()
  fastify.addConstraintStrategy(constraint)

  expect(true).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Add a constraint strategy should throw an error if default constraint with the same name is used', async () => {
  expect.assertions(1)

  const constraint = {
    name: 'version',
    storage: function () {
      const secrets = {}
      return {
        get: (secret) => { return secrets[secret] || null },
        set: (secret, store) => { secrets[secret] = store }
      }
    },
    deriveConstraint: (req, ctx) => {
      return req.headers['x-secret']
    },
    validate () { return true }
  }

  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { version: '1.0.0' },
    handler: (req, reply) => {
      reply.send('ok')
    }
  })

  expect(() => fastify.addConstraintStrategy(constraint)).toThrow(/^There already exists a route with version constraint.$/)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('The hasConstraintStrategy should return false for default constraints until they are used', async () => {
  expect.assertions(6)

  const fastify = Fastify()

  expect(fastify.hasConstraintStrategy('version')).toBe(false)
  expect(fastify.hasConstraintStrategy('host')).toBe(false)

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { host: 'fastify.dev' },
    handler: (req, reply) => {
      reply.send({ hello: 'from any other domain' })
    }
  })

  expect(fastify.hasConstraintStrategy('version')).toBe(false)
  expect(fastify.hasConstraintStrategy('host')).toBe(true)

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { version: '1.0.0' },
    handler: (req, reply) => {
      reply.send({ hello: 'from any other domain' })
    }
  })

  expect(fastify.hasConstraintStrategy('version')).toBe(true)
  expect(fastify.hasConstraintStrategy('host')).toBe(true)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('The hasConstraintStrategy should return true if there already exist a custom constraint with the same name', async () => {
  expect.assertions(2)

  const constraint = {
    name: 'secret',
    storage: function () {
      const secrets = {}
      return {
        get: (secret) => { return secrets[secret] || null },
        set: (secret, store) => { secrets[secret] = store }
      }
    },
    deriveConstraint: (req, ctx) => {
      return req.headers['x-secret']
    },
    validate () { return true }
  }

  const fastify = Fastify()

  expect(fastify.hasConstraintStrategy('secret')).toBe(false)
  fastify.addConstraintStrategy(constraint)
  expect(fastify.hasConstraintStrategy('secret')).toBe(true)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Should allow registering an unconstrained route after a constrained route', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { host: 'fastify.dev' },
    handler: (req, reply) => {
      reply.send({ hello: 'from fastify.dev' })
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    handler: (req, reply) => {
      reply.send({ hello: 'from any other domain' })
    }
  })

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        host: 'fastify.dev'
      }
    })
    expect(JSON.parse(res.payload)).toEqual({ hello: 'from fastify.dev' })
    expect(res.statusCode).toBe(200)
  }

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        host: 'fastify.test'
      }
    })
    expect(JSON.parse(res.payload)).toEqual({ hello: 'from any other domain' })
    expect(res.statusCode).toBe(200)
  }
})

test('Should allow registering constrained routes in a prefixed plugin', (done) => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.register(async (scope, opts) => {
    scope.route({
      method: 'GET',
      constraints: { host: 'fastify.dev' },
      path: '/route',
      handler: (req, reply) => {
        reply.send({ ok: true })
      }
    })
  }, { prefix: '/prefix' })

  fastify.inject({
    method: 'GET',
    url: '/prefix/route',
    headers: {
      host: 'fastify.dev'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(JSON.parse(res.payload)).toEqual({ ok: true })
    expect(res.statusCode).toBe(200)
    done()
  })
})

test('Should allow registering a constrained GET route after a constrained HEAD route', (done) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.route({
    method: 'HEAD',
    url: '/',
    constraints: { host: 'fastify.dev' },
    handler: (req, reply) => {
      reply.header('content-type', 'text/plain')
      reply.send('custom HEAD response')
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { host: 'fastify.dev' },
    handler: (req, reply) => {
      reply.send({ hello: 'from any other domain' })
    }
  })

  fastify.inject({
    method: 'HEAD',
    url: '/',
    headers: {
      host: 'fastify.dev'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toEqual('custom HEAD response')
    expect(res.statusCode).toBe(200)
    done()
  })
})

test('Should allow registering a constrained GET route after an unconstrained HEAD route', (done) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.route({
    method: 'HEAD',
    url: '/',
    handler: (req, reply) => {
      reply.header('content-type', 'text/plain')
      reply.send('HEAD response: length is about 33')
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { host: 'fastify.dev' },
    handler: (req, reply) => {
      reply.header('content-type', 'text/plain')
      reply.send('Hello from constrains: length is about 41')
    }
  })

  fastify.inject({
    method: 'HEAD',
    url: '/',
    headers: {
      host: 'fastify.dev'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['content-length']).toEqual('41')
    expect(res.statusCode).toBe(200)
    done()
  })
})

test('Will not try to re-createprefixed HEAD route if it already exists and exposeHeadRoutes is true for constrained routes', async () => {
  expect.assertions(1)

  const fastify = Fastify({ exposeHeadRoutes: true })

  fastify.register((scope, opts, next) => {
    scope.route({
      method: 'HEAD',
      path: '/route',
      constraints: { host: 'fastify.dev' },
      handler: (req, reply) => {
        reply.header('content-type', 'text/plain')
        reply.send('custom HEAD response')
      }
    })
    scope.route({
      method: 'GET',
      path: '/route',
      constraints: { host: 'fastify.dev' },
      handler: (req, reply) => {
        reply.send({ ok: true })
      }
    })

    next()
  }, { prefix: '/prefix' })

  await fastify.ready()

  expect(true).toBeTruthy()
})

test('allows separate constrained and unconstrained HEAD routes', async () => {
  expect.assertions(1)

  const fastify = Fastify({ exposeHeadRoutes: true })

  fastify.register((scope, opts, next) => {
    scope.route({
      method: 'HEAD',
      path: '/route',
      handler: (req, reply) => {
        reply.header('content-type', 'text/plain')
        reply.send('unconstrained HEAD response')
      }
    })

    scope.route({
      method: 'HEAD',
      path: '/route',
      constraints: { host: 'fastify.dev' },
      handler: (req, reply) => {
        reply.header('content-type', 'text/plain')
        reply.send('constrained HEAD response')
      }
    })

    scope.route({
      method: 'GET',
      path: '/route',
      constraints: { host: 'fastify.dev' },
      handler: (req, reply) => {
        reply.send({ ok: true })
      }
    })

    next()
  }, { prefix: '/prefix' })

  await fastify.ready()

  expect(true).toBeTruthy()
})

test('allow async constraints', async () => {
  expect.assertions(5)

  const constraint = {
    name: 'secret',
    storage: function () {
      const secrets = {}
      return {
        get: (secret) => { return secrets[secret] || null },
        set: (secret, store) => { secrets[secret] = store }
      }
    },
    deriveConstraint: (req, ctx, done) => {
      done(null, req.headers['x-secret'])
    },
    validate () { return true }
  }

  const fastify = Fastify({ constraints: { secret: constraint } })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'alpha' },
    handler: (req, reply) => {
      reply.send({ hello: 'from alpha' })
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'beta' },
    handler: (req, reply) => {
      reply.send({ hello: 'from beta' })
    }
  })

  {
    const { statusCode, payload } = await fastify.inject({ method: 'GET', path: '/', headers: { 'X-Secret': 'alpha' } })
    expect(JSON.parse(payload)).toEqual({ hello: 'from alpha' })
    expect(statusCode).toBe(200)
  }
  {
    const { statusCode, payload } = await fastify.inject({ method: 'GET', path: '/', headers: { 'X-Secret': 'beta' } })
    expect(JSON.parse(payload)).toEqual({ hello: 'from beta' })
    expect(statusCode).toBe(200)
  }
  {
    const { statusCode } = await fastify.inject({ method: 'GET', path: '/', headers: { 'X-Secret': 'gamma' } })
    expect(statusCode).toBe(404)
  }
})

test('error in async constraints', async () => {
  expect.assertions(8)

  const constraint = {
    name: 'secret',
    storage: function () {
      const secrets = {}
      return {
        get: (secret) => { return secrets[secret] || null },
        set: (secret, store) => { secrets[secret] = store }
      }
    },
    deriveConstraint: (req, ctx, done) => {
      done(Error('kaboom'))
    },
    validate () { return true }
  }

  const fastify = Fastify({ constraints: { secret: constraint } })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'alpha' },
    handler: (req, reply) => {
      reply.send({ hello: 'from alpha' })
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'beta' },
    handler: (req, reply) => {
      reply.send({ hello: 'from beta' })
    }
  })

  {
    const { statusCode, payload } = await fastify.inject({ method: 'GET', path: '/', headers: { 'X-Secret': 'alpha' } })
    expect(JSON.parse(payload)).toEqual({ error: 'Internal Server Error', message: 'Unexpected error from async constraint', statusCode: 500 })
    expect(statusCode).toBe(500)
  }
  {
    const { statusCode, payload } = await fastify.inject({ method: 'GET', path: '/', headers: { 'X-Secret': 'beta' } })
    expect(JSON.parse(payload)).toEqual({ error: 'Internal Server Error', message: 'Unexpected error from async constraint', statusCode: 500 })
    expect(statusCode).toBe(500)
  }
  {
    const { statusCode, payload } = await fastify.inject({ method: 'GET', path: '/', headers: { 'X-Secret': 'gamma' } })
    expect(JSON.parse(payload)).toEqual({ error: 'Internal Server Error', message: 'Unexpected error from async constraint', statusCode: 500 })
    expect(statusCode).toBe(500)
  }
  {
    const { statusCode, payload } = await fastify.inject({ method: 'GET', path: '/' })
    expect(JSON.parse(payload)).toEqual({ error: 'Internal Server Error', message: 'Unexpected error from async constraint', statusCode: 500 })
    expect(statusCode).toBe(500)
  }
})

test('Allow regex constraints in routes', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { host: /.*\.fastify\.dev$/ },
    handler: (req, reply) => {
      reply.send({ hello: 'from fastify dev domain' })
    }
  })

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        host: 'dev.fastify.dev'
      }
    })
    expect(JSON.parse(res.payload)).toEqual({ hello: 'from fastify dev domain' })
    expect(res.statusCode).toBe(200)
  }

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        host: 'google.com'
      }
    })
    expect(res.statusCode).toBe(404)
  }
})

test('Should allow registering custom rotuerOptions constrained routes', async () => {
  expect.assertions(5)

  const constraint = {
    name: 'secret',
    storage: function () {
      const secrets = {}
      return {
        get: (secret) => { return secrets[secret] || null },
        set: (secret, store) => { secrets[secret] = store }
      }
    },
    deriveConstraint: (req, ctx) => {
      return req.headers['x-secret']
    },
    validate () { return true }
  }

  const fastify = Fastify({ routerOptions: { constraints: { secret: constraint } } })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'alpha' },
    handler: (req, reply) => {
      reply.send({ hello: 'from alpha' })
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'beta' },
    handler: (req, reply) => {
      reply.send({ hello: 'from beta' })
    }
  })

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        'X-Secret': 'alpha'
      }
    })
    expect(JSON.parse(res.payload)).toEqual({ hello: 'from alpha' })
    expect(res.statusCode).toBe(200)
  }

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        'X-Secret': 'beta'
      }
    })
    expect(JSON.parse(res.payload)).toEqual({ hello: 'from beta' })
    expect(res.statusCode).toBe(200)
  }

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/',
      headers: {
        'X-Secret': 'gamma'
      }
    })
    expect(res.statusCode).toBe(404)
  }
})

test('Custom rotuerOptions constrained routes registered also for HEAD method generated by fastify', (done) => {
  expect.assertions(3)

  const constraint = {
    name: 'secret',
    storage: function () {
      const secrets = {}
      return {
        get: (secret) => { return secrets[secret] || null },
        set: (secret, store) => { secrets[secret] = store }
      }
    },
    deriveConstraint: (req, ctx) => {
      return req.headers['x-secret']
    },
    validate () { return true }
  }

  const fastify = Fastify({ routerOptions: { constraints: { secret: constraint } } })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'mySecret' },
    handler: (req, reply) => {
      reply.send('from mySecret - my length is 31')
    }
  })

  fastify.inject({
    method: 'HEAD',
    url: '/',
    headers: {
      'X-Secret': 'mySecret'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['content-length']).toEqual('31')
    expect(res.statusCode).toBe(200)
    done()
  })
})

test('allow async rotuerOptions constraints', async () => {
  expect.assertions(5)

  const constraint = {
    name: 'secret',
    storage: function () {
      const secrets = {}
      return {
        get: (secret) => { return secrets[secret] || null },
        set: (secret, store) => { secrets[secret] = store }
      }
    },
    deriveConstraint: (req, ctx, done) => {
      done(null, req.headers['x-secret'])
    },
    validate () { return true }
  }

  const fastify = Fastify({ routerOptions: { constraints: { secret: constraint } } })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'alpha' },
    handler: (req, reply) => {
      reply.send({ hello: 'from alpha' })
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'beta' },
    handler: (req, reply) => {
      reply.send({ hello: 'from beta' })
    }
  })

  {
    const { statusCode, payload } = await fastify.inject({ method: 'GET', path: '/', headers: { 'X-Secret': 'alpha' } })
    expect(JSON.parse(payload)).toEqual({ hello: 'from alpha' })
    expect(statusCode).toBe(200)
  }
  {
    const { statusCode, payload } = await fastify.inject({ method: 'GET', path: '/', headers: { 'X-Secret': 'beta' } })
    expect(JSON.parse(payload)).toEqual({ hello: 'from beta' })
    expect(statusCode).toBe(200)
  }
  {
    const { statusCode } = await fastify.inject({ method: 'GET', path: '/', headers: { 'X-Secret': 'gamma' } })
    expect(statusCode).toBe(404)
  }
})

test('error in async rotuerOptions constraints', async () => {
  expect.assertions(8)

  const constraint = {
    name: 'secret',
    storage: function () {
      const secrets = {}
      return {
        get: (secret) => { return secrets[secret] || null },
        set: (secret, store) => { secrets[secret] = store }
      }
    },
    deriveConstraint: (req, ctx, done) => {
      done(Error('kaboom'))
    },
    validate () { return true }
  }

  const fastify = Fastify({ routerOptions: { constraints: { secret: constraint } } })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'alpha' },
    handler: (req, reply) => {
      reply.send({ hello: 'from alpha' })
    }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'beta' },
    handler: (req, reply) => {
      reply.send({ hello: 'from beta' })
    }
  })

  {
    const { statusCode, payload } = await fastify.inject({ method: 'GET', path: '/', headers: { 'X-Secret': 'alpha' } })
    expect(JSON.parse(payload)).toEqual({ error: 'Internal Server Error', message: 'Unexpected error from async constraint', statusCode: 500 })
    expect(statusCode).toBe(500)
  }
  {
    const { statusCode, payload } = await fastify.inject({ method: 'GET', path: '/', headers: { 'X-Secret': 'beta' } })
    expect(JSON.parse(payload)).toEqual({ error: 'Internal Server Error', message: 'Unexpected error from async constraint', statusCode: 500 })
    expect(statusCode).toBe(500)
  }
  {
    const { statusCode, payload } = await fastify.inject({ method: 'GET', path: '/', headers: { 'X-Secret': 'gamma' } })
    expect(JSON.parse(payload)).toEqual({ error: 'Internal Server Error', message: 'Unexpected error from async constraint', statusCode: 500 })
    expect(statusCode).toBe(500)
  }
  {
    const { statusCode, payload } = await fastify.inject({ method: 'GET', path: '/' })
    expect(JSON.parse(payload)).toEqual({ error: 'Internal Server Error', message: 'Unexpected error from async constraint', statusCode: 500 })
    expect(statusCode).toBe(500)
  }
})
