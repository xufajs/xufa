'use strict'


const validator = require('is-my-json-valid')
const build = require('..')

test('object with RexExp', () => {
  expect.assertions(3)

  const schema = {
    title: 'object with RegExp',
    type: 'object',
    properties: {
      reg: {
        type: 'string'
      }
    }
  }

  const obj = {
    reg: /"([^"]|\\")*"/
  }

  const stringify = build(schema)
  const validate = validator(schema)
  const output = stringify(obj)

  expect(() => JSON.parse(output)).not.toThrow()

  expect(obj.reg.source).toBe(new RegExp(JSON.parse(output).reg).source)
  expect(validate(JSON.parse(output))).toBeTruthy()
})
