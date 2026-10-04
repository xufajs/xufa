'use strict'


const Fastify = require('..')

test('sync route', async () => {
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  fastify.get('/', () => 'hello world')
  const res = await fastify.inject('/')
  expect(res.statusCode).toBe(200)
  expect(res.body).toBe('hello world')
})

test('sync route return null', async () => {
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  fastify.get('/', () => null)
  const res = await fastify.inject('/')
  expect(res.statusCode).toBe(200)
  expect(res.body).toBe('null')
})

test('sync route, error', async () => {
  const fastify = Fastify()
  onTestFinished(() => fastify.close())
  fastify.get('/', () => {
    throw new Error('kaboom')
  })
  const res = await fastify.inject('/')
  expect(res.statusCode).toBe(500)
})
