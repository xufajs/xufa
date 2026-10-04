'use strict'


const build = require('..')

test('sanitize 3', () => {
  expect(() => {
    build({
      $defs: {
        type: 'foooo"bar'
      },
      patternProperties: {
        x: { $ref: '#/$defs' }
      }
    })
  }).toThrow(expect.objectContaining({ message: 'foooo"bar unsupported' }))
})
