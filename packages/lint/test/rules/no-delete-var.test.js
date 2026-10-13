/**
 * @fileoverview Tests for no-delete-var rule.
 * @author Ilya Volodin
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const rule = require("../../lib/eslint/lib/rules/no-delete-var"),
	RuleTester = require("../rule-tester");

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
