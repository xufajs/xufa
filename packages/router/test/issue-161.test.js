import FindMyWay from '../index.js';

test('Falling back for node\'s parametric brother without ignoreTrailingSlash', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    ignoreTrailingSlash: false,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/static/param1', () => {})
  findMyWay.on('GET', '/static/param2', () => {})
  findMyWay.on('GET', '/static/:paramA/next', () => {})

  expect(findMyWay.find('GET', '/static/param1').params).toEqual({})
  expect(findMyWay.find('GET', '/static/param2').params).toEqual({})
  expect(findMyWay.find('GET', '/static/paramOther/next').params).toEqual({ paramA: 'paramOther' })
  expect(findMyWay.find('GET', '/static/param1/next').params).toEqual({ paramA: 'param1' })
})

test('Falling back for node\'s parametric brother with ignoreTrailingSlash', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    ignoreTrailingSlash: true,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/static/param1', () => {})
  findMyWay.on('GET', '/static/param2', () => {})
  findMyWay.on('GET', '/static/:paramA/next', () => {})

  expect(findMyWay.find('GET', '/static/param1').params).toEqual({})
  expect(findMyWay.find('GET', '/static/param2').params).toEqual({})
  expect(findMyWay.find('GET', '/static/paramOther/next').params).toEqual({ paramA: 'paramOther' })
  expect(findMyWay.find('GET', '/static/param1/next').params).toEqual({ paramA: 'param1' })
})

test('Falling back for node\'s parametric brother without ignoreTrailingSlash', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    ignoreTrailingSlash: false,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/static/param1', () => {})
  findMyWay.on('GET', '/static/param2', () => {})
  findMyWay.on('GET', '/static/:paramA/next', () => {})

  findMyWay.on('GET', '/static/param1/next/param3', () => {})
  findMyWay.on('GET', '/static/param1/next/param4', () => {})
  findMyWay.on('GET', '/static/:paramA/next/:paramB/other', () => {})

  expect(findMyWay.find('GET', '/static/param1/next/param3').params).toEqual({})
  expect(findMyWay.find('GET', '/static/param1/next/param4').params).toEqual({})
  expect(findMyWay.find('GET', '/static/paramOther/next/paramOther2/other').params).toEqual({ paramA: 'paramOther', paramB: 'paramOther2' })
  expect(findMyWay.find('GET', '/static/param1/next/param3/other').params).toEqual({ paramA: 'param1', paramB: 'param3' })
})

test('Falling back for node\'s parametric brother with ignoreTrailingSlash', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    ignoreTrailingSlash: true,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/static/param1', () => {})
  findMyWay.on('GET', '/static/param2', () => {})
  findMyWay.on('GET', '/static/:paramA/next', () => {})

  findMyWay.on('GET', '/static/param1/next/param3', () => {})
  findMyWay.on('GET', '/static/param1/next/param4', () => {})
  findMyWay.on('GET', '/static/:paramA/next/:paramB/other', () => {})

  expect(findMyWay.find('GET', '/static/param1/next/param3').params).toEqual({})
  expect(findMyWay.find('GET', '/static/param1/next/param4').params).toEqual({})
  expect(findMyWay.find('GET', '/static/paramOther/next/paramOther2/other').params).toEqual({ paramA: 'paramOther', paramB: 'paramOther2' })
  expect(findMyWay.find('GET', '/static/param1/next/param3/other').params).toEqual({ paramA: 'param1', paramB: 'param3' })
})
