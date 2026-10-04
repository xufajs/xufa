'use strict'


const build = require('..')

test('sanitize 5', () => {
  const payload = '(throw "pwoned")'

  expect(() => {
    build({
      patternProperties: {
        '*': { type: `*/${payload}){//` }
      }
    })
  }).toThrow(expect.objectContaining({ message: 'schema is invalid: data/patternProperties must match format "regex"' }))
})
