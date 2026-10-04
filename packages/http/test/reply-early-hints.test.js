'use strict'

const Fastify = require('..')

const http = require('node:http')
const http2 = require('node:http2')

const testResBody = 'Hello, world!'

test('sends early hints', (done) => {
  expect.assertions(6)

  const fastify = Fastify({
    logger: false
  })

  fastify.get('/', async (request, reply) => {
    reply.writeEarlyHints({
      link: '</styles.css>; rel=preload; as=style'
    }, () => {
      expect('callback called').toBeTruthy()
    })

    return testResBody
  })

  fastify.listen({ port: 0 }, (err, address) => {
    expect(err).toBeFalsy()

    const req = http.get(address)

    req.on('information', (res) => {
      expect(res.statusCode).toBe(103)
      expect(res.headers.link).toBe('</styles.css>; rel=preload; as=style')
    })

    req.on('response', (res) => {
      expect(res.statusCode).toBe(200)

      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        expect(data).toBe(testResBody)
        fastify.close()
        done()
      })
    })
  })
})

test('sends early hints (http2)', (done) => {
  expect.assertions(6)

  const fastify = Fastify({
    http2: true,
    logger: false
  })

  fastify.get('/', async (request, reply) => {
    reply.writeEarlyHints({
      link: '</styles.css>; rel=preload; as=style'
    })

    return testResBody
  })

  fastify.listen({ port: 0 }, (err, address) => {
    expect(err).toBeFalsy()

    const client = http2.connect(address)
    const req = client.request()

    req.on('headers', (headers) => {
      expect(headers).not.toBe(undefined)
      expect(headers[':status']).toBe(103)
      expect(headers.link).toBe('</styles.css>; rel=preload; as=style')
    })

    req.on('response', (headers) => {
      expect(headers[':status']).toBe(200)
    })

    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })

    req.on('end', () => {
      expect(data).toBe(testResBody)
      client.close()
      fastify.close()
      done()
    })

    req.end()
  })
})
