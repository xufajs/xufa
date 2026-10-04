'use strict'


const errors = require('../../lib/errors')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const expectedErrors = 94

test(`should expose ${expectedErrors} errors`, async () => {
  expect.assertions(1)
  const exportedKeys = Object.keys(errors)
  let counter = 0
  for (const key of exportedKeys) {
    if (errors[key].name === 'XufaError') {
      counter++
    }
  }
  expect(counter).toBe(expectedErrors)

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('ensure name and codes of Errors are identical', async () => {
  expect.assertions(expectedErrors)

  const exportedKeys = Object.keys(errors)
  for (const key of exportedKeys) {
    if (errors[key].name === 'XufaError') {
      expect(key).toBe(new errors[key]().code)
    }
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_NOT_FOUND', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_NOT_FOUND()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_NOT_FOUND')
  expect(error.message).toBe('Not Found')
  expect(error.statusCode).toBe(404)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_OPTIONS_NOT_OBJ', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_OPTIONS_NOT_OBJ()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_OPTIONS_NOT_OBJ')
  expect(error.message).toBe('Options must be an object')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_QSP_NOT_FN', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_QSP_NOT_FN()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_QSP_NOT_FN')
  expect(error.message).toBe("querystringParser option should be a function, instead got '%s'")
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_SCHEMA_CONTROLLER_BUCKET_OPT_NOT_FN', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_SCHEMA_CONTROLLER_BUCKET_OPT_NOT_FN()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_SCHEMA_CONTROLLER_BUCKET_OPT_NOT_FN')
  expect(error.message).toBe("schemaController.bucket option should be a function, instead got '%s'")
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_SCHEMA_ERROR_FORMATTER_NOT_FN', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_SCHEMA_ERROR_FORMATTER_NOT_FN()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_SCHEMA_ERROR_FORMATTER_NOT_FN')
  expect(error.message).toBe("schemaErrorFormatter option should be a non async function. Instead got '%s'.")
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_OBJ', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_OBJ()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_OBJ')
  expect(error.message).toBe("ajv.customOptions option should be an object, instead got '%s'")
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_ARR', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_ARR()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_ARR')
  expect(error.message).toBe("ajv.plugins option should be an array, instead got '%s'")
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_CTP_ALREADY_PRESENT', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_CTP_ALREADY_PRESENT()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_CTP_ALREADY_PRESENT')
  expect(error.message).toBe("Content type parser '%s' already present.")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_CTP_INVALID_TYPE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_CTP_INVALID_TYPE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_CTP_INVALID_TYPE')
  expect(error.message).toBe('The content type should be a string or a RegExp')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_CTP_EMPTY_TYPE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_CTP_EMPTY_TYPE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_CTP_EMPTY_TYPE')
  expect(error.message).toBe('The content type cannot be an empty string')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_CTP_INVALID_HANDLER', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_CTP_INVALID_HANDLER()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_CTP_INVALID_HANDLER')
  expect(error.message).toBe('The content type handler should be a function')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_CTP_INVALID_PARSE_TYPE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_CTP_INVALID_PARSE_TYPE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_CTP_INVALID_PARSE_TYPE')
  expect(error.message).toBe("The body parser can only parse your data as 'string' or 'buffer', you asked '%s' which is not supported.")
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_CTP_BODY_TOO_LARGE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_CTP_BODY_TOO_LARGE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_CTP_BODY_TOO_LARGE')
  expect(error.message).toBe('Request body is too large')
  expect(error.statusCode).toBe(413)
  expect(error instanceof RangeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_CTP_INVALID_MEDIA_TYPE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_CTP_INVALID_MEDIA_TYPE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_CTP_INVALID_MEDIA_TYPE')
  expect(error.message).toBe('Unsupported Media Type')
  expect(error.statusCode).toBe(415)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_CTP_INVALID_CONTENT_LENGTH', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_CTP_INVALID_CONTENT_LENGTH()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_CTP_INVALID_CONTENT_LENGTH')
  expect(error.message).toBe('Request body size did not match Content-Length')
  expect(error.statusCode).toBe(400)
  expect(error instanceof RangeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_CTP_EMPTY_JSON_BODY', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_CTP_EMPTY_JSON_BODY()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_CTP_EMPTY_JSON_BODY')
  expect(error.message).toBe("Body cannot be empty when content-type is set to 'application/json'")
  expect(error.statusCode).toBe(400)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_CTP_INVALID_JSON_BODY', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_CTP_INVALID_JSON_BODY()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_CTP_INVALID_JSON_BODY')
  expect(error.message).toBe("Body is not valid JSON but content-type is set to 'application/json'")
  expect(error.statusCode).toBe(400)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_CTP_INSTANCE_ALREADY_STARTED', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_CTP_INSTANCE_ALREADY_STARTED()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_CTP_INSTANCE_ALREADY_STARTED')
  expect(error.message).toBe('Cannot call "%s" when xufa instance is already started!')
  expect(error.statusCode).toBe(400)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_DEC_ALREADY_PRESENT', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_DEC_ALREADY_PRESENT()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_DEC_ALREADY_PRESENT')
  expect(error.message).toBe("The decorator '%s' has already been added!")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_DEC_DEPENDENCY_INVALID_TYPE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_DEC_DEPENDENCY_INVALID_TYPE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_DEC_DEPENDENCY_INVALID_TYPE')
  expect(error.message).toBe("The dependencies of decorator '%s' must be of type Array.")
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_DEC_MISSING_DEPENDENCY', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_DEC_MISSING_DEPENDENCY()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_DEC_MISSING_DEPENDENCY')
  expect(error.message).toBe("The decorator is missing dependency '%s'.")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_DEC_AFTER_START', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_DEC_AFTER_START()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_DEC_AFTER_START')
  expect(error.message).toBe("The decorator '%s' has been added after start!")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_DEC_REFERENCE_TYPE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_DEC_REFERENCE_TYPE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_DEC_REFERENCE_TYPE')
  expect(error.message).toBe("The decorator '%s' of type '%s' is a reference type. Use the { getter, setter } interface instead.")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_DEC_UNDECLARED', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_DEC_UNDECLARED('myDecorator', 'request')
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_DEC_UNDECLARED')
  expect(error.message).toBe("No decorator 'myDecorator' has been declared on request.")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_HOOK_INVALID_TYPE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_HOOK_INVALID_TYPE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_HOOK_INVALID_TYPE')
  expect(error.message).toBe('The hook name must be a string')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_HOOK_INVALID_HANDLER', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_HOOK_INVALID_HANDLER()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_HOOK_INVALID_HANDLER')
  expect(error.message).toBe('%s hook should be a function, instead got %s')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER')
  expect(error.message).toBe("Async function has too many arguments. Async hooks should not use the 'done' argument.")
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_HOOK_NOT_SUPPORTED', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_HOOK_NOT_SUPPORTED()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_HOOK_NOT_SUPPORTED')
  expect(error.message).toBe('%s hook not supported!')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_MISSING_MIDDLEWARE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_MISSING_MIDDLEWARE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_MISSING_MIDDLEWARE')
  expect(error.message).toBe('You must register a plugin for handling middlewares, see the documentation of xufa for more info.')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_HOOK_TIMEOUT', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_HOOK_TIMEOUT()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_HOOK_TIMEOUT')
  expect(error.message).toBe("A callback for '%s' hook%s timed out. You may have forgotten to call 'done' function or to resolve a Promise")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_LOG_INVALID_DESTINATION', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_LOG_INVALID_DESTINATION()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_LOG_INVALID_DESTINATION')
  expect(error.message).toBe('Cannot specify both logger.stream and logger.file options')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_LOG_INVALID_LOGGER', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_LOG_INVALID_LOGGER()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_LOG_INVALID_LOGGER')
  expect(error.message).toBe("Invalid logger object provided. The logger instance should have these functions(s): '%s'.")
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_LOG_INVALID_LOGGER_INSTANCE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_LOG_INVALID_LOGGER_INSTANCE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_LOG_INVALID_LOGGER_INSTANCE')
  expect(error.message).toBe('loggerInstance only accepts a logger instance.')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_LOG_INVALID_LOGGER_CONFIG', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_LOG_INVALID_LOGGER_CONFIG()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_LOG_INVALID_LOGGER_CONFIG')
  expect(error.message).toBe('logger options only accepts a configuration object.')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_LOG_LOGGER_AND_LOGGER_INSTANCE_PROVIDED', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_LOG_LOGGER_AND_LOGGER_INSTANCE_PROVIDED()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_LOG_LOGGER_AND_LOGGER_INSTANCE_PROVIDED')
  expect(error.message).toBe('You cannot provide both logger and loggerInstance. Please provide only one.')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_REP_INVALID_PAYLOAD_TYPE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_REP_INVALID_PAYLOAD_TYPE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_REP_INVALID_PAYLOAD_TYPE')
  expect(error.message).toBe("Attempted to send payload of invalid type '%s'. Expected a string or Buffer.")
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_REP_RESPONSE_BODY_CONSUMED', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_REP_RESPONSE_BODY_CONSUMED()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_REP_RESPONSE_BODY_CONSUMED')
  expect(error.message).toBe('Response.body is already consumed.')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_REP_READABLE_STREAM_LOCKED', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_REP_READABLE_STREAM_LOCKED()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_REP_READABLE_STREAM_LOCKED')
  expect(error.message).toBe('ReadableStream was locked. You should call releaseLock() method on reader before sending.')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_REP_ALREADY_SENT', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_REP_ALREADY_SENT('/hello', 'GET')
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_REP_ALREADY_SENT')
  expect(error.message).toBe('Reply was already sent, did you forget to "return reply" in "/hello" (GET)?')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_REP_SENT_VALUE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_REP_SENT_VALUE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_REP_SENT_VALUE')
  expect(error.message).toBe('The only possible value for reply.sent is true.')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_SEND_INSIDE_ONERR', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_SEND_INSIDE_ONERR()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_SEND_INSIDE_ONERR')
  expect(error.message).toBe('You cannot use `send` inside the `onError` hook')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_SEND_UNDEFINED_ERR', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_SEND_UNDEFINED_ERR()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_SEND_UNDEFINED_ERR')
  expect(error.message).toBe('Undefined error has occurred')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_BAD_STATUS_CODE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_BAD_STATUS_CODE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_BAD_STATUS_CODE')
  expect(error.message).toBe('Called reply with an invalid status code: %s')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_BAD_TRAILER_NAME', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_BAD_TRAILER_NAME()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_BAD_TRAILER_NAME')
  expect(error.message).toBe('Called reply.trailer with an invalid header name: %s')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_BAD_TRAILER_VALUE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_BAD_TRAILER_VALUE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_BAD_TRAILER_VALUE')
  expect(error.message).toBe("Called reply.trailer('%s', fn) with an invalid type: %s. Expected a function.")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_FAILED_ERROR_SERIALIZATION', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_FAILED_ERROR_SERIALIZATION()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_FAILED_ERROR_SERIALIZATION')
  expect(error.message).toBe('Failed to serialize an error. Error: %s. Original error: %s')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_MISSING_SERIALIZATION_FN', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_MISSING_SERIALIZATION_FN()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_MISSING_SERIALIZATION_FN')
  expect(error.message).toBe('Missing serialization function. Key "%s"')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_MISSING_CONTENTTYPE_SERIALIZATION_FN', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_MISSING_CONTENTTYPE_SERIALIZATION_FN()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_MISSING_CONTENTTYPE_SERIALIZATION_FN')
  expect(error.message).toBe('Missing serialization function. Key "%s:%s"')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_REQ_INVALID_VALIDATION_INVOCATION', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_REQ_INVALID_VALIDATION_INVOCATION()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_REQ_INVALID_VALIDATION_INVOCATION')
  expect(error.message).toBe('Invalid validation invocation. Missing validation function for HTTP part "%s" nor schema provided.')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_SCH_MISSING_ID', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_SCH_MISSING_ID()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_SCH_MISSING_ID')
  expect(error.message).toBe('Missing schema $id property')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_SCH_ALREADY_PRESENT', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_SCH_ALREADY_PRESENT()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_SCH_ALREADY_PRESENT')
  expect(error.message).toBe("Schema with id '%s' already declared!")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_SCH_CONTENT_MISSING_SCHEMA', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_SCH_CONTENT_MISSING_SCHEMA()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_SCH_CONTENT_MISSING_SCHEMA')
  expect(error.message).toBe("Schema is missing for the content type '%s'")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_SCH_DUPLICATE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_SCH_DUPLICATE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_SCH_DUPLICATE')
  expect(error.message).toBe("Schema with '%s' already present!")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_SCH_VALIDATION_BUILD', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_SCH_VALIDATION_BUILD()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_SCH_VALIDATION_BUILD')
  expect(error.message).toBe('Failed building the validation schema for %s: %s, due to error %s')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_SCH_SERIALIZATION_BUILD', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_SCH_SERIALIZATION_BUILD()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_SCH_SERIALIZATION_BUILD')
  expect(error.message).toBe('Failed building the serialization schema for %s: %s, due to error %s')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_SCH_RESPONSE_SCHEMA_NOT_NESTED_2XX', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_SCH_RESPONSE_SCHEMA_NOT_NESTED_2XX()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_SCH_RESPONSE_SCHEMA_NOT_NESTED_2XX')
  expect(error.message).toBe('response schemas should be nested under a valid status code, e.g { 2xx: { type: "object" } }')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_INIT_OPTS_INVALID', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_INIT_OPTS_INVALID()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_INIT_OPTS_INVALID')
  expect(error.message).toBe("Invalid initialization options: '%s'")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_FORCE_CLOSE_CONNECTIONS_IDLE_NOT_AVAILABLE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_FORCE_CLOSE_CONNECTIONS_IDLE_NOT_AVAILABLE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_FORCE_CLOSE_CONNECTIONS_IDLE_NOT_AVAILABLE')
  expect(error.message).toBe("Cannot set forceCloseConnections to 'idle' as your HTTP server does not support closeIdleConnections method")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_DUPLICATED_ROUTE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_DUPLICATED_ROUTE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_DUPLICATED_ROUTE')
  expect(error.message).toBe("Method '%s' already declared for route '%s'")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_BAD_URL', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_BAD_URL()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_BAD_URL')
  expect(error.message).toBe("'%s' is not a valid url component")
  expect(error.statusCode).toBe(400)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_MAX_PARAM_LENGTH', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_MAX_PARAM_LENGTH()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_MAX_PARAM_LENGTH')
  expect(error.message).toBe("'%s' is exceeding the max param length")
  expect(error.statusCode).toBe(414)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_ASYNC_CONSTRAINT', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_ASYNC_CONSTRAINT()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_ASYNC_CONSTRAINT')
  expect(error.message).toBe('Unexpected error from async constraint')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_INVALID_URL', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_INVALID_URL()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_INVALID_URL')
  expect(error.message).toBe("URL must be a string. Received '%s'")
  expect(error.statusCode).toBe(400)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_ROUTE_OPTIONS_NOT_OBJ', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_ROUTE_OPTIONS_NOT_OBJ()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_ROUTE_OPTIONS_NOT_OBJ')
  expect(error.message).toBe('Options for "%s:%s" route must be an object')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_ROUTE_DUPLICATED_HANDLER', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_ROUTE_DUPLICATED_HANDLER()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_ROUTE_DUPLICATED_HANDLER')
  expect(error.message).toBe('Duplicate handler for "%s:%s" route is not allowed!')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_ROUTE_HANDLER_NOT_FN', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_ROUTE_HANDLER_NOT_FN()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_ROUTE_HANDLER_NOT_FN')
  expect(error.message).toBe('Error Handler for %s:%s route, if defined, must be a function')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_ROUTE_MISSING_HANDLER', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_ROUTE_MISSING_HANDLER()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_ROUTE_MISSING_HANDLER')
  expect(error.message).toBe('Missing handler function for "%s:%s" route.')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_ROUTE_METHOD_INVALID', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_ROUTE_METHOD_INVALID()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_ROUTE_METHOD_INVALID')
  expect(error.message).toBe('Provided method is invalid!')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_ROUTE_METHOD_ALREADY_SUPPORTED', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_ROUTE_METHOD_ALREADY_SUPPORTED('GET')
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_ROUTE_METHOD_ALREADY_SUPPORTED')
  expect(error.message).toBe('Method "GET" is already supported. Use `overrideExisting: true` to override it.')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_ROUTE_METHOD_NOT_SUPPORTED', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_ROUTE_METHOD_NOT_SUPPORTED()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_ROUTE_METHOD_NOT_SUPPORTED')
  expect(error.message).toBe('%s method is not supported.')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_ROUTE_LOG_LEVEL_INVALID', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_ROUTE_LOG_LEVEL_INVALID()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_ROUTE_LOG_LEVEL_INVALID')
  expect(error.message).toBe("Log level for '%s:%s' route must be a valid logger level. Received: '%s'")
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED')
  expect(error.message).toBe('Body validation schema for %s:%s route is not supported!')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT')
  expect(error.message).toBe("'bodyLimit' option must be an integer > 0. Got '%s'")
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT')
  expect(error.message).toBe("'bodyLimit' option must be an integer > 0. Got '%s'")
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_ROUTE_REWRITE_NOT_STR', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_ROUTE_REWRITE_NOT_STR()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_ROUTE_REWRITE_NOT_STR')
  expect(error.message).toBe('Rewrite url for "%s" needs to be of type "string" but received "%s"')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_ROUTE_MISSING_CONTENT_TYPE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_ROUTE_MISSING_CONTENT_TYPE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_ROUTE_MISSING_CONTENT_TYPE')
  expect(error.message).toBe("Method '%s' must provide a 'Content-Type' header.")
  expect(error.statusCode).toBe(400)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_REOPENED_CLOSE_SERVER', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_REOPENED_CLOSE_SERVER()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_REOPENED_CLOSE_SERVER')
  expect(error.message).toBe('Xufa has already been closed and cannot be reopened')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_REOPENED_SERVER', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_REOPENED_SERVER()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_REOPENED_SERVER')
  expect(error.message).toBe('Xufa is already started')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_INSTANCE_ALREADY_STARTED', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_INSTANCE_ALREADY_STARTED()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_INSTANCE_ALREADY_STARTED')
  expect(error.message).toBe('Xufa instance is already listening. %s')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_PLUGIN_VERSION_MISMATCH', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_PLUGIN_VERSION_MISMATCH()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_PLUGIN_VERSION_MISMATCH')
  expect(error.message).toBe("xufa-plugin: %s - expected '%s' xufa version, '%s' is installed")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_PLUGIN_NOT_PRESENT_IN_INSTANCE', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_PLUGIN_NOT_PRESENT_IN_INSTANCE()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_PLUGIN_NOT_PRESENT_IN_INSTANCE')
  expect(error.message).toBe("The decorator '%s'%s is not present in %s")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_PLUGIN_INVALID_ASYNC_HANDLER', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_PLUGIN_INVALID_ASYNC_HANDLER('easter-egg')
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_PLUGIN_INVALID_ASYNC_HANDLER')
  expect(error.message).toBe('The easter-egg plugin being registered mixes async and callback styles. Async plugin should not mix async and callback style.')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_PLUGIN_DEPENDENCY_NOT_REGISTERED', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_PLUGIN_DEPENDENCY_NOT_REGISTERED('my-dep', 'my-plugin')
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_PLUGIN_DEPENDENCY_NOT_REGISTERED')
  expect(error.message).toBe("The dependency 'my-dep' of plugin 'my-plugin' is not registered")
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_PLUGIN_CALLBACK_NOT_FN', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_PLUGIN_CALLBACK_NOT_FN()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_PLUGIN_CALLBACK_NOT_FN')
  expect(error.message).toBe('xufa-plugin: %s')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_PLUGIN_NOT_VALID', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_PLUGIN_NOT_VALID()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_PLUGIN_NOT_VALID')
  expect(error.message).toBe('xufa-plugin: %s')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_ROOT_PLG_BOOTED', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_ROOT_PLG_BOOTED()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_ROOT_PLG_BOOTED')
  expect(error.message).toBe('xufa-plugin: %s')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_PARENT_PLUGIN_BOOTED', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_PARENT_PLUGIN_BOOTED()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_PARENT_PLUGIN_BOOTED')
  expect(error.message).toBe('xufa-plugin: %s')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_PLUGIN_TIMEOUT', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_PLUGIN_TIMEOUT()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_PLUGIN_TIMEOUT')
  expect(error.message).toBe('xufa-plugin: %s')
  expect(error.statusCode).toBe(500)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_VALIDATION', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_VALIDATION()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_VALIDATION')
  expect(error.message).toBe('%s')
  expect(error.statusCode).toBe(400)
  expect(error instanceof Error).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_LISTEN_OPTIONS_INVALID', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_LISTEN_OPTIONS_INVALID()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_LISTEN_OPTIONS_INVALID')
  expect(error.message).toBe("Invalid listen options: '%s'")
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

test('XUFA_ERR_ERROR_HANDLER_NOT_FN', async () => {
  expect.assertions(5)
  const error = new errors.XUFA_ERR_ERROR_HANDLER_NOT_FN()
  expect(error.name).toBe('XufaError')
  expect(error.code).toBe('XUFA_ERR_ERROR_HANDLER_NOT_FN')
  expect(error.message).toBe('Error Handler must be a function')
  expect(error.statusCode).toBe(500)
  expect(error instanceof TypeError).toBeTruthy()

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

// Not applicable to xufa (see port-fastify.js)
test.skip('Ensure that all errors are in Errors.md TOC', async () => {
  expect.assertions(expectedErrors)

  const errorsMd = readFileSync(resolve(__dirname, '../../docs/Reference/Errors.md'), 'utf8')

  const exportedKeys = Object.keys(errors)
  for (const key of exportedKeys) {
    if (errors[key].name === 'XufaError') {
      expect(errorsMd.includes(`  - [${key.toUpperCase()}](#${key.toLowerCase()})`)).toBeTruthy()
    }
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

// Not applicable to xufa (see port-fastify.js)
test.skip('Ensure that non-existing errors are not in Errors.md TOC', async () => {
  expect.assertions(expectedErrors)
  const errorsMd = readFileSync(resolve(__dirname, '../../docs/Reference/Errors.md'), 'utf8')

  const matchRE = / {4}- \[([A-Z0-9_]+)\]\(#[a-z0-9_]+\)/g
  const matches = errorsMd.matchAll(matchRE)
  const exportedKeys = Object.keys(errors)

  for (const match of matches) {
    expect(exportedKeys.indexOf(match[1]) !== -1).toBeTruthy()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

// Not applicable to xufa (see port-fastify.js)
test.skip('Ensure that all errors are in Errors.md documented', async () => {
  expect.assertions(expectedErrors)
  const errorsMd = readFileSync(resolve(__dirname, '../../docs/Reference/Errors.md'), 'utf8')

  const exportedKeys = Object.keys(errors)
  for (const key of exportedKeys) {
    if (errors[key].name === 'XufaError') {
      expect(errorsMd.includes(`<a id="${key.toLowerCase()}">${key.toUpperCase()}</a>`)).toBeTruthy()
    }
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

// Not applicable to xufa (see port-fastify.js)
test.skip('Ensure that non-existing errors are not in Errors.md documented', async () => {
  expect.assertions(expectedErrors)

  const errorsMd = readFileSync(resolve(__dirname, '../../docs/Reference/Errors.md'), 'utf8')

  const matchRE = /<a id="[0-9a-zA-Z_]+">([0-9a-zA-Z_]+)<\/a>/g
  const matches = errorsMd.matchAll(matchRE)
  const exportedKeys = Object.keys(errors)

  for (const match of matches) {
    expect(exportedKeys.indexOf(match[1]) !== -1).toBeTruthy()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

// Not applicable to xufa (see port-fastify.js)
test.skip('Ensure that all errors are in errors.d.ts', async () => {
  expect.assertions(expectedErrors)

  const errorsDts = readFileSync(resolve(__dirname, '../../types/errors.d.ts'), 'utf8')

  const FastifyErrorCodesRE = /export type FastifyErrorCodes = Record<([^>]+),\s*FastifyErrorConstructor>/m

  const [, errorCodeType] = errorsDts.match(FastifyErrorCodesRE)

  const errorCodeRE = /'([A-Z0-9_]+)'/g
  const matches = errorCodeType.matchAll(errorCodeRE)
  const errorTypes = [...matches].map(match => match[1])
  const exportedKeys = Object.keys(errors)

  for (const key of exportedKeys) {
    if (errors[key].name === 'XufaError') {
      expect(errorTypes.includes(key)).toBeTruthy()
    }
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})

// Not applicable to xufa (see port-fastify.js)
test.skip('Ensure that non-existing errors are not in errors.d.ts', async () => {
  expect.assertions(expectedErrors)

  const errorsDts = readFileSync(resolve(__dirname, '../../types/errors.d.ts'), 'utf8')

  const FastifyErrorCodesRE = /export type FastifyErrorCodes = Record<([^>]+),\s*FastifyErrorConstructor>/m

  const [, errorCodeType] = errorsDts.match(FastifyErrorCodesRE)

  const errorCodeRE = /'([A-Z0-9_]+)'/g
  const matches = errorCodeType.matchAll(errorCodeRE)
  const exportedKeys = Object.keys(errors)

  for (const match of matches) {
    expect(exportedKeys.indexOf(match[1]) !== -1).toBeTruthy()
  }

  // The assertions of resolved promises run before the test ends.
  await new Promise((resolve) => setImmediate(resolve))
})
