'use strict'


const { connect } = require('node:net')
const Fastify = require('..')

// RFC9112
// https://www.rfc-editor.org/rfc/rfc9112
test('Return 400 when Host header is missing', (done) => {
  expect.assertions(2)
  let data = Buffer.alloc(0)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.get('/', async function () {
    expect.fail('should not reach handler')
    return { ok: true }
  })
  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const socket = connect(fastify.server.address().port)
    socket.write('GET / HTTP/1.1\r\n\r\n')
    socket.on('data', c => (data = Buffer.concat([data, c])))
    socket.on('end', () => {
      expect(data.toString('utf-8')).toMatch(/^HTTP\/1.1 400 Bad Request/)
      done()
    })
  })
})

test('Return 400 when Host header is missing with trust proxy', (done) => {
  expect.assertions(2)
  let data = Buffer.alloc(0)
  const fastify = Fastify({
    trustProxy: true
  })

  onTestFinished(() => fastify.close())

  fastify.get('/', async function () {
    expect.fail('should not reach handler')
    return { ok: true }
  })
  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const socket = connect(fastify.server.address().port)
    socket.write('GET / HTTP/1.1\r\n\r\n')
    socket.on('data', c => (data = Buffer.concat([data, c])))
    socket.on('end', () => {
      expect(data.toString('utf-8')).toMatch(/^HTTP\/1.1 400 Bad Request/)
      done()
    })
  })
})

test('Return 200 when Host header is empty', (done) => {
  expect.assertions(5)
  let data = Buffer.alloc(0)
  const fastify = Fastify({
    keepAliveTimeout: 10
  })

  onTestFinished(() => fastify.close())

  fastify.get('/', async function (request) {
    expect(request.host).toBe('')
    expect(request.hostname).toBe('')
    expect(request.port).toBe(null)
    return { ok: true }
  })
  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const socket = connect(fastify.server.address().port)
    socket.write('GET / HTTP/1.1\r\nHost:\r\n\r\n')
    socket.on('data', c => (data = Buffer.concat([data, c])))
    socket.on('end', () => {
      expect(data.toString('utf-8')).toMatch(/^HTTP\/1.1 200 OK/)
      done()
    })
  })
})

test('Return 200 when Host header is empty with trust proxy', (done) => {
  expect.assertions(5)
  let data = Buffer.alloc(0)
  const fastify = Fastify({
    trustProxy: true,
    keepAliveTimeout: 10
  })

  onTestFinished(() => fastify.close())

  fastify.get('/', async function (request) {
    expect(request.host).toBe('')
    expect(request.hostname).toBe('')
    expect(request.port).toBe(null)
    return { ok: true }
  })
  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const socket = connect(fastify.server.address().port)
    socket.write('GET / HTTP/1.1\r\nHost:\r\n\r\n')
    socket.on('data', c => (data = Buffer.concat([data, c])))
    socket.on('end', () => {
      expect(data.toString('utf-8')).toMatch(/^HTTP\/1.1 200 OK/)
      done()
    })
  })
})

// Node.js allows exploiting RFC9112
// https://nodejs.org/docs/latest-v22.x/api/http.html#httpcreateserveroptions-requestlistener
test('Return 200 when Host header is missing and http.requireHostHeader = false', (done) => {
  expect.assertions(5)
  let data = Buffer.alloc(0)
  const fastify = Fastify({
    http: {
      requireHostHeader: false
    },
    keepAliveTimeout: 10
  })

  onTestFinished(() => fastify.close())

  fastify.get('/', async function (request) {
    expect(request.host).toBe('')
    expect(request.hostname).toBe('')
    expect(request.port).toBe(null)
    return { ok: true }
  })
  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const socket = connect(fastify.server.address().port)
    socket.write('GET / HTTP/1.1\r\n\r\n')
    socket.on('data', c => (data = Buffer.concat([data, c])))
    socket.on('end', () => {
      expect(data.toString('utf-8')).toMatch(/^HTTP\/1.1 200 OK/)
      done()
    })
  })
})

test('Return 200 when Host header is missing and http.requireHostHeader = false with trust proxy', (done) => {
  expect.assertions(5)
  let data = Buffer.alloc(0)
  const fastify = Fastify({
    http: {
      requireHostHeader: false
    },
    trustProxy: true,
    keepAliveTimeout: 10
  })

  onTestFinished(() => fastify.close())

  fastify.get('/', async function (request) {
    expect(request.host).toBe('')
    expect(request.hostname).toBe('')
    expect(request.port).toBe(null)
    return { ok: true }
  })
  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const socket = connect(fastify.server.address().port)
    socket.write('GET / HTTP/1.1\r\n\r\n')
    socket.on('data', c => (data = Buffer.concat([data, c])))
    socket.on('end', () => {
      expect(data.toString('utf-8')).toMatch(/^HTTP\/1.1 200 OK/)
      done()
    })
  })
})

test('Return 200 when Host header is missing using HTTP/1.0', (done) => {
  expect.assertions(5)
  let data = Buffer.alloc(0)
  const fastify = Fastify({
    keepAliveTimeout: 10
  })

  onTestFinished(() => fastify.close())

  fastify.get('/', async function (request) {
    expect(request.host).toBe('')
    expect(request.hostname).toBe('')
    expect(request.port).toBe(null)
    return { ok: true }
  })
  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const socket = connect(fastify.server.address().port)
    socket.write('GET / HTTP/1.0\r\n\r\n')
    socket.on('data', c => (data = Buffer.concat([data, c])))
    socket.on('end', () => {
      expect(data.toString('utf-8')).toMatch(/^HTTP\/1.1 200 OK/)
      done()
    })
  })
})

test('Return 200 when Host header is missing with trust proxy using HTTP/1.0', (done) => {
  expect.assertions(5)
  let data = Buffer.alloc(0)
  const fastify = Fastify({
    trustProxy: true,
    keepAliveTimeout: 10
  })

  onTestFinished(() => fastify.close())

  fastify.get('/', async function (request) {
    expect(request.host).toBe('')
    expect(request.hostname).toBe('')
    expect(request.port).toBe(null)
    return { ok: true }
  })
  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const socket = connect(fastify.server.address().port)
    socket.write('GET / HTTP/1.0\r\n\r\n')
    socket.on('data', c => (data = Buffer.concat([data, c])))
    socket.on('end', () => {
      expect(data.toString('utf-8')).toMatch(/^HTTP\/1.1 200 OK/)
      done()
    })
  })
})

test('Return 200 when Host header is removed by schema', (done) => {
  expect.assertions(5)
  let data = Buffer.alloc(0)
  const fastify = Fastify({
    keepAliveTimeout: 10
  })

  onTestFinished(() => fastify.close())

  fastify.get('/', {
    schema: {
      headers: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    }
  }, async function (request) {
    expect(request.host).toBe('')
    expect(request.hostname).toBe('')
    expect(request.port).toBe(null)
    return { ok: true }
  })
  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const socket = connect(fastify.server.address().port)
    socket.write('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n')
    socket.on('data', c => (data = Buffer.concat([data, c])))
    socket.on('end', () => {
      expect(data.toString('utf-8')).toMatch(/^HTTP\/1.1 200 OK/)
      done()
    })
  })
})

test('Return 200 when Host header is removed by schema with trust proxy', (done) => {
  expect.assertions(5)
  let data = Buffer.alloc(0)
  const fastify = Fastify({
    trustProxy: true,
    keepAliveTimeout: 10
  })

  onTestFinished(() => fastify.close())

  fastify.get('/', {
    schema: {
      headers: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    }
  }, async function (request) {
    expect(request.host).toBe('')
    expect(request.hostname).toBe('')
    expect(request.port).toBe(null)
    return { ok: true }
  })
  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const socket = connect(fastify.server.address().port)
    socket.write('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n')
    socket.on('data', c => (data = Buffer.concat([data, c])))
    socket.on('end', () => {
      expect(data.toString('utf-8')).toMatch(/^HTTP\/1.1 200 OK/)
      done()
    })
  })
})
