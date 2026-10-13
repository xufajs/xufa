import { Linter } from '../../lib/linter.js';
import { defineRule } from '../../lib/rules/index.js';
import { FileReport, interpolate } from '../../lib/report/report.js';
import { applyFixes } from '../../lib/report/apply-fixes.js';
import { normalizeSeverityToNumber } from '../../lib/util/severity.js';
import { deepMergeArrays } from '../../lib/util/deep-merge.js';

const language = { lineStart: 1, columnStart: 0 };

// A rule that reports each identifier as `report(node)` says.
defineRule('test-report/identifiers', {
  meta: { messages: { named: 'Name {{ name }}.', rename: 'Rename to {{to}}.' }, fixable: 'code', hasSuggestions: true },
  create: (context) => ({
    Identifier(node) {
      context.report({
        node,
        messageId: 'named',
        data: { name: node.name },
        fix: (fixer) => [fixer.insertTextBefore(node, '_'), fixer.insertTextAfter(node, '_')],
        suggest: [{ messageId: 'rename', data: { to: 'x' }, fix: (fixer) => fixer.replaceText(node, 'x') }],
      });
    },
  }),
});

describe('reports', () => {
  const linter = new Linter();

  it('a problem: its message with data, its place, its fix (merged), its suggestions', () => {
    const [problem] = linter.verify('let ab;', { rules: { 'test-report/identifiers': 'error' } });
    expect(problem).toEqual({
      ruleId: 'test-report/identifiers',
      severity: 2,
      message: 'Name ab.',
      line: 1,
      column: 5,
      nodeType: 'Identifier',
      messageId: 'named',
      endLine: 1,
      endColumn: 7,
      fix: { range: [4, 6], text: '_ab_' },
      suggestions: [{ messageId: 'rename', data: { to: 'x' }, desc: 'Rename to x.', fix: { range: [4, 6], text: 'x' } }],
    });
  });

  it("wrong reports are ESLint's errors", () => {
    const report = new FileReport({ language, ruleMapper: () => ({ meta: { messages: { a: 'A' } } }), sourceCode: null });
    expect(() => report.addRuleMessage('r', 2, { loc: { line: 1, column: 0 }, messageId: 'b' })).toThrow(
      "context.report() called with a messageId of 'b' which is not present in the 'messages' config"
    );
    expect(() => report.addRuleMessage('r', 2, { messageId: 'a' })).toThrow(
      'Node must be provided when reporting error if location is not provided'
    );
    expect(() => report.addRuleMessage('r', 2, { loc: { line: 1, column: 0 } })).toThrow('Missing `message` property');
  });

  it('problems of the linter: a rule not found, one replaced', () => {
    const report = new FileReport({ language, ruleMapper: () => null });
    expect(report.addError({ ruleId: 'nope' }).message).toBe("Definition for rule 'nope' was not found.");
    expect(report.addError({ ruleId: 'no-comma-dangle' }).message).toBe(
      "Rule 'no-comma-dangle' was removed and replaced by: comma-dangle"
    );
    expect(report.addFatal({ message: 'x' })).toMatchObject({ fatal: true, line: 1, column: 1, endLine: 1, endColumn: 2 });
  });

  it('interpolate: names (trimmed) of the data, others kept', () => {
    expect(interpolate('{{ a }} {{b}} {{c}}', { a: 1, b: '{{a}}' })).toBe('1 {{a}} {{c}}');
    expect(interpolate('{{a}}')).toBe('{{a}}');
  });
});

describe('directives', () => {
  const linter = new Linter();
  const rules = { 'no-debugger': 'error', 'no-empty': 'error' };

  it('suppress problems of their rules, and say which do nothing', () => {
    const text = 'debugger; // eslint-disable-line no-debugger -- why\n/* eslint-disable no-empty, no-debugger */\n{}\n';
    const problems = linter.verify(text, { rules, linterOptions: { reportUnusedDisableDirectives: 'warn' } });
    expect(problems.map(({ message, line, fix }) => [message, line, fix])).toEqual([
      ["Unused eslint-disable directive (no problems were reported from 'no-debugger').", 2, { range: [78, 91], text: '' }],
    ]);
    expect(linter.getSuppressedMessages().map(({ ruleId, suppressions }) => [ruleId, suppressions])).toEqual([
      ['no-debugger', [{ kind: 'directive', justification: 'why' }]],
      ['no-empty', [{ kind: 'directive', justification: '' }]],
    ]);
  });
});

describe('fixes', () => {
  it('applied in order, not overlapping; a byte order mark kept', () => {
    const problems = [
      { line: 1, column: 1, fix: { range: [0, 1], text: 'A' } },
      { line: 1, column: 1, fix: { range: [0, 2], text: 'X' } },
      { line: 1, column: 3, fix: { range: [2, 3], text: 'C' } },
      { line: 1, column: 4, message: 'no fix' },
    ];
    const result = applyFixes('﻿abcd', problems);
    expect(result.output).toBe('﻿AbCd');
    expect(result.fixed).toBe(true);
    expect(result.messages.map((problem) => problem.fix?.text ?? problem.message)).toEqual(['X', 'no fix']);
    expect(applyFixes('ab', problems, false).output).toBe('ab');
  });
});

describe('severities and options', () => {
  it('severities', () => {
    expect(['off', 0, '1', 'warn', 2, 'error'].map(normalizeSeverityToNumber)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(() => normalizeSeverityToNumber('high')).toThrow('Invalid severity value: high');
  });

  it('options over defaults', () => {
    expect(deepMergeArrays([{ a: 1, b: { c: 1 } }, 'x'], [{ b: { d: 2 } }])).toEqual([{ a: 1, b: { c: 1, d: 2 } }, 'x']);
    expect(deepMergeArrays(undefined, [1])).toEqual([1]);
  });
});
