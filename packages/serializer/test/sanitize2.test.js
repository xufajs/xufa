'use strict'


const build = require('..')

test('sanitize 2', () => {
  const payload = '(throw "pwoned")'

  const stringify = build({
    properties: {
      [`*///\\\\\\']);${payload};{/*`]: {
        type: 'number'
      }
    }
  })

  expect(() => stringify({})).not.toThrow()
})
