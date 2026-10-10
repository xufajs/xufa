// @xufa/mongo: a MongoDB driver with no dependencies, with the API of the official driver for what applications use
// most (see lib/client.js), BSON included. The MongoDB backend of @xufa/orm is made with it.
import { MongoClient, Db, Collection, Cursor, ClientSession, parseUrl } from './lib/client.js';
import * as bson from './lib/bson.js';

export * from './lib/bson.js';
export * from './lib/errors.js';

export { MongoClient, Db, Collection, Cursor, ClientSession, parseUrl, bson };
