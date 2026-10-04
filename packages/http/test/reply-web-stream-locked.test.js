'use strict'

const { ReadableStream } = require('node:stream/web')

const Fastify = require('..')

test('reply.send(web ReadableStream) throws if locked', async () => {
  expect.assertions(3)

  const app = Fastify()
  onTestFinished(() => app.close())

  app.get('/', (req, reply) => {
    const rs = new ReadableStream({
      start (controller) { controller.enqueue(new TextEncoder().encode('hi')); controller.close() }
    })
    // lock the stream
    const reader = rs.getReader()
    expect(rs.locked).toBe(true)

    // sending a locked stream should trigger the Fastify error
    reply.send(rs)
    reader.releaseLock()
  })

  const res = await app.inject({ method: 'GET', url: '/' })
  expect(res.statusCode).toBe(500)
  expect(JSON.parse(res.body)).toEqual({
      statusCode: 500,
      code: 'XUFA_ERR_REP_READABLE_STREAM_LOCKED',
      error: 'Internal Server Error',
      message: 'ReadableStream was locked. You should call releaseLock() method on reader before sending.'
    })
})
