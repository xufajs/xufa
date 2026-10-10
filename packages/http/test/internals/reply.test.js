'use strict'


const http = require('node:http')
const NotFound = require('http-errors').NotFound
const Request = require('../../lib/request')
const Reply = require('../../lib/reply')
const { LogController } = require('../../lib/logger')
const Fastify = require('../..')
const { Readable, Writable } = require('node:stream')
const {
  kReplyErrorHandlerCalled,
  kReplyHeaders,
  kReplySerializer,
  kReplyIsError,
  kReplySerializerDefault,
  kRouteContext,
  kLogController
} = require('../../lib/symbols')
const fs = require('node:fs')
const path = require('node:path')

const doGet = async function (url) {
  const result = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    keepAlive: false
  })

  return {
    response: result,
    body: await result.json().catch(() => undefined)
  }
}

test('Once called, Reply should return an object with methods', async () => {
  expect.assertions(16)
  const response = { res: 'res', getHeader: () => undefined }
  const context = {
    config: { onSend: [] },
    schema: {},
    _parserOptions: {},
    server: { hasConstraintStrategy: () => false, initialConfig: {} }
  }
  const request = new Request(null, null, null, null, null, context)
  const reply = new Reply(response, request)
  expect(typeof reply).toBe('object')
  expect(typeof reply[kReplyIsError]).toBe('boolean')
  expect(typeof reply[kReplyErrorHandlerCalled]).toBe('boolean')
  expect(typeof reply.send).toBe('function')
  expect(typeof reply.code).toBe('function')
  expect(typeof reply.mediaType).toBe('undefined')
  expect(typeof reply.status).toBe('function')
  expect(typeof reply.header).toBe('function')
  expect(typeof reply.serialize).toBe('function')
  expect(typeof reply[kReplyHeaders]).toBe('object')
  expect(reply.raw).toEqual(response)
  expect(reply[kRouteContext]).toBe(context)
  expect(reply.routeOptions.config).toBe(context.config)
  expect(reply.routeOptions.schema).toBe(context.schema)
  expect(reply.request).toBe(request)
  // Aim to not bad property keys (including Symbols)
  expect('undefined' in reply).toBeFalsy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('reply.send will logStream error and destroy the stream', async () => {
  expect.assertions(1)
  let destroyCalled
  const payload = new Readable({
    read () { },
    destroy (err, cb) {
      destroyCalled = true
      cb(err)
    }
  })

  const response = new Writable()
  Object.assign(response, {
    setHeader: () => { },
    hasHeader: () => false,
    getHeader: () => undefined,
    writeHead: () => { },
    write: () => { },
    headersSent: true
  })

  const log = {
    warn: () => { }
  }

  const fakeRequest = {
    [kRouteContext]: {
      onSend: null,
      server: { [kLogController]: new LogController() }
    }
  }

  const reply = new Reply(response, fakeRequest, log)
  reply.send(payload)
  payload.destroy(new Error('stream error'))

  expect(destroyCalled).toBe(true)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('reply.send throw with circular JSON', async () => {
  expect.assertions(1)
  const response = {
    setHeader: () => { },
    hasHeader: () => false,
    getHeader: () => undefined,
    writeHead: () => { },
    write: () => { },
    end: () => { }
  }
  const reply = new Reply(response, { [kRouteContext]: { onSend: [] } })
  expect(() => {
    const obj = {}
    obj.obj = obj
    reply.send(JSON.stringify(obj))
  }).toThrow()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('reply.send returns itself', async () => {
  expect.assertions(1)
  const response = {
    setHeader: () => { },
    hasHeader: () => false,
    getHeader: () => undefined,
    writeHead: () => { },
    write: () => { },
    end: () => { }
  }
  const reply = new Reply(response, { [kRouteContext]: { onSend: [] } })
  expect(reply.send('hello')).toBe(reply)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('reply.serializer should set a custom serializer', async () => {
  expect.assertions(2)
  const reply = new Reply(null, null, null)
  expect(reply[kReplySerializer]).toBe(null)
  reply.serializer('serializer')
  expect(reply[kReplySerializer]).toBe('serializer')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('reply.serializer should support running preSerialization hooks', (done) => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.addHook('preSerialization', async (request, reply, payload) => { expect('called').toBeTruthy() })
  fastify.route({
    method: 'GET',
    url: '/',
    handler: (req, reply) => {
      reply
        .type('application/json')
        .serializer(JSON.stringify)
        .send({ foo: 'bar' })
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('{"foo":"bar"}')
    done()
  })
})

test('reply.serialize should serialize payload', async () => {
  expect.assertions(1)
  const response = { statusCode: 200 }
  const context = {}
  const reply = new Reply(response, { [kRouteContext]: context })
  expect(reply.serialize({ foo: 'bar' })).toBe('{"foo":"bar"}')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('reply.serialize should serialize payload with a custom serializer', async () => {
  expect.assertions(2)
  let customSerializerCalled = false
  const response = { statusCode: 200 }
  const context = {}
  const reply = new Reply(response, { [kRouteContext]: context })
  reply.serializer((x) => (customSerializerCalled = true) && JSON.stringify(x))
  expect(reply.serialize({ foo: 'bar' })).toBe('{"foo":"bar"}')
  expect(customSerializerCalled).toBe(true)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('reply.serialize should serialize payload with a context default serializer', async () => {
  expect.assertions(2)
  let customSerializerCalled = false
  const response = { statusCode: 200 }
  const context = { [kReplySerializerDefault]: (x) => (customSerializerCalled = true) && JSON.stringify(x) }
  const reply = new Reply(response, { [kRouteContext]: context })
  expect(reply.serialize({ foo: 'bar' })).toBe('{"foo":"bar"}')
  expect(customSerializerCalled).toBe(true)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('reply.serialize should serialize payload with Fastify instance', (done) => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  fastify.route({
    method: 'GET',
    url: '/',
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            foo: { type: 'string' }
          }
        }
      }
    },
    handler: (req, reply) => {
      reply.send(
        reply.serialize({ foo: 'bar' })
      )
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('{"foo":"bar"}')
    done()
  })
})

describe('within an instance', () => {
let fastifyServer;
const fastify = Fastify()
afterAll(() => fastify.close())
fastify.get('/', function (req, reply) {
    reply.code(200)
    reply.header('Content-Type', 'text/plain')
    reply.send('hello world!')
  })
fastify.get('/auto-type', function (req, reply) {
    reply.code(200)
    reply.type('text/plain')
    reply.send('hello world!')
  })
fastify.get('/auto-status-code', function (req, reply) {
    reply.send('hello world!')
  })
fastify.get('/redirect', function (req, reply) {
    reply.redirect('/')
  })
fastify.get('/redirect-async', async function (req, reply) {
    return reply.redirect('/')
  })
fastify.get('/redirect-code', function (req, reply) {
    reply.redirect('/', 301)
  })
fastify.get('/redirect-code-before-call', function (req, reply) {
    reply.code(307).redirect('/')
  })
fastify.get('/redirect-code-before-call-overwrite', function (req, reply) {
    reply.code(307).redirect('/', 302)
  })
fastify.get('/custom-serializer', function (req, reply) {
    reply.code(200)
    reply.type('text/plain')
    reply.serializer(function (body) {
      return require('node:querystring').stringify(body)
    })
    reply.send({ hello: 'world!' })
  })
fastify.register(function (instance, options, done) {
    fastify.addHook('onSend', function (req, reply, payload, done) {
      reply.header('x-onsend', 'yes')
      done()
    })
    fastify.get('/redirect-onsend', function (req, reply) {
      reply.redirect('/')
    })
    done()
  })
beforeAll(async () => {
fastifyServer = await fastify.listen({ port: 0 });
})
test('custom serializer should be used', async () => {
    expect.assertions(3)
    const result = await fetch(fastifyServer + '/custom-serializer')
    expect(result.ok).toBeTruthy()
    expect(result.headers.get('content-type')).toBe('text/plain')
    expect(await result.text()).toEqual('hello=world!')
  })
test('status code and content-type should be correct', async () => {
    expect.assertions(3)
    const result = await fetch(fastifyServer)
    expect(result.ok).toBeTruthy()
    expect(result.headers.get('content-type')).toBe('text/plain')
    expect(await result.text()).toEqual('hello world!')
  })
test('auto status code should be 200', async () => {
    expect.assertions(3)
    const result = await fetch(fastifyServer + '/auto-status-code')
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    expect(await result.text()).toEqual('hello world!')
  })
test('auto type should be text/plain', async () => {
    expect.assertions(3)
    const result = await fetch(fastifyServer + '/auto-type')
    expect(result.ok).toBeTruthy()
    expect(result.headers.get('content-type')).toBe('text/plain')
    expect(await result.text()).toEqual('hello world!')
  })
test('redirect to `/` - 1', (done) => {
    expect.assertions(1)

    http.get(fastifyServer + '/redirect', function (response) {
      expect(response.statusCode).toBe(302)
      done()
    })
  })
test('redirect to `/` - 2', (done) => {
    expect.assertions(1)

    http.get(fastifyServer + '/redirect-code', function (response) {
      expect(response.statusCode).toBe(301)
      done()
    })
  })
test('redirect to `/` - 3', async () => {
    expect.assertions(4)
    const result = await fetch(fastifyServer + '/redirect')
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    expect(result.headers.get('content-type')).toBe('text/plain')
    expect(await result.text()).toEqual('hello world!')
  })
test('redirect to `/` - 4', async () => {
    expect.assertions(4)
    const result = await fetch(fastifyServer + '/redirect-code')
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    expect(result.headers.get('content-type')).toBe('text/plain')
    expect(await result.text()).toEqual('hello world!')
  })
test('redirect to `/` - 5', (done) => {
    expect.assertions(3)
    const url = fastifyServer + '/redirect-onsend'
    http.get(url, (response) => {
      expect(response.headers['x-onsend']).toBe('yes')
      expect(response.headers['content-length']).toBe('0')
      expect(response.headers.location).toBe('/')
      done()
    })
  })
test('redirect to `/` - 6', async () => {
    expect.assertions(4)
    const result = await fetch(fastifyServer + '/redirect-code-before-call')
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    expect(result.headers.get('content-type')).toBe('text/plain')
    expect(await result.text()).toEqual('hello world!')
  })
test('redirect to `/` - 7', async () => {
    expect.assertions(4)
    const result = await fetch(fastifyServer + '/redirect-code-before-call-overwrite')
    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    expect(result.headers.get('content-type')).toBe('text/plain')
    expect(await result.text()).toEqual('hello world!')
  })
test('redirect to `/` - 8', (done) => {
    expect.assertions(1)

    http.get(fastifyServer + '/redirect-code-before-call', function (response) {
      expect(response.statusCode).toBe(307)
      done()
    })
  })
test('redirect to `/` - 9', (done) => {
    expect.assertions(1)

    http.get(fastifyServer + '/redirect-code-before-call-overwrite', function (response) {
      expect(response.statusCode).toBe(302)
      done()
    })
  })
test('redirect with async function to `/` - 10', (done) => {
    expect.assertions(1)

    http.get(fastifyServer + '/redirect-async', function (response) {
      expect(response.statusCode).toBe(302)
      done()
    })
  })
})

test('buffer without content type should send a application/octet-stream and raw buffer', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.send(Buffer.alloc(1024))
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.headers.get('content-type')).toBe('application/octet-stream')
  expect(Buffer.from(await result.arrayBuffer())).toEqual(Buffer.alloc(1024))
})

test('Uint8Array without content type should send a application/octet-stream and raw buffer', (done) => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.send(new Uint8Array(1024).fill(0xff))
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    onTestFinished(() => fastify.close())

    fastify.inject({
      method: 'GET',
      url: '/'
    }, (err, response) => {
      expect(err).toBeFalsy()
      expect(response.headers['content-type']).toBe('application/octet-stream')
      expect(new Uint8Array(response.rawPayload)).toEqual(new Uint8Array(1024).fill(0xff))
      done()
    })
  })
})
test('Uint16Array without content type should send a application/octet-stream and raw buffer', (done) => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.send(new Uint16Array(50).fill(0xffffffff))
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    onTestFinished(() => fastify.close())

    fastify.inject({
      method: 'GET',
      url: '/'
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.headers['content-type']).toBe('application/octet-stream')
      expect(new Uint16Array(
          res.rawPayload.buffer,
          res.rawPayload.byteOffset,
          res.rawPayload.byteLength / Uint16Array.BYTES_PER_ELEMENT
        )).toEqual(new Uint16Array(50).fill(0xffffffff))
      done()
    })
  })
})
test('TypedArray with content type should not send application/octet-stream', (done) => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.header('Content-Type', 'text/plain')
    reply.send(new Uint16Array(1024).fill(0xffffffff))
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    onTestFinished(() => fastify.close())

    fastify.inject({
      method: 'GET',
      url: '/'
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.headers['content-type']).toBe('text/plain')
      expect(new Uint16Array(
          res.rawPayload.buffer,
          res.rawPayload.byteOffset,
          res.rawPayload.byteLength / Uint16Array.BYTES_PER_ELEMENT
        )).toEqual(new Uint16Array(1024).fill(0xffffffff))
      done()
    })
  })
})
test('buffer with content type should not send application/octet-stream', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.header('Content-Type', 'text/plain')
    reply.send(Buffer.alloc(1024))
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.headers.get('content-type')).toBe('text/plain')
  expect(Buffer.from(await result.arrayBuffer())).toEqual(Buffer.alloc(1024))
})

test('stream with content type should not send application/octet-stream', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  const streamPath = path.join(__dirname, '..', '..', 'package.json')
  const stream = fs.createReadStream(streamPath)
  const buf = fs.readFileSync(streamPath)

  fastify.get('/', function (req, reply) {
    reply.header('Content-Type', 'text/plain').send(stream)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.headers.get('content-type')).toBe('text/plain')
  expect(Buffer.from(await result.arrayBuffer())).toEqual(buf)
})

test('stream without content type should not send application/octet-stream', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  const stream = fs.createReadStream(__filename)
  const buf = fs.readFileSync(__filename)

  fastify.get('/', function (req, reply) {
    reply.send(stream)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.headers.get('content-type')).toBe(null)
  expect(Buffer.from(await result.arrayBuffer())).toEqual(buf)
})

test('stream using reply.raw.writeHead should return customize headers', async () => {
  expect.assertions(5)

  const fastify = Fastify()
  const fs = require('node:fs')
  const path = require('node:path')

  const streamPath = path.join(__dirname, '..', '..', 'package.json')
  const stream = fs.createReadStream(streamPath)
  const buf = fs.readFileSync(streamPath)

  fastify.get('/', function (req, reply) {
    reply.log.warn = function mockWarn (message) {
      expect(message).toBe('response will send, but you shouldn\'t use res.writeHead in stream mode')
    }
    reply.raw.writeHead(200, {
      location: '/'
    })
    reply.send(stream)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.headers.get('location')).toBe('/')
  expect(result.headers.get('content-type')).toBe(null)
  expect(Buffer.from(await result.arrayBuffer())).toEqual(buf)
})

test('plain string without content type should send a text/plain', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.send('hello world!')
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  expect(await result.text()).toEqual('hello world!')
})

test('plain string with content type should be sent unmodified', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.type('text/css').send('hello world!')
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.headers.get('content-type')).toBe('text/css')
  expect(await result.text()).toEqual('hello world!')
})

test('plain string with content type and custom serializer should be serialized', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply
      .serializer(() => 'serialized')
      .type('text/css')
      .send('hello world!')
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.headers.get('content-type')).toBe('text/css')
  expect(await result.text()).toEqual('serialized')
})

test('plain string with content type application/json should NOT be serialized as json', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.type('application/json').send('{"key": "hello world!"}')
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.headers.get('content-type')).toBe('application/json; charset=utf-8')
  expect(await result.text()).toEqual('{"key": "hello world!"}')
})

test('plain string with custom json content type should NOT be serialized as json', async () => {
  expect.assertions(18)

  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  const customSamples = {
    collectionjson: {
      mimeType: 'application/vnd.collection+json',
      sample: '{"collection":{"version":"1.0","href":"http://api.fastify.test/people/"}}'
    },
    hal: {
      mimeType: 'application/hal+json',
      sample: '{"_links":{"self":{"href":"https://api.fastify.test/people/1"}},"name":"John Doe"}'
    },
    jsonapi: {
      mimeType: 'application/vnd.api+json',
      sample: '{"data":{"type":"people","id":"1"}}'
    },
    jsonld: {
      mimeType: 'application/ld+json',
      sample: '{"@context":"https://json-ld.org/contexts/person.jsonld","name":"John Doe"}'
    },
    ndjson: {
      mimeType: 'application/x-ndjson',
      sample: '{"a":"apple","b":{"bb":"bubble"}}\n{"c":"croissant","bd":{"dd":"dribble"}}'
    },
    siren: {
      mimeType: 'application/vnd.siren+json',
      sample: '{"class":"person","properties":{"name":"John Doe"}}'
    }
  }

  Object.keys(customSamples).forEach((path) => {
    fastify.get(`/${path}`, function (req, reply) {
      reply.type(customSamples[path].mimeType).send(customSamples[path].sample)
    })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  await Promise.all(Object.keys(customSamples).map(async path => {
    const result = await fetch(fastifyServer + '/' + path)
    expect(result.ok).toBeTruthy()
    expect(result.headers.get('content-type')).toBe(customSamples[path].mimeType + '; charset=utf-8')
    expect(await result.text()).toEqual(customSamples[path].sample)
  }))
})

test('non-string with content type application/json SHOULD be serialized as json', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.type('application/json').send({ key: 'hello world!' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.headers.get('content-type')).toBe('application/json; charset=utf-8')
  expect(await result.text()).toEqual(JSON.stringify({ key: 'hello world!' }))
})

test('non-string with custom json\'s content-type SHOULD be serialized as json', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.type('application/json; version=2; ').send({ key: 'hello world!' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.headers.get('content-type')).toBe('application/json; version="2"; charset=utf-8')
  expect(await result.text()).toEqual(JSON.stringify({ key: 'hello world!' }))
})

test('non-string with custom json content type SHOULD be serialized as json', async () => {
  expect.assertions(15)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  const customSamples = {
    collectionjson: {
      mimeType: 'application/vnd.collection+json',
      sample: JSON.parse('{"collection":{"version":"1.0","href":"http://api.fastify.test/people/"}}')
    },
    hal: {
      mimeType: 'application/hal+json',
      sample: JSON.parse('{"_links":{"self":{"href":"https://api.fastify.test/people/1"}},"name":"John Doe"}')
    },
    jsonapi: {
      mimeType: 'application/vnd.api+json',
      sample: JSON.parse('{"data":{"type":"people","id":"1"}}')
    },
    jsonld: {
      mimeType: 'application/ld+json',
      sample: JSON.parse('{"@context":"https://json-ld.org/contexts/person.jsonld","name":"John Doe"}')
    },
    siren: {
      mimeType: 'application/vnd.siren+json',
      sample: JSON.parse('{"class":"person","properties":{"name":"John Doe"}}')
    }
  }

  Object.keys(customSamples).forEach((path) => {
    fastify.get(`/${path}`, function (req, reply) {
      reply.type(customSamples[path].mimeType).send(customSamples[path].sample)
    })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  await Promise.all(Object.keys(customSamples).map(async path => {
    const result = await fetch(fastifyServer + '/' + path)
    expect(result.ok).toBeTruthy()
    expect(result.headers.get('content-type')).toBe(customSamples[path].mimeType + '; charset=utf-8')
    expect(await result.text()).toEqual(JSON.stringify(customSamples[path].sample))
  }))
})

test('error object with a content type that is not application/json should work', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.get('/text', function (req, reply) {
    reply.type('text/plain')
    reply.send(new Error('some application error'))
  })

  fastify.get('/html', function (req, reply) {
    reply.type('text/html')
    reply.send(new Error('some application error'))
  })

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/text'
    })
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.payload).message).toBe('some application error')
  }

  {
    const res = await fastify.inject({
      method: 'GET',
      url: '/html'
    })
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.payload).message).toBe('some application error')
  }
})

test('undefined payload should be sent as-is', async () => {
  expect.assertions(5)

  const fastify = Fastify()

  fastify.addHook('onSend', function (request, reply, payload, done) {
    expect(payload).toBe(undefined)
    done()
  })

  fastify.get('/', function (req, reply) {
    reply.code(204).send()
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer)
  expect(result.ok).toBeTruthy()
  expect(result.headers.get('content-type')).toBe(null)
  expect(result.headers.get('content-length')).toBe(null)
  const body = await result.text()
  expect(body.length).toBe(0)
})

test('for HEAD method, no body should be sent but content-length should be', async () => {
  expect.assertions(10)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  const contentType = 'application/json; charset=utf-8'
  const bodySize = JSON.stringify({ foo: 'bar' }).length

  fastify.head('/', {
    onSend: function (request, reply, payload, done) {
      expect(payload).toBe(undefined)
      done()
    }
  }, function (req, reply) {
    reply.header('content-length', bodySize)
    reply.header('content-type', contentType)
    reply.code(200).send()
  })

  fastify.head('/with/null', {
    onSend: function (request, reply, payload, done) {
      expect(payload).toBe('null')
      done()
    }
  }, function (req, reply) {
    reply.header('content-length', bodySize)
    reply.header('content-type', contentType)
    reply.code(200).send(null)
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const promise1 = (async () => {
    const result = await fetch(fastifyServer, { method: 'HEAD' })
    expect(result.ok).toBeTruthy()
    expect(result.headers.get('content-type')).toBe(contentType)
    expect(result.headers.get('content-length')).toBe(bodySize.toString())
    expect((await result.text()).length).toBe(0)
  })()

  const promise2 = (async () => {
    const result = await fetch(fastifyServer + '/with/null', { method: 'HEAD' })
    expect(result.ok).toBeTruthy()
    expect(result.headers.get('content-type')).toBe(contentType)
    expect(result.headers.get('content-length')).toBe(bodySize.toString())
    expect((await result.text()).length).toBe(0)
  })()

  await Promise.all([promise1, promise2])
})

test('reply.send(new NotFound()) should not invoke the 404 handler', async () => {
  expect.assertions(6)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.setNotFoundHandler((req, reply) => {
    expect.fail('Should not be called')
  })

  fastify.get('/not-found', function (req, reply) {
    reply.send(new NotFound())
  })

  fastify.register(function (instance, options, done) {
    instance.get('/not-found', function (req, reply) {
      reply.send(new NotFound())
    })

    done()
  }, { prefix: '/prefixed' })

  const fastifyServer = await fastify.listen({ port: 0 })

  const promise1 = (async () => {
    const result = await fetch(`${fastifyServer}/not-found`)
    expect(result.status).toBe(404)
    expect(result.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(JSON.parse(await result.text())).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Not Found'
    })
  })()

  const promise2 = (async () => {
    const result = await fetch(`${fastifyServer}/prefixed/not-found`)
    expect(result.status).toBe(404)
    expect(result.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(JSON.parse(await result.text())).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Not Found'
    })
  })()

  await Promise.all([promise1, promise2])
})

test('reply can set multiple instances of same header', async () => {
  expect.assertions(3)

  const fastify = require('../..')()

  fastify.get('/headers', function (req, reply) {
    reply
      .header('set-cookie', 'one')
      .header('set-cookie', 'two')
      .send({})
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(`${fastifyServer}/headers`)
  expect(result.ok).toBeTruthy()
  expect(result.headers.get('set-cookie')).toBeTruthy()
  expect(result.headers.getSetCookie()).toEqual(['one', 'two'])
})

test('reply.hasHeader returns correct values', async () => {
  expect.assertions(2)

  const fastify = require('../..')()

  fastify.get('/headers', function (req, reply) {
    reply.header('x-foo', 'foo')
    expect(reply.hasHeader('x-foo')).toBe(true)
    expect(reply.hasHeader('x-bar')).toBe(false)
    reply.send()
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  await fetch(`${fastifyServer}/headers`)
})

test('reply.getHeader returns correct values', async () => {
  expect.assertions(4)

  const fastify = require('../..')()

  fastify.get('/headers', function (req, reply) {
    reply.header('x-foo', 'foo')
    expect(reply.getHeader('x-foo')).toBe('foo')

    reply.header('x-foo', 'bar')
    expect(reply.getHeader('x-foo')).toEqual('bar')

    reply.header('x-foo', 42)
    expect(reply.getHeader('x-foo')).toEqual(42)

    reply.header('set-cookie', 'one')
    reply.header('set-cookie', 'two')
    expect(reply.getHeader('set-cookie')).toEqual(['one', 'two'])

    reply.send()
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  await fetch(`${fastifyServer}/headers`)
})

test('reply.getHeader returns raw header if there is not in the reply headers', async () => {
  expect.assertions(1)
  const response = {
    setHeader: () => { },
    hasHeader: () => true,
    getHeader: () => 'bar',
    writeHead: () => { },
    end: () => { }
  }
  const reply = new Reply(response, { onSend: [] }, null)
  expect(reply.getHeader('foo')).toBe('bar')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('reply.getHeaders returns correct values', (done) => {
  expect.assertions(3)

  const fastify = require('../..')()

  fastify.get('/headers', function (req, reply) {
    reply.header('x-foo', 'foo')

    expect(reply.getHeaders()).toEqual({
      'x-foo': 'foo'
    })

    reply.header('x-bar', 'bar')
    reply.raw.setHeader('x-foo', 'foo2')
    reply.raw.setHeader('x-baz', 'baz')

    expect(reply.getHeaders()).toEqual({
      'x-foo': 'foo',
      'x-bar': 'bar',
      'x-baz': 'baz'
    })

    reply.send()
  })

  fastify.inject('/headers', (err) => {
    expect(err).toBeFalsy()
    done()
  })
})

test('reply.removeHeader can remove the value', async () => {
  expect.assertions(3)

  const fastify = require('../..')()

  onTestFinished(() => fastify.close())

  fastify.get('/headers', function (req, reply) {
    reply.header('x-foo', 'foo')
    expect(reply.getHeader('x-foo')).toBe('foo')

    expect(reply.removeHeader('x-foo')).toBe(reply)
    expect(reply.getHeader('x-foo')).toEqual(undefined)

    reply.send()
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  await fetch(`${fastifyServer}/headers`)
})

test('reply.removeHeader removes raw headers', async () => {
  expect.assertions(9)

  const fastify = require('../..')()

  onTestFinished(() => fastify.close())

  fastify.get('/headers', function (req, reply) {
    reply.raw.setHeader('X-Foo', 'raw')
    expect(reply.getHeader('x-foo')).toBe('raw')
    expect(reply.getHeaders()['x-foo']).toBe('raw')
    expect(reply.hasHeader('x-foo')).toBe(true)

    expect(reply.removeHeader('x-FoO')).toBe(reply)
    expect(reply.getHeader('x-foo')).toBe(undefined)
    expect(Object.hasOwn(reply.getHeaders(), 'x-foo')).toBe(false)
    expect(reply.hasHeader('x-foo')).toBe(false)
    expect(reply.removeHeader('X-FOO')).toBe(reply)

    reply.send()
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  const response = await fetch(`${fastifyServer}/headers`)
  expect(response.headers.get('x-foo')).toBe(null)
})

test('reply.removeHeader removes layered headers', async () => {
  expect.assertions(7)

  const fastify = require('../..')()

  onTestFinished(() => fastify.close())

  fastify.get('/headers', function (req, reply) {
    reply.raw.setHeader('x-foo', 'raw')
    reply.header('x-foo', 'fastify')
    expect(reply.getHeader('x-foo')).toBe('fastify')
    expect(reply.getHeaders()['x-foo']).toBe('fastify')

    expect(reply.removeHeader('x-foo')).toBe(reply)
    expect(reply.getHeader('x-foo')).toBe(undefined)
    expect(Object.hasOwn(reply.getHeaders(), 'x-foo')).toBe(false)
    expect(reply.hasHeader('x-foo')).toBe(false)

    reply.send()
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  const response = await fetch(`${fastifyServer}/headers`)
  expect(response.headers.get('x-foo')).toBe(null)
})

test('reply.removeHeader does not throw after headers are sent', async () => {
  expect.assertions(3)

  const fastify = require('../..')()

  onTestFinished(() => fastify.close())

  fastify.get('/headers', function (req, reply) {
    reply.hijack()
    reply.raw.setHeader('x-foo', 'raw')
    reply.raw.flushHeaders()
    expect(reply.raw.headersSent).toBe(true)
    expect(() => reply.removeHeader('x-foo')).not.toThrow()
    reply.raw.end()
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  const response = await fetch(`${fastifyServer}/headers`)
  expect(response.headers.get('x-foo')).toBe('raw')
})

test('reply.header can reset the value', async () => {
  expect.assertions(1)

  const fastify = require('../..')()

  onTestFinished(() => fastify.close())

  fastify.get('/headers', function (req, reply) {
    reply.header('x-foo', 'foo')
    reply.header('x-foo', undefined)
    expect(reply.getHeader('x-foo')).toEqual('')

    reply.send()
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  await fetch(`${fastifyServer}/headers`)
})

// https://github.com/fastify/fastify/issues/3030
test('reply.hasHeader computes raw and fastify headers', async () => {
  expect.assertions(2)

  const fastify = require('../..')()

  onTestFinished(() => fastify.close())

  fastify.get('/headers', function (req, reply) {
    reply.header('x-foo', 'foo')
    reply.raw.setHeader('x-bar', 'bar')
    expect(reply.hasHeader('x-foo')).toBeTruthy()
    expect(reply.hasHeader('x-bar')).toBeTruthy()

    reply.send()
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  await fetch(`${fastifyServer}/headers`)
})

test('Reply should handle JSON content type with a charset', async () => {
  expect.assertions(10)

  const fastify = require('../..')()

  fastify.get('/default', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.get('/utf8', function (req, reply) {
    reply
      .header('content-type', 'application/json; charset=utf-8')
      .send({ hello: 'world' })
  })

  fastify.get('/utf16', function (req, reply) {
    reply
      .header('content-type', 'application/json; charset=utf-16')
      .send({ hello: 'world' })
  })

  fastify.get('/utf32', function (req, reply) {
    reply
      .header('content-type', 'application/json; charset=utf-32')
      .send({ hello: 'world' })
  })

  fastify.get('/type-utf8', function (req, reply) {
    reply
      .type('application/json; charset=utf-8')
      .send({ hello: 'world' })
  })

  fastify.get('/type-utf16', function (req, reply) {
    reply
      .type('application/json; charset=utf-16')
      .send({ hello: 'world' })
  })

  fastify.get('/type-utf32', function (req, reply) {
    reply
      .type('application/json; charset=utf-32')
      .send({ hello: 'world' })
  })

  fastify.get('/no-space-type-utf32', function (req, reply) {
    reply
      .type('application/json;charset=utf-32')
      .send({ hello: 'world' })
  })

  fastify.get('/upper-charset', function (req, reply) {
    reply
      .header('content-type', 'application/json; CHARSET=utf-8')
      .send({ hello: 'world' })
  })

  fastify.get('/random-case', function (req, reply) {
    reply
      .header('content-type', 'ApPlIcAtIoN/JsOn; ChArSeT=utf-8')
      .send({ hello: 'world' })
  })

  {
    const res = await fastify.inject('/default')
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
  }

  {
    const res = await fastify.inject('/utf8')
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
  }

  {
    const res = await fastify.inject('/utf16')
    expect(res.headers['content-type']).toBe('application/json; charset=utf-16')
  }

  {
    const res = await fastify.inject('/utf32')
    expect(res.headers['content-type']).toBe('application/json; charset=utf-32')
  }

  {
    const res = await fastify.inject('/type-utf8')
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
  }

  {
    const res = await fastify.inject('/type-utf16')
    expect(res.headers['content-type']).toBe('application/json; charset=utf-16')
  }
  {
    const res = await fastify.inject('/type-utf32')
    expect(res.headers['content-type']).toBe('application/json; charset=utf-32')
  }

  {
    const res = await fastify.inject('/upper-charset')
    expect(res.headers['content-type']).toBe('application/json; CHARSET=utf-8')
  }

  {
    const res = await fastify.inject('/random-case')
    expect(res.headers['content-type']).toBe('ApPlIcAtIoN/JsOn; ChArSeT=utf-8')
  }

  {
    const res = await fastify.inject('/no-space-type-utf32')
    expect(res.headers['content-type']).toBe('application/json;charset=utf-32')
  }
})

test('Content type and charset set previously', (done) => {
  expect.assertions(2)

  const fastify = require('../..')()

  fastify.addHook('onRequest', function (req, reply, done) {
    reply.header('content-type', 'application/json; charset=utf-16')
    done()
  })

  fastify.get('/', function (req, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['content-type']).toBe('application/json; charset=utf-16')
    done()
  })
})

test('.status() is an alias for .code()', (done) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    reply.status(418).send()
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(418)
    done()
  })
})

test('.statusCode is getter and setter', (done) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    expect(reply.statusCode).toBe(200)
    reply.statusCode = 418
    expect(reply.statusCode).toBe(418)
    reply.send()
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(418)
    done()
  })
})

test('reply.header setting multiple cookies as multiple Set-Cookie headers', async () => {
  expect.assertions(5)

  const fastify = require('../..')()
  onTestFinished(() => fastify.close())

  fastify.get('/headers', function (req, reply) {
    reply
      .header('set-cookie', 'one')
      .header('set-cookie', 'two')
      .header('set-cookie', 'three')
      .header('set-cookie', ['four', 'five', 'six'])
      .send({})
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(`${fastifyServer}/headers`)
  expect(result.ok).toBeTruthy()
  expect(result.headers.get('set-cookie')).toBeTruthy()
  expect(result.headers.getSetCookie()).toEqual(['one', 'two', 'three', 'four', 'five', 'six'])

  const response = await fastify.inject('/headers')
  expect(response.headers['set-cookie']).toBeTruthy()
  expect(response.headers['set-cookie']).toEqual(['one', 'two', 'three', 'four', 'five', 'six'])
})

test('should throw when trying to modify the reply.sent property', (done) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    try {
      reply.sent = true
    } catch (err) {
      expect(err).toBeTruthy()
      reply.send()
    }
  })

  fastify.inject('/', (err, res) => {
    expect(err).toBeFalsy()
    expect(true).toBeTruthy()
    done()
  })
})

test('reply.elapsedTime should return 0 before the timer is initialised on the reply by setting up response listeners', async () => {
  expect.assertions(1)
  const response = { statusCode: 200 }
  const reply = new Reply(response, null)
  expect(reply.elapsedTime).toBe(0)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('reply.elapsedTime should return a number greater than 0 after the timer is initialised on the reply by setting up response listeners', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  fastify.route({
    method: 'GET',
    url: '/',
    handler: (req, reply) => {
      reply.send('hello world')
    }
  })

  fastify.addHook('onResponse', (req, reply) => {
    expect(reply.elapsedTime > 0).toBeTruthy()
  })

  await fastify.inject({ method: 'GET', url: '/' })
})

test('reply.elapsedTime should return the time since a request started while inflight', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  fastify.route({
    method: 'GET',
    url: '/',
    handler: (req, reply) => {
      reply.send('hello world')
    }
  })

  let preValidationElapsedTime

  fastify.addHook('preValidation', (req, reply, done) => {
    preValidationElapsedTime = reply.elapsedTime

    done()
  })

  fastify.addHook('onResponse', (req, reply) => {
    expect(reply.elapsedTime > preValidationElapsedTime).toBeTruthy()
  })

  await fastify.inject({ method: 'GET', url: '/' })
})

test('reply.elapsedTime should return the same value after a request is finished', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  fastify.route({
    method: 'GET',
    url: '/',
    handler: (req, reply) => {
      reply.send('hello world')
    }
  })

  fastify.addHook('onResponse', (req, reply) => {
    expect(reply.elapsedTime).toBe(reply.elapsedTime)
  })

  await fastify.inject({ method: 'GET', url: '/' })
})

test('reply should use the custom serializer', (done) => {
  expect.assertions(4)
  const fastify = Fastify()
  fastify.setReplySerializer((payload, statusCode) => {
    expect(payload).toEqual({ foo: 'bar' })
    expect(statusCode).toBe(200)
    payload.foo = 'bar bar'
    return JSON.stringify(payload)
  })

  fastify.route({
    method: 'GET',
    url: '/',
    handler: (req, reply) => {
      reply.send({ foo: 'bar' })
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('{"foo":"bar bar"}')
    done()
  })
})

test('reply should use the right serializer in encapsulated context', async () => {
  expect.assertions(6)

  const fastify = Fastify()
  fastify.setReplySerializer((payload) => {
    expect(payload).toEqual({ foo: 'bar' })
    payload.foo = 'bar bar'
    return JSON.stringify(payload)
  })

  fastify.route({
    method: 'GET',
    url: '/',
    handler: (req, reply) => { reply.send({ foo: 'bar' }) }
  })

  fastify.register(function (instance, opts, done) {
    instance.route({
      method: 'GET',
      url: '/sub',
      handler: (req, reply) => { reply.send({ john: 'doo' }) }
    })
    instance.setReplySerializer((payload) => {
      expect(payload).toEqual({ john: 'doo' })
      payload.john = 'too too'
      return JSON.stringify(payload)
    })
    done()
  })

  fastify.register(function (instance, opts, done) {
    instance.route({
      method: 'GET',
      url: '/sub',
      handler: (req, reply) => { reply.send({ sweet: 'potato' }) }
    })
    instance.setReplySerializer((payload) => {
      expect(payload).toEqual({ sweet: 'potato' })
      payload.sweet = 'potato potato'
      return JSON.stringify(payload)
    })
    done()
  }, { prefix: 'sub' })

  {
    const res = await fastify.inject('/')
    expect(res.payload).toBe('{"foo":"bar bar"}')
  }

  {
    const res = await fastify.inject('/sub')
    expect(res.payload).toBe('{"john":"too too"}')
  }

  {
    const res = await fastify.inject('/sub/sub')
    expect(res.payload).toBe('{"sweet":"potato potato"}')
  }
})

test('reply should use the right serializer in deep encapsulated context', async () => {
  expect.assertions(5)

  const fastify = Fastify()

  fastify.route({
    method: 'GET',
    url: '/',
    handler: (req, reply) => { reply.send({ foo: 'bar' }) }
  })

  fastify.register(function (instance, opts, done) {
    instance.route({
      method: 'GET',
      url: '/sub',
      handler: (req, reply) => { reply.send({ john: 'doo' }) }
    })
    instance.setReplySerializer((payload) => {
      expect(payload).toEqual({ john: 'doo' })
      payload.john = 'too too'
      return JSON.stringify(payload)
    })

    instance.register(function (subInstance, opts, done) {
      subInstance.route({
        method: 'GET',
        url: '/deep',
        handler: (req, reply) => { reply.send({ john: 'deep' }) }
      })
      subInstance.setReplySerializer((payload) => {
        expect(payload).toEqual({ john: 'deep' })
        payload.john = 'deep deep'
        return JSON.stringify(payload)
      })
      done()
    })
    done()
  })

  {
    const res = await fastify.inject('/')
    expect(res.payload).toBe('{"foo":"bar"}')
  }
  {
    const res = await fastify.inject('/sub')
    expect(res.payload).toBe('{"john":"too too"}')
  }
  {
    const res = await fastify.inject('/deep')
    expect(res.payload).toBe('{"john":"deep deep"}')
  }
})

test('reply should use the route serializer', (done) => {
  expect.assertions(3)

  const fastify = Fastify()
  fastify.setReplySerializer(() => {
    expect.fail('this serializer should not be executed')
  })

  fastify.route({
    method: 'GET',
    url: '/',
    handler: (req, reply) => {
      reply
        .serializer((payload) => {
          expect(payload).toEqual({ john: 'doo' })
          payload.john = 'too too'
          return JSON.stringify(payload)
        })
        .send({ john: 'doo' })
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('{"john":"too too"}')
    done()
  })
})

test('cannot set the replySerializer when the server is running', (done) => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    try {
      fastify.setReplySerializer(() => { })
      expect.fail('this serializer should not be setup')
    } catch (e) {
      expect(e.code).toBe('XUFA_ERR_INSTANCE_ALREADY_STARTED')
    } finally {
      done()
    }
  })
})

test('reply should not call the custom serializer for errors and not found', async () => {
  expect.assertions(6)

  const fastify = Fastify()
  fastify.setReplySerializer((payload, statusCode) => {
    expect(payload).toEqual({ foo: 'bar' })
    expect(statusCode).toBe(200)
    return JSON.stringify(payload)
  })

  fastify.get('/', (req, reply) => { reply.send({ foo: 'bar' }) })
  fastify.get('/err', (req, reply) => { reply.send(new Error('an error')) })

  {
    const res = await fastify.inject('/')
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('{"foo":"bar"}')
  }
  {
    const res = await fastify.inject('/err')
    expect(res.statusCode).toBe(500)
  }
  {
    const res = await fastify.inject('/not-existing')
    expect(res.statusCode).toBe(404)
  }
})

describe('reply.then', () => {

function request () { }
test('without an error', (done) => {
    expect.assertions(1)

    const response = new Writable()
    const reply = new Reply(response, request)

    reply.then(function () {
      expect(true).toBeTruthy()
      done()
    })

    response.destroy()
  })
test('with an error', (done) => {
    expect.assertions(1)

    const response = new Writable()
    const reply = new Reply(response, request)
    const _err = new Error('kaboom')

    reply.then(function () {
      expect.fail('fulfilled called')
    }, function (err) {
      expect(err).toBe(_err)
      done()
    })

    response.destroy(_err)
  })
test('with error but without reject callback', async () => {
    expect.assertions(1)

    const response = new Writable()
    const reply = new Reply(response, request)
    const _err = new Error('kaboom')

    reply.then(function () {
      expect.fail('fulfilled called')
    })

    expect(true).toBeTruthy()

    response.destroy(_err)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('with error, without reject callback, with logger', (done) => {
    expect.assertions(1)

    const response = new Writable()
    const reply = new Reply(response, request)
    // spy logger
    reply.log = {
      warn: (message) => {
        expect(message).toBe('unhandled rejection on reply.then')
        done()
      }
    }
    const _err = new Error('kaboom')

    reply.then(function () {
      expect.fail('fulfilled called')
    })

    response.destroy(_err)
  })
})

test('reply.sent should read from response.writableEnded if it is defined', async () => {
  expect.assertions(1)

  const reply = new Reply({ writableEnded: true }, {}, {})

  expect(reply.sent).toBe(true)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('redirect to an invalid URL should not crash the server', async () => {
  const fastify = Fastify()
  fastify.route({
    method: 'GET',
    url: '/redirect',
    handler: (req, reply) => {
      reply.log.warn = function mockWarn (obj, message) {
        expect(message).toBe('Invalid character in header content ["location"]')
      }

      switch (req.query.useCase) {
        case '1':
          reply.redirect('/?key=a’b')
          break

        case '2':
          reply.redirect(encodeURI('/?key=a’b'))
          break

        default:
          reply.redirect('/?key=ab')
          break
      }
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  {
    const { response, body } = await doGet(`${fastifyServer}/redirect?useCase=1`)
    expect(response.status).toBe(500)
    expect(body).toEqual({
      statusCode: 500,
      code: 'ERR_INVALID_CHAR',
      error: 'Internal Server Error',
      message: 'Invalid character in header content ["location"]'
    })
  }
  {
    const { response } = await doGet(`${fastifyServer}/redirect?useCase=2`)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/?key=a%E2%80%99b')
  }

  {
    const { response } = await doGet(`${fastifyServer}/redirect?useCase=3`)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/?key=ab')
  }

  await fastify.close()
})

test('invalid response headers should not crash the server', async () => {
  const fastify = Fastify()
  fastify.route({
    method: 'GET',
    url: '/bad-headers',
    handler: (req, reply) => {
      reply.log.warn = function mockWarn (obj, message) {
        expect(message).toBe('Invalid character in header content ["smile-encoded"]')
      }

      reply.header('foo', '$')
      reply.header('smile-encoded', '\uD83D\uDE00')
      reply.header('smile', '😄')
      reply.header('bar', 'ƒ∂å')

      reply.send({})
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const { response, body } = await doGet(`${fastifyServer}/bad-headers`)
  expect(response.status).toBe(500)
  expect(body).toEqual({
    statusCode: 500,
    code: 'ERR_INVALID_CHAR',
    error: 'Internal Server Error',
    message: 'Invalid character in header content ["smile-encoded"]'
  })

  await fastify.close()
})

test('invalid response headers when sending back an error', async () => {
  const fastify = Fastify()
  fastify.route({
    method: 'GET',
    url: '/bad-headers',
    handler: (req, reply) => {
      reply.log.warn = function mockWarn (obj, message) {
        expect(message).toBe('Invalid character in header content ["smile"]')
      }

      reply.header('smile', '😄')
      reply.send(new Error('user land error'))
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const { response, body } = await doGet(`${fastifyServer}/bad-headers`)
  expect(response.status).toBe(500)
  expect(body).toEqual({
    statusCode: 500,
    code: 'ERR_INVALID_CHAR',
    error: 'Internal Server Error',
    message: 'Invalid character in header content ["smile"]'
  })

  await fastify.close()
})

test('invalid response headers and custom error handler', async () => {
  const fastify = Fastify()
  fastify.route({
    method: 'GET',
    url: '/bad-headers',
    handler: (req, reply) => {
      reply.log.warn = function mockWarn (obj, message) {
        expect(message).toBe('Invalid character in header content ["smile"]')
      }

      reply.header('smile', '😄')
      reply.send(new Error('user land error'))
    }
  })

  fastify.setErrorHandler(function (error, request, reply) {
    expect(error.message).toBe('user land error')
    reply.status(500).send({ ops: true })
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const { response, body } = await doGet(`${fastifyServer}/bad-headers`)
  expect(response.status).toBe(500)
  expect(body).toEqual({
    statusCode: 500,
    code: 'ERR_INVALID_CHAR',
    error: 'Internal Server Error',
    message: 'Invalid character in header content ["smile"]'
  })

  await fastify.close()
})

test('reply.send will intercept ERR_HTTP_HEADERS_SENT and log an error message', async () => {
  expect.assertions(2)

  const response = new Writable()
  Object.assign(response, {
    setHeader: () => { },
    hasHeader: () => false,
    getHeader: () => undefined,
    writeHead: () => {
      const err = new Error('kaboom')
      err.code = 'ERR_HTTP_HEADERS_SENT'
      throw err
    },
    write: () => { },
    headersSent: true
  })

  const log = {
    warn: (msg) => {
      expect(msg).toBe('Reply was already sent, did you forget to "return reply" in the "/hello" (GET) route?')
    }
  }

  const reply = new Reply(response, { [kRouteContext]: { onSend: null }, raw: { url: '/hello', method: 'GET' } }, log)

  try {
    reply.send('')
  } catch (err) {
    expect(err.code).toBe('ERR_HTTP_HEADERS_SENT')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Uint8Array view of ArrayBuffer returns correct byteLength', (done) => {
  expect.assertions(5)
  const fastify = Fastify()

  const arrBuf = new ArrayBuffer(100)
  const arrView = new Uint8Array(arrBuf, 0, 10)
  fastify.get('/', function (req, reply) {
    return reply.send(arrView)
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    onTestFinished(() => fastify.close())

    fastify.inject({
      method: 'GET',
      url: '/'
    }, (err, response) => {
      expect(err).toBeFalsy()
      expect(response.headers['content-type']).toBe('application/octet-stream')
      expect(response.headers['content-length']).toBe('10')
      expect(response.rawPayload.byteLength).toEqual(arrView.byteLength)
      done()
    })
  })
})

test('reply.send should not treat charset= inside a quoted parameter value as an already-declared charset', async () => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', function (req, reply) {
    // A quoted parameter value that happens to contain the substring
    // `charset=` is opaque content of that value, not a real charset
    // parameter, so reply.send must still append `; charset=utf-8`.
    reply.header('content-type', 'application/json; name="a=b;charset=fake"')
    reply.send({ hello: 'world' })
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('application/json; name="a=b;charset=fake"; charset=utf-8')
})
