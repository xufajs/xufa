'use strict'

const fp = require('@xufa/http').plugin

module.exports = fp(function (fastify, opts, done) {
  fastify.decorate('test', () => {})
  done()
})
