'use strict'

const http = require('node:http')
const net = require('node:net')
const split = require('split2')

const Fastify = require('@xufa/http')
const fastifyWebsocket = require('../../lib/plugin')
const WebSocket = require('../..')
const { once, on } = require('node:events')
let timersPromises

try {
  timersPromises = require('node:timers/promises')
} catch {}

test('Should expose a websocket', async () => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (socket) => {
    onTestFinished(() => socket.terminate())

    socket.once('message', (chunk) => {
      expect(chunk.toString()).toEqual('hello server')
      socket.send('hello client')
    })
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  onTestFinished(() => {
    if (ws.readyState) {
      ws.close()
    }
  })

  const chunkPromise = once(ws, 'message')
  await once(ws, 'open')
  ws.send('hello server')

  const [chunk] = await chunkPromise
  expect(chunk.toString()).toEqual('hello client')
  ws.close()
})

test('Should fail if custom errorHandler is not a function', async () => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  try {
    await fastify.register(fastifyWebsocket, { errorHandler: {} })
  } catch (err) {
    expect(err.message).toEqual('invalid errorHandler function')
  }

  fastify.get('/', { websocket: true }, (socket) => {
    onTestFinished(() => socket.terminate())
  })

  try {
    await fastify.listen({ port: 0 })
  } catch (err) {
    expect(err.message).toEqual('invalid errorHandler function')
  }
})

test('Should run custom errorHandler on wildcard route handler error', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  let _resolve
  const p = new Promise((resolve) => {
    _resolve = resolve
  })

  await fastify.register(fastifyWebsocket, {
    errorHandler: function (error) {
      expect(error.message).toEqual('Fail')
      _resolve()
    }
  })

  fastify.get('/*', { websocket: true }, (socket) => {
    socket.on('message', (data) => socket.send(data))
    onTestFinished(() => socket.terminate())
    return Promise.reject(new Error('Fail'))
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  onTestFinished(() => {
    if (ws.readyState) {
      ws.close()
    }
  })

  await p
})

test('Should run custom errorHandler on error inside websocket handler', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  let _resolve
  const p = new Promise((resolve) => {
    _resolve = resolve
  })

  const options = {
    errorHandler: function (error) {
      expect(error.message).toEqual('Fail')
      _resolve()
    }
  }

  await fastify.register(fastifyWebsocket, options)

  fastify.get('/', { websocket: true }, function wsHandler (socket) {
    socket.on('message', (data) => socket.send(data))
    onTestFinished(() => socket.terminate())
    throw new Error('Fail')
  })

  await fastify.listen({ port: 0 })
  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)

  onTestFinished(() => {
    if (ws.readyState) {
      ws.close()
    }
  })

  await p
})

test('Should run custom errorHandler on error inside async websocket handler', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  let _resolve
  const p = new Promise((resolve) => {
    _resolve = resolve
  })

  const options = {
    errorHandler: function (error) {
      expect(error.message).toEqual('Fail')
      _resolve()
    }
  }

  await fastify.register(fastifyWebsocket, options)

  fastify.get('/', { websocket: true }, async function wsHandler (socket) {
    socket.on('message', (data) => socket.send(data))
    onTestFinished(() => socket.terminate())
    throw new Error('Fail')
  })

  await fastify.listen({ port: 0 })
  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  onTestFinished(() => {
    if (ws.readyState) {
      ws.close()
    }
  })

  await p
})

test('Should run custom errorHandler when the raw socket emits an error', async () => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  let _resolve
  const p = new Promise((resolve) => {
    _resolve = resolve
  })

  await fastify.register(fastifyWebsocket, {
    errorHandler: function (error, socket, request, reply) {
      expect(error.code).toEqual('WS_ERR_UNEXPECTED_RSV_2_3')
      expect(request.ws).toEqual(true)
      socket.terminate()
      _resolve()
    }
  })

  fastify.get('/', { websocket: true }, () => {})

  await fastify.listen({ port: 0 })

  const client = new WebSocket('ws://localhost:' + fastify.server.address().port)
  onTestFinished(() => {
    if (client.readyState) {
      client.close()
    }
  })

  await once(client, 'open')

  // Write an invalid frame directly to the underlying TCP socket so the
  // server-side websocket emits an 'error' event after the connection is
  // established.
  client._socket.write(Buffer.from([0xa2, 0x00]))

  await p
})

test('Should handle raw socket errors while upgrade hooks are running', async () => {
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  await fastify.register(fastifyWebsocket)

  let enterHook
  const hookEntered = new Promise((resolve) => {
    enterHook = resolve
  })

  fastify.addHook('onRequest', async () => {
    enterHook()
    await new Promise((resolve) => setTimeout(resolve, 100))
  })

  fastify.get('/', { websocket: true }, () => {})

  await fastify.listen({ port: 0 })

  const client = net.connect(fastify.server.address().port, '127.0.0.1', () => {
    client.write(
      'GET / HTTP/1.1\r\n' +
      'Host: localhost\r\n' +
      'Connection: Upgrade\r\n' +
      'Upgrade: websocket\r\n' +
      'Sec-WebSocket-Version: 13\r\n' +
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n'
    )
  })
  client.on('error', () => {})

  await hookEntered
  client.resetAndDestroy()
  await new Promise((resolve) => setTimeout(resolve, 200))

  expect(fastify.server.listening).toBe(true)
})

test('Should be able to pass custom options to ws', async () => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  const options = {
    verifyClient: function (info) {
      expect(info.req.headers['x-custom-header']).toEqual('fastify is awesome !')

      return true
    }
  }

  await fastify.register(fastifyWebsocket, { options })

  fastify.get('/*', { websocket: true }, (socket) => {
    socket.on('message', (data) => socket.send(data))
    onTestFinished(() => socket.terminate())
  })

  await fastify.listen({ port: 0 })

  const clientOptions = { headers: { 'x-custom-header': 'fastify is awesome !' } }
  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port, clientOptions)
  const chunkPromise = once(ws, 'message')
  await once(ws, 'open')
  onTestFinished(() => {
    if (ws.readyState) {
      ws.close()
    }
  })

  ws.send('hello')

  const [chunk] = await chunkPromise
  expect(chunk.toString()).toEqual('hello')
  ws.close()
})

test('Should warn if path option is provided to ws', async () => {
  expect.assertions(3)
  const logStream = split(JSON.parse)
  const fastify = Fastify({
    logger: {
      stream: logStream,
      level: 'warn'
    }
  })

  logStream.once('data', line => {
    expect(line.msg).toEqual('ws server path option shouldn\'t be provided, use a route instead')
    expect(line.level).toEqual(40)
  })

  onTestFinished(() => fastify.close())

  const options = { path: '/' }
  await fastify.register(fastifyWebsocket, { options })

  fastify.get('/*', { websocket: true }, (socket) => {
    socket.on('message', (data) => socket.send(data))
    onTestFinished(() => socket.terminate())
  })

  await fastify.listen({ port: 0 })

  const clientOptions = { headers: { 'x-custom-header': 'fastify is awesome !' } }
  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port, clientOptions)
  const chunkPromise = once(ws, 'message')
  await once(ws, 'open')
  onTestFinished(() => {
    if (ws.readyState) {
      ws.close()
    }
  })

  ws.send('hello')

  const [chunk] = await chunkPromise
  expect(chunk.toString()).toEqual('hello')
  ws.close()
})

test('Should be able to pass a custom server option to ws', async () => {
  // We create an external server
  const externalServerPort = 3000
  const externalServer = http
    .createServer()
    .on('connection', (socket) => {
      socket.unref()
    })
    .listen(externalServerPort, 'localhost')

  const fastify = Fastify()
  onTestFinished(() => {
    externalServer.close()
    fastify.close()
  })

  const options = {
    server: externalServer
  }

  await fastify.register(fastifyWebsocket, { options })

  fastify.get('/', { websocket: true }, (socket) => {
    socket.on('message', (data) => socket.send(data))
    onTestFinished(() => socket.terminate())
  })

  await fastify.ready()

  const ws = new WebSocket('ws://localhost:' + externalServerPort)
  const chunkPromise = once(ws, 'message')
  await once(ws, 'open')
  onTestFinished(() => {
    if (ws.readyState) {
      ws.close()
    }
  })

  ws.send('hello')

  const [chunk] = await chunkPromise
  expect(chunk.toString()).toEqual('hello')
  ws.close()
})

test('Should remove the upgrade listener from a custom server on close', async () => {
  const externalServer = http.createServer()
  onTestFinished(() => externalServer.close())
  await new Promise((resolve, reject) => {
    externalServer.once('error', reject)
    externalServer.listen(0, resolve)
  })

  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  await fastify.register(fastifyWebsocket, { options: { server: externalServer } })
  await fastify.ready()

  expect(externalServer.listenerCount('upgrade')).toBe(1)
  await fastify.close()
  expect(externalServer.listenerCount('upgrade')).toBe(0)
})

test('Should be able to pass clientTracking option in false to ws', async () => {
  const fastify = Fastify()

  const options = {
    clientTracking: false
  }

  fastify.register(fastifyWebsocket, { options })

  fastify.get('/*', { websocket: true }, (socket) => {
    socket.close()
  })

  await fastify.listen({ port: 0 })

  await fastify.close()
})

test('Should be able to pass preClose option to override default', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  const preClose = (done) => {
    expect('Custom preclose successfully called').toBeTruthy()

    for (const connection of fastify.websocketServer.clients) {
      connection.close()
    }
    done()
  }

  await fastify.register(fastifyWebsocket, { preClose })

  fastify.get('/', { websocket: true }, (socket) => {
    onTestFinished(() => socket.terminate())

    socket.once('message', (chunk) => {
      expect(chunk.toString()).toEqual('hello server')
      socket.send('hello client')
    })
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  onTestFinished(() => {
    if (ws.readyState) {
      ws.close()
    }
  })

  const chunkPromise = once(ws, 'message')
  await once(ws, 'open')
  ws.send('hello server')

  const [chunk] = await chunkPromise
  expect(chunk.toString()).toEqual('hello client')
  ws.close()

  await fastify.close()
})

test('Should fail if custom preClose is not a function', async () => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  const preClose = 'Not a function'

  try {
    await fastify.register(fastifyWebsocket, { preClose })
  } catch (err) {
    expect(err.message).toEqual('invalid preClose function')
  }

  fastify.get('/', { websocket: true }, (socket) => {
    onTestFinished(() => socket.terminate())
  })

  try {
    await fastify.listen({ port: 0 })
  } catch (err) {
    expect(err.message).toEqual('invalid preClose function')
  }
})

test('Should gracefully close with a connected client', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  await fastify.register(fastifyWebsocket)
  let serverConnEnded

  fastify.get('/', { websocket: true }, (socket) => {
    socket.send('hello client')

    socket.once('message', (chunk) => {
      expect(chunk.toString()).toEqual('hello server')
    })

    serverConnEnded = once(socket, 'close')
    // this connection stays alive untile we close the server
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  const chunkPromise = once(ws, 'message')
  await once(ws, 'open')
  ws.send('hello server')

  const ended = once(ws, 'close')
  const [chunk] = await chunkPromise
  expect(chunk.toString()).toEqual('hello client')
  await fastify.close()
  await ended
  await serverConnEnded
})

test('Should gracefully close when clients attempt to connect after calling close', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  const oldClose = fastify.server.close
  let p
  fastify.server.close = function (cb) {
    const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)

    p = once(ws, 'close').catch((err) => {
      expect(err.message).toEqual('Unexpected server response: 503')
      oldClose.call(this, cb)
    })
  }

  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (socket) => {
    expect('received client connection').toBeTruthy()
    socket.close()
    // this connection stays alive until we close the server
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)

  ws.on('close', () => {
    expect('client 1 closed').toBeTruthy()
  })

  await once(ws, 'open')
  await fastify.close()
  await p
})

/*
  This test sends one message every 10 ms.
  After 50 messages have been sent, we check how many unhandled messages the server has.
  After 100 messages we check this number has not increased but rather decreased
  the number of unhandled messages below a threshold, which means it is still able
  to process message.
*/
test.skipIf(!timersPromises)('Should keep accepting connection', async (ctx) => {
  expect.assertions(1)

  const fastify = Fastify()
  let sent = 0
  let unhandled = 0
  let threshold = 0

  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (socket) => {
    socket.on('message', () => {
      unhandled--
    })

    socket.on('error', err => {
      ctx.error(err)
    })

    /*
      This is a safety check - If the socket is stuck, fastify.close will not run.
      Therefore after 100 messages we forcibly close the socket.
    */
    const safetyInterval = setInterval(() => {
      if (sent < 100) {
        return
      }

      clearInterval(safetyInterval)
      socket.terminate()
    }, 100)
  })

  await fastify.listen({ port: 0 })

  // Setup a client that sends a lot of messages to the server
  const client = new WebSocket('ws://localhost:' + fastify.server.address().port)
  client.on('error', console.error)

  await once(client, 'open')
  const message = Buffer.alloc(1024, Date.now())

  /* eslint-disable no-unused-vars */
  for await (const _ of timersPromises.setInterval(10)) {
    client.send(message.toString(), 10)
    sent++
    unhandled++
    if (sent === 50) {
      threshold = unhandled
    } else if (sent === 100) {
      await fastify.close()
      expect(unhandled <= threshold).toBeTruthy()
      break
    }
  }
})

test('Should keep processing message when many medium sized messages are sent', async (ctx) => {
  expect.assertions(1)

  const fastify = Fastify()
  const total = 200
  let handled = 0

  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (socket) => {
    socket.on('message', () => {
      socket.send('handled')
    })

    socket.on('error', err => {
      ctx.error(err)
    })
  })

  await fastify.listen({ port: 0 })

  // Setup a client that sends a lot of messages to the server
  const client = new WebSocket('ws://localhost:' + fastify.server.address().port)
  client.on('error', console.error)

  await once(client, 'open')

  for (let i = 0; i < total; i++) {
    client.send(Buffer.alloc(160, `${i}`).toString('utf-8'))
  }

  /* eslint-disable no-unused-vars */
  for await (const _ of on(client, 'message')) {
    handled++

    if (handled === total) {
      break
    }
  }

  await fastify.close()
  expect(handled).toEqual(total)
})

test('Should error server if the noServer option is set', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.register(fastifyWebsocket, { options: { noServer: true } })
  expect(fastify.ready()).rejects.toThrow()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Should preserve the prefix in non-websocket routes', async () => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    expect(fastify.prefix).toEqual('/hello')
    fastify.get('/', function (_, reply) {
      expect(this.prefix).toEqual('/hello')
      reply.send('hello')
    })
  }, { prefix: '/hello' })

  await fastify.inject('/hello')
})

test('Should Handle WebSocket errors to avoid Node.js crashes', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, (socket) => {
    socket.on('error', err => {
      expect(err.code).toEqual('WS_ERR_UNEXPECTED_RSV_2_3')
    })
  })

  await fastify.listen({ port: 0 })

  const client = new WebSocket('ws://localhost:' + fastify.server.address().port)
  await once(client, 'open')

  client._socket.write(Buffer.from([0xa2, 0x00]))

  await fastify.close()
})

test('remove all others websocket handlers on close', async () => {
  const fastify = Fastify()

  await fastify.register(fastifyWebsocket)

  await fastify.listen({ port: 0 })

  await fastify.close()

  expect(fastify.server.listeners('upgrade').length).toEqual(0)
})

test('clashing upgrade handler', async () => {
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.server.on('upgrade', (req, socket) => {
    const res = new http.ServerResponse(req)
    res.assignSocket(socket)
    res.end()
    socket.destroy()
  })

  await fastify.register(fastifyWebsocket)

  fastify.get('/', { websocket: true }, () => {
    expect.fail('this should never be invoked')
  })

  await fastify.listen({ port: 0 })

  const ws = new WebSocket('ws://localhost:' + fastify.server.address().port)
  await once(ws, 'error')
})
