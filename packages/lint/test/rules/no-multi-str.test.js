import * as __no_multi_str84 from '../../lib/rules/no-multi-str.js';
import * as __rule_tester85 from '../rule-tester.js';
const rule = __no_multi_str84;
const RuleTester = __rule_tester85.default;
/**
 * @fileoverview Tests for no-multi-str rule.
 * @author Ilya Volodin
 */


//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------



//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();

ruleTester.run("no-multi-str", rule, {
	valid: [
		"var a = 'Line 1 Line 2';",
		{
			code: "var a = <div>\n<h1>Wat</h1>\n</div>;",
			languageOptions: {
				ecmaVersion: 6,
				parserOptions: {
					ecmaFeatures: { jsx: true },
				},
			},
		},
	],
	invalid: [
		{
			code: "var x = 'Line 1 \\\n Line 2'",
			errors: [
				{
					messageId: "multilineString",
				},
			],
		},
		{
			code: "test('Line 1 \\\n Line 2');",
			errors: [
				{
					messageId: "multilineString",
				},
			],
		},
		{
			code: "'foo\\\rbar';",
			errors: [
				{
					messageId: "multilineString",
				},
			],
		},
		{
			code: "'foo\\\u2028bar';",
			errors: [
				{
					messageId: "multilineString",
				},
			],
		},
		{
			code: "'foo\\\u2029ar';",
			errors: [
				{
					messageId: "multilineString",
				},
			],
		},
	],
});
