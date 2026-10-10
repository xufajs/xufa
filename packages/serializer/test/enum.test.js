import build from '../index.js';

test('use enum without type', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'Example Schema',
    type: 'object',
    properties: {
      order: {
        type: 'string',
        enum: ['asc', 'desc']
      }
    }
  })

  const obj = { order: 'asc' }
  expect('{"order":"asc"}').toBe(stringify(obj))
})

test('use enum without type', () => {
  expect.assertions(1)
  const stringify = build({
    title: 'Example Schema',
    type: 'object',
    properties: {
      order: {
        enum: ['asc', 'desc']
      }
    }
  })

  const obj = { order: 'asc' }
  expect('{"order":"asc"}').toBe(stringify(obj))
})
