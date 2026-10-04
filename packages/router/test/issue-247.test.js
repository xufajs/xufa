'use strict'


const FindMyWay = require('..')

test('If there are constraints param, router.off method support filter', () => {
  expect.assertions(12)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/a', { constraints: { host: '1' } }, () => {}, { name: 1 })
  findMyWay.on('GET', '/a', { constraints: { host: '2', version: '1.0.0' } }, () => {}, { name: 2 })
  findMyWay.on('GET', '/a', { constraints: { host: '2', version: '2.0.0' } }, () => {}, { name: 3 })

  expect(findMyWay.find('GET', '/a', { host: '1' }).store).toEqual({ name: 1 })
  expect(findMyWay.find('GET', '/a', { host: '2', version: '1.0.0' }).store).toEqual({ name: 2 })
  expect(findMyWay.find('GET', '/a', { host: '2', version: '2.0.0' }).store).toEqual({ name: 3 })

  findMyWay.off('GET', '/a', { host: '1' })

  expect(findMyWay.find('GET', '/a', { host: '1' })).toEqual(null)
  expect(findMyWay.find('GET', '/a', { host: '2', version: '1.0.0' }).store).toEqual({ name: 2 })
  expect(findMyWay.find('GET', '/a', { host: '2', version: '2.0.0' }).store).toEqual({ name: 3 })

  findMyWay.off('GET', '/a', { host: '2', version: '1.0.0' })

  expect(findMyWay.find('GET', '/a', { host: '1' })).toEqual(null)
  expect(findMyWay.find('GET', '/a', { host: '2', version: '1.0.0' })).toEqual(null)
  expect(findMyWay.find('GET', '/a', { host: '2', version: '2.0.0' }).store).toEqual({ name: 3 })

  findMyWay.off('GET', '/a', { host: '2', version: '2.0.0' })

  expect(findMyWay.find('GET', '/a', { host: '1' })).toEqual(null)
  expect(findMyWay.find('GET', '/a', { host: '2', version: '1.0.0' })).toEqual(null)
  expect(findMyWay.find('GET', '/a', { host: '2', version: '2.0.0' })).toEqual(null)
})

test('If there are no constraints param, router.off method remove all matched router', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/a', { constraints: { host: '1' } }, () => {}, { name: 1 })
  findMyWay.on('GET', '/a', { constraints: { host: '2' } }, () => {}, { name: 2 })

  expect(findMyWay.find('GET', '/a', { host: '1' }).store).toEqual({ name: 1 })
  expect(findMyWay.find('GET', '/a', { host: '2' }).store).toEqual({ name: 2 })

  findMyWay.off('GET', '/a')

  expect(findMyWay.find('GET', '/a', { host: '1' })).toEqual(null)
  expect(findMyWay.find('GET', '/a', { host: '2' })).toEqual(null)
})
