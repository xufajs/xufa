'use strict'


const http2 = require('node:http2')
const Fastify = require('../..')
const h2url = require('h2url')
const msg = { hello: 'world' }

describe('http2 plain test', () => {
let fastify
try {
    fastify = Fastify({
      http2: true
    })
    expect(true).toBeTruthy()
  } catch (e) {
    expect.fail('http2 loading failed')
  }
fastify.get('/', function (req, reply) {
    reply.code(200).send(msg)
  })
fastify.get('/host', function (req, reply) {
    reply.code(200).send(req.host)
  })
fastify.get('/hostname_port', function (req, reply) {
    reply.code(200).send({ hostname: req.hostname, port: req.port })
  })
afterAll(() => { fastify.close() })
beforeAll(async () => {
await fastify.listen({ port: 0 })
})
test('http get request', async () => {
    expect.assertions(3)

    const url = `http://localhost:${fastify.server.address().port}`
    const res = await h2url.concat({ url })

    expect(res.headers[':status']).toBe(200)
    expect(res.headers['content-length']).toBe('' + JSON.stringify(msg).length)

    expect(JSON.parse(res.body)).toEqual(msg)
  })
test('http host', async () => {
    expect.assertions(1)

    const host = `localhost:${fastify.server.address().port}`

    const url = `http://${host}/host`
    const res = await h2url.concat({ url })

    expect(res.body).toBe(host)
  })
test('http hostname and port', async () => {
    expect.assertions(2)

    const host = `localhost:${fastify.server.address().port}`

    const url = `http://${host}/hostname_port`
    const res = await h2url.concat({ url })

    expect(JSON.parse(res.body).hostname).toBe(host.split(':')[0])
    expect(JSON.parse(res.body).port).toBe(parseInt(host.split(':')[1]))
  })
})

test('http2 response trailers do not use transfer-encoding', async () => {
  const fastify = Fastify({ http2: true })

  fastify.get('/', async (request, reply) => {
    reply.trailer('x-checksum', async () => 'abc')
    return 'hello'
  })

  await fastify.listen({ port: 0, host: '127.0.0.1' })

  const client = http2.connect(`http://127.0.0.1:${fastify.server.address().port}`)
  onTestFinished(() => {
    client.close()
    return fastify.close()
  })

  const response = await new Promise((resolve, reject) => {
    const request = client.request({
      [http2.constants.HTTP2_HEADER_METHOD]: http2.constants.HTTP2_METHOD_GET,
      [http2.constants.HTTP2_HEADER_PATH]: '/'
    })
    const result = { body: '' }

    request.setEncoding('utf8')
    request.on('response', headers => {
      result.headers = headers
    })
    request.on('trailers', trailers => {
      result.trailers = trailers
    })
    request.on('data', chunk => {
      result.body += chunk
    })
    request.on('error', reject)
    request.on('end', () => resolve(result))
    request.end()
  })

  expect(response.headers[':status']).toBe(200)
  expect(response.headers['transfer-encoding']).toBe(undefined)
  expect(response.headers.trailer).toBe('x-checksum')
  expect(response.body).toBe('hello')
  expect(response.trailers['x-checksum']).toBe('abc')
})

describe('http2 large non-stream replies are sent completely', () => {
const modes = ['buffer', 'string']
for (const mode of modes) {
    test(mode, async () => {
      const fastify = Fastify({ http2: true })
      const payload = mode === 'buffer'
        ? Buffer.alloc((64 * 1024) + 1, 'a')
        : 'a'.repeat((64 * 1024) + 1)
      const contentLength = Buffer.byteLength(payload)

      fastify.get('/large', async (req, reply) => {
        reply.header('content-type', 'application/octet-stream')
        reply.header('content-length', contentLength)

        return payload
      })

      await fastify.listen({ port: 0, host: '127.0.0.1' })

      const client = http2.connect(`http://127.0.0.1:${fastify.server.address().port}`)
      onTestFinished(() => {
        client.close()
        return fastify.close()
      })

      await new Promise((resolve, reject) => {
        const large = client.request({
          [http2.constants.HTTP2_HEADER_METHOD]: http2.constants.HTTP2_METHOD_GET,
          [http2.constants.HTTP2_HEADER_PATH]: '/large'
        })
        const chunks = []

        large.on('error', reject)
        large.on('data', chunk => {
          chunks.push(chunk)
        })
        large.on('end', () => {
          expect(Buffer.concat(chunks).length).toBe(contentLength)
          resolve()
        })
        large.end()
      })
    })
  }
})

test('http2 large buffer replies can be cancelled without rejecting the next stream', async () => {
  const fastify = Fastify({ http2: true })
  const payload = Buffer.alloc(32 * 1024 * 1024, 'a')
  let smallHit = false

  fastify.get('/large', async (req, reply) => {
    reply.header('content-type', 'application/octet-stream')
    reply.header('content-length', payload.length)

    return payload
  })

  fastify.get('/small', async () => {
    smallHit = true
    return 'ok'
  })

  await fastify.listen({ port: 0, host: '127.0.0.1' })

  const client = http2.connect(`http://127.0.0.1:${fastify.server.address().port}`)
  onTestFinished(() => {
    client.close()
    return fastify.close()
  })

  await new Promise((resolve, reject) => {
    let cancelTimer
    let requestTimer
    let timeout

    function cleanup () {
      clearTimeout(cancelTimer)
      clearTimeout(requestTimer)
      clearTimeout(timeout)
    }

    const large = client.request({
      [http2.constants.HTTP2_HEADER_METHOD]: http2.constants.HTTP2_METHOD_GET,
      [http2.constants.HTTP2_HEADER_PATH]: '/large'
    })
    let largeResponded = false

    large.on('error', err => {
      if (!largeResponded) {
        cleanup()
        reject(err)
      }
    })
    large.on('response', () => {
      largeResponded = true
      large.pause()
      cancelTimer = setTimeout(() => {
        large.close(http2.constants.NGHTTP2_CANCEL)
      }, 100)
      requestTimer = setTimeout(() => {
        const small = client.request({
          [http2.constants.HTTP2_HEADER_METHOD]: http2.constants.HTTP2_METHOD_GET,
          [http2.constants.HTTP2_HEADER_PATH]: '/small'
        })
        let body = ''

        timeout = setTimeout(() => {
          cleanup()
          reject(new Error('timed out waiting for /small response'))
        }, 3000)

        small.setEncoding('utf8')
        small.on('error', err => {
          cleanup()
          reject(err)
        })
        small.on('data', chunk => {
          body += chunk
        })
        small.on('end', () => {
          cleanup()
          expect(body).toBe('ok')
          expect(smallHit).toBe(true)
          resolve()
        })
        small.end()
      }, 200)
    })
    large.end()
  })
})
