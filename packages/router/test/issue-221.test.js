'use strict'


const FindMyWay = require('..')

test('Should return correct param after switching from static route', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/prefix-:id', () => {})
  findMyWay.on('GET', '/prefix-111', () => {})

  expect(findMyWay.find('GET', '/prefix-1111').params).toEqual({ id: '1111' })
})

test('Should return correct param after switching from static route', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/prefix-111', () => {})
  findMyWay.on('GET', '/prefix-:id/hello', () => {})

  expect(findMyWay.find('GET', '/prefix-1111/hello').params).toEqual({ id: '1111' })
})

test('Should return correct param after switching from parametric route', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/prefix-111', () => {})
  findMyWay.on('GET', '/prefix-:id/hello', () => {})
  findMyWay.on('GET', '/:id', () => {})

  expect(findMyWay.find('GET', '/prefix-1111-hello').params).toEqual({ id: 'prefix-1111-hello' })
})

test('Should return correct params after switching from parametric route', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test/:param1/test/:param2/prefix-111', () => {})
  findMyWay.on('GET', '/test/:param1/test/:param2/prefix-:id/hello', () => {})
  findMyWay.on('GET', '/test/:param1/test/:param2/:id', () => {})

  expect(findMyWay.find('GET', '/test/value1/test/value2/prefix-1111-hello').params).toEqual({
    param1: 'value1',
    param2: 'value2',
    id: 'prefix-1111-hello'
  })
})
