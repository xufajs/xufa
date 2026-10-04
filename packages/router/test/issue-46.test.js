'use strict'


const FindMyWay = require('../')

test('If the prefixLen is higher than the pathLen we should not save the wildcard child', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.get('/static/*', () => {})

  expect(findMyWay.find('GET', '/static/').params).toEqual({ '*': '' })
  expect(findMyWay.find('GET', '/static/hello').params).toEqual({ '*': 'hello' })
  expect(findMyWay.find('GET', '/static')).toEqual(null)
})

test('If the prefixLen is higher than the pathLen we should not save the wildcard child (mixed routes)', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.get('/static/*', () => {})
  findMyWay.get('/simple', () => {})
  findMyWay.get('/simple/:bar', () => {})
  findMyWay.get('/hello', () => {})

  expect(findMyWay.find('GET', '/static/').params).toEqual({ '*': '' })
  expect(findMyWay.find('GET', '/static/hello').params).toEqual({ '*': 'hello' })
  expect(findMyWay.find('GET', '/static')).toEqual(null)
})

test('If the prefixLen is higher than the pathLen we should not save the wildcard child (with a root wildcard)', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.get('*', () => {})
  findMyWay.get('/static/*', () => {})
  findMyWay.get('/simple', () => {})
  findMyWay.get('/simple/:bar', () => {})
  findMyWay.get('/hello', () => {})

  expect(findMyWay.find('GET', '/static/').params).toEqual({ '*': '' })
  expect(findMyWay.find('GET', '/static/hello').params).toEqual({ '*': 'hello' })
  expect(findMyWay.find('GET', '/static').params).toEqual({ '*': '/static' })
})

test('If the prefixLen is higher than the pathLen we should not save the wildcard child (404)', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.get('/static/*', () => {})
  findMyWay.get('/simple', () => {})
  findMyWay.get('/simple/:bar', () => {})
  findMyWay.get('/hello', () => {})

  expect(findMyWay.find('GET', '/stati')).toEqual(null)
  expect(findMyWay.find('GET', '/staticc')).toEqual(null)
  expect(findMyWay.find('GET', '/stati/hello')).toEqual(null)
  expect(findMyWay.find('GET', '/staticc/hello')).toEqual(null)
})
