import FindMyWay from '../index.js';

test('Nested static parametric route, url with parameter common prefix > 1', () => {
  expect.assertions(1)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  findMyWay.on('GET', '/api/foo/b2', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  findMyWay.on('GET', '/api/foo/bar/qux', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  findMyWay.on('GET', '/api/foo/:id/bar', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  findMyWay.on('GET', '/foo', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  expect(findMyWay.find('GET', '/api/foo/b-123/bar').params).toEqual({ id: 'b-123' })
})
