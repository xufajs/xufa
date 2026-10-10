import build from '../index.js';

test('serialize short string', () => {
  expect.assertions(2)

  const schema = {
    type: 'string'
  }

  const input = 'abcd'
  const stringify = build(schema)
  const output = stringify(input)

  expect(output).toBe('"abcd"')
  expect(JSON.parse(output)).toBe(input)
})

test('serialize short string', () => {
  expect.assertions(2)

  const schema = {
    type: 'string'
  }

  const input = '\x00'
  const stringify = build(schema)
  const output = stringify(input)

  expect(output).toBe('"\\u0000"')
  expect(JSON.parse(output)).toBe(input)
})

test('serialize long string', () => {
  expect.assertions(2)

  const schema = {
    type: 'string'
  }

  const input = new Array(2e4).fill('\x00').join('')
  const stringify = build(schema)
  const output = stringify(input)

  expect(output).toBe(`"${new Array(2e4).fill('\\u0000').join('')}"`)
  expect(JSON.parse(output)).toBe(input)
})

test('unsafe string', () => {
  expect.assertions(2)

  const schema = {
    type: 'string',
    format: 'unsafe'
  }

  const input = 'abcd'
  const stringify = build(schema)
  const output = stringify(input)

  expect(output).toBe(`"${input}"`)
  expect(JSON.parse(output)).toBe(input)
})

test('unsafe unescaped string', () => {
  expect.assertions(2)

  const schema = {
    type: 'string',
    format: 'unsafe'
  }

  const input = 'abcd "abcd"'
  const stringify = build(schema)
  const output = stringify(input)

  expect(output).toBe(`"${input}"`)
  expect(function () {
    JSON.parse(output)
  }).toThrow()
})
