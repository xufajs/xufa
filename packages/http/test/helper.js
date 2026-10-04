'use strict'

const dns = require('node:dns').promises
const stream = require('node:stream')
const { promisify } = require('node:util')
const symbols = require('../lib/symbols')


module.exports.sleep = promisify(setTimeout)

function waitForCb (options) {
  let count = null
  let done = false
  let iResolve
  let iReject

  function stepIn () {
    if (done) {
      iReject(new Error('Unexpected done call'))
      return
    }

    if (--count) {
      return
    }

    done = true
    iResolve()
  }

  const patience = new Promise((resolve, reject) => {
    iResolve = resolve
    iReject = reject
  })

  count = options.steps || 1
  done = false

  return { stepIn, patience }
}
module.exports.waitForCb = waitForCb

/**
 * @param method HTTP request method
 * @param t node:test instance
 * @param isSetErrorHandler true: using setErrorHandler
 */
module.exports.payloadMethod = function (method, t, isSetErrorHandler = false) {
  
  const fastify = require('..')()

  if (isSetErrorHandler) {
    fastify.setErrorHandler(function (err, request, reply) {
      require('node:assert').ok(request instanceof fastify[symbols.kRequest].parent)
      require('node:assert').strictEqual(typeof request, 'object')
      reply
        .code(err.statusCode)
        .type('application/json; charset=utf-8')
        .send(err)
    })
  }

  const upMethod = method.toUpperCase()
  const loMethod = method.toLowerCase()

  const schema = {
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

  test(`${upMethod} can be created`, async () => {
    expect.assertions(1)
    try {
      fastify[loMethod]('/', schema, function (req, reply) {
        reply.code(200).send(req.body)
      })
      expect(true).toBeTruthy()
    } catch (e) {
      expect.fail()
    }
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

  test(`${upMethod} without schema can be created`, async () => {
    expect.assertions(1)
    try {
      fastify[loMethod]('/missing', function (req, reply) {
        reply.code(200).send(req.body)
      })
      expect(true).toBeTruthy()
    } catch (e) {
      expect.fail()
    }
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

  test(`${upMethod} with body and querystring`, async () => {
    expect.assertions(1)
    try {
      fastify[loMethod]('/with-query', function (req, reply) {
        req.body.hello = req.body.hello + req.query.foo
        reply.code(200).send(req.body)
      })
      expect(true).toBeTruthy()
    } catch (e) {
      expect.fail()
    }
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

  test(`${upMethod} with bodyLimit option`, async () => {
    expect.assertions(1)
    try {
      fastify[loMethod]('/with-limit', { bodyLimit: 1 }, function (req, reply) {
        reply.send(req.body)
      })
      expect(true).toBeTruthy()
    } catch (e) {
      expect.fail()
    }
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

  describe('listening', () => {
let err = null
afterAll(() => { fastify.close() })
beforeAll(async () => {
try {
await fastify.listen({ port: 0 })
} catch (error) {
err = error
}
if (err) {
      expect(err).toBeFalsy()
      return
    }
})
test(`${upMethod} - correctly replies`, async () => {
      expect.assertions(3)

      const result = await fetch('http://localhost:' + fastify.server.address().port, {
        method: upMethod,
        body: JSON.stringify({ hello: 'world' }),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      expect(result.ok).toBeTruthy()
      expect(result.status).toBe(200)
      expect(await result.json()).toEqual({ hello: 'world' })
    })
test(`${upMethod} - correctly replies with very large body`, async () => {
      expect.assertions(3)

      const largeString = 'world'.repeat(13200)
      const result = await fetch('http://localhost:' + fastify.server.address().port, {
        method: upMethod,
        body: JSON.stringify({ hello: largeString }),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      expect(result.ok).toBeTruthy()
      expect(result.status).toBe(200)
      expect(await result.json()).toEqual({ hello: largeString })
    })
test(`${upMethod} - correctly replies if the content type has the charset`, async () => {
      expect.assertions(3)

      const result = await fetch('http://localhost:' + fastify.server.address().port, {
        method: upMethod,
        body: JSON.stringify({ hello: 'world' }),
        headers: {
          'content-type': 'application/json; charset=utf-8'
        }
      })

      expect(result.ok).toBeTruthy()
      expect(result.status).toBe(200)
      expect(await result.text()).toEqual(JSON.stringify({ hello: 'world' }))
    })
test(`${upMethod} without schema - correctly replies`, async () => {
      expect.assertions(3)

      const result = await fetch('http://localhost:' + fastify.server.address().port + '/missing', {
        method: upMethod,
        body: JSON.stringify({ hello: 'world' }),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      expect(result.ok).toBeTruthy()
      expect(result.status).toBe(200)
      expect(await result.json()).toEqual({ hello: 'world' })
    })
test(`${upMethod} with body and querystring - correctly replies`, async () => {
      expect.assertions(3)

      const result = await fetch('http://localhost:' + fastify.server.address().port + '/with-query?foo=hello', {
        method: upMethod,
        body: JSON.stringify({ hello: 'world' }),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      expect(result.ok).toBeTruthy()
      expect(result.status).toBe(200)
      expect(await result.json()).toEqual({ hello: 'worldhello' })
    })
test(`${upMethod} with no body - correctly replies`, async () => {
      expect.assertions(6)

      const { stepIn, patience } = waitForCb({ steps: 2 })

      fetch('http://localhost:' + fastify.server.address().port + '/missing', {
        method: upMethod,
        headers: { 'Content-Length': '0' }
      }).then(async (response) => {
        expect(response.ok).toBeTruthy()
        expect(response.status).toBe(200)
        expect(await response.text()).toBe('')
        stepIn()
      })

      // Must use inject to make a request without a Content-Length header
      fastify.inject({
        method: upMethod,
        url: '/missing'
      }, (err, res) => {
        expect(err).toBeFalsy()
        expect(res.statusCode).toBe(200)
        expect(res.payload.toString()).toBe('')
        stepIn()
      })

      return patience
    
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test(`${upMethod} returns 415 - incorrect media type if body is not json`, async () => {
      expect.assertions(2)

      const result = await fetch('http://localhost:' + fastify.server.address().port + '/missing', {
        method: upMethod,
        body: 'hello world',
        headers: {
          'Content-Type': undefined
        }
      })

      expect(result.ok).toBeFalsy()
      expect(result.status).toBe(415)
    })
if (loMethod === 'options') {
      test('OPTIONS returns 415 - should return 415 if Content-Type is not json or plain text', async () => {
        expect.assertions(2)

        const result = await fetch('http://localhost:' + fastify.server.address().port + '/missing', {
          method: upMethod,
          body: 'hello world',
          headers: {
            'Content-Type': 'text/xml'
          }
        })

        expect(result.ok).toBeFalsy()
        expect(result.status).toBe(415)
      })
    }
test(`${upMethod} returns 400 - Bad Request`, async () => {
      const isOptions = upMethod === 'OPTIONS'
      expect.assertions(isOptions ? 2 : 4)

      const { stepIn, patience } = waitForCb({ steps: isOptions ? 1 : 2 })

      fetch('http://localhost:' + fastify.server.address().port, {
        method: upMethod,
        body: 'hello world',
        headers: {
          'Content-Type': 'application/json'
        }
      }).then((response) => {
        expect(response.ok).toBeFalsy()
        expect(response.status).toBe(400)
        stepIn()
      })

      if (!isOptions) {
        fetch(`http://localhost:${fastify.server.address().port}`, {
          method: upMethod,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': '0'
          }
        }).then((response) => {
          expect(response.ok).toBeFalsy()
          expect(response.status).toBe(400)
          stepIn()
        })
      }

      return patience
    
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test(`${upMethod} returns 413 - Payload Too Large`, async () => {
      const isOptions = upMethod === 'OPTIONS'
      expect.assertions(isOptions ? 3 : 5)

      const { stepIn, patience } = waitForCb({ steps: isOptions ? 2 : 3 })

      fetch(`http://localhost:${fastify.server.address().port}`, {
        method: upMethod,
        body: JSON.stringify({ w: 'w'.repeat(1024 * 1024 + 1) }),
        headers: {
          'Content-Type': 'application/json'
        }
      }).then((response) => {
        expect(response.status).toBe(413)
        stepIn()
      }).catch((err) => {
        // Handle EPIPE error - server closed connection after sending 413
        if (err.cause?.code === 'EPIPE' || err.message.includes('fetch failed')) {
          expect(true).toBeTruthy()
        } else {
          throw err
        }
        stepIn()
      })

      // Node errors for OPTIONS requests with a stream body and no Content-Length header
      if (!isOptions) {
        let chunk = Buffer.alloc(1024 * 1024 + 1, 0)
        const largeStream = new stream.Readable({
          read () {
            this.push(chunk)
            chunk = null
          }
        })
        fetch('http://localhost:' + fastify.server.address().port, {
          method: upMethod,
          headers: { 'Content-Type': 'application/json' },
          body: largeStream,
          duplex: 'half'
        }).then((response) => {
          expect(response.ok).toBeFalsy()
          expect(response.status).toBe(413)
          stepIn()
        }).catch((err) => {
          // Handle EPIPE error - server closed connection after sending 413
          if (err.cause?.code === 'EPIPE' || err.message.includes('fetch failed')) {
            expect(true).toBeTruthy()
          } else {
            throw err
          }
          stepIn()
        })
      }

      fetch(`http://localhost:${fastify.server.address().port}/with-limit`, {
        method: upMethod,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }).then((response) => {
        expect(response.ok).toBeFalsy()
        expect(response.status).toBe(413)
        stepIn()
      })

      return patience
    
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test(`${upMethod} should fail with empty body and application/json content-type`, async () => {
      if (upMethod === 'OPTIONS') return

      expect.assertions(12)

      const { stepIn, patience } = waitForCb({ steps: 5 })

      fastify.inject({
        method: `${upMethod}`,
        url: '/',
        headers: {
          'Content-Type': 'application/json'
        }
      }, (err, res) => {
        expect(err).toBeFalsy()
        expect(JSON.parse(res.payload)).toEqual({
          error: 'Bad Request',
          code: 'XUFA_ERR_CTP_EMPTY_JSON_BODY',
          message: 'Body cannot be empty when content-type is set to \'application/json\'',
          statusCode: 400
        })
      })

      fetch(`http://localhost:${fastify.server.address().port}`, {
        method: upMethod,
        headers: {
          'Content-Type': 'application/json'
        }
      }).then(async (res) => {
        expect(res.ok).toBeFalsy()
        expect(await res.json()).toEqual({
          error: 'Bad Request',
          code: 'XUFA_ERR_CTP_EMPTY_JSON_BODY',
          message: 'Body cannot be empty when content-type is set to \'application/json\'',
          statusCode: 400
        })
        stepIn()
      })

      fastify.inject({
        method: `${upMethod}`,
        url: '/',
        headers: {
          'Content-Type': 'application/json'
        },
        payload: null
      }, (err, res) => {
        expect(err).toBeFalsy()
        expect(JSON.parse(res.payload)).toEqual({
          error: 'Bad Request',
          code: 'XUFA_ERR_CTP_EMPTY_JSON_BODY',
          message: 'Body cannot be empty when content-type is set to \'application/json\'',
          statusCode: 400
        })
        stepIn()
      })

      fetch(`http://localhost:${fastify.server.address().port}`, {
        method: upMethod,
        headers: {
          'Content-Type': 'application/json'
        },
        body: null
      }).then(async (res) => {
        expect(res.ok).toBeFalsy()
        expect(await res.json()).toEqual({
          error: 'Bad Request',
          code: 'XUFA_ERR_CTP_EMPTY_JSON_BODY',
          message: 'Body cannot be empty when content-type is set to \'application/json\'',
          statusCode: 400
        })
        stepIn()
      })

      fastify.inject({
        method: `${upMethod}`,
        url: '/',
        headers: {
          'Content-Type': 'application/json'
        },
        payload: undefined
      }, (err, res) => {
        expect(err).toBeFalsy()
        expect(JSON.parse(res.payload)).toEqual({
          error: 'Bad Request',
          code: 'XUFA_ERR_CTP_EMPTY_JSON_BODY',
          message: 'Body cannot be empty when content-type is set to \'application/json\'',
          statusCode: 400
        })
        stepIn()
      })

      fetch(`http://localhost:${fastify.server.address().port}`, {
        method: upMethod,
        headers: {
          'Content-Type': 'application/json'
        },
        body: undefined
      }).then(async (res) => {
        expect(res.ok).toBeFalsy()
        expect(await res.json()).toEqual({
          error: 'Bad Request',
          code: 'XUFA_ERR_CTP_EMPTY_JSON_BODY',
          message: 'Body cannot be empty when content-type is set to \'application/json\'',
          statusCode: 400
        })
        stepIn()
      })

      return patience
    
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
})
}

function lookupToIp (lookup) {
  return lookup.family === 6 ? `[${lookup.address}]` : lookup.address
}

module.exports.getLoopbackHost = async () => {
  const lookup = await dns.lookup('localhost')
  return [lookup.address, lookupToIp(lookup)]
}

module.exports.plainTextParser = function (request, callback) {
  let body = ''
  request.setEncoding('utf8')
  request.on('error', onError)
  request.on('data', onData)
  request.on('end', onEnd)
  function onError (err) {
    callback(err, null)
  }
  function onData (chunk) {
    body += chunk
  }
  function onEnd () {
    callback(null, body)
  }
}

module.exports.getServerUrl = function (app) {
  const { address, port } = app.server.address()
  return address === '::1'
    ? `http://[${address}]:${port}`
    : `http://${address}:${port}`
}

module.exports.partialDeepStrictEqual = function partialDeepStrictEqual (actual, expected) {
  if (typeof expected !== 'object' || expected === null) {
    return actual === expected
  }

  if (typeof actual !== 'object' || actual === null) {
    return false
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false
    if (expected.length > actual.length) return false

    for (let i = 0; i < expected.length; i++) {
      if (!partialDeepStrictEqual(actual[i], expected[i])) {
        return false
      }
    }
    return true
  }

  for (const key of Object.keys(expected)) {
    if (!(key in actual)) return false
    if (!partialDeepStrictEqual(actual[key], expected[key])) {
      return false
    }
  }

  return true
}

module.exports.assertNoWarning = function (t) {
  function doNotWarn () {
    expect.fail('no warning')
  }
  process.on('warning', doNotWarn)
  onTestFinished(() => {
    process.off('warning', doNotWarn)
  })
}
