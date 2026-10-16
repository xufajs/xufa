import * as __no_div_regex47 from '../../lib/rules/no-div-regex.js';
import * as __rule_tester48 from '../rule-tester.js';
const rule = __no_div_regex47;
const RuleTester = __rule_tester48.default;
/**
 * @fileoverview Tests for no-div-regex rule.
 * @author Matt DuVall <http://www.mattduvall.com>
 */


//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------



//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();

ruleTester.run("no-div-regex", rule, {
	valid: [
		"var f = function() { return /foo/ig.test('bar'); };",
		"var f = function() { return /\\=foo/; };",
	],
	invalid: [
		{
			code: "var f = function() { return /=foo/; };",
			output: "var f = function() { return /[=]foo/; };",
			errors: [
				{
					messageId: "unexpected",
				},
			],
		},
	],
});
