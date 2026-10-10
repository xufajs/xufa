// @xufa/sequelize: the API of Sequelize 6 over @xufa/orm. Code written for Sequelize runs with
// require('@xufa/sequelize') instead of require('sequelize'), on @xufa/orm's backends (PostgreSQL with @xufa/pg,
// SQLite with node:sqlite) and with no other dependencies.
//
//   import { Sequelize, DataTypes, Op } from '@xufa/sequelize';
//   const sequelize = new Sequelize('postgres://user:pass@localhost:5432/db', { logging: false });
//   const User = sequelize.define('User', { name: DataTypes.STRING, email: { type: DataTypes.STRING, unique: true } });
//   await sequelize.sync();
//   const users = await User.findAll({ where: { name: { [Op.startsWith]: 'A' } }, order: [['name', 'ASC']] });
//
// As the sequelize package, the module is the Sequelize class, with the rest as its properties.
import { Sequelize } from './lib/sequelize.js';

export default Sequelize;

export { Sequelize as 'module.exports' };

// Its parts as named exports, the same as the ES module of Sequelize 6 (import { Sequelize, DataTypes, Op } from
// '@xufa/sequelize').

// The class and its helpers.
export { Sequelize };
export const { fn, col, cast, literal, and, or, json, where } = Sequelize;

// The QueryInterface.
export const { QueryInterface } = Sequelize;

// The data types (DOUBLE PRECISION has no name that can be exported).
export const {
  ABSTRACT,
  STRING,
  CHAR,
  TEXT,
  NUMBER,
  TINYINT,
  SMALLINT,
  MEDIUMINT,
  INTEGER,
  BIGINT,
  FLOAT,
  TIME,
  DATE,
  DATEONLY,
  BOOLEAN,
  NOW,
  BLOB,
  DECIMAL,
  NUMERIC,
  UUID,
  UUIDV1,
  UUIDV4,
  HSTORE,
  JSON,
  JSONB,
  VIRTUAL,
  ARRAY,
  ENUM,
  RANGE,
  REAL,
  DOUBLE,
  GEOMETRY,
  GEOGRAPHY,
  CIDR,
  INET,
  MACADDR,
  CITEXT,
  TSVECTOR,
} = Sequelize;

// Models and their types of operators and queries.
export const { Model } = Sequelize;

// Transactions.
export const { Transaction } = Sequelize;

// Associations.
export const { Association, BelongsTo, HasOne, HasMany, BelongsToMany } = Sequelize;

// Errors.
export const {
  BaseError,
  AggregateError,
  AsyncQueueError,
  AssociationError,
  BulkRecordError,
  ConnectionError,
  DatabaseError,
  EagerLoadingError,
  EmptyResultError,
  InstanceError,
  OptimisticLockError,
  QueryError,
  SequelizeScopeError,
  ValidationError,
  ValidationErrorItem,
  AccessDeniedError,
  ConnectionAcquireTimeoutError,
  ConnectionRefusedError,
  ConnectionTimedOutError,
  HostNotFoundError,
  HostNotReachableError,
  InvalidConnectionError,
  ExclusionConstraintError,
  ForeignKeyConstraintError,
  TimeoutError,
  UnknownConstraintError,
  UniqueConstraintError,
  Error,
  useInflection,
  Utils,
  QueryTypes,
  Op,
  TableHints,
  IndexHints,
  DataTypes,
  Deferrable,
  Validator,
  ValidationErrorItemOrigin,
  ValidationErrorItemType,
  NotSupportedError,
} = Sequelize;
