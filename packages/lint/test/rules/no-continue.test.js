import * as __no_continue251 from '../../lib/rules/no-continue.js';
import * as __rule_tester252 from '../rule-tester.js';
const rule = __no_continue251;
const RuleTester = __rule_tester252.default;
/**
 * @fileoverview Tests for no-continue rule.
 * @author Borislav Zhivkov
 */


//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------



//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();

ruleTester.run("no-continue", rule, {
	valid: [
		"var sum = 0, i; for(i = 0; i < 10; i++){ if(i > 5) { sum += i; } }",
		"var sum = 0, i = 0; while(i < 10) { if(i > 5) { sum += i; } i++; }",
	],

	invalid: [
		{
			code: "var sum = 0, i; for(i = 0; i < 10; i++){ if(i <= 5) { continue; } sum += i; }",
			errors: [
				{
					messageId: "unexpected",
					line: 1,
					column: 55,
					endLine: 1,
					endColumn: 64,
				},
			],
		},
		{
			code: "var sum = 0, i; myLabel: for(i = 0; i < 10; i++){ if(i <= 5) { continue myLabel; } sum += i; }",
			errors: [
				{
					messageId: "unexpected",
					line: 1,
					column: 64,
					endLine: 1,
					endColumn: 81,
				},
			],
		},
		{
			code: "var sum = 0, i = 0; while(i < 10) { if(i <= 5) { i++; continue; } sum += i; i++; }",
			errors: [
				{
					messageId: "unexpected",
					line: 1,
					column: 55,
					endLine: 1,
					endColumn: 64,
				},
			],
		},
		{
			code: "var sum = 0, i = 0; myLabel: while(i < 10) { if(i <= 5) { i++; continue myLabel; } sum += i; i++; }",
			errors: [
				{
					messageId: "unexpected",
					line: 1,
					column: 64,
					endLine: 1,
					endColumn: 81,
				},
			],
		},
	],
});
