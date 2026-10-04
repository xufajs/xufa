// @xufa/mongo: a MongoDB driver with no dependencies, with the API of the official driver for what applications use
// most (see lib/client.js), BSON included. The MongoDB backend of @xufa/orm is made with it.
const { MongoClient, Db, Collection, Cursor, ClientSession, parseUrl } = require('./lib/client');
const bson = require('./lib/bson');
const errors = require('./lib/errors');

module.exports = {
  MongoClient,
  Db,
  Collection,
  Cursor,
  ClientSession,
  parseUrl,
  ...bson,
  bson,
  ...errors,
};
