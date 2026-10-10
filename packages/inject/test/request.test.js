import Request from '../lib/request.js';

test('aborted property should be false', async () => {
  const mockReq = {
    url: 'http://localhost',
    method: 'GET',
    headers: {}
  }
  const req = new Request(mockReq)

  expect(req.aborted).toBe(false)
})
