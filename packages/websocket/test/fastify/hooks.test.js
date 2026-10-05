'use strict'


const net = require('node:net')
const Fastify = require('@xufa/http')
const fastifyWebsocket = require('../../lib/plugin')
const WebSocket = require('../..')
const split = require('split2')

test('Should run onRequest, preValidation, preHandler hooks', (end) => {
  expect.assertions(8)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('onRequest', async ({ routeOptions: { schema: { hide } } }) => {
      expect('called').toBeTruthy()
      expect(hide).toBe(true)
    })
    fastify.addHook('preParsing', async () => expect('called').toBeTruthy())
    fastify.addHook('preValidation', async () => expect('called').toBeTruthy())
    fastify.addHook('preHandler', async () => expect('called').toBeTruthy())

    fastify.get('/echo', { websocket: true }, (socket) => {
      socket.send('hello client')
      onTestFinished(() => socket.terminate())

      socket.once('message', (chunk) => {
        expect(chunk.toString()).toEqual('hello server')
        end()
      })
    })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    onTestFinished(() => client.destroy())

    client.setEncoding('utf8')
    client.write('hello server')

    client.once('data', chunk => {
      expect(chunk).toEqual('hello client')
      client.end()
    })
  })
})

test('Should not run onTimeout hook', (end) => {
  expect.assertions(2)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function () {
    fastify.addHook('onTimeout', async () => expect.fail('called'))

    fastify.get('/echo', { websocket: true }, (socket, request) => {
      socket.send('hello client')
      request.raw.setTimeout(50)
      onTestFinished(() => socket.terminate())
    })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    onTestFinished(() => client.destroy())

    client.once('data', chunk => {
      expect(chunk).toEqual('hello client')
      end()
    })
  })
})

test('Should run onError hook before handler is executed (error thrown in onRequest hook)', (end) => {
  expect.assertions(3)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('onRequest', async () => { throw new Error('Fail') })
    fastify.addHook('onError', async () => expect('called').toBeTruthy())

    fastify.get('/echo', { websocket: true }, () => {
      expect.fail()
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    ws.on('unexpected-response', (_request, response) => {
      expect(response.statusCode).toEqual(500)
      end()
    })
  })
})

test('Should run onError hook before handler is executed (error thrown in preValidation hook)', (end) => {
  expect.assertions(3)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('preValidation', async () => {
      await Promise.resolve()
      throw new Error('Fail')
    })

    fastify.addHook('onError', async () => expect('called').toBeTruthy())

    fastify.get('/echo', { websocket: true }, () => {
      expect.fail()
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    ws.on('unexpected-response', (_request, response) => {
      expect(response.statusCode).toEqual(500)
      end()
    })
  })
})

test('onError hooks can send a reply and prevent hijacking', (end) => {
  expect.assertions(3)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('preValidation', async () => {
      await Promise.resolve()
      throw new Error('Fail')
    })

    fastify.addHook('onError', async (_request, reply) => {
      expect('called').toBeTruthy()
      await reply.code(501).send('there was an error')
    })

    fastify.get('/echo', { websocket: true }, () => {
      expect.fail()
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    ws.on('unexpected-response', (_request, response) => {
      expect(response.statusCode).toEqual(501)
      end()
    })
  })
})

test('setErrorHandler functions can send a reply and prevent hijacking', (end) => {
  expect.assertions(4)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('preValidation', async () => {
      await Promise.resolve()
      throw new Error('Fail')
    })

    fastify.setErrorHandler(async (error, _request, reply) => {
      expect('called').toBeTruthy()
      expect(error).toBeTruthy()
      await reply.code(501).send('there was an error')
    })

    fastify.get('/echo', { websocket: true }, () => {
      expect.fail()
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    ws.on('unexpected-response', (_request, response) => {
      expect(response.statusCode).toEqual(501)
      end()
    })
  })
})

test('Should not run onError hook if reply was already hijacked (error thrown in websocket handler)', (end) => {
  expect.assertions(2)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('onError', async () => expect.fail('called'))

    fastify.get('/echo', { websocket: true }, async (socket) => {
      onTestFinished(() => socket.terminate())
      throw new Error('Fail')
    })
  })

  fastify.listen({ port: 0 }, function (err) {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    onTestFinished(() => client.destroy())
    ws.on('close', code => {
      expect(code).toEqual(1006)
      end()
    })
  })
})

test('Should not run preSerialization/onSend hooks', (end) => {
  expect.assertions(2)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook('onSend', async () => expect.fail('called'))
    fastify.addHook('preSerialization', async () => expect.fail('called'))

    fastify.get('/echo', { websocket: true }, async (socket) => {
      socket.send('hello client')
      onTestFinished(() => socket.terminate())
    })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    onTestFinished(() => client.destroy())

    client.once('data', chunk => {
      expect(chunk).toEqual('hello client')
      client.end()
      end()
    })
  })
})

test('Should not hijack reply for a normal http request in the internal onError hook', (end) => {
  expect.assertions(2)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.get('/', async () => {
      throw new Error('Fail')
    })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const port = fastify.server.address().port

    const httpClient = net.createConnection({ port }, () => {
      onTestFinished(() => httpClient.destroy())

      httpClient.write('GET / HTTP/1.1\r\nHOST: localhost\r\n\r\n')
      httpClient.once('data', data => {
        expect(data.toString()).toMatch(/Fail/i)
        end()
      })
      httpClient.end()
    })
  })
})

test('Should run async hooks and still deliver quickly sent messages', (end) => {
  expect.assertions(3)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.addHook(
      'preValidation',
      async () => await new Promise((resolve) => setTimeout(resolve, 25))
    )

    fastify.get('/echo', { websocket: true }, (socket) => {
      socket.send('hello client')
      onTestFinished(() => socket.terminate())

      socket.on('message', (message) => {
        expect(message.toString('utf-8')).toEqual('hello server')
        end()
      })
    })
  })

  fastify.listen({ port: 0 }, (err) => {
    expect(err).toBeFalsy()
    const ws = new WebSocket(
      'ws://localhost:' + fastify.server.address().port + '/echo'
    )
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    onTestFinished(() => client.destroy())

    client.setEncoding('utf8')
    client.write('hello server')

    client.once('data', (chunk) => {
      expect(chunk).toEqual('hello client')
      client.end()
    })
  })
})

test('Should not hijack reply for an normal request to a websocket route that is sent a normal HTTP response in a hook', (end) => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.addHook('preValidation', async (_request, reply) => {
      await Promise.resolve()
      await reply.code(404).send('not found')
    })
    fastify.get('/echo', { websocket: true }, () => {
      expect.fail()
    })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const port = fastify.server.address().port

    const httpClient = net.createConnection({ port }, () => {
      onTestFinished(() => httpClient.destroy())
      httpClient.write('GET /echo HTTP/1.1\r\nHOST: localhost\r\n\r\n')
      httpClient.once('data', data => {
        expect(data.toString()).toMatch(/not found/i)
        end()
      })
      httpClient.end()
    })
  })
})

test('Should not hijack reply for an WS request to a WS route that gets sent a normal HTTP response in a hook', (end) => {
  expect.assertions(2)
  const stream = split(JSON.parse)
  const fastify = Fastify({ logger: { stream } })

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.addHook('preValidation', async (_request, reply) => {
      await reply.code(404).send('not found')
    })
    fastify.get('/echo', { websocket: true }, () => {
      expect.fail()
    })
  })

  stream.on('data', (chunk) => {
    if (chunk.level >= 50) {
      expect.fail()
    }
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')

    ws.on('error', error => {
      expect(error).toBeTruthy()
      ws.close()
      fastify.close()
      end()
    })
  })
})
