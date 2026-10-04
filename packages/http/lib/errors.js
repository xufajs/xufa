const { createError } = require('@xufa/errors');

const codes = {
  /**
   * Basic
   */
  XUFA_ERR_NOT_FOUND: createError('XUFA_ERR_NOT_FOUND', 'Not Found', 404),
  XUFA_ERR_OPTIONS_NOT_OBJ: createError('XUFA_ERR_OPTIONS_NOT_OBJ', 'Options must be an object', 500, TypeError),
  XUFA_ERR_QSP_NOT_FN: createError(
    'XUFA_ERR_QSP_NOT_FN',
    "querystringParser option should be a function, instead got '%s'",
    500,
    TypeError
  ),
  XUFA_ERR_SCHEMA_CONTROLLER_BUCKET_OPT_NOT_FN: createError(
    'XUFA_ERR_SCHEMA_CONTROLLER_BUCKET_OPT_NOT_FN',
    "schemaController.bucket option should be a function, instead got '%s'",
    500,
    TypeError
  ),
  XUFA_ERR_SCHEMA_ERROR_FORMATTER_NOT_FN: createError(
    'XUFA_ERR_SCHEMA_ERROR_FORMATTER_NOT_FN',
    "schemaErrorFormatter option should be a non async function. Instead got '%s'.",
    500,
    TypeError
  ),
  XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_OBJ: createError(
    'XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_OBJ',
    "ajv.customOptions option should be an object, instead got '%s'",
    500,
    TypeError
  ),
  XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_ARR: createError(
    'XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_ARR',
    "ajv.plugins option should be an array, instead got '%s'",
    500,
    TypeError
  ),
  XUFA_ERR_VALIDATION: createError('XUFA_ERR_VALIDATION', '%s', 400),
  XUFA_ERR_LISTEN_OPTIONS_INVALID: createError(
    'XUFA_ERR_LISTEN_OPTIONS_INVALID',
    "Invalid listen options: '%s'",
    500,
    TypeError
  ),
  XUFA_ERR_ERROR_HANDLER_NOT_FN: createError(
    'XUFA_ERR_ERROR_HANDLER_NOT_FN',
    'Error Handler must be a function',
    500,
    TypeError
  ),
  XUFA_ERR_ERROR_HANDLER_ALREADY_SET: createError(
    'XUFA_ERR_ERROR_HANDLER_ALREADY_SET',
    "Error Handler already set in this scope. Set 'allowErrorHandlerOverride: true' to allow overriding.",
    500,
    TypeError
  ),

  /**
   * ContentTypeParser
   */
  XUFA_ERR_CTP_ALREADY_PRESENT: createError(
    'XUFA_ERR_CTP_ALREADY_PRESENT',
    "Content type parser '%s' already present."
  ),
  XUFA_ERR_CTP_INVALID_TYPE: createError(
    'XUFA_ERR_CTP_INVALID_TYPE',
    'The content type should be a string or a RegExp',
    500,
    TypeError
  ),
  XUFA_ERR_CTP_EMPTY_TYPE: createError(
    'XUFA_ERR_CTP_EMPTY_TYPE',
    'The content type cannot be an empty string',
    500,
    TypeError
  ),
  XUFA_ERR_CTP_INVALID_HANDLER: createError(
    'XUFA_ERR_CTP_INVALID_HANDLER',
    'The content type handler should be a function',
    500,
    TypeError
  ),
  XUFA_ERR_CTP_INVALID_PARSE_TYPE: createError(
    'XUFA_ERR_CTP_INVALID_PARSE_TYPE',
    "The body parser can only parse your data as 'string' or 'buffer', you asked '%s' which is not supported.",
    500,
    TypeError
  ),
  XUFA_ERR_CTP_BODY_TOO_LARGE: createError('XUFA_ERR_CTP_BODY_TOO_LARGE', 'Request body is too large', 413, RangeError),
  XUFA_ERR_CTP_INVALID_MEDIA_TYPE: createError('XUFA_ERR_CTP_INVALID_MEDIA_TYPE', 'Unsupported Media Type', 415),
  XUFA_ERR_CTP_INVALID_CONTENT_LENGTH: createError(
    'XUFA_ERR_CTP_INVALID_CONTENT_LENGTH',
    'Request body size did not match Content-Length',
    400,
    RangeError
  ),
  XUFA_ERR_CTP_EMPTY_JSON_BODY: createError(
    'XUFA_ERR_CTP_EMPTY_JSON_BODY',
    "Body cannot be empty when content-type is set to 'application/json'",
    400
  ),
  XUFA_ERR_CTP_INVALID_JSON_BODY: createError(
    'XUFA_ERR_CTP_INVALID_JSON_BODY',
    "Body is not valid JSON but content-type is set to 'application/json'",
    400
  ),
  XUFA_ERR_CTP_INSTANCE_ALREADY_STARTED: createError(
    'XUFA_ERR_CTP_INSTANCE_ALREADY_STARTED',
    'Cannot call "%s" when xufa instance is already started!',
    400
  ),

  /**
   * decorate
   */
  XUFA_ERR_DEC_ALREADY_PRESENT: createError(
    'XUFA_ERR_DEC_ALREADY_PRESENT',
    "The decorator '%s' has already been added!"
  ),
  XUFA_ERR_DEC_DEPENDENCY_INVALID_TYPE: createError(
    'XUFA_ERR_DEC_DEPENDENCY_INVALID_TYPE',
    "The dependencies of decorator '%s' must be of type Array.",
    500,
    TypeError
  ),
  XUFA_ERR_DEC_MISSING_DEPENDENCY: createError(
    'XUFA_ERR_DEC_MISSING_DEPENDENCY',
    "The decorator is missing dependency '%s'."
  ),
  XUFA_ERR_DEC_AFTER_START: createError('XUFA_ERR_DEC_AFTER_START', "The decorator '%s' has been added after start!"),
  XUFA_ERR_DEC_REFERENCE_TYPE: createError(
    'XUFA_ERR_DEC_REFERENCE_TYPE',
    "The decorator '%s' of type '%s' is a reference type. Use the { getter, setter } interface instead."
  ),
  XUFA_ERR_DEC_UNDECLARED: createError('XUFA_ERR_DEC_UNDECLARED', "No decorator '%s' has been declared on %s."),

  /**
   * hooks
   */
  XUFA_ERR_HOOK_INVALID_TYPE: createError(
    'XUFA_ERR_HOOK_INVALID_TYPE',
    'The hook name must be a string',
    500,
    TypeError
  ),
  XUFA_ERR_HOOK_INVALID_HANDLER: createError(
    'XUFA_ERR_HOOK_INVALID_HANDLER',
    '%s hook should be a function, instead got %s',
    500,
    TypeError
  ),
  XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER: createError(
    'XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER',
    "Async function has too many arguments. Async hooks should not use the 'done' argument.",
    500,
    TypeError
  ),
  XUFA_ERR_HOOK_NOT_SUPPORTED: createError('XUFA_ERR_HOOK_NOT_SUPPORTED', '%s hook not supported!', 500, TypeError),

  /**
   * Middlewares
   */
  XUFA_ERR_MISSING_MIDDLEWARE: createError(
    'XUFA_ERR_MISSING_MIDDLEWARE',
    'You must register a plugin for handling middlewares, see the documentation of xufa for more info.',
    500
  ),

  XUFA_ERR_HOOK_TIMEOUT: createError(
    'XUFA_ERR_HOOK_TIMEOUT',
    "A callback for '%s' hook%s timed out. You may have forgotten to call 'done' function or to resolve a Promise"
  ),

  /**
   * logger
   */
  XUFA_ERR_LOG_INVALID_DESTINATION: createError(
    'XUFA_ERR_LOG_INVALID_DESTINATION',
    'Cannot specify both logger.stream and logger.file options'
  ),

  XUFA_ERR_LOG_INVALID_LOGGER: createError(
    'XUFA_ERR_LOG_INVALID_LOGGER',
    "Invalid logger object provided. The logger instance should have these functions(s): '%s'.",
    500,
    TypeError
  ),

  XUFA_ERR_LOG_INVALID_LOGGER_INSTANCE: createError(
    'XUFA_ERR_LOG_INVALID_LOGGER_INSTANCE',
    'loggerInstance only accepts a logger instance.',
    500,
    TypeError
  ),

  XUFA_ERR_LOG_INVALID_LOGGER_CONFIG: createError(
    'XUFA_ERR_LOG_INVALID_LOGGER_CONFIG',
    'logger options only accepts a configuration object.',
    500,
    TypeError
  ),

  XUFA_ERR_LOG_LOGGER_AND_LOGGER_INSTANCE_PROVIDED: createError(
    'XUFA_ERR_LOG_LOGGER_AND_LOGGER_INSTANCE_PROVIDED',
    'You cannot provide both logger and loggerInstance. Please provide only one.',
    500,
    TypeError
  ),

  XUFA_ERR_LOG_INVALID_LOG_CONTROLLER: createError(
    'XUFA_ERR_LOG_INVALID_LOG_CONTROLLER',
    "logController option must be an instance of LogController, got '%s'.",
    500,
    TypeError
  ),

  /**
   * reply
   */
  XUFA_ERR_REP_INVALID_PAYLOAD_TYPE: createError(
    'XUFA_ERR_REP_INVALID_PAYLOAD_TYPE',
    "Attempted to send payload of invalid type '%s'. Expected a string or Buffer.",
    500,
    TypeError
  ),
  XUFA_ERR_REP_RESPONSE_BODY_CONSUMED: createError(
    'XUFA_ERR_REP_RESPONSE_BODY_CONSUMED',
    'Response.body is already consumed.'
  ),
  XUFA_ERR_REP_READABLE_STREAM_LOCKED: createError(
    'XUFA_ERR_REP_READABLE_STREAM_LOCKED',
    'ReadableStream was locked. You should call releaseLock() method on reader before sending.'
  ),
  XUFA_ERR_REP_ALREADY_SENT: createError(
    'XUFA_ERR_REP_ALREADY_SENT',
    'Reply was already sent, did you forget to "return reply" in "%s" (%s)?'
  ),
  XUFA_ERR_REP_SENT_VALUE: createError(
    'XUFA_ERR_REP_SENT_VALUE',
    'The only possible value for reply.sent is true.',
    500,
    TypeError
  ),
  XUFA_ERR_SEND_INSIDE_ONERR: createError(
    'XUFA_ERR_SEND_INSIDE_ONERR',
    'You cannot use `send` inside the `onError` hook'
  ),
  XUFA_ERR_SEND_UNDEFINED_ERR: createError('XUFA_ERR_SEND_UNDEFINED_ERR', 'Undefined error has occurred'),
  XUFA_ERR_BAD_STATUS_CODE: createError('XUFA_ERR_BAD_STATUS_CODE', 'Called reply with an invalid status code: %s'),
  XUFA_ERR_BAD_TRAILER_NAME: createError(
    'XUFA_ERR_BAD_TRAILER_NAME',
    'Called reply.trailer with an invalid header name: %s'
  ),
  XUFA_ERR_BAD_TRAILER_VALUE: createError(
    'XUFA_ERR_BAD_TRAILER_VALUE',
    "Called reply.trailer('%s', fn) with an invalid type: %s. Expected a function."
  ),
  XUFA_ERR_FAILED_ERROR_SERIALIZATION: createError(
    'XUFA_ERR_FAILED_ERROR_SERIALIZATION',
    'Failed to serialize an error. Error: %s. Original error: %s'
  ),
  XUFA_ERR_MISSING_SERIALIZATION_FN: createError(
    'XUFA_ERR_MISSING_SERIALIZATION_FN',
    'Missing serialization function. Key "%s"'
  ),
  XUFA_ERR_MISSING_CONTENTTYPE_SERIALIZATION_FN: createError(
    'XUFA_ERR_MISSING_CONTENTTYPE_SERIALIZATION_FN',
    'Missing serialization function. Key "%s:%s"'
  ),
  XUFA_ERR_REQ_INVALID_VALIDATION_INVOCATION: createError(
    'XUFA_ERR_REQ_INVALID_VALIDATION_INVOCATION',
    'Invalid validation invocation. Missing validation function for HTTP part "%s" nor schema provided.'
  ),

  /**
   * schemas
   */
  XUFA_ERR_SCH_MISSING_ID: createError('XUFA_ERR_SCH_MISSING_ID', 'Missing schema $id property'),
  XUFA_ERR_SCH_ALREADY_PRESENT: createError('XUFA_ERR_SCH_ALREADY_PRESENT', "Schema with id '%s' already declared!"),
  XUFA_ERR_SCH_CONTENT_MISSING_SCHEMA: createError(
    'XUFA_ERR_SCH_CONTENT_MISSING_SCHEMA',
    "Schema is missing for the content type '%s'"
  ),
  XUFA_ERR_SCH_DUPLICATE: createError('XUFA_ERR_SCH_DUPLICATE', "Schema with '%s' already present!"),
  XUFA_ERR_SCH_VALIDATION_BUILD: createError(
    'XUFA_ERR_SCH_VALIDATION_BUILD',
    'Failed building the validation schema for %s: %s, due to error %s'
  ),
  XUFA_ERR_SCH_SERIALIZATION_BUILD: createError(
    'XUFA_ERR_SCH_SERIALIZATION_BUILD',
    'Failed building the serialization schema for %s: %s, due to error %s'
  ),
  XUFA_ERR_SCH_RESPONSE_SCHEMA_NOT_NESTED_2XX: createError(
    'XUFA_ERR_SCH_RESPONSE_SCHEMA_NOT_NESTED_2XX',
    'response schemas should be nested under a valid status code, e.g { 2xx: { type: "object" } }'
  ),

  /**
   * initialConfig
   */
  XUFA_ERR_INIT_OPTS_INVALID: createError('XUFA_ERR_INIT_OPTS_INVALID', "Invalid initialization options: '%s'"),
  XUFA_ERR_FORCE_CLOSE_CONNECTIONS_IDLE_NOT_AVAILABLE: createError(
    'XUFA_ERR_FORCE_CLOSE_CONNECTIONS_IDLE_NOT_AVAILABLE',
    "Cannot set forceCloseConnections to 'idle' as your HTTP server does not support closeIdleConnections method"
  ),

  /**
   * router
   */
  XUFA_ERR_DUPLICATED_ROUTE: createError('XUFA_ERR_DUPLICATED_ROUTE', "Method '%s' already declared for route '%s'"),
  XUFA_ERR_BAD_URL: createError('XUFA_ERR_BAD_URL', "'%s' is not a valid url component", 400, URIError),
  XUFA_ERR_MAX_PARAM_LENGTH: createError(
    'XUFA_ERR_MAX_PARAM_LENGTH',
    "'%s' is exceeding the max param length",
    414,
    URIError
  ),
  XUFA_ERR_ASYNC_CONSTRAINT: createError('XUFA_ERR_ASYNC_CONSTRAINT', 'Unexpected error from async constraint', 500),
  XUFA_ERR_INVALID_URL: createError('XUFA_ERR_INVALID_URL', "URL must be a string. Received '%s'", 400, TypeError),
  XUFA_ERR_ROUTE_OPTIONS_NOT_OBJ: createError(
    'XUFA_ERR_ROUTE_OPTIONS_NOT_OBJ',
    'Options for "%s:%s" route must be an object',
    500,
    TypeError
  ),
  XUFA_ERR_ROUTE_DUPLICATED_HANDLER: createError(
    'XUFA_ERR_ROUTE_DUPLICATED_HANDLER',
    'Duplicate handler for "%s:%s" route is not allowed!',
    500
  ),
  XUFA_ERR_ROUTE_HANDLER_NOT_FN: createError(
    'XUFA_ERR_ROUTE_HANDLER_NOT_FN',
    'Error Handler for %s:%s route, if defined, must be a function',
    500,
    TypeError
  ),
  XUFA_ERR_ROUTE_MISSING_HANDLER: createError(
    'XUFA_ERR_ROUTE_MISSING_HANDLER',
    'Missing handler function for "%s:%s" route.',
    500
  ),
  XUFA_ERR_ROUTE_METHOD_INVALID: createError(
    'XUFA_ERR_ROUTE_METHOD_INVALID',
    'Provided method is invalid!',
    500,
    TypeError
  ),
  XUFA_ERR_ROUTE_METHOD_ALREADY_SUPPORTED: createError(
    'XUFA_ERR_ROUTE_METHOD_ALREADY_SUPPORTED',
    'Method "%s" is already supported. Use `overrideExisting: true` to override it.',
    500,
    TypeError
  ),
  XUFA_ERR_ROUTE_METHOD_NOT_SUPPORTED: createError(
    'XUFA_ERR_ROUTE_METHOD_NOT_SUPPORTED',
    '%s method is not supported.',
    500
  ),
  XUFA_ERR_ROUTE_LOG_LEVEL_INVALID: createError(
    'XUFA_ERR_ROUTE_LOG_LEVEL_INVALID',
    "Log level for '%s:%s' route must be a valid logger level. Received: '%s'",
    500,
    TypeError
  ),
  XUFA_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED: createError(
    'XUFA_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED',
    'Body validation schema for %s:%s route is not supported!',
    500
  ),
  XUFA_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT: createError(
    'XUFA_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT',
    "'bodyLimit' option must be an integer > 0. Got '%s'",
    500,
    TypeError
  ),
  XUFA_ERR_HANDLER_TIMEOUT: createError('XUFA_ERR_HANDLER_TIMEOUT', "Request timed out after %s ms on route '%s'", 503),
  XUFA_ERR_ROUTE_HANDLER_TIMEOUT_OPTION_NOT_INT: createError(
    'XUFA_ERR_ROUTE_HANDLER_TIMEOUT_OPTION_NOT_INT',
    "'handlerTimeout' option must be an integer > 0. Got '%s'",
    500,
    TypeError
  ),
  XUFA_ERR_ROUTE_REWRITE_NOT_STR: createError(
    'XUFA_ERR_ROUTE_REWRITE_NOT_STR',
    'Rewrite url for "%s" needs to be of type "string" but received "%s"',
    500,
    TypeError
  ),
  XUFA_ERR_ROUTE_MISSING_CONTENT_TYPE: createError(
    'XUFA_ERR_ROUTE_MISSING_CONTENT_TYPE',
    "Method '%s' must provide a 'Content-Type' header.",
    400
  ),

  /**
   *  again listen when close server
   */
  XUFA_ERR_REOPENED_CLOSE_SERVER: createError(
    'XUFA_ERR_REOPENED_CLOSE_SERVER',
    'Xufa has already been closed and cannot be reopened'
  ),
  XUFA_ERR_REOPENED_SERVER: createError('XUFA_ERR_REOPENED_SERVER', 'Xufa is already started'),
  XUFA_ERR_INSTANCE_ALREADY_STARTED: createError(
    'XUFA_ERR_INSTANCE_ALREADY_STARTED',
    'Xufa instance is already listening. %s'
  ),

  /**
   * plugin
   */
  XUFA_ERR_PLUGIN_VERSION_MISMATCH: createError(
    'XUFA_ERR_PLUGIN_VERSION_MISMATCH',
    "xufa-plugin: %s - expected '%s' xufa version, '%s' is installed"
  ),
  XUFA_ERR_PLUGIN_NOT_PRESENT_IN_INSTANCE: createError(
    'XUFA_ERR_PLUGIN_NOT_PRESENT_IN_INSTANCE',
    "The decorator '%s'%s is not present in %s"
  ),
  XUFA_ERR_PLUGIN_INVALID_ASYNC_HANDLER: createError(
    'XUFA_ERR_PLUGIN_INVALID_ASYNC_HANDLER',
    'The %s plugin being registered mixes async and callback styles. Async plugin should not mix async and callback style.',
    500,
    TypeError
  ),
  XUFA_ERR_PLUGIN_DEPENDENCY_NOT_REGISTERED: createError(
    'XUFA_ERR_PLUGIN_DEPENDENCY_NOT_REGISTERED',
    "The dependency '%s' of plugin '%s' is not registered"
  ),
  /**
   *  Errors of @xufa/boot
   */
  XUFA_ERR_PLUGIN_CALLBACK_NOT_FN: createError('XUFA_ERR_PLUGIN_CALLBACK_NOT_FN', 'xufa-plugin: %s', 500, TypeError),
  XUFA_ERR_PLUGIN_NOT_VALID: createError('XUFA_ERR_PLUGIN_NOT_VALID', 'xufa-plugin: %s'),
  XUFA_ERR_ROOT_PLG_BOOTED: createError('XUFA_ERR_ROOT_PLG_BOOTED', 'xufa-plugin: %s'),
  XUFA_ERR_PARENT_PLUGIN_BOOTED: createError('XUFA_ERR_PARENT_PLUGIN_BOOTED', 'xufa-plugin: %s'),
  XUFA_ERR_PLUGIN_TIMEOUT: createError('XUFA_ERR_PLUGIN_TIMEOUT', 'xufa-plugin: %s'),
};

function appendStackTrace(oldErr, newErr) {
  newErr.cause = oldErr;

  return newErr;
}

module.exports = codes;
module.exports.appendStackTrace = appendStackTrace;
module.exports.BOOT_ERRORS_MAP = {
  BOOT_ERR_CALLBACK_NOT_FN: codes.XUFA_ERR_PLUGIN_CALLBACK_NOT_FN,
  BOOT_ERR_PLUGIN_NOT_VALID: codes.XUFA_ERR_PLUGIN_NOT_VALID,
  BOOT_ERR_ROOT_PLG_BOOTED: codes.XUFA_ERR_ROOT_PLG_BOOTED,
  BOOT_ERR_PARENT_PLG_LOADED: codes.XUFA_ERR_PARENT_PLUGIN_BOOTED,
  BOOT_ERR_READY_TIMEOUT: codes.XUFA_ERR_PLUGIN_TIMEOUT,
  BOOT_ERR_PLUGIN_EXEC_TIMEOUT: codes.XUFA_ERR_PLUGIN_TIMEOUT,
};
