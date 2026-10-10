import FindMyWay from '../index.js';

test('Nested static parametric route, url with parameter common prefix > 1', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/a/bbbb', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  findMyWay.on('GET', '/a/bbaa', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  findMyWay.on('GET', '/a/babb', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  findMyWay.on('DELETE', '/a/:id', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  expect(findMyWay.find('DELETE', '/a/bbar').params).toEqual({ id: 'bbar' })
})

test('Parametric route, url with parameter common prefix > 1', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/aaa', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  findMyWay.on('GET', '/aabb', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  findMyWay.on('GET', '/abc', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  findMyWay.on('GET', '/:id', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  expect(findMyWay.find('GET', '/aab').params).toEqual({ id: 'aab' })
})

test('Parametric route, url with multi parameter common prefix > 1', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/:id/aaa/:id2', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  findMyWay.on('GET', '/:id/aabb/:id2', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  findMyWay.on('GET', '/:id/abc/:id2', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  findMyWay.on('GET', '/:a/:b', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  expect(findMyWay.find('GET', '/hello/aab').params).toEqual({ a: 'hello', b: 'aab' })
})

test('Mixed routes, url with parameter common prefix > 1', () => {
  expect.assertions(11)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/test', (req, res, params) => {
    res.end('{"hello":"world"}')
  })

  findMyWay.on('GET', '/testify', (req, res, params) => {
    res.end('{"hello":"world"}')
  })

  findMyWay.on('GET', '/test/hello', (req, res, params) => {
    res.end('{"hello":"world"}')
  })

  findMyWay.on('GET', '/test/hello/test', (req, res, params) => {
    res.end('{"hello":"world"}')
  })

  findMyWay.on('GET', '/te/:a', (req, res, params) => {
    res.end('{"hello":"world"}')
  })

  findMyWay.on('GET', '/test/hello/:b', (req, res, params) => {
    res.end('{"hello":"world"}')
  })

  findMyWay.on('GET', '/:c', (req, res, params) => {
    res.end('{"hello":"world"}')
  })

  findMyWay.on('GET', '/text/hello', (req, res, params) => {
    res.end('{"hello":"world"}')
  })

  findMyWay.on('GET', '/text/:d', (req, res, params) => {
    res.end('{"winter":"is here"}')
  })

  findMyWay.on('GET', '/text/:e/test', (req, res, params) => {
    res.end('{"winter":"is here"}')
  })

  expect(findMyWay.find('GET', '/test').params).toEqual({})
  expect(findMyWay.find('GET', '/testify').params).toEqual({})
  expect(findMyWay.find('GET', '/test/hello').params).toEqual({})
  expect(findMyWay.find('GET', '/test/hello/test').params).toEqual({})
  expect(findMyWay.find('GET', '/te/hello').params).toEqual({ a: 'hello' })
  expect(findMyWay.find('GET', '/te/').params).toEqual({ a: '' })
  expect(findMyWay.find('GET', '/testy').params).toEqual({ c: 'testy' })
  expect(findMyWay.find('GET', '/besty').params).toEqual({ c: 'besty' })
  expect(findMyWay.find('GET', '/text/hellos/test').params).toEqual({ e: 'hellos' })
  expect(findMyWay.find('GET', '/te/hello/')).toEqual(null)
  expect(findMyWay.find('GET', '/te/hellos/testy')).toEqual(null)
})

test('Parent parametric brother should not rewrite child node parametric brother', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/text/hello', (req, res, params) => {
    res.end('{"hello":"world"}')
  })

  findMyWay.on('GET', '/text/:e/test', (req, res, params) => {
    res.end('{"winter":"is here"}')
  })

  findMyWay.on('GET', '/:c', (req, res, params) => {
    res.end('{"hello":"world"}')
  })

  expect(findMyWay.find('GET', '/text/hellos/test').params).toEqual({ e: 'hellos' })
})

test('Mixed parametric routes, with last defined route being static', () => {
  expect.assertions(4)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/test', (req, res, params) => {
    res.end('{"hello":"world"}')
  })

  findMyWay.on('GET', '/test/:a', (req, res, params) => {
    res.end('{"hello":"world"}')
  })

  findMyWay.on('GET', '/test/hello/:b', (req, res, params) => {
    res.end('{"hello":"world"}')
  })

  findMyWay.on('GET', '/test/hello/:c/test', (req, res, params) => {
    res.end('{"hello":"world"}')
  })
  findMyWay.on('GET', '/test/hello/:c/:k', (req, res, params) => {
    res.end('{"hello":"world"}')
  })

  findMyWay.on('GET', '/test/world', (req, res, params) => {
    res.end('{"hello":"world"}')
  })

  expect(findMyWay.find('GET', '/test/hello').params).toEqual({ a: 'hello' })
  expect(findMyWay.find('GET', '/test/hello/world/test').params).toEqual({ c: 'world' })
  expect(findMyWay.find('GET', '/test/hello/world/te').params).toEqual({ c: 'world', k: 'te' })
  expect(findMyWay.find('GET', '/test/hello/world/testy').params).toEqual({ c: 'world', k: 'testy' })
})
