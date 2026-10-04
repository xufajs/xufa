'use strict'


const Fastify = require('..')
const Reply = require('../lib/reply')

test('should serialize reply when response stream is ended', (done) => {
  expect.assertions(5)

  const stream = require('node:stream')
  const fastify = Fastify({
    logger: {
      serializers: {
        res (reply) {
          expect(reply instanceof Reply).toBe(true)
          expect('passed').toBeTruthy()
          return reply
        }
      }
    }
  })

  fastify.get('/error', function (req, reply) {
    const reallyLongStream = new stream.Readable({
      read: () => { }
    })
    reply.code(200).send(reallyLongStream)
    reply.raw.end(Buffer.from('hello\n'))
  })

  onTestFinished(() => fastify.close())

  fastify.inject({
    url: '/error',
    method: 'GET'
  }, (err) => {
    expect(err).toBeFalsy()
    done()
  })
})
