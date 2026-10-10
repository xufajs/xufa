import ____1 from '../index.js';
const httpMethods = ____1.httpMethods;

import FindMyWay from '../index.js';

describe('should support shorthand', () => {
  for (const i in httpMethods) {
    const m = httpMethods[i]
    const methodName = m.toLowerCase()

    test('`.' + methodName + '`', () => {
      expect.assertions(1)
      const findMyWay = FindMyWay()

      findMyWay[methodName]('/test', () => {
        expect('inside the handler').toBeTruthy()
      })

      findMyWay.lookup({ method: m, url: '/test', headers: {} }, null)
    })
  }
})

test('should support `.all` shorthand', () => {
  expect.assertions(11)
  const findMyWay = FindMyWay()

  findMyWay.all('/test', () => {
    expect('inside the handler').toBeTruthy()
  })

  findMyWay.lookup({ method: 'GET', url: '/test', headers: {} }, null)
  findMyWay.lookup({ method: 'DELETE', url: '/test', headers: {} }, null)
  findMyWay.lookup({ method: 'HEAD', url: '/test', headers: {} }, null)
  findMyWay.lookup({ method: 'PATCH', url: '/test', headers: {} }, null)
  findMyWay.lookup({ method: 'POST', url: '/test', headers: {} }, null)
  findMyWay.lookup({ method: 'PUT', url: '/test', headers: {} }, null)
  findMyWay.lookup({ method: 'OPTIONS', url: '/test', headers: {} }, null)
  findMyWay.lookup({ method: 'TRACE', url: '/test', headers: {} }, null)
  findMyWay.lookup({ method: 'CONNECT', url: '/test', headers: {} }, null)
  findMyWay.lookup({ method: 'COPY', url: '/test', headers: {} }, null)
  findMyWay.lookup({ method: 'SUBSCRIBE', url: '/test', headers: {} }, null)
})
