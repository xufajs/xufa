'use strict'


const fs = require('node:fs')

const zlib = require('node:zlib')
const express = require('express')

const inject = require('../index')

function accumulate (stream, cb) {
  const chunks = []
  stream.on('error', cb)
  stream.on('data', (chunk) => {
    chunks.push(chunk)
  })
  stream.on('end', () => {
    cb(null, Buffer.concat(chunks))
  })
}

test('stream mode - non-chunked payload', (done) => {
  expect.assertions(9)
  const output = 'example.com:8080|/hello'

  const dispatch = function (req, res) {
    res.statusMessage = 'Super'
    res.setHeader('x-extra', 'hello')
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': output.length })
    res.end(req.headers.host + '|' + req.url)
  }

  inject(dispatch, {
    url: 'http://example.com:8080/hello',
    payloadAsStream: true
  }, (err, res) => {
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
    expect(res.payload).toBe(undefined)
    expect(res.rawPayload).toBe(undefined)

    accumulate(res.stream(), (err, payload) => {
      expect(err).toBeFalsy()
      expect(payload.toString()).toBe('example.com:8080|/hello')
      done()
    })
  })
})

test('stream mode - passes headers', (done) => {
  expect.assertions(3)
  const dispatch = function (req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(req.headers.super)
  }

  inject(dispatch, {
    method: 'GET',
    url: 'http://example.com:8080/hello',
    headers: { Super: 'duper' },
    payloadAsStream: true
  }, (err, res) => {
    expect(err).toBeFalsy()
    accumulate(res.stream(), (err, payload) => {
      expect(err).toBeFalsy()
      expect(payload.toString()).toBe('duper')
      done()
    })
  })
})

test('stream mode - returns chunked payload', (done) => {
  expect.assertions(6)
  const dispatch = function (_req, res) {
    res.writeHead(200, 'OK')
    res.write('a')
    res.write('b')
    res.end()
  }

  inject(dispatch, { method: 'GET', url: '/', payloadAsStream: true }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers.date).toBeTruthy()
    expect(res.headers.connection).toBeTruthy()
    expect(res.headers['transfer-encoding']).toBe('chunked')
    accumulate(res.stream(), (err, payload) => {
      expect(err).toBeFalsy()
      expect(payload.toString()).toBe('ab')
      done()
    })
  })
})

test('stream mode - backpressure', (done) => {
  expect.assertions(7)
  let expected
  const dispatch = function (_req, res) {
    res.writeHead(200, 'OK')
    res.write('a')
    const buf = Buffer.alloc(1024 * 1024).fill('b')
    expect(res.write(buf)).toBe(false)
    expected = 'a' + buf.toString()
    res.on('drain', () => {
      res.end()
    })
  }

  inject(dispatch, { method: 'GET', url: '/', payloadAsStream: true }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers.date).toBeTruthy()
    expect(res.headers.connection).toBeTruthy()
    expect(res.headers['transfer-encoding']).toBe('chunked')
    accumulate(res.stream(), (err, payload) => {
      expect(err).toBeFalsy()
      expect(payload.toString()).toBe(expected)
      done()
    })
  })
})

test('stream mode - sets trailers in response object', (done) => {
  expect.assertions(4)
  const dispatch = function (_req, res) {
    res.setHeader('Trailer', 'Test')
    res.addTrailers({ Test: 123 })
    res.end()
  }

  inject(dispatch, { method: 'GET', url: '/', payloadAsStream: true }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers.trailer).toBe('Test')
    expect(res.headers.test).toBe(undefined)
    expect(res.trailers.test).toBe('123')
    done()
  })
})

test('stream mode - parses zipped payload', (done) => {
  expect.assertions(5)
  const dispatch = function (_req, res) {
    res.writeHead(200, 'OK')
    const stream = fs.createReadStream('./package.json')
    stream.pipe(zlib.createGzip()).pipe(res)
  }

  inject(dispatch, { method: 'GET', url: '/', payloadAsStream: true }, (err, res) => {
    expect(err).toBeFalsy()
    fs.readFile('./package.json', { encoding: 'utf-8' }, (err, file) => {
      expect(err).toBeFalsy()

      accumulate(res.stream(), (err, payload) => {
        expect(err).toBeFalsy()

        zlib.unzip(payload, (err, unzipped) => {
          expect(err).toBeFalsy()
          expect(unzipped.toString('utf-8')).toBe(file)
          done()
        })
      })
    })
  })
})

test('stream mode - returns multi buffer payload', (done) => {
  expect.assertions(3)
  const dispatch = function (_req, res) {
    res.writeHead(200)
    res.write('a')
    res.write(Buffer.from('b'))
    res.end()
  }

  inject(dispatch, { method: 'GET', url: '/', payloadAsStream: true }, (err, res) => {
    expect(err).toBeFalsy()

    const chunks = []
    const stream = res.stream()
    stream.on('data', (chunk) => {
      chunks.push(chunk)
    })

    stream.on('end', () => {
      expect(chunks.length).toBe(2)
      expect(Buffer.concat(chunks).toString()).toBe('ab')
      done()
    })
  })
})

test('stream mode - returns null payload', (done) => {
  expect.assertions(4)
  const dispatch = function (_req, res) {
    res.writeHead(200, { 'Content-Length': 0 })
    res.end()
  }

  inject(dispatch, { method: 'GET', url: '/', payloadAsStream: true }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.payload).toBe(undefined)
    accumulate(res.stream(), (err, payload) => {
      expect(err).toBeFalsy()
      expect(payload.toString()).toBe('')
      done()
    })
  })
})

test('stream mode - simulates error', (done) => {
  expect.assertions(3)
  const dispatch = function (req, res) {
    req.on('readable', () => {
    })

    req.on('error', () => {
      res.writeHead(200, { 'Content-Length': 0 })
      res.end('error')
    })
  }

  const body = 'something special just for you'
  inject(dispatch, { method: 'GET', url: '/', payload: body, simulate: { error: true }, payloadAsStream: true }, (err, res) => {
    expect(err).toBeFalsy()
    accumulate(res.stream(), (err, payload) => {
      expect(err).toBeFalsy()
      expect(payload.toString()).toBe('error')
      done()
    })
  })
})

test('stream mode - promises support', (done) => {
  expect.assertions(1)
  const dispatch = function (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('hello')
  }

  inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello', payloadAsStream: true })
    .then((res) => {
      return new Promise((resolve, reject) => {
        accumulate(res.stream(), (err, payload) => {
          if (err) {
            return reject(err)
          }
          resolve(payload)
        })
      })
    })
    .then(payload => expect(payload.toString()).toBe('hello'))
    .catch(expect.fail)
    .finally(done)
})

test('stream mode - Response.json() should throw', (done) => {
  expect.assertions(2)

  const jsonData = {
    a: 1,
    b: '2'
  }

  const dispatch = function (_req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(jsonData))
  }

  inject(dispatch, { method: 'GET', path: 'http://example.com:8080/hello', payloadAsStream: true }, (err, res) => {
    expect(err).toBeFalsy()
    const { json } = res
    expect(json).toThrow(Error)
    done()
  })
})

test('stream mode - error for response destroy', (done) => {
  expect.assertions(2)

  const dispatch = function (_req, res) {
    res.writeHead(200)
    setImmediate(() => {
      res.destroy()
    })
  }

  inject(dispatch, { method: 'GET', url: '/', payloadAsStream: true }, (err, res) => {
    expect(err).toBeFalsy()
    accumulate(res.stream(), (err) => {
      expect(err).toBeTruthy()
      done()
    })
  })
})

test('stream mode - request destroy with error', (done) => {
  expect.assertions(3)

  const fakeError = new Error('some-err')

  const dispatch = function (req) {
    req.destroy(fakeError)
  }

  inject(dispatch, { method: 'GET', url: '/', payloadAsStream: true }, (err, res) => {
    expect(err).toBeTruthy()
    expect(err).toBe(fakeError)
    expect(res).toBe(null)
    done()
  })
})

test('stream mode - Can abort a request using AbortController/AbortSignal', async () => {
  const dispatch = function (_req, res) {
    res.writeHead(200)
  }

  const controller = new AbortController()
  const res = await inject(dispatch, {
    method: 'GET',
    url: 'http://example.com:8080/hello',
    signal: controller.signal,
    payloadAsStream: true
  })
  controller.abort()

  await expect((async () => {
    for await (const c of res.stream()) {
      expect.fail(`should not loop, got ${c.toString()}`)
    }
  })()).rejects.toThrow(Error)
})

test("stream mode - passes payload when using express' send", (done) => {
  expect.assertions(4)

  const app = express()

  app.get('/hello', (_req, res) => {
    res.send('some text')
  })

  inject(app, { method: 'GET', url: 'http://example.com:8080/hello', payloadAsStream: true }, (err, res) => {
    expect(err).toBeFalsy()
    expect(res.headers['content-length']).toBe('9')
    accumulate(res.stream(), function (err, payload) {
      expect(err).toBeFalsy()
      expect(payload.toString()).toBe('some text')
      done()
    })
  })
})
