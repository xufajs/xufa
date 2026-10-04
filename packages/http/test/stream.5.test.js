'use strict'


const proxyquire = require('proxyquire')
const fs = require('node:fs')
const Readable = require('node:stream').Readable
const Fastify = require('..')

test('should destroy stream when response is ended', async () => {
  expect.assertions(3)
  const stream = require('node:stream')
  const fastify = Fastify()

  fastify.get('/error', function (req, reply) {
    const reallyLongStream = new stream.Readable({
      read: function () { },
      destroy: function (err, callback) {
        expect('called').toBeTruthy()
        callback(err)
      }
    })
    reply.code(200).send(reallyLongStream)
    reply.raw.end(Buffer.from('hello\n'))
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const response = await fetch(`${fastifyServer}/error`)
  expect(response.ok).toBeTruthy()
  expect(response.status).toBe(200)
})

test('should mark reply as sent before pumping the payload stream into response for async route handler', async () => {
  expect.assertions(2)
  onTestFinished(() => fastify.close())

  const handleRequest = proxyquire('../lib/handle-request', {
    './wrap-thenable': (thenable, reply) => {
      thenable.then(function (payload) {
        expect(reply.sent).toBe(true)
      })
    }
  })

  const route = proxyquire('../lib/route', {
    './handle-request': handleRequest
  })

  const Fastify = proxyquire('../lib/xufa', {
    './route': route
  })

  const fastify = Fastify()

  fastify.get('/', async function (req, reply) {
    const stream = fs.createReadStream(__filename, 'utf8')
    return reply.code(200).send(stream)
  })

  const res = await fastify.inject({
    url: '/',
    method: 'GET'
  })
  expect(res.payload).toBe(fs.readFileSync(__filename, 'utf8'))
})

test('reply.send handles aborted requests', (done) => {
  expect.assertions(2)

  const spyLogger = {
    level: 'error',
    fatal: () => { },
    error: () => {
      expect.fail('should not log an error')
    },
    warn: () => { },
    info: () => { },
    debug: () => { },
    trace: () => { },
    child: () => { return spyLogger }
  }
  const fastify = Fastify({
    loggerInstance: spyLogger
  })

  fastify.get('/', (req, reply) => {
    setTimeout(() => {
      const stream = new Readable({
        read: function () {
          this.push(null)
        }
      })
      reply.send(stream)
    }, 6)
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    onTestFinished(() => fastify.close())

    const port = fastify.server.address().port
    const http = require('node:http')
    const req = http.get(`http://localhost:${port}`)
      .on('error', (err) => {
        expect(err.code).toBe('ECONNRESET')
        done()
      })

    setTimeout(() => {
      req.destroy()
    }, 1)
  })
})

test('request terminated should not crash fastify', (done) => {
  expect.assertions(10)

  const spyLogger = {
    level: 'error',
    fatal: () => { },
    error: () => {
      expect.fail('should not log an error')
    },
    warn: () => { },
    info: () => { },
    debug: () => { },
    trace: () => { },
    child: () => { return spyLogger }
  }
  const fastify = Fastify({
    loggerInstance: spyLogger
  })

  fastify.get('/', async (req, reply) => {
    const stream = new Readable()
    stream._read = () => { }
    reply.header('content-type', 'text/html; charset=utf-8')
    reply.header('transfer-encoding', 'chunked')
    stream.push('<h1>HTML</h1>')

    reply.send(stream)

    await new Promise((resolve) => { setTimeout(resolve, 100).unref() })

    stream.push('<h1>should display on second stream</h1>')
    stream.push(null)
    return reply
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    onTestFinished(() => fastify.close())

    const port = fastify.server.address().port
    const http = require('node:http')
    const req = http.get(`http://localhost:${port}`, function (res) {
      const { statusCode, headers } = res
      expect(statusCode).toBe(200)
      expect(headers['content-type']).toBe('text/html; charset=utf-8')
      expect(headers['transfer-encoding']).toBe('chunked')
      res.on('data', function (chunk) {
        expect(chunk.toString()).toBe('<h1>HTML</h1>')
      })

      setTimeout(() => {
        req.destroy()

        // the server is not crash, we can connect it
        http.get(`http://localhost:${port}`, function (res) {
          const { statusCode, headers } = res
          expect(statusCode).toBe(200)
          expect(headers['content-type']).toBe('text/html; charset=utf-8')
          expect(headers['transfer-encoding']).toBe('chunked')
          let payload = ''
          res.on('data', function (chunk) {
            payload += chunk.toString()
          })
          res.on('end', function () {
            expect(payload).toBe('<h1>HTML</h1><h1>should display on second stream</h1>')
            expect('should end properly').toBeTruthy()
            done()
          })
        })
      }, 1)
    })
  })
})
