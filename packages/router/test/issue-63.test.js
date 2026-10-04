'use strict'


const factory = require('../')

const noop = function () {}

test('issue-63', () => {
  expect.assertions(2)

  const fmw = factory()

  expect(function () {
    fmw.on('GET', '/foo/:id(a', noop)
  }).toThrow()

  try {
    fmw.on('GET', '/foo/:id(a', noop)
    expect.fail('should fail')
  } catch (err) {
    expect(err.message).toBe('Invalid regexp expression in "/foo/:id(a"')
  }
})
