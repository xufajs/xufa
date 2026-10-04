'use strict'


const errors = require('http-errors')
const JSONStream = require('JSONStream')
const Readable = require('node:stream').Readable
const split = require('split2')
const Fastify = require('..')
const { kLogController } = require('../lib/symbols')

test('Destroying streams prematurely should call abort method', (testDone) => {
  expect.assertions(7)

  let fastify = null
  const logStream = split(JSON.parse)
  try {
    fastify = Fastify({
      logger: {
        stream: logStream,
        level: 'info'
      }
    })
  } catch (e) {
    expect.fail()
  }
  const stream = require('node:stream')
  const http = require('node:http')

  // Test that "premature close" errors are logged with level warn
  logStream.on('data', line => {
    if (line.res) {
      expect(line.msg).toBe('stream closed prematurely')
      expect(line.level).toBe(30)
      testDone()
    }
  })

  fastify.get('/', function (request, reply) {
    expect('Received request').toBeTruthy()

    let sent = false
    const reallyLongStream = new stream.Readable({
      read: function () {
        if (!sent) {
          this.push(Buffer.from('hello\n'))
        }
        sent = true
      }
    })
    reallyLongStream.destroy = undefined
    reallyLongStream.close = undefined
    reallyLongStream.abort = () => expect('called').toBeTruthy()
    reply.send(reallyLongStream)
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    onTestFinished(() => { fastify.close() })

    const port = fastify.server.address().port

    http.get(`http://localhost:${port}`, function (response) {
      expect(response.statusCode).toBe(200)
      response.on('readable', function () {
        response.destroy()
      })
      // Node bug? Node never emits 'close' here.
      response.on('aborted', function () {
        expect('Response closed').toBeTruthy()
      })
    })
  })
})

test('Destroying streams prematurely, log is disabled', (testDone) => {
  expect.assertions(4)

  let fastify = null
  try {
    fastify = Fastify({
      logger: false
    })
  } catch (e) {
    expect.fail()
  }
  const stream = require('node:stream')
  const http = require('node:http')

  fastify.get('/', function (request, reply) {
    reply.server[kLogController].disableRequestLogging = true

    let sent = false
    const reallyLongStream = new stream.Readable({
      read: function () {
        if (!sent) {
          this.push(Buffer.from('hello\n'))
        }
        sent = true
      }
    })
    reallyLongStream.destroy = true
    reallyLongStream.close = () => {
      expect('called').toBeTruthy()
      testDone()
    }
    reply.send(reallyLongStream)
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    onTestFinished(() => { fastify.close() })

    const port = fastify.server.address().port

    http.get(`http://localhost:${port}`, function (response) {
      expect(response.statusCode).toBe(200)
      response.on('readable', function () {
        response.destroy()
      })
      // Node bug? Node never emits 'close' here.
      response.on('aborted', function () {
        expect('Response closed').toBeTruthy()
      })
    })
  })
})

test('should respond with a stream1', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.get('/', function (req, reply) {
    const stream = JSONStream.stringify()
    reply.code(200).type('application/json').send(stream)
    stream.write({ hello: 'world' })
    stream.end({ a: 42 })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const response = await fetch(fastifyServer)
  expect(response.ok).toBeTruthy()
  expect(response.headers.get('content-type')).toBe('application/json')
  expect(response.status).toBe(200)
  const body = await response.text()
  expect(JSON.parse(body)).toEqual([{ hello: 'world' }, { a: 42 }])
})

test('return a 404 if the stream emits a 404 error', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    expect('Received request').toBeTruthy()

    const reallyLongStream = new Readable({
      read: function () {
        setImmediate(() => {
          this.emit('error', new errors.NotFound())
        })
      }
    })

    reply.send(reallyLongStream)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const response = await fetch(fastifyServer)
  expect(response.ok).toBeFalsy()
  expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
  expect(response.status).toBe(404)
})
