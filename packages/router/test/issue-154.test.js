'use strict'


const FindMyWay = require('..')
const noop = () => {}

test('Should throw when not sending a string', () => {
  expect.assertions(3)

  const findMyWay = FindMyWay()

  expect(() => {
    findMyWay.on('GET', '/t1', { constraints: { version: 42 } }, noop)
  }).toThrow()
  expect(() => {
    findMyWay.on('GET', '/t2', { constraints: { version: null } }, noop)
  }).toThrow()
  expect(() => {
    findMyWay.on('GET', '/t2', { constraints: { version: true } }, noop)
  }).toThrow()
})
