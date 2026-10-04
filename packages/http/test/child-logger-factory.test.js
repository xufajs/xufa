'use strict'


const Fastify = require('..')

test('Should accept a custom childLoggerFactory function', (done) => {
  expect.assertions(4)

  const fastify = Fastify()
  fastify.setChildLoggerFactory(function (logger, bindings, opts) {
    expect(bindings.reqId).toBeTruthy()
    expect(opts).toBeTruthy()
    this.log.debug(bindings, 'created child logger')
    return logger.child(bindings, opts)
  })

  fastify.get('/', (req, reply) => {
    req.log.info('log message')
    reply.send()
  })

  onTestFinished(() => fastify.close())

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    fastify.inject({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port
    }, (err, res) => {
      expect(err).toBeFalsy()
      done()
    })
  })
})

test('Should accept a custom childLoggerFactory function as option', (done) => {
  expect.assertions(4)

  const fastify = Fastify({
    childLoggerFactory: function (logger, bindings, opts) {
      expect(bindings.reqId).toBeTruthy()
      expect(opts).toBeTruthy()
      this.log.debug(bindings, 'created child logger')
      return logger.child(bindings, opts)
    }
  })

  fastify.get('/', (req, reply) => {
    req.log.info('log message')
    reply.send()
  })

  onTestFinished(() => fastify.close())

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    fastify.inject({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port
    }, (err, res) => {
      expect(err).toBeFalsy()
      done()
    })
  })
})

test('req.log should be the instance returned by the factory', (done) => {
  expect.assertions(3)

  const fastify = Fastify()
  fastify.setChildLoggerFactory(function (logger, bindings, opts) {
    this.log.debug('using root logger')
    return this.log
  })

  fastify.get('/', (req, reply) => {
    expect(req.log).toBe(fastify.log)
    req.log.info('log message')
    reply.send()
  })

  onTestFinished(() => fastify.close())

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    fastify.inject({
      method: 'GET',
      url: 'http://localhost:' + fastify.server.address().port
    }, (err, res) => {
      expect(err).toBeFalsy()
      done()
    })
  })
})

test('should throw error if invalid logger is returned', (done) => {
  expect.assertions(2)

  const fastify = Fastify()
  fastify.setChildLoggerFactory(function () {
    this.log.debug('returning an invalid logger, expect error')
    return undefined
  })

  fastify.get('/', (req, reply) => {
    reply.send()
  })

  onTestFinished(() => fastify.close())

  fastify.listen({ port: 0 }, err => {
    expect(err).toBeFalsy()
    expect(() => {
      try {
        fastify.inject({
          method: 'GET',
          url: 'http://localhost:' + fastify.server.address().port
        }, (err) => {
          expect.fail('request should have failed but did not')
          expect(err).toBeFalsy()
          done()
        })
      } finally {
        done()
      }
    }).toThrow(expect.objectContaining({ code: 'XUFA_ERR_LOG_INVALID_LOGGER' }))
  })
})

test('request child loggers only receive a level when the route sets one', async () => {
  expect.assertions(3)

  const fastify = Fastify({ logger: { level: 'info', stream: { write () {} } } })
  const levels = []
  fastify.setChildLoggerFactory(function (logger, bindings, opts) {
    // an empty level would make pino reset the level of every request child
    levels.push(Object.hasOwn(opts, 'level') ? opts.level : 'inherited')
    return logger.child(bindings, opts)
  })

  fastify.get('/', (req, reply) => {
    reply.send(req.log.level)
  })
  fastify.get('/warn', { logLevel: 'warn' }, (req, reply) => {
    reply.send(req.log.level)
  })

  onTestFinished(() => fastify.close())

  expect((await fastify.inject('/')).body).toBe('info')
  expect((await fastify.inject('/warn')).body).toBe('warn')
  expect(levels).toEqual(['inherited', 'warn'])
})
