'use strict'


const Stream = require('node:stream')
const util = require('node:util')
const Fastify = require('..')
const { Readable } = require('node:stream')

test('inject should exist', async () => {
  expect.assertions(2)
  const fastify = Fastify()
  expect(fastify.inject).toBeTruthy()
  expect(typeof fastify.inject).toBe('function')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('should wait for the ready event', (done) => {
  expect.assertions(4)
  const fastify = Fastify()
  const payload = { hello: 'world' }

  fastify.register((instance, opts, done) => {
    instance.get('/', (req, reply) => {
      reply.send(payload)
    })
    setTimeout(done, 500)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(payload).toEqual(JSON.parse(res.payload))
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-length']).toBe('17')
    done()
  })
})

test('inject get request', (done) => {
  expect.assertions(4)
  const fastify = Fastify()
  const payload = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.send(payload)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(payload).toEqual(JSON.parse(res.payload))
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-length']).toBe('17')
    done()
  })
})

test('inject get request - code check', (done) => {
  expect.assertions(4)
  const fastify = Fastify()
  const payload = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.code(201).send(payload)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(payload).toEqual(JSON.parse(res.payload))
    expect(res.statusCode).toBe(201)
    expect(res.headers['content-length']).toBe('17')
    done()
  })
})

test('inject get request - headers check', (done) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.get('/', (req, reply) => {
    reply.header('content-type', 'text/plain').send('')
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect('').toBe(res.payload)
    expect(res.headers['content-type']).toBe('text/plain')
    expect(res.headers['content-length']).toBe('0')
    done()
  })
})

test('inject get request - querystring', (done) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.get('/', (req, reply) => {
    reply.send(req.query)
  })

  fastify.inject({
    method: 'GET',
    url: '/?hello=world'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect({ hello: 'world' }).toEqual(JSON.parse(res.payload))
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-length']).toBe('17')
    done()
  })
})

test('inject get request - params', (done) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.get('/:hello', (req, reply) => {
    reply.send(req.params)
  })

  fastify.inject({
    method: 'GET',
    url: '/world'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect({ hello: 'world' }).toEqual(JSON.parse(res.payload))
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-length']).toBe('17')
    done()
  })
})

test('inject get request - wildcard', (done) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.get('/test/*', (req, reply) => {
    reply.send(req.params)
  })

  fastify.inject({
    method: 'GET',
    url: '/test/wildcard'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect({ '*': 'wildcard' }).toEqual(JSON.parse(res.payload))
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-length']).toBe('16')
    done()
  })
})

test('inject get request - headers', (done) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.get('/', (req, reply) => {
    reply.send(req.headers)
  })

  fastify.inject({
    method: 'GET',
    url: '/',
    headers: { hello: 'world' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect('world').toBe(JSON.parse(res.payload).hello)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-length']).toBe('69')
    done()
  })
})

test('inject post request', (done) => {
  expect.assertions(4)
  const fastify = Fastify()
  const payload = { hello: 'world' }

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    payload
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(payload).toEqual(JSON.parse(res.payload))
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-length']).toBe('17')
    done()
  })
})

test('inject post request - send stream', (done) => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    headers: { 'content-type': 'application/json' },
    payload: getStream()
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect('{"hello":"world"}').toEqual(res.payload)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-length']).toBe('17')
    done()
  })
})

test('inject get request - reply stream', (done) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.get('/', (req, reply) => {
    reply.send(getStream())
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect('{"hello":"world"}').toEqual(res.payload)
    expect(res.statusCode).toBe(200)
    done()
  })
})

test('inject promisify - waiting for ready event', (done) => {
  expect.assertions(1)
  const fastify = Fastify()
  const payload = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.send(payload)
  })

  const injectParams = {
    method: 'GET',
    url: '/'
  }
  fastify.inject(injectParams)
    .then(res => {
      expect(res.statusCode).toBe(200)
      done()
    })
    .catch(expect.fail)
})

test('inject promisify - after the ready event', (done) => {
  expect.assertions(2)
  const fastify = Fastify()
  const payload = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.send(payload)
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()

    const injectParams = {
      method: 'GET',
      url: '/'
    }
    fastify.inject(injectParams)
      .then(res => {
        expect(res.statusCode).toBe(200)
        done()
      })
      .catch(expect.fail)
  })
})

test('inject promisify - when the server is up', (done) => {
  expect.assertions(2)
  const fastify = Fastify()
  const payload = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.send(payload)
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()

    // setTimeout because the ready event don't set "started" flag
    // in this iteration of the 'event loop'
    setTimeout(() => {
      const injectParams = {
        method: 'GET',
        url: '/'
      }
      fastify.inject(injectParams)
        .then(res => {
          expect(res.statusCode).toBe(200)
          done()
        })
        .catch(expect.fail)
    }, 10)
  })
})

test('should reject in error case', (done) => {
  expect.assertions(1)
  const fastify = Fastify()

  const error = new Error('DOOM!')
  fastify.register((instance, opts, done) => {
    setTimeout(done, 500, error)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  })
    .catch(e => {
      expect(e).toBe(error)
      done()
    })
})

test('inject a multipart request using form-body', (done) => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.addContentTypeParser('*', function (req, payload, done) {
    let body = ''
    payload.on('data', d => {
      body += d
    })
    payload.on('end', () => {
      done(null, body)
    })
  })
  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  const form = new FormData()
  form.set('my_field', 'my value')

  fastify.inject({
    method: 'POST',
    url: '/',
    payload: form
  })
    .then(response => {
      expect(response.statusCode).toBe(200)
      expect(/Content-Disposition: form-data; name="my_field"/.test(response.payload)).toBeTruthy()
      done()
    })
})

// https://github.com/hapijs/shot/blob/master/test/index.js#L836
function getStream () {
  const Read = function () {
    Stream.Readable.call(this)
  }
  util.inherits(Read, Stream.Readable)
  const word = '{"hello":"world"}'
  let i = 0

  Read.prototype._read = function (size) {
    this.push(word[i] ? word[i++] : null)
  }

  return new Read()
}

test('should error the promise if ready errors', (done) => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.register((instance, opts) => {
    return Promise.reject(new Error('kaboom'))
  }).after(function () {
    expect('after is called').toBeTruthy()
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }).then(() => {
    expect.fail('this should not be called')
  }).catch(err => {
    expect(err).toBeTruthy()
    expect(err.message).toBe('kaboom')
    done()
  })
})

test('should throw error if callback specified and if ready errors', (done) => {
  expect.assertions(2)
  const fastify = Fastify()
  const error = new Error('kaboom')

  fastify.register((instance, opts) => {
    return Promise.reject(error)
  })

  fastify.inject({
    method: 'GET',
    url: '/'
  }, err => {
    expect(err).toBeTruthy()
    expect(err).toBe(error)
    done()
  })
})

test('should support builder-style injection with ready app', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  const payload = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.send(payload)
  })

  await fastify.ready()
  const res = await fastify.inject().get('/').end()
  expect(payload).toEqual(JSON.parse(res.payload))
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-length']).toBe('17')
})

test('should support builder-style injection with non-ready app', async () => {
  expect.assertions(3)
  const fastify = Fastify()
  const payload = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.send(payload)
  })

  const res = await fastify.inject().get('/').end()
  expect(payload).toEqual(JSON.parse(res.payload))
  expect(res.statusCode).toBe(200)
  expect(res.headers['content-length']).toBe('17')
})

test('should handle errors in builder-style injection correctly', async () => {
  expect.assertions(2)
  const fastify = Fastify()
  fastify.register((instance, opts, done) => {
    done(new Error('Kaboom'))
  })

  try {
    await fastify.inject().get('/')
  } catch (err) {
    expect(err).toBeTruthy()
    expect(err.message).toBe('Kaboom')
  }
})

test('Should not throw on access to routeConfig frameworkErrors handler - XUFA_ERR_BAD_URL', (done) => {
  expect.assertions(5)

  const fastify = Fastify({
    frameworkErrors: function (err, req, res) {
      expect(typeof req.id === 'string').toBeTruthy()
      expect(req.raw instanceof Readable).toBeTruthy()
      expect(req.routeOptions.url).toEqual(undefined)
      res.send(`${err.message} - ${err.code}`)
    }
  })

  fastify.get('/test/:id', (req, res) => {
    res.send('{ hello: \'world\' }')
  })

  fastify.inject(
    {
      method: 'GET',
      url: '/test/%world'
    },
    (err, res) => {
      expect(err).toBeFalsy()
      expect(res.body).toBe('\'/test/%world\' is not a valid url component - XUFA_ERR_BAD_URL')
      done()
    }
  )
})
