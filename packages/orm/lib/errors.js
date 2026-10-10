// The errors of the ORM. ValidationError carries the messages of every field that failed in `errors`, with the
// status code 400, so that an HTTP handler can answer with them as they are.
import createError from '@xufa/errors';
import * as schemaModule from './schema.js';

const ValidationErrorBase = createError('XUFA_ORM_ERR_VALIDATION', 'Validation failed for %s: %s', 400);

function ValidationError(modelName, errors) {
  const summary = Object.keys(errors)
    .map((name) => `${name}: ${errors[name].join(' ')}`)
    .join('; ');
  const err = new ValidationErrorBase(modelName, summary);
  err.errors = errors;
  return err;
}
Object.defineProperty(ValidationError, Symbol.hasInstance, {
  value: (instance) => instance instanceof ValidationErrorBase,
});

const errors = {
  ValidationError,
  FieldError: createError('XUFA_ORM_ERR_FIELD', 'Cannot resolve "%s" into a field of %s', 500),
  LookupError: createError('XUFA_ORM_ERR_LOOKUP', 'Unsupported lookup "%s" for the field "%s" of %s', 500),
  NotFoundError: createError('XUFA_ORM_ERR_NOT_FOUND', 'No %s matches the query', 404),
  MultipleObjectsError: createError('XUFA_ORM_ERR_MULTIPLE_OBJECTS', 'get() returned %d %s instead of one', 500),
  NotRegisteredError: createError('XUFA_ORM_ERR_NOT_REGISTERED', 'The model %s is not registered in a database', 500),
  ModelError: createError('XUFA_ORM_ERR_MODEL', 'Invalid model %s: %s', 500),
  QueryError: createError('XUFA_ORM_ERR_QUERY', '%s', 500),
  ProtectedError: createError('XUFA_ORM_ERR_PROTECTED', 'Cannot delete %s: it is referenced by %s', 409),
  BackendError: createError('XUFA_ORM_ERR_BACKEND', '%s', 500),
  UnsupportedError: createError('XUFA_ORM_ERR_UNSUPPORTED', '%s is not supported by the %s backend', 500),
  // A write that would make two objects with the same value of a unique field (or key): 409, with `fields` (the names
  // of the fields), `model` and the error of the database as `cause`.
  UniqueError: createError('XUFA_ORM_ERR_UNIQUE', '%s', 409),
  // An encrypted value that cannot be read (a key that is not in the keyring, a changed value), or no keys.
  EncryptionError: createError('XUFA_ORM_ERR_ENCRYPTION', '%s', 500),
  // A message of a mail backend that cannot be sent: 400 when the message is wrong (an address, a header), 502 when
  // the server refuses it or cannot be reached (with `response`, `rejected` and the SMTP `responseCode` when it answered).
  MailError: createError('XUFA_ORM_ERR_MAIL', '%s', 502),
};

// The columns of the error of a database for a duplicate value of a unique field or key, or null when it is not one:
// SQLite ('UNIQUE constraint failed: table.column'), PostgreSQL (23505, its detail '(column)=(value)'), MongoDB
// (11000, its keyValue) and the memory backend (its `unique`).
function duplicateColumns(err) {
  if (!err || typeof err !== 'object') return null;
  if (Array.isArray(err.unique)) return err.unique;
  if (err.code === '23505') {
    const detail = /^Key \((.+?)\)=/.exec(err.detail || '') || /\((.+?)\)=\(/.exec(err.detail || '');
    return detail ? detail[1].split(', ').map((column) => column.replace(/"/g, '')) : [];
  }
  if (err.code === 11000 || err.code === 11001) {
    const keyValue = err.keyValue || (err.writeErrors && err.writeErrors[0] && err.writeErrors[0].keyValue);
    return Object.keys(keyValue || {});
  }
  const failed = /UNIQUE constraint failed: (.+)$/m.exec(String(err.message || ''));
  if (failed) return failed[1].split(', ').map((column) => column.split('.').pop());
  // The error a backend made of the error of its driver.
  return err.cause && err.cause !== err ? duplicateColumns(err.cause) : null;
}

// The name of the index of a duplicate (SQLite: "index 'name'"; PostgreSQL: its constraint), in the error or its causes.
function indexNameOfError(err, columns) {
  for (let cause = err; cause && typeof cause === 'object'; cause = cause.cause === cause ? null : cause.cause) {
    if (typeof cause.constraint === 'string') return cause.constraint;
  }
  const named = (columns || []).map((column) => /^index '(.+)'$/.exec(column)).find(Boolean);
  if (named) return named[1];
  // MongoDB: "E11000 duplicate key error collection: db.table index: name ...".
  for (let cause = err; cause && typeof cause === 'object'; cause = cause.cause === cause ? null : cause.cause) {
    const mongo = /\bindex: (\S+)/.exec(String(cause.message || ''));
    if (mongo) return mongo[1];
  }
  return null;
}

// The error of a duplicate: its index of the model (the unique constraint it breaks: its fields and message), or null.
function brokenIndex(meta, err, columns) {
  for (let cause = err; cause && typeof cause === 'object'; cause = cause.cause === cause ? null : cause.cause) {
    if (cause.index && cause.index.fields) return cause.index;
  }
  const { indexNameOf } = schemaModule;
  const name = indexNameOfError(err, columns);
  if (name) {
    const found = meta.indexes.find((index) => index.unique && indexNameOf(meta, index) === name);
    if (found) return found;
  }
  // SQLite names the columns of an index of several fields: the unique index of those columns.
  const plain = (columns || []).filter((column) => /^\w+$/.test(column));
  if (plain.length > 1) {
    const found = meta.indexes.find(
      (index) =>
        index.unique &&
        index.fields.length === plain.length &&
        index.fields.every((name) => {
          const field = meta.field(name);
          return plain.includes(field ? field.column : name);
        })
    );
    if (found) return found;
  }
  // PostgreSQL names the columns of an expression: lower((name)::text).
  const lowered = (columns || []).map((column) => /^lower\(\(?"?(\w+)"?\)?(?:::\w+)?\)$/i.exec(column)).filter(Boolean);
  if (lowered.length) {
    const lower = lowered.map((match) => match[1]);
    return (
      meta.indexes.find(
        (index) =>
          index.unique &&
          index.lower &&
          index.lower.every((name) => {
            const field = meta.field(name);
            return lower.includes(field ? field.column : name);
          })
      ) || null
    );
  }
  return null;
}

// A UniqueError for the error of a write of a model, or null: its fields, and the message of its constraint.
function uniqueErrorOf(meta, err) {
  if (err instanceof errors.UniqueError) return err;
  const columns = duplicateColumns(err);
  if (!columns) return null;
  const index = brokenIndex(meta, err, columns);
  const names = index
    ? [...index.fields]
    : columns.map((column) => {
        if (column === '_id' && meta.pk && !meta.pk.composite) return meta.pk.name;
        const field = meta.fields.find((item) => item.column === column);
        return field ? field.name : column;
      });
  const unique = new errors.UniqueError(
    (index && index.message) || `There is already a ${meta.name} with this ${names.join(', ') || 'key'}`
  );
  unique.model = meta.name;
  unique.fields = names;
  if (index) unique.constraint = index.name || null;
  if (index && index.message) unique.constraintMessage = index.message;
  unique.cause = err;
  return unique;
}

const {
  FieldError,
  LookupError,
  NotFoundError,
  MultipleObjectsError,
  NotRegisteredError,
  ModelError,
  QueryError,
  ProtectedError,
  BackendError,
  UnsupportedError,
  UniqueError,
  EncryptionError,
  MailError,
} = errors;

export {
  ValidationError,
  FieldError,
  LookupError,
  NotFoundError,
  MultipleObjectsError,
  NotRegisteredError,
  ModelError,
  QueryError,
  ProtectedError,
  BackendError,
  UnsupportedError,
  UniqueError,
  EncryptionError,
  MailError,
  uniqueErrorOf,
};
