import * as __no_new_symbol164 from '../../lib/rules/no-new-symbol.js';
import * as __rule_tester165 from '../rule-tester.js';
const rule = __no_new_symbol164;
const RuleTester = __rule_tester165.default;
/**
 * @fileoverview Tests for the no-new-symbol rule
 * @author Alberto Rodríguez
 */


//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------



//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 6 } });

ruleTester.run("no-new-symbol", rule, {
	valid: [
		"var foo = Symbol('foo');",
		"function bar(Symbol) { var baz = new Symbol('baz');}",
		"function Symbol() {} new Symbol();",
		"new foo(Symbol);",
		"new foo(bar, Symbol);",
	],
	invalid: [
		{
			code: "var foo = new Symbol('foo');",
			errors: [{ messageId: "noNewSymbol" }],
		},
		{
			code: "function bar() { return function Symbol() {}; } var baz = new Symbol('baz');",
			errors: [{ messageId: "noNewSymbol" }],
		},
	],
});
