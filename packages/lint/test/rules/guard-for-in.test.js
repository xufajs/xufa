import * as __guard_for_in36 from '../../lib/rules/guard-for-in.js';
import * as __rule_tester37 from '../rule-tester.js';
const rule = __guard_for_in36;
const RuleTester = __rule_tester37.default;
/**
 * @fileoverview Tests for guard-for-in rule.
 * @author Nicholas C. Zakas
 */


//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------



//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();
const error = {
	messageId: "wrap",
};

ruleTester.run("guard-for-in", rule, {
	valid: [
		"for (var x in o);",
		"for (var x in o) {}",
		"for (var x in o) if (x) f();",
		"for (var x in o) { if (x) { f(); } }",
		"for (var x in o) { if (x) continue; f(); }",
		"for (var x in o) { if (x) { continue; } f(); }",
	],
	invalid: [
		{
			code: "for (var x in o) { if (x) { f(); continue; } g(); }",
			errors: [error],
		},
		{
			code: "for (var x in o) { if (x) { continue; f(); } g(); }",
			errors: [error],
		},
		{ code: "for (var x in o) { if (x) { f(); } g(); }", errors: [error] },
		{ code: "for (var x in o) { if (x) f(); g(); }", errors: [error] },
		{ code: "for (var x in o) { foo() }", errors: [error] },
		{ code: "for (var x in o) foo();", errors: [error] },
	],
});
