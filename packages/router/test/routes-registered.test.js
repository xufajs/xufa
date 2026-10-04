'use strict'


const FindMyWay = require('../')

function initializeRoutes (router, handler, quantity) {
  for (const x of Array(quantity).keys()) {
    router.on('GET', '/test-route-' + x, handler)
  }
  return router
}

test('verify routes registered', () => {
  const assertPerTest = 5
  const quantity = 5
  // 1 (check length) + quantity of routes * quantity of tests per route
  expect.assertions(1 + (quantity * assertPerTest))

  let findMyWay = FindMyWay()
  const defaultHandler = (req, res, params) => res.end(JSON.stringify({ hello: 'world' }))

  findMyWay = initializeRoutes(findMyWay, defaultHandler, quantity)
  expect(findMyWay.routes.length).toBe(quantity)
  findMyWay.routes.forEach((route, idx) => {
    expect(route.method).toBe('GET')
    expect(route.path).toBe('/test-route-' + idx)
    expect(route.opts).toEqual({})
    expect(route.handler).toBe(defaultHandler)
    expect(route.store).toBe(undefined)
  })
})

test('verify routes registered and deregister', () => {
  // 1 (check length) + quantity of routes * quantity of tests per route
  expect.assertions(2)

  let findMyWay = FindMyWay()
  const quantity = 2
  const defaultHandler = (req, res, params) => res.end(JSON.stringify({ hello: 'world' }))

  findMyWay = initializeRoutes(findMyWay, defaultHandler, quantity)
  expect(findMyWay.routes.length).toBe(quantity)
  findMyWay.off('GET', '/test-route-0')
  expect(findMyWay.routes.length).toBe(quantity - 1)
})
