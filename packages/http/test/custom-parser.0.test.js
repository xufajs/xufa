'use strict'

const fs = require('node:fs')

const Fastify = require('..')
const jsonParser = require('fast-json-body')
const { plainTextParser } = require('./helper')

test('contentTypeParser method should exist', async () => {
  expect.assertions(1)
  const fastify = Fastify()
  expect(fastify.addContentTypeParser).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

describe('contentTypeParser should add a custom parser', () => {
let fastifyServer;

const fastify = Fastify()
fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })
fastify.options('/', (req, reply) => {
    reply.send(req.body)
  })
fastify.addContentTypeParser('application/jsoff', function (req, payload, done) {
    jsonParser(payload, function (err, body) {
      done(err, body)
    })
  })
afterAll(() => fastify.close())
beforeAll(async () => {
fastifyServer = await fastify.listen({ port: 0 });
})
test('in POST', async () => {
    expect.assertions(3)

    const result = await fetch(fastifyServer, {
      method: 'POST',
      body: '{"hello":"world"}',
      headers: {
        'Content-Type': 'application/jsoff'
      }
    })

    expect(result.ok).toBeTruthy()
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual({ hello: 'world' })
  })
test('in OPTIONS', async () => {
    expect.assertions(2)

    const result = await fetch(fastifyServer, {
      method: 'OPTIONS',
      body: '{"hello":"world"}',
      headers: {
        'Content-Type': 'application/jsoff'
      }
    })

    expect(result.status).toBe(200)
    const body = await result.text()
    expect(body).toBe(JSON.stringify({ hello: 'world' }))
  })
})

test('contentTypeParser should handle multiple custom parsers', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.post('/hello', (req, reply) => {
    reply.send(req.body)
  })

  function customParser (req, payload, done) {
    jsonParser(payload, function (err, body) {
      done(err, body)
    })
  }

  fastify.addContentTypeParser('application/jsoff', customParser)
  fastify.addContentTypeParser('application/ffosj', customParser)

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result1 = await fetch(fastifyServer, {
    method: 'POST',
    body: '{"hello":"world"}',
    headers: {
      'Content-Type': 'application/jsoff'
    }
  })

  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)
  expect(await result1.json()).toEqual({ hello: 'world' })

  const result2 = await fetch(fastifyServer + '/hello', {
    method: 'POST',
    body: '{"hello":"world"}',
    headers: {
      'Content-Type': 'application/ffosj'
    }
  })

  expect(result2.ok).toBeTruthy()
  expect(result2.status).toBe(200)

  expect(await result2.json()).toEqual({ hello: 'world' })
})

test('contentTypeParser should handle an array of custom contentTypes', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.post('/hello', (req, reply) => {
    reply.send(req.body)
  })

  function customParser (req, payload, done) {
    jsonParser(payload, function (err, body) {
      done(err, body)
    })
  }

  fastify.addContentTypeParser(['application/jsoff', 'application/ffosj'], customParser)

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result1 = await fetch(fastifyServer, {
    method: 'POST',
    body: '{"hello":"world"}',
    headers: {
      'Content-Type': 'application/jsoff'
    }
  })

  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)
  expect(await result1.json()).toEqual({ hello: 'world' })

  const result2 = await fetch(fastifyServer + '/hello', {
    method: 'POST',
    body: '{"hello":"world"}',
    headers: {
      'Content-Type': 'application/ffosj'
    }
  })

  expect(result2.ok).toBeTruthy()
  expect(result2.status).toBe(200)
  expect(await result2.json()).toEqual({ hello: 'world' })
})

test('contentTypeParser should handle errors', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.addContentTypeParser('application/jsoff', function (req, payload, done) {
    done(new Error('kaboom!'), {})
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: '{"hello":"world"}',
    headers: {
      'Content-Type': 'application/jsoff'
    }
  })

  expect(result.status).toBe(500)
})

test('contentTypeParser should support encapsulation', (testDone) => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.addContentTypeParser('application/jsoff', () => {})
    expect(instance.hasContentTypeParser('application/jsoff')).toBeTruthy()

    instance.register((instance, opts, done) => {
      instance.addContentTypeParser('application/ffosj', () => {})
      expect(instance.hasContentTypeParser('application/jsoff')).toBeTruthy()
      expect(instance.hasContentTypeParser('application/ffosj')).toBeTruthy()
      done()
    })

    done()
  })

  fastify.ready(err => {
    expect(err).toBeFalsy()
    expect(fastify.hasContentTypeParser('application/jsoff')).toBeFalsy()
    expect(fastify.hasContentTypeParser('application/ffosj')).toBeFalsy()
    testDone()
  })
})

test('contentTypeParser should support encapsulation, second try', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.post('/', (req, reply) => {
      reply.send(req.body)
    })

    instance.addContentTypeParser('application/jsoff', function (req, payload, done) {
      jsonParser(payload, function (err, body) {
        done(err, body)
      })
    })

    done()
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: '{"hello":"world"}',
    headers: {
      'Content-Type': 'application/jsoff'
    }
  })

  expect(result.status).toBe(200)
  const body = await result.text()
  expect(body).toBe(JSON.stringify({ hello: 'world' }))
})

test('contentTypeParser shouldn\'t support request with undefined "Content-Type"', async () => {
  expect.assertions(1)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.addContentTypeParser('application/jsoff', function (req, payload, done) {
    jsonParser(payload, function (err, body) {
      done(err, body)
    })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: 'unknown content type!',
    headers: {
      'Content-Type': undefined
    }
  })

  expect(result.status).toBe(415)
})

test('the content type should be a string or RegExp', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  try {
    fastify.addContentTypeParser(null, () => {})
    expect.fail()
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_CTP_INVALID_TYPE')
    expect(err.message).toBe('The content type should be a string or a RegExp')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('the content type cannot be an empty string', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  try {
    fastify.addContentTypeParser('', () => {})
    expect.fail()
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_CTP_EMPTY_TYPE')
    expect(err.message).toBe('The content type cannot be an empty string')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('the content type handler should be a function', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  try {
    fastify.addContentTypeParser('aaa', null)
    expect.fail()
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_CTP_INVALID_HANDLER')
    expect(err.message).toBe('The content type handler should be a function')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('catch all content type parser', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.addContentTypeParser('*', function (req, payload, done) {
    let data = ''
    payload.on('data', chunk => { data += chunk })
    payload.on('end', () => {
      done(null, data)
    })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result1 = await fetch(fastifyServer, {
    method: 'POST',
    body: 'hello',
    headers: {
      'Content-Type': 'application/jsoff'
    }
  })

  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)
  expect(await result1.text()).toBe('hello')

  const result2 = await fetch(fastifyServer, {
    method: 'POST',
    body: 'hello',
    headers: {
      'Content-Type': 'very-weird-content-type/foo'
    }
  })

  expect(result2.ok).toBeTruthy()
  expect(result2.status).toBe(200)
  expect(await result2.text()).toBe('hello')
})

test('catch all content type parser should not interfere with other content type parsers', async () => {
  expect.assertions(6)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.addContentTypeParser('*', function (req, payload, done) {
    let data = ''
    payload.on('data', chunk => { data += chunk })
    payload.on('end', () => {
      done(null, data)
    })
  })

  fastify.addContentTypeParser('application/jsoff', function (req, payload, done) {
    jsonParser(payload, function (err, body) {
      done(err, body)
    })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result1 = await fetch(fastifyServer, {
    method: 'POST',
    body: '{"hello":"world"}',
    headers: {
      'Content-Type': 'application/jsoff'
    }
  })

  expect(result1.ok).toBeTruthy()
  expect(result1.status).toBe(200)
  expect(await result1.json()).toEqual({ hello: 'world' })

  const result2 = await fetch(fastifyServer, {
    method: 'POST',
    body: 'hello',
    headers: {
      'Content-Type': 'very-weird-content-type/foo'
    }
  })

  expect(result2.ok).toBeTruthy()
  expect(result2.status).toBe(200)
  expect(await result2.text()).toBe('hello')
})

// Issue 492 https://github.com/fastify/fastify/issues/492
test('\'*\' catch undefined Content-Type requests', async () => {
  expect.assertions(3)

  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.addContentTypeParser('*', function (req, payload, done) {
    let data = ''
    payload.on('data', chunk => { data += chunk })
    payload.on('end', () => {
      done(null, data)
    })
  })

  fastify.post('/', (req, res) => {
    // Needed to avoid json stringify
    res.type('text/plain').send(req.body)
  })

  const fastifyServer = await fastify.listen({ port: 0 })

  const fileStream = fs.createReadStream(__filename)

  const result = await fetch(fastifyServer + '/', {
    method: 'POST',
    body: fileStream,
    duplex: 'half'
  })

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.text()).toBe(fs.readFileSync(__filename).toString())
})

test('cannot add custom parser after binding', (testDone) => {
  expect.assertions(2)

  const fastify = Fastify()

  onTestFinished(() => fastify.close())

  fastify.post('/', (req, res) => {
    res.type('text/plain').send(req.body)
  })

  fastify.listen({ port: 0 }, function (err) {
    expect(err).toBeFalsy()

    try {
      fastify.addContentTypeParser('*', () => {})
      expect.fail()
    } catch (e) {
      expect(true).toBeTruthy()
      testDone()
    }
  })
})

test('Can override the default json parser', async () => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.addContentTypeParser('application/json', function (req, payload, done) {
    expect('called').toBeTruthy()
    jsonParser(payload, function (err, body) {
      done(err, body)
    })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: '{"hello":"world"}',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  expect(result.status).toBe(200)
  const body = await result.text()
  expect(body).toBe('{"hello":"world"}')
})

test('Can override the default plain text parser', async () => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.addContentTypeParser('text/plain', function (req, payload, done) {
    expect('called').toBeTruthy()
    plainTextParser(payload, function (err, body) {
      done(err, body)
    })
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: 'hello world',
    headers: {
      'Content-Type': 'text/plain'
    }
  })

  expect(result.status).toBe(200)
  const body = await result.text()
  expect(body).toBe('hello world')
})

test('Can override the default json parser in a plugin', async () => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.register((instance, opts, done) => {
    instance.addContentTypeParser('application/json', function (req, payload, done) {
      expect('called').toBeTruthy()
      jsonParser(payload, function (err, body) {
        done(err, body)
      })
    })

    instance.post('/', (req, reply) => {
      reply.send(req.body)
    })

    done()
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: '{"hello":"world"}',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  expect(result.status).toBe(200)
  const body = await result.text()
  expect(body).toBe('{"hello":"world"}')
})

test('Can\'t override the json parser multiple times', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.addContentTypeParser('application/json', function (req, payload, done) {
    jsonParser(payload, function (err, body) {
      done(err, body)
    })
  })

  try {
    fastify.addContentTypeParser('application/json', function (req, payload, done) {
      expect('called').toBeTruthy()
      jsonParser(payload, function (err, body) {
        done(err, body)
      })
    })
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_CTP_ALREADY_PRESENT')
    expect(err.message).toBe('Content type parser \'application/json\' already present.')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Can\'t override the plain text parser multiple times', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.addContentTypeParser('text/plain', function (req, payload, done) {
    plainTextParser(payload, function (err, body) {
      done(err, body)
    })
  })

  try {
    fastify.addContentTypeParser('text/plain', function (req, payload, done) {
      expect('called').toBeTruthy()
      plainTextParser(payload, function (err, body) {
        done(err, body)
      })
    })
  } catch (err) {
    expect(err.code).toBe('XUFA_ERR_CTP_ALREADY_PRESENT')
    expect(err.message).toBe('Content type parser \'text/plain\' already present.')
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Should get the body as string', async () => {
  expect.assertions(4)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
    expect('called').toBeTruthy()
    expect(typeof body === 'string').toBeTruthy()
    try {
      const json = JSON.parse(body)
      done(null, json)
    } catch (err) {
      err.statusCode = 400
      done(err, undefined)
    }
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: '{"hello":"world"}',
    headers: {
      'Content-Type': 'application/json'
    }
  })

  expect(result.status).toBe(200)
  const body = await result.text()
  expect(body).toBe('{"hello":"world"}')
})

test('Should return defined body with no custom parser defined and content type = \'text/plain\'', async () => {
  expect.assertions(2)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  const fastifyServer = await fastify.listen({ port: 0 })
  onTestFinished(() => fastify.close())

  const result = await fetch(fastifyServer, {
    method: 'POST',
    body: 'hello world',
    headers: {
      'Content-Type': 'text/plain'
    }
  })

  expect(result.status).toBe(200)
  const body = await result.text()
  expect(body).toBe('hello world')
})

test('Should have typeof body object with no custom parser defined, no body defined and content type = \'text/plain\'', async () => {
  expect.assertions(3)
  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send(req.body)
  })

  onTestFinished(() => fastify.close())

  const fastifyServer = await fastify.listen({ port: 0 })

  const result = await fetch(fastifyServer, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain'
    }
  })

  expect(result.ok).toBeTruthy()
  expect(result.status).toBe(200)
  expect(await result.text()).toBe('')
})
