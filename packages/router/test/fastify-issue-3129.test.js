'use strict'


const FindMyWay = require('../')

test('contain param and wildcard together', () => {
  expect.assertions(4)

  const findMyWay = FindMyWay({
    defaultRoute: (req, res) => {
      expect.fail('we should not be here, the url is: ' + req.url)
    }
  })

  findMyWay.on('GET', '/:lang/item/:id', (req, res, params) => {
    expect(params.lang).toEqual('fr')
    expect(params.id).toEqual('12345')
  })

  findMyWay.on('GET', '/:lang/item/*', (req, res, params) => {
    expect(params.lang).toEqual('fr')
    expect(params['*']).toEqual('12345/edit')
  })

  findMyWay.lookup(
    { method: 'GET', url: '/fr/item/12345', headers: {} },
    null
  )

  findMyWay.lookup(
    { method: 'GET', url: '/fr/item/12345/edit', headers: {} },
    null
  )
})
