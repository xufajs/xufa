import * as __no_useless_concat123 from '../../lib/rules/no-useless-concat.js';
import * as __rule_tester124 from '../rule-tester.js';
const rule = __no_useless_concat123;
const RuleTester = __rule_tester124.default;
/**
 * @fileoverview disallow unnecessary concatenation of literals or template literals
 * @author Henry Zhu
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------



//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();

ruleTester.run("no-useless-concat", rule, {
	valid: [
		"var a = 1 + 1;",
		"var a = 1 * '2';",
		"var a = 1 - 2;",
		"var a = foo + bar;",
		"var a = 'foo' + bar;",
		"var foo = 'foo' +\n 'bar';",

		// https://github.com/eslint/eslint/issues/3575
		"var string = (number + 1) + 'px';",
		"'a' + 1",
		"1 + '1'",
		{ code: "1 + `1`", languageOptions: { ecmaVersion: 6 } },
		{ code: "`1` + 1", languageOptions: { ecmaVersion: 6 } },
		{ code: "(1 + +2) + `b`", languageOptions: { ecmaVersion: 6 } },
	],

	invalid: [
		{
			code: "'a' + 'b'",
			errors: [
				{
					messageId: "unexpectedConcat",
					line: 1,
					column: 5,
					endLine: 1,
					endColumn: 6,
				},
			],
		},
		{
			code: "'a' +\n'b' + 'c'",
			errors: [
				{
					messageId: "unexpectedConcat",
					line: 2,
					column: 5,
					endLine: 2,
					endColumn: 6,
				},
			],
		},
		{
			code: "foo + 'a' + 'b'",
			errors: [{ messageId: "unexpectedConcat" }],
		},
		{
			code: "'a' + 'b' + 'c'",
			errors: [
				{
					messageId: "unexpectedConcat",
					line: 1,
					column: 5,
					endLine: 1,
					endColumn: 6,
				},
				{
					messageId: "unexpectedConcat",
					line: 1,
					column: 11,
					endLine: 1,
					endColumn: 12,
				},
			],
		},
		{
			code: "(foo + 'a') + ('b' + 'c')",
			errors: [
				{ column: 13, messageId: "unexpectedConcat" },
				{ column: 20, messageId: "unexpectedConcat" },
			],
		},
		{
			code: "`a` + 'b'",
			languageOptions: { ecmaVersion: 6 },
			errors: [{ messageId: "unexpectedConcat" }],
		},
		{
			code: "`a` + `b`",
			languageOptions: { ecmaVersion: 6 },
			errors: [{ messageId: "unexpectedConcat" }],
		},
		{
			code: "foo + `a` + `b`",
			languageOptions: { ecmaVersion: 6 },
			errors: [{ messageId: "unexpectedConcat" }],
		},
	],
});
