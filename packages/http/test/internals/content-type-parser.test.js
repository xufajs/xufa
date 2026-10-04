'use strict'


const proxyquire = require('proxyquire')
const { Readable } = require('node:stream')
const { kTestInternals, kRouteContext } = require('../../lib/symbols')
const Request = require('../../lib/request')
const Reply = require('../../lib/reply')

test('rawBody function', async () => {
  expect.assertions(2)

  const internals = require('../../lib/content-type-parser')[kTestInternals]
  const body = Buffer.from('你好 世界')
  const parser = {
    asString: true,
    asBuffer: false,
    fn (req, bodyInString, done) {
      expect(bodyInString).toBe(body.toString())
      expect(typeof done).toBe('function')
      return {
        then (cb) {
          cb()
        }
      }
    }
  }
  const res = {}
  res.end = () => { }
  res.writeHead = () => { }

  res.log = { error: () => { }, info: () => { } }
  const context = {
    Reply,
    Request,
    preHandler: [],
    onSend: [],
    _parserOptions: {
      limit: 1024
    }
  }
  const rs = new Readable()
  rs._read = function () { }
  rs.headers = { 'content-length': body.length }
  const request = new Request('id', 'params', rs, 'query', 'log', context)
  const reply = new Reply(res, request)
  const done = () => { }

  internals.rawBody(
    request,
    reply,
    reply[kRouteContext]._parserOptions,
    parser,
    done
  )
  rs.emit('data', body.toString())
  rs.emit('end')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('Should support Webpack and faux modules', async () => {
  expect.assertions(2)

  const internals = proxyquire('../../lib/content-type-parser', {
    'toad-cache': { default: () => { } }
  })[kTestInternals]

  const body = Buffer.from('你好 世界')
  const parser = {
    asString: true,
    asBuffer: false,
    fn (req, bodyInString, done) {
      expect(bodyInString).toBe(body.toString())
      expect(typeof done).toBe('function')
      return {
        then (cb) {
          cb()
        }
      }
    }
  }
  const res = {}
  res.end = () => { }
  res.writeHead = () => { }

  res.log = { error: () => { }, info: () => { } }
  const context = {
    Reply,
    Request,
    preHandler: [],
    onSend: [],
    _parserOptions: {
      limit: 1024
    }
  }
  const rs = new Readable()
  rs._read = function () { }
  rs.headers = { 'content-length': body.length }
  const request = new Request('id', 'params', rs, 'query', 'log', context)
  const reply = new Reply(res, request)
  const done = () => { }

  internals.rawBody(
    request,
    reply,
    reply[kRouteContext]._parserOptions,
    parser,
    done
  )
  rs.emit('data', body.toString())
  rs.emit('end')

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
