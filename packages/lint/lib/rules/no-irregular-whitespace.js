// Irregular whitespace (no-break spaces, zero-width spaces, form feeds, U+2028/U+2029 line terminators...) anywhere in
// the source, except inside strings (skipStrings, on by default), comments (skipComments), regular expressions
// (skipRegExps), template literals (skipTemplates) and JSX text (skipJSXText).

import { createGlobalLinebreakMatcher } from './utils/ast.js';

const ALL_IRREGULARS =
  /[\f\v\u0085\ufeff\u00a0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u200b\u202f\u205f\u3000\u2028\u2029]/u;
const IRREGULAR_WHITESPACE =
  /[\f\v\u0085\ufeff\u00a0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u200b\u202f\u205f\u3000]+/gu;
const LINE_BREAK = createGlobalLinebreakMatcher();

export const meta = {
  type: 'problem',
  defaultOptions: [
    { skipComments: false, skipJSXText: false, skipRegExps: false, skipStrings: true, skipTemplates: false },
  ],
  docs: {
    description: 'Disallow irregular whitespace',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-irregular-whitespace',
  },
  schema: [
    {
      type: 'object',
      properties: {
        skipComments: { type: 'boolean' },
        skipStrings: { type: 'boolean' },
        skipTemplates: { type: 'boolean' },
        skipRegExps: { type: 'boolean' },
        skipJSXText: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  ],
  messages: {
    noIrregularWhitespace: 'Irregular whitespace not allowed.',
  },
};

export function create(context) {
  const [{ skipComments, skipStrings, skipRegExps, skipTemplates, skipJSXText }] = context.options;
  const { sourceCode } = context;
  const text = sourceCode.getText();
  if (!ALL_IRREGULARS.test(text)) return {};

  // Every irregular whitespace of the source is found up front; the skipped nodes then remove theirs.
  let errors = [];

  /** Drops the errors starting inside the node (as ESLint does: any column of its end line counts as after it). */
  function removeErrorsIn(node, raw) {
    if (!errors.length || !ALL_IRREGULARS.test(raw)) return;
    const { start, end } = node.loc;
    errors = errors.filter(
      ({ loc: { start: at } }) =>
        at.line < start.line ||
        (at.line === start.line && at.column < start.column) ||
        (at.line === end.line && at.column >= end.column) ||
        at.line > end.line
    );
  }

  /** The problems of irregular whitespace runs in each line, then of U+2028/U+2029 line terminators. */
  function findErrors(node) {
    const { lines } = sourceCode;
    const error = (startLine, startColumn, endLine, endColumn) => ({
      node,
      messageId: 'noIrregularWhitespace',
      loc: { start: { line: startLine, column: startColumn }, end: { line: endLine, column: endColumn } },
    });
    for (let i = 0; i < lines.length; i++) {
      for (const match of lines[i].matchAll(IRREGULAR_WHITESPACE)) {
        errors.push(error(i + 1, match.index, i + 1, match.index + match[0].length));
      }
    }
    // An irregular line terminator ends line i: it is reported from the end of that line to the next one.
    const linebreaks = text.match(LINE_BREAK) ?? [];
    for (let i = 0; i < linebreaks.length; i++) {
      const linebreak = linebreaks[i];
      if (linebreak === '\u2028' || linebreak === '\u2029') errors.push(error(i + 1, lines[i].length, i + 2, 0));
    }
  }

  const listeners = {
    Program: findErrors,
    'Program:exit'() {
      if (skipComments) {
        for (const comment of sourceCode.getAllComments()) removeErrorsIn(comment, comment.value);
      }
      for (const error of errors) context.report(error);
    },
  };
  if (skipStrings || skipRegExps) {
    listeners.Literal = (node) => {
      if ((skipStrings && typeof node.value === 'string') || (skipRegExps && node.regex))
        removeErrorsIn(node, node.raw);
    };
  }
  if (skipTemplates) {
    listeners.TemplateElement = (node) => {
      if (typeof node.value.raw === 'string') removeErrorsIn(node, node.value.raw);
    };
  }
  if (skipJSXText) listeners.JSXText = (node) => removeErrorsIn(node, node.raw);
  return listeners;
}
