'use strict'


const FindMyWay = require('../')

test('the router is an object with methods', () => {
  expect.assertions(4)

  const findMyWay = FindMyWay()

  expect(typeof findMyWay.on).toBe('function')
  expect(typeof findMyWay.off).toBe('function')
  expect(typeof findMyWay.lookup).toBe('function')
  expect(typeof findMyWay.find).toBe('function')
})

test('on throws for invalid method', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  expect(() => {
    findMyWay.on('INVALID', '/a/b')
  }).toThrow()
})

test('on throws for invalid path', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay()

  // Non string
  expect(() => {
    findMyWay.on('GET', 1)
  }).toThrow()

  // Empty
  expect(() => {
    findMyWay.on('GET', '')
  }).toThrow()

  // Doesn't start with / or *
  expect(() => {
    findMyWay.on('GET', 'invalid')
  }).toThrow()
})

test('register a route', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test', () => {
    expect('inside the handler').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/test', headers: {} }, null)
})

test('register a route with multiple methods', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on(['GET', 'POST'], '/test', () => {
    expect('inside the handler').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/test', headers: {} }, null)
  findMyWay.lookup({ method: 'POST', url: '/test', headers: {} }, null)
})

test('does not register /test/*/ when ignoreTrailingSlash is true', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    ignoreTrailingSlash: true
  })

  findMyWay.on('GET', '/test/*', () => {})
  expect(findMyWay.routes.filter((r) => r.path.includes('/test')).length).toBe(1)
})

test('off throws for invalid method', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  expect(() => {
    findMyWay.off('INVALID', '/a/b')
  }).toThrow()
})

test('off throws for invalid path', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay()

  // Non string
  expect(() => {
    findMyWay.off('GET', 1)
  }).toThrow()

  // Empty
  expect(() => {
    findMyWay.off('GET', '')
  }).toThrow()

  // Doesn't start with / or *
  expect(() => {
    findMyWay.off('GET', 'invalid')
  }).toThrow()
})

test('off with nested wildcards with parametric and static', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '*', (req, res, params) => {
    expect(params['*']).toBe('/foo2/first/second')
  })
  findMyWay.on('GET', '/foo1/*', () => {})
  findMyWay.on('GET', '/foo2/*', () => {})
  findMyWay.on('GET', '/foo3/:param', () => {})
  findMyWay.on('GET', '/foo3/*', () => {})
  findMyWay.on('GET', '/foo4/param/hello/test/long/route', () => {})

  const route1 = findMyWay.find('GET', '/foo3/first/second')
  expect(route1.params['*']).toBe('first/second')

  findMyWay.off('GET', '/foo3/*')

  const route2 = findMyWay.find('GET', '/foo3/first/second')
  expect(route2.params['*']).toBe('/foo3/first/second')

  findMyWay.off('GET', '/foo2/*')
  findMyWay.lookup(
    { method: 'GET', url: '/foo2/first/second', headers: {} },
    null
  )
})

test('off removes all routes when ignoreTrailingSlash is true', () => {
  expect.assertions(6)
  const findMyWay = FindMyWay({
    ignoreTrailingSlash: true
  })

  findMyWay.on('GET', '/test1/', () => {})
  expect(findMyWay.routes.length).toBe(1)

  findMyWay.on('GET', '/test2', () => {})
  expect(findMyWay.routes.length).toBe(2)

  findMyWay.off('GET', '/test1')
  expect(findMyWay.routes.length).toBe(1)
  expect(findMyWay.routes.filter((r) => r.path === '/test2').length).toBe(1)
  expect(findMyWay.routes.filter((r) => r.path === '/test2/').length).toBe(0)

  findMyWay.off('GET', '/test2/')
  expect(findMyWay.routes.length).toBe(0)
})

test('off removes all routes when ignoreDuplicateSlashes is true', () => {
  expect.assertions(6)
  const findMyWay = FindMyWay({
    ignoreDuplicateSlashes: true
  })

  findMyWay.on('GET', '//test1', () => {})
  expect(findMyWay.routes.length).toBe(1)

  findMyWay.on('GET', '/test2', () => {})
  expect(findMyWay.routes.length).toBe(2)

  findMyWay.off('GET', '/test1')
  expect(findMyWay.routes.length).toBe(1)
  expect(findMyWay.routes.filter((r) => r.path === '/test2').length).toBe(1)
  expect(findMyWay.routes.filter((r) => r.path === '//test2').length).toBe(0)

  findMyWay.off('GET', '//test2')
  expect(findMyWay.routes.length).toBe(0)
})

test('deregister a route without children', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/a', () => {})
  findMyWay.on('GET', '/a/b', () => {})
  findMyWay.off('GET', '/a/b')

  expect(findMyWay.find('GET', '/a')).toBeTruthy()
  expect(findMyWay.find('GET', '/a/b')).toBeFalsy()
})

test('deregister a route with children', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/a', () => {})
  findMyWay.on('GET', '/a/b', () => {})
  findMyWay.off('GET', '/a')

  expect(findMyWay.find('GET', '/a')).toBeFalsy()
  expect(findMyWay.find('GET', '/a/b')).toBeTruthy()
})

test('deregister a route by method', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on(['GET', 'POST'], '/a', () => {})
  findMyWay.off('GET', '/a')

  expect(findMyWay.find('GET', '/a')).toBeFalsy()
  expect(findMyWay.find('POST', '/a')).toBeTruthy()
})

test('deregister a route with multiple methods', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on(['GET', 'POST'], '/a', () => {})
  findMyWay.off(['GET', 'POST'], '/a')

  expect(findMyWay.find('GET', '/a')).toBeFalsy()
  expect(findMyWay.find('POST', '/a')).toBeFalsy()
})

test('reset a router', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on(['GET', 'POST'], '/a', () => {})
  findMyWay.reset()

  expect(findMyWay.find('GET', '/a')).toBeFalsy()
  expect(findMyWay.find('POST', '/a')).toBeFalsy()
})

test('default route', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    defaultRoute: () => {
      expect('inside the default route').toBeTruthy()
    }
  })

  findMyWay.lookup({ method: 'GET', url: '/test', headers: {} }, null)
})

test('parametric route', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test/:id', (req, res, params) => {
    expect(params.id).toBe('hello')
  })

  findMyWay.lookup({ method: 'GET', url: '/test/hello', headers: {} }, null)
})

test('multiple parametric route', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test/:id', (req, res, params) => {
    expect(params.id).toBe('hello')
  })

  findMyWay.on('GET', '/other-test/:id', (req, res, params) => {
    expect(params.id).toBe('world')
  })

  findMyWay.lookup({ method: 'GET', url: '/test/hello', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/other-test/world', headers: {} }, null)
})

test('multiple parametric route with the same prefix', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test/:id', (req, res, params) => {
    expect(params.id).toBe('hello')
  })

  findMyWay.on('GET', '/test/:id/world', (req, res, params) => {
    expect(params.id).toBe('world')
  })

  findMyWay.lookup({ method: 'GET', url: '/test/hello', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test/world/world', headers: {} }, null)
})

test('nested parametric route', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test/:hello/test/:world', (req, res, params) => {
    expect(params.hello).toBe('hello')
    expect(params.world).toBe('world')
  })

  findMyWay.lookup({ method: 'GET', url: '/test/hello/test/world', headers: {} }, null)
})

test('nested parametric route with same prefix', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test', (req, res, params) => {
    expect('inside route').toBeTruthy()
  })

  findMyWay.on('GET', '/test/:hello/test/:world', (req, res, params) => {
    expect(params.hello).toBe('hello')
    expect(params.world).toBe('world')
  })

  findMyWay.lookup({ method: 'GET', url: '/test', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test/hello/test/world', headers: {} }, null)
})

test('long route', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/abc/def/ghi/lmn/opq/rst/uvz', (req, res, params) => {
    expect('inside long path').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/abc/def/ghi/lmn/opq/rst/uvz', headers: {} }, null)
})

test('long parametric route', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/abc/:def/ghi/:lmn/opq/:rst/uvz', (req, res, params) => {
    expect(params.def).toBe('def')
    expect(params.lmn).toBe('lmn')
    expect(params.rst).toBe('rst')
  })

  findMyWay.lookup({ method: 'GET', url: '/abc/def/ghi/lmn/opq/rst/uvz', headers: {} }, null)
})

test('long parametric route with common prefix', () => {
  expect.assertions(9)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', (req, res, params) => {
    throw new Error('I shoul not be here')
  })

  findMyWay.on('GET', '/abc', (req, res, params) => {
    throw new Error('I shoul not be here')
  })

  findMyWay.on('GET', '/abc/:def', (req, res, params) => {
    expect(params.def).toBe('def')
  })

  findMyWay.on('GET', '/abc/:def/ghi/:lmn', (req, res, params) => {
    expect(params.def).toBe('def')
    expect(params.lmn).toBe('lmn')
  })

  findMyWay.on('GET', '/abc/:def/ghi/:lmn/opq/:rst', (req, res, params) => {
    expect(params.def).toBe('def')
    expect(params.lmn).toBe('lmn')
    expect(params.rst).toBe('rst')
  })

  findMyWay.on('GET', '/abc/:def/ghi/:lmn/opq/:rst/uvz', (req, res, params) => {
    expect(params.def).toBe('def')
    expect(params.lmn).toBe('lmn')
    expect(params.rst).toBe('rst')
  })

  findMyWay.lookup({ method: 'GET', url: '/abc/def', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/abc/def/ghi/lmn', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/abc/def/ghi/lmn/opq/rst', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/abc/def/ghi/lmn/opq/rst/uvz', headers: {} }, null)
})

test('common prefix', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/f', (req, res, params) => {
    expect('inside route').toBeTruthy()
  })

  findMyWay.on('GET', '/ff', (req, res, params) => {
    expect('inside route').toBeTruthy()
  })

  findMyWay.on('GET', '/ffa', (req, res, params) => {
    expect('inside route').toBeTruthy()
  })

  findMyWay.on('GET', '/ffb', (req, res, params) => {
    expect('inside route').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/f', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/ff', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/ffa', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/ffb', headers: {} }, null)
})

test('wildcard', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test/*', (req, res, params) => {
    expect(params['*']).toBe('hello')
  })

  findMyWay.lookup(
    { method: 'GET', url: '/test/hello', headers: {} },
    null
  )
})

test('catch all wildcard', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '*', (req, res, params) => {
    expect(params['*']).toBe('/test/hello')
  })

  findMyWay.lookup(
    { method: 'GET', url: '/test/hello', headers: {} },
    null
  )
})

test('find should return the route', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()
  const fn = () => {}

  findMyWay.on('GET', '/test', fn)

  expect(findMyWay.find('GET', '/test')).toEqual({ handler: fn, params: {}, store: null, searchParams: {} })
})

test('find should return the route with params', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()
  const fn = () => {}

  findMyWay.on('GET', '/test/:id', fn)

  expect(findMyWay.find('GET', '/test/hello')).toEqual({ handler: fn, params: { id: 'hello' }, store: null, searchParams: {} })
})

test('find should return a null handler if the route does not exist', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  expect(findMyWay.find('GET', '/test')).toEqual(null)
})

test('should decode the uri - parametric', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()
  const fn = () => {}

  findMyWay.on('GET', '/test/:id', fn)

  expect(findMyWay.find('GET', '/test/he%2Fllo')).toEqual({ handler: fn, params: { id: 'he/llo' }, store: null, searchParams: {} })
})

test('should decode the uri - wildcard', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()
  const fn = () => {}

  findMyWay.on('GET', '/test/*', fn)

  expect(findMyWay.find('GET', '/test/he%2Fllo')).toEqual({ handler: fn, params: { '*': 'he/llo' }, store: null, searchParams: {} })
})

test('safe decodeURIComponent', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()
  const fn = () => {}

  findMyWay.on('GET', '/test/:id', fn)

  expect(findMyWay.find('GET', '/test/hel%"Flo')).toEqual(null)
})

test('safe decodeURIComponent - nested route', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()
  const fn = () => {}

  findMyWay.on('GET', '/test/hello/world/:id/blah', fn)

  expect(findMyWay.find('GET', '/test/hello/world/hel%"Flo/blah')).toEqual(null)
})

test('safe decodeURIComponent - wildcard', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()
  const fn = () => {}

  findMyWay.on('GET', '/test/*', fn)

  expect(findMyWay.find('GET', '/test/hel%"Flo')).toEqual(null)
})

test('static routes should be inserted before parametric / 1', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test/hello', () => {
    expect('inside correct handler').toBeTruthy()
  })

  findMyWay.on('GET', '/test/:id', () => {
    expect.fail('wrong handler')
  })

  findMyWay.lookup({ method: 'GET', url: '/test/hello', headers: {} }, null)
})

test('static routes should be inserted before parametric / 2', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test/:id', () => {
    expect.fail('wrong handler')
  })

  findMyWay.on('GET', '/test/hello', () => {
    expect('inside correct handler').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/test/hello', headers: {} }, null)
})

test('static routes should be inserted before parametric / 3', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/:id', () => {
    expect.fail('wrong handler')
  })

  findMyWay.on('GET', '/test', () => {
    expect('inside correct handler').toBeTruthy()
  })

  findMyWay.on('GET', '/test/:id', () => {
    expect.fail('wrong handler')
  })

  findMyWay.on('GET', '/test/hello', () => {
    expect('inside correct handler').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/test', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test/hello', headers: {} }, null)
})

test('static routes should be inserted before parametric / 4', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/:id', () => {
    expect('inside correct handler').toBeTruthy()
  })

  findMyWay.on('GET', '/test', () => {
    expect.fail('wrong handler')
  })

  findMyWay.on('GET', '/test/:id', () => {
    expect('inside correct handler').toBeTruthy()
  })

  findMyWay.on('GET', '/test/hello', () => {
    expect.fail('wrong handler')
  })

  findMyWay.lookup({ method: 'GET', url: '/test/id', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/id', headers: {} }, null)
})

test('Static parametric with shared part of the path', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect(req.url).toBe('/example/shared/nested/oopss')
    }
  })

  findMyWay.on('GET', '/example/shared/nested/test', (req, res, params) => {
    expect.fail('We should not be here')
  })

  findMyWay.on('GET', '/example/:param/nested/oops', (req, res, params) => {
    expect(params.param).toBe('other')
  })

  findMyWay.lookup({ method: 'GET', url: '/example/shared/nested/oopss', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/example/other/nested/oops', headers: {} }, null)
})

test('parametric route with different method', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test/:id', (req, res, params) => {
    expect(params.id).toBe('hello')
  })

  findMyWay.on('POST', '/test/:other', (req, res, params) => {
    expect(params.other).toBe('world')
  })

  findMyWay.lookup({ method: 'GET', url: '/test/hello', headers: {} }, null)
  findMyWay.lookup({ method: 'POST', url: '/test/world', headers: {} }, null)
})

test('params does not keep the object reference', (done) => {
  expect.assertions(2)
  const findMyWay = FindMyWay()
  let first = true

  findMyWay.on('GET', '/test/:id', (req, res, params) => {
    if (first) {
      setTimeout(() => {
        expect(params.id).toBe('hello')
      }, 10)
    } else {
      setTimeout(() => {
        expect(params.id).toBe('world')
        done()
      }, 10)
    }
    first = false
  })

  findMyWay.lookup({ method: 'GET', url: '/test/hello', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/test/world', headers: {} }, null)
})

test('Unsupported method (static)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect('Everything ok').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/', (req, res, params) => {
    expect.fail('We should not be here')
  })

  findMyWay.lookup({ method: 'TROLL', url: '/', headers: {} }, null)
})

test('Unsupported method (wildcard)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect('Everything ok').toBeTruthy()
    }
  })

  findMyWay.on('GET', '*', (req, res, params) => {
    expect.fail('We should not be here')
  })

  findMyWay.lookup({ method: 'TROLL', url: '/hello/world', headers: {} }, null)
})

test('Unsupported method (static find)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', () => {})

  expect(findMyWay.find('TROLL', '/')).toEqual(null)
})

test('Unsupported method (wildcard find)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '*', () => {})

  expect(findMyWay.find('TROLL', '/hello/world')).toEqual(null)
})

test('Unsupported method (constructor lookup)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect(req.method).toBe('constructor')
    }
  })

  findMyWay.on('GET', '/', () => {
    expect.fail('We should not be here')
  })

  findMyWay.lookup({ method: 'constructor', url: '/', headers: {} }, null)
})

test('Unsupported method (constructor find)', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', () => {})

  expect(findMyWay.find('constructor', '/')).toEqual(null)
})

test('register all known HTTP methods', () => {
  expect.assertions(6)
  const findMyWay = FindMyWay()

  const httpMethods = require('..').httpMethods
  const handlers = {}
  for (const i in httpMethods) {
    const m = httpMethods[i]
    handlers[m] = function myHandler () {}
    findMyWay.on(m, '/test', handlers[m])
  }

  expect(findMyWay.find('COPY', '/test')).toBeTruthy()
  expect(findMyWay.find('COPY', '/test').handler).toBe(handlers.COPY)

  expect(findMyWay.find('SUBSCRIBE', '/test')).toBeTruthy()
  expect(findMyWay.find('SUBSCRIBE', '/test').handler).toBe(handlers.SUBSCRIBE)

  expect(findMyWay.find('M-SEARCH', '/test')).toBeTruthy()
  expect(findMyWay.find('M-SEARCH', '/test').handler).toBe(handlers['M-SEARCH'])
})

test('off removes all routes without checking constraints if no constraints are specified', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test', {}, (req, res) => {})
  findMyWay.on('GET', '/test', { constraints: { host: 'example.com' } }, (req, res) => {})

  findMyWay.off('GET', '/test')

  expect(findMyWay.routes.length).toBe(0)
})

test('off removes only constrainted routes if constraints are specified', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test', {}, (req, res) => {})
  findMyWay.on('GET', '/test', { constraints: { host: 'example.com' } }, (req, res) => {})

  findMyWay.off('GET', '/test', { host: 'example.com' })

  expect(findMyWay.routes.length).toBe(1)
  expect(findMyWay.routes[0].opts.constraints).toBeFalsy()
})

test('off removes no routes if provided constraints does not match any registered route', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test', {}, (req, res) => {})
  findMyWay.on('GET', '/test', { constraints: { version: '2.x' } }, (req, res) => {})
  findMyWay.on('GET', '/test', { constraints: { version: '3.x' } }, (req, res) => {})

  findMyWay.off('GET', '/test', { version: '1.x' })

  expect(findMyWay.routes.length).toBe(3)
})

test('off validates that constraints is an object or undefined', () => {
  expect.assertions(6)

  const findMyWay = FindMyWay()

  expect(() => findMyWay.off('GET', '/', 2)).toThrow()
  expect(() => findMyWay.off('GET', '/', 'should throw')).toThrow()
  expect(() => findMyWay.off('GET', '/', [])).toThrow()
  expect(() => findMyWay.off('GET', '/', undefined)).not.toThrow()
  expect(() => findMyWay.off('GET', '/', {})).not.toThrow()
  expect(() => findMyWay.off('GET', '/')).not.toThrow()
})

test('off removes only unconstrainted route if an empty object is given as constraints', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay()

  findMyWay.get('/', {}, () => {})
  findMyWay.get('/', { constraints: { host: 'fastify.io' } }, () => {})

  findMyWay.off('GET', '/', {})

  expect(findMyWay.routes.length).toBe(1)
  expect(findMyWay.routes[0].opts.constraints.host).toBe('fastify.io')
})
