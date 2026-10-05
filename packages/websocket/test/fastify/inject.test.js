'use strict'


const Fastify = require('@xufa/http')
const fastifyWebsocket = require('../../lib/plugin')

function buildFastify (t) {
  const fastify = Fastify()
  t.onTestFinished(() => { fastify.close() })
  fastify.register(fastifyWebsocket)
  return fastify
}

test('routes correctly the message', async (ctx) => {
  const fastify = buildFastify(ctx)
  const message = 'hi from client'

  let _resolve
  const promise = new Promise((resolve) => { _resolve = resolve })

  fastify.register(
    async function (instance) {
      instance.get('/ws', { websocket: true }, function (socket) {
        socket.once('message', chunk => {
          _resolve(chunk.toString())
        })
      })
    })

  await fastify.ready()
  const ws = await fastify.injectWS('/ws')
  ws.send(message)
  expect(await promise).toEqual(message)
  ws.terminate()
})

test('redirect on / if no path specified', async (ctx) => {
  const fastify = buildFastify(ctx)
  const message = 'hi from client'

  let _resolve
  const promise = new Promise((resolve) => { _resolve = resolve })

  fastify.register(
    async function (instance) {
      instance.get('/', { websocket: true }, function (socket) {
        socket.once('message', chunk => {
          _resolve(chunk.toString())
        })
      })
    })

  await fastify.ready()
  const ws = await fastify.injectWS()
  ws.send(message)
  expect(await promise).toEqual(message)
  ws.terminate()
})

test('routes correctly the message between two routes', async (ctx) => {
  const fastify = buildFastify(ctx)
  const message = 'hi from client'

  let _resolve
  let _reject
  const promise = new Promise((resolve, reject) => { _resolve = resolve; _reject = reject })

  fastify.register(
    async function (instance) {
      instance.get('/ws', { websocket: true }, function (socket) {
        socket.once('message', () => {
          _reject('wrong-route')
        })
      })

      instance.get('/ws-2', { websocket: true }, function (socket) {
        socket.once('message', chunk => {
          _resolve(chunk.toString())
        })
      })
    })

  await fastify.ready()
  const ws = await fastify.injectWS('/ws-2')
  ws.send(message)
  expect(await promise).toEqual(message)
  ws.terminate()
})

test('use the upgrade context to upgrade if there is some hook', async (ctx) => {
  const fastify = buildFastify(ctx)
  const message = 'hi from client'

  let _resolve
  const promise = new Promise((resolve) => { _resolve = resolve })

  fastify.register(
    async function (instance) {
      instance.addHook('preValidation', async (request, reply) => {
        if (request.headers['api-key'] !== 'some-random-key') {
          return reply.code(401).send()
        }
      })

      instance.get('/', { websocket: true }, function (socket) {
        socket.once('message', chunk => {
          _resolve(chunk.toString())
        })
      })
    })

  await fastify.ready()
  const ws = await fastify.injectWS('/', { headers: { 'api-key': 'some-random-key' } })
  ws.send(message)
  expect(await promise).toEqual(message)
  ws.terminate()
})

test('rejects if the websocket is not upgraded', async (ctx) => {
  const fastify = buildFastify(ctx)

  fastify.register(
    async function (instance) {
      instance.addHook('preValidation', async (_request, reply) => {
        return reply.code(401).send()
      })

      instance.get('/', { websocket: true }, function () {
      })
    })

  await fastify.ready()
  await expect(fastify.injectWS('/')).rejects.toThrow(new Error('Unexpected server response: 401'))
})

test('inject hooks', async (ctx) => {
  const fastify = buildFastify(ctx)
  const message = 'hi from client'

  let _resolve
  const promise = new Promise((resolve) => { _resolve = resolve })

  fastify.register(
    async function (instance) {
      instance.get('/ws', { websocket: true }, function (socket) {
        socket.once('message', chunk => {
          _resolve(chunk.toString())
        })
      })
    })

  await fastify.ready()

  let order = 0
  let initWS, openWS
  const ws = await fastify.injectWS('/ws', {}, {
    onInit (ws) {
      expect(order).toBe(0)
      order++
      initWS = ws
    },
    onOpen (ws) {
      expect(order).toBe(1)
      order++
      openWS = ws
    }
  })
  ws.send(message)
  expect(order).toBe(2)
  expect(ws).toEqual(initWS)
  expect(ws).toEqual(openWS)
  expect(await promise).toEqual(message)
  ws.terminate()
})
