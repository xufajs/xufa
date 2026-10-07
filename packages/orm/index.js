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
const { Model, modelOptions } = require('./lib/model');
const { AuditEntry, auditResource } = require('./lib/audit');
const { QuerySet } = require('./lib/queryset');
const { Database } = require('./lib/database');
const { Databases } = require('./lib/databases');
const { Tenants } = require('./lib/tenants');
const {
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
  Extract,
  Trunc,
} = require('./lib/query');
const { Backend } = require('./lib/backends/base');
const { MemoryBackend } = require('./lib/backends/memory');
const { FsBackend } = require('./lib/backends/fs');
const { BlobBackend } = require('./lib/backends/blob/base');
const { BlobValue } = require('./lib/blob');
const { Faults } = require('@xufa/faults');
const { FaultError } = require('./lib/faults');
const { SqlBackend } = require('./lib/backends/sql/backend');
const { SqlCompiler } = require('./lib/backends/sql/compiler');
const dialects = require('./lib/backends/sql/dialects');
const { ormPlugin } = require('./lib/plugin');
const { resource } = require('./lib/resource');
const { MemoryCache, SharedCache, LocalCache } = require('./lib/cache');
const migrations = require('./lib/migrations');
const { toHstore, parseHstore } = require('./lib/hstore');
const encryption = require('./lib/encryption');
const { withSignal } = require('./lib/context');
const { cached } = require('./lib/query-cache');

Database.registerBackend('memory', () => MemoryBackend);
Database.registerBackend('fs', () => FsBackend);
Database.registerBackend('sqlite', () => require('./lib/backends/sqlite').SqliteBackend);
Database.registerBackend('mongodb', () => require('./lib/backends/mongo/backend').MongoBackend);
Database.registerBackend('postgres', () => require('./lib/backends/postgres').PostgresBackend);
Database.registerBackend('memory-blob', () => require('./lib/backends/blob/memory').MemoryBlobBackend);
Database.registerBackend('disk', () => require('./lib/backends/blob/disk').DiskBackend);
Database.registerBackend('s3', () => require('./lib/backends/blob/s3').S3Backend);
Database.registerBackend('azure-blob', () => require('./lib/backends/blob/azure').AzureBackend);
Database.registerBackend('smtp', () => require('./lib/backends/mail/smtp').SmtpBackend);
Database.registerBackend('memory-mail', () => require('./lib/backends/mail/memory').MemoryMailBackend);

const { factory, sequence, Factory } = require('./lib/factory');
const { maintenance } = require('./lib/maintenance');
const { CombinedQuerySet } = require('./lib/combine');

module.exports = {
  maintenance,
  CombinedQuerySet,
  factory,
  sequence,
  Factory,
  toHstore,
  parseHstore,
  Database,
  Databases,
  Tenants,
  withSignal,
  cached,
  Model,
  modelOptions,
  AuditEntry,
  auditResource,
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
  Extract,
  Trunc,
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
  BlobValue,
  Faults,
  FaultError,
  backends: { Backend, MemoryBackend, FsBackend, BlobBackend, SqlBackend, SqlCompiler, dialects },
};
