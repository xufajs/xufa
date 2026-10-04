'use strict'



test('asNumber should convert BigInt', () => {
  expect.assertions(1)
  const serializer = require('../lib/runtime')

  const number = serializer.asNumber(11753021440n)

  expect(number).toBe('11753021440')
})
