'use strict'


const Fastify = require('..')
const split = require('split2')
const pino = require('@xufa/logger')
const { sleep } = require('./helper')
const statusCodes = require('node:http').STATUS_CODES

const opts = {
  schema: {
    response: {
      '2xx': {
        type: 'object',
        properties: {
          hello: {
            type: 'string'
          }
        }
      }
    }
  }
}

const optsWithHostnameAndPort = {
  schema: {
    response: {
      '2xx': {
        type: 'object',
        properties: {
          hello: {
            type: 'string'
          },
          hostname: {
            type: 'string'
          },
          port: {
            type: 'string'
          }
        }
      }
    }
  }
}
test('async await', async () => {
  expect.assertions(15)
  const fastify = Fastify()
  try {
    fastify.get('/', opts, async function awaitMyFunc (req, reply) {
      await sleep(200)
      return { hello: 'world' }
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  try {
    fastify.get('/no-await', opts, async function (req, reply) {
      return { hello: 'world' }
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  try {
    fastify.get('/await/hostname_port', optsWithHostnameAndPort, async function awaitMyFunc (req, reply) {
      await sleep(200)
      return { hello: 'world', hostname: req.hostname, port: req.port }
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail()
  }

  const fastifyServer = await fastify.listen({ port: 0 })

  onTestFinished(() => { fastify.close() })

  const result = await fetch(fastifyServer)

  const body = await result.text()
  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(result.headers.get('content-length')).toBe('' + body.length)
  expect(JSON.parse(body)).toEqual({ hello: 'world' })

  const result1 = await fetch(`${fastifyServer}/no-await`)

  const body1 = await result1.text()
  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)
  expect(result1.headers.get('content-length')).toBe('' + body1.length)
  expect(JSON.parse(body1)).toEqual({ hello: 'world' })

  const result2 = await fetch(`http://localhost:${fastify.server.address().port}/await/hostname_port`)

  const parsedBody = await result2.json()
  expect(result2.ok).toBeTruthy()
  expect(result2.status).toBe(200)
  expect(parsedBody.hostname).toBe('localhost')
  expect(parseInt(parsedBody.port)).toBe(fastify.server.address().port)
})

test('ignore the result of the promise if reply.send is called beforehand (undefined)', async () => {
  expect.assertions(3)

  const server = Fastify()
  const payload = { hello: 'world' }

  server.get('/', async function awaitMyFunc (req, reply) {
    await reply.send(payload)
  })

  onTestFinished(() => { server.close() })

  const fastifyServer = await server.listen({ port: 0 })

  const result = await fetch(fastifyServer)

  expect(result.ok).toBeTruthy()
  expect(payload).toEqual(await result.json())
  expect(result.status).toBe(200)
})

test('ignore the result of the promise if reply.send is called beforehand (object)', async () => {
  expect.assertions(3)

  const server = Fastify()
  const payload = { hello: 'world2' }

  server.get('/', async function awaitMyFunc (req, reply) {
    await reply.send(payload)
    return { hello: 'world' }
  })

  onTestFinished(() => { server.close() })

  const fastifyServer = await server.listen({ port: 0 })

  const result = await fetch(fastifyServer)

  expect(result.ok).toBeTruthy()
  expect(payload).toEqual(await result.json())
  expect(result.status).toBe(200)
})

test('server logs an error if reply.send is called and a value is returned via async/await', (done) => {
  const lines = ['incoming request', 'request completed', 'Reply was already sent, did you forget to "return reply" in "/" (GET)?']
  expect.assertions(lines.length + 2)

  const splitStream = split(JSON.parse)
  splitStream.on('data', (line) => {
    expect(line.msg).toBe(lines.shift())
  })

  const logger = pino(splitStream)

  const fastify = Fastify({
    loggerInstance: logger
  })

  fastify.get('/', async (req, reply) => {
    await reply.send({ hello: 'world' })
    return { hello: 'world2' }
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload).toEqual({ hello: 'world' })
    done()
  })
})

test('ignore the result of the promise if reply.send is called beforehand (undefined)', async () => {
  expect.assertions(3)

  const server = Fastify()
  const payload = { hello: 'world' }

  server.get('/', async function awaitMyFunc (req, reply) {
    await reply.send(payload)
  })

  onTestFinished(() => { server.close() })

  const fastifyServer = await server.listen({ port: 0 })

  const result = await fetch(fastifyServer)

  expect(result.ok).toBeTruthy()
  expect(payload).toEqual(await result.json())
  expect(result.status).toBe(200)
})

test('ignore the result of the promise if reply.send is called beforehand (object)', async () => {
  expect.assertions(3)

  const server = Fastify()
  const payload = { hello: 'world2' }

  server.get('/', async function awaitMyFunc (req, reply) {
    await reply.send(payload)
    return { hello: 'world' }
  })

  onTestFinished(() => { server.close() })

  const fastifyServer = await server.listen({ port: 0 })

  const result = await fetch(fastifyServer)

  expect(result.ok).toBeTruthy()
  expect(payload).toEqual(await result.json())
  expect(result.status).toBe(200)
})

test('await reply if we will be calling reply.send in the future', (done) => {
  const lines = ['incoming request', 'request completed']
  expect.assertions(lines.length + 2)

  const splitStream = split(JSON.parse)
  splitStream.on('data', (line) => {
    expect(line.msg).toBe(lines.shift())
  })

  const server = Fastify({
    logger: {
      stream: splitStream
    }
  })
  const payload = { hello: 'world' }

  server.get('/', async function awaitMyFunc (req, reply) {
    setImmediate(function () {
      reply.send(payload)
    })

    await reply
  })

  server.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload).toEqual({ hello: 'world' })
    done()
  })
})

test('await reply if we will be calling reply.send in the future (error case)', (done) => {
  const lines = ['incoming request', 'kaboom', 'request completed']
  expect.assertions(lines.length + 2)

  const splitStream = split(JSON.parse)
  splitStream.on('data', (line) => {
    expect(line.msg).toBe(lines.shift())
  })

  const server = Fastify({
    logger: {
      stream: splitStream
    }
  })

  server.get('/', async function awaitMyFunc (req, reply) {
    setImmediate(function () {
      reply.send(new Error('kaboom'))
    })

    await reply
  })

  server.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    done()
  })
})

test('support reply decorators with await', (done) => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.decorateReply('wow', function () {
    setImmediate(() => {
      this.send({ hello: 'world' })
    })

    return this
  })

  fastify.get('/', async (req, reply) => {
    await sleep(1)
    await reply.wow()
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    const payload = JSON.parse(res.payload)
    expect(payload).toEqual({ hello: 'world' })
    done()
  })
})

test('inject async await', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  try {
    const res = await fastify.inject({ method: 'GET', url: '/' })
    expect({ hello: 'world' }).toEqual(JSON.parse(res.payload))
  } catch (err) {
    expect.fail(err)
  }
})

test('inject async await - when the server equal up', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  try {
    const res = await fastify.inject({ method: 'GET', url: '/' })
    expect({ hello: 'world' }).toEqual(JSON.parse(res.payload))
  } catch (err) {
    expect.fail(err)
  }

  await sleep(200)

  try {
    const res2 = await fastify.inject({ method: 'GET', url: '/' })
    expect({ hello: 'world' }).toEqual(JSON.parse(res2.payload))
  } catch (err) {
    expect.fail(err)
  }
})

test('async await plugin', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  fastify.register(async (fastify, opts) => {
    fastify.get('/', (req, reply) => {
      reply.send({ hello: 'world' })
    })

    await sleep(200)
  })

  try {
    const res = await fastify.inject({ method: 'GET', url: '/' })
    expect({ hello: 'world' }).toEqual(JSON.parse(res.payload))
  } catch (err) {
    expect.fail(err)
  }
})

test('does not call reply.send() twice if 204 response equal already sent', (done) => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.get('/', async (req, reply) => {
    reply.code(204).send()
    reply.send = () => {
      throw new Error('reply.send() was called twice')
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(204)
    done()
  })
})

test('promise was fulfilled with undefined', async () => {
  expect.assertions(3)

  let fastify = null
  const stream = split(JSON.parse)
  try {
    fastify = Fastify({
      logger: {
        stream,
        level: 'error'
      }
    })
  } catch (e) {
    expect.fail()
  }

  onTestFinished(() => { fastify.close() })

  fastify.get('/', async (req, reply) => {
  })

  stream.once('data', line => {
    expect.fail('should not log an error')
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer)

  expect(result.ok).toBeTruthy()
  expect(await result.text()).toBe('')
  expect(result.status).toBe(200)
})

test('promise was fulfilled with undefined using inject', async () => {
  const stream = split(JSON.parse)
  const fastify = Fastify({
    logger: {
      stream,
      level: 'error'
    }
  })

  fastify.get('/', async (req, reply) => {
  })

  stream.once('data', line => {
    expect.fail('should not log an error')
  })

  const res = await fastify.inject('/')

  expect(res.body).toBe('')
  expect(res.statusCode).toBe(200)
})

test('error is not logged because promise was fulfilled with undefined but response was sent before promise resolution', async () => {
  expect.assertions(3)

  let fastify = null
  const stream = split(JSON.parse)
  const payload = { hello: 'world' }
  try {
    fastify = Fastify({
      logger: {
        stream,
        level: 'error'
      }
    })
  } catch (e) {
    expect.fail()
  }

  onTestFinished(() => { fastify.close() })

  fastify.get('/', async (req, reply) => {
    reply.send(payload)
  })

  stream.once('data', line => {
    expect.fail('should not log an error')
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer)

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(payload).toEqual(await result.json())
})

test('Thrown Error instance sets HTTP status code', (done) => {
  expect.assertions(3)

  const fastify = Fastify()

  const err = new Error('winter is coming')
  err.statusCode = 418

  fastify.get('/', async (req, reply) => {
    throw err
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(418)
    expect({
        error: statusCodes['418'],
        message: err.message,
        statusCode: 418
      }).toEqual(JSON.parse(res.payload))
    done()
  })
})

test('customErrorHandler support', (done) => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.get('/', async (req, reply) => {
    const error = new Error('ouch')
    error.statusCode = 400
    throw error
  })

  fastify.setErrorHandler(async err => {
    expect(err.message).toBe('ouch')
    const error = new Error('kaboom')
    error.statusCode = 401
    throw error
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(401)
    expect({
        error: statusCodes['401'],
        message: 'kaboom',
        statusCode: 401
      }).toEqual(JSON.parse(res.payload))
    done()
  })
})

test('customErrorHandler support without throwing', (done) => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.get('/', async (req, reply) => {
    const error = new Error('ouch')
    error.statusCode = 400
    throw error
  })

  fastify.setErrorHandler(async (err, req, reply) => {
    expect(err.message).toBe('ouch')
    await reply.code(401).send('kaboom')
    reply.send = expect.fail.bind(null, 'should not be called')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(401)
    expect('kaboom').toEqual(res.payload)
    done()
  })
})

// See https://github.com/fastify/fastify/issues/2653
test('customErrorHandler only called if reply not already sent', (done) => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', async (req, reply) => {
    await reply.send('success')
    const error = new Error('ouch')
    error.statusCode = 400
    throw error
  })

  fastify.setErrorHandler(expect.fail.bind(null, 'should not be called'))

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect('success').toEqual(res.payload)
    done()
  })
})

// See https://github.com/fastify/fastify/issues/3209
test('setNotFoundHandler should accept return value', (done) => {
  expect.assertions(3)

  const fastify = Fastify()

  fastify.get('/', async () => ({ hello: 'world' }))

  fastify.setNotFoundHandler((req, reply) => {
    reply.code(404)
    return {
      error: statusCodes['404'],
      message: 'lost',
      statusCode: 404
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/elsewhere'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(404)
    expect({
        error: statusCodes['404'],
        message: 'lost',
        statusCode: 404
      }).toEqual(JSON.parse(res.payload))
    done()
  })
})

// See https://github.com/fastify/fastify/issues/3209
test('customErrorHandler should accept return value', (done) => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.get('/', async (req, reply) => {
    const error = new Error('ouch')
    error.statusCode = 400
    throw error
  })

  fastify.setErrorHandler((err, req, reply) => {
    expect(err.message).toBe('ouch')
    reply.code(401)
    return {
      error: statusCodes['401'],
      message: 'kaboom',
      statusCode: 401
    }
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(401)
    expect({
        error: statusCodes['401'],
        message: 'kaboom',
        statusCode: 401
      }).toEqual(JSON.parse(res.payload))
    done()
  })
})

test('await self', async () => {
  const app = Fastify()
  expect(await app).toBe(app)
})
