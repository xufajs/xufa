// ESLint's RuleTester for the rules' tests ported from ESLint (test/rules, by tools/port-lint), on @xufa/lint's
// linter: each valid case has no problems; each invalid case has the problems it lists (their count, message or
// messageId with its data, node type, line, column, end), the output of its fixes, and its suggestions with theirs.
// Cases for another parser (typescript-eslint's, a fixture's) are skipped: @xufa/lint parses JavaScript and JSX.

import assert from 'node:assert';
import { Linter } from '../lib/linter.js';
import { defineRule } from '../lib/rules/index.js';
import { applyFixes } from '../lib/report/apply-fixes.js';
import { interpolate } from '../lib/report/report.js';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function merge(base, extra) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value === undefined) continue;
    out[key] = isObject(value) && isObject(base?.[key]) ? merge(base[key], value) : value;
  }
  return out;
}

const skipped = { cases: 0 };

class RuleTester {
  constructor(config = {}) {
    this.config = config;
    this.linter = new Linter();
  }

  static get skipped() {
    return skipped.cases;
  }

  // The problems of a case: those of the rule (its id is rule-to-test/<name>).
  run(name, rule, { valid = [], invalid = [] }) {
    const id = `rule-to-test/${name}`;
    defineRule(id, rule);
    // The rules of the config's plugins, as <plugin>/<rule>.
    for (const [plugin, { rules = {} } = {}] of Object.entries(this.config.plugins ?? {})) {
      for (const [ruleName, definition] of Object.entries(rules)) defineRule(`${plugin}/${ruleName}`, definition);
    }
    const configOf = (item) => {
      const config = merge(this.config, {
        languageOptions: item.languageOptions,
        settings: item.settings,
        linterOptions: { reportUnusedDisableDirectives: 'off' },
      });
      config.rules = { ...config.rules, [id]: ['error', ...(item.options ?? [])] };
      return config;
    };
    const unsupported = (item) => {
      const parser = item.languageOptions?.parser ?? this.config.languageOptions?.parser;
      // (And HTML-like comments, `<!--` and `-->` of scripts (Annex B): TypeScript's parser does not read them.)
      return Boolean(parser?.unsupported) || item.parser !== undefined || /<!--|^\s*-->/mu.test(item.code);
    };
    const lint = (item) => {
      const messages = this.linter.verify(item.code, configOf(item), item.filename ?? 'file.js');
      const fatal = messages.find((message) => message.fatal);
      if (fatal) throw new Error(`A fatal parsing error: ${fatal.message} (line ${fatal.line}, column ${fatal.column})`);
      // (Every message, as ESLint's RuleTester counts them: rules a case enables in a comment report too.)
      return messages;
    };
    const title = (item) => (item.name ?? item.code).replace(/\s+/g, ' ').slice(0, 120);
    const test = (item, check) => {
      if (unsupported(item)) {
        skipped.cases += 1;
        it.skip(title(item), () => {});
        return;
      }
      (item.only ? it.only : it)(title(item), () => check(item));
    };

    describe(name, () => {
      describe('valid', () => {
        for (const raw of valid) {
          const item = typeof raw === 'string' ? { code: raw } : raw;
          test(item, () => {
            const messages = lint(item);
            assert.strictEqual(
              messages.length,
              0,
              `Should have no errors but had ${messages.length}: ${messages.map((m) => m.message).join('; ')}`
            );
          });
        }
      });
      describe('invalid', () => {
        for (const item of invalid) {
          test(item, () => {
            const messages = lint(item);
            const errors = item.errors;
            if (typeof errors === 'number') {
              assert.strictEqual(messages.length, errors, `Should have ${errors} errors but had ${messages.length}`);
            } else {
              assert.strictEqual(
                messages.length,
                errors.length,
                `Should have ${errors.length} errors but had ${messages.length}: ${messages.map((m) => m.message).join('; ')}`
              );
              errors.forEach((expected, index) => checkError(rule, item, messages[index], expected, index));
            }
            if (Object.hasOwn(item, 'output')) {
              const fixed = applyFixes(item.code, messages).output;
              if (item.output === null) assert.strictEqual(fixed, item.code, 'Expected no autofixes to be suggested');
              else assert.strictEqual(fixed, item.output, 'Output is incorrect.');
            }
          });
        }
      });
    });
  }
}

function checkError(rule, item, message, expected, index) {
  if (typeof expected === 'string' || expected instanceof RegExp) {
    if (expected instanceof RegExp) assert.match(message.message, expected);
    else assert.strictEqual(message.message, expected);
    return;
  }
  if (Object.hasOwn(expected, 'message')) {
    if (expected.message instanceof RegExp) assert.match(message.message, expected.message);
    else assert.strictEqual(message.message, expected.message, `Error ${index}: message`);
  }
  if (Object.hasOwn(expected, 'messageId')) {
    assert.strictEqual(message.messageId, expected.messageId, `Error ${index}: messageId`);
    if (Object.hasOwn(expected, 'data')) {
      const template = rule.meta.messages[expected.messageId];
      assert.strictEqual(message.message, interpolate(template, expected.data), `Error ${index}: message of its data`);
    }
  }
  for (const key of ['type', 'line', 'column', 'endLine', 'endColumn']) {
    if (Object.hasOwn(expected, key)) {
      const actual = key === 'type' ? message.nodeType : message[key];
      assert.strictEqual(actual, expected[key], `Error ${index}: ${key}`);
    }
  }
  if (Object.hasOwn(expected, 'suggestions')) {
    const actual = message.suggestions ?? [];
    const wanted = expected.suggestions;
    if (wanted === null || (Array.isArray(wanted) && wanted.length === 0)) {
      assert.strictEqual(actual.length, 0, `Error ${index}: should have no suggestions`);
      return;
    }
    if (typeof wanted === 'number') {
      assert.strictEqual(actual.length, wanted, `Error ${index}: suggestions`);
      return;
    }
    assert.strictEqual(actual.length, wanted.length, `Error ${index}: the number of its suggestions`);
    wanted.forEach((suggestion, at) => {
      const got = actual[at];
      if (Object.hasOwn(suggestion, 'desc')) assert.strictEqual(got.desc, suggestion.desc, `Suggestion ${at}: desc`);
      if (Object.hasOwn(suggestion, 'messageId')) {
        assert.strictEqual(got.messageId, suggestion.messageId, `Suggestion ${at}: messageId`);
        if (Object.hasOwn(suggestion, 'data')) {
          const template = rule.meta.messages[suggestion.messageId];
          assert.strictEqual(got.desc, interpolate(template, suggestion.data), `Suggestion ${at}: desc of its data`);
        }
      }
      if (Object.hasOwn(suggestion, 'output')) {
        const output = applyFixes(item.code, [got]).output;
        assert.strictEqual(output, suggestion.output, `Suggestion ${at}: output`);
      }
    });
  }
}

export default RuleTester;
RuleTester.RuleTester = RuleTester;

export { RuleTester };
