import * as __no_new_require211 from '../../lib/rules/no-new-require.js';
import * as __rule_tester212 from '../rule-tester.js';
const rule = __no_new_require211;
const RuleTester = __rule_tester212.default;
/**
 * @fileoverview Tests for no-new-require rule.
 * @author Wil Moore III
 */


//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------



//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();

ruleTester.run("no-new-require", rule, {
	valid: [
		"var appHeader = require('app-header')",
		"var AppHeader = new (require('app-header'))",
		"var AppHeader = new (require('headers').appHeader)",
	],
	invalid: [
		{
			code: "var appHeader = new require('app-header')",
			errors: [
				{
					messageId: "noNewRequire",
				},
			],
		},
		{
			code: "var appHeader = new require('headers').appHeader",
			errors: [
				{
					messageId: "noNewRequire",
				},
			],
		},
	],
});
