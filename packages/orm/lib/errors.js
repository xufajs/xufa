// The errors of the ORM. ValidationError carries the messages of every field that failed in `errors`, with the
// status code 400, so that an HTTP handler can answer with them as they are.
const createError = require('@xufa/errors');

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

module.exports = {
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
};
