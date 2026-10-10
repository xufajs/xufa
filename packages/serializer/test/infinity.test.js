import build from '../index.js';

test('Finite numbers', () => {
  const values = [-5, 0, -0, 1.33, 99, 100.0,
    Math.E, Number.EPSILON,
    Number.MAX_SAFE_INTEGER, Number.MAX_VALUE,
    Number.MIN_SAFE_INTEGER, Number.MIN_VALUE]

  expect.assertions(values.length)

  const schema = {
    type: 'number'
  }

  const stringify = build(schema)

  values.forEach(v => expect(stringify(v)).toBe(JSON.stringify(v)))
})

test('Infinite integers', () => {
  const values = [Infinity, -Infinity]

  expect.assertions(values.length)

  const schema = {
    type: 'integer'
  }

  const stringify = build(schema)

  values.forEach(v => {
    try {
      stringify(v)
    } catch (err) {
      expect(err.message).toBe(`The value "${v}" cannot be converted to an integer.`)
    }
  })
})

test('Infinite numbers', () => {
  const values = [Infinity, -Infinity]

  expect.assertions(values.length)

  const schema = {
    type: 'number'
  }

  const stringify = build(schema)

  values.forEach(v => expect(stringify(v)).toBe(JSON.stringify(v)))
})
