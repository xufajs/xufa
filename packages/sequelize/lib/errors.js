// The errors of Sequelize, with the same names and properties: ValidationError (errors: ValidationErrorItem[]),
// UniqueConstraintError (fields, errors), ForeignKeyConstraintError, EmptyResultError, DatabaseError (parent,
// original, sql)...

class BaseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SequelizeBaseError';
  }
}

class ValidationErrorItem {
  constructor(message, type, path, value, instance, validatorKey, fnName, fnArgs) {
    this.message = message || '';
    // The type given is an origin (CORE, DB, FUNCTION), or a type of one ('unique violation').
    this.type = null;
    this.origin = null;
    if (type && ValidationErrorItem.Origins[type]) this.origin = type;
    else if (type && ValidationErrorItem.originOf(type)) {
      this.type = type;
      this.origin = ValidationErrorItem.originOf(type);
    }
    this.path = path || null;
    this.value = value === undefined ? null : value;
    this.instance = instance || null;
    this.validatorKey = validatorKey || null;
    this.validatorName = fnName || null;
    this.validatorArgs = fnArgs || [];
  }

  static originOf(type) {
    const key = String(type || '').toLowerCase();
    if (key === 'notnull violation' || key === 'string violation') return 'CORE';
    if (key === 'unique violation') return 'DB';
    if (key === 'validation error') return 'FUNCTION';
    return null;
  }

  getValidatorKey(useTypeAsNS = true, separator = '.') {
    const useNS = useTypeAsNS === undefined || Boolean(useTypeAsNS);
    const NSSeparator = separator === undefined ? '.' : separator;
    const type = this.origin;
    const key = this.validatorKey || this.validatorName;
    const useNSSeparator = NSSeparator && typeof NSSeparator === 'string' && NSSeparator.length;
    if (useNS && type && !useNSSeparator)
      throw new Error('Invalid namespace separator given, must be a non-empty string');
    if (!(typeof key === 'string' && key.length)) return '';
    return (useNS && type ? [type, key].join(NSSeparator) : key).toLowerCase().trim();
  }
}

class ValidationError extends BaseError {
  constructor(message, errors = [], options = {}) {
    super(message);
    this.name = 'SequelizeValidationError';
    this.errors = errors;
    // As Sequelize: the type and message of every error.
    if (!message && errors.length) {
      this.message = errors.map((item) => `${item.type || item.origin}: ${item.message}`).join(',\n');
    } else if (!message) this.message = 'Validation Error';
    if (options.stack) this.stack = options.stack;
  }

  get(path) {
    return this.errors.filter((item) => item.path === path);
  }
}

class DatabaseError extends BaseError {
  constructor(parent, options = {}) {
    super(parent.message);
    this.name = 'SequelizeDatabaseError';
    this.parent = parent;
    this.original = parent;
    this.sql = parent.sql || options.sql;
    this.parameters = parent.parameters || options.parameters;
  }
}

class UniqueConstraintError extends ValidationError {
  constructor(options = {}) {
    const errors = options.errors || [];
    super(options.message || 'Validation error', errors);
    this.name = 'SequelizeUniqueConstraintError';
    this.fields = options.fields || {};
    this.parent = options.parent;
    this.original = options.parent;
    this.sql = options.parent && options.parent.sql;
  }
}

class ForeignKeyConstraintError extends DatabaseError {
  constructor(options = {}) {
    super(options.parent || new Error(options.message || 'Foreign key constraint error'));
    this.name = 'SequelizeForeignKeyConstraintError';
    this.fields = options.fields;
    this.table = options.table;
    this.value = options.value;
    this.index = options.index;
    this.reltype = options.reltype;
  }
}

class ExclusionConstraintError extends DatabaseError {
  constructor(options = {}) {
    const parent = options.parent || { message: options.message || '', sql: '' };
    super(parent);
    this.name = 'SequelizeExclusionConstraintError';
    this.message = options.message || parent.message || '';
    // As Sequelize: the constraint, fields and table (from the details of PostgreSQL when it gives them).
    this.constraint = options.constraint !== undefined ? options.constraint : parent.constraint;
    this.fields = options.fields;
    this.table = options.table !== undefined ? options.table : parent.table;
  }
}

class EmptyResultError extends BaseError {
  constructor(message) {
    super(message);
    this.name = 'SequelizeEmptyResultError';
  }
}

class ConnectionError extends BaseError {
  constructor(parent) {
    super(parent ? parent.message : 'Connection error');
    this.name = 'SequelizeConnectionError';
    this.parent = parent;
    this.original = parent;
  }
}

// The errors of connections, by their cause.
const connectionError = (name) =>
  class extends ConnectionError {
    constructor(parent) {
      super(parent);
      this.name = `Sequelize${name}`;
    }
  };
const ConnectionRefusedError = connectionError('ConnectionRefusedError');
const AccessDeniedError = connectionError('AccessDeniedError');
const HostNotFoundError = connectionError('HostNotFoundError');
const HostNotReachableError = connectionError('HostNotReachableError');
const InvalidConnectionError = connectionError('InvalidConnectionError');
const ConnectionTimedOutError = connectionError('ConnectionTimedOutError');
// Sequelize's error of a connection not had from the pool in time (options.pool.acquire), for code that names it.
const ConnectionAcquireTimeoutError = connectionError('ConnectionAcquireTimeoutError');

// A scope that can not be applied (Sequelize's own name for it).
class SequelizeScopeError extends BaseError {
  constructor(message) {
    super(message);
    this.name = 'SequelizeScopeError';
  }
}

// Sequelize's error of the queue of queries of a connection of MSSQL: here only for code that names it.
class AsyncQueueError extends BaseError {
  constructor(message) {
    super(message);
    this.name = 'SequelizeAsyncQueueError';
  }
}

class UnknownConstraintError extends DatabaseError {
  constructor(options = {}) {
    super(options.parent || new Error(options.message || 'The specified constraint does not exist'));
    this.name = 'SequelizeUnknownConstraintError';
    this.constraint = options.constraint;
    this.fields = options.fields;
    this.table = options.table;
  }
}

class QueryError extends BaseError {
  constructor(message) {
    super(message);
    this.name = 'SequelizeQueryError';
  }
}

class TimeoutError extends DatabaseError {
  constructor(parent) {
    super(parent);
    this.name = 'SequelizeTimeoutError';
  }
}

class AssociationError extends BaseError {
  constructor(message) {
    super(message);
    this.name = 'SequelizeAssociationError';
  }
}

class EagerLoadingError extends BaseError {
  constructor(message) {
    super(message);
    this.name = 'SequelizeEagerLoadingError';
  }
}

class AggregateError extends BaseError {
  constructor(errors) {
    super(errors.map((error, i) => `${i}: ${error.message}`).join(String.fromCharCode(10)));
    this.name = 'AggregateError';
    this.errors = errors;
  }
}

class BulkRecordError extends BaseError {
  constructor(error, record) {
    super(error.message);
    this.name = 'SequelizeBulkRecordError';
    this.errors = error;
    this.record = record;
  }
}

class InstanceError extends BaseError {
  constructor(message) {
    super(message);
    this.name = 'SequelizeInstanceError';
  }
}

class OptimisticLockError extends BaseError {
  constructor(options = {}) {
    super(options.message || `Attempting to update a stale model instance: ${options.modelName}`);
    this.name = 'SequelizeOptimisticLockError';
    this.modelName = options.modelName;
    this.values = options.values;
    this.where = options.where;
  }
}

// Features of Sequelize this layer does not have: they fail clearly instead of doing something else.
class NotSupportedError extends BaseError {
  constructor(feature) {
    super(`${feature} is not supported by @xufa/sequelize`);
    this.name = 'SequelizeNotSupportedError';
  }
}

ValidationErrorItem.Origins = { CORE: 'CORE', DB: 'DB', FUNCTION: 'FUNCTION' };
ValidationErrorItem.TypeStringMap = {
  'notnull violation': 'CORE',
  'string violation': 'CORE',
  'unique violation': 'DB',
  'validation error': 'FUNCTION',
};

module.exports = {
  Error: BaseError,
  ValidationErrorItemOrigin: ValidationErrorItem.Origins,
  ValidationErrorItemType: ValidationErrorItem.TypeStringMap,
  BaseError,
  ValidationError,
  ValidationErrorItem,
  DatabaseError,
  UniqueConstraintError,
  ForeignKeyConstraintError,
  ExclusionConstraintError,
  EmptyResultError,
  ConnectionError,
  ConnectionRefusedError,
  AccessDeniedError,
  HostNotFoundError,
  HostNotReachableError,
  InvalidConnectionError,
  ConnectionTimedOutError,
  ConnectionAcquireTimeoutError,
  SequelizeScopeError,
  AsyncQueueError,
  UnknownConstraintError,
  QueryError,
  TimeoutError,
  AssociationError,
  InstanceError,
  EagerLoadingError,
  AggregateError,
  BulkRecordError,
  OptimisticLockError,
  NotSupportedError,
};
