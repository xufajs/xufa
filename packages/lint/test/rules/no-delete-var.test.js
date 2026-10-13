/**
 * @fileoverview Tests for no-delete-var rule.
 * @author Ilya Volodin
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

import * as rule from '../../lib/rules/no-delete-var.js';
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

ruleTester.run("no-delete-var", rule, {
	valid: ["delete x.prop;"],
	invalid: [
		{
			code: "delete x",
			errors: [
				{
					messageId: "unexpected",
				},
			],
		},
	],
});
