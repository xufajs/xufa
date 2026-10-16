'use strict'

require('./support/env.js')
// (mocha: the context of the suites, this.)
var ctx = {}

var express = require('../../index.js')
  , request = require('../support/supertest.cjs');

describe('req', function(){
  describe('.xhr', function(){
    beforeAll(function () {
      ctx.app = express()
      ctx.app.get('/', function (req, res) {
        res.send(req.xhr)
      })
    })

    it('should return true when X-Requested-With is xmlhttprequest', function(done){
      request(ctx.app)
        .get('/')
        .set('X-Requested-With', 'xmlhttprequest')
        .expect(200, 'true', done)
    })

    it('should case-insensitive', function(done){
      request(ctx.app)
        .get('/')
        .set('X-Requested-With', 'XMLHttpRequest')
        .expect(200, 'true', done)
    })

    it('should return false otherwise', function(done){
      request(ctx.app)
        .get('/')
        .set('X-Requested-With', 'blahblah')
        .expect(200, 'false', done)
    })

    it('should return false when not present', function(done){
      request(ctx.app)
        .get('/')
        .expect(200, 'false', done)
    })
  })
})
