'use strict'

const fp = require('..').plugin

module.exports = fp(function (fastify, opts, done) {
  fastify.decorate('test', () => {})
  done()
})
