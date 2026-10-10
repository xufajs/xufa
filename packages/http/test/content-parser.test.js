'use strict'


const { spyWarning } = require('../lib/warnings')
const { Readable } = require('node:stream')
const Fastify = require('..')
const keys = require('../lib/symbols')
const { XUFA_ERR_CTP_ALREADY_PRESENT, XUFA_ERR_CTP_INVALID_TYPE, XUFA_ERR_CTP_INVALID_MEDIA_TYPE } = require('../lib/errors')
const { XUFASEC001 } = require('../lib/warnings')

const first = function (req, payload, done) {}
const second = function (req, payload, done) {}
const third = function (req, payload, done) {}

describe('hasContentTypeParser', () => {
test('should know about internal parsers', (done) => {
    expect.assertions(5)

    const fastify = Fastify()
    fastify.ready(err => {
      expect(err).toBeFalsy()
      expect(fastify.hasContentTypeParser('application/json')).toBeTruthy()
      expect(fastify.hasContentTypeParser('text/plain')).toBeTruthy()
      expect(fastify.hasContentTypeParser('  text/plain  ')).toBeTruthy()
      expect(fastify.hasContentTypeParser('application/jsoff')).toBeFalsy()
      done()
    })
  })
test('should only work with string and RegExp', async () => {
    expect.assertions(8)

    const fastify = Fastify()
    fastify.addContentTypeParser(/^image\/.*/, first)
    fastify.addContentTypeParser(/^application\/.+\+xml/, first)
    fastify.addContentTypeParser('image/gif', first)

    expect(fastify.hasContentTypeParser('application/json')).toBeTruthy()
    expect(fastify.hasContentTypeParser(/^image\/.*/)).toBeTruthy()
    expect(fastify.hasContentTypeParser(/^application\/.+\+xml/)).toBeTruthy()
    expect(fastify.hasContentTypeParser('image/gif')).toBeTruthy()
    expect(fastify.hasContentTypeParser(/^image\/.+\+xml/)).toBeFalsy()
    expect(fastify.hasContentTypeParser('image/png')).toBeFalsy()
    expect(fastify.hasContentTypeParser('*')).toBeFalsy()
    expect(() => fastify.hasContentTypeParser(123)).toThrow(XUFA_ERR_CTP_INVALID_TYPE)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
})

describe('getParser', () => {
test('should return matching parser', async () => {
    expect.assertions(7)

    const fastify = Fastify()

    fastify.addContentTypeParser(/^image\/.*/, first)
    fastify.addContentTypeParser(/^application\/.+\+xml/, second)
    fastify.addContentTypeParser('text/html', third)
    fastify.addContentTypeParser('text/html; charset=utf-8', third)

    expect(fastify[keys.kContentTypeParser].getParser('application/t+xml').fn).toBe(second)
    expect(fastify[keys.kContentTypeParser].getParser('image/png').fn).toBe(first)
    expect(fastify[keys.kContentTypeParser].getParser('text/html').fn).toBe(third)
    expect(fastify[keys.kContentTypeParser].getParser('text/html; charset=utf-8').fn).toBe(third)
    expect(fastify[keys.kContentTypeParser].getParser('text/html ; charset=utf-8').fn).toBe(third)
    expect(fastify[keys.kContentTypeParser].getParser('text/html\t; charset=utf-8').fn).toBe(third)
    expect(fastify[keys.kContentTypeParser].getParser('text/htmlINVALID')?.fn).toBe(undefined)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('should return matching parser with caching /1', async () => {
    expect.assertions(7)

    const fastify = Fastify()

    fastify.addContentTypeParser('text/html', first)

    expect(fastify[keys.kContentTypeParser].cache.size).toBe(0)
    expect(fastify[keys.kContentTypeParser].getParser('text/html').fn).toBe(first)
    expect(fastify[keys.kContentTypeParser].cache.size).toBe(1)
    expect(fastify[keys.kContentTypeParser].getParser('text/html ').fn).toBe(first)
    expect(fastify[keys.kContentTypeParser].cache.size).toBe(1)
    expect(fastify[keys.kContentTypeParser].getParser('text/html ').fn).toBe(first)
    expect(fastify[keys.kContentTypeParser].cache.size).toBe(1)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('should return matching parser with caching /2', async () => {
    expect.assertions(9)

    const fastify = Fastify()

    fastify.addContentTypeParser('text/html', first)

    expect(fastify[keys.kContentTypeParser].cache.size).toBe(0)
    expect(fastify[keys.kContentTypeParser].getParser('text/html').fn).toBe(first)
    expect(fastify[keys.kContentTypeParser].cache.size).toBe(1)
    expect(fastify[keys.kContentTypeParser].getParser('text/HTML').fn).toBe(first)
    expect(fastify[keys.kContentTypeParser].cache.size).toBe(1)
    expect(fastify[keys.kContentTypeParser].getParser('TEXT/html').fn).toBe(first)
    expect(fastify[keys.kContentTypeParser].cache.size).toBe(1)
    expect(fastify[keys.kContentTypeParser].getParser('TEXT/html').fn).toBe(first)
    expect(fastify[keys.kContentTypeParser].cache.size).toBe(1)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('should return matching parser with caching /3', async () => {
    expect.assertions(6)

    const fastify = Fastify()

    fastify.addContentTypeParser(/^text\/html(;\s*charset=[^;]+)?$/, first)

    expect(fastify[keys.kContentTypeParser].getParser('text/html').fn).toBe(first)
    expect(fastify[keys.kContentTypeParser].cache.size).toBe(1)
    expect(fastify[keys.kContentTypeParser].getParser('text/html;charset=utf-8').fn).toBe(first)
    expect(fastify[keys.kContentTypeParser].cache.size).toBe(2)
    expect(fastify[keys.kContentTypeParser].getParser('text/html;charset=utf-8').fn).toBe(first)
    expect(fastify[keys.kContentTypeParser].cache.size).toBe(2)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('should prefer content type parser with string value', async () => {
    expect.assertions(2)

    const fastify = Fastify()

    fastify.addContentTypeParser(/^image\/.*/, first)
    fastify.addContentTypeParser('image/gif', second)

    expect(fastify[keys.kContentTypeParser].getParser('image/gif').fn).toBe(second)
    expect(fastify[keys.kContentTypeParser].getParser('image/png').fn).toBe(first)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('should return parser that catches all if no other is set', async () => {
    expect.assertions(2)

    const fastify = Fastify()

    fastify.addContentTypeParser('*', first)
    fastify.addContentTypeParser(/^text\/.*/, second)

    expect(fastify[keys.kContentTypeParser].getParser('image/gif').fn).toBe(first)
    expect(fastify[keys.kContentTypeParser].getParser('text/html').fn).toBe(second)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('should return undefined if no matching parser exist', async () => {
    expect.assertions(2)

    const fastify = Fastify()

    fastify.addContentTypeParser(/^weirdType\/.+/, first)
    fastify.addContentTypeParser('application/javascript', first)

    expect(fastify[keys.kContentTypeParser].getParser('application/xml')).toBeFalsy()
    expect(fastify[keys.kContentTypeParser].getParser('weirdType/')).toBeFalsy()
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
})

describe('existingParser', () => {
let fastify, contentTypeParser;
test('returns always false for "*"', async () => {
    expect.assertions(2)

    const fastify = Fastify()

    fastify.addContentTypeParser(/^image\/.*/, first)
    fastify.addContentTypeParser(/^application\/.+\+xml/, first)
    fastify.addContentTypeParser('text/html', first)

    expect(fastify[keys.kContentTypeParser].existingParser('*')).toBeFalsy()

    fastify.addContentTypeParser('*', first)

    expect(fastify[keys.kContentTypeParser].existingParser('*')).toBeFalsy()
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('let you override the default parser once', async () => {
    expect.assertions(2)

    const fastify = Fastify()

    fastify.addContentTypeParser('application/json', first)
    fastify.addContentTypeParser('text/plain', first)

    expect(() => fastify.addContentTypeParser('application/json', first)).toThrow(XUFA_ERR_CTP_ALREADY_PRESENT)
    expect(() => fastify.addContentTypeParser('text/plain', first)).toThrow(XUFA_ERR_CTP_ALREADY_PRESENT)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
afterAll(async () => {
fastify = Fastify();
contentTypeParser = fastify[keys.kContentTypeParser];
fastify.addContentTypeParser(/^image\/.*/, first)
fastify.addContentTypeParser(/^application\/.+\+xml/, first)
fastify.addContentTypeParser('text/html', first)
expect(contentTypeParser.existingParser(/^image\/.*/)).toBeTruthy()
expect(contentTypeParser.existingParser('text/html')).toBeTruthy()
expect(contentTypeParser.existingParser(/^application\/.+\+xml/)).toBeTruthy()
expect(contentTypeParser.existingParser('application/json')).toBeFalsy()
expect(contentTypeParser.existingParser('text/plain')).toBeFalsy()
expect(contentTypeParser.existingParser('image/png')).toBeFalsy()
expect(contentTypeParser.existingParser(/^application\/.+\+json/)).toBeFalsy()
})
})

describe('add', () => {
test('should only accept string and RegExp', async () => {
    expect.assertions(4)

    const fastify = Fastify()
    const contentTypeParser = fastify[keys.kContentTypeParser]

    expect(contentTypeParser.add('test/type', {}, first)).toBeFalsy()
    expect(contentTypeParser.add(/test/, {}, first)).toBeFalsy()
    expect(() => contentTypeParser.add({}, {}, first)).toThrow(XUFA_ERR_CTP_INVALID_TYPE)
    expect(() => contentTypeParser.add(1, {}, first)).toThrow(XUFA_ERR_CTP_INVALID_TYPE)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('should set "*" as parser that catches all', async () => {
    expect.assertions(1)

    const fastify = Fastify()
    const contentTypeParser = fastify[keys.kContentTypeParser]

    contentTypeParser.add('*', {}, first)
    expect(contentTypeParser.customParsers.get('').fn).toBe(first)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('should lowercase contentTypeParser name', async () => {
    expect.assertions(1)
    const fastify = Fastify()
    fastify.addContentTypeParser('text/html', function (req, done) {
      done()
    })
    try {
      fastify.addContentTypeParser('TEXT/html', function (req, done) {
        done()
      })
    } catch (err) {
      expect(err.message).toBe(XUFA_ERR_CTP_ALREADY_PRESENT('text/html').message)
    }
  })
test('should trim contentTypeParser name', async () => {
    expect.assertions(1)
    const fastify = Fastify()
    fastify.addContentTypeParser('text/html', function (req, done) {
      done()
    })
    try {
      fastify.addContentTypeParser('    text/html', function (req, done) {
        done()
      })
    } catch (err) {
      expect(err.message).toBe(XUFA_ERR_CTP_ALREADY_PRESENT('text/html').message)
    }
  })
})

test('non-Error thrown from content parser is properly handled', (done) => {
  expect.assertions(3)

  const fastify = Fastify()

  const throwable = 'test'
  const payload = 'error'

  fastify.addContentTypeParser('text/test', (request, payload, done) => {
    done(throwable)
  })

  fastify.post('/', (req, reply) => {
  })

  fastify.setErrorHandler((err, req, res) => {
    expect(err).toBe(throwable)

    res.send(payload)
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    headers: { 'Content-Type': 'text/test' },
    body: 'some text'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(payload)
    done()
  })
})

test('Error thrown 415 from content type is null and make post request to server', (done) => {
  expect.assertions(3)

  const fastify = Fastify()
  const errMsg = new XUFA_ERR_CTP_INVALID_MEDIA_TYPE().message

  fastify.post('/', (req, reply) => {
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    body: 'some text'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(415)
    expect(JSON.parse(res.body).message).toBe(errMsg)
    done()
  })
})

describe('remove', () => {
test('should remove default parser', async () => {
    expect.assertions(6)

    const fastify = Fastify()
    const contentTypeParser = fastify[keys.kContentTypeParser]

    expect(contentTypeParser.remove('application/json')).toBeTruthy()
    expect(contentTypeParser.customParsers['application/json']).toBeFalsy()
    expect(contentTypeParser.parserList.find(parser => parser === 'application/json')).toBeFalsy()
    expect(contentTypeParser.remove('  text/plain  ')).toBeTruthy()
    expect(contentTypeParser.customParsers['text/plain']).toBeFalsy()
    expect(contentTypeParser.parserList.find(parser => parser === 'text/plain')).toBeFalsy()
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('should remove RegExp parser', async () => {
    expect.assertions(3)

    const fastify = Fastify()
    fastify.addContentTypeParser(/^text\/*/, first)

    const contentTypeParser = fastify[keys.kContentTypeParser]

    expect(contentTypeParser.remove(/^text\/*/)).toBeTruthy()
    expect(contentTypeParser.customParsers[/^text\/*/]).toBeFalsy()
    expect(contentTypeParser.parserRegExpList.find(parser => parser.toString() === /^text\/*/.toString())).toBeFalsy()
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('should throw an error if content type is neither string nor RegExp', async () => {
    expect.assertions(1)

    const fastify = Fastify()

    expect(() => fastify[keys.kContentTypeParser].remove(12)).toThrow(XUFA_ERR_CTP_INVALID_TYPE)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('should return false if content type does not exist', async () => {
    expect.assertions(1)

    const fastify = Fastify()

    expect(fastify[keys.kContentTypeParser].remove('image/png')).toBeFalsy()
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
test('should not remove any content type parser if content type does not exist', async () => {
    expect.assertions(2)

    const fastify = Fastify()

    const contentTypeParser = fastify[keys.kContentTypeParser]

    expect(contentTypeParser.remove('image/png')).toBeFalsy()
    expect(contentTypeParser.customParsers.size).toBe(2)
  
  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
})

test('remove all should remove all existing parsers and reset cache', async () => {
  expect.assertions(4)

  const fastify = Fastify()
  fastify.addContentTypeParser('application/xml', first)
  fastify.addContentTypeParser(/^image\/.*/, first)

  const contentTypeParser = fastify[keys.kContentTypeParser]

  contentTypeParser.getParser('application/xml') // fill cache with one entry
  contentTypeParser.removeAll()

  expect(contentTypeParser.cache.size).toBe(0)
  expect(contentTypeParser.parserList.length).toBe(0)
  expect(contentTypeParser.parserRegExpList.length).toBe(0)
  expect(Object.keys(contentTypeParser.customParsers).length).toBe(0)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Safeguard against malicious content-type / 1', async () => {
  const badNames = Object.getOwnPropertyNames({}.__proto__) // eslint-disable-line
  expect.assertions(badNames.length)

  const fastify = Fastify()

  fastify.post('/', async () => {
    return 'ok'
  })

  for (const prop of badNames) {
    const response = await fastify.inject({
      method: 'POST',
      path: '/',
      headers: {
        'content-type': prop
      },
      body: ''
    })

    expect(response.statusCode).toBe(415)
  }
})

test('Safeguard against malicious content-type / 2', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  fastify.post('/', async () => {
    return 'ok'
  })

  const response = await fastify.inject({
    method: 'POST',
    path: '/',
    headers: {
      'content-type': '\\u0063\\u006fnstructor'
    },
    body: ''
  })

  expect(response.statusCode).toBe(415)
})

test('Safeguard against malicious content-type / 3', async () => {
  expect.assertions(1)

  const fastify = Fastify()

  fastify.post('/', async () => {
    return 'ok'
  })

  const response = await fastify.inject({
    method: 'POST',
    path: '/',
    headers: {
      'content-type': 'constructor; charset=utf-8'
    },
    body: ''
  })

  expect(response.statusCode).toBe(415)
})

test('Safeguard against content-type spoofing - string', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  fastify.removeAllContentTypeParsers()
  fastify.addContentTypeParser('text/plain', function (request, body, done) {
    expect('should be called').toBeTruthy()
    done(null, body)
  })
  fastify.addContentTypeParser('application/json', function (request, body, done) {
    expect.fail('shouldn\'t be called')
    done(null, body)
  })

  fastify.post('/', async () => {
    return 'ok'
  })

  await fastify.inject({
    method: 'POST',
    path: '/',
    headers: {
      'content-type': 'text/plain; content-type="application/json"'
    },
    body: ''
  })
})

describe('Warning against improper content-type - regexp', () => {
test('improper regex - text plain', async () => {
    expect.assertions(2)
    const spyData = spyWarning(XUFASEC001)
    onTestFinished(spyData.restore)

    const fastify = Fastify()

    fastify.removeAllContentTypeParsers()
    fastify.addContentTypeParser(/text\/plain/, function (request, body, done) {
      done(null, body)
    })

    await fastify.ready()
    expect(spyData.calls).toEqual([{ arguments: ['text\\/plain'], result: true }])
    expect(spyData.callCount()).toBe(1)
  })
test('improper regex - application json', async () => {
    expect.assertions(2)
    const spyData = spyWarning(XUFASEC001)
    onTestFinished(spyData.restore)
    const fastify = Fastify()

    fastify.removeAllContentTypeParsers()

    fastify.addContentTypeParser(/application\/json/, function (request, body, done) {
      done(null, body)
    })

    expect(spyData.calls).toEqual([{ arguments: ['application\\/json'], result: true }])
    expect(spyData.callCount()).toEqual(1)
  })
})

test('content-type match parameters - string 1', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  fastify.removeAllContentTypeParsers()
  fastify.addContentTypeParser('text/plain; charset=utf8', function (request, body, done) {
    expect.fail('shouldn\'t be called')
    done(null, body)
  })
  fastify.addContentTypeParser('application/json; charset=utf8', function (request, body, done) {
    expect('should be called').toBeTruthy()
    done(null, body)
  })

  fastify.post('/', async () => {
    return 'ok'
  })

  await fastify.inject({
    method: 'POST',
    path: '/',
    headers: {
      'content-type': 'application/json; charset=utf8'
    },
    body: ''
  })
})

test('content-type match parameters - regexp', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  fastify.removeAllContentTypeParsers()
  fastify.addContentTypeParser(/application\/json; charset="utf8"/, function (request, body, done) {
    expect('should be called').toBeTruthy()
    done(null, body)
  })

  fastify.post('/', async () => {
    return 'ok'
  })

  await fastify.inject({
    method: 'POST',
    path: '/',
    headers: {
      'content-type': 'application/json; charset=utf8'
    },
    body: ''
  })
})

test('content-type match - RegExp with global flag', async () => {
  expect.assertions(4)

  const fastify = Fastify()
  fastify.addContentTypeParser(/^application\/.+\+xml$/g, { parseAs: 'string' }, function (request, body, done) {
    done(null, body)
  })

  fastify.post('/', async (request) => request.body)

  // Two distinct content types that both match the parser. A RegExp with the
  // `g` flag keeps a mutable lastIndex between test() calls, so the second
  // content type must still match rather than fall through to 415.
  const first = await fastify.inject({
    method: 'POST',
    path: '/',
    headers: { 'content-type': 'application/vnd.a+xml' },
    body: '<a/>'
  })
  const second = await fastify.inject({
    method: 'POST',
    path: '/',
    headers: { 'content-type': 'application/vnd.b+xml' },
    body: '<b/>'
  })

  expect(first.statusCode).toBe(200)
  expect(first.payload).toBe('<a/>')
  expect(second.statusCode).toBe(200)
  expect(second.payload).toBe('<b/>')
})

test('content-type fail when parameters not match - string 1', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  fastify.removeAllContentTypeParsers()
  fastify.addContentTypeParser('application/json; charset=utf8; foo=bar', function (request, body, done) {
    expect.fail('shouldn\'t be called')
    done(null, body)
  })

  fastify.post('/', async () => {
    return 'ok'
  })

  const response = await fastify.inject({
    method: 'POST',
    path: '/',
    headers: {
      'content-type': 'application/json; charset=utf8'
    },
    body: ''
  })

  expect(response.statusCode).toBe(415)
})

test('content-type fail when parameters not match - string 2', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  fastify.removeAllContentTypeParsers()
  fastify.addContentTypeParser('application/json; charset=utf8; foo=bar', function (request, body, done) {
    expect.fail('shouldn\'t be called')
    done(null, body)
  })

  fastify.post('/', async () => {
    return 'ok'
  })

  const response = await fastify.inject({
    method: 'POST',
    path: '/',
    headers: {
      'content-type': 'application/json; charset=utf8; foo=baz'
    },
    body: ''
  })

  expect(response.statusCode).toBe(415)
})

test('content-type fail when parameters not match - regexp', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  fastify.removeAllContentTypeParsers()
  fastify.addContentTypeParser(/application\/json; charset=utf8; foo=bar/, function (request, body, done) {
    expect.fail('shouldn\'t be called')
    done(null, body)
  })

  fastify.post('/', async () => {
    return 'ok'
  })

  const response = await fastify.inject({
    method: 'POST',
    path: '/',
    headers: {
      'content-type': 'application/json; charset=utf8'
    },
    body: ''
  })

  expect(response.statusCode).toBe(415)
})

// Refs: https://github.com/fastify/fastify/issues/4495
test('content-type regexp list should be cloned when plugin override', async () => {
  expect.assertions(6)

  const fastify = Fastify()

  fastify.addContentTypeParser(/^image\/.*/, { parseAs: 'buffer' }, (req, payload, done) => {
    done(null, payload)
  })

  fastify.register(function plugin (fastify, options, done) {
    fastify.post('/', function (request, reply) {
      reply.type(request.headers['content-type']).send(request.body)
    })

    done()
  })

  {
    const { payload, headers, statusCode } = await fastify.inject({
      method: 'POST',
      path: '/',
      payload: 'jpeg',
      headers: { 'content-type': 'image/jpeg' }
    })
    expect(statusCode).toBe(200)
    expect(headers['content-type']).toBe('image/jpeg')
    expect(payload).toBe('jpeg')
  }

  {
    const { payload, headers, statusCode } = await fastify.inject({
      method: 'POST',
      path: '/',
      payload: 'png',
      headers: { 'content-type': 'image/png' }
    })
    expect(statusCode).toBe(200)
    expect(headers['content-type']).toBe('image/png')
    expect(payload).toBe('png')
  }
})

test('invalid content-type error message should not contain format placeholder', (done) => {
  expect.assertions(4)

  const fastify = Fastify()

  fastify.post('/', (req, reply) => {
    reply.send('ok')
  })

  fastify.inject({
    method: 'POST',
    url: '/',
    headers: { 'Content-Type': 'invalid-content-type' },
    body: 'test'
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(415)
    const body = JSON.parse(res.body)
    expect(body.code).toBe('XUFA_ERR_CTP_INVALID_MEDIA_TYPE')
    expect(body.message).toBe('Unsupported Media Type')
    done()
  })
})

test('content-type fail when not a valid type', async () => {
  expect.assertions(1)

  const fastify = Fastify()
  fastify.removeAllContentTypeParsers()
  try {
    fastify.addContentTypeParser('type-only', function (request, body, done) {
      expect.fail('shouldn\'t be called')
      done(null, body)
    })
  } catch (error) {
    expect(error.message).toBe('The content type should be a string or a RegExp')
  }
})

test('string body keeps multi-byte characters split across chunks', async () => {
  expect.assertions(2)

  const fastify = Fastify()
  const encoded = Buffer.from(JSON.stringify({ hello: 'wörld ✓ 😀' }))

  fastify.addHook('preParsing', async () => {
    // Emit one byte per chunk so every multi-byte character is split
    return Readable.from(Array.from(encoded, byte => Buffer.from([byte])), { objectMode: false })
  })
  fastify.post('/', async (request) => request.body)

  const res = await fastify.inject({
    method: 'POST',
    url: '/',
    headers: { 'content-type': 'application/json' },
    payload: encoded
  })
  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual({ hello: 'wörld ✓ 😀' })
})

test('string body accepts string chunks from a preParsing stream', async () => {
  expect.assertions(2)

  const fastify = Fastify()

  fastify.addHook('preParsing', async (request, reply, payload) => {
    payload.setEncoding('utf8')
    return payload
  })
  fastify.post('/', async (request) => request.body)

  const res = await fastify.inject({
    method: 'POST',
    url: '/',
    headers: { 'content-type': 'text/plain' },
    payload: 'hellö'
  })
  expect(res.statusCode).toBe(200)
  expect(res.body).toBe('hellö')
})

test('string body with invalid UTF-8 is not treated as a content-length mismatch', async () => {
  expect.assertions(2)

  const fastify = Fastify()
  fastify.post('/', async (request) => request.body)

  const res = await fastify.inject({
    method: 'POST',
    url: '/',
    headers: { 'content-type': 'text/plain' },
    payload: Buffer.from([0x61, 0xff, 0x62])
  })
  expect(res.statusCode).toBe(200)
  expect(res.body).toBe('a�b')
})
