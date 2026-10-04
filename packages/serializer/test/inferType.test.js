'use strict'


const validator = require('is-my-json-valid')
const build = require('..')

function buildTest (schema, toStringify) {
  test(`render a ${schema.title} as JSON`, () => {
    expect.assertions(3)

    const validate = validator(schema)
    const stringify = build(schema)
    const output = stringify(toStringify)

    expect(JSON.parse(output)).toEqual(toStringify)
    expect(output).toBe(JSON.stringify(toStringify))
    expect(validate(JSON.parse(output))).toBeTruthy()
  })
}

buildTest({
  title: 'infer type object by keyword',
  // 'type': 'object',
  properties: {
    name: {
      type: 'string'
    }
  }
}, {
  name: 'foo'
})

buildTest({
  title: 'infer type of nested object by keyword',
  // 'type': 'object',
  properties: {
    more: {
      description: 'more properties',
      // 'type': 'object',
      properties: {
        something: {
          type: 'string'
        }
      }
    }
  }
}, {
  more: {
    something: 'else'
  }
})

buildTest({
  title: 'infer type array by keyword',
  type: 'object',
  properties: {
    ids: {
      // 'type': 'array',
      items: {
        type: 'string'
      }
    }
  }
}, {
  ids: ['test']
})

buildTest({
  title: 'infer type string by keyword',
  type: 'object',
  properties: {
    name: {
      // 'type': 'string',
      maxLength: 3
    }
  }
}, {
  name: 'foo'
})

buildTest({
  title: 'infer type number by keyword',
  type: 'object',
  properties: {
    age: {
      // 'type': 'number',
      maximum: 18
    }
  }
}, {
  age: 18
})
