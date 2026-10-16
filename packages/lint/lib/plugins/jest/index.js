// eslint-plugin-jest 29.12.2's rules that @xufa/lint has (ported, MIT, see NOTICE.md), as a plugin of a config:
//   { plugins: { jest: plugins.jest }, rules: { 'jest/valid-expect': 'error' } }

const { version } = require('./package.json');

const rules = {
  'expect-expect': require('./rules/expect-expect.js').default,
  'no-alias-methods': require('./rules/no-alias-methods.js').default,
  'no-commented-out-tests': require('./rules/no-commented-out-tests.js').default,
  'no-conditional-expect': require('./rules/no-conditional-expect.js').default,
  'no-deprecated-functions': require('./rules/no-deprecated-functions.js').default,
  'no-disabled-tests': require('./rules/no-disabled-tests.js').default,
  'no-done-callback': require('./rules/no-done-callback.js').default,
  'no-export': require('./rules/no-export.js').default,
  'no-focused-tests': require('./rules/no-focused-tests.js').default,
  'no-identical-title': require('./rules/no-identical-title.js').default,
  'no-interpolation-in-snapshots': require('./rules/no-interpolation-in-snapshots.js').default,
  'no-jasmine-globals': require('./rules/no-jasmine-globals.js').default,
  'no-mocks-import': require('./rules/no-mocks-import.js').default,
  'no-standalone-expect': require('./rules/no-standalone-expect.js').default,
  'no-test-prefixes': require('./rules/no-test-prefixes.js').default,
  'valid-describe-callback': require('./rules/valid-describe-callback.js').default,
  'valid-expect': require('./rules/valid-expect.js').default,
  'valid-expect-in-promise': require('./rules/valid-expect-in-promise.js').default,
  'valid-title': require('./rules/valid-title.js').default,
};

module.exports = { meta: { name: 'eslint-plugin-jest', version }, rules };
