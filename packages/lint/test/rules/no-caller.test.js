import * as __no_caller43 from '../../lib/rules/no-caller.js';
import * as __rule_tester44 from '../rule-tester.js';
const rule = __no_caller43;
const RuleTester = __rule_tester44.default;
/**
 * @fileoverview Tests for no-caller rule.
 * @author Nicholas C. Zakas
 */


//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------



//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();

ruleTester.run("no-caller", rule, {
	valid: [
		"var x = arguments.length",
		"var x = arguments",
		"var x = arguments[0]",
		"var x = arguments[caller]",
	],
	invalid: [
		{
			code: "var x = arguments.callee",
			errors: [
				{
					messageId: "unexpected",
					data: { prop: "callee" },
				},
			],
		},
		{
			code: "var x = arguments.caller",
			errors: [
				{
					messageId: "unexpected",
					data: { prop: "caller" },
				},
			],
		},
	],
});
