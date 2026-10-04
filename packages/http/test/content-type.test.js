'use strict'


const ContentType = require('../lib/content-type')
const Fastify = require('..')

test('should remove content-type for setErrorHandler', async () => {
  expect.assertions(8)
  let count = 0

  const fastify = Fastify()
  fastify.setErrorHandler(function (error, request, reply) {
    expect(error.message).toBe('kaboom')
    expect(reply.hasHeader('content-type')).toBe(false)
    reply.code(400).send({ foo: 'bar' })
  })
  fastify.addHook('onSend', async function (request, reply, payload) {
    count++
    expect(typeof payload).toBe('string')
    switch (count) {
      case 1: {
        // should guess the correct content-type based on payload
        expect(reply.getHeader('content-type')).toBe('text/plain; charset=utf-8')
        throw Error('kaboom')
      }
      case 2: {
        // should guess the correct content-type based on payload
        expect(reply.getHeader('content-type')).toBe('application/json; charset=utf-8')
        return payload
      }
      default: {
        expect.fail('should not reach')
      }
    }
  })
  fastify.get('/', function (request, reply) {
    reply.send('plain-text')
  })

  const { statusCode, body } = await fastify.inject({ method: 'GET', path: '/' })
  expect(statusCode).toBe(400)
  expect(body).toBe(JSON.stringify({ foo: 'bar' }))
})

describe('ContentType class', () => {
test('returns empty instance for empty value', () => {
    let found = new ContentType('')
    expect(found.isEmpty).toBe(true)
    expect(found.mediaType).toBe(undefined)

    found = new ContentType('undefined')
    expect(found.isEmpty).toBe(true)
    expect(found.mediaType).toBe(undefined)

    found = new ContentType()
    expect(found.isEmpty).toBe(true)
    expect(found.mediaType).toBe(undefined)
  })
test('indicates media type is not correct format', () => {
    let found = new ContentType('foo')
    expect(found.isEmpty).toBe(true)
    expect(found.isValid).toBe(false)
    expect(found.mediaType).toBe(undefined)

    found = new ContentType('foo /bar')
    expect(found.isEmpty).toBe(true)
    expect(found.isValid).toBe(false)

    found = new ContentType('foo/ bar')
    expect(found.isEmpty).toBe(true)
    expect(found.isValid).toBe(false)

    found = new ContentType('foo; param=1')
    expect(found.isEmpty).toBe(true)
    expect(found.isValid).toBe(false)

    found = new ContentType('foo/π; param=1')
    expect(found.isEmpty).toBe(true)
    expect(found.isValid).toBe(false)

    found = new ContentType('application/json<script>alert(1)</script>')
    expect(found.isEmpty).toBe(true)
    expect(found.isValid).toBe(false)

    found = new ContentType('application/json/extra/slashes')
    expect(found.isEmpty).toBe(true)
    expect(found.isValid).toBe(false)

    found = new ContentType('application/json(garbage)')
    expect(found.isEmpty).toBe(true)
    expect(found.isValid).toBe(false)

    found = new ContentType('application/json@evil')
    expect(found.isEmpty).toBe(true)
    expect(found.isValid).toBe(false)

    found = new ContentType('application/json\x00garbage')
    expect(found.isEmpty).toBe(true)
    expect(found.isValid).toBe(false)
  })
test('subtype with multiple fields validates as incorrect', () => {
    let found = new ContentType('application/json whatever')
    expect(found.isValid).toBe(false)
    expect(found.isEmpty).toBe(true)

    found = new ContentType('application/    json whatever')
    expect(found.isValid).toBe(false)
    expect(found.isEmpty).toBe(true)

    found = new ContentType('application/json whatever; foo=bar')
    expect(found.isValid).toBe(false)
    expect(found.isEmpty).toBe(true)

    found = new ContentType('application/    json whatever; foo=bar')
    expect(found.isValid).toBe(false)
    expect(found.isEmpty).toBe(true)
  })
test('returns a plain media type instance', () => {
    const found = new ContentType('Application/JSON')
    expect(found.mediaType).toBe('application/json')
    expect(found.type).toBe('application')
    expect(found.subtype).toBe('json')
    expect(found.parameters.size).toBe(0)
  })
test('handles empty parameters list', () => {
    const found = new ContentType('Application/JSON ;')
    expect(found.isEmpty).toBe(false)
    expect(found.mediaType).toBe('application/json')
    expect(found.type).toBe('application')
    expect(found.subtype).toBe('json')
    expect(found.parameters.size).toBe(0)
  })
test('returns a media type instance with parameters', () => {
    const found = new ContentType('Application/JSON ; charset=utf-8; foo=BaR;baz=" 42"')
    expect(found.isEmpty).toBe(false)
    expect(found.mediaType).toBe('application/json')
    expect(found.type).toBe('application')
    expect(found.subtype).toBe('json')
    expect(found.parameters.size).toBe(3)

    const expected = [
      ['charset', 'utf-8'],
      ['foo', 'BaR'],
      ['baz', ' 42']
    ]
    expect(Array.from(found.parameters.entries())).toEqual(expected)

    expect(found.toString()).toBe('application/json; charset="utf-8"; foo="BaR"; baz=" 42"')
  })
test('skips invalid quoted string parameters', () => {
    const found = new ContentType('Application/JSON ; charset=utf-8; foo=BaR;baz=" 42')
    expect(found.isEmpty).toBe(false)
    expect(found.mediaType).toBe('application/json')
    expect(found.type).toBe('application')
    expect(found.subtype).toBe('json')
    expect(found.parameters.size).toBe(2)

    const expected = [
      ['charset', 'utf-8'],
      ['foo', 'BaR']
    ]
    expect(Array.from(found.parameters.entries())).toEqual(expected)

    expect(found.toString()).toBe('application/json; charset="utf-8"; foo="BaR"')
  })
test('preserves a semicolon inside a quoted parameter value', () => {
    // RFC 9110 §5.6.6: ';' is a literal qdtext octet inside a quoted-string
    // and does not terminate the parameter value.
    const found = new ContentType('application/json; name="foo;bar"; charset=utf-8')
    expect(found.isValid).toBe(true)
    expect(found.mediaType).toBe('application/json')
    expect(found.parameters.get('name')).toBe('foo;bar')
    expect(found.parameters.get('charset')).toBe('utf-8')
  })
test('does not leak a fake parameter out of a quoted value', () => {
    // A `key=value;` sequence inside a quoted-string is opaque content of the
    // enclosing value, not a subsequent parameter.
    const found = new ContentType('application/json; name="a=b;charset=fake"; boundary=xyz')
    expect(found.isValid).toBe(true)
    expect(found.parameters.get('name')).toBe('a=b;charset=fake')
    expect(found.parameters.get('boundary')).toBe('xyz')
    expect(found.parameters.has('charset')).toBe(false)
  })
test('unescapes a quoted-pair inside a quoted-string', () => {
    // RFC 9110 §5.6.4: a quoted-pair MUST be handled as if replaced by
    // the octet following the backslash.
    const found = new ContentType('application/json; name="he said \\"hi\\""')
    expect(found.isValid).toBe(true)
    expect(found.parameters.get('name')).toBe('he said "hi"')
  })
})

describe('ContentType class cache', () => {
test('allow access cache', () => {
    const contentType1 = ContentType.from('application/json')
    const contentType2 = ContentType.cache.get('application/json')
    expect(contentType1).toBe(contentType2)
  })
test('returns same instance for the same content type string', () => {
    const contentType1 = ContentType.from('application/json')
    const contentType2 = ContentType.from('application/json')
    expect(contentType1).toBe(contentType2)
  })
test('returns different instances for different content type strings', () => {
    const contentType1 = ContentType.from('application/json')
    const contentType2 = ContentType.from('text/plain')
    expect(contentType1).not.toBe(contentType2)
  })
})
