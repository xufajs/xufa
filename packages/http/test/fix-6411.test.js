'use strict'


const Fastify = require('..')

test('custom validatorCompiler returning falsy values should update request param', async () => {
  const fastify = Fastify()

  fastify.setValidatorCompiler(() => {
    return (data) => {
      if (typeof data === 'object' && data !== null && 'coerceTo' in data) {
        return { value: data.coerceTo }
      }
      return true
    }
  })

  fastify.post('/test', { schema: { body: { type: 'object' } } }, (request, reply) => {
    reply.send({ body: request.body })
  })

  // value: 0 (falsy)
  {
    const res = await fastify.inject({
      method: 'POST',
      url: '/test',
      payload: { coerceTo: 0 }
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).body).toBe(0)
  }

  // value: "" (falsy)
  {
    const res = await fastify.inject({
      method: 'POST',
      url: '/test',
      payload: { coerceTo: '' }
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).body).toBe('')
  }

  // value: false (falsy)
  {
    const res = await fastify.inject({
      method: 'POST',
      url: '/test',
      payload: { coerceTo: false }
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).body).toBe(false)
  }

  // value: null (falsy)
  {
    const res = await fastify.inject({
      method: 'POST',
      url: '/test',
      payload: { coerceTo: null }
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.payload).body).toBe(null)
  }
})
