'use strict'


const FindMyWay = require('..')

test('Constraints should not be overrided when multiple router is created', () => {
  expect.assertions(1)

  const constraint = {
    name: 'secret',
    storage: function () {
      const secrets = {}
      return {
        get: (secret) => { return secrets[secret] || null },
        set: (secret, store) => { secrets[secret] = store }
      }
    },
    deriveConstraint: (req, ctx) => {
      return req.headers['x-secret']
    },
    validate () { return true }
  }

  const router1 = FindMyWay({ constraints: { secret: constraint } })
  FindMyWay()

  router1.on('GET', '/', { constraints: { secret: 'alpha' } }, () => {})
  router1.find('GET', '/', { secret: 'alpha' })

  expect('constraints is not overrided').toBeTruthy()
})
