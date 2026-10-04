'use strict'


const validator = require('is-my-json-valid')
const build = require('..')

process.env.TZ = 'UTC'

test('render a date in a string as JSON', () => {
  expect.assertions(2)

  const schema = {
    title: 'a date in a string',
    type: 'string'
  }
  const toStringify = new Date(1674263005800)

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify(toStringify)

  expect(output).toBe(JSON.stringify(toStringify))
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('render a date in a string when format is date-format as ISOString', () => {
  expect.assertions(2)

  const schema = {
    title: 'a date in a string',
    type: 'string',
    format: 'date-time'
  }
  const toStringify = new Date(1674263005800)

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify(toStringify)

  expect(output).toBe(JSON.stringify(toStringify))
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('render a nullable date in a string when format is date-format as ISOString', () => {
  expect.assertions(2)

  const schema = {
    title: 'a date in a string',
    type: 'string',
    format: 'date-time',
    nullable: true
  }
  const toStringify = new Date(1674263005800)

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify(toStringify)

  expect(output).toBe(JSON.stringify(toStringify))
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('render a date in a string when format is date as YYYY-MM-DD', () => {
  expect.assertions(2)

  const schema = {
    title: 'a date in a string',
    type: 'string',
    format: 'date'
  }
  const toStringify = new Date(1674263005800)

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify(toStringify)

  expect(output).toBe('"2023-01-21"')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('render a nullable date in a string when format is date as YYYY-MM-DD', () => {
  expect.assertions(2)

  const schema = {
    title: 'a date in a string',
    type: 'string',
    format: 'date',
    nullable: true
  }
  const toStringify = new Date(1674263005800)

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify(toStringify)

  expect(output).toBe('"2023-01-21"')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('verify padding for rendered date in a string when format is date', () => {
  expect.assertions(2)

  const schema = {
    title: 'a date in a string',
    type: 'string',
    format: 'date'
  }
  const toStringify = new Date(2020, 0, 1, 0, 0, 0, 0)

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify(toStringify)

  expect(output).toBe('"2020-01-01"')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('render a date in a string when format is time as kk:mm:ss', () => {
  expect.assertions(3)

  const schema = {
    title: 'a date in a string',
    type: 'string',
    format: 'time'
  }
  const toStringify = new Date(1674263005800)

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify(toStringify)

  validate(JSON.parse(output))
  expect(validate.errors).toBe(null)

  expect(output).toBe('"01:03:25"')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('render a nullable date in a string when format is time as kk:mm:ss', () => {
  expect.assertions(3)

  const schema = {
    title: 'a date in a string',
    type: 'string',
    format: 'time',
    nullable: true
  }
  const toStringify = new Date(1674263005800)

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify(toStringify)

  validate(JSON.parse(output))
  expect(validate.errors).toBe(null)

  expect(output).toBe('"01:03:25"')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('render a midnight time', () => {
  expect.assertions(3)

  const schema = {
    title: 'a date in a string',
    type: 'string',
    format: 'time'
  }
  const midnight = new Date(new Date(1674263005800).setHours(24))

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify(midnight)

  validate(JSON.parse(output))
  expect(validate.errors).toBe(null)

  expect(output).toBe('"00:03:25"')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('verify padding for rendered date in a string when format is time', () => {
  expect.assertions(3)

  const schema = {
    title: 'a date in a string',
    type: 'string',
    format: 'time'
  }
  const toStringify = new Date(2020, 0, 1, 1, 1, 1, 1)

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify(toStringify)

  validate(JSON.parse(output))
  expect(validate.errors).toBe(null)

  expect(output).toBe('"01:01:01"')
  expect(validate(JSON.parse(output))).toBeTruthy()
})

test('render a nested object in a string when type is date-format as ISOString', () => {
  expect.assertions(2)

  const schema = {
    title: 'an object in a string',
    type: 'object',
    properties: {
      date: {
        type: 'string',
        format: 'date-time'
      }
    }
  }
  const toStringify = { date: new Date(1674263005800) }

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify(toStringify)

  expect(output).toBe(JSON.stringify(toStringify))
  expect(validate(JSON.parse(output))).toBeTruthy()
})

describe('serializing null value', () => {
  const input = { updatedAt: null }

  function createSchema (properties) {
    return {
      title: 'an object in a string',
      type: 'object',
      properties
    }
  }

  function serialize (schema, input) {
    const validate = validator(schema)
    const stringify = build(schema)
    const output = stringify(input)

    return {
      validate,
      output
    }
  }

  

  describe('type::string', () => {
    

    test('format::date-time', () => {
      expect.assertions(2)

      const prop = {
        updatedAt: {
          type: 'string',
          format: 'date-time'
        }
      }

      const {
        output,
        validate
      } = serialize(createSchema(prop), input)

      expect(output).toBe('{"updatedAt":""}')
      expect(validate(JSON.parse(output))).toBe(false)
    })

    test('format::date', () => {
      expect.assertions(2)

      const prop = {
        updatedAt: {
          type: 'string',
          format: 'date'
        }
      }

      const {
        output,
        validate
      } = serialize(createSchema(prop), input)

      expect(output).toBe('{"updatedAt":""}')
      expect(validate(JSON.parse(output))).toBe(false)
    })

    test('format::time', () => {
      expect.assertions(2)

      const prop = {
        updatedAt: {
          type: 'string',
          format: 'time'
        }
      }

      const {
        output,
        validate
      } = serialize(createSchema(prop), input)

      expect(output).toBe('{"updatedAt":""}')
      expect(validate(JSON.parse(output))).toBe(false)
    })
  })

  describe('type::array', () => {
    

    test('format::date-time', () => {
      expect.assertions(2)

      const prop = {
        updatedAt: {
          type: ['string'],
          format: 'date-time'
        }
      }

      const {
        output,
        validate
      } = serialize(createSchema(prop), input)

      expect(output).toBe('{"updatedAt":""}')
      expect(validate(JSON.parse(output))).toBe(false)
    })

    test('format::date', () => {
      expect.assertions(2)

      const prop = {
        updatedAt: {
          type: ['string'],
          format: 'date'
        }
      }

      const {
        output,
        validate
      } = serialize(createSchema(prop), input)

      expect(output).toBe('{"updatedAt":""}')
      expect(validate(JSON.parse(output))).toBe(false)
    })

    test('format::date', () => {
      expect.assertions(2)

      const prop = {
        updatedAt: {
          type: ['string'],
          format: 'date'
        }
      }

      const {
        output,
        validate
      } = serialize(createSchema(prop), input)

      expect(output).toBe('{"updatedAt":""}')
      expect(validate(JSON.parse(output))).toBe(false)
    })

    test('format::time, Date object', () => {
      expect.assertions(1)

      const schema = {
        oneOf: [
          {
            type: 'object',
            properties: {
              updatedAt: {
                type: ['string', 'number'],
                format: 'time'
              }
            }
          }
        ]
      }

      const date = new Date(1674263005800)
      const input = { updatedAt: date }
      const { output } = serialize(schema, input)

      expect(output).toBe(JSON.stringify({ updatedAt: '01:03:25' }))
    })

    test('format::time, Date object', () => {
      expect.assertions(1)

      const schema = {
        oneOf: [
          {
            type: ['string', 'number'],
            format: 'time'
          }
        ]
      }

      const date = new Date(1674263005800)
      const { output } = serialize(schema, date)

      expect(output).toBe('"01:03:25"')
    })

    test('format::time, Date object', () => {
      expect.assertions(1)

      const schema = {
        oneOf: [
          {
            type: ['string', 'number'],
            format: 'time'
          }
        ]
      }

      const { output } = serialize(schema, 42)

      expect(output).toBe(JSON.stringify(42))
    })
  })

  describe('type::array::nullable', () => {
    

    test('format::date-time', () => {
      expect.assertions(2)

      const prop = {
        updatedAt: {
          type: ['string', 'null'],
          format: 'date-time'
        }
      }

      const {
        output,
        validate
      } = serialize(createSchema(prop), input)

      expect(output).toBe('{"updatedAt":null}')
      expect(validate(JSON.parse(output))).toBeTruthy()
    })

    test('format::date', () => {
      expect.assertions(2)

      const prop = {
        updatedAt: {
          type: ['string', 'null'],
          format: 'date'
        }
      }

      const {
        output,
        validate
      } = serialize(createSchema(prop), input)

      expect(output).toBe('{"updatedAt":null}')
      expect(validate(JSON.parse(output))).toBeTruthy()
    })

    test('format::time', () => {
      expect.assertions(2)

      const prop = {
        updatedAt: {
          type: ['string', 'null'],
          format: 'time'
        }
      }

      const {
        output,
        validate
      } = serialize(createSchema(prop), input)

      expect(output).toBe('{"updatedAt":null}')
      expect(validate(JSON.parse(output))).toBeTruthy()
    })
  })
})

test('Validate Date object as string type', () => {
  expect.assertions(1)

  const schema = {
    oneOf: [
      { type: 'string' }
    ]
  }
  const toStringify = new Date(1674263005800)

  const stringify = build(schema)
  const output = stringify(toStringify)

  expect(output).toBe(JSON.stringify(toStringify))
})

test('nullable date', () => {
  expect.assertions(1)

  const schema = {
    anyOf: [
      {
        format: 'date',
        type: 'string',
        nullable: true
      }
    ]
  }

  const stringify = build(schema)

  const data = new Date(1674263005800)
  const result = stringify(data)

  expect(result).toBe('"2023-01-21"')
})

test('non-date format should not affect data serialization (issue #491)', () => {
  expect.assertions(1)

  const schema = {
    type: 'object',
    properties: {
      hello: {
        type: 'string',
        format: 'int64',
        pattern: '^[0-9]*$'
      }
    }
  }

  const stringify = build(schema)
  const data = { hello: 123n }
  expect(stringify(data)).toBe('{"hello":"123"}')
})

test('should serialize also an invalid string value, even if it is not a valid date', () => {
  expect.assertions(2)

  const schema = {
    title: 'a date in a string',
    type: 'string',
    format: 'date-time',
    nullable: true
  }
  const toStringify = 'invalid'

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify(toStringify)

  expect(output).toBe(JSON.stringify(toStringify))
  expect(validate(JSON.parse(output))).toBe(false)
})

test('should throw an error if value can not be transformed to date-time', () => {
  expect.assertions(2)

  const schema = {
    title: 'a date in a string',
    type: 'string',
    format: 'date-time',
    nullable: true
  }
  const toStringify = true

  const validate = validator(schema)
  const stringify = build(schema)

  expect(() => stringify(toStringify)).toThrow(new Error('The value "true" cannot be converted to a date-time.'))
  expect(validate(toStringify)).toBe(false)
})

test('should throw an error if value can not be transformed to date', () => {
  expect.assertions(2)

  const schema = {
    title: 'a date in a string',
    type: 'string',
    format: 'date',
    nullable: true
  }
  const toStringify = true

  const validate = validator(schema)
  const stringify = build(schema)

  expect(() => stringify(toStringify)).toThrow(new Error('The value "true" cannot be converted to a date.'))
  expect(validate(toStringify)).toBe(false)
})

test('should throw an error if value can not be transformed to time', () => {
  expect.assertions(2)

  const schema = {
    title: 'a time in a string',
    type: 'string',
    format: 'time',
    nullable: true
  }
  const toStringify = true

  const validate = validator(schema)
  const stringify = build(schema)

  expect(() => stringify(toStringify)).toThrow(new Error('The value "true" cannot be converted to a time.'))
  expect(validate(toStringify)).toBe(false)
})

test('should serialize also an invalid string value, even if it is not a valid time', () => {
  expect.assertions(2)

  const schema = {
    title: 'a time in a string',
    type: 'string',
    format: 'time',
    nullable: true
  }
  const toStringify = 'invalid'

  const validate = validator(schema)
  const stringify = build(schema)
  const output = stringify(toStringify)

  expect(output).toBe(JSON.stringify(toStringify))
  expect(validate(JSON.parse(output))).toBe(false)
})
