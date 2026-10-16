import * as __unicode_bom288 from '../../lib/rules/unicode-bom.js';
import * as __rule_tester289 from '../rule-tester.js';
const rule = __unicode_bom288;
const RuleTester = __rule_tester289.default;
/**
 * @fileoverview Check that the Unicode BOM can be required and disallowed
 * @author Andrew Johnston <https://github.com/ehjay>
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------



//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();
const expectedError = {
	messageId: "expected",
};
const unexpectedError = {
	messageId: "unexpected",
};

ruleTester.run("unicode-bom", rule, {
	valid: [
		{
			code: "\uFEFF var a = 123;",
			options: ["always"],
		},
		{
			code: "var a = 123;",
			options: ["never"],
		},
		{
			code: "var a = 123; \uFEFF",
			options: ["never"],
		},
	],

	invalid: [
		{
			code: "var a = 123;",
			output: "\uFEFFvar a = 123;",
			options: ["always"],
			errors: [
				{
					...expectedError,
					line: 1,
					column: 1,
					endLine: void 0,
					endColumn: void 0,
				},
			],
		},
		{
			code: " // here's a comment \nvar a = 123;",
			output: "\uFEFF // here's a comment \nvar a = 123;",
			options: ["always"],
			errors: [
				{
					...expectedError,
					line: 1,
					column: 1,
					endLine: void 0,
					endColumn: void 0,
				},
			],
		},
		{
			code: "\uFEFF var a = 123;",
			output: " var a = 123;",
			errors: [
				{
					...unexpectedError,
					line: 1,
					column: 1,
					endLine: void 0,
					endColumn: void 0,
				},
			],
		},
		{
			code: "\uFEFF var a = 123;",
			output: " var a = 123;",
			options: ["never"],
			errors: [
				{
					...unexpectedError,
					line: 1,
					column: 1,
					endLine: void 0,
					endColumn: void 0,
				},
			],
		},
	],
});
