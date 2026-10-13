/**
 * @fileoverview The rule should warn against code that tries to compare against -0.
 * @author Aladdin-ADD<hh_2013@foxmail.com>
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

import * as rule from '../../lib/rules/no-compare-neg-zero.js';
import RuleTester from '../rule-tester.js';

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();

ruleTester.run("no-compare-neg-zero", rule, {
	valid: [
		"x === 0",
		"0 === x",
		"x == 0",
		"0 == x",
		"x === '0'",
		"'0' === x",
		"x == '0'",
		"'0' == x",
		"x === '-0'",
		"'-0' === x",
		"x == '-0'",
		"'-0' == x",
		"x === -1",
		"-1 === x",
		"x < 0",
		"0 < x",
		"x <= 0",
		"0 <= x",
		"x > 0",
		"0 > x",
		"x >= 0",
		"0 >= x",
		"x != 0",
		"0 != x",
		"x !== 0",
		"0 !== x",
		"Object.is(x, -0)",
	],

	invalid: [
		{
			code: "x === -0",
			errors: [
				{
					messageId: "unexpected",
					data: { operator: "===" },
				},
			],
		},
		{
			code: "-0 === x",
			errors: [
				{
					messageId: "unexpected",
					data: { operator: "===" },
				},
			],
		},
		{
			code: "x == -0",
			errors: [
				{
					messageId: "unexpected",
					data: { operator: "==" },
				},
			],
		},
		{
			code: "-0 == x",
			errors: [
				{
					messageId: "unexpected",
					data: { operator: "==" },
				},
			],
		},
		{
			code: "x > -0",
			errors: [
				{
					messageId: "unexpected",
					data: { operator: ">" },
				},
			],
		},
		{
			code: "-0 > x",
			errors: [
				{
					messageId: "unexpected",
					data: { operator: ">" },
				},
			],
		},
		{
			code: "x >= -0",
			errors: [
				{
					messageId: "unexpected",
					data: { operator: ">=" },
				},
			],
		},
		{
			code: "-0 >= x",
			errors: [
				{
					messageId: "unexpected",
					data: { operator: ">=" },
				},
			],
		},
		{
			code: "x < -0",
			errors: [
				{
					messageId: "unexpected",
					data: { operator: "<" },
				},
			],
		},
		{
			code: "-0 < x",
			errors: [
				{
					messageId: "unexpected",
					data: { operator: "<" },
				},
			],
		},
		{
			code: "x <= -0",
			errors: [
				{
					messageId: "unexpected",
					data: { operator: "<=" },
				},
			],
		},
		{
			code: "-0 <= x",
			errors: [
				{
					messageId: "unexpected",
					data: { operator: "<=" },
				},
			],
		},
	],
});
