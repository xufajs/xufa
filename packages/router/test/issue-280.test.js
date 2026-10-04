'use strict'


const FindMyWay = require('../')

test('Wildcard route match when regexp route fails', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/:a(a)', () => {})
  findMyWay.on('GET', '/*', () => {})

  expect(findMyWay.find('GET', '/b', {}).params).toEqual({ '*': 'b' })
})
