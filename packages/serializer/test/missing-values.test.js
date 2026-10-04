'use strict'


const build = require('..')

test('missing values', () => {
  expect.assertions(3)

  const stringify = build({
    title: 'object with missing values',
    type: 'object',
    properties: {
      str: {
        type: 'string'
      },
      num: {
        type: 'number'
      },
      val: {
        type: 'string'
      }
    }
  })

  expect('{"val":"value"}').toBe(stringify({ val: 'value' }))
  expect('{"str":"string","val":"value"}').toBe(stringify({ str: 'string', val: 'value' }))
  expect('{"str":"string","num":42,"val":"value"}').toBe(stringify({ str: 'string', num: 42, val: 'value' }))
})

test('handle null when value should be string', () => {
  expect.assertions(1)

  const stringify = build({
    type: 'object',
    properties: {
      str: {
        type: 'string'
      }
    }
  })

  expect('{"str":""}').toBe(stringify({ str: null }))
})

test('handle null when value should be integer', () => {
  expect.assertions(1)

  const stringify = build({
    type: 'object',
    properties: {
      int: {
        type: 'integer'
      }
    }
  })

  expect('{"int":0}').toBe(stringify({ int: null }))
})

test('handle null when value should be number', () => {
  expect.assertions(1)

  const stringify = build({
    type: 'object',
    properties: {
      num: {
        type: 'number'
      }
    }
  })

  expect('{"num":0}').toBe(stringify({ num: null }))
})

test('handle null when value should be boolean', () => {
  expect.assertions(1)

  const stringify = build({
    type: 'object',
    properties: {
      bool: {
        type: 'boolean'
      }
    }
  })

  expect('{"bool":false}').toBe(stringify({ bool: null }))
})
