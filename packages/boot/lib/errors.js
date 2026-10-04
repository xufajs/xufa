const { createError } = require('@xufa/errors');

module.exports = {
  BOOT_ERR_EXPOSE_ALREADY_DEFINED: createError(
    'BOOT_ERR_EXPOSE_ALREADY_DEFINED',
    "'%s' is already defined, specify an expose option for '%s'"
  ),
  BOOT_ERR_ATTRIBUTE_ALREADY_DEFINED: createError('BOOT_ERR_ATTRIBUTE_ALREADY_DEFINED', "'%s' is already defined"),
  BOOT_ERR_CALLBACK_NOT_FN: createError(
    'BOOT_ERR_CALLBACK_NOT_FN',
    "Callback for '%s' hook is not a function. Received: '%s'"
  ),
  BOOT_ERR_PLUGIN_NOT_VALID: createError(
    'BOOT_ERR_PLUGIN_NOT_VALID',
    "Plugin must be a function or a promise. Received: '%s'"
  ),
  BOOT_ERR_ROOT_PLG_BOOTED: createError('BOOT_ERR_ROOT_PLG_BOOTED', 'Root plugin has already booted'),
  BOOT_ERR_PARENT_PLG_LOADED: createError(
    'BOOT_ERR_PARENT_PLG_LOADED',
    "Impossible to load '%s' plugin because the parent '%s' was already loaded"
  ),
  BOOT_ERR_READY_TIMEOUT: createError(
    'BOOT_ERR_READY_TIMEOUT',
    "Plugin did not start in time: '%s'. You may have forgotten to call 'done' function or to resolve a Promise"
  ),
  BOOT_ERR_PLUGIN_EXEC_TIMEOUT: createError(
    'BOOT_ERR_PLUGIN_EXEC_TIMEOUT',
    "Plugin did not start in time: '%s'. You may have forgotten to call 'done' function or to resolve a Promise"
  ),
};
