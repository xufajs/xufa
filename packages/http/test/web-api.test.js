'use strict'


const Fastify = require('@xufa/http')
const fs = require('node:fs')
const { Readable } = require('node:stream')
const { fetch: undiciFetch } = require('undici')
const http = require('node:http')
const { setTimeout: sleep } = require('node:timers/promises')

test('should response with a ReadableStream', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    const stream = fs.createReadStream(__filename)
    reply.code(200).send(Readable.toWeb(stream))
  })

  const {
    statusCode,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  const expected = await fs.promises.readFile(__filename)

  expect(statusCode).toBe(200)
  expect(expected.toString()).toBe(body.toString())
})

test('should response with a Response', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    const stream = fs.createReadStream(__filename)
    reply.send(new Response(Readable.toWeb(stream), {
      status: 200,
      headers: {
        hello: 'world'
      }
    }))
  })

  const {
    statusCode,
    headers,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  const expected = await fs.promises.readFile(__filename)

  expect(statusCode).toBe(200)
  expect(expected.toString()).toBe(body.toString())
  expect(headers.hello).toBe('world')
})

test('should response with a Response 204', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    reply.send(new Response(null, {
      status: 204,
      headers: {
        hello: 'world'
      }
    }))
  })

  const {
    statusCode,
    headers,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  expect(statusCode).toBe(204)
  expect(body).toBe('')
  expect(headers.hello).toBe('world')
})

test('should response with a Response 304', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    reply.send(new Response(null, {
      status: 304,
      headers: {
        hello: 'world'
      }
    }))
  })

  const {
    statusCode,
    headers,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  expect(statusCode).toBe(304)
  expect(body).toBe('')
  expect(headers.hello).toBe('world')
})

test('should response with a Response without body', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    reply.send(new Response(null, {
      status: 200,
      headers: {
        hello: 'world'
      }
    }))
  })

  const {
    statusCode,
    headers,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  expect(statusCode).toBe(200)
  expect(body).toBe('')
  expect(headers.hello).toBe('world')
})

test('able to use in onSend hook - ReadableStream', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    const stream = fs.createReadStream(__filename)
    reply.code(500).send(Readable.toWeb(stream))
  })

  fastify.addHook('onSend', (request, reply, payload, done) => {
    expect(Object.prototype.toString.call(payload)).toBe('[object ReadableStream]')
    done(null, new Response(payload, {
      status: 200,
      headers: {
        hello: 'world'
      }
    }))
  })

  const {
    statusCode,
    headers,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  const expected = await fs.promises.readFile(__filename)

  expect(statusCode).toBe(200)
  expect(expected.toString()).toBe(body.toString())
  expect(headers.hello).toBe('world')
})

test('able to use in onSend hook - Response', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    const stream = fs.createReadStream(__filename)
    reply.send(new Response(Readable.toWeb(stream), {
      status: 500,
      headers: {
        hello: 'world'
      }
    }))
  })

  fastify.addHook('onSend', (request, reply, payload, done) => {
    expect(Object.prototype.toString.call(payload)).toBe('[object Response]')
    done(null, new Response(payload.body, {
      status: 200,
      headers: payload.headers
    }))
  })

  const {
    statusCode,
    headers,
    body
  } = await fastify.inject({ method: 'GET', path: '/' })

  const expected = await fs.promises.readFile(__filename)

  expect(statusCode).toBe(200)
  expect(expected.toString()).toBe(body.toString())
  expect(headers.hello).toBe('world')
})

test('Error when Response.bodyUsed', async () => {
  expect.assertions(4)

  const expected = await fs.promises.readFile(__filename)

  const fastify = Fastify()

  fastify.get('/', async function (request, reply) {
    const stream = fs.createReadStream(__filename)
    const response = new Response(Readable.toWeb(stream), {
      status: 200,
      headers: {
        hello: 'world'
      }
    })
    const file = await response.text()
    expect(expected.toString()).toBe(file)
    expect(response.bodyUsed).toBe(true)
    return reply.send(response)
  })

  const response = await fastify.inject({ method: 'GET', path: '/' })

  expect(response.statusCode).toBe(500)
  const body = response.json()
  expect(body.code).toBe('XUFA_ERR_REP_RESPONSE_BODY_CONSUMED')
})

test('Error when Response.body.locked', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', async function (request, reply) {
    const stream = Readable.toWeb(fs.createReadStream(__filename))
    const response = new Response(stream, {
      status: 200,
      headers: {
        hello: 'world'
      }
    })
    stream.getReader()
    expect(stream.locked).toBe(true)
    return reply.send(response)
  })

  const response = await fastify.inject({ method: 'GET', path: '/' })

  expect(response.statusCode).toBe(500)
  const body = response.json()
  expect(body.code).toBe('XUFA_ERR_REP_READABLE_STREAM_LOCKED')
})

test('Error when ReadableStream.locked', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', async function (request, reply) {
    const stream = Readable.toWeb(fs.createReadStream(__filename))
    stream.getReader()
    expect(stream.locked).toBe(true)
    return reply.send(stream)
  })

  const response = await fastify.inject({ method: 'GET', path: '/' })

  expect(response.statusCode).toBe(500)
  const body = response.json()
  expect(body.code).toBe('XUFA_ERR_REP_READABLE_STREAM_LOCKED')
})

test('allow to pipe with fetch', async () => {
  expect.assertions(2)
  const abortController = new AbortController()
  const { signal } = abortController

  const fastify = Fastify()
  onTestFinished(() => {
    fastify.close()
    abortController.abort()
  })

  fastify.get('/', function (request, reply) {
    return fetch(`${fastify.listeningOrigin}/fetch`, {
      method: 'GET',
      signal
    })
  })

  fastify.get('/fetch', function async (request, reply) {
    reply.code(200).send({ ok: true })
  })

  await fastify.listen()

  const response = await fastify.inject({ method: 'GET', path: '/' })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({ ok: true })
})

test('allow to pipe with undici.fetch', async () => {
  expect.assertions(2)
  const abortController = new AbortController()
  const { signal } = abortController

  const fastify = Fastify()
  onTestFinished(() => {
    fastify.close()
    abortController.abort()
  })

  fastify.get('/', function (request, reply) {
    return undiciFetch(`${fastify.listeningOrigin}/fetch`, {
      method: 'GET',
      signal
    })
  })

  fastify.get('/fetch', function (request, reply) {
    reply.code(200).send({ ok: true })
  })

  await fastify.listen()

  const response = await fastify.inject({ method: 'GET', path: '/' })

  expect(response.statusCode).toBe(200)
  expect(response.json()).toEqual({ ok: true })
})

test('WebStream error before headers sent should trigger error handler', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.get('/', function (request, reply) {
    const stream = new ReadableStream({
      start (controller) {
        controller.error(new Error('stream error'))
      }
    })
    reply.send(stream)
  })

  const response = await fastify.inject({ method: 'GET', path: '/' })

  expect(response.statusCode).toBe(500)
  expect(response.json().message).toBe('stream error')
})

test('WebStream error after headers sent should destroy response', (done) => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', function (request, reply) {
    const stream = new ReadableStream({
      start (controller) {
        controller.enqueue('hello')
      },
      pull (controller) {
        setTimeout(() => {
          controller.error(new Error('stream error'))
        }, 10)
      }
    })
    reply.header('content-type', 'text/plain').send(stream)
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    let finished = false
    http.get(`http://localhost:${fastify.server.address().port}`, (res) => {
      res.on('close', () => {
        if (!finished) {
          finished = true
          expect('response closed').toBeTruthy()
          done()
        }
      })
      res.resume()
    })
  })
})

test('WebStream should cancel reader when response is destroyed', (done) => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  let readerCancelled = false

  fastify.get('/', function (request, reply) {
    const stream = new ReadableStream({
      start (controller) {
        controller.enqueue('hello')
      },
      pull (controller) {
        return new Promise(() => {})
      },
      cancel () {
        readerCancelled = true
      }
    })
    reply.header('content-type', 'text/plain').send(stream)
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const req = http.get(`http://localhost:${fastify.server.address().port}`, (res) => {
      res.once('data', () => {
        req.destroy()
        setTimeout(() => {
          expect(readerCancelled).toBe(true)
          done()
        }, 50)
      })
    })
  })
})

test('WebStream should respect backpressure', async () => {
  expect.assertions(3)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  let drainEmittedAt = 0
  let secondWriteAt = 0
  let resolveSecondWrite
  const secondWrite = new Promise((resolve) => {
    resolveSecondWrite = resolve
  })

  fastify.get('/', function (request, reply) {
    const raw = reply.raw
    const originalWrite = raw.write.bind(raw)
    const bufferedChunks = []
    let wroteFirstChunk = false

    raw.once('drain', () => {
      for (const bufferedChunk of bufferedChunks) {
        originalWrite(bufferedChunk)
      }
    })

    raw.write = function (chunk, encoding, cb) {
      if (!wroteFirstChunk) {
        wroteFirstChunk = true
        bufferedChunks.push(Buffer.from(chunk))
        sleep(100).then(() => {
          drainEmittedAt = Date.now()
          raw.emit('drain')
        })
        if (typeof cb === 'function') {
          cb()
        }
        return false
      }
      if (!secondWriteAt) {
        secondWriteAt = Date.now()
        resolveSecondWrite()
      }
      return originalWrite(chunk, encoding, cb)
    }

    const stream = new ReadableStream({
      start (controller) {
        controller.enqueue(Buffer.from('chunk-1'))
      },
      pull (controller) {
        controller.enqueue(Buffer.from('chunk-2'))
        controller.close()
      }
    })

    reply.header('content-type', 'text/plain').send(stream)
  })

  await fastify.listen({ port: 0 })

  const response = await undiciFetch(`http://localhost:${fastify.server.address().port}/`)
  const bodyPromise = response.text()

  await secondWrite
  await sleep(120)
  const body = await bodyPromise

  expect(response.status).toBe(200)
  expect(body).toBe('chunk-1chunk-2')
  expect(secondWriteAt >= drainEmittedAt).toBeTruthy()
})

test('WebStream should stop reading on drain after response destroy', async () => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  let cancelCalled = false
  let resolveCancel
  const cancelPromise = new Promise((resolve) => {
    resolveCancel = resolve
  })

  fastify.get('/', function (request, reply) {
    const raw = reply.raw
    const originalWrite = raw.write.bind(raw)
    let firstWrite = true

    raw.write = function (chunk, encoding, cb) {
      if (firstWrite) {
        firstWrite = false
        if (typeof cb === 'function') {
          cb()
        }
        queueMicrotask(() => {
          raw.destroy()
          raw.emit('drain')
        })
        return false
      }
      return originalWrite(chunk, encoding, cb)
    }

    const stream = new ReadableStream({
      start (controller) {
        controller.enqueue(Buffer.from('chunk-1'))
      },
      pull (controller) {
        controller.enqueue(Buffer.from('chunk-2'))
        controller.close()
      },
      cancel () {
        cancelCalled = true
        resolveCancel()
      }
    })

    reply.header('content-type', 'text/plain').send(stream)
  })

  await new Promise((resolve, reject) => {
    fastify.listen({ port: 0 }, err => {
      if (err) return reject(err)
      resolve()
    })
  })

  await new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${fastify.server.address().port}/`, (res) => {
      res.once('close', resolve)
      res.resume()
    })
    req.once('error', (err) => {
      if (err.code === 'ECONNRESET') {
        resolve()
      } else {
        reject(err)
      }
    })
  })

  await cancelPromise
  expect(true).toBeTruthy()
  expect(cancelCalled).toBe(true)
})

test('WebStream should warn when headers already sent', async () => {
  expect.assertions(2)

  let warnCalled = false
  const spyLogger = {
    level: 'warn',
    fatal: () => { },
    error: () => { },
    warn: (msg) => {
      if (typeof msg === 'string' && msg.includes('use res.writeHead in stream mode')) {
        warnCalled = true
      }
    },
    info: () => { },
    debug: () => { },
    trace: () => { },
    child: () => spyLogger
  }

  const fastify = Fastify({ loggerInstance: spyLogger })
  onTestFinished(() => fastify.close())

  fastify.get('/', function (request, reply) {
    reply.raw.writeHead(200, { 'content-type': 'text/plain' })
    const stream = new ReadableStream({
      start (controller) {
        controller.enqueue('hello')
        controller.close()
      }
    })
    reply.send(stream)
  })

  await fastify.listen({ port: 0 })

  const response = await fetch(`http://localhost:${fastify.server.address().port}/`)
  expect(response.status).toBe(200)
  expect(warnCalled).toBe(true)
})
