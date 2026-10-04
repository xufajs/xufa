'use strict'


const { Readable } = require('node:stream')
const Fastify = require('..')

test('code should handle null/undefined/float', (done) => {
  expect.assertions(8)

  const fastify = Fastify()

  fastify.get('/null', function (request, reply) {
    reply.status(null).send()
  })

  fastify.get('/undefined', function (request, reply) {
    reply.status(undefined).send()
  })

  fastify.get('/404.5', function (request, reply) {
    reply.status(404.5).send()
  })

  fastify.inject({
    method: 'GET',
    url: '/null'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({
      statusCode: 500,
      code: 'XUFA_ERR_BAD_STATUS_CODE',
      error: 'Internal Server Error',
      message: 'Called reply with an invalid status code: null'
    })
  })

  fastify.inject({
    method: 'GET',
    url: '/undefined'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({
      statusCode: 500,
      code: 'XUFA_ERR_BAD_STATUS_CODE',
      error: 'Internal Server Error',
      message: 'Called reply with an invalid status code: undefined'
    })
  })

  fastify.inject({
    method: 'GET',
    url: '/404.5'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(404)
    done()
  })
})

test('code should handle 204', (done) => {
  expect.assertions(13)

  const fastify = Fastify()

  fastify.get('/204', function (request, reply) {
    reply.status(204)
    return null
  })

  fastify.get('/undefined/204', function (request, reply) {
    reply.status(204).send({ message: 'hello' })
  })

  fastify.get('/stream/204', function (request, reply) {
    const stream = new Readable({
      read () {
        this.push(null)
      }
    })
    stream.on('end', () => {
      expect('stream ended').toBeTruthy()
    })
    reply.status(204).send(stream)
  })

  fastify.inject({
    method: 'GET',
    url: '/204'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(204)
    expect(res.payload).toBe('')
    expect(res.headers['content-length']).toBe(undefined)
  })

  fastify.inject({
    method: 'GET',
    url: '/undefined/204'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(204)
    expect(res.payload).toBe('')
    expect(res.headers['content-length']).toBe(undefined)
  })

  fastify.inject({
    method: 'GET',
    url: '/stream/204'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(204)
    expect(res.payload).toBe('')
    expect(res.headers['content-length']).toBe(undefined)
    done()
  })
})

test('code should handle onSend hook on 204', (done) => {
  expect.assertions(5)

  const fastify = Fastify()
  fastify.addHook('onSend', async function (request, reply, payload) {
    return {
      ...payload,
      world: 'hello'
    }
  })

  fastify.get('/204', function (request, reply) {
    reply.status(204).send({
      hello: 'world'
    })
  })

  fastify.inject({
    method: 'GET',
    url: '/204'
  }, (error, res) => {
    expect(error).toBeFalsy()
    expect(res.statusCode).toBe(204)
    expect(res.payload).toBe('')
    expect(res.headers['content-length']).toBe(undefined)
    expect(res.headers['content-type']).toBe(undefined)
    done()
  })
})
