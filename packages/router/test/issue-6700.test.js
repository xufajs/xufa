'use strict'


const FindMyWay = require('../')

test('regex param route should not match an empty trailing segment', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: () => {
      expect('route not matched').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/users/:userId(^\\d+)', () => {
    expect.fail('regex route matched')
  })

  findMyWay.lookup({ method: 'GET', url: '/users/', headers: {} }, null)
})

test('find should return null for regex param route with an empty trailing segment', () => {
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/users/:userId(^\\d+)', () => {})

  expect(findMyWay.find('GET', '/users/')).toBe(null)
})
