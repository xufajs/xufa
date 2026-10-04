'use strict'


const fastify = require('..')

test('same shape on Request', async () => {
  expect.assertions(1)

  const app = fastify()

  let request

  app.decorateRequest('user')

  app.addHook('preHandler', (req, reply, done) => {
    if (request) {
      req.user = 'User'
    }
    done()
  })

  app.get('/', (req, reply) => {
    if (request) {
      expect(request).toEqual(req)
    }

    request = req

    return 'hello world'
  })

  await app.inject('/')
  await app.inject('/')
})

test('same shape on Request when object', async () => {
  expect.assertions(1)

  const app = fastify()

  let request

  app.decorateRequest('object', null)

  app.addHook('preHandler', (req, reply, done) => {
    if (request) {
      req.object = {}
    }
    done()
  })

  app.get('/', (req, reply) => {
    if (request) {
      expect(request).toEqual(req)
    }

    request = req

    return 'hello world'
  })

  await app.inject('/')
  await app.inject('/')
})

test('same shape on Reply', async () => {
  expect.assertions(1)

  const app = fastify()

  let _reply

  app.decorateReply('user')

  app.addHook('preHandler', (req, reply, done) => {
    if (_reply) {
      reply.user = 'User'
    }
    done()
  })

  app.get('/', (req, reply) => {
    if (_reply) {
      expect(_reply).toEqual(reply)
    }

    _reply = reply

    return 'hello world'
  })

  await app.inject('/')
  await app.inject('/')
})

test('same shape on Reply when object', async () => {
  expect.assertions(1)

  const app = fastify()

  let _reply

  app.decorateReply('object', null)

  app.addHook('preHandler', (req, reply, done) => {
    if (_reply) {
      reply.object = {}
    }
    done()
  })

  app.get('/', (req, reply) => {
    if (_reply) {
      expect(_reply).toEqual(reply)
    }

    _reply = reply

    return 'hello world'
  })

  await app.inject('/')
  await app.inject('/')
})
