'use strict'


const FindMyWay = require('..')

test('find calls can pass no constraints', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/a', () => {})
  findMyWay.on('GET', '/a/b', () => {})

  expect(findMyWay.find('GET', '/a')).toBeTruthy()
  expect(findMyWay.find('GET', '/a/b')).toBeTruthy()
  expect(findMyWay.find('GET', '/a/b/c')).toBeFalsy()
})
