import FindMyWay from '../index.js';

test('should return result in the done callback', () => {
  expect.assertions(2)

  const router = FindMyWay()
  router.on('GET', '/', () => 'asyncHandlerResult')

  router.lookup({ method: 'GET', url: '/' }, null, (err, result) => {
    expect(err).toBe(null)
    expect(result).toBe('asyncHandlerResult')
  })
})

test('should return an error in the done callback', () => {
  expect.assertions(2)

  const router = FindMyWay()
  const error = new Error('ASYNC_HANDLER_ERROR')
  router.on('GET', '/', () => { throw error })

  router.lookup({ method: 'GET', url: '/' }, null, (err, result) => {
    expect(err).toBe(error)
    expect(result).toBe(undefined)
  })
})
