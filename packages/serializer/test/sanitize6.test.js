'use strict'


const build = require('..')

test('sanitize 6', () => {
  const payload = '(throw "pwoned")'

  const stringify = build({
    type: 'object',
    properties: {
      '/*': { type: 'object' },
      x: {
        type: 'object',
        properties: {
          a: { type: 'string', default: `*/}${payload};{//` }
        }
      }
    }
  })
  expect(() => { stringify({}) }).not.toThrow()
})
