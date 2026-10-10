import build from '../index.js';

test('additionalProperties', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'additionalProperties',
    type: 'object',
    properties: {
      str: {
        type: 'string'
      }
    },
    additionalProperties: {
      type: 'string'
    }
  })

  const obj = { str: 'test', foo: 42, ofoo: true, foof: 'string', objfoo: { a: true } }
  expect(stringify(obj)).toBe('{"str":"test","foo":"42","ofoo":"true","foof":"string","objfoo":"[object Object]"}')
})

test('additionalProperties should not change properties', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'patternProperties should not change properties',
    type: 'object',
    properties: {
      foo: {
        type: 'string'
      }
    },
    additionalProperties: {
      type: 'number'
    }
  })

  const obj = { foo: '42', ofoo: 42 }
  expect(stringify(obj)).toBe('{"foo":"42","ofoo":42}')
})

test('additionalProperties should not change properties and patternProperties', () => {
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
        type: 'string'
      }
    },
    additionalProperties: {
      type: 'number'
    }
  })

  const obj = { foo: '42', ofoo: 42, test: '42' }
  expect(stringify(obj)).toBe('{"foo":"42","ofoo":"42","test":42}')
})

test('additionalProperties set to true, use of fast-safe-stringify', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'check string coerce',
    type: 'object',
    properties: {},
    additionalProperties: true
  })

  const obj = { foo: true, ofoo: 42, arrfoo: ['array', 'test'], objfoo: { a: 'world' } }
  expect(stringify(obj)).toBe('{"foo":true,"ofoo":42,"arrfoo":["array","test"],"objfoo":{"a":"world"}}')
})

test('additionalProperties - string coerce', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'check string coerce',
    type: 'object',
    properties: {},
    additionalProperties: {
      type: 'string'
    }
  })

  const obj = { foo: true, ofoo: 42, arrfoo: ['array', 'test'], objfoo: { a: 'world' } }
  expect(stringify(obj)).toBe('{"foo":"true","ofoo":"42","arrfoo":"array,test","objfoo":"[object Object]"}')
})

test('additionalProperties - number skip', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'check number coerce',
    type: 'object',
    properties: {},
    additionalProperties: {
      type: 'number'
    }
  })

  // const obj = { foo: true, ofoo: '42', xfoo: 'string', arrfoo: [1, 2], objfoo: { num: 42 } }
  const obj = { foo: true, ofoo: '42' }
  expect(stringify(obj)).toBe('{"foo":1,"ofoo":42}')
})

test('additionalProperties - boolean coerce', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'check boolean coerce',
    type: 'object',
    properties: {},
    additionalProperties: {
      type: 'boolean'
    }
  })

  const obj = { foo: 'true', ofoo: 0, arrfoo: [1, 2], objfoo: { a: true } }
  expect(stringify(obj)).toBe('{"foo":true,"ofoo":false,"arrfoo":true,"objfoo":true}')
})

test('additionalProperties - object coerce', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'check object coerce',
    type: 'object',
    properties: {},
    additionalProperties: {
      type: 'object',
      properties: {
        answer: {
          type: 'number'
        }
      }
    }
  })

  const obj = { objfoo: { answer: 42 } }
  expect(stringify(obj)).toBe('{"objfoo":{"answer":42}}')
})

test('additionalProperties - array coerce', () => {
  expect.assertions(2)
  const stringify = build({
    title: 'check array coerce',
    type: 'object',
    properties: {},
    additionalProperties: {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  })

  const coercibleValues = { arrfoo: [1, 2] }
  expect(stringify(coercibleValues)).toBe('{"arrfoo":["1","2"]}')

  const incoercibleValues = { foo: 'true', ofoo: 0, objfoo: { tyrion: 'lannister' } }
  expect(() => stringify(incoercibleValues)).toThrow()
})

test('additionalProperties with empty schema', () => {
  expect.assertions(1)
  const stringify = build({
    type: 'object',
    additionalProperties: {}
  })

  const obj = { a: 1, b: true, c: null }
  expect(stringify(obj)).toBe('{"a":1,"b":true,"c":null}')
})

test('additionalProperties with nested empty schema', () => {
  expect.assertions(1)
  const stringify = build({
    type: 'object',
    properties: {
      data: { type: 'object', additionalProperties: {} }
    },
    required: ['data']
  })

  const obj = { data: { a: 1, b: true, c: null } }
  expect(stringify(obj)).toBe('{"data":{"a":1,"b":true,"c":null}}')
})

test('nested additionalProperties', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'additionalProperties',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        ap: {
          type: 'object',
          additionalProperties: { type: 'string' }
        }
      }
    }
  })

  const obj = [{ ap: { value: 'string' } }]
  expect(stringify(obj)).toBe('[{"ap":{"value":"string"}}]')
})

test('very nested additionalProperties', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'additionalProperties',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        ap: {
          type: 'object',
          properties: {
            nested: {
              type: 'object',
              properties: {
                moarNested: {
                  type: 'object',
                  properties: {
                    finally: {
                      type: 'object',
                      additionalProperties: {
                        type: 'string'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  })

  const obj = [{ ap: { nested: { moarNested: { finally: { value: 'str' } } } } }]
  expect(stringify(obj)).toBe('[{"ap":{"nested":{"moarNested":{"finally":{"value":"str"}}}}}]')
})

test('nested additionalProperties set to true', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'nested additionalProperties=true',
    type: 'object',
    properties: {
      ap: {
        type: 'object',
        additionalProperties: true
      }
    }
  })

  const obj = { ap: { value: 'string', someNumber: 42 } }
  expect(stringify(obj)).toBe('{"ap":{"value":"string","someNumber":42}}')
})

test('field passed to fastSafeStringify as undefined should be removed', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'nested additionalProperties=true',
    type: 'object',
    properties: {
      ap: {
        type: 'object',
        additionalProperties: true
      }
    }
  })

  const obj = { ap: { value: 'string', someNumber: undefined } }
  expect(stringify(obj)).toBe('{"ap":{"value":"string"}}')
})

test('property without type but with enum, will acts as additionalProperties', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'automatic additionalProperties',
    type: 'object',
    properties: {
      ap: {
        enum: ['foobar', 42, ['foo', 'bar'], {}]
      }
    }
  })

  const obj = { ap: { additional: 'field' } }
  expect(stringify(obj)).toBe('{"ap":{"additional":"field"}}')
})

test('property without type but with enum, will acts as additionalProperties without overwriting', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'automatic additionalProperties',
    type: 'object',
    properties: {
      ap: {
        additionalProperties: false,
        enum: ['foobar', 42, ['foo', 'bar'], {}]
      }
    }
  })

  const obj = { ap: { additional: 'field' } }
  expect(stringify(obj)).toBe('{"ap":{}}')
})

test('function and symbol references are not serialized as undefined', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'additionalProperties',
    type: 'object',
    additionalProperties: true,
    properties: {
      str: {
        type: 'string'
      }
    }
  })

  const obj = { str: 'x', test: 'test', meth: () => 'x', sym: Symbol('x') }
  expect(stringify(obj)).toBe('{"str":"x","test":"test"}')
})

test('required + additionalProperties without declared properties produces valid JSON', () => {
  // Regression: when `required` is non-empty but `properties` is absent
  // (e.g. a record-style schema with only `additionalProperties`), the
  // serializer used to emit a stray leading comma:
  //   {"obj":{,"a":1,"b":2}}
  // because the "skip first comma" optimization assumed a declared
  // property would anchor it. With no `properties`, the additionalProperties
  // branch would write the separator before its first entry.
  expect.assertions(2)
  const stringify = build({
    type: 'object',
    properties: {
      obj: {
        type: 'object',
        propertyNames: { type: 'string', enum: ['a', 'b'] },
        additionalProperties: { type: 'number' },
        required: ['a', 'b']
      }
    }
  })

  const out = stringify({ obj: { a: 1, b: 2 } })
  expect(out).toBe('{"obj":{"a":1,"b":2}}')
  expect(JSON.parse(out)).toEqual({ obj: { a: 1, b: 2 } })
})

test('required key not in properties + additionalProperties produces valid JSON', () => {
  // Regression: declared `properties` is non-empty but `required` only lists
  // keys that are not in `properties`. After sorting, propertiesKeys[0] is
  // not required, so the "first declared property anchors the comma" premise
  // does not hold. The serializer used to emit '{,"str":"x"}' for input
  // missing the (non-required) declared `num`.
  expect.assertions(2)
  const stringify = build({
    type: 'object',
    properties: {
      num: { type: 'number' }
    },
    additionalProperties: true,
    required: ['str']
  })

  const out = stringify({ str: 'x' })
  expect(out).toBe('{"str":"x"}')
  expect(JSON.parse(out)).toEqual({ str: 'x' })
})
