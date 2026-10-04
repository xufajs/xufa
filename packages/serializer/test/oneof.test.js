'use strict'


const build = require('..')

test('object with multiple types field', () => {
  expect.assertions(2)

  const schema = {
    title: 'object with multiple types field',
    type: 'object',
    properties: {
      str: {
        oneOf: [{
          type: 'string'
        }, {
          type: 'boolean'
        }]
      }
    }
  }
  const stringify = build(schema)

  expect(stringify({ str: 'string' })).toBe('{"str":"string"}')
  expect(stringify({ str: true })).toBe('{"str":true}')
})

test('object with field of type object or null', () => {
  expect.assertions(2)

  const schema = {
    title: 'object with field of type object or null',
    type: 'object',
    properties: {
      prop: {
        oneOf: [{
          type: 'object',
          properties: {
            str: {
              type: 'string'
            }
          }
        }, {
          type: 'null'
        }]
      }
    }
  }
  const stringify = build(schema)

  expect(stringify({ prop: null })).toBe('{"prop":null}')

  expect(stringify({
    prop: {
      str: 'string', remove: 'this'
    }
  })).toBe('{"prop":{"str":"string"}}')
})

test('object with field of type object or array', () => {
  expect.assertions(2)

  const schema = {
    title: 'object with field of type object or array',
    type: 'object',
    properties: {
      prop: {
        oneOf: [{
          type: 'object',
          properties: {},
          additionalProperties: true
        }, {
          type: 'array',
          items: {
            type: 'string'
          }
        }]
      }
    }
  }
  const stringify = build(schema)

  expect(stringify({
    prop: { str: 'string' }
  })).toBe('{"prop":{"str":"string"}}')

  expect(stringify({
    prop: ['string']
  })).toBe('{"prop":["string"]}')
})

test('object with field of type string and coercion disable ', () => {
  expect.assertions(1)

  const schema = {
    title: 'object with field of type string',
    type: 'object',
    properties: {
      str: {
        oneOf: [{
          type: 'string'
        }]
      }
    }
  }
  const stringify = build(schema)
  expect(() => stringify({ str: 1 })).toThrow()
})

test('object with field of type string and coercion enable ', () => {
  expect.assertions(1)

  const schema = {
    title: 'object with field of type string',
    type: 'object',
    properties: {
      str: {
        oneOf: [{
          type: 'string'
        }]
      }
    }
  }

  const options = {
    ajv: {
      coerceTypes: true
    }
  }
  const stringify = build(schema, options)

  const value = stringify({
    str: 1
  })
  expect(value).toBe('{"str":"1"}')
})

test('object with field with type union of multiple objects', () => {
  expect.assertions(2)

  const schema = {
    title: 'object with oneOf property value containing objects',
    type: 'object',
    properties: {
      oneOfSchema: {
        oneOf: [
          {
            type: 'object',
            properties: {
              baz: { type: 'number' }
            },
            required: ['baz']
          },
          {
            type: 'object',
            properties: {
              bar: { type: 'string' }
            },
            required: ['bar']
          }
        ]
      }
    },
    required: ['oneOfSchema']
  }

  const stringify = build(schema)

  expect(stringify({ oneOfSchema: { baz: 5 } })).toBe('{"oneOfSchema":{"baz":5}}')

  expect(stringify({ oneOfSchema: { bar: 'foo' } })).toBe('{"oneOfSchema":{"bar":"foo"}}')
})

test('null value in schema', () => {
  expect.assertions(0)

  const schema = {
    title: 'schema with null child',
    type: 'string',
    nullable: true,
    enum: [null]
  }

  build(schema)
})

test('oneOf and $ref together', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      cs: {
        oneOf: [
          {
            $ref: '#/definitions/Option'
          },
          {
            type: 'boolean'
          }
        ]
      }
    },
    definitions: {
      Option: {
        type: 'string'
      }
    }
  }

  const stringify = build(schema)

  expect(stringify({ cs: 'franco' })).toBe('{"cs":"franco"}')

  expect(stringify({ cs: true })).toBe('{"cs":true}')
})

test('oneOf and $ref: 2 levels are fine', () => {
  expect.assertions(1)

  const schema = {
    type: 'object',
    properties: {
      cs: {
        oneOf: [
          {
            $ref: '#/definitions/Option'
          },
          {
            type: 'boolean'
          }
        ]
      }
    },
    definitions: {
      Option: {
        oneOf: [
          {
            type: 'number'
          },
          {
            type: 'boolean'
          }
        ]
      }
    }
  }

  const stringify = build(schema)
  const value = stringify({
    cs: 3
  })
  expect(value).toBe('{"cs":3}')
})

test('oneOf and $ref: multiple levels should throw at build.', () => {
  expect.assertions(3)

  const schema = {
    type: 'object',
    properties: {
      cs: {
        oneOf: [
          {
            $ref: '#/definitions/Option'
          },
          {
            type: 'boolean'
          }
        ]
      }
    },
    definitions: {
      Option: {
        oneOf: [
          {
            $ref: '#/definitions/Option2'
          },
          {
            type: 'string'
          }
        ]
      },
      Option2: {
        type: 'number'
      }
    }
  }

  const stringify = build(schema)

  expect(stringify({ cs: 3 })).toBe('{"cs":3}')
  expect(stringify({ cs: true })).toBe('{"cs":true}')
  expect(stringify({ cs: 'pippo' })).toBe('{"cs":"pippo"}')
})

test('oneOf and $ref - multiple external $ref', () => {
  expect.assertions(2)

  const externalSchema = {
    external: {
      definitions: {
        def: {
          type: 'object',
          properties: {
            prop: { oneOf: [{ $ref: 'external2#/definitions/other' }] }
          }
        }
      }
    },
    external2: {
      definitions: {
        internal: {
          type: 'string'
        },
        other: {
          type: 'object',
          properties: {
            prop2: { $ref: '#/definitions/internal' }
          }
        }
      }
    }
  }

  const schema = {
    title: 'object with $ref',
    type: 'object',
    properties: {
      obj: {
        $ref: 'external#/definitions/def'
      }
    }
  }

  const object = {
    obj: {
      prop: {
        prop2: 'test'
      }
    }
  }

  const stringify = build(schema, { schema: externalSchema })
  const output = stringify(object)

  expect(() => JSON.parse(output)).not.toThrow()
  expect(output).toBe('{"obj":{"prop":{"prop2":"test"}}}')
})

test('oneOf with enum with more than 100 entries', () => {
  expect.assertions(1)

  const schema = {
    title: 'type array that may have one of declared items',
    type: 'array',
    items: {
      oneOf: [
        {
          type: 'string',
          enum: ['EUR', 'USD', ...(new Set([...new Array(200)].map(() => Math.random().toString(36).substr(2, 3)))).values()]
        },
        { type: 'null' }
      ]
    }
  }
  const stringify = build(schema)

  const value = stringify(['EUR', 'USD', null])
  expect(value).toBe('["EUR","USD",null]')
})

test('oneOf object with field of type string with format or null', () => {
  expect.assertions(1)

  const toStringify = new Date()

  const withOneOfSchema = {
    type: 'object',
    properties: {
      prop: {
        oneOf: [{
          type: 'string',
          format: 'date-time'
        }, {
          type: 'null'
        }]
      }
    }
  }

  const withOneOfStringify = build(withOneOfSchema)

  expect(withOneOfStringify({
    prop: toStringify
  })).toBe(`{"prop":"${toStringify.toISOString()}"}`)
})

test('one array item match oneOf types', () => {
  expect.assertions(3)

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['data'],
    properties: {
      data: {
        type: 'array',
        minItems: 1,
        items: {
          oneOf: [
            {
              type: 'string'
            },
            {
              type: 'number'
            }
          ]
        }
      }
    }
  }

  const stringify = build(schema)

  expect(stringify({ data: ['foo'] })).toBe('{"data":["foo"]}')
  expect(stringify({ data: [1] })).toBe('{"data":[1]}')
  expect(() => stringify({ data: [false, 'foo'] })).toThrow()
})

test('some array items match oneOf types', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['data'],
    properties: {
      data: {
        type: 'array',
        minItems: 1,
        items: {
          oneOf: [
            {
              type: 'string'
            },
            {
              type: 'number'
            }
          ]
        }
      }
    }
  }

  const stringify = build(schema)

  expect(stringify({ data: ['foo', 5] })).toBe('{"data":["foo",5]}')
  expect(() => stringify({ data: [false, 'foo', true, 5] })).toThrow()
})

test('all array items does not match oneOf types', () => {
  expect.assertions(1)

  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['data'],
    properties: {
      data: {
        type: 'array',
        minItems: 1,
        items: {
          oneOf: [
            {
              type: 'string'
            },
            {
              type: 'number'
            }
          ]
        }
      }
    }
  }

  const stringify = build(schema)

  expect(() => stringify({ data: [null, false, true, undefined, [], {}] })).toThrow()
})

test('invalid oneOf schema', () => {
  expect.assertions(1)

  const schema = {
    type: 'object',
    properties: {
      prop: {
        oneOf: 'not array'  // invalid, oneOf must be array
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
