import build from '../index.js';

test('patternProperties', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'patternProperties',
    type: 'object',
    properties: {
      str: {
        type: 'string'
      }
    },
    patternProperties: {
      foo: {
        type: 'string'
      }
    }
  })

  const obj = { str: 'test', foo: 42, ofoo: true, foof: 'string', objfoo: { a: true }, notMe: false }
  expect(stringify(obj)).toBe('{"str":"test","foo":"42","ofoo":"true","foof":"string","objfoo":"[object Object]"}')
})

test('patternProperties should not change properties', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'patternProperties should not change properties',
    type: 'object',
    properties: {
      foo: {
        type: 'string'
      }
    },
    patternProperties: {
      foo: {
        type: 'number'
      }
    }
  })

  const obj = { foo: '42', ofoo: 42 }
  expect(stringify(obj)).toBe('{"foo":"42","ofoo":42}')
})

test('patternProperties - string coerce', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'check string coerce',
    type: 'object',
    properties: {},
    patternProperties: {
      foo: {
        type: 'string'
      }
    }
  })

  const obj = { foo: true, ofoo: 42, arrfoo: ['array', 'test'], objfoo: { a: 'world' } }
  expect(stringify(obj)).toBe('{"foo":"true","ofoo":"42","arrfoo":"array,test","objfoo":"[object Object]"}')
})

test('patternProperties - number coerce', (ctx) => {
  expect.assertions(2)
  const stringify = build({
    title: 'check number coerce',
    type: 'object',
    properties: {},
    patternProperties: {
      foo: {
        type: 'number'
      }
    }
  })

  const coercibleValues = { foo: true, ofoo: '42' }
  expect(stringify(coercibleValues)).toBe('{"foo":1,"ofoo":42}')

  const incoercibleValues = { xfoo: 'string', arrfoo: [1, 2], objfoo: { num: 42 } }
  try {
    stringify(incoercibleValues)
    ctx.fail('should throw an error')
  } catch (err) {
    expect(err).toBeTruthy()
  }
})

test('patternProperties - boolean coerce', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'check boolean coerce',
    type: 'object',
    properties: {},
    patternProperties: {
      foo: {
        type: 'boolean'
      }
    }
  })

  const obj = { foo: 'true', ofoo: 0, arrfoo: [1, 2], objfoo: { a: true } }
  expect(stringify(obj)).toBe('{"foo":true,"ofoo":false,"arrfoo":true,"objfoo":true}')
})

test('patternProperties - object coerce', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'check object coerce',
    type: 'object',
    properties: {},
    patternProperties: {
      foo: {
        type: 'object',
        properties: {
          answer: {
            type: 'number'
          }
        }
      }
    }
  })

  const obj = { objfoo: { answer: 42 } }
  expect(stringify(obj)).toBe('{"objfoo":{"answer":42}}')
})

test('patternProperties - array coerce', () => {
  expect.assertions(2)
  const stringify = build({
    title: 'check array coerce',
    type: 'object',
    properties: {},
    patternProperties: {
      foo: {
        type: 'array',
        items: {
          type: 'string'
        }
      }
    }
  })

  const coercibleValues = { arrfoo: [1, 2] }
  expect(stringify(coercibleValues)).toBe('{"arrfoo":["1","2"]}')

  const incoercibleValues = { foo: 'true', ofoo: 0, objfoo: { tyrion: 'lannister' } }
  expect(() => stringify(incoercibleValues)).toThrow()
})

test('patternProperties - fail on invalid regex, handled by ajv', () => {
  expect.assertions(1)

  expect(() => build({
    title: 'check array coerce',
    type: 'object',
    properties: {},
    patternProperties: {
      'foo/\\': {
        type: 'array',
        items: {
          type: 'string'
        }
      }
    }
  })).toThrow(new Error('schema is invalid: data/patternProperties must match format "regex"'))
})

test('required key not in properties + patternProperties produces valid JSON', () => {
  // Regression: symmetric case to the additionalProperties variant. `required`
  // names a key not in `properties`, so after sorting propertiesKeys[0] is not
  // required and the "first declared property anchors the comma" premise does
  // not hold. The patternProperties branch shares the same code path, so the
  // same stray-leading-comma bug would surface here without the tightened
  // guard in `index.js`.
  expect.assertions(2)
  const stringify = build({
    type: 'object',
    properties: {
      num: { type: 'number' }
    },
    patternProperties: {
      '^s_': { type: 'string' }
    },
    required: ['s_x']
  })

  const out = stringify({ s_x: 'x' })
  expect(out).toBe('{"s_x":"x"}')
  expect(JSON.parse(out)).toEqual({ s_x: 'x' })
})
