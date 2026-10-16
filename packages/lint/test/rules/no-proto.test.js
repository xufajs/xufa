import * as __no_proto97 from '../../lib/rules/no-proto.js';
import * as __rule_tester98 from '../rule-tester.js';
const rule = __no_proto97;
const RuleTester = __rule_tester98.default;
/**
 * @fileoverview Tests for no-proto rule.
 * @author Ilya Volodin
 */


//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------



//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();

ruleTester.run("no-proto", rule, {
	valid: [
		"var a = test[__proto__];",
		"var __proto__ = null;",
		{ code: "foo[`__proto`] = null;", languageOptions: { ecmaVersion: 6 } },
		{
			code: "foo[`__proto__\n`] = null;",
			languageOptions: { ecmaVersion: 6 },
		},
		{
			code: "class C { #__proto__; foo() { this.#__proto__; } }",
			languageOptions: { ecmaVersion: 2022 },
		},
	],
	invalid: [
		{
			code: "var a = test.__proto__;",
			errors: [
				{
					messageId: "unexpectedProto",
				},
			],
		},
		{
			code: "var a = test['__proto__'];",
			errors: [
				{
					messageId: "unexpectedProto",
				},
			],
		},
		{
			code: "var a = test[`__proto__`];",
			languageOptions: { ecmaVersion: 6 },
			errors: [
				{
					messageId: "unexpectedProto",
				},
			],
		},
		{
			code: "test[`__proto__`] = function () {};",
			languageOptions: { ecmaVersion: 6 },
			errors: [
				{
					messageId: "unexpectedProto",
				},
			],
		},
	],
});
