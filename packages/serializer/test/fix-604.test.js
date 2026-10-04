'use strict'


const fjs = require('..')

test('fix-604', () => {
  const schema = {
    type: 'object',
    properties: {
      fullName: { type: 'string' },
      phone: { type: 'number' }
    }
  }

  const input = {
    fullName: 'Jone',
    phone: 'phone'
  }

  const render = fjs(schema)

  expect(() => {
    render(input)
  }).toThrow(expect.objectContaining({ message: 'The value "phone" cannot be converted to a number.' }))
})
