import build from '../index.js';

test('additionalProperties: false', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'additionalProperties',
    type: 'object',
    properties: {
      foo: {
        type: 'string'
      }
    },
    additionalProperties: false
  })

  const obj = { foo: 'a', bar: 'b', baz: 'c' }
  expect(stringify(obj)).toBe('{"foo":"a"}')
})

test('additionalProperties: {}', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'additionalProperties',
    type: 'object',
    properties: {
      foo: {
        type: 'string'
      }
    },
    additionalProperties: {}
  })

  const obj = { foo: 'a', bar: 'b', baz: 'c' }
  expect(stringify(obj)).toBe('{"foo":"a","bar":"b","baz":"c"}')
})

test('additionalProperties: {type: string}', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'additionalProperties',
    type: 'object',
    properties: {
      foo: {
        type: 'string'
      }
    },
    additionalProperties: {
      type: 'string'
    }
  })

  const obj = { foo: 'a', bar: 'b', baz: 'c' }
  expect(stringify(obj)).toBe('{"foo":"a","bar":"b","baz":"c"}')
})
