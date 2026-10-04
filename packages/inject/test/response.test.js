'use strict'



const Response = require('../lib/response')

test('multiple calls to res.destroy should not be called', (done) => {
  expect.assertions(2)

  const mockReq = {}
  const res = new Response(mockReq, (err) => {
    expect(err).toBeTruthy()
    expect(err.code).toBe('LIGHT_ECONNRESET')
    done()
  })

  res.destroy()
  res.destroy()
})
