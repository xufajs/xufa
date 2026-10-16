import * as __symbol_description205 from '../../lib/rules/symbol-description.js';
import * as __rule_tester206 from '../rule-tester.js';
const rule = __symbol_description205;
const RuleTester = __rule_tester206.default;
/**
 * @fileoverview Tests for symbol-description rule.
 * @author Jarek Rencz
 */


//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------




//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester({
	languageOptions: {
		ecmaVersion: 6,
		sourceType: "script",
	},
});

ruleTester.run("symbol-description", rule, {
	valid: [
		'Symbol("Foo");',
		'var foo = "foo"; Symbol(foo);',

		// Ignore if it's shadowed.
		"var Symbol = function () {}; Symbol();",
		"Symbol(); var Symbol = function () {};",
		"function bar() { var Symbol = function () {}; Symbol(); }",

		// Ignore if it's an argument.
		"function bar(Symbol) { Symbol(); }",
	],

	invalid: [
		{
			code: "Symbol();",
			errors: [
				{
					messageId: "expected",
				},
			],
		},
		{
			code: "Symbol(); Symbol = function () {};",
			errors: [
				{
					messageId: "expected",
				},
			],
		},
	],
});
