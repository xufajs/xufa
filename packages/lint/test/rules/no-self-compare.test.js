import * as __no_self_compare111 from '../../lib/rules/no-self-compare.js';
import * as __rule_tester112 from '../rule-tester.js';
const rule = __no_self_compare111;
const RuleTester = __rule_tester112.default;
/**
 * @fileoverview Tests for no-self-compare rule.
 * @author Ilya Volodin
 */


//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------



//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();

ruleTester.run("no-self-compare", rule, {
	valid: [
		"if (x === y) { }",
		"if (1 === 2) { }",
		"y=x*x",
		"foo.bar.baz === foo.bar.qux",
		{
			code: "class C { #field; foo() { this.#field === this['#field']; } }",
			languageOptions: { ecmaVersion: 2022 },
		},
		{
			code: "class C { #field; foo() { this['#field'] === this.#field; } }",
			languageOptions: { ecmaVersion: 2022 },
		},
	],
	invalid: [
		{
			code: "if (x === x) { }",
			errors: [
				{
					messageId: "comparingToSelf",
				},
			],
		},
		{
			code: "if (x !== x) { }",
			errors: [
				{
					messageId: "comparingToSelf",
				},
			],
		},
		{
			code: "if (x > x) { }",
			errors: [
				{
					messageId: "comparingToSelf",
				},
			],
		},
		{
			code: "if ('x' > 'x') { }",
			errors: [
				{
					messageId: "comparingToSelf",
				},
			],
		},
		{
			code: "do {} while (x === x)",
			errors: [
				{
					messageId: "comparingToSelf",
				},
			],
		},
		{
			code: "x === x",
			errors: [
				{
					messageId: "comparingToSelf",
				},
			],
		},
		{
			code: "x !== x",
			errors: [
				{
					messageId: "comparingToSelf",
				},
			],
		},
		{
			code: "x == x",
			errors: [
				{
					messageId: "comparingToSelf",
				},
			],
		},
		{
			code: "x != x",
			errors: [
				{
					messageId: "comparingToSelf",
				},
			],
		},
		{
			code: "x > x",
			errors: [
				{
					messageId: "comparingToSelf",
				},
			],
		},
		{
			code: "x < x",
			errors: [
				{
					messageId: "comparingToSelf",
				},
			],
		},
		{
			code: "x >= x",
			errors: [
				{
					messageId: "comparingToSelf",
				},
			],
		},
		{
			code: "x <= x",
			errors: [
				{
					messageId: "comparingToSelf",
				},
			],
		},
		{
			code: "foo.bar().baz.qux >= foo.bar ().baz .qux",
			errors: [
				{
					messageId: "comparingToSelf",
				},
			],
		},
		{
			code: "class C { #field; foo() { this.#field === this.#field; } }",
			languageOptions: { ecmaVersion: 2022 },
			errors: [
				{
					messageId: "comparingToSelf",
				},
			],
		},
	],
});
