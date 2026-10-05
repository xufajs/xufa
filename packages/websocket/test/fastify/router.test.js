'use strict'

const net = require('node:net')

const Fastify = require('@xufa/http')
const fastifyWebsocket = require('../../lib/plugin')
const WebSocket = require('../..')
const get = require('node:http').get

const withResolvers = function () {
  let promiseResolve, promiseReject
  const promise = new Promise((resolve, reject) => {
    promiseResolve = resolve
    promiseReject = reject
  })
  return { promise, resolve: promiseResolve, reject: promiseReject }
}

test('Should expose a websocket on prefixed route', (end) => {
  expect.assertions(4)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(
    function (instance, _opts, next) {
      instance.get('/echo', { websocket: true }, function (socket) {
        expect(this.prefix).toEqual('/baz')
        socket.send('hello client')
        onTestFinished(() => socket.terminate())

        socket.once('message', (chunk) => {
          expect(chunk.toString()).toEqual('hello server')
          end()
        })
      })
      next()
    },
    { prefix: '/baz' }
  )

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/baz/echo')
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

test('Should expose a websocket on prefixed route with /', (end) => {
  expect.assertions(3)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(
    function (instance, _opts, next) {
      instance.get('/', { websocket: true }, (socket) => {
        socket.send('hello client')
        onTestFinished(() => socket.terminate())

        socket.once('message', (chunk) => {
          expect(chunk.toString()).toEqual('hello server')
          end()
        })
      })
      next()
    },
    { prefix: '/baz' }
  )

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/baz')
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

test('Should expose websocket and http route', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  const { promise: clientPromise, resolve: clientResolve } = withResolvers()
  const { promise: serverPromise, resolve: serverResolve } = withResolvers()

  fastify.register(fastifyWebsocket)
  fastify.register(
    function (instance, _opts, next) {
      instance.route({
        method: 'GET',
        url: '/echo',
        handler: (_request, reply) => {
          reply.send({ hello: 'world' })
        },
        wsHandler: (socket) => {
          socket.send('hello client')
          onTestFinished(() => socket.terminate())

          socket.once('message', (chunk) => {
            expect(chunk.toString()).toEqual('hello server')
            clientResolve()
          })
        }
      })
      next()
    },
    { prefix: '/baz' }
  )

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const url = '//localhost:' + (fastify.server.address()).port + '/baz/echo'
    const ws = new WebSocket('ws:' + url)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    onTestFinished(() => client.destroy())

    client.setEncoding('utf8')
    client.write('hello server')

    client.once('data', chunk => {
      expect(chunk).toEqual('hello client')
      client.end()
    })
    get('http:' + url, function (response) {
      let data = ''

      // A chunk of data has been recieved.
      response.on('data', (chunk) => {
        data += chunk
      })

      // The whole response has been received. Print out the result.
      response.on('end', () => {
        expect(data).toEqual('{"hello":"world"}')
        serverResolve()
      })
    })
  })

  return Promise.all([clientPromise, serverPromise])

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Should close on unregistered path (with no wildcard route websocket handler defined)', (end) => {
  expect.assertions(2)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify
    .register(fastifyWebsocket)
    .register(async function () {
      fastify.get('/*', (_request, reply) => {
        reply.send('hello world')
      })

      fastify.get('/echo', { websocket: true }, (socket) => {
        socket.on('message', message => {
          try {
            socket.send(message)
          } catch (err) {
            socket.send(err.message)
          }
        })

        onTestFinished(() => socket.terminate())
      })
    })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    onTestFinished(() => client.destroy())
    ws.on('close', () => {
      expect(true).toBeTruthy()
      end()
    })
  })
})

test('Should use wildcard websocket route when (with a normal http wildcard route defined as well)', (end) => {
  expect.assertions(2)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify
    .register(fastifyWebsocket)
    .register(async function (fastify) {
      fastify.route({
        method: 'GET',
        url: '/*',
        handler: (_, reply) => {
          reply.send({ hello: 'world' })
        },
        wsHandler: (socket) => {
          socket.send('hello client')
          onTestFinished(() => socket.terminate())

          socket.once('message', () => {
            socket.close()
          })
        }
      })
    })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    onTestFinished(() => client.destroy())

    client.once('data', chunk => {
      expect(chunk).toEqual('hello client')
      client.end()
      end()
    })
  })
})

test('Should call wildcard route handler on unregistered path', (end) => {
  expect.assertions(3)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify
    .register(fastifyWebsocket)
    .register(async function (fastify) {
      fastify.get('/*', { websocket: true }, (socket) => {
        socket.on('message', () => {
          try {
            socket.send('hi from wildcard route handler')
          } catch (err) {
            socket.send(err.message)
          }
        })
        onTestFinished(() => socket.terminate())
      })
    })

  fastify.get('/echo', { websocket: true }, (socket) => {
    socket.on('message', () => {
      try {
        socket.send('hi from /echo handler')
      } catch (err) {
        socket.send(err.message)
      }
    })

    onTestFinished(() => socket.terminate())
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port)
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    onTestFinished(() => client.destroy())

    ws.on('open', () => {
      ws.send('hi from client')
      client.end()
    })

    ws.on('message', message => {
      expect(message.toString()).toEqual('hi from wildcard route handler')
    })

    ws.on('close', () => {
      expect(true).toBeTruthy()
      end()
    })
  })
})

test('Should invoke the correct handler depending on the headers', (end) => {
  expect.assertions(4)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function () {
    fastify.route({
      method: 'GET',
      url: '/',
      handler: (_request, reply) => {
        reply.send('hi from handler')
      },
      wsHandler: (socket) => {
        socket.send('hi from wsHandler')
        onTestFinished(() => socket.terminate())
      }
    })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()

    const port = fastify.server.address().port

    const httpClient = net.createConnection({ port }, () => {
      httpClient.write('GET / HTTP/1.1\r\nHOST: localhost\r\n\r\n')
      httpClient.once('data', data => {
        expect(data.toString()).toMatch(/hi from handler/i)
        httpClient.end()
      })
    })

    const wsClient = net.createConnection({ port }, () => {
      wsClient.write('GET / HTTP/1.1\r\nConnection: upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n')
      // The 101 response and the first websocket frame are separate writes, so
      // they can arrive in separate chunks; accumulate instead of asserting on
      // the first chunk only.
      let received = ''
      const onData = data => {
        received += data.toString()
        if (!/hi from wsHandler/i.test(received)) {
          return
        }
        wsClient.removeListener('data', onData)
        expect(received).toMatch(/hi from wsHandler/i)
        wsClient.end(() => {
          expect(true).toBeTruthy()
          setTimeout(end, 100)
        })
      }
      wsClient.on('data', onData)
    })
  })
})

test('Should call the wildcard handler if a no other non-websocket route with path exists', (end) => {
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.get('/*', { websocket: true }, (socket) => {
      expect('called').toBeTruthy()
      socket.close()
      onTestFinished(() => socket.terminate())
    })

    fastify.get('/http', (_request, reply) => {
      expect.fail('Should not call http handler')
      reply.send('http route')
    })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/http2')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    onTestFinished(() => client.destroy())

    client.setEncoding('utf8')
    client.end(end)
  })
})

test('Should close the connection if a non-websocket route with path exists', (end) => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.get('/*', { websocket: true }, (socket) => {
      expect.fail('called')
      onTestFinished(() => socket.terminate())
    })

    fastify.get('/http', (_request, reply) => {
      expect.fail('Should not call /http handler')
      reply.send('http route')
    })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/http')
    ws.on('close', (code) => {
      expect(code).toEqual(1005)
      end()
    })
  })
})

test('Should throw on wrong HTTP method', (end) => {
  expect.assertions(2)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.post('/echo', { websocket: true }, (socket) => {
      socket.on('message', message => {
        try {
          socket.send(message)
        } catch (err) {
          socket.send(err.message)
        }
      })
      onTestFinished(() => socket.terminate())
    })

    fastify.get('/http', (_request, reply) => {
      expect.fail('Should not call /http handler')
      reply.send('http route')
    })
  })

  fastify.listen({ port: 0 }, (err) => {
    expect(err).toBeTruthy()
    expect(err.message).toEqual('websocket handler can only be declared in GET method')
    end()
  })
})

test('Should throw on invalid wsHandler', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  await fastify.register(fastifyWebsocket)
  try {
    fastify.route({
      method: 'GET',
      url: '/echo',
      handler: (_, reply) => {
        reply.send({ hello: 'world' })
      },
      wsHandler: 'hello'
    }, { prefix: '/baz' })
  } catch (err) {
    expect(err.message).toEqual('invalid wsHandler function')
  }
})

test('Should open on registered path', (end) => {
  expect.assertions(2)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(async function (fastify) {
    fastify.get('/echo', { websocket: true }, (socket) => {
      socket.on('message', message => {
        try {
          socket.send(message)
        } catch (err) {
          socket.send(err.message)
        }
      })

      onTestFinished(() => socket.terminate())
    })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/echo')
    ws.on('open', () => {
      expect(true).toBeTruthy()
      client.end()
      end()
    })

    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    onTestFinished(() => client.destroy())
  })
})

test('Should send message and close', async () => {
  expect.assertions(5)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)

  const { promise: clientPromise, resolve: clientResolve } = withResolvers()
  const { promise: serverPromise, resolve: serverResolve } = withResolvers()

  fastify.register(async function (fastify) {
    fastify.get('/', { websocket: true }, (socket) => {
      socket.on('message', message => {
        expect(message.toString()).toEqual('hi from client')
        socket.send('hi from server')
      })

      socket.on('close', () => {
        expect(true).toBeTruthy()
        serverResolve()
      })

      onTestFinished(() => socket.terminate())
    })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    onTestFinished(() => client.destroy())

    ws.on('message', message => {
      expect(message.toString()).toEqual('hi from server')
    })

    ws.on('open', () => {
      ws.send('hi from client')
      client.end()
    })

    ws.on('close', () => {
      expect(true).toBeTruthy()
      clientResolve()
    })
  })

  return Promise.all([clientPromise, serverPromise])

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Should return 404 on http request', (end) => {
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.get('/', { websocket: true }, (socket) => {
      socket.on('message', message => {
        expect(message.toString()).toEqual('hi from client')
        socket.send('hi from server')
      })

      socket.on('close', () => {
        expect(true).toBeTruthy()
      })

      onTestFinished(() => socket.terminate())
    })
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }).then((response) => {
    expect(response.payload).toEqual('')
    expect(response.statusCode).toEqual(404)
    end()
  })
})

test('Should pass route params to per-route handlers', (end) => {
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (socket, request) => {
      const params = request.params
      expect(Object.keys(params).length).toEqual(0)
      socket.send('empty')
      socket.close()
    })
    fastify.get('/ws/:id', { websocket: true }, (socket, request) => {
      const params = request.params
      expect(params.id).toEqual('foo')
      socket.send(params.id)
      socket.close()
    })
  })

  fastify.listen({ port: 0 }, err => {
    let pending = 2
    expect(err).toBeFalsy()
    const ws = new WebSocket(
      'ws://localhost:' + (fastify.server.address()).port + '/ws/foo'
    )
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    const ws2 = new WebSocket(
      'ws://localhost:' + (fastify.server.address()).port + '/ws'
    )
    const client2 = WebSocket.createWebSocketStream(ws2, { encoding: 'utf8' })
    onTestFinished(() => client.destroy())
    onTestFinished(() => client2.destroy())

    client.setEncoding('utf8')
    client2.setEncoding('utf8')

    client.once('data', chunk => {
      expect(chunk).toEqual('foo')
      client.end()
      if (--pending === 0) end()
    })
    client2.once('data', chunk => {
      expect(chunk).toEqual('empty')
      client2.end()
      if (--pending === 0) end()
    })
  })
})

test('Should not throw error when register empty get with prefix', (end) => {
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)

  fastify.register(
    function (instance, _opts, next) {
      instance.get('/', { websocket: true }, (socket) => {
        socket.on('message', message => {
          expect(message.toString()).toEqual('hi from client')
          socket.send('hi from server')
        })
      })
      next()
    },
    { prefix: '/baz' }
  )

  fastify.listen({ port: 0 }, err => {
    if (err) expect(err).toBeFalsy()

    const ws = new WebSocket(
      'ws://localhost:' + fastify.server.address().port + '/baz/'
    )

    ws.on('open', () => {
      expect('Done').toBeTruthy()
      ws.close()
      end()
    })
  })
})

test('Should expose fastify instance to websocket per-route handler', (end) => {
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, function wsHandler (socket) {
      expect(this).toEqual(fastify)
      socket.send('empty')
      socket.close()
    })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const ws = new WebSocket(
      'ws://localhost:' + (fastify.server.address()).port + '/ws'
    )
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    onTestFinished(() => client.destroy())

    client.setEncoding('utf8')

    client.once('data', chunk => {
      expect(chunk).toEqual('empty')
      client.end()
      end()
    })
  })
})

test('Should have access to decorators in per-route handler', (end) => {
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.decorateRequest('str', 'it works!')
  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, function wsHandler (socket, request) {
      expect(request.str).toEqual('it works!')
      socket.send('empty')
      socket.close()
    })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const ws = new WebSocket('ws://localhost:' + (fastify.server.address()).port + '/ws')
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
    onTestFinished(() => client.destroy())

    client.once('data', chunk => {
      expect(chunk).toEqual('empty')
      client.end()
      end()
    })
  })
})

test('should call `destroy` when exception is thrown inside async handler', (end) => {
  expect.assertions(2)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, async function wsHandler (socket) {
      socket.on('close', code => {
        expect(code).toEqual(1006)
        end()
      })
      throw new Error('something wrong')
    })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    const ws = new WebSocket(
      'ws://localhost:' + (fastify.server.address()).port + '/ws'
    )
    const client = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })

    client.on('error', (_) => { })
    onTestFinished(() => client.destroy())
  })
})

test('should call default non websocket fastify route when no match is found', (end) => {
  expect.assertions(2)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.get('/ws', function handler (_request, reply) {
      reply.send({ hello: 'world' })
    })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    get('http://localhost:' + (fastify.server.address()).port + '/wrong-route', function (response) {
      expect(response.statusCode).toEqual(404)
      end()
    })
  })
})

test('register a non websocket route', (end) => {
  expect.assertions(2)
  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.register(fastifyWebsocket)
  fastify.register(async function (fastify) {
    fastify.get('/ws', function handler (_request, reply) {
      reply.send({ hello: 'world' })
    })
  })

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    get('http://localhost:' + (fastify.server.address()).port + '/ws', function (response) {
      let data = ''

      response.on('data', (chunk) => {
        data += chunk
      })

      response.on('end', () => {
        expect(data).toEqual('{"hello":"world"}')
        end()
      })
    })
  })
})
