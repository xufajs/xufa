import * as __no_new86 from '../../lib/rules/no-new.js';
import * as __rule_tester87 from '../rule-tester.js';
const rule = __no_new86;
const RuleTester = __rule_tester87.default;
/**
 * @fileoverview Tests for no-new rule.
 * @author Ilya Volodin
 */


//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------



//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();

ruleTester.run("no-new", rule, {
	valid: [
		"var a = new Date()",
		"var a; if (a === new Date()) { a = false; }",
	],
	invalid: [
		{
			code: "new Date()",
			errors: [
				{
					messageId: "noNewStatement",
				},
			],
		},
	],
});
