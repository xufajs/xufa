import validator from 'is-my-json-valid';
import build from '../index.js';
import Ajv from 'ajv';

test('error on invalid largeArrayMechanism', () => {
  expect.assertions(1)

  expect(() => build({
    title: 'large array of null values with default mechanism',
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'null' }
      }
    }
  }, {
    largeArraySize: 2e4,
    largeArrayMechanism: 'invalid'
  })).toThrow(Error('Unsupported large array mechanism invalid'))
})

function buildTest (schema, toStringify, options) {
  test(`render a ${schema.title} as JSON`, () => {
    expect.assertions(3)

    const validate = validator(schema)
    const stringify = build(schema, options)
    const output = stringify(toStringify)

    expect(JSON.parse(output)).toEqual(JSON.parse(JSON.stringify(toStringify)))
    expect(output).toBe(JSON.stringify(toStringify))
    expect(validate(JSON.parse(output))).toBeTruthy()
  })
}

buildTest({
  title: 'dates tuple',
  type: 'object',
  properties: {
    dates: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: [
        {
          type: 'string',
          format: 'date-time'
        },
        {
          type: 'string',
          format: 'date-time'
        }
      ]
    }
  }
}, {
  dates: [new Date(1), new Date(2)]
})

buildTest({
  title: 'dates tuple $ref',
  definitions: {
    dateTime: {
      type: 'string',
      format: 'date-time'
    }
  },
  type: 'object',
  properties: {
    dates: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: [
        {
          $ref: '#/definitions/dateTime'
        },
        {
          $ref: '#/definitions/dateTime'
        }
      ]
    }
  }
}, {
  dates: [new Date(1), new Date(2)]
})

buildTest({
  title: 'string array',
  type: 'object',
  properties: {
    ids: {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  }
}, {
  ids: ['test']
})

buildTest({
  title: 'number array',
  type: 'object',
  properties: {
    ids: {
      type: 'array',
      items: {
        type: 'number'
      }
    }
  }
}, {
  ids: [1]
})

buildTest({
  title: 'mixed array',
  type: 'object',
  properties: {
    ids: {
      type: 'array',
      items: [
        {
          type: 'null'
        },
        {
          type: 'string'
        },
        {
          type: 'integer'
        },
        {
          type: 'number'
        },
        {
          type: 'boolean'
        },
        {
          type: 'object',
          properties: {
            a: {
              type: 'string'
            }
          }
        },
        {
          type: 'array',
          items: {
            type: 'string'
          }
        }
      ]
    }
  }
}, {
  ids: [null, 'test', 1, 1.1, true, { a: 'test' }, ['test']]
})

buildTest({
  title: 'repeated types',
  type: 'object',
  properties: {
    ids: {
      type: 'array',
      items: [
        {
          type: 'number'
        },
        {
          type: 'number'
        }
      ]
    }
  }
}, { ids: [1, 2] })

buildTest({
  title: 'pattern properties array',
  type: 'object',
  properties: {
    args: {
      type: 'array',
      items: [
        {
          type: 'object',
          patternProperties: {
            '.*': {
              type: 'string'
            }
          }
        },
        {
          type: 'object',
          patternProperties: {
            '.*': {
              type: 'number'
            }
          }
        }
      ]
    }
  }
}, { args: [{ a: 'test' }, { b: 1 }] })

buildTest({
  title: 'array with weird key',
  type: 'object',
  properties: {
    '@data': {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  }
}, {
  '@data': ['test']
})

test('invalid items throw', () => {
  expect.assertions(1)
  const schema = {
    type: 'object',
    properties: {
      args: {
        type: 'array',
        items: [
          {
            type: 'object',
            patternProperties: {
              '.*': {
                type: 'string'
              }
            }
          }
        ]
      }
    }
  }
  const stringify = build(schema)
  expect(() => stringify({ args: ['invalid'] })).toThrow()
})

buildTest({
  title: 'item types in array default to any',
  type: 'object',
  properties: {
    foo: {
      type: 'array'
    }
  }
}, {
  foo: [1, 'string', {}, null]
})

test('array items is a list of schema and additionalItems is true, just the described item is validated', () => {
  expect.assertions(1)

  const schema = {
    type: 'object',
    properties: {
      foo: {
        type: 'array',
        items: [
          {
            type: 'string'
          }
        ],
        additionalItems: true
      }
    }
  }

  const stringify = build(schema)
  const result = stringify({
    foo: [
      'foo',
      'bar',
      1
    ]
  })

  expect(result).toBe('{"foo":["foo","bar",1]}')
})

test('array items is a list of schema and additionalItems is true, just the described item is validated', () => {
  expect.assertions(1)

  const schema = {
    type: 'object',
    properties: {
      foo: {
        type: 'array',
        items: [
          {
            type: 'string'
          },
          {
            type: 'number'
          }
        ],
        additionalItems: true
      }
    }
  }

  const stringify = build(schema)
  const result = stringify({
    foo: ['foo']
  })

  expect(result).toBe('{"foo":["foo"]}')
})

test('array items is a list of schema and additionalItems is false /1', () => {
  expect.assertions(1)

  const schema = {
    type: 'object',
    properties: {
      foo: {
        type: 'array',
        items: [
          { type: 'string' }
        ],
        additionalItems: false
      }
    }
  }

  const stringify = build(schema)
  expect(() => stringify({ foo: ['foo', 'bar'] })).toThrow(new Error('Item at 1 does not match schema definition.'))
})

test('array items is a list of schema and additionalItems is false /2', () => {
  expect.assertions(3)

  const schema = {
    type: 'object',
    properties: {
      foo: {
        type: 'array',
        items: [
          { type: 'string' },
          { type: 'string' }
        ],
        additionalItems: false
      }
    }
  }

  const stringify = build(schema)

  expect(() => stringify({ foo: [1, 'bar'] })).toThrow(new Error('Item at 0 does not match schema definition.'))
  expect(() => stringify({ foo: ['foo', 1] })).toThrow(new Error('Item at 1 does not match schema definition.'))
  expect(() => stringify({ foo: ['foo', 'bar', 'baz'] })).toThrow(new Error('Item at 2 does not match schema definition.'))
})

test('array items is a schema and additionalItems is false', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      foo: {
        type: 'array',
        items: { type: 'string' },
        additionalItems: false
      }
    }
  }

  const stringify = build(schema)

  // ajv ignores additionalItems if items is not an Array
  const ajv = new Ajv({ allErrors: true, strict: false })

  const validate = ajv.compile(schema)
  expect(stringify({ foo: ['foo', 'bar'] })).toBe('{"foo":["foo","bar"]}')
  expect(validate({ foo: ['foo', 'bar'] })).toBe(true)
})

test('array items is a list of schema and additionalItems is a schema', () => {
  expect.assertions(1)

  const schema = {
    type: 'object',
    properties: {
      foo: {
        type: 'array',
        items: [
          { type: 'string' }
        ],
        additionalItems: { type: 'number' }
      }
    }
  }

  const stringify = build(schema)
  const result = stringify({ foo: ['foo', 42] })

  expect(result).toBe('{"foo":["foo",42]}')
})

// https://github.com/fastify/fast-json-stringify/issues/279
test('object array with anyOf and symbol', () => {
  expect.assertions(1)
  const ArrayKind = Symbol('ArrayKind')
  const ObjectKind = Symbol('LiteralKind')
  const UnionKind = Symbol('UnionKind')
  const LiteralKind = Symbol('LiteralKind')
  const StringKind = Symbol('StringKind')

  const schema = {
    kind: ArrayKind,
    type: 'array',
    items: {
      kind: ObjectKind,
      type: 'object',
      properties: {
        name: {
          kind: StringKind,
          type: 'string'
        },
        option: {
          kind: UnionKind,
          anyOf: [
            {
              kind: LiteralKind,
              type: 'string',
              enum: ['Foo']
            },
            {
              kind: LiteralKind,
              type: 'string',
              enum: ['Bar']
            }
          ]
        }
      },
      required: ['name', 'option']
    }
  }
  const stringify = build(schema)
  const value = stringify([
    { name: 'name-0', option: 'Foo' },
    { name: 'name-1', option: 'Bar' }
  ])
  expect(value).toBe('[{"name":"name-0","option":"Foo"},{"name":"name-1","option":"Bar"}]')
})

test('different arrays with same item schemas', () => {
  expect.assertions(1)

  const schema = {
    type: 'object',
    properties: {
      array1: {
        type: 'array',
        items: [{ type: 'string' }],
        additionalItems: false
      },
      array2: {
        type: 'array',
        items: { $ref: '#/properties/array1/items' },
        additionalItems: true
      }
    }
  }

  const stringify = build(schema)
  const data = { array1: ['bar'], array2: ['foo', 'bar'] }

  expect(stringify(data)).toBe('{"array1":["bar"],"array2":["foo","bar"]}')
})

const largeArray = new Array(2e4).fill({ a: 'test', b: 1 })
buildTest({
  title: 'large array with default mechanism',
  type: 'object',
  properties: {
    ids: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'number' }
        }
      }
    }
  }
}, {
  ids: largeArray
}, {
  largeArraySize: 2e4,
  largeArrayMechanism: 'default'
})

buildTest({
  title: 'large array of objects with json-stringify mechanism',
  type: 'object',
  properties: {
    ids: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          a: { type: 'string' },
          b: { type: 'number' }
        }
      }
    }
  }
}, {
  ids: largeArray
}, {
  largeArrayMechanism: 'json-stringify'
})

buildTest({
  title: 'large array of strings with default mechanism',
  type: 'object',
  properties: {
    ids: {
      type: 'array',
      items: { type: 'string' }
    }
  }
}, {
  ids: new Array(2e4).fill('string')
}, {
  largeArraySize: 2e4,
  largeArrayMechanism: 'default'
})

buildTest({
  title: 'large array of numbers with default mechanism',
  type: 'object',
  properties: {
    ids: {
      type: 'array',
      items: { type: 'number' }
    }
  }
}, {
  ids: new Array(2e4).fill(42)
}, {
  largeArraySize: 2e4,
  largeArrayMechanism: 'default'
})

buildTest({
  title: 'large array of integers with default mechanism',
  type: 'object',
  properties: {
    ids: {
      type: 'array',
      items: { type: 'integer' }
    }
  }
}, {
  ids: new Array(2e4).fill(42)
}, {
  largeArraySize: 2e4,
  largeArrayMechanism: 'default'
})

buildTest({
  title: 'large array of booleans with default mechanism',
  type: 'object',
  properties: {
    ids: {
      type: 'array',
      items: { type: 'boolean' }
    }
  }
}, {
  ids: new Array(2e4).fill(true)
}, {
  largeArraySize: 2e4,
  largeArrayMechanism: 'default'
})

buildTest({
  title: 'large array of null values with default mechanism',
  type: 'object',
  properties: {
    ids: {
      type: 'array',
      items: { type: 'null' }
    }
  }
}, {
  ids: new Array(2e4).fill(null)
}, {
  largeArraySize: 2e4,
  largeArrayMechanism: 'default'
})

test('error on invalid value for largeArraySize /1', () => {
  expect.assertions(1)

  expect(() => build({
    title: 'large array of null values with default mechanism',
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'null' }
      }
    }
  }, {
    largeArraySize: 'invalid'
  })).toThrow(Error('Unsupported large array size. Expected integer-like, got string with value invalid'))
})

test('error on invalid value for largeArraySize /2', () => {
  expect.assertions(1)

  expect(() => build({
    title: 'large array of null values with default mechanism',
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'null' }
      }
    }
  }, {
    largeArraySize: Infinity
  })).toThrow(Error('Unsupported large array size. Expected integer-like, got number with value Infinity'))
})

test('error on invalid value for largeArraySize /3', () => {
  expect.assertions(1)

  expect(() => build({
    title: 'large array of null values with default mechanism',
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'null' }
      }
    }
  }, {
    largeArraySize: [200]
  })).toThrow(Error('Unsupported large array size. Expected integer-like, got object with value 200'))
})

buildTest({
  title: 'large array of integers with largeArraySize is bigint',
  type: 'object',
  properties: {
    ids: {
      type: 'array',
      items: { type: 'integer' }
    }
  }
}, {
  ids: new Array(2e4).fill(42)
}, {
  largeArraySize: 20000n,
  largeArrayMechanism: 'default'
})

buildTest({
  title: 'large array of integers with largeArraySize is valid string',
  type: 'object',
  properties: {
    ids: {
      type: 'array',
      items: { type: 'integer' }
    }
  }
}, {
  ids: new Array(1e4).fill(42)
}, {
  largeArraySize: '10000',
  largeArrayMechanism: 'default'
})
