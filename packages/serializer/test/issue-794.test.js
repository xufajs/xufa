import build from '../index.js';

test('serialize string with quotes - issue #794', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      message: {
        type: 'string'
      }
    }
  }

  const input = {
    message: 'Error: Property "name" is required'
  }

  const stringify = build(schema)
  const output = stringify(input)

  // The output should be valid JSON
  expect(() => {
    JSON.parse(output)
  }).not.toThrow()

  // The parsed output should match the input
  const parsed = JSON.parse(output)
  expect(parsed.message).toBe(input.message)
})

test('serialize string with various quote types - issue #794', () => {
  expect.assertions(6)

  const schema = {
    type: 'string'
  }

  const stringify = build(schema)

  // Test double quotes
  const inputDoubleQuotes = 'Property "name" is required'
  const outputDoubleQuotes = stringify(inputDoubleQuotes)
  expect(() => JSON.parse(outputDoubleQuotes)).not.toThrow()
  expect(JSON.parse(outputDoubleQuotes)).toBe(inputDoubleQuotes)

  // Test single quotes (should be fine but test for completeness)
  const inputSingleQuotes = "Property 'name' is required"
  const outputSingleQuotes = stringify(inputSingleQuotes)
  expect(() => JSON.parse(outputSingleQuotes)).not.toThrow()
  expect(JSON.parse(outputSingleQuotes)).toBe(inputSingleQuotes)

  // Test mixed quotes
  const inputMixedQuotes = 'Error: "Property \'name\' is required"'
  const outputMixedQuotes = stringify(inputMixedQuotes)
  expect(() => JSON.parse(outputMixedQuotes)).not.toThrow()
  expect(JSON.parse(outputMixedQuotes)).toBe(inputMixedQuotes)
})

test('serialize error-like object with quotes in message - issue #794', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: {
          message: {
            type: 'string'
          },
          code: {
            type: 'string'
          }
        }
      }
    }
  }

  const input = {
    error: {
      message: 'Validation failed: Property "email" must be a valid email address',
      code: 'VALIDATION_ERROR'
    }
  }

  const stringify = build(schema)
  const output = stringify(input)

  // The output should be valid JSON
  expect(() => {
    JSON.parse(output)
  }).not.toThrow()

  // The parsed output should match the input
  const parsed = JSON.parse(output)
  expect(parsed).toEqual(input)
})

test('serialize validation errors array with quotes - issue #794', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      errors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            message: {
              type: 'string'
            },
            field: {
              type: 'string'
            }
          }
        }
      }
    }
  }

  const input = {
    errors: [
      {
        message: 'Property "name" is required',
        field: 'name'
      },
      {
        message: 'Property "email" must be a valid email address',
        field: 'email'
      },
      {
        message: 'Value must be between "1" and "100"',
        field: 'age'
      }
    ]
  }

  const stringify = build(schema)
  const output = stringify(input)

  // The output should be valid JSON
  expect(() => {
    JSON.parse(output)
  }).not.toThrow()

  // The parsed output should match the input
  const parsed = JSON.parse(output)
  expect(parsed).toEqual(input)
})

test('serialize string with backslashes and quotes - issue #794', () => {
  expect.assertions(4)

  const schema = {
    type: 'string'
  }

  const stringify = build(schema)

  // Test backslashes
  const inputBackslash = 'Path: C:\\Users\\test\\file.json'
  const outputBackslash = stringify(inputBackslash)
  expect(() => JSON.parse(outputBackslash)).not.toThrow()
  expect(JSON.parse(outputBackslash)).toBe(inputBackslash)

  // Test combination of backslashes and quotes
  const inputMixed = 'Error: Could not find file "C:\\Users\\test\\config.json"'
  const outputMixed = stringify(inputMixed)
  expect(() => JSON.parse(outputMixed)).not.toThrow()
  expect(JSON.parse(outputMixed)).toBe(inputMixed)
})
