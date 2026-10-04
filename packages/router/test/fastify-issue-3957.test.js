'use strict'


const FindMyWay = require('../')

test('wildcard should not limit by maxParamLength', () => {
  expect.assertions(1)

  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '*', (req, res, params) => {
    expect(params['*']).toEqual('/portfolios/b5859fb9-6c76-4db8-b3d1-337c5be3fd8b/instruments/2a694406-b43f-439d-aa11-0c814805c930/positions')
  })

  findMyWay.lookup(
    { method: 'GET', url: '/portfolios/b5859fb9-6c76-4db8-b3d1-337c5be3fd8b/instruments/2a694406-b43f-439d-aa11-0c814805c930/positions', headers: {} },
    null
  )
})
