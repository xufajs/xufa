/**
 * @author Toru Nagashima <https://github.com/mysticatea>
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const rule = require("../../lib/eslint/lib/rules/no-misleading-character-class"),
	RuleTester = require("../rule-tester");

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const ruleTester = new RuleTester({
	languageOptions: { ecmaVersion: 2015 },
});

/*
 * /[👍]/ // ERROR: a surrogate pair in a character class without u flag.
 * /[❇️]/u // ERROR: variation selectors in a character class.
 * /[👨‍👩‍👦]/u // ERROR: ZWJ in a character class.
 * /[🇯🇵]/u // ERROR: a U+1F1E6-1F1FF pair in a character class.
 * /[👶🏻]/u // ERROR: an emoji which is made with an emoji and skin tone selector, in a character class.
 */

ruleTester.run("no-misleading-character-class", rule, {
	valid: [
		"var r = /[👍]/u",
		"var r = /[\\uD83D\\uDC4D]/u",
		"var r = /[\\u{1F44D}]/u",
		"var r = /❇️/",
		"var r = /Á/",
		"var r = /[❇]/",
		"var r = /👶🏻/",
		"var r = /[👶]/u",
		"var r = /🇯🇵/",
		"var r = /[JP]/",
		"var r = /👨‍👩‍👦/",
		"new RegExp()",
		"var r = RegExp(/[👍]/u)",
		"const regex = /[👍]/u; new RegExp(regex);",
		{
			code: "new RegExp('[👍]')",
			languageOptions: { globals: { RegExp: "off" } },
		},

		// Ignore solo lead/tail surrogate.
		"var r = /[\\uD83D]/",
		"var r = /[\\uDC4D]/",
		"var r = /[\\uD83D]/u",
		"var r = /[\\uDC4D]/u",

		// Ignore solo combining char.
		"var r = /[\\u0301]/",
		"var r = /[\\uFE0F]/",
		"var r = /[\\u0301]/u",
		"var r = /[\\uFE0F]/u",

		// Ignore solo emoji modifier.
		"var r = /[\\u{1F3FB}]/u",
		"var r = /[\u{1F3FB}]/u",

		// Ignore solo regional indicator symbol.
		"var r = /[🇯]/u",
		"var r = /[🇵]/u",

		// Ignore solo ZWJ.
		"var r = /[\\u200D]/",
		"var r = /[\\u200D]/u",

		// don't report and don't crash on invalid regex
		"new RegExp('[Á] [ ');",
		"var r = new RegExp('[Á] [ ');",
		"var r = RegExp('{ [Á]', 'u');",
		{
			code: "var r = new globalThis.RegExp('[Á] [ ');",
			languageOptions: { ecmaVersion: 2020 },
		},
		{
			code: "var r = globalThis.RegExp('{ [Á]', 'u');",
			languageOptions: { ecmaVersion: 2020 },
		},

		// don't report on templates with expressions
		"var r = RegExp(`${x}[👍]`)",

		// don't report on unknown flags
		"var r = new RegExp('[🇯🇵]', `${foo}`)",
		String.raw`var r = new RegExp("[👍]", flags)`,

		// don't report on spread arguments
		"const args = ['[👍]', 'i']; new RegExp(...args);",

		// ES2024
		{ code: "var r = /[👍]/v", languageOptions: { ecmaVersion: 2024 } },
		{
			code: String.raw`var r = /^[\q{👶🏻}]$/v`,
			languageOptions: { ecmaVersion: 2024 },
		},
		{
			code: String.raw`var r = /[🇯\q{abc}🇵]/v`,
			languageOptions: { ecmaVersion: 2024 },
		},
		{ code: "var r = /[🇯[A]🇵]/v", languageOptions: { ecmaVersion: 2024 } },
		{
			code: "var r = /[🇯[A--B]🇵]/v",
			languageOptions: { ecmaVersion: 2024 },
		},

		// allowEscape
		{
			code: String.raw`/[\ud83d\udc4d]/`,
			options: [{ allowEscape: true }],
		},
		{
			code: '/[\ud83d\\udc4d]/u // U+D83D + Backslash + "udc4d"',
			options: [{ allowEscape: true }],
		},
		{
			code: String.raw`/[A\u0301]/`,
			options: [{ allowEscape: true }],
		},
		{
			code: String.raw`/[👶\u{1f3fb}]/u`,
			options: [{ allowEscape: true }],
		},
		{
			code: String.raw`/[\u{1F1EF}\u{1F1F5}]/u`,
			options: [{ allowEscape: true }],
		},
		{
			code: String.raw`/[👨\u200d👩\u200d👦]/u`,
			options: [{ allowEscape: true }],
		},
		{
			code: String.raw`/[\u00B7\u0300-\u036F]/u`,
			options: [{ allowEscape: true }],
		},
		{
			code: String.raw`/[\n\u0305]/`,
			options: [{ allowEscape: true }],
		},
		{
			code: String.raw`RegExp("[\uD83D\uDC4D]")`,
			options: [{ allowEscape: true }],
		},
		{
			code: String.raw`RegExp("[A\u0301]")`,
			options: [{ allowEscape: true }],
		},
		{
			code: String.raw`RegExp("[\x41\\u0301]")`,
			options: [{ allowEscape: true }],
		},
		{
			code: 'RegExp(`[\\uD83D\\uDC4D]`) // Backslash + "uD83D" + Backslash + "uDC4D"',
			options: [{ allowEscape: true }],
		},
	],
	invalid: [
		// RegExp Literals.
		{
			code: "var r = /[👍]/",
			errors: [
				{
					column: 11,
					endColumn: 13,
					line: 1,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = /[👍]/u",
						},
					],
				},
			],
		},
		{
			code: "var r = /[\\uD83D\\uDC4D]/",
			errors: [
				{
					column: 11,
					endColumn: 23,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = /[\\uD83D\\uDC4D]/u",
						},
					],
				},
			],
		},
		{
			code: "var r = /[\\uD83D\\uDC4D-\\uffff]/",
			languageOptions: { ecmaVersion: 3, sourceType: "script" },
			errors: [
				{
					column: 11,
					endColumn: 23,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: null, // pattern would be invalid with the 'u' flag
				},
			],
		},
		{
			code: "var r = /[👍]/",
			languageOptions: { ecmaVersion: 3, sourceType: "script" },
			errors: [
				{
					column: 11,
					endColumn: 13,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: null, // pattern would be invalid with the 'u' flag, ecmaVersion doesn't support the 'u' flag
				},
			],
		},
		{
			code: "var r = /before[\\uD83D\\uDC4D]after/",
			errors: [
				{
					column: 17,
					endColumn: 29,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = /before[\\uD83D\\uDC4D]after/u",
						},
					],
				},
			],
		},
		{
			code: "var r = /[before\\uD83D\\uDC4Dafter]/",
			errors: [
				{
					column: 17,
					endColumn: 29,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = /[before\\uD83D\\uDC4Dafter]/u",
						},
					],
				},
			],
		},
		{
			code: "var r = /\\uDC4D[\\uD83D\\uDC4D]/",
			errors: [
				{
					column: 17,
					endColumn: 29,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = /\\uDC4D[\\uD83D\\uDC4D]/u",
						},
					],
				},
			],
		},
		{
			code: "var r = /[👍]/",
			languageOptions: { ecmaVersion: 5, sourceType: "script" },
			errors: [
				{
					column: 11,
					endColumn: 13,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: null, // ecmaVersion doesn't support the 'u' flag
				},
			],
		},
		{
			code: "var r = /[👍]\\a/",
			errors: [
				{
					column: 11,
					endColumn: 13,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: null, // pattern would be invalid with the 'u' flag
				},
			],
		},
		{
			code: "var r = /\\a[👍]\\a/",
			errors: [
				{
					column: 13,
					endColumn: 15,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: null, // pattern would be invalid with the 'u' flag
				},
			],
		},
		{
			code: "var r = /(?<=[👍])/",
			languageOptions: { ecmaVersion: 9 },
			errors: [
				{
					column: 15,
					endColumn: 17,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = /(?<=[👍])/u",
						},
					],
				},
			],
		},
		{
			code: "var r = /(?<=[👍])/",
			languageOptions: { ecmaVersion: 2018 },
			errors: [
				{
					column: 15,
					endColumn: 17,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = /(?<=[👍])/u",
						},
					],
				},
			],
		},
		{
			code: "var r = /[Á]/",
			errors: [
				{
					column: 11,
					endColumn: 13,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[Á]/u",
			errors: [
				{
					column: 11,
					endColumn: 13,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[\\u0041\\u0301]/",
			errors: [
				{
					column: 11,
					endColumn: 23,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[\\u0041\\u0301]/u",
			errors: [
				{
					column: 11,
					endColumn: 23,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[\\u{41}\\u{301}]/u",
			errors: [
				{
					column: 11,
					endColumn: 24,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[❇️]/",
			errors: [
				{
					column: 11,
					endColumn: 13,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[❇️]/u",
			errors: [
				{
					column: 11,
					endColumn: 13,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[\\u2747\\uFE0F]/",
			errors: [
				{
					column: 11,
					endColumn: 23,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[\\u2747\\uFE0F]/u",
			errors: [
				{
					column: 11,
					endColumn: 23,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[\\u{2747}\\u{FE0F}]/u",
			errors: [
				{
					column: 11,
					endColumn: 27,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[👶🏻]/",
			errors: [
				{
					column: 11,
					endColumn: 13,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = /[👶🏻]/u",
						},
					],
				},
				{
					column: 13,
					endColumn: 15,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = /[👶🏻]/u",
						},
					],
				},
			],
		},
		{
			code: "var r = /[👶🏻]/u",
			errors: [
				{
					column: 11,
					endColumn: 15,
					messageId: "emojiModifier",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[a\\uD83C\\uDFFB]/u",
			errors: [
				{
					column: 11,
					endColumn: 24,
					messageId: "emojiModifier",
				},
			],
		},
		{
			code: "var r = /[\\uD83D\\uDC76\\uD83C\\uDFFB]/u",
			errors: [
				{
					column: 11,
					endColumn: 35,
					messageId: "emojiModifier",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[\\u{1F476}\\u{1F3FB}]/u",
			errors: [
				{
					column: 11,
					endColumn: 29,
					messageId: "emojiModifier",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[🇯🇵]/",
			errors: [
				{
					column: 11,
					endColumn: 13,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = /[🇯🇵]/u",
						},
					],
				},
				{
					column: 13,
					endColumn: 15,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = /[🇯🇵]/u",
						},
					],
				},
			],
		},
		{
			code: "var r = /[🇯🇵]/i",
			errors: [
				{
					column: 11,
					endColumn: 13,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = /[🇯🇵]/iu",
						},
					],
				},
				{
					column: 13,
					endColumn: 15,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = /[🇯🇵]/iu",
						},
					],
				},
			],
		},
		{
			code: "var r = /[🇯🇵]/u",
			errors: [
				{
					column: 11,
					endColumn: 15,
					messageId: "regionalIndicatorSymbol",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[\\uD83C\\uDDEF\\uD83C\\uDDF5]/u",
			errors: [
				{
					column: 11,
					endColumn: 35,
					messageId: "regionalIndicatorSymbol",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[\\u{1F1EF}\\u{1F1F5}]/u",
			errors: [
				{
					column: 11,
					endColumn: 29,
					messageId: "regionalIndicatorSymbol",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[👨‍👩‍👦]/",
			errors: [
				{
					column: 11,
					endColumn: 13,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = /[👨‍👩‍👦]/u",
						},
					],
				},
				{
					column: 12,
					endColumn: 15,
					messageId: "zwj",
					suggestions: null,
				},
				{
					column: 14,
					endColumn: 16,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = /[👨‍👩‍👦]/u",
						},
					],
				},
				{
					column: 15,
					endColumn: 18,
					messageId: "zwj",
					suggestions: null,
				},
				{
					column: 17,
					endColumn: 19,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = /[👨‍👩‍👦]/u",
						},
					],
				},
			],
		},
		{
			code: "var r = /[👨‍👩‍👦]/u",
			errors: [
				{
					column: 11,
					endColumn: 19,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[👩‍👦]/u",
			errors: [
				{
					column: 11,
					endColumn: 16,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[👩‍👦][👩‍👦]/u",
			errors: [
				{
					column: 11,
					endColumn: 16,
					messageId: "zwj",
					suggestions: null,
				},
				{
					column: 18,
					endColumn: 23,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[👨‍👩‍👦]foo[👨‍👩‍👦]/u",
			errors: [
				{
					column: 11,
					endColumn: 19,
					messageId: "zwj",
					suggestions: null,
				},
				{
					column: 24,
					endColumn: 32,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[👨‍👩‍👦👩‍👦]/u",
			errors: [
				{
					column: 11,
					endColumn: 19,
					messageId: "zwj",
					suggestions: null,
				},
				{
					column: 19,
					endColumn: 24,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[\\uD83D\\uDC68\\u200D\\uD83D\\uDC69\\u200D\\uD83D\\uDC66]/u",
			errors: [
				{
					column: 11,
					endColumn: 59,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[\\u{1F468}\\u{200D}\\u{1F469}\\u{200D}\\u{1F466}]/u",
			errors: [
				{
					column: 11,
					endColumn: 54,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[\\uD83D\\uDC68\\u200D\\uD83D\\uDC69]/u",
			errors: [
				{
					column: 11,
					endColumn: 41,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[\\u{1F468}\\u{200D}\\u{1F469}]/u",
			errors: [
				{
					column: 11,
					endColumn: 37,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = /[\\u{1F468}\\u{200D}\\u{1F469}\\u{200D}\\u{1F466}]foo[\\u{1F468}\\u{200D}\\u{1F469}\\u{200D}\\u{1F466}]/u",
			errors: [
				{
					column: 11,
					endColumn: 54,
					messageId: "zwj",
					suggestions: null,
				},
				{
					column: 59,
					endColumn: 102,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},

		// RegExp constructors.
		{
			code: String.raw`var r = RegExp("[👍]", "")`,
			errors: [
				{
					column: 18,
					endColumn: 20,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = RegExp("[👍]", "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[👍]", "")`,
			errors: [
				{
					column: 22,
					endColumn: 24,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("[👍]", "u")`,
						},
					],
				},
			],
		},
		{
			code: "var r = new RegExp('[👍]', ``)",
			errors: [
				{
					column: 22,
					endColumn: 24,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = new RegExp('[👍]', `u`)",
						},
					],
				},
			],
		},
		{
			code: `var r = new RegExp(\`
                [👍]\`)`,
			errors: [
				{
					line: 2,
					endLine: 2,
					column: 18,
					endColumn: 20,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: `var r = new RegExp(\`
                [👍]\`, "u")`,
						},
					],
				},
			],
		},
		{
			code: `var r = new RegExp(\`
                [❇️]\`)`,
			errors: [
				{
					column: 18,
					endColumn: 20,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = new RegExp(`\r\n[❇️]`)",
			errors: [
				{
					line: 2,
					column: 2,
					endLine: 2,
					endColumn: 4,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`const flags = ""; var r = new RegExp("[👍]", flags)`,
			errors: [
				{
					column: 40,
					endColumn: 42,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = RegExp("[\\uD83D\\uDC4D]", "")`,
			errors: [
				{
					column: 18,
					endColumn: 32,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = RegExp("[\\uD83D\\uDC4D]", "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = RegExp("before[\\uD83D\\uDC4D]after", "")`,
			errors: [
				{
					column: 24,
					endColumn: 38,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = RegExp("before[\\uD83D\\uDC4D]after", "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = RegExp("[before\\uD83D\\uDC4Dafter]", "")`,
			errors: [
				{
					column: 24,
					endColumn: 38,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = RegExp("[before\\uD83D\\uDC4Dafter]", "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = RegExp("\t\t\t👍[👍]")`,
			errors: [
				{
					column: 26,
					endColumn: 28,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = RegExp("\t\t\t👍[👍]", "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("\u1234[\\uD83D\\uDC4D]")`,
			errors: [
				{
					column: 28,
					endColumn: 42,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("\u1234[\\uD83D\\uDC4D]", "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("\\u1234\\u5678👎[👍]")`,
			errors: [
				{
					column: 38,
					endColumn: 40,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("\\u1234\\u5678👎[👍]", "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("\\u1234\\u5678👍[👍]")`,
			errors: [
				{
					column: 38,
					endColumn: 40,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("\\u1234\\u5678👍[👍]", "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[👍]", "")`,
			languageOptions: { ecmaVersion: 3, sourceType: "script" },
			errors: [
				{
					column: 22,
					endColumn: 24,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: null, // ecmaVersion doesn't support the 'u' flag
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[👍]", "")`,
			languageOptions: { ecmaVersion: 5, sourceType: "script" },
			errors: [
				{
					column: 22,
					endColumn: 24,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: null, // ecmaVersion doesn't support the 'u' flag
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[👍]\\a", "")`,
			errors: [
				{
					column: 22,
					endColumn: 24,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: null, // pattern would be invalid with the 'u' flag
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("/(?<=[👍])", "")`,
			languageOptions: { ecmaVersion: 9 },
			errors: [
				{
					column: 27,
					endColumn: 29,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("/(?<=[👍])", "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("/(?<=[👍])", "")`,
			languageOptions: { ecmaVersion: 2018 },
			errors: [
				{
					column: 27,
					endColumn: 29,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("/(?<=[👍])", "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[Á]", "")`,
			errors: [
				{
					column: 22,
					endColumn: 24,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[Á]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 24,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[\\u0041\\u0301]", "")`,
			errors: [
				{
					column: 22,
					endColumn: 36,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[\\u0041\\u0301]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 36,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[\\u{41}\\u{301}]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 37,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[❇️]", "")`,
			errors: [
				{
					column: 22,
					endColumn: 24,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[❇️]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 24,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`new RegExp("[ \\ufe0f]", "")`,
			errors: [
				{
					column: 14,
					endColumn: 22,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`new RegExp("[ \\ufe0f]", "u")`,
			errors: [
				{
					column: 14,
					endColumn: 22,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`new RegExp("[ \\ufe0f][ \\ufe0f]")`,
			errors: [
				{
					column: 14,
					endColumn: 22,
					messageId: "combiningClass",
					suggestions: null,
				},
				{
					column: 24,
					endColumn: 32,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[\\u2747\\uFE0F]", "")`,
			errors: [
				{
					column: 22,
					endColumn: 36,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[\\u2747\\uFE0F]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 36,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[\\u{2747}\\u{FE0F}]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 40,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[👶🏻]", "")`,
			errors: [
				{
					column: 22,
					endColumn: 24,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("[👶🏻]", "u")`,
						},
					],
				},
				{
					column: 24,
					endColumn: 26,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("[👶🏻]", "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[👶🏻]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 26,
					messageId: "emojiModifier",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[\\uD83D\\uDC76\\uD83C\\uDFFB]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 50,
					messageId: "emojiModifier",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[\\u{1F476}\\u{1F3FB}]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 42,
					messageId: "emojiModifier",
					suggestions: null,
				},
			],
		},
		{
			code: "var r = RegExp(`\t\t\t👍[👍]`)",
			errors: [
				{
					column: 23,
					endColumn: 25,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: 'var r = RegExp(`\t\t\t👍[👍]`, "u")',
						},
					],
				},
			],
		},
		{
			code: "var r = RegExp(`\\t\\t\\t👍[👍]`)",
			errors: [
				{
					column: 26,
					endColumn: 28,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: 'var r = RegExp(`\\t\\t\\t👍[👍]`, "u")',
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[🇯🇵]", "")`,
			errors: [
				{
					column: 22,
					endColumn: 24,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("[🇯🇵]", "u")`,
						},
					],
				},
				{
					column: 24,
					endColumn: 26,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("[🇯🇵]", "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[🇯🇵]", "i")`,
			errors: [
				{
					column: 22,
					endColumn: 24,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("[🇯🇵]", "iu")`,
						},
					],
				},
				{
					column: 24,
					endColumn: 26,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("[🇯🇵]", "iu")`,
						},
					],
				},
			],
		},
		{
			code: "var r = new RegExp('[🇯🇵]', `i`)",
			errors: [
				{
					column: 22,
					endColumn: 24,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = new RegExp('[🇯🇵]', `iu`)",
						},
					],
				},
				{
					column: 24,
					endColumn: 26,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "var r = new RegExp('[🇯🇵]', `iu`)",
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[🇯🇵]")`,
			errors: [
				{
					column: 22,
					endColumn: 24,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("[🇯🇵]", "u")`,
						},
					],
				},
				{
					column: 24,
					endColumn: 26,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("[🇯🇵]", "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[🇯🇵]",)`,
			languageOptions: { ecmaVersion: 2017 },
			errors: [
				{
					column: 22,
					endColumn: 24,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("[🇯🇵]", "u",)`,
						},
					],
				},
				{
					column: 24,
					endColumn: 26,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("[🇯🇵]", "u",)`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp(("[🇯🇵]"))`,
			errors: [
				{
					column: 23,
					endColumn: 25,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp(("[🇯🇵]"), "u")`,
						},
					],
				},
				{
					column: 25,
					endColumn: 27,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp(("[🇯🇵]"), "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp((("[🇯🇵]")))`,
			errors: [
				{
					column: 24,
					endColumn: 26,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp((("[🇯🇵]")), "u")`,
						},
					],
				},
				{
					column: 26,
					endColumn: 28,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp((("[🇯🇵]")), "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp(("[🇯🇵]"),)`,
			languageOptions: { ecmaVersion: 2017 },
			errors: [
				{
					column: 23,
					endColumn: 25,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp(("[🇯🇵]"), "u",)`,
						},
					],
				},
				{
					column: 25,
					endColumn: 27,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp(("[🇯🇵]"), "u",)`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[🇯🇵]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 26,
					messageId: "regionalIndicatorSymbol",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[\\uD83C\\uDDEF\\uD83C\\uDDF5]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 50,
					messageId: "regionalIndicatorSymbol",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[\\u{1F1EF}\\u{1F1F5}]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 42,
					messageId: "regionalIndicatorSymbol",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[👨‍👩‍👦]", "")`,
			errors: [
				{
					column: 22,
					endColumn: 24,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("[👨‍👩‍👦]", "u")`,
						},
					],
				},
				{
					column: 23,
					endColumn: 26,
					messageId: "zwj",
					suggestions: null,
				},
				{
					column: 25,
					endColumn: 27,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("[👨‍👩‍👦]", "u")`,
						},
					],
				},
				{
					column: 26,
					endColumn: 29,
					messageId: "zwj",
					suggestions: null,
				},
				{
					column: 28,
					endColumn: 30,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new RegExp("[👨‍👩‍👦]", "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[👨‍👩‍👦]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 30,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[👩‍👦]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 27,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[👩‍👦][👩‍👦]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 27,
					messageId: "zwj",
					suggestions: null,
				},
				{
					column: 29,
					endColumn: 34,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[👨‍👩‍👦]foo[👨‍👩‍👦]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 30,
					messageId: "zwj",
					suggestions: null,
				},
				{
					column: 35,
					endColumn: 43,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[👨‍👩‍👦👩‍👦]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 30,
					messageId: "zwj",
					suggestions: null,
				},
				{
					column: 30,
					endColumn: 35,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[\\uD83D\\uDC68\\u200D\\uD83D\\uDC69\\u200D\\uD83D\\uDC66]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 78,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new RegExp("[\\u{1F468}\\u{200D}\\u{1F469}\\u{200D}\\u{1F466}]", "u")`,
			errors: [
				{
					column: 22,
					endColumn: 70,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new globalThis.RegExp("[❇️]", "")`,
			languageOptions: { ecmaVersion: 2020 },
			errors: [
				{
					column: 33,
					endColumn: 35,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new globalThis.RegExp("[👶🏻]", "u")`,
			languageOptions: { ecmaVersion: 2020 },
			errors: [
				{
					column: 33,
					endColumn: 37,
					messageId: "emojiModifier",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`var r = new globalThis.RegExp("[🇯🇵]", "")`,
			languageOptions: { ecmaVersion: 2020 },
			errors: [
				{
					column: 33,
					endColumn: 35,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new globalThis.RegExp("[🇯🇵]", "u")`,
						},
					],
				},
				{
					column: 35,
					endColumn: 37,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`var r = new globalThis.RegExp("[🇯🇵]", "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`var r = new globalThis.RegExp("[\\u{1F468}\\u{200D}\\u{1F469}\\u{200D}\\u{1F466}]", "u")`,
			languageOptions: { ecmaVersion: 2020 },
			errors: [
				{
					column: 33,
					endColumn: 81,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`/[\ud83d\u{dc4d}]/u`,
			errors: [
				{
					messageId: "surrogatePair",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`/[\u{d83d}\udc4d]/u`,
			errors: [
				{
					messageId: "surrogatePair",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`/[\u{d83d}\u{dc4d}]/u`,
			errors: [
				{
					messageId: "surrogatePair",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`/[\uD83D\u{DC4d}]/u`,
			errors: [
				{
					messageId: "surrogatePair",
					suggestions: null,
				},
			],
		},

		// no granular reports on templates with expressions
		{
			code: 'new RegExp(`${"[👍🇯🇵]"}[😊]`);',
			errors: [
				{
					column: 12,
					endColumn: 31,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: 'new RegExp(`${"[👍🇯🇵]"}[😊]`, "u");',
						},
					],
				},
			],
		},

		// no granular reports on identifiers
		{
			code: 'const pattern = "[👍]"; new RegExp(pattern);',
			errors: [
				{
					column: 36,
					endColumn: 43,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: 'const pattern = "[👍]"; new RegExp(pattern, "u");',
						},
					],
				},
			],
		},

		// second argument in RegExp should override flags in regex literal
		{
			code: "RegExp(/[a👍z]/u, '');",
			errors: [
				{
					column: 11,
					endColumn: 13,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "RegExp(/[a👍z]/u, 'u');",
						},
					],
				},
			],
		},

		/*
		 * These test cases have been disabled because of a limitation in Node.js 18, see https://github.com/eslint/eslint/pull/18082#discussion_r1506142421.
		 *
		 * {
		 *     code: "const pattern = /[👍]/u; RegExp(pattern, '');",
		 *     errors: [{
		 *         column: 33,
		 *         endColumn: 40,
		 *         messageId: "surrogatePairWithoutUFlag",
		 *         suggestions: [{
		 *             messageId: "suggestUnicodeFlag",
		 *             output: "const pattern = /[👍]/u; RegExp(pattern, 'u');"
		 *         }]
		 *     }]
		 * },
		 * {
		 *     code: "const pattern = /[👍]/g; RegExp(pattern, 'i');",
		 *     errors: [{
		 *         column: 19,
		 *         endColumn: 21,
		 *         messageId: "surrogatePairWithoutUFlag",
		 *         suggestions: [{
		 *             messageId: "suggestUnicodeFlag",
		 *             output: "const pattern = /[👍]/gu; RegExp(pattern, 'i');"
		 *         }]
		 *     }, {
		 *         column: 33,
		 *         endColumn: 40,
		 *         messageId: "surrogatePairWithoutUFlag",
		 *         suggestions: [{
		 *             messageId: "suggestUnicodeFlag",
		 *             output: "const pattern = /[👍]/g; RegExp(pattern, 'iu');"
		 *         }]
		 *     }]
		 * },
		 */

		// report only on regex literal if no flags are supplied
		{
			code: "RegExp(/[👍]/)",
			errors: [
				{
					column: 10,
					endColumn: 12,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "RegExp(/[👍]/u)",
						},
					],
				},
			],
		},

		// report only on RegExp call if a regex literal and flags are supplied
		{
			code: "RegExp(/[👍]/, 'i');",
			errors: [
				{
					column: 10,
					endColumn: 12,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "RegExp(/[👍]/, 'iu');",
						},
					],
				},
			],
		},

		// ignore RegExp if not built-in
		{
			code: "RegExp(/[👍]/, 'g');",
			languageOptions: { globals: { RegExp: "off" } },
			errors: [
				{
					column: 10,
					endColumn: 12,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "RegExp(/[👍]/u, 'g');",
						},
					],
				},
			],
		},

		{
			code: String.raw`

            // "[" and "]" escaped as "\x5B" and "\u005D"
            new RegExp("\x5B \\ufe0f\u005D")

            `,
			errors: [
				{
					column: 29,
					endColumn: 37,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`

            // backslash escaped as "\u{5c}"
            new RegExp("[ \u{5c}ufe0f]")

            `,
			errors: [
				{
					column: 26,
					endColumn: 38,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`

            // "0" escaped as "\60"
            new RegExp("[ \\ufe\60f]")

            `,
			languageOptions: { sourceType: "script" },
			errors: [
				{
					column: 26,
					endColumn: 36,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`

            // "e" escaped as "\e"
            new RegExp("[ \\uf\e0f]")

            `,
			errors: [
				{
					column: 26,
					endColumn: 35,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`

            // line continuation: backslash + <CR> + <LF>
            new RegExp('[ \\u<line continuation>fe0f]')

            `.replace("<line continuation>", "\\\r\n"),
			errors: [
				{
					line: 4,
					column: 26,
					endLine: 5,
					endColumn: 5,
					messageId: "combiningClass",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`

            // just a backslash escaped as "\\"
            new RegExp(<backtick>[.\\u200D.]<backtick>)

            `.replaceAll("<backtick>", "`"),
			errors: [
				{
					column: 26,
					endColumn: 35,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`

            // "u" escaped as "\x75"
            new RegExp(<backtick>[.\\\x75200D.]<backtick>)

            `.replaceAll("<backtick>", "`"),
			errors: [
				{
					column: 26,
					endColumn: 38,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},
		{
			code: String.raw`

            // unescaped <CR> <LF> counts as a single character
            new RegExp(<backtick>[<crlf>\\u200D.]<backtick>)

            `
				.replaceAll("<backtick>", "`")
				.replace("<crlf>", "\n"),
			errors: [
				{
					line: 4,
					column: 26,
					endLine: 5,
					endColumn: 9,
					messageId: "zwj",
					suggestions: null,
				},
			],
		},

		// ES2024

		{
			code: "var r = /[[👶🏻]]/v",
			languageOptions: { ecmaVersion: 2024 },
			errors: [
				{
					column: 12,
					endColumn: 16,
					messageId: "emojiModifier",
					suggestions: null,
				},
			],
		},
		{
			code: "new RegExp(/^[👍]$/v, '')",
			languageOptions: {
				ecmaVersion: 2024,
			},
			errors: [
				{
					column: 15,
					endColumn: 17,
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: "new RegExp(/^[👍]$/v, 'u')",
						},
					],
				},
			],
		},

		/*
		 * This test case has been disabled because of a limitation in Node.js 18, see https://github.com/eslint/eslint/pull/18082#discussion_r1506142421.
		 *
		 * {
		 *     code: "var r = /[👶🏻]/v; RegExp(r, 'v');",
		 *     languageOptions: {
		 *         ecmaVersion: 2024
		 *     },
		 *     errors: [{
		 *         column: 11,
		 *         endColumn: 15,
		 *         messageId: "emojiModifier",
		 *         suggestions: null
		 *     }, {
		 *         column: 27,
		 *         endColumn: 28,
		 *         messageId: "emojiModifier",
		 *         suggestions: null
		 *     }]
		 * }
		 */

		// allowEscape

		{
			code: String.raw`/[Á]/`,
			options: [{ allowEscape: false }],
			errors: [{ messageId: "combiningClass" }],
		},
		{
			code: String.raw`/[Á]/`,
			options: [{ allowEscape: void 0 }],
			errors: [{ messageId: "combiningClass" }],
		},
		{
			code: String.raw`/[\\̶]/`, // Backslash + Backslash + Combining Long Stroke Overlay
			options: [{ allowEscape: true }],
			errors: [{ messageId: "combiningClass" }],
		},
		{
			code: String.raw`/[\n̅]/`,
			options: [{ allowEscape: true }],
			errors: [{ messageId: "combiningClass" }],
		},
		{
			code: String.raw`/[\👍]/`,
			options: [{ allowEscape: true }],
			errors: [{ messageId: "surrogatePairWithoutUFlag" }],
		},
		{
			code: String.raw`RegExp('[\è]')`, // Backslash + Latin Small Letter E + Combining Grave Accent
			options: [{ allowEscape: true }],
			errors: [{ messageId: "combiningClass" }],
		},
		{
			code: String.raw`RegExp('[\👍]')`,
			options: [{ allowEscape: true }],
			errors: [
				{
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: String.raw`RegExp('[\👍]', "u")`,
						},
					],
				},
			],
		},
		{
			code: String.raw`RegExp('[\\👍]')`,
			options: [{ allowEscape: true }],
			errors: [{ messageId: "surrogatePairWithoutUFlag" }],
		},
		{
			code: String.raw`RegExp('[\❇️]')`,
			options: [{ allowEscape: true }],
			errors: [{ messageId: "combiningClass" }],
		},
		{
			code: "RegExp(`[\\👍]`) // Backslash + U+D83D + U+DC4D",
			options: [{ allowEscape: true }],
			errors: [
				{
					messageId: "surrogatePairWithoutUFlag",
					suggestions: [
						{
							messageId: "suggestUnicodeFlag",
							output: 'RegExp(`[\\👍]`, "u") // Backslash + U+D83D + U+DC4D',
						},
					],
				},
			],
		},
		{
			/*
			 * In this case the rule can determine the value of `pattern` statically but has no information about the source,
			 * so it doesn't know that escape sequences were used. This is a limitation with our tools.
			 */
			code: String.raw`const pattern = "[\x41\u0301]"; RegExp(pattern);`,
			options: [{ allowEscape: true }],
			errors: [{ messageId: "combiningClass" }],
		},
	],
});
