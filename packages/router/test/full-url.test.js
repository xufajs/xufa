import http from 'node:http';
import FindMyWay from '../index.js';

test('full-url', () => {
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('Should not be defaultRoute')
    }
  })

  const rootHandler = () => {}
  const adminHandler = () => {}

  findMyWay.on('GET', '/', rootHandler)
  findMyWay.on('GET', '/admin', adminHandler)

  findMyWay.on('GET', '/a', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  findMyWay.on('GET', '/a/:id', (req, res) => {
    res.end('{"message":"hello world"}')
  })

  expect(findMyWay.find('GET', 'http://localhost/a', { host: 'localhost' })).toEqual(findMyWay.find('GET', '/a', { host: 'localhost' }))
  expect(findMyWay.find('GET', 'http://localhost:8080/a', { host: 'localhost' })).toEqual(findMyWay.find('GET', '/a', { host: 'localhost' }))
  expect(findMyWay.find('GET', 'http://123.123.123.123/a', {})).toEqual(findMyWay.find('GET', '/a', {}))
  expect(findMyWay.find('GET', 'https://localhost/a', { host: 'localhost' })).toEqual(findMyWay.find('GET', '/a', { host: 'localhost' }))

  expect(findMyWay.find('GET', 'http://localhost/a/100', { host: 'localhost' })).toEqual(findMyWay.find('GET', '/a/100', { host: 'localhost' }))
  expect(findMyWay.find('GET', 'http://localhost:8080/a/100', { host: 'localhost' })).toEqual(findMyWay.find('GET', '/a/100', { host: 'localhost' }))
  expect(findMyWay.find('GET', 'http://123.123.123.123/a/100', {})).toEqual(findMyWay.find('GET', '/a/100', {}))
  expect(findMyWay.find('GET', 'https://localhost/a/100', { host: 'localhost' })).toEqual(findMyWay.find('GET', '/a/100', { host: 'localhost' }))

  for (const url of [
    'http://localhost?next=/admin',
    'https://localhost?next=/admin',
    'HTTP://localhost?next=/admin'
  ]) {
    const match = findMyWay.find('GET', url, { host: 'localhost' })
    expect(match.handler).toBe(rootHandler)
    expect(match.handler).not.toBe(adminHandler)
    expect(match.searchParams).toEqual({ next: '/admin' })
  }

  expect(findMyWay.find('GET', 'http://localhost?next=//admin/settings&return=/', { host: 'localhost' })).toEqual(findMyWay.find('GET', '/?next=//admin/settings&return=/', { host: 'localhost' }))
  expect(findMyWay.find('GET', 'http://localhost/?next=/admin', { host: 'localhost' })).toEqual(findMyWay.find('GET', '/?next=/admin', { host: 'localhost' }))
  expect(findMyWay.find('GET', 'http://localhost', { host: 'localhost' })).toEqual(findMyWay.find('GET', '/', { host: 'localhost' }))
})

test('lookup preserves the query of an absolute-form target with an empty path', () => {
  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/', (req, res, params, store, searchParams) => searchParams)
  findMyWay.on('GET', '/admin', () => {
    expect.fail('query data must not select the admin route')
  })

  const searchParams = findMyWay.lookup({
    method: 'GET',
    url: 'http://example.test?next=/admin',
    headers: { host: 'example.test' }
  }, null)

  expect(searchParams).toEqual({ next: '/admin' })
})

test('an HTTP server routes an absolute-form target with an empty path to root', async () => {
  const findMyWay = FindMyWay()
  const requestTarget = 'http://example.test?next=/admin'

  findMyWay.on('GET', '/', (req, res, params, store, searchParams) => {
    expect(req.url).toBe(requestTarget)
    res.end(JSON.stringify({ route: 'root', searchParams }))
  })
  findMyWay.on('GET', '/admin', (req, res) => {
    res.end(JSON.stringify({ route: 'admin' }))
  })

  const server = http.createServer((req, res) => findMyWay.lookup(req, res))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  onTestFinished(() => new Promise(resolve => server.close(resolve)))

  const response = await new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: server.address().port,
      path: requestTarget,
      headers: { host: 'example.test' }
    }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { body += chunk })
      res.on('end', () => resolve({ statusCode: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end()
  })

  expect(response.statusCode).toBe(200)
  expect(JSON.parse(response.body)).toEqual({
    route: 'root',
    searchParams: { next: '/admin' }
  })
})

test('invalid HTTP absolute-form targets use the bad URL handler', () => {
  let badUrl
  const findMyWay = FindMyWay({
    onBadUrl: url => {
      badUrl = url
    }
  })

  findMyWay.on('GET', '/admin', () => {
    expect.fail('an invalid absolute-form target must not select the admin route')
  })

  for (const url of [
    'http:///admin',
    'http://localhost#next=/admin',
    'http://localhost:invalid/admin'
  ]) {
    const match = findMyWay.find('GET', url)
    findMyWay.callHandler(match, null, null)
    expect(badUrl).toBe(url)
  }
})
