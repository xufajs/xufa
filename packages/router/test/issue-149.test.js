'use strict'


const FindMyWay = require('../')

test('Falling back for node\'s parametric brother', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/foo/:id', () => {})
  findMyWay.on('GET', '/foo/:color/:id', () => {})
  findMyWay.on('GET', '/foo/red', () => {})

  expect(findMyWay.find('GET', '/foo/red/123').params).toEqual({ color: 'red', id: '123' })
  expect(findMyWay.find('GET', '/foo/blue/123').params).toEqual({ color: 'blue', id: '123' })
  expect(findMyWay.find('GET', '/foo/red').params).toEqual({})
})
