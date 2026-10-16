import * as __no_template_curly_in_string160 from '../../lib/rules/no-template-curly-in-string.js';
import * as __rule_tester161 from '../rule-tester.js';
const rule = __no_template_curly_in_string160;
const RuleTester = __rule_tester161.default;
/**
 * @fileoverview Warn when using template string syntax in regular strings.
 * @author Jeroen Engels
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------



//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester();

const messageId = "unexpectedTemplateExpression";

ruleTester.run("no-template-curly-in-string", rule, {
	valid: [
		"`Hello, ${name}`;",
		"templateFunction`Hello, ${name}`;",
		"`Hello, name`;",
		"'Hello, name';",
		"'Hello, ' + name;",
		"`Hello, ${index + 1}`",
		'`Hello, ${name + " foo"}`',
		'`Hello, ${name || "foo"}`',
		'`Hello, ${{foo: "bar"}.foo}`',
		"'$2'",
		"'${'",
		"'$}'",
		"'{foo}'",
		"'{foo: \"bar\"}'",
		"const number = 3",
	],
	invalid: [
		{
			code: "'Hello, ${name}'",
			errors: [{ messageId }],
		},
		{
			code: '"Hello, ${name}"',
			errors: [{ messageId }],
		},
		{
			code: "'${greeting}, ${name}'",
			errors: [{ messageId }],
		},
		{
			code: "'Hello, ${index + 1}'",
			errors: [{ messageId }],
		},
		{
			code: "'Hello, ${name + \" foo\"}'",
			errors: [{ messageId }],
		},
		{
			code: "'Hello, ${name || \"foo\"}'",
			errors: [{ messageId }],
		},
		{
			code: "'Hello, ${{foo: \"bar\"}.foo}'",
			errors: [{ messageId }],
		},
	],
});
