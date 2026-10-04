'use strict'


const FindMyWay = require('../')

test('Parametric route, request.url contains dash', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/:param/b', (req, res, params) => {
    expect(params.param).toBe('foo-bar')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/foo-bar/b', headers: {} }, null)
})

test('Parametric route with fixed suffix', () => {
  expect.assertions(6)
  const findMyWay = FindMyWay({
    defaultRoute: () => expect.fail('Should not be defaultRoute')
  })

  findMyWay.on('GET', '/a/:param-static', () => {})
  findMyWay.on('GET', '/b/:param.static', () => {})

  expect(findMyWay.find('GET', '/a/param-static', {}).params).toEqual({ param: 'param' })
  expect(findMyWay.find('GET', '/b/param.static', {}).params).toEqual({ param: 'param' })

  expect(findMyWay.find('GET', '/a/param-param-static', {}).params).toEqual({ param: 'param-param' })
  expect(findMyWay.find('GET', '/b/param.param.static', {}).params).toEqual({ param: 'param.param' })

  expect(findMyWay.find('GET', '/a/param.param-static', {}).params).toEqual({ param: 'param.param' })
  expect(findMyWay.find('GET', '/b/param-param.static', {}).params).toEqual({ param: 'param-param' })
})

test('Regex param exceeds max parameter length', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect('route not matched').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/a/:param(^\\w{3})', (req, res, params) => {
    expect.fail('regex match')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/fool', headers: {} }, null)
})

test('Parametric route with regexp and fixed suffix / 1', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect('route not matched').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/a/:param(^\\w{3})bar', (req, res, params) => {
    expect.fail('regex match')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/$mebar', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/a/foolol', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/a/foobaz', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/a/foolbar', headers: {} }, null)
})

test('Parametric route with regexp and fixed suffix / 2', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/:param(^\\w{3})bar', (req, res, params) => {
    expect(params.param).toBe('foo')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/foobar', headers: {} }, null)
})

test('Parametric route with regexp and fixed suffix / 3', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/:param(^\\w{3}-\\w{3})foo', (req, res, params) => {
    expect(params.param).toBe('abc-def')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/abc-deffoo', headers: {} }, null)
})

test('Multi parametric route / 1', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/:p1-:p2', (req, res, params) => {
    expect(params.p1).toBe('foo')
    expect(params.p2).toBe('bar')
  })

  findMyWay.on('GET', '/b/:p1.:p2', (req, res, params) => {
    expect(params.p1).toBe('foo')
    expect(params.p2).toBe('bar')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/foo-bar', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/b/foo.bar', headers: {} }, null)
})

test('Multi parametric route / 2', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/:p1-:p2', (req, res, params) => {
    expect(params.p1).toBe('foo-bar')
    expect(params.p2).toBe('baz')
  })

  findMyWay.on('GET', '/b/:p1.:p2', (req, res, params) => {
    expect(params.p1).toBe('foo')
    expect(params.p2).toBe('bar-baz')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/foo-bar-baz', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/b/foo.bar-baz', headers: {} }, null)
})

test('Multi parametric route / 3', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/:p_1-:$p', (req, res, params) => {
    expect(params.p_1).toBe('foo')
    expect(params.$p).toBe('bar')
  })

  findMyWay.on('GET', '/b/:p_1.:$p', (req, res, params) => {
    expect(params.p_1).toBe('foo')
    expect(params.$p).toBe('bar')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/foo-bar', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/b/foo.bar', headers: {} }, null)
})

test('Multi parametric route / 4', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect('Everything good').toBeTruthy()
    }
  })

  findMyWay.on('GET', '/a/:p1-:p2', (req, res, params) => {
    expect.fail('Should not match this route')
  })

  findMyWay.on('GET', '/b/:p1.:p2', (req, res, params) => {
    expect.fail('Should not match this route')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/foo', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/b/foo', headers: {} }, null)
})

test('Multi parametric route with regexp / 1', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/at/:hour(^\\d+)h:minute(^\\d+)m', (req, res, params) => {
    expect(params.hour).toBe('0')
    expect(params.minute).toBe('42')
  })

  findMyWay.lookup({ method: 'GET', url: '/at/0h42m', headers: {} }, null)
})

test('Multi parametric route with colon separator', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/:param(.*)::suffix', (req, res, params) => {
    expect(params.param).toBe('foo')
  })

  findMyWay.on('GET', '/:param1(.*)::suffix1-:param2(.*)::suffix2/static', (req, res, params) => {
    expect(params.param1).toBe('foo')
    expect(params.param2).toBe('bar')
  })

  findMyWay.lookup({ method: 'GET', url: '/foo:suffix', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/foo:suffix1-bar:suffix2/static', headers: {} }, null)
})

test('Multi parametric route with regexp / 2', () => {
  expect.assertions(8)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/:uuid(^[\\d-]{19})-:user(^\\w+)', (req, res, params) => {
    expect(params.uuid).toBe('1111-2222-3333-4444')
    expect(params.user).toBe('foo')
  })

  findMyWay.on('GET', '/a/:uuid(^[\\d-]{19})-:user(^\\w+)/account', (req, res, params) => {
    expect(params.uuid).toBe('1111-2222-3333-4445')
    expect(params.user).toBe('bar')
  })

  findMyWay.on('GET', '/b/:uuid(^[\\d-]{19}).:user(^\\w+)', (req, res, params) => {
    expect(params.uuid).toBe('1111-2222-3333-4444')
    expect(params.user).toBe('foo')
  })

  findMyWay.on('GET', '/b/:uuid(^[\\d-]{19}).:user(^\\w+)/account', (req, res, params) => {
    expect(params.uuid).toBe('1111-2222-3333-4445')
    expect(params.user).toBe('bar')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/1111-2222-3333-4444-foo', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/a/1111-2222-3333-4445-bar/account', headers: {} }, null)

  findMyWay.lookup({ method: 'GET', url: '/b/1111-2222-3333-4444.foo', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/b/1111-2222-3333-4445.bar/account', headers: {} }, null)
})

test('Multi parametric route with fixed suffix', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/:p1-:p2-baz', (req, res, params) => {
    expect(params.p1).toBe('foo')
    expect(params.p2).toBe('bar')
  })

  findMyWay.on('GET', '/b/:p1.:p2-baz', (req, res, params) => {
    expect(params.p1).toBe('foo')
    expect(params.p2).toBe('bar')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/foo-bar-baz', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/b/foo.bar-baz', headers: {} }, null)
})

test('Multi parametric route with regexp and fixed suffix', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/:p1(^\\w+)-:p2(^\\w+)-kuux', (req, res, params) => {
    expect(params.p1).toBe('foo')
    expect(params.p2).toBe('barbaz')
  })

  findMyWay.on('GET', '/b/:p1(^\\w+).:p2(^\\w+)-kuux', (req, res, params) => {
    expect(params.p1).toBe('foo')
    expect(params.p2).toBe('barbaz')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/foo-barbaz-kuux', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/b/foo.barbaz-kuux', headers: {} }, null)
})

test('Multi parametric route with wildcard', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/:p1-:p2/*', (req, res, params) => {
    expect(params.p1).toBe('foo')
    expect(params.p2).toBe('bar')
  })

  findMyWay.on('GET', '/b/:p1.:p2/*', (req, res, params) => {
    expect(params.p1).toBe('foo')
    expect(params.p2).toBe('bar')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/foo-bar/baz', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/b/foo.bar/baz', headers: {} }, null)
})

test('Nested multi parametric route', () => {
  expect.assertions(6)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/:p1-:p2/b/:p3', (req, res, params) => {
    expect(params.p1).toBe('foo')
    expect(params.p2).toBe('bar')
    expect(params.p3).toBe('baz')
  })

  findMyWay.on('GET', '/b/:p1.:p2/b/:p3', (req, res, params) => {
    expect(params.p1).toBe('foo')
    expect(params.p2).toBe('bar')
    expect(params.p3).toBe('baz')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/foo-bar/b/baz', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/b/foo.bar/b/baz', headers: {} }, null)
})

test('Nested multi parametric route with regexp / 1', () => {
  expect.assertions(6)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/:p1(^\\w{3})-:p2(^\\d+)/b/:p3', (req, res, params) => {
    expect(params.p1).toBe('foo')
    expect(params.p2).toBe('42')
    expect(params.p3).toBe('bar')
  })

  findMyWay.on('GET', '/b/:p1(^\\w{3}).:p2(^\\d+)/b/:p3', (req, res, params) => {
    expect(params.p1).toBe('foo')
    expect(params.p2).toBe('42')
    expect(params.p3).toBe('bar')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/foo-42/b/bar', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/b/foo.42/b/bar', headers: {} }, null)
})

test('Nested multi parametric route with regexp / 2', () => {
  expect.assertions(6)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/:p1(^\\w{3})-:p2/b/:p3', (req, res, params) => {
    expect(params.p1).toBe('foo')
    expect(params.p2).toBe('42')
    expect(params.p3).toBe('bar')
  })

  findMyWay.on('GET', '/b/:p1(^\\w{3}).:p2/b/:p3', (req, res, params) => {
    expect(params.p1).toBe('foo')
    expect(params.p2).toBe('42')
    expect(params.p3).toBe('bar')
  })

  findMyWay.lookup({ method: 'GET', url: '/a/foo-42/b/bar', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/b/foo.42/b/bar', headers: {} }, null)
})
