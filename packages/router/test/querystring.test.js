'use strict'


const FindMyWay = require('../')

test('should sanitize the url - query', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test', (req, res, params, store, query) => {
    expect(query).toEqual({ hello: 'world' })
    expect('inside the handler').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/test?hello=world', headers: {} }, null)
})

test('should sanitize the url - hash', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test', (req, res, params, store, query) => {
    expect(query).toEqual({ hello: '' })
    expect('inside the handler').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/test#hello', headers: {} }, null)
})

test('handles path and query separated by ; with useSemicolonDelimiter enabled', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay({
    useSemicolonDelimiter: true
  })

  findMyWay.on('GET', '/test', (req, res, params, store, query) => {
    expect(query).toEqual({ jsessionid: '123456' })
    expect('inside the handler').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/test;jsessionid=123456', headers: {} }, null)
})

test('handles path and query separated by ? using ; in the path', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test;jsessionid=123456', (req, res, params, store, query) => {
    expect(query).toEqual({ foo: 'bar' })
    expect('inside the handler').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/test;jsessionid=123456?foo=bar', headers: {} }, null)
})
