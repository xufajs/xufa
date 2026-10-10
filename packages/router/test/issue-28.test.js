import FindMyWay from '../index.js';

test('wildcard (more complex test)', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '/test/*', (req, res, params) => {
    switch (params['*']) {
      case 'hello':
        expect('correct parameter').toBeTruthy()
        break
      case 'hello/world':
        expect('correct parameter').toBeTruthy()
        break
      case '':
        expect('correct parameter').toBeTruthy()
        break
      default:
        expect.fail('wrong parameter: ' + params['*'])
    }
  })

  findMyWay.lookup(
    { method: 'GET', url: '/test/hello', headers: {} },
    null
  )

  findMyWay.lookup(
    { method: 'GET', url: '/test/hello/world', headers: {} },
    null
  )

  findMyWay.lookup(
    { method: 'GET', url: '/test/', headers: {} },
    null
  )
})

test('Wildcard inside a node with a static route but different method', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '/test/hello', (req, res, params) => {
    expect(req.method).toBe('GET')
  })

  findMyWay.on('OPTIONS', '/*', (req, res, params) => {
    expect(req.method).toBe('OPTIONS')
  })

  findMyWay.lookup(
    { method: 'GET', url: '/test/hello', headers: {} },
    null
  )

  findMyWay.lookup(
    { method: 'OPTIONS', url: '/test/hello', headers: {} },
    null
  )
})

test('Wildcard inside a node with a static route but different method (more complex case)', () => {
  expect.assertions(5)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      if (req.url === '/test/helloo' && req.method === 'GET') {
        expect('Everything fine').toBeTruthy()
      } else {
        expect.fail('we should not be here, the url is: ' + req.url)
      }
    }
  })

  findMyWay.on('GET', '/test/hello', (req, res, params) => {
    expect(req.method).toBe('GET')
  })

  findMyWay.on('OPTIONS', '/*', (req, res, params) => {
    expect(req.method).toBe('OPTIONS')
  })

  findMyWay.lookup(
    { method: 'GET', url: '/test/hello', headers: {} },
    null
  )

  findMyWay.lookup(
    { method: 'GET', url: '/test/helloo', headers: {} },
    null
  )

  findMyWay.lookup(
    { method: 'OPTIONS', url: '/test/', headers: {} },
    null
  )

  findMyWay.lookup(
    { method: 'OPTIONS', url: '/test', headers: {} },
    null
  )

  findMyWay.lookup(
    { method: 'OPTIONS', url: '/test/helloo', headers: {} },
    null
  )
})

test('Wildcard edge cases', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '/test1/foo', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/test2/foo', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('OPTIONS', '/*', (req, res, params) => {
    expect(params['*']).toBe('test1/foo')
  })

  findMyWay.lookup(
    { method: 'OPTIONS', url: '/test1/foo', headers: {} },
    null
  )
})

test('Wildcard edge cases same method', () => {
  expect.assertions(2)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('OPTIONS', '/test1/foo', (req, res, params) => {
    expect(req.method).toBe('OPTIONS')
  })

  findMyWay.on('OPTIONS', '/test2/foo', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('OPTIONS', '/*', (req, res, params) => {
    expect(params['*']).toBe('test/foo')
  })

  findMyWay.lookup(
    { method: 'OPTIONS', url: '/test1/foo', headers: {} },
    null
  )

  findMyWay.lookup(
    { method: 'OPTIONS', url: '/test/foo', headers: {} },
    null
  )
})

test('Wildcard and parametric edge cases', () => {
  expect.assertions(3)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('OPTIONS', '/test1/foo', (req, res, params) => {
    expect(req.method).toBe('OPTIONS')
  })

  findMyWay.on('OPTIONS', '/test2/foo', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/:test/foo', (req, res, params) => {
    expect(params.test).toBe('example')
  })

  findMyWay.on('OPTIONS', '/*', (req, res, params) => {
    expect(params['*']).toBe('test/foo/hey')
  })

  findMyWay.lookup(
    { method: 'OPTIONS', url: '/test1/foo', headers: {} },
    null
  )

  findMyWay.lookup(
    { method: 'OPTIONS', url: '/test/foo/hey', headers: {} },
    null
  )

  findMyWay.lookup(
    { method: 'GET', url: '/example/foo', headers: {} },
    null
  )
})

test('Mixed wildcard and static with same method', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '/foo1/bar1/baz', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo1/bar2/baz', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo2/bar2/baz', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '*', (req, res, params) => {
    expect(params['*']).toBe('/foo1/bar1/kuux')
  })

  findMyWay.lookup(
    { method: 'GET', url: '/foo1/bar1/kuux', headers: {} },
    null
  )
})

test('Nested wildcards case - 1', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo1/*', (req, res, params) => {
    expect(params['*']).toBe('bar1/kuux')
  })

  findMyWay.on('GET', '/foo2/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.lookup(
    { method: 'GET', url: '/foo1/bar1/kuux', headers: {} },
    null
  )
})

test('Nested wildcards case - 2', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '/foo2/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo1/*', (req, res, params) => {
    expect(params['*']).toBe('bar1/kuux')
  })

  findMyWay.on('GET', '*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.lookup(
    { method: 'GET', url: '/foo1/bar1/kuux', headers: {} },
    null
  )
})

test('Nested wildcards with parametric and static - 1', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo1/*', (req, res, params) => {
    expect(params['*']).toBe('bar1/kuux')
  })

  findMyWay.on('GET', '/foo2/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo3/:param', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo4/param', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.lookup(
    { method: 'GET', url: '/foo1/bar1/kuux', headers: {} },
    null
  )
})

test('Nested wildcards with parametric and static - 2', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo1/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo2/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo3/:param', (req, res, params) => {
    expect(params.param).toBe('bar1')
  })

  findMyWay.on('GET', '/foo4/param', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.lookup(
    { method: 'GET', url: '/foo3/bar1', headers: {} },
    null
  )
})

test('Nested wildcards with parametric and static - 3', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo1/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo2/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo3/:param', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo4/param', (req, res, params) => {
    expect(req.url).toBe('/foo4/param')
  })

  findMyWay.lookup(
    { method: 'GET', url: '/foo4/param', headers: {} },
    null
  )
})

test('Nested wildcards with parametric and static - 4', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo1/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo2/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo3/:param', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo1/param', (req, res, params) => {
    expect(req.url).toBe('/foo1/param')
  })

  findMyWay.lookup(
    { method: 'GET', url: '/foo1/param', headers: {} },
    null
  )
})

test('Nested wildcards with parametric and static - 5', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo1/*', (req, res, params) => {
    expect(params['*']).toBe('param/hello/test/long/routee')
  })

  findMyWay.on('GET', '/foo2/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo3/:param', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo1/param/hello/test/long/route', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.lookup(
    { method: 'GET', url: '/foo1/param/hello/test/long/routee', headers: {} },
    null
  )
})

test('Nested wildcards with parametric and static - 6', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '*', (req, res, params) => {
    expect(params['*']).toBe('/foo4/param/hello/test/long/routee')
  })

  findMyWay.on('GET', '/foo1/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo2/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo3/:param', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo4/param/hello/test/long/route', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.lookup(
    { method: 'GET', url: '/foo4/param/hello/test/long/routee', headers: {} },
    null
  )
})

test('Nested wildcards with parametric and static - 7', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo1/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo2/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo3/:param', (req, res, params) => {
    expect(params.param).toBe('hello')
  })

  findMyWay.on('GET', '/foo3/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo4/example/hello/test/long/route', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.lookup(
    { method: 'GET', url: '/foo3/hello', headers: {} },
    null
  )
})

test('Nested wildcards with parametric and static - 8', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo1/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo2/*', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo3/:param', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo3/*', (req, res, params) => {
    expect(params['*']).toBe('hello/world')
  })

  findMyWay.on('GET', '/foo4/param/hello/test/long/route', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.lookup(
    { method: 'GET', url: '/foo3/hello/world', headers: {} },
    null
  )
})

test('Wildcard node with constraints', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '*', { constraints: { host: 'fastify.io' } }, (req, res, params) => {
    expect(params['*']).toBe('/foo1/foo3')
  })

  findMyWay.on('GET', '/foo1/*', { constraints: { host: 'something-else.io' } }, (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.on('GET', '/foo1/foo2', (req, res, params) => {
    expect.fail('we should not be here, the url is: ' + req.url)
  })

  findMyWay.lookup(
    { method: 'GET', url: '/foo1/foo3', headers: { host: 'fastify.io' } },
    null
  )
})

test('Wildcard must be the last character in the route', () => {
  expect.assertions(6)

  const expectedError = new Error('Wildcard must be the last character in the route')

  const findMyWay = FindMyWay()

  expect(() => findMyWay.on('GET', '*1', () => {})).toThrow(expectedError)
  expect(() => findMyWay.on('GET', '*/', () => {})).toThrow(expectedError)
  expect(() => findMyWay.on('GET', '*?', () => {})).toThrow(expectedError)

  expect(() => findMyWay.on('GET', '/foo*123', () => {})).toThrow(expectedError)
  expect(() => findMyWay.on('GET', '/foo*?', () => {})).toThrow(expectedError)
  expect(() => findMyWay.on('GET', '/foo*/', () => {})).toThrow(expectedError)
})
