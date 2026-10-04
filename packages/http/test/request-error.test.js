'use strict'

const { connect } = require('node:net')

const Fastify = require('..')
const { kRequest } = require('../lib/symbols')
const split = require('split2')
const { Readable } = require('node:stream')
const { getServerUrl } = require('./helper')

test('default 400 on request error', (done) => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.post('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    simulate: {
      error: true
    },
    body: {
      text: '12345678901234567890123456789012345678901234567890'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Bad Request',
      message: 'Simulated',
      statusCode: 400
    })
    done()
  })
})

test('default 400 on request error with custom error handler', (done) => {
  expect.assertions(6)

  const fastify = Fastify()

  fastify.setErrorHandler(function (err, request, reply) {
    expect(typeof request).toBe('object')
    expect(request instanceof fastify[kRequest].parent).toBe(true)
    reply
      .code(err.statusCode)
      .type('application/json; charset=utf-8')
      .send(err)
  })

  fastify.post('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    simulate: {
      error: true
    },
    body: {
      text: '12345678901234567890123456789012345678901234567890'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Bad Request',
      message: 'Simulated',
      statusCode: 400
    })
    done()
  })
})

test('default clientError handler ignores ECONNRESET', (done) => {
  expect.assertions(3)

  let logs = ''
  let response = ''

  const fastify = Fastify({
    bodyLimit: 1,
    keepAliveTimeout: 100,
    logger: {
      level: 'trace',
      stream: {
        write () {
          logs += JSON.stringify(arguments)
        }
      }
    }
  })

  fastify.get('/', (request, reply) => {
    reply.send('OK')

    process.nextTick(() => {
      const error = new Error()
      error.code = 'ECONNRESET'

      fastify.server.emit('clientError', error, request.raw.socket)
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    expect(err).toBeFalsy()
    onTestFinished(() => fastify.close())

    const client = connect(fastify.server.address().port)

    client.on('data', chunk => {
      response += chunk.toString('utf-8')
    })

    client.on('end', () => {
      expect(response).toMatch(/^HTTP\/1.1 200 OK/)
      expect(logs).not.toBe(/ECONNRESET/)
      done()
    })

    client.resume()
    client.write('GET / HTTP/1.1\r\n')
    client.write('Host: fastify.test\r\n')
    client.write('Connection: close\r\n')
    client.write('\r\n\r\n')
  })
})

test('default clientError handler ignores sockets in destroyed state', async () => {
  expect.assertions(1)

  const fastify = Fastify({
    bodyLimit: 1,
    keepAliveTimeout: 100
  })
  fastify.server.on('clientError', () => {
    // this handler is called after default handler, so we can make sure end was not called
    expect('end should not be called').toBeTruthy()
  })
  fastify.server.emit('clientError', new Error(), {
    destroyed: true,
    end () {
      expect.fail('end should not be called')
    },
    destroy () {
      expect.fail('destroy should not be called')
    }
  })

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('default clientError handler destroys sockets in writable state', async () => {
  expect.assertions(2)

  const fastify = Fastify({
    bodyLimit: 1,
    keepAliveTimeout: 100
  })

  fastify.server.emit('clientError', new Error(), {
    destroyed: false,
    writable: true,
    encrypted: true,
    end () {
      expect.fail('end should not be called')
    },
    destroy () {
      expect('destroy should be called').toBeTruthy()
    },
    write (response) {
      expect(response).toMatch(/^HTTP\/1.1 400 Bad Request/)
    }
  })

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('default clientError handler destroys http sockets in non-writable state', async () => {
  expect.assertions(1)

  const fastify = Fastify({
    bodyLimit: 1,
    keepAliveTimeout: 100
  })

  fastify.server.emit('clientError', new Error(), {
    destroyed: false,
    writable: false,
    end () {
      expect.fail('end should not be called')
    },
    destroy () {
      expect('destroy should be called').toBeTruthy()
    },
    write (response) {
      expect.fail('write should not be called')
    }
  })

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('error handler binding', (done) => {
  expect.assertions(5)

  const fastify = Fastify()

  fastify.setErrorHandler(function (err, request, reply) {
    expect(this).toBe(fastify)
    reply
      .code(err.statusCode)
      .type('application/json; charset=utf-8')
      .send(err)
  })

  fastify.post('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    simulate: {
      error: true
    },
    body: {
      text: '12345678901234567890123456789012345678901234567890'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Bad Request',
      message: 'Simulated',
      statusCode: 400
    })
    done()
  })
})

test('encapsulated error handler binding', (done) => {
  expect.assertions(7)

  const fastify = Fastify()

  fastify.register(function (app, opts, done) {
    app.decorate('hello', 'world')
    expect(app.hello).toBe('world')
    app.post('/', function (req, reply) {
      reply.send({ hello: 'world' })
    })
    app.setErrorHandler(function (err, request, reply) {
      expect(this.hello).toBe('world')
      reply
        .code(err.statusCode)
        .type('application/json; charset=utf-8')
        .send(err)
    })
    done()
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    simulate: {
      error: true
    },
    body: {
      text: '12345678901234567890123456789012345678901234567890'
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(res.json()).toEqual({
      error: 'Bad Request',
      message: 'Simulated',
      statusCode: 400
    })
    expect(fastify.hello).toBe(undefined)
    done()
  })
})

test('default clientError replies with bad request on reused keep-alive connection', (done) => {
  expect.assertions(2)

  let response = ''

  const fastify = Fastify({
    bodyLimit: 1,
    keepAliveTimeout: 100
  })

  fastify.get('/', (request, reply) => {
    reply.send('OK\n')
  })

  fastify.listen({ port: 0 }, function (err) {
    expect(err).toBeFalsy()
    fastify.server.unref()

    const client = connect(fastify.server.address().port)

    client.on('data', chunk => {
      response += chunk.toString('utf-8')
    })

    client.on('end', () => {
      expect(response).toMatch(/^HTTP\/1.1 200 OK.*HTTP\/1.1 400 Bad Request/s)
      done()
    })

    client.resume()
    client.write('GET / HTTP/1.1\r\n')
    client.write('Host: fastify.test\r\n')
    client.write('\r\n\r\n')
    client.write('GET /?a b HTTP/1.1\r\n')
    client.write('Host: fastify.test\r\n')
    client.write('Connection: close\r\n')
    client.write('\r\n\r\n')
  })
})

test('non-numeric content-length is rejected before Fastify body parsing', (done) => {
  expect.assertions(3)

  let response = ''

  const fastify = Fastify({
    bodyLimit: 1,
    keepAliveTimeout: 100
  })

  fastify.post('/', () => {
    expect.fail('handler should not be called')
  })

  fastify.listen({ port: 0 }, function (err) {
    expect(err).toBeFalsy()
    onTestFinished(() => fastify.close())

    const client = connect(fastify.server.address().port)

    client.on('data', chunk => {
      response += chunk.toString('utf-8')
    })

    client.on('end', () => {
      expect(response).toMatch(/^HTTP\/1.1 400 Bad Request/)
      expect(response).toMatch(/"message":"Client Error"/)
      done()
    })

    client.resume()
    client.write('POST / HTTP/1.1\r\n')
    client.write('Host: example.com\r\n')
    client.write('Content-Type: text/plain\r\n')
    client.write('Content-Length: abc\r\n')
    client.write('Connection: close\r\n')
    client.write('\r\n')
    client.write('x'.repeat(32))
  })
})

test('request.routeOptions.method is an uppercase string /1', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  const handler = function (req, res) {
    expect('POST').toBe(req.routeOptions.method)
    res.send({})
  }

  fastify.post('/', {
    bodyLimit: 1000,
    handler
  })
  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  })
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
})

test('request.routeOptions.method is an uppercase string /2', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  const handler = function (req, res) {
    expect('POST').toBe(req.routeOptions.method)
    res.send({})
  }

  fastify.route({
    url: '/',
    method: 'POST',
    bodyLimit: 1000,
    handler
  })
  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  })
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
})

test('request.routeOptions.method is an uppercase string /3', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  const handler = function (req, res) {
    expect('POST').toBe(req.routeOptions.method)
    res.send({})
  }

  fastify.route({
    url: '/',
    method: 'pOSt',
    bodyLimit: 1000,
    handler
  })
  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  })
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
})

test('request.routeOptions.method is an array with uppercase string', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  const handler = function (req, res) {
    expect(['POST']).toEqual(req.routeOptions.method)
    res.send({})
  }

  fastify.route({
    url: '/',
    method: ['pOSt'],
    bodyLimit: 1000,
    handler
  })
  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  })
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
})

test('test request.routeOptions.version', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.route({
    method: 'POST',
    url: '/version',
    constraints: { version: '1.2.0' },
    handler: function (request, reply) {
      expect('1.2.0').toBe(request.routeOptions.version)
      reply.send({})
    }
  })

  fastify.route({
    method: 'POST',
    url: '/version-undefined',
    handler: function (request, reply) {
      expect(undefined).toBe(request.routeOptions.version)
      reply.send({})
    }
  })
  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result1 = await fetch(fastifyServer + '/version', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Version': '1.2.0' },
    body: JSON.stringify([])
  })
  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)

  const result2 = await fetch(fastifyServer + '/version-undefined', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([])
  })
  expect(result2.ok).toBeTruthy()
  expect(result2.status).toBe(200)
})

test('customErrorHandler should throw for json err and stream response', async () => {
  expect.assertions(5)

  const logStream = split(JSON.parse)
  const fastify = Fastify({
    logger: {
      stream: logStream,
      level: 'error'
    }
  })
  onTestFinished(() => fastify.close())

  fastify.get('/', async (req, reply) => {
    const stream = new Readable({
      read () {
        this.push('hello')
      }
    })
    process.nextTick(() => stream.destroy(new Error('stream error')))

    reply.type('application/text')
    await reply.send(stream)
  })

  fastify.setErrorHandler((err, req, reply) => {
    expect(err.message).toBe('stream error')
    reply.code(400)
    reply.send({ error: err.message })
  })

  logStream.once('data', line => {
    expect(line.msg).toBe('Attempted to send payload of invalid type \'object\'. Expected a string or Buffer.')
    expect(line.level).toBe(50)
  })

  await fastify.listen({ port: 0 })

  const response = await fetch(getServerUrl(fastify) + '/')

  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ statusCode: 500, code: 'XUFA_ERR_REP_INVALID_PAYLOAD_TYPE', error: 'Internal Server Error', message: "Attempted to send payload of invalid type 'object'. Expected a string or Buffer." })
})

test('customErrorHandler should not throw for json err and stream response with content-type defined', async () => {
  expect.assertions(4)

  const logStream = split(JSON.parse)
  const fastify = Fastify({
    logger: {
      stream: logStream,
      level: 'error'
    }
  })

  onTestFinished(() => fastify.close())

  fastify.get('/', async (req, reply) => {
    const stream = new Readable({
      read () {
        this.push('hello')
      }
    })
    process.nextTick(() => stream.destroy(new Error('stream error')))

    reply.type('application/text')
    await reply.send(stream)
  })

  fastify.setErrorHandler((err, req, reply) => {
    expect(err.message).toBe('stream error')
    reply
      .code(400)
      .type('application/json')
      .send({ error: err.message })
  })

  await fastify.listen({ port: 0 })

  const response = await fetch(getServerUrl(fastify) + '/')

  expect(response.status).toBe(400)
  expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
  expect(await response.json()).toEqual({ error: 'stream error' })
})

test('customErrorHandler should not call handler for in-stream error', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', async (req, reply) => {
    const stream = new Readable({
      read () {
        this.push('hello')
        stream.destroy(new Error('stream error'))
      }
    })

    reply.type('application/text')
    await reply.send(stream)
  })

  fastify.setErrorHandler(() => {
    expect.fail('must not be called')
  })
  await fastify.listen({ port: 0 })

  await expect(fetch(getServerUrl(fastify) + '/')).rejects.toThrow(expect.objectContaining({ message: 'fetch failed' }))
})
