import build from '../index.js';

test('possibly nullable integer primitive alternative', () => {
  expect.assertions(1)

  const schema = {
    title: 'simple object with multi-type nullable primitive',
    type: 'object',
    properties: {
      data: {
        type: ['integer']
      }
    }
  }

  const stringify = build(schema, { ajv: { allowUnionTypes: true } })

  const value = stringify({
    data: 4
  })
  expect(value).toBe('{"data":4}')
})

test('possibly nullable number primitive alternative', () => {
  expect.assertions(1)

  const schema = {
    title: 'simple object with multi-type nullable primitive',
    type: 'object',
    properties: {
      data: {
        type: ['number']
      }
    }
  }

  const stringify = build(schema)

  const value = stringify({
    data: 4
  })
  expect(value).toBe('{"data":4}')
})

test('possibly nullable integer primitive alternative with null value', () => {
  expect.assertions(1)

  const schema = {
    title: 'simple object with multi-type nullable primitive',
    type: 'object',
    properties: {
      data: {
        type: ['integer']
      }
    }
  }

  const stringify = build(schema)

  const value = stringify({
    data: null
  })
  expect(value).toBe('{"data":0}')
})

test('possibly nullable number primitive alternative with null value', () => {
  expect.assertions(1)

  const schema = {
    title: 'simple object with multi-type nullable primitive',
    type: 'object',
    properties: {
      data: {
        type: ['number']
      }
    }
  }

  const stringify = build(schema)

  const value = stringify({
    data: null
  })
  expect(value).toBe('{"data":0}')
})

test('possibly nullable number primitive alternative with null value', () => {
  expect.assertions(1)

  const schema = {
    title: 'simple object with multi-type nullable primitive',
    type: 'object',
    properties: {
      data: {
        type: ['boolean']
      }
    }
  }

  const stringify = build(schema)

  const value = stringify({
    data: null
  })
  expect(value).toBe('{"data":false}')
})

test('nullable integer primitive', () => {
  expect.assertions(1)

  const schema = {
    title: 'simple object with nullable primitive',
    type: 'object',
    properties: {
      data: {
        type: ['integer', 'null']
      }
    }
  }

  const stringify = build(schema)

  const value = stringify({
    data: 4
  })
  expect(value).toBe('{"data":4}')
})

test('nullable number primitive', () => {
  expect.assertions(1)

  const schema = {
    title: 'simple object with nullable primitive',
    type: 'object',
    properties: {
      data: {
        type: ['number', 'null']
      }
    }
  }

  const stringify = build(schema)

  const value = stringify({
    data: 4
  })
  expect(value).toBe('{"data":4}')
})

test('nullable primitive with null value', () => {
  expect.assertions(1)

  const schema = {
    title: 'simple object with nullable primitive',
    type: 'object',
    properties: {
      data: {
        type: ['integer', 'null']
      }
    }
  }

  const stringify = build(schema)

  const value = stringify({
    data: null
  })
  expect(value).toBe('{"data":null}')
})

test('nullable number primitive with null value', () => {
  expect.assertions(1)

  const schema = {
    title: 'simple object with nullable primitive',
    type: 'object',
    properties: {
      data: {
        type: ['number', 'null']
      }
    }
  }

  const stringify = build(schema)

  const value = stringify({
    data: null
  })
  expect(value).toBe('{"data":null}')
})

test('possibly null object with multi-type property', () => {
  expect.assertions(3)

  const schema = {
    title: 'simple object with multi-type property',
    type: 'object',
    properties: {
      objectOrNull: {
        type: ['object', 'null'],
        properties: {
          stringOrNumber: {
            type: ['string', 'number']
          }
        }
      }
    }
  }
  const stringify = build(schema)

  expect(stringify({
    objectOrNull: {
      stringOrNumber: 'string'
    }
  })).toBe('{"objectOrNull":{"stringOrNumber":"string"}}')

  expect(stringify({
    objectOrNull: {
      stringOrNumber: 42
    }
  })).toBe('{"objectOrNull":{"stringOrNumber":42}}')

  expect(stringify({
    objectOrNull: null
  })).toBe('{"objectOrNull":null}')
})

test('object with possibly null array of multiple types', (ctx) => {
  expect.assertions(5)

  const schema = {
    title: 'object with array of multiple types',
    type: 'object',
    properties: {
      arrayOfStringsAndNumbers: {
        type: ['array', 'null'],
        items: {
          type: ['string', 'number', 'null']
        }
      }
    }
  }
  const stringify = build(schema)

  try {
    const value = stringify({
      arrayOfStringsAndNumbers: null
    })
    expect(value).toBe('{"arrayOfStringsAndNumbers":null}')
  } catch (e) {
    console.log(e)
    ctx.fail()
  }

  try {
    const value = stringify({
      arrayOfStringsAndNumbers: ['string1', 'string2']
    })
    expect(value).toBe('{"arrayOfStringsAndNumbers":["string1","string2"]}')
  } catch (e) {
    console.log(e)
    ctx.fail()
  }

  expect(stringify({
    arrayOfStringsAndNumbers: [42, 7]
  })).toBe('{"arrayOfStringsAndNumbers":[42,7]}')

  expect(stringify({
    arrayOfStringsAndNumbers: ['string1', 42, 7, 'string2']
  })).toBe('{"arrayOfStringsAndNumbers":["string1",42,7,"string2"]}')

  expect(stringify({
    arrayOfStringsAndNumbers: ['string1', null, 42, 7, 'string2', null]
  })).toBe('{"arrayOfStringsAndNumbers":["string1",null,42,7,"string2",null]}')
})

test('object with tuple of multiple types', (ctx) => {
  expect.assertions(2)

  const schema = {
    title: 'object with array of multiple types',
    type: 'object',
    properties: {
      fixedTupleOfStringsAndNumbers: {
        type: 'array',
        items: [
          {
            type: 'string'
          },
          {
            type: 'number'
          },
          {
            type: ['string', 'number']
          }
        ]
      }
    }
  }
  const stringify = build(schema)

  try {
    const value = stringify({
      fixedTupleOfStringsAndNumbers: ['string1', 42, 7]
    })
    expect(value).toBe('{"fixedTupleOfStringsAndNumbers":["string1",42,7]}')
  } catch (e) {
    console.log(e)
    ctx.fail()
  }

  try {
    const value = stringify({
      fixedTupleOfStringsAndNumbers: ['string1', 42, 'string2']
    })
    expect(value).toBe('{"fixedTupleOfStringsAndNumbers":["string1",42,"string2"]}')
  } catch (e) {
    console.log(e)
    ctx.fail()
  }
})

test('object with anyOf and multiple types', (ctx) => {
  expect.assertions(3)

  const schema = {
    title: 'object with anyOf and multiple types',
    type: 'object',
    properties: {
      objectOrBoolean: {
        anyOf: [
          {
            type: 'object',
            properties: {
              stringOrNumber: {
                type: ['string', 'number']
              }
            }
          },
          {
            type: 'boolean'
          }
        ]
      }
    }
  }
  const stringify = build(schema, { ajv: { allowUnionTypes: true } })

  try {
    const value = stringify({
      objectOrBoolean: { stringOrNumber: 'string' }
    })
    expect(value).toBe('{"objectOrBoolean":{"stringOrNumber":"string"}}')
  } catch (e) {
    console.log(e)
    ctx.fail()
  }

  expect(stringify({
    objectOrBoolean: { stringOrNumber: 42 }
  })).toBe('{"objectOrBoolean":{"stringOrNumber":42}}')

  expect(stringify({
    objectOrBoolean: true
  })).toBe('{"objectOrBoolean":true}')
})

test('string type array can handle dates', () => {
  expect.assertions(1)
  const schema = {
    type: 'object',
    properties: {
      date: { type: ['string'] },
      dateObject: { type: ['string'], format: 'date-time' }
    }
  }
  const stringify = build(schema)
  const value = stringify({
    date: new Date('2018-04-20T07:52:31.017Z'),
    dateObject: new Date('2018-04-21T07:52:31.017Z')
  })
  expect(value).toBe('{"date":"2018-04-20T07:52:31.017Z","dateObject":"2018-04-21T07:52:31.017Z"}')
})

test('object that is simultaneously a string and a json', () => {
  expect.assertions(2)
  const schema = {
    type: 'object',
    properties: {
      simultaneously: {
        type: ['string', 'object'],
        properties: {
          foo: { type: 'string' }
        }
      }
    }
  }

  const likeObjectId = {
    toString () { return 'hello' }
  }

  const stringify = build(schema)
  const valueStr = stringify({ simultaneously: likeObjectId })
  expect(valueStr).toBe('{"simultaneously":"hello"}')

  const valueObj = stringify({ simultaneously: { foo: likeObjectId } })
  expect(valueObj).toBe('{"simultaneously":{"foo":"hello"}}')
})

test('object that is simultaneously a string and a json switched', () => {
  expect.assertions(2)
  const schema = {
    type: 'object',
    properties: {
      simultaneously: {
        type: ['object', 'string'],
        properties: {
          foo: { type: 'string' }
        }
      }
    }
  }

  const likeObjectId = {
    toString () { return 'hello' }
  }

  const stringify = build(schema)
  const valueStr = stringify({ simultaneously: likeObjectId })
  expect(valueStr).toBe('{"simultaneously":{}}')

  const valueObj = stringify({ simultaneously: { foo: likeObjectId } })
  expect(valueObj).toBe('{"simultaneously":{"foo":"hello"}}')
})

test('class instance that is simultaneously a string and a json', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      simultaneously: {
        type: ['string', 'object'],
        properties: {
          foo: { type: 'string' }
        }
      }
    }
  }

  class Test {
    toString () { return 'hello' }
  }

  const likeObjectId = new Test()

  const stringify = build(schema)
  const valueStr = stringify({ simultaneously: likeObjectId })
  expect(valueStr).toBe('{"simultaneously":"hello"}')

  const valueObj = stringify({ simultaneously: { foo: likeObjectId } })
  expect(valueObj).toBe('{"simultaneously":{"foo":"hello"}}')
})

test('should not throw an error when type is array and object is null, it should instead coerce to []', () => {
  expect.assertions(1)
  const schema = {
    type: 'object',
    properties: {
      arr: {
        type: 'array',
        items: {
          type: 'number'
        }
      }
    }
  }

  const stringify = build(schema)
  const result = stringify({ arr: null })
  expect(result).toBe(JSON.stringify({ arr: [] }))
})

test('should throw an error when type is array and object is not an array', () => {
  expect.assertions(1)
  const schema = {
    type: 'object',
    properties: {
      arr: {
        type: 'array',
        items: {
          type: 'number'
        }
      }
    }
  }

  const stringify = build(schema)
  expect(() => stringify({ arr: { foo: 'hello' } })).toThrow(new TypeError('The value of \'#/properties/arr\' does not match schema definition.'))
})

test('should throw an error when type is array and object is not an array with external schema', () => {
  expect.assertions(1)
  const schema = {
    type: 'object',
    properties: {
      arr: {
        $ref: 'arrayOfNumbers#/definitions/arr'
      }
    }
  }

  const externalSchema = {
    arrayOfNumbers: {
      definitions: {
        arr: {
          type: 'array',
          items: {
            type: 'number'
          }
        }
      }
    }
  }

  const stringify = build(schema, { schema: externalSchema })
  expect(() => stringify({ arr: { foo: 'hello' } })).toThrow(new TypeError('The value of \'arrayOfNumbers#/definitions/arr\' does not match schema definition.'))
})

test('throw an error if none of types matches', () => {
  expect.assertions(1)

  const schema = {
    title: 'simple object with multi-type nullable primitive',
    type: 'object',
    properties: {
      data: {
        type: ['number', 'boolean']
      }
    }
  }

  const stringify = build(schema)
  expect(() => stringify({ data: 'string' })).toThrow()
})
