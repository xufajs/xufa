import build from '../index.js';

test('object with custom format field', () => {
  expect.assertions(1)

  const schema = {
    title: 'object with custom format field',
    type: 'object',
    properties: {
      str: {
        type: 'string',
        format: 'test-format'
      }
    }
  }

  const stringify = build(schema)

  expect(() => {
    stringify({
      str: 'string'
    })
  }).not.toThrow()
})
