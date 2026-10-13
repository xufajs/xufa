/**
 * @fileoverview Tests for no-debugger rule.
 * @author Nicholas C. Zakas
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

import * as rule from '../../lib/rules/no-debugger.js';
import RuleTester from '../rule-tester.js';

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();

ruleTester.run("no-debugger", rule, {
	valid: ["var test = { debugger: 1 }; test.debugger;"],
	invalid: [
		{
			code: "if (foo) debugger",
			output: null,
			errors: [
				{
					messageId: "unexpected",
					line: 1,
					column: 10,
					endLine: 1,
					endColumn: 18,
				},
			],
		},
	],
});
