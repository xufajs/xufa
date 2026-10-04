'use strict'


const { Readable, finished, pipeline } = require('node:stream')
const qs = require('node:querystring')
const fs = require('node:fs')
const zlib = require('node:zlib')
const http = require('node:http')
const eos = require('end-of-stream')
const express = require('express')
const multer = require('multer')

const inject = require('../index')
const parseURL = require('../lib/url').parseURL

const NpmFormData = require('form-data')
const formAutoContent = require('form-auto-content')
const httpMethods = [
  'delete',
  'get',
  'head',
  'options',
  'patch',
  'post',
  'put',
  'trace'
]

test('returns non-chunked payload', (done) => {
  expect.assertions(7)
  const output = 'example.com:8080|/hello'

  const dispatch = function (req, res) {
    res.statusMessage = 'Super'
    res.setHeader('x-extra', 'hello')
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': output.length })
    res.end(req.headers.host + '|' + req.url)
  }

  inject(dispatch, 'http://example.com:8080/hello', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.statusMessage).toBe('Super')
    expect(res.headers.date).toBeTruthy()
    expect(res.headers).toEqual({
      date: res.headers.date,
      connection: 'keep-alive',
      'x-extra': 'hello',
      'content-type': 'text/plain',
      'content-length': output.length.toString()
    })
    expect(res.payload).toBe(output)
    expect(res.rawPayload.toString()).toBe('example.com:8080|/hello')
    done()
  })
})

test('returns single buffer payload', (done) => {
  expect.assertions(6)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers.host + '|' + req.url)
  }

  inject(dispatch, { url: 'http://example.com:8080/hello' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers.date).toBeTruthy()
    expect(res.headers.connection).toBeTruthy()
    expect(res.headers['transfer-encoding']).toBe('chunked')
    expect(res.payload).toBe('example.com:8080|/hello')
    expect(res.rawPayload.toString()).toBe('example.com:8080|/hello')
    done()
  })
})

test('passes headers', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers.super)
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello', headers: { Super: 'duper' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('duper')
    done()
  })
})

test('request has rawHeaders', (done) => {
  expect.assertions(3)
  const dispatch = function (req, res) {
    expect(Array.isArray(req.rawHeaders)).toBeTruthy()
    expect(req.rawHeaders).toEqual(['super', 'duper', 'user-agent', 'lightMyRequest', 'host', 'example.com:8080'])
    res.writeHead(200)
    res.end()
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello', headers: { Super: 'duper' } }, (err) => {
    expect(err).toBeFalsy()
    done()
  })
})

test('request inherits from custom class', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    expect(req instanceof http.IncomingMessage).toBeTruthy()
    res.writeHead(200)
    res.end()
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello', Request: http.IncomingMessage }, (err) => {
    expect(err).toBeFalsy()
    done()
  })
})

test('request with custom class preserves stream data', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    expect(req._readableState).toBeTruthy()
    res.writeHead(200)
    res.end()
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello', Request: http.IncomingMessage }, (err) => {
    expect(err).toBeFalsy()
    done()
  })
})

test('assert Request option has a valid prototype', () => {
  expect.assertions(2)
  const dispatch = function (_req, res) {
    expect('should not get here').toBeFalsy()
    res.writeHead(500)
    res.end()
  }

  const MyInvalidRequest = {}

  expect(() => {
    inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello', Request: MyInvalidRequest }, () => {})
  }).toThrow(Error)

  expect(() => {
    inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello', Request: 'InvalidRequest' }, () => {})
  }).toThrow(Error)
})

test('passes remote address', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.socket.remoteAddress)
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello', remoteAddress: '1.2.3.4' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('1.2.3.4')
    done()
  })
})

test('passes a socket which emits events like a normal one does', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    req.socket.on('timeout', () => {})
    res.end('added')
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('added')
    done()
  })
})

test('includes deprecated connection on request', (done) => {
  expect.assertions(3)
  const warnings = process.listeners('warning')

  function onWarning (err) {
    expect(err.code).toBe('XUFA_INJECT_DEP01')
    return false
  }
  process.on('warning', onWarning)
  onTestFinished(() => {
    process.removeListener('warning', onWarning)
    for (const fn of warnings) {
      process.on('warning', fn)
    }
  })
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.connection.remoteAddress)
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello', remoteAddress: '1.2.3.4' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('1.2.3.4')
    done()
  })
})

const parseQuery = url => {
  const parsedURL = parseURL(url)
  return qs.parse(parsedURL.search.slice(1))
}

test('passes query', (done) => {
  expect.assertions(2)

  const query = {
    message: 'OK',
    xs: ['foo', 'bar']
  }

  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.url)
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello', query }, (err, res) => {
    expect(err).toBeFalsy()
    expect(parseQuery(res.payload)).toEqual(query)
    done()
  })
})

test('query will be merged into that in url', (done) => {
  expect.assertions(2)

  const query = {
    xs: ['foo', 'bar']
  }

  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.url)
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello?message=OK', query }, (err, res) => {
    expect(err).toBeFalsy()
    expect(parseQuery(res.payload)).toEqual(Object.assign({ message: 'OK' }, query))
    done()
  })
})

test('passes query as a string', (done) => {
  expect.assertions(2)

  const query = 'message=OK&xs=foo&xs=bar'

  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.url)
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello', query }, (err, res) => {
    expect(err).toBeFalsy()
    expect(parseQuery(res.payload)).toEqual({
      message: 'OK',
      xs: ['foo', 'bar']
    })
    done()
  })
})

test('query as a string will be merged into that in url', (done) => {
  expect.assertions(2)

  const query = 'xs=foo&xs=bar'

  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.url)
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello?message=OK', query }, (err, res) => {
    expect(err).toBeFalsy()
    expect(parseQuery(res.payload)).toEqual(Object.assign({ message: 'OK' }, {
      xs: ['foo', 'bar']
    }))
    done()
  })
})

test('passes localhost as default remote address', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.socket.remoteAddress)
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('127.0.0.1')
    done()
  })
})

test('passes host option as host header', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers.host)
  }

  inject(dispatch, { method: 'GET', url: '/hello', headers: { host: 'test.example.com' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('test.example.com')
    done()
  })
})

test('passes localhost as default host header', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers.host)
  }

  inject(dispatch, { method: 'GET', url: '/hello' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('localhost:80')
    done()
  })
})

test('passes authority as host header', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers.host)
  }

  inject(dispatch, { method: 'GET', url: '/hello', authority: 'something' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('something')
    done()
  })
})

test('passes uri host as host header', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers.host)
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('example.com:8080')
    done()
  })
})

test('includes default http port in host header', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers.host)
  }

  inject(dispatch, 'http://example.com', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('example.com:80')
    done()
  })
})

test('includes default https port in host header', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers.host)
  }

  inject(dispatch, 'https://example.com', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('example.com:443')
    done()
  })
})

test('optionally accepts an object as url', (done) => {
  expect.assertions(5)
  const output = 'example.com:8080|/hello?test=1234'

  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': output.length })
    res.end(req.headers.host + '|' + req.url)
  }

  const url = {
    protocol: 'http',
    hostname: 'example.com',
    port: '8080',
    pathname: 'hello',
    query: {
      test: '1234'
    }
  }

  inject(dispatch, { url }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers.date).toBeTruthy()
    expect(res.headers.connection).toBeTruthy()
    expect(res.headers['transfer-encoding']).toBeFalsy()
    expect(res.payload).toBe(output)
    done()
  })
})

test('leaves user-agent unmodified', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers['user-agent'])
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello', headers: { 'user-agent': 'duper' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('duper')
    done()
  })
})

test('returns chunked payload', (done) => {
  expect.assertions(5)
  const dispatch = function (_req, res) {
    res.writeHead(200, 'OK')
    res.write('a')
    res.write('b')
    res.end()
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers.date).toBeTruthy()
    expect(res.headers.connection).toBeTruthy()
    expect(res.headers['transfer-encoding']).toBe('chunked')
    expect(res.payload).toBe('ab')
    done()
  })
})

test('sets trailers in response object', (done) => {
  expect.assertions(4)
  const dispatch = function (_req, res) {
    res.setHeader('Trailer', 'Test')
    res.addTrailers({ Test: 123 })
    res.end()
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers.trailer).toBe('Test')
    expect(res.headers.test).toBe(undefined)
    expect(res.trailers.test).toBe('123')
    done()
  })
})

test('parses zipped payload', (done) => {
  expect.assertions(4)
  const dispatch = function (_req, res) {
    res.writeHead(200, 'OK')
    const stream = fs.createReadStream('./package.json')
    stream.pipe(zlib.createGzip()).pipe(res)
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(err).toBeFalsy()
    fs.readFile('./package.json', { encoding: 'utf-8' }, (err, file) => {
      expect(err).toBeFalsy()

      zlib.unzip(res.rawPayload, (err, unzipped) => {
        expect(err).toBeFalsy()
        expect(unzipped.toString('utf-8')).toBe(file)
        done()
      })
    })
  })
})

test('returns multi buffer payload', (done) => {
  expect.assertions(2)
  const dispatch = function (_req, res) {
    res.writeHead(200)
    res.write('a')
    res.write(Buffer.from('b'))
    res.end()
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('ab')
    done()
  })
})

test('returns null payload', (done) => {
  expect.assertions(2)
  const dispatch = function (_req, res) {
    res.writeHead(200, { 'Content-Length': 0 })
    res.end()
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('')
    done()
  })
})

test('allows ending twice', (done) => {
  expect.assertions(2)
  const dispatch = function (_req, res) {
    res.writeHead(200, { 'Content-Length': 0 })
    res.end()
    res.end()
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('')
    done()
  })
})

test('identifies injection object', (done) => {
  expect.assertions(6)
  const dispatchRequest = function (req, res) {
    expect(inject.isInjection(req)).toBe(true)
    expect(inject.isInjection(res)).toBe(true)

    res.writeHead(200, { 'Content-Length': 0 })
    res.end()
  }

  const dispatchCustomRequest = function (req, res) {
    expect(inject.isInjection(req)).toBe(true)
    expect(inject.isInjection(res)).toBe(true)

    res.writeHead(200, { 'Content-Length': 0 })
    res.end()
  }

  const options = { method: 'GET', url: '/' }
  const cb = (err) => { expect(err).toBeFalsy() }
  const cbDone = (err) => {
    expect(err).toBeFalsy()
    done()
  }

  inject(dispatchRequest, options, cb)
  inject(dispatchCustomRequest, { ...options, Request: http.IncomingMessage }, cbDone)
})

test('pipes response', (done) => {
  expect.assertions(3)
  let finished = false
  const dispatch = function (_req, res) {
    res.writeHead(200)
    const stream = getTestStream()

    res.on('finish', () => {
      finished = true
    })

    stream.pipe(res)
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(finished).toBe(true)
    expect(res.payload).toBe('hi')
    done()
  })
})

test('pipes response with old stream', (done) => {
  expect.assertions(3)
  let finished = false
  const dispatch = function (_req, res) {
    res.writeHead(200)
    const stream = getTestStream()
    stream.pause()
    const stream2 = new Readable().wrap(stream)
    stream.resume()

    res.on('finish', () => {
      finished = true
    })

    stream2.pipe(res)
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(finished).toBe(true)
    expect(res.payload).toBe('hi')
    done()
  })
})

test('echos object payload', (done) => {
  expect.assertions(3)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'content-type': req.headers['content-type'] })
    req.pipe(res)
  }

  inject(dispatch, { method: 'POST', url: '/test', payload: { a: 1 } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['content-type']).toBe('application/json')
    expect(res.payload).toBe('{"a":1}')
    done()
  })
})

test('supports body option in Request and property in Response', (done) => {
  expect.assertions(3)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'content-type': req.headers['content-type'] })
    req.pipe(res)
  }

  inject(dispatch, { method: 'POST', url: '/test', body: { a: 1 } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['content-type']).toBe('application/json')
    expect(res.body).toBe('{"a":1}')
    done()
  })
})

test('echos buffer payload', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    res.writeHead(200)
    req.pipe(res)
  }

  inject(dispatch, { method: 'POST', url: '/test', payload: Buffer.from('test!') }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('test!')
    done()
  })
})

test('echos object payload with non-english utf-8 string', (done) => {
  expect.assertions(3)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'content-type': req.headers['content-type'] })
    req.pipe(res)
  }

  inject(dispatch, { method: 'POST', url: '/test', payload: { a: '½½א' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['content-type']).toBe('application/json')
    expect(res.payload).toBe('{"a":"½½א"}')
    done()
  })
})

test('echos object payload without payload', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    res.writeHead(200)
    req.pipe(res)
  }

  inject(dispatch, { method: 'POST', url: '/test' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('')
    done()
  })
})

test('retains content-type header', (done) => {
  expect.assertions(3)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'content-type': req.headers['content-type'] })
    req.pipe(res)
  }

  inject(dispatch, { method: 'POST', url: '/test', payload: { a: 1 }, headers: { 'content-type': 'something' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['content-type']).toBe('something')
    expect(res.payload).toBe('{"a":1}')
    done()
  })
})

test('adds a content-length header if none set when payload specified', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers['content-length'])
  }

  inject(dispatch, { method: 'POST', url: '/test', payload: { a: 1 } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('{"a":1}'.length.toString())
    done()
  })
})

test('retains a content-length header when payload specified', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers['content-length'])
  }

  inject(dispatch, { method: 'POST', url: '/test', payload: '', headers: { 'content-length': '10' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('10')
    done()
  })
})

test('can handle a stream payload', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    readStream(req, (buff) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(buff)
    })
  }

  inject(dispatch, { method: 'POST', url: '/', payload: getTestStream() }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('hi')
    done()
  })
})

test('can handle a stream payload that errors', (done) => {
  expect.assertions(2)
  const dispatch = function (req) {
    req.resume()
  }

  const payload = new Readable({
    read () {
      this.destroy(new Error('kaboom'))
    }
  })

  inject(dispatch, { method: 'POST', url: '/', payload }, (err) => {
    expect(err).toBeTruthy()
    expect(err.message).toBe('kaboom')
    done()
  })
})

test('can handle a stream payload of utf-8 strings', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    readStream(req, (buff) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(buff)
    })
  }

  inject(dispatch, { method: 'POST', url: '/', payload: getTestStream('utf8') }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('hi')
    done()
  })
})

test('can override stream payload content-length header', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers['content-length'])
  }

  const headers = { 'content-length': '100' }

  inject(dispatch, { method: 'POST', url: '/', payload: getTestStream(), headers }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('100')
    done()
  })
})

test('writeHead returns single buffer payload', (done) => {
  expect.assertions(4)
  const reply = 'Hello World'
  const statusCode = 200
  const statusMessage = 'OK'
  const dispatch = function (_req, res) {
    res.writeHead(statusCode, statusMessage, { 'Content-Type': 'text/plain', 'Content-Length': reply.length })
    res.end(reply)
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(statusCode)
    expect(res.statusMessage).toBe(statusMessage)
    expect(res.payload).toBe(reply)
    done()
  })
})

test('_read() plays payload', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    let buffer = ''
    req.on('readable', () => {
      buffer = buffer + (req.read() || '')
    })

    req.on('close', () => {
    })

    req.on('end', () => {
      res.writeHead(200, { 'Content-Length': 0 })
      res.end(buffer)
      req.destroy()
    })
  }

  const body = 'something special just for you'
  inject(dispatch, { method: 'GET', url: '/', payload: body }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(body)
    done()
  })
})

test('simulates split', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    let buffer = ''
    req.on('readable', () => {
      buffer = buffer + (req.read() || '')
    })

    req.on('close', () => {
    })

    req.on('end', () => {
      res.writeHead(200, { 'Content-Length': 0 })
      res.end(buffer)
      req.destroy()
    })
  }

  const body = 'something special just for you'
  inject(dispatch, { method: 'GET', url: '/', payload: body, simulate: { split: true } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(body)
    done()
  })
})

test('simulates error', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    req.on('readable', () => {
    })

    req.on('error', () => {
      res.writeHead(200, { 'Content-Length': 0 })
      res.end('error')
    })
  }

  const body = 'something special just for you'
  inject(dispatch, { method: 'GET', url: '/', payload: body, simulate: { error: true } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('error')
    done()
  })
})

test('simulates no end without payload', (done) => {
  expect.assertions(2)
  let end = false
  const dispatch = function (req) {
    req.resume()
    req.on('end', () => {
      end = true
    })
  }

  let replied = false
  inject(dispatch, { method: 'GET', url: '/', simulate: { end: false } }, () => {
    replied = true
  })

  setTimeout(() => {
    expect(end).toBe(false)
    expect(replied).toBe(false)
    done()
  }, 10)
})

test('simulates no end with payload', (done) => {
  expect.assertions(2)
  let end = false
  const dispatch = function (req) {
    req.resume()
    req.on('end', () => {
      end = true
    })
  }

  let replied = false
  inject(dispatch, { method: 'GET', url: '/', payload: '1234567', simulate: { end: false } }, () => {
    replied = true
  })

  setTimeout(() => {
    expect(end).toBe(false)
    expect(replied).toBe(false)
    done()
  }, 10)
})

test('simulates close', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    let buffer = ''
    req.on('readable', () => {
      buffer = buffer + (req.read() || '')
    })

    req.on('close', () => {
      res.writeHead(200, { 'Content-Length': 0 })
      res.end('close')
    })

    req.on('end', () => {
    })
  }

  const body = 'something special just for you'
  inject(dispatch, { method: 'GET', url: '/', payload: body, simulate: { close: true } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('close')
    done()
  })
})

test('errors for invalid input options', () => {
  expect.assertions(1)

  expect(() => inject({}, {}, () => {})).toThrow(expect.objectContaining({ name: 'AssertionError', message: 'dispatchFunc should be a function' }))
})

test('errors for missing url', () => {
  expect.assertions(1)

  expect(() => inject(() => {}, {}, () => {})).toThrow(expect.objectContaining({ message: expect.stringMatching(/must have required property 'url'/) }))
})

test('errors for an incorrect simulation object', () => {
  expect.assertions(1)

  expect(() => inject(() => {}, { url: '/', simulate: 'sample string' }, () => {})).toThrow(expect.objectContaining({ message: expect.stringMatching(/^must be object$/) }))
})

test('ignores incorrect simulation object', () => {
  expect.assertions(1)

  expect(() => inject(() => { }, { url: '/', simulate: 'sample string', validate: false }, () => { })).not.toThrow()
})

test('errors for an incorrect simulation object values', () => {
  expect.assertions(1)

  expect(() => inject(() => {}, { url: '/', simulate: { end: 'wrong input' } }, () => {})).toThrow(expect.objectContaining({ message: expect.stringMatching(/^must be boolean$/) }))
})

test('promises support', (done) => {
  expect.assertions(1)
  const dispatch = function (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('hello')
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello' })
    .then(res => {
      expect(res.payload).toBe('hello')
      done()
    })
    .catch(expect.fail)
})

test('this should be the server instance', (done) => {
  expect.assertions(2)

  const server = http.createServer()

  const dispatch = function (_req, res) {
    expect(this).toBe(server)
    res.end('hello')
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello', server })
    .then(res => expect(res.statusCode).toBe(200))
    .catch(expect.fail)
    .finally(done)
})

test('should handle response errors', (done) => {
  expect.assertions(1)
  const dispatch = function (_req, res) {
    res.connection.destroy(new Error('kaboom'))
  }

  inject(dispatch, 'http://example.com:8080/hello', (err) => {
    expect(err).toBeTruthy()
    done()
  })
})

test('should handle response errors (promises)', async () => {
  expect.assertions(1)
  const dispatch = function (_req, res) {
    res.connection.destroy(new Error('kaboom'))
  }

  await expect((() => inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello' }))()).rejects.toThrow(expect.objectContaining({ name: 'Error', message: 'kaboom' }))
})

test('should handle response timeout handler', (done) => {
  expect.assertions(3)
  const dispatch = function (_req, res) {
    const handle = setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('incorrect')
    }, 200)
    res.setTimeout(100, () => {
      clearTimeout(handle)
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('correct')
    })
    res.on('timeout', () => {
      expect(true).toBeTruthy()
    })
  }
  inject(dispatch, { method: 'GET', url: '/test' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('correct')
    done()
  })
})

test('should throw on unknown HTTP method', () => {
  expect.assertions(1)
  const dispatch = function () { }

  expect(() => inject(dispatch, { method: 'UNKNOWN_METHOD', url: 'http://example.com:8080/hello' }, (err, _res) => {
    expect(err).toBeTruthy()
  })).toThrow(Error)
})

test('should throw on unknown HTTP method (promises)', () => {
  expect.assertions(1)
  const dispatch = function () { }

  expect(() => inject(dispatch, { method: 'UNKNOWN_METHOD', url: 'http://example.com:8080/hello' })
    .then(() => {})).toThrow(Error)
})

test('HTTP method is case insensitive', (done) => {
  expect.assertions(3)

  const dispatch = function (_req, res) {
    res.end('Hi!')
  }

  inject(dispatch, { method: 'get', url: 'http://example.com:8080/hello' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(res.payload).toBe('Hi!')
    done()
  })
})

test('form-data should be handled correctly', (done) => {
  expect.assertions(4)

  const dispatch = function (req, res) {
    expect(req.headers['transfer-encoding']).toBe(undefined)
    let body = ''
    req.on('data', d => {
      body += d
    })
    req.on('end', () => {
      res.end(body)
    })
  }

  const form = new NpmFormData()
  form.append('my_field', 'my value')

  inject(dispatch, {
    method: 'POST',
    url: 'http://example.com:8080/hello',
    headers: {
      // Transfer-encoding is automatically deleted if Stream1 is used
      'transfer-encoding': 'chunked'
    },
    payload: form
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(/--.+\r\nContent-Disposition: form-data; name="my_field"\r\n\r\nmy value\r\n--.+--\r\n/.test(res.payload)).toBeTruthy()
    done()
  })
})

test('path as alias to url', (done) => {
  expect.assertions(2)

  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.url)
  }

  inject(dispatch, { method: 'GET', path: 'http://example.com:8080/hello' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('/hello')
    done()
  })
})

test('Should throw if both path and url are missing', () => {
  expect.assertions(1)

  expect(() => inject(() => {}, { method: 'GET' }, () => {})).toThrow(expect.objectContaining({ message: expect.stringMatching(/must have required property 'url',must have required property 'path'/) }))
})

test('chainable api: backwards compatibility for promise (then)', (done) => {
  expect.assertions(1)

  const dispatch = function (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('hello')
  }

  inject(dispatch)
    .get('/')
    .then(res => expect(res.payload).toBe('hello'))
    .catch(expect.fail)
    .finally(done)
})

test('chainable api: backwards compatibility for promise (catch)', (done) => {
  expect.assertions(1)

  function dispatch () {
    throw Error
  }

  inject(dispatch)
    .get('/')
    .catch(err => expect(err).toBeTruthy())
    .finally(done)
})

test('chainable api: multiple call of then should return the same promise', (done) => {
  expect.assertions(2)
  let id = 0

  function dispatch (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Request-Id': id })
    ++id
    expect('request id incremented').toBeTruthy()
    res.end('hello')
  }

  const chain = inject(dispatch).get('/')
  chain.then(res => {
    chain.then(rep => {
      expect(res.headers['request-id']).toBe(rep.headers['request-id'])
      done()
    })
  })
})

test('chainable api: http methods should work correctly', (done) => {
  expect.assertions(16)

  function dispatch (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.method)
  }

  httpMethods.forEach((method, index) => {
    inject(dispatch)[method]('http://example.com:8080/hello')
      .end((err, res) => {
        expect(err).toBeFalsy()
        expect(res.body).toBe(method.toUpperCase())
        if (index === httpMethods.length - 1) {
          done()
        }
      })
  })
})

test('chainable api: http methods should throw if already invoked', (done) => {
  expect.assertions(8)

  function dispatch (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end()
  }

  httpMethods.forEach((method, index) => {
    const chain = inject(dispatch)[method]('http://example.com:8080/hello')
    chain.end()
    expect(() => chain[method]('/')).toThrow(Error)
    if (index === httpMethods.length - 1) {
      done()
    }
  })
})

test('chainable api: body method should work correctly', (done) => {
  expect.assertions(2)

  function dispatch (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    req.pipe(res)
  }

  inject(dispatch)
    .get('http://example.com:8080/hello')
    .body('test')
    .end((err, res) => {
      expect(err).toBeFalsy()
      expect(res.body).toBe('test')
      done()
    })
})

test('chainable api: cookie', (done) => {
  expect.assertions(2)

  function dispatch (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers.cookie)
  }

  inject(dispatch)
    .get('http://example.com:8080/hello')
    .body('test')
    .cookies({ hello: 'world', fastify: 'rulez' })
    .end((err, res) => {
      expect(err).toBeFalsy()
      expect(res.body).toBe('hello=world; fastify=rulez')
      done()
    })
})

test('chainable api: body method should throw if already invoked', () => {
  expect.assertions(1)

  function dispatch (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end()
  }

  const chain = inject(dispatch)
  chain
    .get('http://example.com:8080/hello')
    .end()
  expect(() => chain.body('test')).toThrow(Error)
})

test('chainable api: headers method should work correctly', (done) => {
  expect.assertions(2)

  function dispatch (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers.foo)
  }

  inject(dispatch)
    .get('http://example.com:8080/hello')
    .headers({ foo: 'bar' })
    .end((err, res) => {
      expect(err).toBeFalsy()
      expect(res.payload).toBe('bar')
      done()
    })
})

test('chainable api: headers method should throw if already invoked', () => {
  expect.assertions(1)

  function dispatch (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end()
  }

  const chain = inject(dispatch)
  chain
    .get('http://example.com:8080/hello')
    .end()
  expect(() => chain.headers({ foo: 'bar' })).toThrow(Error)
})

test('chainable api: payload method should work correctly', (done) => {
  expect.assertions(2)

  function dispatch (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    req.pipe(res)
  }

  inject(dispatch)
    .get('http://example.com:8080/hello')
    .payload('payload')
    .end((err, res) => {
      expect(err).toBeFalsy()
      expect(res.payload).toBe('payload')
      done()
    })
})

test('chainable api: payload method should throw if already invoked', () => {
  expect.assertions(1)

  function dispatch (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end()
  }

  const chain = inject(dispatch)
  chain
    .get('http://example.com:8080/hello')
    .end()
  expect(() => chain.payload('payload')).toThrow(Error)
})

test('chainable api: query method should work correctly', (done) => {
  expect.assertions(2)

  const query = {
    message: 'OK',
    xs: ['foo', 'bar']
  }

  function dispatch (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.url)
  }

  inject(dispatch)
    .get('http://example.com:8080/hello')
    .query(query)
    .end((err, res) => {
      expect(err).toBeFalsy()
      expect(parseQuery(res.payload)).toEqual(query)
      done()
    })
})

test('chainable api: query method should throw if already invoked', () => {
  expect.assertions(1)

  function dispatch (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end()
  }

  const chain = inject(dispatch)
  chain
    .get('http://example.com:8080/hello')
    .end()
  expect(() => chain.query({ foo: 'bar' })).toThrow(Error)
})

test('chainable api: invoking end method after promise method should throw', () => {
  expect.assertions(1)

  function dispatch (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end()
  }

  const chain = inject(dispatch).get('http://example.com:8080/hello')

  chain.then()
  expect(() => chain.end()).toThrow(Error)
})

test('chainable api: invoking promise method after end method with a callback function should throw', (done) => {
  expect.assertions(2)

  function dispatch (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end()
  }

  const chain = inject(dispatch).get('http://example.com:8080/hello')

  chain.end((err) => {
    expect(err).toBeFalsy()
    done()
  })
  expect(() => chain.then()).toThrow(Error)
})

test('chainable api: invoking promise method after end method without a callback function should work properly', (done) => {
  expect.assertions(1)

  function dispatch (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('hello')
  }

  inject(dispatch)
    .get('http://example.com:8080/hello')
    .end()
    .then(res => expect(res.payload).toBe('hello'))
    .finally(done)
})

test('chainable api: invoking end method multiple times should throw', () => {
  expect.assertions(1)

  function dispatch (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end()
  }

  const chain = inject(dispatch).get('http://example.com:8080/hello')

  chain.end()
  expect(() => chain.end()).toThrow(Error)
})

test('chainable api: string url', (done) => {
  expect.assertions(2)

  function dispatch (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end()
    expect('pass').toBeTruthy()
  }

  const chain = inject(dispatch, 'http://example.com:8080/hello')

  chain.then(() => expect('pass').toBeTruthy()).finally(done)
})

test('Response.json() should parse the JSON payload', (done) => {
  expect.assertions(2)

  const jsonData = {
    a: 1,
    b: '2'
  }

  const dispatch = function (_req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(jsonData))
  }

  inject(dispatch, { method: 'GET', path: 'http://example.com:8080/hello' }, (err, res) => {
    expect(err).toBeFalsy()
    const { json } = res
    expect(json()).toEqual(jsonData)
    done()
  })
})

test('Response.json() should not throw an error if content-type is not application/json', (done) => {
  expect.assertions(2)

  const jsonData = {
    a: 1,
    b: '2'
  }

  const dispatch = function (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(JSON.stringify(jsonData))
  }

  inject(dispatch, { method: 'GET', path: 'http://example.com:8080/hello' }, (err, res) => {
    expect(err).toBeFalsy()
    const { json } = res
    expect(json()).toEqual(jsonData)
    done()
  })
})

test('Response.json() should throw an error if the payload is not of valid JSON format', (done) => {
  expect.assertions(2)

  const dispatch = function (_req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('notAJSON')
  }

  inject(dispatch, { method: 'GET', path: 'http://example.com:8080/hello' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.json).toThrow(Error)
    done()
  })
})

test('Response.stream() should provide a Readable stream', (done) => {
  const lines = [
    JSON.stringify({ foo: 'bar' }),
    JSON.stringify({ hello: 'world' })
  ]

  expect.assertions(2 + lines.length)

  const dispatch = function (_req, res) {
    res.writeHead(200, { 'Content-Type': 'multiple/json' })
    for (const line of lines) {
      res.write(line)
    }
    res.end()
  }

  inject(dispatch, { method: 'GET', path: 'http://example.com:8080/hello' }, (err, res) => {
    expect(err).toBeFalsy()
    const readable = res.stream()
    const payload = []
    expect(readable instanceof Readable).toBe(true)
    readable.on('data', function (chunk) {
      payload.push(chunk)
    })
    readable.on('end', function () {
      for (let i = 0; i < lines.length; i++) {
        expect(lines[i]).toBe(payload[i].toString())
      }
      done()
    })
  })
})

test('promise api should auto start (fire and forget)', (done) => {
  expect.assertions(1)

  function dispatch (_req, res) {
    expect('dispatch called').toBeTruthy()
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end()
  }

  inject(dispatch, 'http://example.com:8080/hello')
  process.nextTick(done)
})

test('disabling autostart', (done) => {
  expect.assertions(3)

  let called = false

  function dispatch (_req, res) {
    expect('dispatch called').toBeTruthy()
    called = true
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end()
    done()
  }

  const p = inject(dispatch, {
    url: 'http://example.com:8080/hello',
    autoStart: false
  })

  setImmediate(() => {
    expect(called).toBe(false)
    p.then(() => {
      expect(called).toBe(true)
    })
  })
})

function getTestStream (encoding) {
  const word = 'hi'
  let i = 0

  const stream = new Readable({
    read () {
      this.push(word[i] ? word[i++] : null)
    }
  })

  if (encoding) {
    stream.setEncoding(encoding)
  }

  return stream
}

function readStream (stream, callback) {
  const chunks = []

  stream.on('data', (chunk) => chunks.push(chunk))

  stream.on('end', () => {
    return callback(Buffer.concat(chunks))
  })
}

test('send cookie', (done) => {
  expect.assertions(3)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers.host + '|' + req.headers.cookie)
  }

  inject(dispatch, { url: 'http://example.com:8080/hello', cookies: { foo: 'bar', grass: 'àìùòlé' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('example.com:8080|foo=bar; grass=%C3%A0%C3%AC%C3%B9%C3%B2l%C3%A9')
    expect(res.rawPayload.toString()).toBe('example.com:8080|foo=bar; grass=%C3%A0%C3%AC%C3%B9%C3%B2l%C3%A9')
    done()
  })
})

test('send cookie with header already set', (done) => {
  expect.assertions(3)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers.host + '|' + req.headers.cookie)
  }

  inject(dispatch, {
    url: 'http://example.com:8080/hello',
    headers: { cookie: 'custom=one' },
    cookies: { foo: 'bar', grass: 'àìùòlé' }
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('example.com:8080|custom=one; foo=bar; grass=%C3%A0%C3%AC%C3%B9%C3%B2l%C3%A9')
    expect(res.rawPayload.toString()).toBe('example.com:8080|custom=one; foo=bar; grass=%C3%A0%C3%AC%C3%B9%C3%B2l%C3%A9')
    done()
  })
})

test('read cookie', (done) => {
  expect.assertions(3)
  const dispatch = function (req, res) {
    res.setHeader('Set-Cookie', [
      'type=ninja',
      'dev=me; Expires=Fri, 17 Jan 2020 20:26:08 -0000; Max-Age=1234; Domain=.home.com; Path=/wow; Secure; HttpOnly; SameSite=Strict'
    ])
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers.host + '|' + req.headers.cookie)
  }

  inject(dispatch, { url: 'http://example.com:8080/hello', cookies: { foo: 'bar' } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('example.com:8080|foo=bar')
    expect(res.cookies).toEqual([
      { name: 'type', value: 'ninja' },
      {
        name: 'dev',
        value: 'me',
        expires: new Date('Fri, 17 Jan 2020 20:26:08 -0000'),
        maxAge: 1234,
        domain: '.home.com',
        path: '/wow',
        secure: true,
        httpOnly: true,
        sameSite: 'Strict'
      }
    ])
    done()
  })
})

test('correctly handles no string headers', (done) => {
  expect.assertions(3)
  const dispatch = function (req, res) {
    const payload = JSON.stringify(req.headers)
    res.writeHead(200, {
      'Content-Type': 'application/json',
      integer: 12,
      float: 3.14,
      null: null,
      string: 'string',
      object: { foo: 'bar' },
      array: [1, 'two', 3],
      date,
      true: true,
      false: false
    })
    res.end(payload)
  }

  const date = new Date(0)
  const headers = {
    integer: 12,
    float: 3.14,
    null: null,
    string: 'string',
    object: { foo: 'bar' },
    array: [1, 'two', 3],
    date,
    true: true,
    false: false
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello', headers }, (err, res) => {
    expect(err).toBeFalsy()

    expect(res.headers).toEqual({
      integer: '12',
      float: '3.14',
      null: 'null',
      string: 'string',
      object: '[object Object]',
      array: ['1', 'two', '3'],
      date: date.toString(),
      true: 'true',
      false: 'false',
      connection: 'keep-alive',
      'transfer-encoding': 'chunked',
      'content-type': 'application/json'
    })

    expect(JSON.parse(res.payload)).toEqual({
      integer: '12',
      float: '3.14',
      null: 'null',
      string: 'string',
      object: '[object Object]',
      array: '1,two,3',
      date: date.toString(),
      true: 'true',
      false: 'false',
      host: 'example.com:8080',
      'user-agent': 'lightMyRequest'
    })
    done()
  })
})

test('errors for invalid undefined header value', (done) => {
  expect.assertions(1)
  try {
    inject(() => {}, { url: '/', headers: { 'header-key': undefined } }, () => {})
  } catch (err) {
    expect(err).toBeTruthy()
    done()
  }
})

test('example with form-auto-content', (done) => {
  expect.assertions(4)
  const dispatch = function (req, res) {
    let body = ''
    req.on('data', d => {
      body += d
    })
    req.on('end', () => {
      res.end(body)
    })
  }

  const form = formAutoContent({
    myField: 'my value',
    myFile: fs.createReadStream('./LICENSE')
  })

  inject(dispatch, {
    method: 'POST',
    url: 'http://example.com:8080/hello',
    payload: form.payload,
    headers: form.headers
  }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.statusCode).toBe(200)
    expect(/--.+\r\nContent-Disposition: form-data; name="myField"\r\n\r\nmy value\r\n--.*/.test(res.payload)).toBeTruthy()
    expect(/--.+\r\nContent-Disposition: form-data; name="myFile"; filename="LICENSE"\r\n.*/.test(res.payload)).toBeTruthy()
    done()
  })
})

test('simulate invalid alter _lightMyRequest.isDone with end', (done) => {
  const dispatch = function (req) {
    req.resume()
    req._lightMyRequest.isDone = true
    req.on('end', () => {
      expect('should have end event').toBeTruthy()
      done()
    })
  }

  inject(dispatch, { method: 'GET', url: '/', simulate: { end: true } }, () => {
    expect.fail('should not have reply')
  })
})

test('simulate invalid alter _lightMyRequest.isDone without end', (done) => {
  const dispatch = function (req) {
    req.resume()
    req._lightMyRequest.isDone = true
    req.on('end', () => {
      expect.fail('should not have end event')
    })
    done()
  }

  inject(dispatch, { method: 'GET', url: '/', simulate: { end: false } }, () => {
    expect.fail('should not have reply')
  })
})

test('no error for response destroy', (done) => {
  expect.assertions(2)

  const dispatch = function (_req, res) {
    res.destroy()
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(res).toBe(null)
    expect(err.code).toBe('LIGHT_ECONNRESET')
    done()
  })
})

test('request destory without.assert.ifError', (done) => {
  expect.assertions(2)

  const dispatch = function (req) {
    req.destroy()
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(err.code).toBe('LIGHT_ECONNRESET')
    expect(res).toBe(null)
    done()
  })
})

test('request destory with error', (done) => {
  expect.assertions(2)

  const fakeError = new Error('some-err')

  const dispatch = function (req) {
    req.destroy(fakeError)
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(err).toBe(fakeError)
    expect(res).toBe(null)
    done()
  })
})

test('compatible with stream.finished', (done) => {
  expect.assertions(3)

  const dispatch = function (req, res) {
    finished(res, (err) => {
      expect(err instanceof Error).toBeTruthy()
    })

    req.destroy()
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(err.code).toBe('LIGHT_ECONNRESET')
    expect(res).toBe(null)
    done()
  })
})

test('compatible with eos', (done) => {
  expect.assertions(4)

  const dispatch = function (req, res) {
    eos(res, (err) => {
      expect(err instanceof Error).toBeTruthy()
    })

    req.destroy()
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(err).toBeTruthy()
    expect(err.code).toBe('LIGHT_ECONNRESET')
    expect(res).toBe(null)
    done()
  })
})

test('compatible with stream.finished pipe a Stream', (done) => {
  expect.assertions(3)

  const dispatch = function (_req, res) {
    finished(res, (err) => {
      expect(err).toBeFalsy()
    })

    new Readable({
      read () {
        this.push('hello world')
        this.push(null)
      }
    }).pipe(res)
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.body).toBe('hello world')
    done()
  })
})

test('compatible with eos, passes error correctly', (done) => {
  expect.assertions(3)

  const fakeError = new Error('some-error')

  const dispatch = function (req, res) {
    eos(res, (err) => {
      expect(err).toBe(fakeError)
    })

    req.destroy(fakeError)
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(err).toBe(fakeError)
    expect(res).toBe(null)
    done()
  })
})

test('multiple calls to req.destroy should not be called', (done) => {
  expect.assertions(2)

  const dispatch = function (req) {
    req.destroy()
    req.destroy() // twice
  }

  inject(dispatch, { method: 'GET', url: '/' }, (err, res) => {
    expect(res).toBe(null)
    expect(err.code).toBe('LIGHT_ECONNRESET')
    done()
  })
})

test('passes headers when using an express app', (done) => {
  expect.assertions(2)

  const app = express()

  app.get('/hello', (_req, res) => {
    res.setHeader('Some-Fancy-Header', 'a very cool value')
    res.end()
  })

  inject(app, { method: 'GET', url: 'http://example.com:8080/hello' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['some-fancy-header']).toBe('a very cool value')
    done()
  })
})

test('value of request url when using inject should not differ', (done) => {
  expect.assertions(1)

  const server = http.createServer()

  const dispatch = function (req, res) {
    res.end(req.url)
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080//hello', server })
    .then(res => { expect(res.body).toBe('//hello') })
    .catch(err => expect(err).toBeFalsy())
    .finally(done)
})

test('Can parse paths with single leading slash', () => {
  expect.assertions(1)
  const parsedURL = parseURL('/test', undefined)
  expect(parsedURL.href).toBe('http://localhost/test')
})

test('Can parse paths with two leading slashes', () => {
  expect.assertions(1)
  const parsedURL = parseURL('//test', undefined)
  expect(parsedURL.href).toBe('http://localhost//test')
})

test('Can parse URLs with two leading slashes', () => {
  expect.assertions(1)
  const parsedURL = parseURL('https://example.com//test', undefined)
  expect(parsedURL.href).toBe('https://example.com//test')
})

test('Can parse URLs with single leading slash', () => {
  expect.assertions(1)
  const parsedURL = parseURL('https://example.com/test', undefined)
  expect(parsedURL.href).toBe('https://example.com/test')
})

test('Can abort a request using AbortController/AbortSignal', () => {
  expect.assertions(1)

  const dispatch = function () {}

  const controller = new AbortController()
  const promise = inject(dispatch, {
    method: 'GET',
    url: 'http://example.com:8080/hello',
    signal: controller.signal
  })
  controller.abort()
  const wanted = new Error('The operation was aborted')
  wanted.name = 'AbortError'
  expect(promise).rejects.toThrow(wanted)
})

test('should pass req to ServerResponse', (done) => {
  if (parseInt(process.versions.node.split('.', 1)[0], 10) < 16) {
    expect('Skip because Node version < 16').toBeTruthy()
    t.end()
    return
  }

  expect.assertions(5)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers.host + '|' + req.url)
  }

  inject(dispatch, 'http://example.com:8080/hello', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.raw.req === res.raw.res.req).toBeTruthy()
    expect(res.raw.res.req.removeListener).toBeTruthy()
    expect(res.payload).toBe('example.com:8080|/hello')
    expect(res.rawPayload.toString()).toBe('example.com:8080|/hello')
    done()
  })
})

test('should work with pipeline', (done) => {
  expect.assertions(3)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    pipeline(req.headers.host + '|' + req.url, res, () => res.end())
  }

  inject(dispatch, 'http://example.com:8080/hello', (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe('example.com:8080|/hello')
    expect(res.rawPayload.toString()).toBe('example.com:8080|/hello')
    done()
  })
})

test('should leave the headers user-agent and content-type undefined when the headers are explicitly set to undefined in the inject', (done) => {
  expect.assertions(5)
  const dispatch = function (req, res) {
    expect(Array.isArray(req.rawHeaders)).toBeTruthy()
    expect(req.headers['user-agent']).toBe(undefined)
    expect(req.headers['content-type']).toBe(undefined)
    expect(req.headers['x-foo']).toBe('bar')
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Ok')
  }

  inject(dispatch, {
    url: 'http://example.com:8080/hello',
    method: 'POST',
    headers: {
      'x-foo': 'bar',
      'user-agent': undefined,
      'content-type': undefined
    },
    body: {}
  }, (err) => {
    expect(err).toBeFalsy()
    done()
  })
})

test("passes payload when using express' send", (done) => {
  expect.assertions(3)

  const app = express()

  app.get('/hello', (_req, res) => {
    res.send('some text')
  })

  inject(app, { method: 'GET', url: 'http://example.com:8080/hello' }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['content-length']).toBe('9')
    expect(res.payload).toBe('some text')
    done()
  })
})

test('request that is destroyed errors', (done) => {
  expect.assertions(2)
  const dispatch = function (req, res) {
    readStream(req, () => {
      req.destroy() // this should be a no-op
      setImmediate(() => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('hi')
      })
    })
  }

  const payload = getTestStream()

  inject(dispatch, { method: 'POST', url: '/', payload }, (err, res) => {
    expect(res).toBe(null)
    expect(err.code).toBe('LIGHT_ECONNRESET')
    done()
  })
})

function runFormDataUnitTest (name, { FormData, Blob }) {
  test(`${name} - form-data should be handled correctly`, (done) => {
    expect.assertions(23)

    const dispatch = function (req, res) {
      let body = ''
      expect(/multipart\/form-data; boundary=----formdata-[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}(--)?$/.test(req.headers['content-type'])).toBeTruthy()
      req.on('data', d => {
        body += d
      })
      req.on('end', () => {
        res.end(body)
      })
    }

    const form = new FormData()
    form.append('field', 'value')
    form.append('blob', new Blob(['value']), '')
    form.append('blob-with-type', new Blob(['value'], { type: 'text/plain' }), '')
    form.append('blob-with-name', new Blob(['value']), 'file.txt')
    form.append('number', 1)

    inject(dispatch, {
      method: 'POST',
      url: 'http://example.com:8080/hello',
      payload: form
    }, (err, res) => {
      expect(err).toBeFalsy()
      expect(res.statusCode).toBe(200)

      const regexp = [
      // header
        /^------formdata-[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}(--)?$/,
        // content-disposition
        /^Content-Disposition: form-data; name="(.*)"(; filename="(.*)")?$/,
        // content-type
        /^Content-Type: (.*)$/
      ]
      const readable = Readable.from(res.body.split('\r\n'))
      let i = 1
      readable.on('data', function (chunk) {
        switch (i) {
          case 1:
          case 5:
          case 10:
          case 15:
          case 20: {
          // header
            expect(regexp[0].test(chunk)).toBeTruthy()
            break
          }
          case 2:
          case 6:
          case 11:
          case 16: {
          // content-disposition
            expect(regexp[1].test(chunk)).toBeTruthy()
            break
          }
          case 7:
          case 12:
          case 17: {
          // content-type
            expect(regexp[2].test(chunk)).toBeTruthy()
            break
          }
          case 3:
          case 8:
          case 13:
          case 18: {
          // empty
            expect(chunk).toBe('')
            break
          }
          case 4:
          case 9:
          case 14:
          case 19: {
          // value
            expect(chunk).toBe('value')
            break
          }
        }
        i++
      })
      done()
    })
  })
}

// supports >= node@18
runFormDataUnitTest('native', { FormData: globalThis.FormData, Blob: globalThis.Blob })
// supports >= node@16
runFormDataUnitTest('undici', { FormData: require('undici').FormData, Blob: require('node:buffer').Blob })
// supports >= node@14
runFormDataUnitTest('formdata-node', { FormData: require('formdata-node').FormData, Blob: require('formdata-node').Blob })

test('QUERY method works', (done) => {
  expect.assertions(3)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'content-type': req.headers['content-type'] })
    req.pipe(res)
  }

  inject(dispatch, { method: 'QUERY', url: '/test', payload: { a: 1 } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['content-type']).toBe('application/json')
    expect(res.payload).toBe('{"a":1}')
    done()
  })
})

test('query method works', (done) => {
  expect.assertions(3)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'content-type': req.headers['content-type'] })
    req.pipe(res)
  }

  inject(dispatch, { method: 'query', url: '/test', payload: { a: 1 } }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['content-type']).toBe('application/json')
    expect(res.payload).toBe('{"a":1}')
    done()
  })
})

test('should return the file content', async () => {
  const multerMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 1024
    }
  })

  const app = express()

  app.use((req, res, next) => {
    if (req.headers['content-type'].indexOf('multipart/form-data') === 0) {
      req.multipart = true
    }
    next()
  })

  app.post('/hello', multerMiddleware.single('textFile'), (req, res) => {
    res.send(req.file.buffer.toString('utf8'))
  })
  app.use((err, req, res, next) => {
    console.warn(err)
    res.status(500).send('Something was wrong')
  })

  const formData = new FormData()
  formData.append('textFile', new Blob(['some data']), 'sample.txt')

  const response = await inject(app, {
    method: 'POST',
    url: 'http://example.com:8080/hello',
    payload: formData
  })

  expect(response.statusCode).toBe(200)
  expect(response.payload).toBe('some data')
})
