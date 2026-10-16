import * as __no_path_concat213 from '../../lib/rules/no-path-concat.js';
import * as __rule_tester214 from '../rule-tester.js';
const rule = __no_path_concat213;
const RuleTester = __rule_tester214.default;
/**
 * @fileoverview Disallow string concatenation when using __dirname and __filename
 * @author Nicholas C. Zakas
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------



//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();

ruleTester.run("no-path-concat", rule, {
	valid: [
		'var fullPath = dirname + "foo.js";',
		'var fullPath = __dirname == "foo.js";',
		"if (fullPath === __dirname) {}",
		"if (__dirname === fullPath) {}",
	],

	invalid: [
		{
			code: 'var fullPath = __dirname + "/foo.js";',
			errors: [
				{
					messageId: "usePathFunctions",
				},
			],
		},
		{
			code: 'var fullPath = __filename + "/foo.js";',
			errors: [
				{
					messageId: "usePathFunctions",
				},
			],
		},
		{
			code: 'var fullPath = "/foo.js" + __filename;',
			errors: [
				{
					messageId: "usePathFunctions",
				},
			],
		},
		{
			code: 'var fullPath = "/foo.js" + __dirname;',
			errors: [
				{
					messageId: "usePathFunctions",
				},
			],
		},
	],
});
