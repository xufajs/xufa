'use strict'

require('./support/env.js')

var express = require('../../index.js')
  , request = require('../support/supertest.cjs');

describe('throw after .end()', function(){
  it('should fail gracefully', function(done){
    var app = express();

    app.get('/', function(req, res){
      res.end('yay');
      throw new Error('boom');
    });

    request(app)
    .get('/')
    .expect('yay')
    .expect(200, done);
  })
})
