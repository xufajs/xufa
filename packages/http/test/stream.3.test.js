'use strict'


const split = require('split2')
const Fastify = require('..')

test('Destroying streams prematurely', (testDone) => {
  expect.assertions(6)

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

    reply.send(reallyLongStream)
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    onTestFinished(() => fastify.close())

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

test('Destroying streams prematurely should call close method', (testDone) => {
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

test('Destroying streams prematurely should call close method when destroy is not a function', (testDone) => {
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
