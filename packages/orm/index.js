// @xufa/orm: the ORM of xufa. Models and QuerySets in the spirit of Django over SQL and NoSQL databases: a query is
// described once (lib/query.js) and every backend compiles it to its database.
//
//   import { Database, Model, fields } from '@xufa/orm';
//
//   class Author extends Model {
//     static fields = { name: fields.string({ maxLength: 100 }) };
//   }
//   const db = new Database({ backend: 'sqlite', filename: 'app.db' }).register(Author);
//   await db.connect();
//   await db.sync();
//   await Author.objects.create({ name: 'Ada' });
//   const authors = await Author.objects.filter({ name__istartswith: 'a' }).orderBy('name');
import fields from './lib/fields.js';
import * as errors from './lib/errors.js';
import { Model, modelOptions } from './lib/model.js';
import { AuditEntry, auditResource } from './lib/audit.js';
import { QuerySet } from './lib/queryset.js';
import { Paginator, Page, InvalidPage, PageNotAnInteger, EmptyPage } from './lib/paginator.js';
import { KeysetPaginator, KeysetPage } from './lib/keyset.js';
import { Lower } from './lib/constraints.js';
import { Database } from './lib/database.js';
import * as orm from './index.js';
import { Databases } from './lib/databases.js';
import { Tenants } from './lib/tenants.js';
import { Q, JsonPath, jsonPath, and, or, not, F, Raw, Count, Sum, Avg, Min, Max, Extract, Trunc } from './lib/query.js';
import { Backend } from './lib/backends/base.js';
import { MemoryBackend } from './lib/backends/memory.js';
import { FsBackend } from './lib/backends/fs.js';
import { BlobBackend } from './lib/backends/blob/base.js';
import { BlobValue } from './lib/blob.js';
import { Faults } from '@xufa/faults';
import { FaultError } from './lib/faults.js';
import { SqlBackend } from './lib/backends/sql/backend.js';
import { SqlCompiler } from './lib/backends/sql/compiler.js';
import * as dialects from './lib/backends/sql/dialects.js';
import { ormPlugin } from './lib/plugin.js';
import { resource } from './lib/resource.js';
import { rollbackEach } from './lib/testing.js';
import { modelsFromSpec, specOf, SpecError, TYPES as SPEC_TYPES } from './lib/spec.js';
import { message as validationMessage, setTranslator, MESSAGES } from './lib/messages.js';
import { MemoryCache, SharedCache, LocalCache } from './lib/cache.js';
import * as migrations from './lib/migrations.js';
import { toHstore, parseHstore } from './lib/hstore.js';
import * as encryption from './lib/encryption.js';
import { withSignal } from './lib/context.js';
import { cached } from './lib/query-cache.js';
import { factory, sequence, Factory } from './lib/factory.js';
import { maintenance } from './lib/maintenance.js';
import { CombinedQuerySet } from './lib/combine.js';
// The backends: their drivers (@xufa/pg, @xufa/mongo) are loaded when a database of theirs connects.
import { SqliteBackend } from './lib/backends/sqlite.js';
import { MongoBackend } from './lib/backends/mongo/backend.js';
import { PostgresBackend } from './lib/backends/postgres.js';
import { MemoryBlobBackend } from './lib/backends/blob/memory.js';
import { DiskBackend } from './lib/backends/blob/disk.js';
import { S3Backend } from './lib/backends/blob/s3.js';
import { AzureBackend } from './lib/backends/blob/azure.js';
import { SmtpBackend } from './lib/backends/mail/smtp.js';
import { MemoryMailBackend } from './lib/backends/mail/memory.js';
import { ConsoleMailBackend } from './lib/backends/mail/console.js';

// db.orm: the module of the ORM of a database (Model, fields, Paginator...). Packages that take a database (sessions,
// the scheduler, the slots of a cluster, the views) make their models with it: those of the copy of the ORM that has
// the database, without depending on @xufa/orm themselves.
Object.defineProperty(Database.prototype, 'orm', { get: () => orm, configurable: true });

Database.registerBackend('memory', () => MemoryBackend);
Database.registerBackend('fs', () => FsBackend);
Database.registerBackend('sqlite', () => SqliteBackend);
Database.registerBackend('mongodb', () => MongoBackend);
Database.registerBackend('postgres', () => PostgresBackend);
Database.registerBackend('memory-blob', () => MemoryBlobBackend);
Database.registerBackend('disk', () => DiskBackend);
Database.registerBackend('s3', () => S3Backend);
Database.registerBackend('azure-blob', () => AzureBackend);
Database.registerBackend('smtp', () => SmtpBackend);
Database.registerBackend('memory-mail', () => MemoryMailBackend);
Database.registerBackend('console-mail', () => ConsoleMailBackend);

export * from './lib/errors.js';
export const Keyring = encryption.Keyring;
export const setEncryptionKeys = encryption.setEncryptionKeys;
export const generateEncryptionKey = encryption.generateEncryptionKey;
export const isEncrypted = encryption.isEncrypted;
export const reencrypt = encryption.reencrypt;
export const backends = { Backend, MemoryBackend, FsBackend, BlobBackend, SqlBackend, SqlCompiler, dialects };

export {
  maintenance,
  Lower,
  Paginator,
  Page,
  KeysetPaginator,
  KeysetPage,
  InvalidPage,
  PageNotAnInteger,
  EmptyPage,
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
  ormPlugin as plugin,
  resource,
  rollbackEach,
  modelsFromSpec,
  specOf,
  SpecError,
  SPEC_TYPES,
  validationMessage,
  setTranslator,
  MESSAGES,
  MemoryCache,
  SharedCache,
  LocalCache,
  migrations,
  BlobValue,
  Faults,
  FaultError,
};
