'use strict'


const build = require('..')

// Covers issue #139
test('Should throw on invalid schema', () => {
  expect.assertions(1)
  expect(() => {
    build({}, {
      schema: {
        invalid: {
          type: 'Dinosaur'
        }
      }
    })
  }).toThrow(expect.objectContaining({ message: expect.stringMatching(/^"invalid" schema is invalid:.*/) }))
})

test('invalid not schema', () => {
  expect.assertions(1)

  const schema = {
    type: 'object',
    properties: {
      prop: {
        not: 'not object'  // invalid, not must be object
      }
    }
  }

  try {
    build(schema)
    expect.fail('Should throw')
  } catch (err) {
    expect(err.message.includes('schema is invalid')).toBeTruthy()
  }
})
