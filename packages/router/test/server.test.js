import http from 'http';
import FindMyWay from '../index.js';

test('basic router with http server', (done) => {
  expect.assertions(6)
  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/test', (req, res, params) => {
    expect(req).toBeTruthy()
    expect(res).toBeTruthy()
    expect(params).toBeTruthy()
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const server = http.createServer((req, res) => {
    findMyWay.lookup(req, res)
  })

  server.listen(0, async err => {
    expect(err).toBeFalsy()
    server.unref()

    const res = await fetch(`http://localhost:${server.address().port}/test`)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hello: 'world' })
    done()
  })
})

test('router with params with http server', (done) => {
  expect.assertions(6)
  const findMyWay = FindMyWay()
  findMyWay.on('GET', '/test/:id', (req, res, params) => {
    expect(req).toBeTruthy()
    expect(res).toBeTruthy()
    expect(params.id).toBe('hello')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const server = http.createServer((req, res) => {
    findMyWay.lookup(req, res)
  })

  server.listen(0, async err => {
    expect(err).toBeFalsy()
    server.unref()

    const res = await fetch(`http://localhost:${server.address().port}/test/hello`)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hello: 'world' })
    done()
  })
})

test('default route', (done) => {
  expect.assertions(2)
  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      res.statusCode = 404
      res.end()
    }
  })

  const server = http.createServer((req, res) => {
    findMyWay.lookup(req, res)
  })

  server.listen(0, async err => {
    expect(err).toBeFalsy()
    server.unref()

    const res = await fetch(`http://localhost:${server.address().port}`)
    expect(res.status).toBe(404)
    done()
  })
})

test('automatic default route', (done) => {
  expect.assertions(2)
  const findMyWay = FindMyWay()

  const server = http.createServer((req, res) => {
    findMyWay.lookup(req, res)
  })

  server.listen(0, async err => {
    expect(err).toBeFalsy()
    server.unref()

    const res = await fetch(`http://localhost:${server.address().port}`)
    expect(res.status).toBe(404)
    done()
  })
})

test('maps two routes when trailing slash should be trimmed', (done) => {
  expect.assertions(21)
  const findMyWay = FindMyWay({
    ignoreTrailingSlash: true
  })

  findMyWay.on('GET', '/test/', (req, res, params) => {
    expect(req).toBeTruthy()
    expect(res).toBeTruthy()
    expect(params).toBeTruthy()
    res.end('test')
  })

  findMyWay.on('GET', '/othertest', (req, res, params) => {
    expect(req).toBeTruthy()
    expect(res).toBeTruthy()
    expect(params).toBeTruthy()
    res.end('othertest')
  })

  const server = http.createServer((req, res) => {
    findMyWay.lookup(req, res)
  })

  server.listen(0, async err => {
    expect(err).toBeFalsy()
    server.unref()

    const baseURL = 'http://localhost:' + server.address().port

    let res = await fetch(`${baseURL}/test/`)
    expect(res.status).toBe(200)
    expect(await res.text()).toEqual('test')

    res = await fetch(`${baseURL}/test`)
    expect(res.status).toBe(200)
    expect(await res.text()).toEqual('test')

    res = await fetch(`${baseURL}/othertest`)
    expect(res.status).toBe(200)
    expect(await res.text()).toEqual('othertest')

    res = await fetch(`${baseURL}/othertest/`)
    expect(res.status).toBe(200)
    expect(await res.text()).toEqual('othertest')

    done()
  })
})

test('does not trim trailing slash when ignoreTrailingSlash is false', (done) => {
  expect.assertions(7)
  const findMyWay = FindMyWay({
    ignoreTrailingSlash: false
  })

  findMyWay.on('GET', '/test/', (req, res, params) => {
    expect(req).toBeTruthy()
    expect(res).toBeTruthy()
    expect(params).toBeTruthy()
    res.end('test')
  })

  const server = http.createServer((req, res) => {
    findMyWay.lookup(req, res)
  })

  server.listen(0, async err => {
    expect(err).toBeFalsy()
    server.unref()

    const baseURL = 'http://localhost:' + server.address().port

    let res = await fetch(`${baseURL}/test/`)
    expect(res.status).toBe(200)
    expect(await res.text()).toEqual('test')

    res = await fetch(`${baseURL}/test`)
    expect(res.status).toBe(404)

    done()
  })
})

test('does not map // when ignoreTrailingSlash is true', (done) => {
  expect.assertions(7)
  const findMyWay = FindMyWay({
    ignoreTrailingSlash: false
  })

  findMyWay.on('GET', '/', (req, res, params) => {
    expect(req).toBeTruthy()
    expect(res).toBeTruthy()
    expect(params).toBeTruthy()
    res.end('test')
  })

  const server = http.createServer((req, res) => {
    findMyWay.lookup(req, res)
  })

  server.listen(0, async err => {
    expect(err).toBeFalsy()
    server.unref()

    const baseURL = 'http://localhost:' + server.address().port

    let res = await fetch(`${baseURL}/`)
    expect(res.status).toBe(200)
    expect(await res.text()).toEqual('test')

    res = await fetch(`${baseURL}//`)
    expect(res.status).toBe(404)

    done()
  })
})

test('maps two routes when duplicate slashes should be trimmed', (done) => {
  expect.assertions(21)
  const findMyWay = FindMyWay({
    ignoreDuplicateSlashes: true
  })

  findMyWay.on('GET', '//test', (req, res, params) => {
    expect(req).toBeTruthy()
    expect(res).toBeTruthy()
    expect(params).toBeTruthy()
    res.end('test')
  })

  findMyWay.on('GET', '/othertest', (req, res, params) => {
    expect(req).toBeTruthy()
    expect(res).toBeTruthy()
    expect(params).toBeTruthy()
    res.end('othertest')
  })

  const server = http.createServer((req, res) => {
    findMyWay.lookup(req, res)
  })

  server.listen(0, async err => {
    expect(err).toBeFalsy()
    server.unref()

    const baseURL = 'http://localhost:' + server.address().port

    let res = await fetch(`${baseURL}//test`)
    expect(res.status).toBe(200)
    expect(await res.text()).toEqual('test')

    res = await fetch(`${baseURL}/test`)
    expect(res.status).toBe(200)
    expect(await res.text()).toEqual('test')

    res = await fetch(`${baseURL}/othertest`)
    expect(res.status).toBe(200)
    expect(await res.text()).toEqual('othertest')

    res = await fetch(`${baseURL}//othertest`)
    expect(res.status).toBe(200)
    expect(await res.text()).toEqual('othertest')

    done()
  })
})

test('does not trim duplicate slashes when ignoreDuplicateSlashes is false', (done) => {
  expect.assertions(7)
  const findMyWay = FindMyWay({
    ignoreDuplicateSlashes: false
  })

  findMyWay.on('GET', '//test', (req, res, params) => {
    expect(req).toBeTruthy()
    expect(res).toBeTruthy()
    expect(params).toBeTruthy()
    res.end('test')
  })

  const server = http.createServer((req, res) => {
    findMyWay.lookup(req, res)
  })

  server.listen(0, async err => {
    expect(err).toBeFalsy()
    server.unref()

    const baseURL = 'http://localhost:' + server.address().port

    let res = await fetch(`${baseURL}//test`)
    expect(res.status).toBe(200)
    expect(await res.text()).toEqual('test')

    res = await fetch(`${baseURL}/test`)
    expect(res.status).toBe(404)

    done()
  })
})

test('does map // when ignoreDuplicateSlashes is true', (done) => {
  expect.assertions(11)
  const findMyWay = FindMyWay({
    ignoreDuplicateSlashes: true
  })

  findMyWay.on('GET', '/', (req, res, params) => {
    expect(req).toBeTruthy()
    expect(res).toBeTruthy()
    expect(params).toBeTruthy()
    res.end('test')
  })

  const server = http.createServer((req, res) => {
    findMyWay.lookup(req, res)
  })

  server.listen(0, async err => {
    expect(err).toBeFalsy()
    server.unref()

    const baseURL = 'http://localhost:' + server.address().port

    let res = await fetch(`${baseURL}/`)
    expect(res.status).toBe(200)
    expect(await res.text()).toEqual('test')

    res = await fetch(`${baseURL}//`)
    expect(res.status).toBe(200)
    expect(await res.text()).toEqual('test')

    done()
  })
})

test('versioned routes', (done) => {
  expect.assertions(3)

  const findMyWay = FindMyWay()

  findMyWay.on('GET', '/test', { constraints: { version: '1.2.3' } }, (req, res, params) => {
    res.end('ok')
  })

  const server = http.createServer((req, res) => {
    findMyWay.lookup(req, res)
  })

  server.listen(0, async err => {
    expect(err).toBeFalsy()
    server.unref()

    let res = await fetch(`http://localhost:${server.address().port}/test`, {
      headers: { 'Accept-Version': '1.2.3' }
    })

    expect(res.status).toBe(200)

    res = await fetch(`http://localhost:${server.address().port}/test`, {
      headers: { 'Accept-Version': '2.x' }
    })

    expect(res.status).toBe(404)

    done()
  })
})
