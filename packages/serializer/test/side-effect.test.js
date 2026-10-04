'use strict'


const clone = require('rfdc/default')
const build = require('..')

test('oneOf with $ref should not change the input schema', () => {
  expect.assertions(2)

  const referenceSchema = {
    $id: 'externalId',
    type: 'object',
    properties: {
      name: { type: 'string' }
    }
  }

  const schema = {
    $id: 'mainSchema',
    type: 'object',
    properties: {
      people: {
        oneOf: [{ $ref: 'externalId' }]
      }
    }
  }
  const clonedSchema = clone(schema)
  const stringify = build(schema, {
    schema: {
      [referenceSchema.$id]: referenceSchema
    }
  })

  const value = stringify({ people: { name: 'hello', foo: 'bar' } })
  expect(value).toBe('{"people":{"name":"hello"}}')
  expect(schema).toEqual(clonedSchema)
})

test('oneOf and anyOf with $ref should not change the input schema', () => {
  expect.assertions(3)

  const referenceSchema = {
    $id: 'externalSchema',
    type: 'object',
    properties: {
      name: { type: 'string' }
    }
  }

  const schema = {
    $id: 'rootSchema',
    type: 'object',
    properties: {
      people: {
        oneOf: [{ $ref: 'externalSchema' }]
      },
      love: {
        anyOf: [
          { $ref: '#/definitions/foo' },
          { type: 'boolean' }
        ]
      }
    },
    definitions: {
      foo: { type: 'string' }
    }
  }
  const clonedSchema = clone(schema)
  const stringify = build(schema, {
    schema: {
      [referenceSchema.$id]: referenceSchema
    }
  })

  const valueAny1 = stringify({ people: { name: 'hello', foo: 'bar' }, love: 'music' })
  const valueAny2 = stringify({ people: { name: 'hello', foo: 'bar' }, love: true })

  expect(valueAny1).toBe('{"people":{"name":"hello"},"love":"music"}')
  expect(valueAny2).toBe('{"people":{"name":"hello"},"love":true}')
  expect(schema).toEqual(clonedSchema)
})

test('multiple $ref tree', () => {
  expect.assertions(2)

  const referenceDeepSchema = {
    $id: 'deepId',
    type: 'number'
  }

  const referenceSchema = {
    $id: 'externalId',
    type: 'object',
    properties: {
      name: { $ref: '#/definitions/foo' },
      age: { $ref: 'deepId' }
    },
    definitions: {
      foo: { type: 'string' }
    }
  }

  const schema = {
    $id: 'mainSchema',
    type: 'object',
    properties: {
      people: {
        oneOf: [{ $ref: 'externalId' }]
      }
    }
  }
  const clonedSchema = clone(schema)
  const stringify = build(schema, {
    schema: {
      [referenceDeepSchema.$id]: referenceDeepSchema,
      [referenceSchema.$id]: referenceSchema
    }
  })

  const value = stringify({ people: { name: 'hello', foo: 'bar', age: 42 } })
  expect(value).toBe('{"people":{"name":"hello","age":42}}')
  expect(schema).toEqual(clonedSchema)
})

test('must not mutate items $ref', () => {
  expect.assertions(2)

  const referenceSchema = {
    $id: 'ShowSchema',
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      name: {
        type: 'string'
      }
    }
  }

  const schema = {
    $id: 'ListSchema',
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'array',
    items: {
      $ref: 'ShowSchema#'
    }
  }
  const clonedSchema = clone(schema)
  const stringify = build(schema, {
    schema: {
      [referenceSchema.$id]: referenceSchema
    }
  })

  const value = stringify([{ name: 'foo' }])
  expect(value).toBe('[{"name":"foo"}]')
  expect(schema).toEqual(clonedSchema)
})

test('must not mutate items referred by $ref', () => {
  expect.assertions(2)

  const firstSchema = {
    $id: 'example1',
    type: 'object',
    properties: {
      name: {
        type: 'string'
      }
    }
  }

  const reusedSchema = {
    $id: 'example2',
    type: 'object',
    properties: {
      name: {
        oneOf: [
          {
            $ref: 'example1'
          }
        ]
      }
    }
  }

  const clonedSchema = clone(firstSchema)
  const stringify = build(reusedSchema, {
    schema: {
      [firstSchema.$id]: firstSchema
    }
  })

  const value = stringify({ name: { name: 'foo' } })
  expect(value).toBe('{"name":{"name":"foo"}}')
  expect(firstSchema).toEqual(clonedSchema)
})
