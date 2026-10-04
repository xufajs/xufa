'use strict'


const inject = require('../index')

test('basic async await', async () => {
  const dispatch = function (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('hello')
  }

  try {
    const res = await inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello' })
    expect(res.payload).toBe('hello')
  } catch (err) {
    expect.fail(err)
  }
})

test('basic async await (errored)', async () => {
  const dispatch = function (_req, res) {
    res.connection.destroy(new Error('kaboom'))
  }

  await expect((() => inject(dispatch, { method: 'GET', url: 'http://example.com:8080/hello' }))()).rejects.toThrow(Error)
})

test('chainable api with async await', async () => {
  const dispatch = function (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('hello')
  }

  try {
    const chain = inject(dispatch).get('http://example.com:8080/hello')
    const res = await chain.end()
    expect(res.payload).toBe('hello')
  } catch (err) {
    expect.fail(err)
  }
})

test('chainable api with async await without end()', async () => {
  const dispatch = function (_req, res) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('hello')
  }

  try {
    const res = await inject(dispatch).get('http://example.com:8080/hello')
    expect(res.payload).toBe('hello')
  } catch (err) {
    expect.fail(err)
  }
})
