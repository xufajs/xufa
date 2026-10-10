import * as errors from '../lib/errors.js';

test('Correct codes of AvvioErrors', () => {
  const testcases = [
    'BOOT_ERR_EXPOSE_ALREADY_DEFINED',
    'BOOT_ERR_ATTRIBUTE_ALREADY_DEFINED',
    'BOOT_ERR_CALLBACK_NOT_FN',
    'BOOT_ERR_PLUGIN_NOT_VALID',
    'BOOT_ERR_ROOT_PLG_BOOTED',
    'BOOT_ERR_PARENT_PLG_LOADED',
    'BOOT_ERR_READY_TIMEOUT',
    'BOOT_ERR_PLUGIN_EXEC_TIMEOUT'
  ]

  expect.assertions(testcases.length + 1)
  // errors.js exposes errors and the createError fn
  expect(testcases.length).toBe(Object.keys(errors).length)

  for (const testcase of testcases) {
    const error = new errors[testcase]()
    expect(error.code).toBe(testcase)
  }
})
