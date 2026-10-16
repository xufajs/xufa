import * as __no_void129 from '../../lib/rules/no-void.js';
import * as __rule_tester130 from '../rule-tester.js';
const rule = __no_void129;
const RuleTester = __rule_tester130.default;
/**
 * @fileoverview Rule to disallow use of void operator.
 * @author Mike Sidorov
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------




//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester({
	languageOptions: {
		sourceType: "script",
	},
});

ruleTester.run("no-void", rule, {
	valid: [
		"var foo = bar()",
		"foo.void()",
		"foo.void = bar",
		"delete foo;",
		{
			code: "void 0",
			options: [{ allowAsStatement: true }],
		},
		{
			code: "void(0)",
			options: [{ allowAsStatement: true }],
		},
	],

	invalid: [
		{
			code: "void 0",
			errors: [{ messageId: "noVoid" }],
		},
		{
			code: "void 0",
			options: [{}],
			errors: [{ messageId: "noVoid" }],
		},
		{
			code: "void 0",
			options: [{ allowAsStatement: false }],
			errors: [{ messageId: "noVoid" }],
		},
		{
			code: "void(0)",
			errors: [{ messageId: "noVoid" }],
		},
		{
			code: "var foo = void 0",
			errors: [{ messageId: "noVoid" }],
		},
		{
			code: "var foo = void 0",
			options: [{ allowAsStatement: true }],
			errors: [{ messageId: "noVoid" }],
		},
	],
});
