'use strict'


const net = require('node:net')
const Fastify = require('..')
const statusCodes = require('node:http').STATUS_CODES
const split = require('split2')
const fs = require('node:fs')
const path = require('node:path')

const codes = Object.keys(statusCodes)
codes.forEach(code => {
  if (Number(code) >= 400) helper(code)
})

function helper (code) {
  test('Reply error handling - code: ' + code, (testDone) => {
    expect.assertions(4)
    const fastify = Fastify()
    onTestFinished(() => fastify.close())
    const err = new Error('winter is coming')

    fastify.get('/', (req, reply) => {
      reply
        .code(Number(code))
        .send(err)
    })

    fastify.inject({
      method: 'GET',
      url: '/'
    }, (error, res) => {
      expect(error).toBeFalsy()
      expect(res.statusCode).toBe(Number(code))
      expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
      expect({
          error: statusCodes[code],
          message: err.message,
          statusCode: Number(code)
        }).toEqual(JSON.parse(res.payload))
      testDone()
    })
  })
}

test('preHandler hook error handling with external code', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  const err = new Error('winter is coming')

  fastify.addHook('preHandler', (req, reply, done) => {
    reply.code(400)
    done(err)
  })

  fastify.get('/', () => {})

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect({
        error: statusCodes['400'],
        message: err.message,
        statusCode: 400
      }).toEqual(JSON.parse(res.payload))
    testDone()
  })
})

test('onRequest hook error handling with external done', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  const err = new Error('winter is coming')

  fastify.addHook('onRequest', (req, reply, done) => {
    reply.code(400)
    done(err)
  })

  fastify.get('/', () => {})

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect({
        error: statusCodes['400'],
        message: err.message,
        statusCode: 400
      }).toEqual(JSON.parse(res.payload))
    testDone()
  })
})

test('Should reply 400 on client error', (testDone) => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  fastify.listen({ port: 0, host: '127.0.0.1' }, err => {
    expect(err).toBeFalsy()

    const client = net.connect(fastify.server.address().port, '127.0.0.1')
    client.end('oooops!')

    let chunks = ''
    client.on('data', chunk => {
      chunks += chunk
    })

    client.once('end', () => {
      const body = JSON.stringify({
        error: 'Bad Request',
        message: 'Client Error',
        statusCode: 400
      })
      expect(`HTTP/1.1 400 Bad Request\r\nContent-Length: ${body.length}\r\nContent-Type: application/json\r\n\r\n${body}`).toBe(chunks)
      testDone()
    })
  })
})

test('Should set the response from client error handler', (testDone) => {
  expect.assertions(5)

  const responseBody = JSON.stringify({
    error: 'Ended Request',
    message: 'Serious Client Error',
    statusCode: 400
  })
  const response = `HTTP/1.1 400 Bad Request\r\nContent-Length: ${responseBody.length}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${responseBody}`

  function clientErrorHandler (err, socket) {
    expect(err instanceof Error).toBeTruthy()

    this.log.warn({ err }, 'Handled client error')
    socket.end(response)
  }

  const logStream = split(JSON.parse)
  const fastify = Fastify({
    clientErrorHandler,
    logger: {
      stream: logStream,
      level: 'warn'
    }
  })

  fastify.listen({ port: 0, host: '127.0.0.1' }, err => {
    expect(err).toBeFalsy()
    onTestFinished(() => fastify.close())

    const client = net.connect(fastify.server.address().port, '127.0.0.1')
    client.end('oooops!')

    let chunks = ''
    client.on('data', chunk => {
      chunks += chunk
    })

    client.once('end', () => {
      expect(response).toBe(chunks)

      testDone()
    })
  })

  logStream.once('data', line => {
    expect('Handled client error').toBe(line.msg)
    expect(40).toBe(line.level)
  })
})

test('Error instance sets HTTP status code', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  const err = new Error('winter is coming')
  err.statusCode = 418

  fastify.get('/', () => {
    return Promise.reject(err)
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
    testDone()
  })
})

test('Error status code below 400 defaults to 500', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  const err = new Error('winter is coming')
  err.statusCode = 399

  fastify.get('/', () => {
    return Promise.reject(err)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect({
        error: statusCodes['500'],
        message: err.message,
        statusCode: 500
      }).toEqual(JSON.parse(res.payload))
    testDone()
  })
})

test('Error.status property support', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  const err = new Error('winter is coming')
  err.status = 418

  fastify.get('/', () => {
    return Promise.reject(err)
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
    testDone()
  })
})

describe('Support rejection with values that are not Error instances', () => {
const objs = [
    0,
    '',
    [],
    {},
    null,
    undefined,
    123,
    'abc',
    new RegExp(),
    new Date(),
    new Uint8Array()
  ]
for (const nonErr of objs) {
    test('Type: ' + typeof nonErr, (testDone) => {
      expect.assertions(4)
      const fastify = Fastify()
      onTestFinished(() => fastify.close())

      fastify.get('/', () => {
        return Promise.reject(nonErr)
      })

      fastify.setErrorHandler((err, request, reply) => {
        if (typeof err === 'object') {
          expect(err).toEqual(nonErr)
        } else {
          expect(err).toBe(nonErr)
        }
        reply.code(500).send('error')
      })

      fastify.inject({
        method: 'GET',
        url: '/'
      }, (error, res) => {
        expect(error).toBeFalsy()
        expect(res.statusCode).toBe(500)
        expect(res.payload).toBe('error')
        testDone()
      })
    })
  }
})

test('invalid schema - ajv', (testDone) => {
  expect.assertions(4)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        }
      }
    }
  }, (req, reply) => {
    expect.fail('we should not be here')
  })

  fastify.setErrorHandler((err, request, reply) => {
    expect(Array.isArray(err.validation)).toBeTruthy()
    reply.code(400).send('error')
  })

  fastify.inject({
    url: '/?id=abc',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.payload).toBe('error')
    testDone()
  })
})

test('should set the status code and the headers from the error object (from route handler) (no custom error handler)', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', (req, reply) => {
    const error = new Error('kaboom')
    error.headers = { hello: 'world' }
    error.statusCode = 400
    reply.send(error)
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.headers.hello).toBe('world')
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Bad Request',
      message: 'kaboom',
      statusCode: 400
    })

    testDone()
  })
})

test('should set the status code and the headers from the error object (from custom error handler)', (testDone) => {
  expect.assertions(6)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', (req, reply) => {
    const error = new Error('ouch')
    error.statusCode = 401
    reply.send(error)
  })

  fastify.setErrorHandler((err, request, reply) => {
    expect(err.message).toBe('ouch')
    expect(reply.raw.statusCode).toBe(200)
    const error = new Error('kaboom')
    error.headers = { hello: 'world' }
    error.statusCode = 400
    reply.send(error)
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(res.headers.hello).toBe('world')
    expect(JSON.parse(res.payload)).toEqual({
      error: 'Bad Request',
      message: 'kaboom',
      statusCode: 400
    })
    testDone()
  })
})

// Issue 595 https://github.com/fastify/fastify/issues/595
test('\'*\' should throw an error due to serializer can not handle the payload type', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', (req, reply) => {
    reply.type('text/html')
    try {
      reply.send({})
    } catch (err) {
      expect(err instanceof TypeError).toBeTruthy()
      expect(err.code).toBe('XUFA_ERR_REP_INVALID_PAYLOAD_TYPE')
      expect(err.message).toBe("Attempted to send payload of invalid type 'object'. Expected a string or Buffer.")
      testDone()
    }
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (e, res) => {
    expect.fail('should not be called')
  })
})

test('should throw an error if the custom serializer does not serialize the payload to a valid type', (testDone) => {
  expect.assertions(3)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', (req, reply) => {
    try {
      reply
        .type('text/html')
        .serializer(payload => payload)
        .send({})
    } catch (err) {
      expect(err instanceof TypeError).toBeTruthy()
      expect(err.code).toBe('XUFA_ERR_REP_INVALID_PAYLOAD_TYPE')
      expect(err.message).toBe("Attempted to send payload of invalid type 'object'. Expected a string or Buffer.")
      testDone()
    }
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (e, res) => {
    expect.fail('should not be called')
  })
})

test('should not set headers or status code for custom error handler', (testDone) => {
  expect.assertions(7)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  fastify.get('/', function (req, reply) {
    const err = new Error('kaboom')
    err.headers = {
      'fake-random-header': 'abc'
    }
    reply.send(err)
  })

  fastify.setErrorHandler(async (err, req, res) => {
    expect(res.statusCode).toBe(200)
    expect('fake-random-header' in res.headers).toBe(false)
    return res.code(500).send(err.message)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect('fake-random-header' in res.headers).toBe(false)
    expect(res.headers['content-length']).toBe(('kaboom'.length).toString())
    expect(res.payload).toEqual('kaboom')
    testDone()
  })
})

test('error thrown by custom error handler routes to default error handler', (testDone) => {
  expect.assertions(6)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  const error = new Error('kaboom')
  error.headers = {
    'fake-random-header': 'abc'
  }

  fastify.get('/', function (req, reply) {
    reply.send(error)
  })

  const newError = new Error('kabong')

  fastify.setErrorHandler(async (err, req, res) => {
    expect(res.statusCode).toBe(200)
    expect('fake-random-header' in res.headers).toBe(false)
    expect(err.headers).toEqual(error.headers)

    return res.send(newError)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.payload)).toEqual({
      error: statusCodes['500'],
      message: newError.message,
      statusCode: 500
    })
    testDone()
  })
})

// Refs: https://github.com/fastify/fastify/pull/4484#issuecomment-1367301750
test('allow re-thrown error to default error handler when route handler is async and error handler is sync', (testDone) => {
  expect.assertions(4)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.setErrorHandler(function (error) {
    expect(error.message).toBe('kaboom')
    throw Error('kabong')
  })

  fastify.get('/', async function () {
    throw Error('kaboom')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.payload)).toEqual({
      error: statusCodes['500'],
      message: 'kabong',
      statusCode: 500
    })
    testDone()
  })
})

// Issue 2078 https://github.com/fastify/fastify/issues/2078
// Supported error code list: https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml
const invalidErrorCodes = [
  undefined,
  null,
  'error_code',

  // out of the 100-599 range:
  0,
  1,
  99,
  600,
  700
]
invalidErrorCodes.forEach((invalidCode) => {
  test(`should throw error if error code is ${invalidCode}`, (testDone) => {
    expect.assertions(2)
    const fastify = Fastify()
    onTestFinished(() => fastify.close())
    fastify.get('/', (request, reply) => {
      try {
        return reply.code(invalidCode).send('You should not read this')
      } catch (err) {
        expect(err.code).toBe('XUFA_ERR_BAD_STATUS_CODE')
        expect(err.message).toBe('Called reply with an invalid status code: ' + invalidCode)
        testDone()
      }
    })

    fastify.inject({
      url: '/',
      method: 'GET'
    }, (e, res) => {
      expect.fail('should not be called')
    })
  })
})

test('error handler is triggered when a string is thrown from sync handler', (testDone) => {
  expect.assertions(3)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  const throwable = 'test'
  const payload = 'error'

  fastify.get('/', function (req, reply) {
    throw throwable
  })

  fastify.setErrorHandler((err, req, res) => {
    expect(err).toBe(throwable)

    res.send(payload)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(payload)
    testDone()
  })
})

test('status code should be set to 500 and return an error json payload if route handler throws any non Error object expression', async () => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', () => {
    /* eslint-disable-next-line */
    throw { foo: 'bar' }
  })

  // ----
  const reply = await fastify.inject({ method: 'GET', url: '/' })
  expect(reply.statusCode).toBe(500)
  expect(JSON.parse(reply.body).foo).toBe('bar')
})

test('should preserve the status code set by the user if an expression is thrown in a sync route', async () => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', (_, rep) => {
    rep.status(501)

    /* eslint-disable-next-line */
    throw { foo: 'bar' }
  })

  // ----
  const reply = await fastify.inject({ method: 'GET', url: '/' })
  expect(reply.statusCode).toBe(501)
  expect(JSON.parse(reply.body).foo).toBe('bar')
})

test('should trigger error handlers if a sync route throws any non-error object', async () => {
  expect.assertions(2)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  const throwable = 'test'
  const payload = 'error'

  fastify.get('/', function async (req, reply) {
    throw throwable
  })

  fastify.setErrorHandler((err, req, res) => {
    expect(err).toBe(throwable)
    res.code(500).send(payload)
  })

  const reply = await fastify.inject({ method: 'GET', url: '/' })
  expect(reply.statusCode).toBe(500)
})

test('should trigger error handlers if a sync route throws undefined', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', function async (req, reply) {
    // eslint-disable-next-line no-throw-literal
    throw undefined
  })

  const reply = await fastify.inject({ method: 'GET', url: '/' })
  expect(reply.statusCode).toBe(500)
})

test('setting content-type on reply object should not hang the server case 1', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', (req, reply) => {
    reply
      .code(200)
      .headers({ 'content-type': 'text/plain; charset=utf-32' })
      .send(JSON.stringify({ bar: 'foo', baz: 'foobar' }))
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

test('setting content-type on reply object should not hang the server case 2', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', (req, reply) => {
    reply
      .code(200)
      .headers({ 'content-type': 'text/plain; charset=utf-8' })
      .send({ bar: 'foo', baz: 'foobar' })
  })

  try {
    await fastify.ready()
    const res = await fastify.inject({
      url: '/',
      method: 'GET'
    })
    expect({
      error: 'Internal Server Error',
      message: 'Attempted to send payload of invalid type \'object\'. Expected a string or Buffer.',
      statusCode: 500,
      code: 'XUFA_ERR_REP_INVALID_PAYLOAD_TYPE'
    }).toEqual(res.json())
  } catch (error) {
    expect(error).toBeFalsy()
  }
})

test('setting content-type on reply object should not hang the server case 3', (testDone) => {
  expect.assertions(2)
  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.get('/', (req, reply) => {
    reply
      .code(200)
      .headers({ 'content-type': 'application/json' })
      .send({ bar: 'foo', baz: 'foobar' })
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

test('pipe stream inside error handler should not cause error', (testDone) => {
  expect.assertions(3)
  const location = path.join(__dirname, '..', 'package.json')
  const json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json')).toString('utf8'))

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  fastify.setErrorHandler((_error, _request, reply) => {
    const stream = fs.createReadStream(location)
    reply.code(400).type('application/json; charset=utf-8').send(stream)
  })

  fastify.get('/', (request, reply) => {
    throw new Error('This is an error.')
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.payload)).toEqual(json)
    testDone()
  })
})

test('should catch error when setting invalid header on async preSerializeation hook', async () => {
  expect.assertions(2)

  const app = Fastify()
  app.addHook('preSerialization', async (_, reply) => {
    reply.header('X-Invalid', '\n')
  })
  app.addHook('onError', function (request, reply, err, done) {
    // onError will run twice, since it execute preSerialization hook twice
    // requires to fallback to root error handler
    expect(err).toBeTruthy()
    done()
  })
  app.get('/', async () => ({ ok: true }))
  await app.inject({ method: 'GET', path: '/' })
})

test('should catch error when setting invalid header on async onSend hook', async () => {
  expect.assertions(2)

  const app = Fastify()
  app.addHook('onSend', async (_, reply, payload) => {
    reply.header('X-Invalid', '\n')
    return payload
  })
  app.addHook('onError', function (request, reply, err, done) {
    // onError will run twice, since it execute onSend hook twice
    // requires to fallback to root error handler
    expect(err).toBeTruthy()
    done()
  })
  app.get('/', async () => ({ ok: true }))
  await app.inject({ method: 'GET', path: '/' })
})
