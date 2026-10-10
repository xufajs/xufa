import FindMyWay from '../index.js';

test('double colon is replaced with single colon, no parameters', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: () => expect.fail('should not be default route')
  })

  function handler (req, res, params) {
    expect(params).toEqual({})
  }

  findMyWay.on('GET', '/name::customVerb', handler)

  findMyWay.lookup({ method: 'GET', url: '/name:customVerb' }, null)
})

test('exactly one match for static route with colon', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  function handler () {}
  findMyWay.on('GET', '/name::customVerb', handler)

  expect(findMyWay.find('GET', '/name:customVerb').handler).toBe(handler)
  expect(findMyWay.find('GET', '/name:test')).toBe(null)
})

test('double colon is replaced with single colon, no parameters, same parent node name', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: () => expect.fail('should not be default route')
  })

  findMyWay.on('GET', '/name', () => {
    expect.fail('should not be parent route')
  })

  findMyWay.on('GET', '/name::customVerb', (req, res, params) => {
    expect(params).toEqual({})
  })

  findMyWay.lookup({ method: 'GET', url: '/name:customVerb', headers: {} }, null)
})

test('double colon is replaced with single colon, default route, same parent node name', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: () => expect('should be default route').toBeTruthy()
  })

  findMyWay.on('GET', '/name', () => {
    expect.fail('should not be parent route')
  })

  findMyWay.on('GET', '/name::customVerb', () => {
    expect.fail('should not be child route')
  })

  findMyWay.lookup({ method: 'GET', url: '/name:wrongCustomVerb', headers: {} }, null)
})

test('double colon is replaced with single colon, with parameters', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: () => expect.fail('should not be default route')
  })

  findMyWay.on('GET', '/name1::customVerb1/:param1/name2::customVerb2:param2', (req, res, params) => {
    expect(params).toEqual({
      param1: 'value1',
      param2: 'value2'
    })
  })

  findMyWay.lookup({ method: 'GET', url: '/name1:customVerb1/value1/name2:customVerb2value2', headers: {} }, null)
})
