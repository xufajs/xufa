import { expectTypeOf } from '@xufa/test';
import { Linter, configs, globals, loadConfig, format, type Config, type LintMessage, type ConfigArray } from '../..';

const config: Config[] = [
  { ignores: ['dist/**'] },
  configs.recommended,
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } } },
  { rules: { 'no-unused-vars': ['error', { args: 'none' }], 'no-debugger': 'warn' } },
];
const linter = new Linter();
expectTypeOf(linter.verify('a;', config[1], 'a.js')).toEqualTypeOf<LintMessage[]>();
expectTypeOf(linter.verifyAndFix('a;', {}).output).toEqualTypeOf<string>();
expectTypeOf(loadConfig('xufa.lint.config.js')).toEqualTypeOf<Promise<ConfigArray>>();
// @ts-expect-error a severity is off, warn or error
const bad: Config = { rules: { 'no-debugger': 'fatal' } };
// @ts-expect-error no such environment
globals.nope;
expectTypeOf(format('a', { filepath: 'a.ts', singleQuote: true })).toEqualTypeOf<Promise<string>>();
const formatted: Config = { format: { printWidth: 120, ignores: ['dist/**'] } };
// @ts-expect-error trailingComma is all, es5 or none
const wrong: Config = { format: { trailingComma: 'always' } };
