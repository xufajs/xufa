/**
 * @fileoverview Tests for no-with rule.
 * @author Nicholas C. Zakas
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

import * as rule from '../../lib/rules/no-with.js';
import RuleTester from '../rule-tester.js';

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester({
	languageOptions: {
		ecmaVersion: 5,
		sourceType: "script",
	},
});

ruleTester.run("no-with", rule, {
	valid: ["foo.bar()"],
	invalid: [
		{
			code: "with(foo) { bar() }",
			errors: [
				{
					messageId: "unexpectedWith",
				},
			],
		},
	],
});
