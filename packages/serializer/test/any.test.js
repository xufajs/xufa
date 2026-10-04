'use strict'


const build = require('..')

test('object with nested random property', () => {
  expect.assertions(4)

  const schema = {
    title: 'empty schema to allow any object',
    type: 'object',
    properties: {
      id: { type: 'number' },
      name: {}
    }
  }
  const stringify = build(schema)

  expect(stringify({
    id: 1, name: 'string'
  })).toBe('{"id":1,"name":"string"}')

  expect(stringify({
    id: 1, name: { first: 'name', last: 'last' }
  })).toBe('{"id":1,"name":{"first":"name","last":"last"}}')

  expect(stringify({
    id: 1, name: null
  })).toBe('{"id":1,"name":null}')

  expect(stringify({
    id: 1, name: ['first', 'last']
  })).toBe('{"id":1,"name":["first","last"]}')
})

// reference: https://github.com/fastify/fast-json-stringify/issues/259
test('object with empty schema with $id: undefined set', () => {
  expect.assertions(1)

  const schema = {
    title: 'empty schema to allow any object with $id: undefined set',
    type: 'object',
    properties: {
      name: { $id: undefined }
    }
  }
  const stringify = build(schema)
  expect(stringify({
    name: 'string'
  })).toBe('{"name":"string"}')
})

test('array with random items', () => {
  expect.assertions(1)

  const schema = {
    title: 'empty schema to allow any object',
    type: 'array',
    items: {}
  }
  const stringify = build(schema)

  const value = stringify([1, 'string', null])
  expect(value).toBe('[1,"string",null]')
})

test('empty schema', () => {
  expect.assertions(7)

  const schema = { }

  const stringify = build(schema)

  expect(stringify(null)).toBe('null')
  expect(stringify(1)).toBe('1')
  expect(stringify(true)).toBe('true')
  expect(stringify('hello')).toBe('"hello"')
  expect(stringify({})).toBe('{}')
  expect(stringify({ x: 10 })).toBe('{"x":10}')
  expect(stringify([true, 1, 'hello'])).toBe('[true,1,"hello"]')
})

test('empty schema on nested object', () => {
  expect.assertions(7)

  const schema = {
    type: 'object',
    properties: {
      x: {}
    }
  }

  const stringify = build(schema)

  expect(stringify({ x: null })).toBe('{"x":null}')
  expect(stringify({ x: 1 })).toBe('{"x":1}')
  expect(stringify({ x: true })).toBe('{"x":true}')
  expect(stringify({ x: 'hello' })).toBe('{"x":"hello"}')
  expect(stringify({ x: {} })).toBe('{"x":{}}')
  expect(stringify({ x: { x: 10 } })).toBe('{"x":{"x":10}}')
  expect(stringify({ x: [true, 1, 'hello'] })).toBe('{"x":[true,1,"hello"]}')
})

test('empty schema on array', () => {
  expect.assertions(1)

  const schema = {
    type: 'array',
    items: {}
  }

  const stringify = build(schema)

  expect(stringify([1, true, 'hello', [], { x: 1 }])).toBe('[1,true,"hello",[],{"x":1}]')
})

test('empty schema on anyOf', () => {
  expect.assertions(4)

  // any on Foo codepath.
  const schema = {
    anyOf: [
      {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['Foo']
          },
          value: {}
        }
      },
      {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['Bar']
          },
          value: {
            type: 'number'
          }
        }
      }
    ]
  }

  const stringify = build(schema)

  expect(stringify({ kind: 'Bar', value: 1 })).toBe('{"kind":"Bar","value":1}')
  expect(stringify({ kind: 'Foo', value: 1 })).toBe('{"kind":"Foo","value":1}')
  expect(stringify({ kind: 'Foo', value: true })).toBe('{"kind":"Foo","value":true}')
  expect(stringify({ kind: 'Foo', value: 'hello' })).toBe('{"kind":"Foo","value":"hello"}')
})

test('should throw a TypeError with the path to the key of the invalid value /1', () => {
  expect.assertions(1)

  // any on Foo codepath.
  const schema = {
    anyOf: [
      {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['Foo']
          },
          value: {}
        }
      },
      {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['Bar']
          },
          value: {
            type: 'number'
          }
        }
      }
    ]
  }

  const stringify = build(schema)

  expect(() => stringify({ kind: 'Baz', value: 1 })).toThrow(new TypeError('The value of \'#\' does not match schema definition.'))
})

test('should throw a TypeError with the path to the key of the invalid value /2', () => {
  expect.assertions(1)

  // any on Foo codepath.
  const schema = {
    type: 'object',
    properties: {
      data: {
        anyOf: [
          {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: ['Foo']
              },
              value: {}
            }
          },
          {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: ['Bar']
              },
              value: {
                type: 'number'
              }
            }
          }
        ]
      }
    }
  }

  const stringify = build(schema)

  expect(() => stringify({ data: { kind: 'Baz', value: 1 } })).toThrow(new TypeError('The value of \'#/properties/data\' does not match schema definition.'))
})
