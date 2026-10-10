import build from '../index.js';

test('required property containing single quote, contains property', () => {
  expect.assertions(1)

  const stringify = build({
    type: 'object',
    properties: {
      '\'': { type: 'string' }
    },
    required: [
      '\''
    ]
  })

  expect(() => stringify({})).toThrow(new Error('"\'" is required!'))
})

test('required property containing double quote, contains property', () => {
  expect.assertions(1)

  const stringify = build({
    type: 'object',
    properties: {
      '"': { type: 'string' }
    },
    required: [
      '"'
    ]
  })

  expect(() => stringify({})).toThrow(new Error('""" is required!'))
})

test('required property containing single quote, does not contain property', () => {
  expect.assertions(1)

  const stringify = build({
    type: 'object',
    properties: {
      a: { type: 'string' }
    },
    required: [
      '\''
    ]
  })

  expect(() => stringify({})).toThrow(new Error('"\'" is required!'))
})

test('required property containing double quote, does not contain property', () => {
  expect.assertions(1)

  const stringify = build({
    type: 'object',
    properties: {
      a: { type: 'string' }
    },
    required: [
      '"'
    ]
  })

  expect(() => stringify({})).toThrow(new Error('""" is required!'))
})
