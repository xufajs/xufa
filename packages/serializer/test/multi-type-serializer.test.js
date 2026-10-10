import build from '../index.js';

test('should throw a TypeError with the path to the key of the invalid value', () => {
  expect.assertions(1)
  const schema = {
    type: 'object',
    properties: {
      num: {
        type: ['number']
      }
    }
  }

  const stringify = build(schema)
  expect(() => stringify({ num: { bla: 123 } })).toThrow(new TypeError('The value of \'#/properties/num\' does not match schema definition.'))
})
