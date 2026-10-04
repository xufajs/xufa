'use strict'



const build = require('..')

test('serialize string with newlines - issue #793', () => {
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
    message: `This is a string
with multiple
newlines in it
Foo`
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

test('serialize string with various newline characters - issue #793', () => {
  expect.assertions(4)

  const schema = {
    type: 'string'
  }

  const stringify = build(schema)

  // Test \n (line feed)
  const inputLF = 'line1\nline2'
  const outputLF = stringify(inputLF)
  expect(JSON.parse(outputLF)).toBe(inputLF)

  // Test \r (carriage return)
  const inputCR = 'line1\rline2'
  const outputCR = stringify(inputCR)
  expect(JSON.parse(outputCR)).toBe(inputCR)

  // Test \r\n (CRLF)
  const inputCRLF = 'line1\r\nline2'
  const outputCRLF = stringify(inputCRLF)
  expect(JSON.parse(outputCRLF)).toBe(inputCRLF)

  // Test mixed newlines
  const inputMixed = 'line1\nline2\rline3\r\nline4'
  const outputMixed = stringify(inputMixed)
  expect(JSON.parse(outputMixed)).toBe(inputMixed)
})

test('serialize object with newlines in multiple properties - issue #793', () => {
  expect.assertions(2)

  const schema = {
    type: 'object',
    properties: {
      message: {
        type: 'string'
      },
      description: {
        type: 'string'
      },
      timestamp: {
        type: 'string'
      }
    }
  }

  const input = {
    message: `This is a string
with multiple
newlines in it
Foo`,
    description: 'This JSON response contains a field with newline characters',
    timestamp: new Date().toISOString()
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
