'use strict'


const Fastify = require('..')

test('nullable string', (done) => {
  expect.assertions(3)
  const fastify = Fastify()
  fastify.route({
    method: 'POST',
    url: '/',
    handler: (req, reply) => {
      expect(req.body.hello).toBe(null)
      reply.code(200).send(req.body)
    },
    schema: {
      body: {
        type: 'object',
        properties: {
          hello: {
            type: 'string',
            format: 'email',
            nullable: true
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            hello: {
              type: 'string',
              format: 'email',
              nullable: true
            }
          }
        }
      }
    }
  })
  fastify.inject({
    method: 'POST',
    url: '/',
    body: {
      hello: null
    }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json().hello).toBe(null)
    done()
  })
})

test('object or null body', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.route({
    method: 'POST',
    url: '/',
    handler: (req, reply) => {
      expect(req.body).toBe(undefined)
      reply.code(200).send({ isUndefinedBody: req.body === undefined })
    },
    schema: {
      body: {
        type: ['object', 'null'],
        properties: {
          hello: {
            type: 'string',
            format: 'email'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          nullable: true,
          properties: {
            isUndefinedBody: {
              type: 'boolean'
            }
          }
        }
      }
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => { fastify.close() })

  const result = await fetch(fastifyServer, {
    method: 'POST'
  })

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({ isUndefinedBody: true })
})

test('nullable body', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.route({
    method: 'POST',
    url: '/',
    handler: (req, reply) => {
      expect(req.body).toBe(undefined)
      reply.code(200).send({ isUndefinedBody: req.body === undefined })
    },
    schema: {
      body: {
        type: 'object',
        nullable: true,
        properties: {
          hello: {
            type: 'string',
            format: 'email'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          nullable: true,
          properties: {
            isUndefinedBody: {
              type: 'boolean'
            }
          }
        }
      }
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST'
  })

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.json()).toEqual({ isUndefinedBody: true })
})

test('Nullable body with 204', async () => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.route({
    method: 'POST',
    url: '/',
    handler: (req, reply) => {
      expect(req.body).toBe(undefined)
      reply.code(204).send()
    },
    schema: {
      body: {
        type: 'object',
        nullable: true,
        properties: {
          hello: {
            type: 'string',
            format: 'email'
          }
        }
      }
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST'
  })

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(204)
  expect((await result.text()).length).toBe(0)
})
