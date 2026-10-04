'use strict'


const FindMyWay = require('../')

test('case insensitive static routes of level 1', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    caseSensitive: false,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/woo', (req, res, params) => {
    expect('we should be here').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/WOO', headers: {} }, null)
})

test('case insensitive static routes of level 2', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    caseSensitive: false,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/foo/woo', (req, res, params) => {
    expect('we should be here').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/FoO/WOO', headers: {} }, null)
})

test('case insensitive static routes of level 3', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    caseSensitive: false,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/foo/bar/woo', (req, res, params) => {
    expect('we should be here').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/Foo/bAR/WoO', headers: {} }, null)
})

test('parametric case insensitive', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    caseSensitive: false,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/foo/:param', (req, res, params) => {
    expect(params.param).toBe('bAR')
  })

  findMyWay.lookup({ method: 'GET', url: '/Foo/bAR', headers: {} }, null)
})

test('parametric case insensitive with a static part', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    caseSensitive: false,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/foo/my-:param', (req, res, params) => {
    expect(params.param).toBe('bAR')
  })

  findMyWay.lookup({ method: 'GET', url: '/Foo/MY-bAR', headers: {} }, null)
})

test('parametric case insensitive with capital letter', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    caseSensitive: false,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/foo/:Param', (req, res, params) => {
    expect(params.Param).toBe('bAR')
  })

  findMyWay.lookup({ method: 'GET', url: '/Foo/bAR', headers: {} }, null)
})

test('case insensitive with capital letter in static path with param', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    caseSensitive: false,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/Foo/bar/:param', (req, res, params) => {
    expect(params.param).toBe('baZ')
  })

  findMyWay.lookup({ method: 'GET', url: '/foo/bar/baZ', headers: {} }, null)
})

test('case insensitive with multiple paths containing capital letter in static path with param', () => {
  /*
   * This is a reproduction of the issue documented at
   * https://github.com/delvedor/find-my-way/issues/96.
   */
  expect.assertions(2)

  const findMyWay = FindMyWay({
    caseSensitive: false,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/Foo/bar/:param', (req, res, params) => {
    expect(params.param).toBe('baZ')
  })

  findMyWay.on('GET', '/Foo/baz/:param', (req, res, params) => {
    expect(params.param).toBe('baR')
  })

  findMyWay.lookup({ method: 'GET', url: '/foo/bar/baZ', headers: {} }, null)
  findMyWay.lookup({ method: 'GET', url: '/foo/baz/baR', headers: {} }, null)
})

test('case insensitive with multiple mixed-case params within same slash couple', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay({
    caseSensitive: false,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/foo/:param1-:param2', (req, res, params) => {
    expect(params.param1).toBe('My')
    expect(params.param2).toBe('bAR')
  })

  findMyWay.lookup({ method: 'GET', url: '/FOO/My-bAR', headers: {} }, null)
})

test('case insensitive with multiple mixed-case params', () => {
  expect.assertions(2)

  const findMyWay = FindMyWay({
    caseSensitive: false,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/foo/:param1/:param2', (req, res, params) => {
    expect(params.param1).toBe('My')
    expect(params.param2).toBe('bAR')
  })

  findMyWay.lookup({ method: 'GET', url: '/FOO/My/bAR', headers: {} }, null)
})

test('case insensitive with wildcard', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    caseSensitive: false,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/foo/*', (req, res, params) => {
    expect(params['*']).toBe('baR')
  })

  findMyWay.lookup({ method: 'GET', url: '/FOO/baR', headers: {} }, null)
})

test('parametric case insensitive with multiple routes', () => {
  expect.assertions(6)

  const findMyWay = FindMyWay({
    caseSensitive: false,
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('POST', '/foo/:param/Static/:userId/Save', (req, res, params) => {
    expect(params.param).toBe('bAR')
    expect(params.userId).toBe('one')
  })
  findMyWay.on('POST', '/foo/:param/Static/:userId/Update', (req, res, params) => {
    expect(params.param).toBe('Bar')
    expect(params.userId).toBe('two')
  })
  findMyWay.on('POST', '/foo/:param/Static/:userId/CANCEL', (req, res, params) => {
    expect(params.param).toBe('bAR')
    expect(params.userId).toBe('THREE')
  })

  findMyWay.lookup({ method: 'POST', url: '/foo/bAR/static/one/SAVE', headers: {} }, null)
  findMyWay.lookup({ method: 'POST', url: '/fOO/Bar/Static/two/update', headers: {} }, null)
  findMyWay.lookup({ method: 'POST', url: '/Foo/bAR/STATIC/THREE/cAnCeL', headers: {} }, null)
})
