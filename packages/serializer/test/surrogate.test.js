'use strict'


const validator = require('is-my-json-valid')
const build = require('..')

test('render a string with surrogate pairs as JSON:test 1', () => {
  expect.assertions(2)

  const schema = {
    title: 'surrogate',
    type: 'string'
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify('𝌆')

  expect(output).toBe('"𝌆"')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('render a string with surrogate pairs as JSON: test 2', () => {
  expect.assertions(2)

  const schema = {
    title: 'long',
    type: 'string'
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify('\uD834\uDF06')

  expect(output).toBe('"𝌆"')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('render a string with Unpaired surrogate code as JSON', () => {
  expect.assertions(2)

  const schema = {
    title: 'surrogate',
    type: 'string'
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify('\uDF06\uD834')
  expect(output).toBe(JSON.stringify('\uDF06\uD834'))
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('render a string with lone surrogate code as JSON', () => {
  expect.assertions(2)

  const schema = {
    title: 'surrogate',
    type: 'string'
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify('\uDEAD')
  expect(output).toBe(JSON.stringify('\uDEAD'))
  expect(validate(JSON.parse(output))).toBeTruthy()
})
