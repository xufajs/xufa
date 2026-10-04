// @xufa/orm: the ORM of xufa. Models and QuerySets in the spirit of Django over SQL and NoSQL databases: a query is
// described once (lib/query.js) and every backend compiles it to its database.
//
//   const { Database, Model, fields } = require('@xufa/orm');
//
//   class Author extends Model {
//     static fields = { name: fields.string({ maxLength: 100 }) };
//   }
//   const db = new Database({ backend: 'sqlite', filename: 'app.db' }).register(Author);
//   await db.connect();
//   await db.sync();
//   await Author.objects.create({ name: 'Ada' });
//   const authors = await Author.objects.filter({ name__istartswith: 'a' }).orderBy('name');
const fields = require('./lib/fields');
const errors = require('./lib/errors');
const { Model } = require('./lib/model');
const { QuerySet } = require('./lib/queryset');
const { Database } = require('./lib/database');
const { Databases } = require('./lib/databases');
const { Tenants } = require('./lib/tenants');
const { Q, JsonPath, jsonPath, and, or, not, F, Raw, Count, Sum, Avg, Min, Max } = require('./lib/query');
const { Backend } = require('./lib/backends/base');
const { MemoryBackend } = require('./lib/backends/memory');
const { SqlBackend } = require('./lib/backends/sql/backend');
const { SqlCompiler } = require('./lib/backends/sql/compiler');
const dialects = require('./lib/backends/sql/dialects');
const { ormPlugin } = require('./lib/plugin');
const { resource } = require('./lib/resource');
const { MemoryCache, SharedCache, LocalCache } = require('./lib/cache');
const migrations = require('./lib/migrations');
const { toHstore, parseHstore } = require('./lib/hstore');
const encryption = require('./lib/encryption');

Database.registerBackend('memory', () => MemoryBackend);
Database.registerBackend('sqlite', () => require('./lib/backends/sqlite').SqliteBackend);
Database.registerBackend('mongodb', () => require('./lib/backends/mongo/backend').MongoBackend);
Database.registerBackend('postgres', () => require('./lib/backends/postgres').PostgresBackend);

module.exports = {
  toHstore,
  parseHstore,
  Database,
  Databases,
  Tenants,
  Model,
  QuerySet,
  fields,
  Q,
  JsonPath,
  jsonPath,
  and,
  or,
  not,
  F,
  Raw,
  Count,
  Sum,
  Avg,
  Min,
  Max,
  errors,
  ...errors,
  plugin: ormPlugin,
  resource,
  MemoryCache,
  SharedCache,
  LocalCache,
  migrations,
  Keyring: encryption.Keyring,
  setEncryptionKeys: encryption.setEncryptionKeys,
  generateEncryptionKey: encryption.generateEncryptionKey,
  isEncrypted: encryption.isEncrypted,
  reencrypt: encryption.reencrypt,
  backends: { Backend, MemoryBackend, SqlBackend, SqlCompiler, dialects },
};
