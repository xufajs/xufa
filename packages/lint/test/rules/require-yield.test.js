/**
 * @fileoverview Tests for require-yield rule
 * @author Toru Nagashima
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

import * as rule from '../../lib/rules/require-yield.js';
import RuleTester from '../rule-tester.js';

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 6 } });

ruleTester.run("require-yield", rule, {
	valid: [
		"function foo() { return 0; }",
		"function* foo() { yield 0; }",
		"function* foo() { }",
		"(function* foo() { yield 0; })();",
		"(function* foo() { })();",
		"var obj = { *foo() { yield 0; } };",
		"var obj = { *foo() { } };",
		"class A { *foo() { yield 0; } };",
		"class A { *foo() { } };",
	],
	invalid: [
		{
			code: "function* foo() { return 0; }",
			errors: [
				{
					messageId: "missingYield",
				},
			],
		},
		{
			code: "(function* foo() { return 0; })();",
			errors: [
				{
					messageId: "missingYield",
				},
			],
		},
		{
			code: "var obj = { *foo() { return 0; } }",
			errors: [
				{
					messageId: "missingYield",
				},
			],
		},
		{
			code: "class A { *foo() { return 0; } }",
			errors: [
				{
					messageId: "missingYield",
				},
			],
		},
		{
			code: "function* foo() { function* bar() { yield 0; } }",
			errors: [
				{
					messageId: "missingYield",
					column: 1,
				},
			],
		},
		{
			code: "function* foo() { function* bar() { return 0; } yield 0; }",
			errors: [
				{
					messageId: "missingYield",
					column: 19,
				},
			],
		},
	],
});
