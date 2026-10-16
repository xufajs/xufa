import * as __no_label_var216 from '../../lib/rules/no-label-var.js';
import * as __rule_tester217 from '../rule-tester.js';
const rule = __no_label_var216;
const RuleTester = __rule_tester217.default;
/**
 * @fileoverview Tests for no-label-var rule.
 * @author Ian Christian Myers
 */


//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------



//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();

ruleTester.run("no-label-var", rule, {
	valid: [
		"function bar() { q: for(;;) { break q; } } function foo () { var q = t; }",
		"function bar() { var x = foo; q: for(;;) { break q; } }",
	],
	invalid: [
		{
			code: "var x = foo; function bar() { x: for(;;) { break x; } }",
			errors: [
				{
					messageId: "identifierClashWithLabel",
				},
			],
		},
		{
			code: "function bar() { var x = foo; x: for(;;) { break x; } }",
			errors: [
				{
					messageId: "identifierClashWithLabel",
				},
			],
		},
		{
			code: "function bar(x) { x: for(;;) { break x; } }",
			errors: [
				{
					messageId: "identifierClashWithLabel",
				},
			],
		},
	],
});
