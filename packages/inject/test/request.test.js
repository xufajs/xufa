'use strict'



const Request = require('../lib/request')

test('aborted property should be false', async () => {
  const mockReq = {
    url: 'http://localhost',
    method: 'GET',
    headers: {}
  }
  const req = new Request(mockReq)

  expect(req.aborted).toBe(false)
})
