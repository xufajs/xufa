'use strict'


const build = require('..')

test('sanitize 4', () => {
  const payload = '(throw "pwoned")'

  const stringify = build({
    required: [`"];${payload}//`]
  })

  expect(() => {
    stringify({})
  }).toThrow(expect.objectContaining({ message: '""];(throw "pwoned")//" is required!' }))
})
