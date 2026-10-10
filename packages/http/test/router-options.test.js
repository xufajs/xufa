'use strict'

const split = require('split2')

const querystring = require('node:querystring')
const Fastify = require('..')
const {
  XUFA_ERR_BAD_URL,
  XUFA_ERR_MAX_PARAM_LENGTH,
  XUFA_ERR_ASYNC_CONSTRAINT
} = require('../lib/errors')

test('Should honor ignoreTrailingSlash option', async () => {
  expect.assertions(4)
  const fastify = Fastify({
    routerOptions: {
      ignoreTrailingSlash: true
    }
  })

  fastify.get('/test', (req, res) => {
    res.send('test')
  })

  let res = await fastify.inject('/test')
  expect(res.statusCode).toBe(200)
  expect(res.payload.toString()).toBe('test')

  res = await fastify.inject('/test/')
  expect(res.statusCode).toBe(200)
  expect(res.payload.toString()).toBe('test')
})

test('Should honor ignoreDuplicateSlashes option', async () => {
  expect.assertions(4)
  const fastify = Fastify({
    routerOptions: {
      ignoreDuplicateSlashes: true
    }
  })

  fastify.get('/test//test///test', (req, res) => {
    res.send('test')
  })

  let res = await fastify.inject('/test/test/test')
  expect(res.statusCode).toBe(200)
  expect(res.payload.toString()).toBe('test')

  res = await fastify.inject('/test//test///test')
  expect(res.statusCode).toBe(200)
  expect(res.payload.toString()).toBe('test')
})

test('Should honor ignoreTrailingSlash and ignoreDuplicateSlashes options', async () => {
  expect.assertions(4)
  const fastify = Fastify({
    routerOptions: {
      ignoreTrailingSlash: true,
      ignoreDuplicateSlashes: true
    }
  })

  fastify.get('/test//test///test', (req, res) => {
    res.send('test')
  })

  let res = await fastify.inject('/test/test/test/')
  expect(res.statusCode).toBe(200)
  expect(res.payload.toString()).toBe('test')

  res = await fastify.inject('/test//test///test//')
  expect(res.statusCode).toBe(200)
  expect(res.payload.toString()).toBe('test')
})

test('Should honor maxParamLength option', async () => {
  const fastify = Fastify({ maxParamLength: 10 })

  fastify.get('/test/:id', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/test/123456789'
  })
  expect(res.statusCode).toBe(200)

  const resError = await fastify.inject({
    method: 'GET',
    url: '/test/123456789abcd'
  })
  expect(resError.statusCode).toBe(414)
})

test('Should expose router options via getters on request and reply', (done) => {
  expect.assertions(9)
  const fastify = Fastify()
  const expectedSchema = {
    params: {
      type: 'object',
      properties: {
        id: { type: 'integer' }
      }
    }
  }

  fastify.get('/test/:id', {
    schema: expectedSchema
  }, (req, reply) => {
    expect(reply.routeOptions.config.url).toBe('/test/:id')
    expect(reply.routeOptions.config.method).toBe('GET')
    expect(req.routeOptions.schema).toEqual(expectedSchema)
    expect(typeof req.routeOptions.handler).toBe('function')
    expect(req.routeOptions.config.url).toBe('/test/:id')
    expect(req.routeOptions.config.method).toBe('GET')
    expect(req.is404).toBe(false)
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    method: 'GET',
    url: '/test/123456789'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(200)
    done()
  })
})

test('Should set is404 flag for unmatched paths', (done) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.setNotFoundHandler((req, reply) => {
    expect(req.is404).toBe(true)
    reply.code(404).send({ error: 'Not Found', message: 'Four oh for', statusCode: 404 })
  })

  fastify.inject({
    method: 'GET',
    url: '/nonexist/123456789'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(404)
    done()
  })
})

test('Should honor frameworkErrors option - XUFA_ERR_BAD_URL', (done) => {
  expect.assertions(3)
  const fastify = Fastify({
    frameworkErrors: function (err, req, res) {
      if (err instanceof XUFA_ERR_BAD_URL) {
        expect(true).toBeTruthy()
      } else {
        expect.fail()
      }
      res.send(`${err.message} - ${err.code}`)
    }
  })

  fastify.get('/test/:id', (req, res) => {
    res.send('{ hello: \'world\' }')
  })

  fastify.inject(
    {
      method: 'GET',
      url: '/test/%world'
    },
    (err, res) => {
      expect(err).toBeFalsy()
      expect(res.body).toBe('\'/test/%world\' is not a valid url component - XUFA_ERR_BAD_URL')
      done()
    }
  )
})

test('Should supply Fastify request to the logger in frameworkErrors wrapper - XUFA_ERR_BAD_URL', (done) => {
  expect.assertions(8)

  const REQ_ID = 'REQ-1234'
  const logStream = split(JSON.parse)

  const fastify = Fastify({
    frameworkErrors: function (err, req, res) {
      expect(req.id).toEqual(REQ_ID)
      expect(req.raw.httpVersion).toEqual('1.1')
      res.send(`${err.message} - ${err.code}`)
    },
    logger: {
      stream: logStream,
      serializers: {
        req (request) {
          expect(request.id).toEqual(REQ_ID)
          return { httpVersion: request.raw.httpVersion }
        }
      }
    },
    genReqId: () => REQ_ID
  })

  fastify.get('/test/:id', (req, res) => {
    res.send('{ hello: \'world\' }')
  })

  logStream.on('data', (json) => {
    expect(json.msg).toEqual('incoming request')
    expect(json.reqId).toEqual(REQ_ID)
    expect(json.req.httpVersion).toEqual('1.1')
  })

  fastify.inject(
    {
      method: 'GET',
      url: '/test/%world'
    },
    (err, res) => {
      expect(err).toBeFalsy()
      expect(res.body).toBe('\'/test/%world\' is not a valid url component - XUFA_ERR_BAD_URL')
      done()
    }
  )
})

test('Should honor frameworkErrors option - XUFA_ERR_MAX_PARAM_LENGTH', (done) => {
  expect.assertions(3)
  const fastify = Fastify({
    routerOptions: {
      maxParamLength: 1
    },
    frameworkErrors: function (err, req, res) {
      if (err instanceof XUFA_ERR_MAX_PARAM_LENGTH) {
        expect(true).toBeTruthy()
      } else {
        expect.fail()
      }
      res.send(`${err.message} - ${err.code}`)
    }
  })

  fastify.get('/test/:id', (req, res) => {
    res.send('{ hello: \'world\' }')
  })

  fastify.inject(
    {
      method: 'GET',
      url: '/test/123'
    },
    (err, res) => {
      expect(err).toBeFalsy()
      expect(res.body).toBe('\'/test/123\' is exceeding the max param length - XUFA_ERR_MAX_PARAM_LENGTH')
      done()
    }
  )
})

test('Should supply Fastify request to the logger in frameworkErrors wrapper - XUFA_ERR_MAX_PARAM_LENGTH', (done) => {
  expect.assertions(8)

  const REQ_ID = 'REQ-1234'
  const logStream = split(JSON.parse)

  const fastify = Fastify({
    routerOptions: {
      maxParamLength: 1
    },
    frameworkErrors: function (err, req, res) {
      expect(req.id).toEqual(REQ_ID)
      expect(req.raw.httpVersion).toEqual('1.1')
      res.send(`${err.message} - ${err.code}`)
    },
    logger: {
      stream: logStream,
      serializers: {
        req (request) {
          expect(request.id).toEqual(REQ_ID)
          return { httpVersion: request.raw.httpVersion }
        }
      }
    },
    genReqId: () => REQ_ID
  })

  fastify.get('/test/:id', (req, res) => {
    res.send('{ hello: \'world\' }')
  })

  logStream.on('data', (json) => {
    expect(json.msg).toEqual('incoming request')
    expect(json.reqId).toEqual(REQ_ID)
    expect(json.req.httpVersion).toEqual('1.1')
  })

  fastify.inject(
    {
      method: 'GET',
      url: '/test/123'
    },
    (err, res) => {
      expect(err).toBeFalsy()
      expect(res.body).toBe('\'/test/123\' is exceeding the max param length - XUFA_ERR_MAX_PARAM_LENGTH')
      done()
    }
  )
})

test('Should honor frameworkErrors option - XUFA_ERR_ASYNC_CONSTRAINT', (done) => {
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
    deriveConstraint: (req, ctx, done) => {
      done(Error('kaboom'))
    },
    validate () { return true }
  }

  const fastify = Fastify({
    frameworkErrors: function (err, req, res) {
      if (err instanceof XUFA_ERR_ASYNC_CONSTRAINT) {
        expect(true).toBeTruthy()
      } else {
        expect.fail()
      }
      res.send(`${err.message} - ${err.code}`)
    },
    constraints: { secret: constraint }
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'alpha' },
    handler: (req, reply) => {
      reply.send({ hello: 'from alpha' })
    }
  })

  fastify.inject(
    {
      method: 'GET',
      url: '/'
    },
    (err, res) => {
      expect(err).toBeFalsy()
      expect(res.body).toBe('Unexpected error from async constraint - XUFA_ERR_ASYNC_CONSTRAINT')
      done()
    }
  )
})

test('Should supply Fastify request to the logger in frameworkErrors wrapper - XUFA_ERR_ASYNC_CONSTRAINT', (done) => {
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

  const REQ_ID = 'REQ-1234'
  const logStream = split(JSON.parse)

  const fastify = Fastify({
    constraints: { secret: constraint },
    frameworkErrors: function (err, req, res) {
      expect(req.id).toEqual(REQ_ID)
      expect(req.raw.httpVersion).toEqual('1.1')
      res.send(`${err.message} - ${err.code}`)
    },
    logger: {
      stream: logStream,
      serializers: {
        req (request) {
          expect(request.id).toEqual(REQ_ID)
          return { httpVersion: request.raw.httpVersion }
        }
      }
    },
    genReqId: () => REQ_ID
  })

  fastify.route({
    method: 'GET',
    url: '/',
    constraints: { secret: 'alpha' },
    handler: (req, reply) => {
      reply.send({ hello: 'from alpha' })
    }
  })

  logStream.on('data', (json) => {
    expect(json.msg).toEqual('incoming request')
    expect(json.reqId).toEqual(REQ_ID)
    expect(json.req.httpVersion).toEqual('1.1')
  })

  fastify.inject(
    {
      method: 'GET',
      url: '/'
    },
    (err, res) => {
      expect(err).toBeFalsy()
      expect(res.body).toBe('Unexpected error from async constraint - XUFA_ERR_ASYNC_CONSTRAINT')
      done()
    }
  )
})

test('Should honor routerOptions.defaultRoute', async () => {
  expect.assertions(3)
  const fastify = Fastify({
    routerOptions: {
      defaultRoute: function (_, res) {
        expect('default route called').toBeTruthy()
        res.statusCode = 404
        res.end('default route')
      }
    }
  })

  const res = await fastify.inject('/')
  expect(res.statusCode).toBe(404)
  expect(res.payload).toBe('default route')
})

test('Should honor routerOptions.onBadUrl', async (ctx) => {
  expect.assertions(3)
  const fastify = Fastify({
    routerOptions: {
      defaultRoute: function (_, res) {
        ctx.asset.fail('default route should not be called')
      },
      onBadUrl: function (path, _, res) {
        expect('bad url called').toBeTruthy()
        res.statusCode = 400
        res.end(`Bad URL: ${path}`)
      }
    }
  })

  fastify.get('/hello/:id', (req, res) => {
    res.send({ hello: 'world' })
  })

  const res = await fastify.inject('/hello/%world')
  expect(res.statusCode).toBe(400)
  expect(res.payload).toBe('Bad URL: /hello/%world')
})

test('Should honor routerOptions.onBadUrl when no method tree exists', async () => {
  expect.assertions(3)
  const fastify = Fastify({
    routerOptions: {
      onBadUrl: function (path, _, res) {
        expect('bad url called').toBeTruthy()
        res.statusCode = 400
        res.end(`Bad URL: ${path}`)
      }
    }
  })

  fastify.get('/hello/:id', (req, res) => {
    res.send({ hello: 'world' })
  })

  const res = await fastify.inject({
    method: 'DELETE',
    url: '/hello/%world'
  })
  expect(res.statusCode).toBe(400)
  expect(res.payload).toBe('Bad URL: /hello/%world')
})

test('Should honor routerOptions.onMaxParamLength', async (ctx) => {
  expect.assertions(3)
  const fastify = Fastify({
    routerOptions: {
      defaultRoute: function (_, res) {
        ctx.asset.fail('default route should not be called')
      },
      maxParamLength: 10,
      onMaxParamLength: function (path, _, res) {
        expect('max param length called').toBeTruthy()
        res.statusCode = 414
        res.end(`URL: ${path}`)
      }
    }
  })

  fastify.get('/hello/:id', (req, res) => {
    res.send({ hello: 'world' })
  })

  const res = await fastify.inject('/hello/12345678901')
  expect(res.statusCode).toBe(414)
  expect(res.payload).toBe('URL: /hello/12345678901')
})

test('Should honor routerOptions.ignoreTrailingSlash', async () => {
  expect.assertions(4)
  const fastify = Fastify({
    routerOptions: {
      ignoreTrailingSlash: true
    }
  })

  fastify.get('/test', (req, res) => {
    res.send('test')
  })

  let res = await fastify.inject('/test')
  expect(res.statusCode).toBe(200)
  expect(res.payload.toString()).toBe('test')

  res = await fastify.inject('/test/')
  expect(res.statusCode).toBe(200)
  expect(res.payload.toString()).toBe('test')
})

test('Should honor routerOptions.ignoreDuplicateSlashes', async () => {
  expect.assertions(4)
  const fastify = Fastify({
    routerOptions: {
      ignoreDuplicateSlashes: true
    }
  })

  fastify.get('/test//test///test', (req, res) => {
    res.send('test')
  })

  let res = await fastify.inject('/test/test/test')
  expect(res.statusCode).toBe(200)
  expect(res.payload.toString()).toBe('test')

  res = await fastify.inject('/test//test///test')
  expect(res.statusCode).toBe(200)
  expect(res.payload.toString()).toBe('test')
})

test('Should honor routerOptions.ignoreTrailingSlash and routerOptions.ignoreDuplicateSlashes', async () => {
  expect.assertions(4)
  const fastify = Fastify({
    routerOptions: {
      ignoreTrailingSlash: true,
      ignoreDuplicateSlashes: true
    }
  })

  onTestFinished(() => fastify.close())

  fastify.get('/test//test///test', (req, res) => {
    res.send('test')
  })

  let res = await fastify.inject('/test/test/test/')
  expect(res.statusCode).toBe(200)
  expect(res.payload.toString()).toBe('test')

  res = await fastify.inject('/test//test///test//')
  expect(res.statusCode).toBe(200)
  expect(res.payload.toString()).toBe('test')
})

test('Should honor routerOptions.maxParamLength', async () => {
  const fastify = Fastify({
    routerOptions: {
      maxParamLength: 10
    }
  })

  fastify.get('/test/:id', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/test/123456789'
  })
  expect(res.statusCode).toBe(200)

  const resError = await fastify.inject({
    method: 'GET',
    url: '/test/123456789abcd'
  })
  expect(resError.statusCode).toBe(414)
})

test('Should honor routerOptions.allowUnsafeRegex', async () => {
  const fastify = Fastify({
    routerOptions: {
      allowUnsafeRegex: true
    }
  })

  fastify.get('/test/:id(([a-f0-9]{3},?)+)', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  let res = await fastify.inject({
    method: 'GET',
    url: '/test/bac,1ea'
  })
  expect(res.statusCode).toBe(200)

  res = await fastify.inject({
    method: 'GET',
    url: '/test/qwerty'
  })

  expect(res.statusCode).toBe(404)
})

test('Should honor routerOptions.caseSensitive', async () => {
  const fastify = Fastify({
    routerOptions: {
      caseSensitive: false
    }
  })

  fastify.get('/TeSt', (req, reply) => {
    reply.send('test')
  })

  let res = await fastify.inject({
    method: 'GET',
    url: '/test'
  })
  expect(res.statusCode).toBe(200)

  res = await fastify.inject({
    method: 'GET',
    url: '/tEsT'
  })
  expect(res.statusCode).toBe(200)

  res = await fastify.inject({
    method: 'GET',
    url: '/TEST'
  })
  expect(res.statusCode).toBe(200)
})

test('Should honor routerOptions.queryStringParser', async () => {
  expect.assertions(4)
  const fastify = Fastify({
    routerOptions:
    {
      querystringParser: function (str) {
        expect('custom query string parser called').toBeTruthy()
        return querystring.parse(str)
      }
    }
  })

  fastify.get('/test', (req, reply) => {
    expect(req.query.foo).toEqual('bar')
    expect(req.query.baz).toEqual('faz')
    reply.send('test')
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/test?foo=bar&baz=faz'
  })
  expect(res.statusCode).toBe(200)
})

test('Should honor routerOptions.useSemicolonDelimiter', async () => {
  expect.assertions(6)
  const fastify = Fastify({
    routerOptions: {
      useSemicolonDelimiter: true
    }
  })

  fastify.get('/test', (req, reply) => {
    expect(req.query.foo).toEqual('bar')
    expect(req.query.baz).toEqual('faz')
    reply.send('test')
  })

  // Support semicolon delimiter
  let res = await fastify.inject({
    method: 'GET',
    url: '/test;foo=bar&baz=faz'
  })
  expect(res.statusCode).toBe(200)

  // Support query string `?` delimiter
  res = await fastify.inject({
    method: 'GET',
    url: '/test?foo=bar&baz=faz'
  })
  expect(res.statusCode).toBe(200)
})

test('Should honor routerOptions.buildPrettyMeta', async () => {
  expect.assertions(10)
  const fastify = Fastify({
    routerOptions:
    {
      buildPrettyMeta: function (route) {
        expect('custom buildPrettyMeta called').toBeTruthy()
        return { metaKey: route.path }
      }
    }
  })

  fastify.get('/test', () => { })
  fastify.get('/test/hello', () => { })
  fastify.get('/testing', () => { })
  fastify.get('/testing/:param', () => { })
  fastify.put('/update', () => { })

  await fastify.ready()

  const result = fastify.printRoutes({ includeMeta: true })
  const expected = `\
└── /
    ├── test (GET, HEAD)
    │   • (metaKey) "/test"
    │   ├── /hello (GET, HEAD)
    │   │   • (metaKey) "/test/hello"
    │   └── ing (GET, HEAD)
    │       • (metaKey) "/testing"
    │       └── /
    │           └── :param (GET, HEAD)
    │               • (metaKey) "/testing/:param"
    └── update (PUT)
        • (metaKey) "/update"
`

  expect(result).toBe(expected)
})

test('Should honor routerOptions.queryStringParser over queryStringParser option', async () => {
  expect.assertions(4)
  const fastify = Fastify({
    queryStringParser: undefined,
    routerOptions:
    {
      querystringParser: function (str) {
        expect('custom query string parser called').toBeTruthy()
        return querystring.parse(str)
      }
    }
  })

  fastify.get('/test', (req, reply) => {
    expect(req.query.foo).toEqual('bar')
    expect(req.query.baz).toEqual('faz')
    reply.send('test')
  })

  const res = await fastify.inject({
    method: 'GET',
    url: '/test?foo=bar&baz=faz'
  })
  expect(res.statusCode).toBe(200)
})

test('Should support extra find-my-way options', async () => {
  expect.assertions(1)
  let run = false
  // Use a real upstream option from find-my-way
  const fastify = Fastify({
    routerOptions: {
      buildPrettyMeta: (route) => {
        run = true
        const cleanMeta = Object.assign({}, route.store)
        return cleanMeta
      }
    }
  })
  fastify.get('/', async () => ({ ok: true }))

  onTestFinished(() => fastify.close())

  await fastify.ready()
  fastify.printRoutes({ includeMeta: true })
  expect(run).toBe(true)
})

test('Should allow reusing a routerOptions object across instances', async () => {
  expect.assertions(1)

  const options = {
    routerOptions: {
      maxParamLength: 2048
    }
  }

  const app1 = Fastify(options)
  const app2 = Fastify(options)

  onTestFinished(() => Promise.all([
    app1.close(),
    app2.close()
  ]))

  const response = await app2.inject('/not-found')
  expect(response.statusCode).toBe(404)
})

test('Should not mutate user-provided routerOptions object', async () => {
  expect.assertions(4)

  const routerOptions = {
    maxParamLength: 2048
  }
  const options = { routerOptions }

  const app = Fastify(options)
  onTestFinished(() => app.close())

  await app.ready()

  expect(Object.keys(routerOptions)).toEqual(['maxParamLength'])
  expect(routerOptions.maxParamLength).toBe(2048)
  expect(routerOptions.defaultRoute).toBe(undefined)
  expect(routerOptions.onBadUrl).toBe(undefined)
})
