'use strict'

require('./support/env.js')

var express = require('../../index.js')
  , request = require('../support/supertest.cjs');

describe('req', function(){
  describe('.path', function(){
    it('should return the parsed pathname', function(done){
      var app = express();

      app.use(function(req, res){
        res.end(req.path);
      });

      request(app)
      .get('/login?redirect=/post/1/comments')
      .expect('/login', done);
    })
  })
})
