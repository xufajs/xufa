'use strict'


const querystring = require('node:querystring')
const FindMyWay = require('../')

test('Custom querystring parser', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay({
    querystringParser: function (str) {
      expect(str).toBe('foo=bar&baz=faz')
      return querystring.parse(str)
    }
  })
  findMyWay.on('GET', '/', () => {})

  expect(findMyWay.find('GET', '/?foo=bar&baz=faz').searchParams).toEqual({ foo: 'bar', baz: 'faz' })
})

test('Custom querystring parser should be called also if there is nothing to parse', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay({
    querystringParser: function (str) {
      expect(str).toBe('')
      return querystring.parse(str)
    }
  })
  findMyWay.on('GET', '/', () => {})

  expect(findMyWay.find('GET', '/').searchParams).toEqual({})
})

test('Querystring without value', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay({
    querystringParser: function (str) {
      expect(str).toBe('foo')
      return querystring.parse(str)
    }
  })
  findMyWay.on('GET', '/', () => {})
  expect(findMyWay.find('GET', '/?foo').searchParams).toEqual({ foo: '' })
})
