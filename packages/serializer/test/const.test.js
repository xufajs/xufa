import validator from 'is-my-json-valid';
import build from '../index.js';

test('schema with const string', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      foo: { const: 'bar' }
    }
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify({
    foo: 'bar'
  })

  expect(output).toBe('{"foo":"bar"}')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('schema with const string containing characters that need escaping', () => {
  const values = ['back\\slash', 'tab\there', 'quote"here', 'new\nline', "tick's"]
  expect.assertions(values.length * 2)

  for (const value of values) {
    const schema = {
      type: 'object',
      properties: {
        foo: { const: value }
      }
    }

    const stringify = build(schema)
    const output = stringify({ foo: value })

    expect(output).toBe(JSON.stringify({ foo: value }))
    expect(JSON.parse(output)).toEqual({ foo: value })
  }
})

test('schema with const string and different input', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      foo: { const: 'bar' }
    }
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify({
    foo: 'baz'
  })

  expect(output).toBe('{"foo":"bar"}')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('schema with const string and different type input', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      foo: { const: 'bar' }
    }
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify({
    foo: 1
  })

  expect(output).toBe('{"foo":"bar"}')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('schema with const string and no input', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      foo: { const: 'bar' }
    }
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify({})

  expect(output).toBe('{}')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('schema with const string that contains \'', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      foo: { const: "'bar'" }
    }
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify({
    foo: "'bar'"
  })

  expect(output).toBe('{"foo":"\'bar\'"}')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('schema with const number', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      foo: { const: 1 }
    }
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify({
    foo: 1
  })

  expect(output).toBe('{"foo":1}')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('schema with const number and different input', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      foo: { const: 1 }
    }
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify({
    foo: 2
  })

  expect(output).toBe('{"foo":1}')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('schema with const bool', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      foo: { const: true }
    }
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify({
    foo: true
  })

  expect(output).toBe('{"foo":true}')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('schema with const number', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      foo: { const: 1 }
    }
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify({
    foo: 1
  })

  expect(output).toBe('{"foo":1}')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('schema with const null', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      foo: { const: null }
    }
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify({
    foo: null
  })

  expect(output).toBe('{"foo":null}')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('schema with const array', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      foo: { const: [1, 2, 3] }
    }
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify({
    foo: [1, 2, 3]
  })

  expect(output).toBe('{"foo":[1,2,3]}')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('schema with const object', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      foo: { const: { bar: 'baz' } }
    }
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify({
    foo: { bar: 'baz' }
  })

  expect(output).toBe('{"foo":{"bar":"baz"}}')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('schema with const and null as type', () => {
  expect.assertions(4)

  const schema = {
    type: 'object',
    properties: {
      foo: { type: ['string', 'null'], const: 'baz' }
    }
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify({
    foo: null
  })

  expect(output).toBe('{"foo":null}')
  expect(validate(JSON.parse(output))).toBeTruthy()

  const output2 = stringify({ foo: 'baz' })
  expect(output2).toBe('{"foo":"baz"}')
  expect(validate(JSON.parse(output2))).toBeTruthy()
})

test('schema with const as nullable', () => {
  expect.assertions(4)

  const schema = {
    type: 'object',
    properties: {
      foo: { nullable: true, const: 'baz' }
    }
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify({
    foo: null
  })

  expect(output).toBe('{"foo":null}')
  expect(validate(JSON.parse(output))).toBeTruthy()

  const output2 = stringify({
    foo: 'baz'
  })
  expect(output2).toBe('{"foo":"baz"}')
  expect(validate(JSON.parse(output2))).toBeTruthy()
})

test('schema with const and invalid object', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      foo: { const: { foo: 'bar' } }
    },
    required: ['foo']
  }

  const validate = validator(schema)
  const stringify = build(schema)
  const result = stringify({
    foo: { foo: 'baz' }
  })

  expect(result).toBe('{"foo":{"foo":"bar"}}')
  expect(validate(JSON.parse(result))).toBeTruthy()
})
