// The ES module of @xufa/sequelize: the CommonJS module as its default export, and its parts as named exports, the
// same ones as the ES module of Sequelize 6 (import { Sequelize, DataTypes, Op } from '@xufa/sequelize').
import pkg from './index.js';

export default pkg;

// The class and its helpers.
export const { Sequelize, fn, col, cast, literal, and, or, json, where } = pkg;

// The QueryInterface.
export const { QueryInterface } = pkg;

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
} = pkg;

// Models and their types of operators and queries.
export const { Model } = pkg;

// Transactions.
export const { Transaction } = pkg;

// Associations.
export const { Association, BelongsTo, HasOne, HasMany, BelongsToMany } = pkg;

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
} = pkg;
