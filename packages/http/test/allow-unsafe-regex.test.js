'use strict'


const Fastify = require('..')

test('allow unsafe regex', async () => {
  expect.assertions(2)

  const fastify = Fastify({
    routerOptions: {
      allowUnsafeRegex: false
    }
  })
  onTestFinished(() => fastify.close())

  fastify.get('/:foo(^[0-9]*$)', (req, reply) => {
    reply.send({ foo: req.params.foo })
  })

  await fastify.listen({ port: 0 })

  const result = await fetch(`http://localhost:${fastify.server.address().port}/1234`)
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({ foo: '1234' })
})

test('allow unsafe regex not match', async () => {
  expect.assertions(1)

  const fastify = Fastify({
    routerOptions: {
      allowUnsafeRegex: false
    }
  })
  onTestFinished(() => fastify.close())

  fastify.get('/:foo(^[0-9]*$)', (req, reply) => {
    reply.send({ foo: req.params.foo })
  })

  await fastify.listen({ port: 0 })

  const result = await fetch(`http://localhost:${fastify.server.address().port}/a1234`)
  expect(result.status).toBe(404)
})

test('allow unsafe regex not safe', (done) => {
  expect.assertions(1)

  const fastify = Fastify({
    routerOptions: {
      allowUnsafeRegex: false
    }
  })
  onTestFinished(() => fastify.close())

  expect(() => {
    fastify.get('/:foo(^([0-9]+){4}$)', (req, reply) => {
      reply.send({ foo: req.params.foo })
    })
  }).toThrow()
  done()
})

test('allow unsafe regex not safe by default', (done) => {
  expect.assertions(1)

  const fastify = Fastify()
  onTestFinished(() => fastify.close())

  expect(() => {
    fastify.get('/:foo(^([0-9]+){4}$)', (req, reply) => {
      reply.send({ foo: req.params.foo })
    })
  }).toThrow()
  done()
})

test('allow unsafe regex allow unsafe', async () => {
  expect.assertions(3)

  const fastify = Fastify({
    routerOptions: {
      allowUnsafeRegex: true
    }
  })
  onTestFinished(() => fastify.close())

  expect(() => {
    fastify.get('/:foo(^([0-9]+){4}$)', (req, reply) => {
      reply.send({ foo: req.params.foo })
    })
  }).not.toThrow()

  await fastify.listen({ port: 0 })

  const result = await fetch(`http://localhost:${fastify.server.address().port}/1234`)
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({ foo: '1234' })
})
