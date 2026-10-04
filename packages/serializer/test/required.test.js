'use strict'


const build = require('..')

test('object with required field', () => {
  expect.assertions(2)

  const schema = {
    title: 'object with required field',
    type: 'object',
    properties: {
      str: {
        type: 'string'
      },
      num: {
        type: 'integer'
      }
    },
    required: ['str']
  }
  const stringify = build(schema)

  expect(() => {
    stringify({
      str: 'string'
    })
  }).not.toThrow()

  expect(() => {
    stringify({
      num: 42
    })
  }).toThrow(expect.objectContaining({ message: '"str" is required!' }))
})

test('object with required field not in properties schema', () => {
  expect.assertions(2)

  const schema = {
    title: 'object with required field',
    type: 'object',
    properties: {
      num: {
        type: 'integer'
      }
    },
    required: ['str']
  }
  const stringify = build(schema)

  expect(() => {
    stringify({})
  }).toThrow(expect.objectContaining({ message: '"str" is required!' }))

  expect(() => {
    stringify({
      num: 42
    })
  }).toThrow(expect.objectContaining({ message: '"str" is required!' }))
})

test('object with required field not in properties schema with additional properties true', () => {
  expect.assertions(2)

  const schema = {
    title: 'object with required field',
    type: 'object',
    properties: {
      num: {
        type: 'integer'
      }
    },
    additionalProperties: true,
    required: ['str']
  }
  const stringify = build(schema)

  expect(() => {
    stringify({})
  }).toThrow(expect.objectContaining({ message: '"str" is required!' }))

  expect(() => {
    stringify({
      num: 42
    })
  }).toThrow(expect.objectContaining({ message: '"str" is required!' }))
})

test('object with multiple required field not in properties schema', () => {
  expect.assertions(3)

  const schema = {
    title: 'object with required field',
    type: 'object',
    properties: {
      num: {
        type: 'integer'
      }
    },
    additionalProperties: true,
    required: ['num', 'key1', 'key2']
  }
  const stringify = build(schema)

  expect(() => {
    stringify({})
  }).toThrow(expect.objectContaining({ message: '"key1" is required!' }))

  expect(() => {
    stringify({
      key1: 42,
      key2: 42
    })
  }).toThrow(expect.objectContaining({ message: '"num" is required!' }))

  expect(() => {
    stringify({
      num: 42,
      key1: 'some'
    })
  }).toThrow(expect.objectContaining({ message: '"key2" is required!' }))
})

test('object with required bool', () => {
  expect.assertions(2)

  const schema = {
    title: 'object with required field',
    type: 'object',
    properties: {
      num: {
        type: 'integer'
      }
    },
    additionalProperties: true,
    required: ['bool']
  }
  const stringify = build(schema)

  expect(() => {
    stringify({})
  }).toThrow(expect.objectContaining({ message: '"bool" is required!' }))

  expect(() => {
    stringify({
      bool: false
    })
  }).not.toThrow()
})

test('required nullable', () => {
  expect.assertions(1)

  const schema = {
    title: 'object with required field',
    type: 'object',
    properties: {
      num: {
        type: ['integer']
      }
    },
    additionalProperties: true,
    required: ['null']
  }
  const stringify = build(schema)

  expect(() => {
    stringify({
      null: null
    })
  }).not.toThrow()
})

test('required numbers', () => {
  expect.assertions(2)

  const schema = {
    title: 'object with required field',
    type: 'object',
    properties: {
      str: {
        type: 'string'
      },
      num: {
        type: 'integer'
      }
    },
    required: ['num']
  }
  const stringify = build(schema)

  expect(() => {
    stringify({
      num: 42
    })
  }).not.toThrow()

  expect(() => {
    stringify({
      num: 'aaa'
    })
  }).toThrow(expect.objectContaining({ message: 'The value "aaa" cannot be converted to an integer.' }))
})
