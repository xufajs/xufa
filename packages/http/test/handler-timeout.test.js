'use strict'


const net = require('node:net')
const Fastify = require('..')
const { Readable } = require('node:stream')
const { kTimeoutTimer, kOnAbort } = require('../lib/symbols')

// --- Option validation ---

test('server-level handlerTimeout defaults to 0 in initialConfig', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  expect(fastify.initialConfig.handlerTimeout).toBe(0)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('server-level handlerTimeout: 5000 is accepted and exposed in initialConfig', async () => {
  expect.assertions(1)
  const fastify = Fastify({ handlerTimeout: 5000 })
  expect(fastify.initialConfig.handlerTimeout).toBe(5000)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('route-level handlerTimeout rejects invalid values', async () => {
  const fastify = Fastify()

  expect(() => {
    fastify.get('/a', { handlerTimeout: 'fast' }, async () => 'ok')
  }).toThrow(expect.objectContaining({ code: 'XUFA_ERR_ROUTE_HANDLER_TIMEOUT_OPTION_NOT_INT' }))

  expect(() => {
    fastify.get('/b', { handlerTimeout: -1 }, async () => 'ok')
  }).toThrow(expect.objectContaining({ code: 'XUFA_ERR_ROUTE_HANDLER_TIMEOUT_OPTION_NOT_INT' }))

  expect(() => {
    fastify.get('/c', { handlerTimeout: 1.5 }, async () => 'ok')
  }).toThrow(expect.objectContaining({ code: 'XUFA_ERR_ROUTE_HANDLER_TIMEOUT_OPTION_NOT_INT' }))

  expect(() => {
    fastify.get('/d', { handlerTimeout: 0 }, async () => 'ok')
  }).toThrow(expect.objectContaining({ code: 'XUFA_ERR_ROUTE_HANDLER_TIMEOUT_OPTION_NOT_INT' }))
})

// --- Lazy signal without handlerTimeout ---

test('when handlerTimeout is 0 (default), request.signal is lazily created', async () => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.get('/', async (request) => {
    const signal = request.signal
    expect(signal instanceof AbortSignal).toBeTruthy()
    expect(signal.aborted).toBe(false)
    return { ok: true }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  expect(res.statusCode).toBe(200)
})

test('client disconnect aborts lazily created signal (no handlerTimeout)', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  let signalAborted = false

  fastify.get('/', async (request) => {
    await new Promise((resolve) => {
      request.signal.addEventListener('abort', () => {
        signalAborted = true
        resolve()
      })
    })
    return 'should not reach'
  })

  await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const address = fastify.server.address()
  await new Promise((resolve) => {
    const client = net.connect(address.port, () => {
      client.write('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n')
      setTimeout(() => {
        client.destroy()
        setTimeout(resolve, 100)
      }, 50)
    })
  })

  expect(signalAborted).toBe(true)
})

// --- Basic timeout behavior ---

test('slow handler returns 503 with XUFA_ERR_HANDLER_TIMEOUT', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.get('/', { handlerTimeout: 50 }, async () => {
    await new Promise(resolve => setTimeout(resolve, 500))
    return 'too late'
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  expect(res.statusCode).toBe(503)
  expect(JSON.parse(res.payload).code).toBe('XUFA_ERR_HANDLER_TIMEOUT')
})

test('fast handler completes normally with 200', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.get('/', { handlerTimeout: 5000 }, async () => {
    return { hello: 'world' }
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  expect(res.statusCode).toBe(200)
  expect(JSON.parse(res.payload)).toEqual({ hello: 'world' })
})

// --- Per-route override ---

test('route-level handlerTimeout overrides server default', async () => {
  expect.assertions(4)
  const fastify = Fastify({ handlerTimeout: 5000 })

  fastify.get('/slow', { handlerTimeout: 50 }, async () => {
    await new Promise(resolve => setTimeout(resolve, 500))
    return 'too late'
  })

  fastify.get('/fast', async () => {
    return { ok: true }
  })

  const resSlow = await fastify.inject({ method: 'GET', url: '/slow' })
  expect(resSlow.statusCode).toBe(503)
  expect(JSON.parse(resSlow.payload).code).toBe('XUFA_ERR_HANDLER_TIMEOUT')

  const resFast = await fastify.inject({ method: 'GET', url: '/fast' })
  expect(resFast.statusCode).toBe(200)
  expect(JSON.parse(resFast.payload)).toEqual({ ok: true })
})

// --- request.signal behavior ---

test('request.signal is an AbortSignal when handlerTimeout > 0', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.get('/', { handlerTimeout: 5000 }, async (request) => {
    expect(request.signal instanceof AbortSignal).toBeTruthy()
    expect(request.signal.aborted).toBe(false)
    return 'ok'
  })

  await fastify.inject({ method: 'GET', url: '/' })
})

test('request.signal aborts when timeout fires with reason', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  let signalReason = null
  fastify.get('/', { handlerTimeout: 50 }, async (request) => {
    request.signal.addEventListener('abort', () => {
      signalReason = request.signal.reason
    })
    await new Promise(resolve => setTimeout(resolve, 500))
    return 'too late'
  })

  await fastify.inject({ method: 'GET', url: '/' })
  expect(signalReason !== null).toBeTruthy()
  expect(signalReason.code).toBe('XUFA_ERR_HANDLER_TIMEOUT')
})

// --- Streaming response ---

test('streaming response: timer clears when response finishes', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  fastify.get('/', { handlerTimeout: 5000 }, async (request, reply) => {
    const stream = new Readable({
      read () {
        this.push('hello')
        this.push(null)
      }
    })
    reply.type('text/plain').send(stream)
    return reply
  })

  await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const address = fastify.server.address()
  const res = await fetch(`http://localhost:${address.port}/`)
  expect(res.status).toBe(200)
})

// --- SSE with reply.hijack() ---

test('reply.hijack() clears timeout timer', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  fastify.get('/', { handlerTimeout: 100 }, async (request, reply) => {
    reply.hijack()
    // Write after the original timeout would have fired
    await new Promise(resolve => setTimeout(resolve, 200))
    reply.raw.writeHead(200, { 'Content-Type': 'text/plain' })
    reply.raw.end('hijacked response')
  })

  await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const address = fastify.server.address()
  const res = await fetch(`http://localhost:${address.port}/`)
  expect(res.status).toBe(200)
})

// --- Error handler integration ---

test('route-level errorHandler receives XUFA_ERR_HANDLER_TIMEOUT', async () => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.get('/', {
    handlerTimeout: 50,
    errorHandler: (error, request, reply) => {
      expect(error.code).toBe('XUFA_ERR_HANDLER_TIMEOUT')
      reply.code(504).send({ custom: 'timeout' })
    }
  }, async () => {
    await new Promise(resolve => setTimeout(resolve, 500))
    return 'too late'
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  expect(res.statusCode).toBe(504)
  expect(JSON.parse(res.payload)).toEqual({ custom: 'timeout' })
})

// --- Timer cleanup / no leaks ---

test('timer is cleaned up after fast response (no leak)', async () => {
  expect.assertions(3)
  const fastify = Fastify()

  let capturedRequest
  fastify.get('/', { handlerTimeout: 60000 }, async (request) => {
    capturedRequest = request
    return 'fast'
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  expect(res.statusCode).toBe(200)
  // Timer and listener should be cleaned up
  expect(capturedRequest[kTimeoutTimer]).toBe(null)
  expect(capturedRequest[kOnAbort]).toBe(null)
})

// --- routeOptions exposure ---

test('request.routeOptions.handlerTimeout reflects configured value', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.get('/', { handlerTimeout: 3000 }, async (request) => {
    expect(request.routeOptions.handlerTimeout).toBe(3000)
    return 'ok'
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  expect(res.statusCode).toBe(200)
})

test('request.routeOptions.handlerTimeout reflects server default', async () => {
  expect.assertions(2)
  const fastify = Fastify({ handlerTimeout: 7000 })

  fastify.get('/', async (request) => {
    expect(request.routeOptions.handlerTimeout).toBe(7000)
    return 'ok'
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  expect(res.statusCode).toBe(200)
})

// --- Client disconnect aborts signal ---

test('client disconnect aborts request.signal', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  let signalAborted = false

  fastify.get('/', { handlerTimeout: 5000 }, async (request) => {
    await new Promise((resolve) => {
      request.signal.addEventListener('abort', () => {
        signalAborted = true
        resolve()
      })
    })
    return 'should not reach'
  })

  await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const address = fastify.server.address()
  await new Promise((resolve) => {
    const client = net.connect(address.port, () => {
      client.write('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n')
      setTimeout(() => {
        client.destroy()
        // Give the server time to process the close event
        setTimeout(resolve, 100)
      }, 50)
    })
  })

  expect(signalAborted).toBe(true)
})

// --- Race: handler completes just as timeout fires ---

test('no double-send when handler completes near timeout boundary', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.get('/', { handlerTimeout: 50 }, async (request, reply) => {
    // Respond just before timeout
    await new Promise(resolve => setTimeout(resolve, 40))
    reply.send({ ok: true })
    return reply
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  // Should get either 200 or 503 depending on race, but never crash
  expect(res.statusCode === 200 || res.statusCode === 503).toBeTruthy()
  // Verify response is valid JSON regardless of which won the race
  expect(JSON.parse(res.payload)).toBeTruthy()
})

// --- Server default inherited by routes ---

test('routes inherit server-level handlerTimeout', async () => {
  expect.assertions(3)
  const fastify = Fastify({ handlerTimeout: 50 })

  fastify.get('/', async (request) => {
    // Verify the signal is present (inherited from server default)
    expect(request.signal instanceof AbortSignal).toBeTruthy()
    await new Promise(resolve => setTimeout(resolve, 500))
    return 'too late'
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  expect(res.statusCode).toBe(503)
  expect(JSON.parse(res.payload).code).toBe('XUFA_ERR_HANDLER_TIMEOUT')
})
