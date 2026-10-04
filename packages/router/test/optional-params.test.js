'use strict'


const FindMyWay = require('../')

test('Test route with optional parameter', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/:param/b/:optional?', (req, res, params) => {
    if (params.optional) {
      expect(params.optional).toBe('foo')
    } else {
      expect(params.optional).toBe(undefined)
    }
  })

  findMyWay.lookup({ method: 'GET', url: '/a/foo-bar/b', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/a/foo-bar/b/foo', headers: {} }, null)
})

test('Test for duplicate route with optional param', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/foo/:bar?', (req, res, params) => {})

  try {
    findMyWay.on('GET', '/foo', (req, res, params) => {})
    expect.fail('method is already declared for route with optional param')
  } catch (e) {
    expect(e.message).toBe('Method \'GET\' already declared for route \'/foo\' with constraints \'{}\'')
  }
})

test('Test for param with ? not at the end', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  try {
    findMyWay.on('GET', '/foo/:bar?/baz', (req, res, params) => {})
    expect.fail('Optional Param in the middle of the path is not allowed')
  } catch (e) {
    expect(e.message).toBe('Optional Parameter needs to be the last parameter of the path')
  }
})

test('Multi parametric route with optional param', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/:p1-:p2?', (req, res, params) => {
    if (params.p1 && params.p2) {
      expect(params.p1).toBe('foo-bar')
      expect(params.p2).toBe('baz')
    }
  })

  findMyWay.lookup({ method: 'GET', url: '/a/foo-bar-baz', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/a', headers: {} }, null)
})

test('Optional Parameter with ignoreTrailingSlash = true', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    ignoreTrailingSlash: true,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/test/hello/:optional?', (req, res, params) => {
    if (params.optional) {
      expect(params.optional).toBe('foo')
    } else {
      expect(params.optional).toBe(undefined)
    }
  })

  findMyWay.lookup({ method: 'GET', url: '/test/hello/', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test/hello', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test/hello/foo', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test/hello/foo/', headers: {} }, null)
})

test('Optional Parameter with ignoreTrailingSlash = false', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    ignoreTrailingSlash: false,
    defaultRoute: (req, res) => {
      expect(req.url).toBe('/test/hello/foo/')
    }
  })

  findMyWay.on('GET', '/test/hello/:optional?', (req, res, params) => {
    if (req.url === '/test/hello/') {
      expect(params).toEqual({ optional: '' })
    } else if (req.url === '/test/hello') {
      expect(params).toEqual({})
    } else if (req.url === '/test/hello/foo') {
      expect(params).toEqual({ optional: 'foo' })
    }
  })

  findMyWay.lookup({ method: 'GET', url: '/test/hello/', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test/hello', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test/hello/foo', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test/hello/foo/', headers: {} }, null)
})

test('Optional Parameter with ignoreDuplicateSlashes = true', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    ignoreDuplicateSlashes: true,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/test/hello/:optional?', (req, res, params) => {
    if (params.optional) {
      expect(params.optional).toBe('foo')
    } else {
      expect(params.optional).toBe(undefined)
    }
  })

  findMyWay.lookup({ method: 'GET', url: '/test//hello', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test/hello', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test/hello/foo', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test//hello//foo', headers: {} }, null)
})

test('Optional Parameter with ignoreDuplicateSlashes = false', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    ignoreDuplicateSlashes: false,
    defaultRoute: (req, res) => {
      if (req.url === '/test//hello') {
        expect(req.params).toEqual(undefined)
      } else if (req.url === '/test//hello/foo') {
        expect(req.params).toEqual(undefined)
      }
    }
  })

  findMyWay.on('GET', '/test/hello/:optional?', (req, res, params) => {
    if (req.url === '/test/hello/') {
      expect(params).toEqual({ optional: '' })
    } else if (req.url === '/test/hello') {
      expect(params).toEqual({})
    } else if (req.url === '/test/hello/foo') {
      expect(params).toEqual({ optional: 'foo' })
    }
  })

  findMyWay.lookup({ method: 'GET', url: '/test//hello', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test/hello', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test/hello/foo', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test//hello/foo', headers: {} }, null)
})

test('deregister a route with optional param', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/:param/b/:optional?', (req, res, params) => {})

  expect(findMyWay.find('GET', '/a/:param/b')).toBeTruthy()
  expect(findMyWay.find('GET', '/a/:param/b/:optional')).toBeTruthy()

  findMyWay.off('GET', '/a/:param/b/:optional?')

  expect(findMyWay.find('GET', '/a/:param/b')).toBeFalsy()
  expect(findMyWay.find('GET', '/a/:param/b/:optional')).toBeFalsy()
})

test('optional parameter on root', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/:optional?', (req, res, params) => {
    if (params.optional) {
      expect(params.optional).toBe('foo')
    } else {
      expect(params.optional).toBe(undefined)
    }
  })

  findMyWay.lookup({ method: 'GET', url: '/', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/foo', headers: {} }, null)
})

test('off should remove root optional param route', () => {
  const findMyWay = FindMyWay()
  const noop = () => {}

  findMyWay.on('GET', '/:id?', noop)

  expect(findMyWay.find('GET', '/')).not.toBe(null)
  expect(findMyWay.find('GET', '/123')).not.toBe(null)

  findMyWay.off('GET', '/:id?')

  expect(findMyWay.find('GET', '/')).toBe(null)
  expect(findMyWay.find('GET', '/123')).toBe(null)
})
