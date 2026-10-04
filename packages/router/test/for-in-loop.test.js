'use strict'

/* eslint no-extend-native: off */



// Something could extend the Array prototype
Array.prototype.test = null
test('for-in-loop', () => {
  expect(() => {
    require('../')
  }).not.toThrow()
})

test('ignore inherited constraint keys', () => {
  const findMyWay = require('../')()
  const constraints = Object.create({ tap: true })

  expect(() => {
    findMyWay.on('GET', '/test', { constraints }, () => {})
  }).not.toThrow()
})
