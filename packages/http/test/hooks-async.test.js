'use strict'

const { Readable } = require('node:stream')

const Fastify = require('@xufa/http')
const fs = require('node:fs')
const { sleep, waitForCb } = require('./helper')

test('async hooks', async () => {
  expect.assertions(20)
  const fastify = Fastify({ exposeHeadRoutes: false })
  fastify.addHook('onRequest', async function (request, reply) {
    await sleep(1)
    request.test = 'the request is coming'
    reply.test = 'the reply has come'
    if (request.raw.method === 'DELETE') {
      throw new Error('some error')
    }
  })

  fastify.addHook('preHandler', async function (request, reply) {
    await sleep(1)
    expect(request.test).toBe('the request is coming')
    expect(reply.test).toBe('the reply has come')
    if (request.raw.method === 'HEAD') {
      throw new Error('some error')
    }
  })

  fastify.addHook('onSend', async function (request, reply, payload) {
    await sleep(1)
    expect('onSend called').toBeTruthy()
  })

  const completion = waitForCb({
    steps: 6
  })
  fastify.addHook('onResponse', async function (request, reply) {
    await sleep(1)
    expect('onResponse called').toBeTruthy()
    completion.stepIn()
  })

  fastify.get('/', function (request, reply) {
    expect(request.test).toBe('the request is coming')
    expect(reply.test).toBe('the reply has come')
    reply.code(200).send({ hello: 'world' })
  })

  fastify.head('/', function (req, reply) {
    reply.code(200).send({ hello: 'world' })
  })

  fastify.delete('/', function (req, reply) {
    reply.code(200).send({ hello: 'world' })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const response1 = await fetch(fastifyServer, {
    method: 'GET'
  })
  expect(response1.ok).toBeTruthy()
  expect(response1.status).toBe(200)
  const body1 = await response1.text()
  expect(response1.headers.get('content-length')).toBe('' + body1.length)
  expect(JSON.parse(body1)).toEqual({ hello: 'world' })
  completion.stepIn()

  const response2 = await fetch(fastifyServer, {
    method: 'HEAD'
  })
  expect(response2.ok).toBeFalsy()
  expect(response2.status).toBe(500)
  completion.stepIn()

  const response3 = await fetch(fastifyServer, {
    method: 'DELETE'
  })
  expect(response3.ok).toBeFalsy()
  expect(response3.status).toBe(500)
  completion.stepIn()

  return completion.patience
})

test('modify payload', (testDone) => {
  expect.assertions(10)
  const fastify = Fastify()
  const payload = { hello: 'world' }
  const modifiedPayload = { hello: 'modified' }
  const anotherPayload = '"winter is coming"'

  fastify.addHook('onSend', async function (request, reply, thePayload) {
    expect('onSend called').toBeTruthy()
    expect(JSON.parse(thePayload)).toEqual(payload)
    return thePayload.replace('world', 'modified')
  })

  fastify.addHook('onSend', async function (request, reply, thePayload) {
    expect('onSend called').toBeTruthy()
    expect(JSON.parse(thePayload)).toEqual(modifiedPayload)
    return anotherPayload
  })

  fastify.addHook('onSend', async function (request, reply, thePayload) {
    expect('onSend called').toBeTruthy()
    expect(thePayload).toEqual(anotherPayload)
  })

  fastify.get('/', (req, reply) => {
    reply.send(payload)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(anotherPayload)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-length']).toBe('18')
    testDone()
  })
})

test('onRequest hooks should be able to block a request', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addHook('onRequest', async (req, reply) => {
    await reply.send('hello')
  })

  fastify.addHook('onRequest', async (req, reply) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('preHandler', async (req, reply) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('onSend', async (req, reply, payload) => {
    expect('called').toBeTruthy()
  })

  fastify.addHook('onResponse', async (request, reply) => {
    expect('called').toBeTruthy()
  })

  fastify.get('/', function (request, reply) {
    expect.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    testDone()
  })
})

test('preParsing hooks should be able to modify the payload', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.addHook('preParsing', async (req, reply, payload) => {
    const stream = new Readable()

    stream.receivedEncodedLength = parseInt(req.headers['content-length'], 10)
    stream.push(JSON.stringify({ hello: 'another world' }))
    stream.push(null)

    return stream
  })

  fastify.post('/', function (request, reply) {
    reply.send(request.body)
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ hello: 'another world' })
    testDone()
  })
})

test('preParsing hooks should be able to supply statusCode', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.addHook('preParsing', async (req, reply, payload) => {
    const stream = new Readable({
      read () {
        const error = new Error('kaboom')
        error.statusCode = 408
        this.destroy(error)
      }
    })
    stream.receivedEncodedLength = 20
    return stream
  })

  fastify.addHook('onError', async (req, res, err) => {
    expect(err.statusCode).toBe(408)
  })

  fastify.post('/', function (request, reply) {
    expect.fail('should not be called')
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(408)
    expect(JSON.parse(res.payload)).toEqual({
      statusCode: 408,
      error: 'Request Timeout',
      message: 'kaboom'
    })

    testDone()
  })
})

test('preParsing hooks should ignore statusCode 200 in stream error', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.addHook('preParsing', async (req, reply, payload) => {
    const stream = new Readable({
      read () {
        const error = new Error('kaboom')
        error.statusCode = 200
        this.destroy(error)
      }
    })
    stream.receivedEncodedLength = 20
    return stream
  })

  fastify.addHook('onError', async (req, res, err) => {
    expect(err.statusCode).toBe(400)
  })

  fastify.post('/', function (request, reply) {
    expect.fail('should not be called')
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.payload)).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'kaboom'
    })
    testDone()
  })
})

test('preParsing hooks should ignore non-number statusCode in stream error', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.addHook('preParsing', async (req, reply, payload) => {
    const stream = new Readable({
      read () {
        const error = new Error('kaboom')
        error.statusCode = '418'
        this.destroy(error)
      }
    })
    stream.receivedEncodedLength = 20
    return stream
  })

  fastify.addHook('onError', async (req, res, err) => {
    expect(err.statusCode).toBe(400)
  })

  fastify.post('/', function (request, reply) {
    expect.fail('should not be called')
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.payload)).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'kaboom'
    })
    testDone()
  })
})

test('preParsing hooks should default to statusCode 400 if stream error', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.addHook('preParsing', async (req, reply, payload) => {
    const stream = new Readable({
      read () {
        this.destroy(new Error('kaboom'))
      }
    })
    stream.receivedEncodedLength = 20
    return stream
  })

  fastify.addHook('onError', async (req, res, err) => {
    expect(err.statusCode).toBe(400)
  })

  fastify.post('/', function (request, reply) {
    expect.fail('should not be called')
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.payload)).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'kaboom'
    })
    testDone()
  })
})

test('preParsing hooks should handle errors', (testDone) => {
  expect.assertions(3)

  const fastify = Fastify()
  fastify.addHook('preParsing', async (req, reply, payload) => {
    const e = new Error('kaboom')
    e.statusCode = 501
    throw e
  })

  fastify.post('/', function (request, reply) {
    reply.send(request.body)
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    payload: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(501)
    expect(JSON.parse(res.payload)).toEqual({ error: 'Not Implemented', message: 'kaboom', statusCode: 501 })
    testDone()
  })
})

test('preHandler hooks should be able to block a request', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addHook('preHandler', async (req, reply) => {
    await reply.send('hello')
  })

  fastify.addHook('preHandler', async (req, reply) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('onSend', async (req, reply, payload) => {
    expect(payload).toBe('hello')
  })

  fastify.addHook('onResponse', async (request, reply) => {
    expect('called').toBeTruthy()
  })

  fastify.get('/', function (request, reply) {
    expect.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    testDone()
  })
})

test('preValidation hooks should be able to block a request', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addHook('preValidation', async (req, reply) => {
    await reply.send('hello')
  })

  fastify.addHook('preValidation', async (req, reply) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('onSend', async (req, reply, payload) => {
    expect(payload).toBe('hello')
  })

  fastify.addHook('onResponse', async (request, reply) => {
    expect('called').toBeTruthy()
  })

  fastify.get('/', function (request, reply) {
    expect.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    testDone()
  })
})

test('preValidation hooks should be able to change request body before validation', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.addHook('preValidation', async (req, _reply) => {
    const buff = Buffer.from(req.body.message, 'base64')
    req.body = JSON.parse(buff.toString('utf-8'))
    expect('has been called').toBeTruthy()
  })

  fastify.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            foo: {
              type: 'string'
            },
            bar: {
              type: 'number'
            }
          },
          required: ['foo', 'bar']
        }
      }
    },
    (req, reply) => {
      reply.status(200).send('hello')
    }
  )

  fastify.inject({
    url: '/',
    method: 'POST',
    payload: {
      message: Buffer.from(JSON.stringify({ foo: 'example', bar: 1 })).toString('base64')
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    testDone()
  })
})

test('preSerialization hooks should be able to modify the payload', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.addHook('preSerialization', async (req, reply, payload) => {
    return { hello: 'another world' }
  })

  fastify.get('/', function (request, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload)).toEqual({ hello: 'another world' })
    testDone()
  })
})

test('preSerialization hooks should handle errors', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.addHook('preSerialization', async (req, reply, payload) => {
    throw new Error('kaboom')
  })

  fastify.get('/', function (request, reply) {
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.payload)).toEqual({ error: 'Internal Server Error', message: 'kaboom', statusCode: 500 })
    testDone()
  })
})

test('preValidation hooks should handle throwing null', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.setErrorHandler(async (error, request, reply) => {
    expect(error instanceof Error).toBeTruthy()
    await reply.send(error)
  })

  fastify.addHook('preValidation', async () => {
    // eslint-disable-next-line no-throw-literal
    throw null
  })

  fastify.get('/', function (request, reply) { expect.fail('the handler must not be called') })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({
      error: 'Internal Server Error',
      code: 'XUFA_ERR_SEND_UNDEFINED_ERR',
      message: 'Undefined error has occurred',
      statusCode: 500
    })
    testDone()
  })
})

test('preValidation hooks should handle throwing a string', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.addHook('preValidation', async () => {
    // eslint-disable-next-line no-throw-literal
    throw 'this is an error'
  })

  fastify.get('/', function (request, reply) { expect.fail('the handler must not be called') })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(res.payload).toBe('this is an error')
    testDone()
  })
})

test('onRequest hooks should be able to block a request (last hook)', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addHook('onRequest', async (req, reply) => {
    await reply.send('hello')
  })

  fastify.addHook('preHandler', async (req, reply) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('onSend', async (req, reply, payload) => {
    expect('called').toBeTruthy()
  })

  fastify.addHook('onResponse', async (request, reply) => {
    expect('called').toBeTruthy()
  })

  fastify.get('/', function (request, reply) {
    expect.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    testDone()
  })
})

test('preHandler hooks should be able to block a request (last hook)', (testDone) => {
  expect.assertions(5)
  const fastify = Fastify()

  fastify.addHook('preHandler', async (req, reply) => {
    await reply.send('hello')
  })

  fastify.addHook('onSend', async (req, reply, payload) => {
    expect(payload).toBe('hello')
  })

  fastify.addHook('onResponse', async (request, reply) => {
    expect('called').toBeTruthy()
  })

  fastify.get('/', function (request, reply) {
    expect.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('hello')
    testDone()
  })
})

test('onRequest respond with a stream', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.addHook('onRequest', async (req, reply) => {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(__filename, 'utf8')
      // stream.pipe(res)
      // res.once('finish', resolve)
      reply.send(stream).then(() => {
        reply.raw.once('finish', () => resolve())
      })
    })
  })

  fastify.addHook('onRequest', async (req, res) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('preHandler', async (req, reply) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('onSend', async (req, reply, payload) => {
    expect('called').toBeTruthy()
  })

  fastify.addHook('onResponse', async (request, reply) => {
    expect('called').toBeTruthy()
  })

  fastify.get('/', function (request, reply) {
    expect.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

test('preHandler respond with a stream', (testDone) => {
  expect.assertions(7)
  const fastify = Fastify()

  fastify.addHook('onRequest', async (req, res) => {
    expect('called').toBeTruthy()
  })

  // we are calling `reply.send` inside the `preHandler` hook with a stream,
  // this triggers the `onSend` hook event if `preHandler` has not yet finished
  const order = [1, 2]

  fastify.addHook('preHandler', async (req, reply) => {
    const stream = fs.createReadStream(__filename, 'utf8')
    reply.raw.once('finish', () => {
      expect(order.shift()).toBe(2)
    })
    return reply.send(stream)
  })

  fastify.addHook('preHandler', async (req, reply) => {
    expect.fail('this should not be called')
  })

  fastify.addHook('onSend', async (req, reply, payload) => {
    expect(order.shift()).toBe(1)
    expect(typeof payload.pipe).toBe('function')
  })

  fastify.addHook('onResponse', async (request, reply) => {
    expect('called').toBeTruthy()
  })

  fastify.get('/', function (request, reply) {
    expect.fail('we should not be here')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    testDone()
  })
})

describe('Should log a warning if is an async function with `done`', () => {
test('2 arguments', () => {
    const fastify = Fastify()

    try {
      fastify.addHook('onRequestAbort', async (req, done) => {
        expect.fail('should have not be called')
      })
    } catch (e) {
      expect(e.code).toBe('XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER')
      expect(e.message).toBe('Async function has too many arguments. Async hooks should not use the \'done\' argument.')
    }
  })
test('3 arguments', () => {
    const fastify = Fastify()

    try {
      fastify.addHook('onRequest', async (req, reply, done) => {
        expect.fail('should have not be called')
      })
    } catch (e) {
      expect(e.code).toBe('XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER')
      expect(e.message).toBe('Async function has too many arguments. Async hooks should not use the \'done\' argument.')
    }
  })
test('4 arguments', () => {
    const fastify = Fastify()

    try {
      fastify.addHook('onSend', async (req, reply, payload, done) => {
        expect.fail('should have not be called')
      })
    } catch (e) {
      expect(e.code).toBe('XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER')
      expect(e.message).toBe('Async function has too many arguments. Async hooks should not use the \'done\' argument.')
    }
    try {
      fastify.addHook('preSerialization', async (req, reply, payload, done) => {
        expect.fail('should have not be called')
      })
    } catch (e) {
      expect(e.code).toBe('XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER')
      expect(e.message).toBe('Async function has too many arguments. Async hooks should not use the \'done\' argument.')
    }
    try {
      fastify.addHook('onError', async (req, reply, payload, done) => {
        expect.fail('should have not be called')
      })
    } catch (e) {
      expect(e.code).toBe('XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER')
      expect(e.message).toBe('Async function has too many arguments. Async hooks should not use the \'done\' argument.')
    }
  })
})

test('early termination, onRequest async', async () => {
  const app = Fastify()

  app.addHook('onRequest', async (req, reply) => {
    setImmediate(() => reply.send('hello world'))
    return reply
  })

  app.get('/', (req, reply) => {
    expect.fail('should not happen')
  })

  const res = await app.inject('/')
  expect(res.statusCode).toBe(200)
  expect(res.body.toString()).toBe('hello world')
})

test('The this should be the same of the encapsulation level', async () => {
  const fastify = Fastify()

  fastify.addHook('onRequest', async function (req, reply) {
    if (req.raw.url === '/nested') {
      expect(this.foo).toBe('bar')
    } else {
      expect(this.foo).toBe(undefined)
    }
  })

  fastify.register(plugin)
  fastify.get('/', (req, reply) => reply.send('ok'))

  async function plugin (fastify, opts) {
    fastify.decorate('foo', 'bar')
    fastify.get('/nested', (req, reply) => reply.send('ok'))
  }

  await fastify.inject({ method: 'GET', path: '/' })
  await fastify.inject({ method: 'GET', path: '/nested' })
  await fastify.inject({ method: 'GET', path: '/' })
  await fastify.inject({ method: 'GET', path: '/nested' })
})

describe('preSerializationEnd should handle errors if the serialize method throws', () => {
test('works with sync preSerialization', (testDone) => {
    expect.assertions(3)
    const fastify = Fastify()

    fastify.addHook('preSerialization', (request, reply, payload, done) => {
      expect('called').toBeTruthy()
      done(null, payload)
    })

    fastify.post('/', {
      handler (req, reply) { reply.send({ notOk: true }) },
      schema: { response: { 200: { required: ['ok'], properties: { ok: { type: 'boolean' } } } } }
    })

    fastify.inject({
      method: 'POST',
      url: '/'
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).not.toBe(200)
      testDone()
    })
  })
test('works with async preSerialization', (testDone) => {
    expect.assertions(3)
    const fastify = Fastify()

    fastify.addHook('preSerialization', async (request, reply, payload) => {
      expect('called').toBeTruthy()
      return payload
    })

    fastify.post('/', {
      handler (req, reply) { reply.send({ notOk: true }) },
      schema: { response: { 200: { required: ['ok'], properties: { ok: { type: 'boolean' } } } } }
    })

    fastify.inject({
      method: 'POST',
      url: '/'
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).not.toBe(200)
      testDone()
    })
  })
})

test('nested hooks to do not crash on 404', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.get('/hello', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.register(async function (fastify) {
    fastify.get('/something', (req, reply) => {
      reply.callNotFound()
    })

    fastify.setNotFoundHandler(async (request, reply) => {
      expect('called').toBeTruthy()
      reply.statusCode = 404
      return { status: 'nested-not-found' }
    })

    fastify.setErrorHandler(async (error, request, reply) => {
      expect.fail('should have not be called')
      reply.statusCode = 500
      return { status: 'nested-error', error }
    })
  }, { prefix: '/nested' })

  fastify.setNotFoundHandler(async (request, reply) => {
    expect.fail('should have not be called')
    reply.statusCode = 404
    return { status: 'not-found' }
  })

  fastify.setErrorHandler(async (error, request, reply) => {
    expect.fail('should have not be called')
    reply.statusCode = 500
    return { status: 'error', error }
  })

  fastify.inject({
    method: 'GET',
    url: '/nested/something'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    testDone()
  })
})

test('Register an hook (preHandler) as route option should fail if mixing async and callback style', () => {
  const fastify = Fastify()

  try {
    fastify.get(
      '/',
      {
        preHandler: [
          async (request, reply, done) => {
            done()
          }
        ]
      },
      async (request, reply) => {
        return { hello: 'world' }
      }
    )
    expect.fail('preHandler mixing async and callback style')
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER')
    expect(e.message).toBe('Async function has too many arguments. Async hooks should not use the \'done\' argument.')
  }
})

test('Register an hook (onSend) as route option should fail if mixing async and callback style', () => {
  const fastify = Fastify()

  try {
    fastify.get(
      '/',
      {
        onSend: [
          async (request, reply, payload, done) => {
            done()
          }
        ]
      },
      async (request, reply) => {
        return { hello: 'world' }
      }
    )
    expect.fail('onSend mixing async and callback style')
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER')
    expect(e.message).toBe('Async function has too many arguments. Async hooks should not use the \'done\' argument.')
  }
})

test('Register an hook (preSerialization) as route option should fail if mixing async and callback style', () => {
  const fastify = Fastify()

  try {
    fastify.get(
      '/',
      {
        preSerialization: [
          async (request, reply, payload, done) => {
            done()
          }
        ]
      },
      async (request, reply) => {
        return { hello: 'world' }
      }
    )
    expect.fail('preSerialization mixing async and callback style')
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER')
    expect(e.message).toBe('Async function has too many arguments. Async hooks should not use the \'done\' argument.')
  }
})

test('Register an hook (onError) as route option should fail if mixing async and callback style', () => {
  const fastify = Fastify()

  try {
    fastify.get(
      '/',
      {
        onError: [
          async (request, reply, error, done) => {
            done()
          }
        ]
      },
      async (request, reply) => {
        return { hello: 'world' }
      }
    )
    expect.fail('onError mixing async and callback style')
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER')
    expect(e.message).toBe('Async function has too many arguments. Async hooks should not use the \'done\' argument.')
  }
})

test('Register an hook (preParsing) as route option should fail if mixing async and callback style', () => {
  const fastify = Fastify()

  try {
    fastify.get(
      '/',
      {
        preParsing: [
          async (request, reply, payload, done) => {
            done()
          }
        ]
      },
      async (request, reply) => {
        return { hello: 'world' }
      }
    )
    expect.fail('preParsing mixing async and callback style')
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER')
    expect(e.message).toBe('Async function has too many arguments. Async hooks should not use the \'done\' argument.')
  }
})

test('Register an hook (onRequestAbort) as route option should fail if mixing async and callback style', () => {
  const fastify = Fastify()

  try {
    fastify.get(
      '/',
      {
        onRequestAbort: [
          async (request, done) => {
            done()
          }
        ]
      },
      async (request, reply) => {
        return { hello: 'world' }
      }
    )
    expect.fail('onRequestAbort mixing async and callback style')
  } catch (e) {
    expect(e.code).toBe('XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER')
    expect(e.message).toBe('Async function has too many arguments. Async hooks should not use the \'done\' argument.')
  }
})
