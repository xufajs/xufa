'use strict'


const { kRouteContext } = require('../../lib/symbols')
const Context = require('../../lib/context')

const Fastify = require('../..')

describe('context', () => {

test('Should not contain undefined as key prop', async () => {
    expect.assertions(4)
    const app = Fastify()

    app.get('/', (req, reply) => {
      expect(req[kRouteContext] instanceof Context).toBeTruthy()
      expect(reply[kRouteContext] instanceof Context).toBeTruthy()
      expect('undefined' in reply[kRouteContext]).toBeFalsy()
      expect('undefined' in req[kRouteContext]).toBeFalsy()

      reply.send('hello world!')
    })

    try {
      await app.inject('/')
    } catch (e) {
      expect.fail(e)
    }
  })
})
