import build from '../index.js';

process.env.TZ = 'UTC'

const schema = {
  type: 'object',
  properties: {
  },
  if: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['foobar'] }
    }
  },
  then: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['foobar'] },
      foo: { type: 'string' },
      bar: { type: 'number' },
      list: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            value: { type: 'string' }
          }
        }
      }
    }
  },
  else: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['greeting'] },
      hi: { type: 'string' },
      hello: { type: 'number' },
      list: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            value: { type: 'string' }
          }
        }
      }
    }
  }
}

const nestedIfSchema = {
  type: 'object',
  properties: { },
  if: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['foobar', 'greeting'] }
    }
  },
  then: {
    if: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['foobar'] }
      }
    },
    then: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['foobar'] },
        foo: { type: 'string' },
        bar: { type: 'number' },
        list: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'string' }
            }
          }
        }
      }
    },
    else: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['greeting'] },
        hi: { type: 'string' },
        hello: { type: 'number' }
      }
    }
  },
  else: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['alphabet'] },
      a: { type: 'string' },
      b: { type: 'number' }
    }
  }
}

const nestedElseSchema = {
  type: 'object',
  properties: { },
  if: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['foobar'] }
    }
  },
  then: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['foobar'] },
      foo: { type: 'string' },
      bar: { type: 'number' },
      list: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            value: { type: 'string' }
          }
        }
      }
    }
  },
  else: {
    if: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['greeting'] }
      }
    },
    then: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['greeting'] },
        hi: { type: 'string' },
        hello: { type: 'number' }
      }
    },
    else: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['alphabet'] },
        a: { type: 'string' },
        b: { type: 'number' }
      }
    }
  }
}

const nestedDeepElseSchema = {
  type: 'object',
  additionalProperties: schema
}

const noElseSchema = {
  type: 'object',
  properties: {
  },
  if: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['foobar'] }
    }
  },
  then: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['foobar'] },
      foo: { type: 'string' },
      bar: { type: 'number' },
      list: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            value: { type: 'string' }
          }
        }
      }
    }
  }
}
const fooBarInput = {
  kind: 'foobar',
  foo: 'FOO',
  list: [{
    name: 'name',
    value: 'foo'
  }],
  bar: 42,
  hi: 'HI',
  hello: 45,
  a: 'A',
  b: 35
}
const greetingInput = {
  kind: 'greeting',
  foo: 'FOO',
  bar: 42,
  hi: 'HI',
  hello: 45,
  a: 'A',
  b: 35
}
const alphabetInput = {
  kind: 'alphabet',
  foo: 'FOO',
  bar: 42,
  hi: 'HI',
  hello: 45,
  a: 'A',
  b: 35
}
const deepFoobarInput = {
  foobar: fooBarInput
}
const foobarOutput = JSON.stringify({
  kind: 'foobar',
  foo: 'FOO',
  bar: 42,
  list: [{
    name: 'name',
    value: 'foo'
  }]
})
const greetingOutput = JSON.stringify({
  kind: 'greeting',
  hi: 'HI',
  hello: 45
})
const alphabetOutput = JSON.stringify({
  kind: 'alphabet',
  a: 'A',
  b: 35
})
const deepFoobarOutput = JSON.stringify({
  foobar: JSON.parse(foobarOutput)
})
const noElseGreetingOutput = JSON.stringify({})

describe('if-then-else', () => {
  const tests = [
    {
      name: 'foobar',
      schema,
      input: fooBarInput,
      expected: foobarOutput
    },
    {
      name: 'greeting',
      schema,
      input: greetingInput,
      expected: greetingOutput
    },
    {
      name: 'if nested - then then',
      schema: nestedIfSchema,
      input: fooBarInput,
      expected: foobarOutput
    },
    {
      name: 'if nested - then else',
      schema: nestedIfSchema,
      input: greetingInput,
      expected: greetingOutput
    },
    {
      name: 'if nested - else',
      schema: nestedIfSchema,
      input: alphabetInput,
      expected: alphabetOutput
    },
    {
      name: 'else nested - then',
      schema: nestedElseSchema,
      input: fooBarInput,
      expected: foobarOutput
    },
    {
      name: 'else nested - else then',
      schema: nestedElseSchema,
      input: greetingInput,
      expected: greetingOutput
    },
    {
      name: 'else nested - else else',
      schema: nestedElseSchema,
      input: alphabetInput,
      expected: alphabetOutput
    },
    {
      name: 'deep then - else',
      schema: nestedDeepElseSchema,
      input: deepFoobarInput,
      expected: deepFoobarOutput
    },
    {
      name: 'no else',
      schema: noElseSchema,
      input: greetingInput,
      expected: noElseGreetingOutput
    }
  ]

  for (const { name, schema, input, expected } of tests) {
    test(name + ' - normal', async () => {
      expect.assertions(1)

      const stringify = build(JSON.parse(JSON.stringify(schema)), { ajv: { strictTypes: false } })
      const serialized = stringify(input)
      expect(serialized).toBe(expected)
    })
  }
})

test('nested if/then', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: { a: { type: 'string' } },
    if: {
      type: 'object',
      properties: { foo: { type: 'string' } }
    },
    then: {
      properties: { bar: { type: 'string' } },
      if: {
        type: 'object',
        properties: { foo1: { type: 'string' } }
      },
      then: {
        properties: { bar1: { type: 'string' } }
      }
    }
  }

  const stringify = build(schema)

  expect(stringify({ a: 'A', foo: 'foo', bar: 'bar' })).toBe(JSON.stringify({ a: 'A', bar: 'bar' }))

  expect(stringify({ a: 'A', foo: 'foo', bar: 'bar', foo1: 'foo1', bar1: 'bar1' })).toBe(JSON.stringify({ a: 'A', bar: 'bar', bar1: 'bar1' }))
})

test('if/else with string format', () => {
  expect.assertions(2)

  const schema = {
    if: { type: 'string' },
    then: { type: 'string', format: 'date' },
    else: { const: 'Invalid' }
  }

  const stringify = build(schema)

  const date = new Date(1674263005800)

  expect(stringify(date)).toBe('"2023-01-21"')
  expect(stringify('Invalid')).toBe('"Invalid"')
})

test('if/else with const integers', () => {
  expect.assertions(2)

  const schema = {
    type: 'number',
    if: { type: 'number', minimum: 42 },
    then: { const: 66 },
    else: { const: 33 }
  }

  const stringify = build(schema)

  expect(stringify(100.32)).toBe('66')
  expect(stringify(10.12)).toBe('33')
})

test('if/else with array', () => {
  expect.assertions(2)

  const schema = {
    type: 'array',
    if: { type: 'array', maxItems: 1 },
    then: { items: { type: 'string' } },
    else: { items: { type: 'number' } }
  }

  const stringify = build(schema)

  expect(stringify(['1'])).toBe(JSON.stringify(['1']))
  expect(stringify(['1', '2'])).toBe(JSON.stringify([1, 2]))
})

test('external recursive if/then/else', () => {
  expect.assertions(1)

  const externalSchema = {
    type: 'object',
    properties: {
      base: { type: 'string' },
      self: { $ref: 'externalSchema#' }
    },
    if: {
      type: 'object',
      properties: {
        foo: { type: 'string', const: '41' }
      }
    },
    then: {
      type: 'object',
      properties: {
        bar: { type: 'string', const: '42' }
      }
    },
    else: {
      type: 'object',
      properties: {
        baz: { type: 'string', const: '43' }
      }
    }
  }

  const schema = {
    type: 'object',
    properties: {
      a: { $ref: 'externalSchema#/properties/self' },
      b: { $ref: 'externalSchema#/properties/self' }
    }
  }

  const data = {
    a: {
      base: 'a',
      foo: '41',
      bar: '42',
      baz: '43',
      ignore: 'ignored'
    },
    b: {
      base: 'b',
      foo: 'not-41',
      bar: '42',
      baz: '43',
      ignore: 'ignored'
    }
  }
  const stringify = build(schema, { schema: { externalSchema } })
  expect(stringify(data)).toBe('{"a":{"base":"a","bar":"42"},"b":{"base":"b","baz":"43"}}')
})

test('invalid if-then-else schema', () => {
  expect.assertions(1)

  const schema = {
    type: 'object',
    if: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['foobar'] }
      }
    },
    then: {
      type: 'object',
      properties: {
        foo: { type: 'string' }
      }
    },
    else: {
      type: 'object',
      properties: 'invalid'  // properties must be object
    }
  }

  try {
    build(schema)
    expect.fail('Should throw')
  } catch (err) {
    expect(err.message.includes('schema is invalid')).toBeTruthy()
  }
})

test('if-then-else with allOf', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    allOf: [
      {
        type: 'object',
        properties: {
          base: { type: 'string' }
        }
      }
    ],
    if: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['foobar'] }
      }
    },
    then: {
      type: 'object',
      properties: {
        foo: { type: 'string' }
      }
    },
    else: {
      type: 'object',
      properties: {
        bar: { type: 'string' }
      }
    }
  }

  const stringify = build(schema)
  const data = { base: 'test', kind: 'foobar', foo: 'value' }
  const output = stringify(data)

  expect(() => JSON.parse(output)).not.toThrow()
  expect(output).toBe('{"base":"test","foo":"value"}')
})
