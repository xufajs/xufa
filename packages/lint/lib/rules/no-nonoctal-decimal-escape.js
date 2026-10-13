// The escapes `\8` and `\9` in string literals, each reported at itself. Suggested: the digit alone (or, after `\0`,
// `\u00008` for both, or `8` for the escape alone, so as not to make an octal escape), or an escaped backslash.

const QUICK_TEST = /\\[89]/u;
// From where the last match ended, characters and escapes up to a `\8` or `\9`, the escape just before it captured.
const DECIMAL_ESCAPE = /(?:[^\\]|(?<previousEscape>\\.))*?(?<decimalEscape>\\[89])/suy;

/** The `\uXXXX` escape of a code unit. */
const unicodeEscape = (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Disallow `\\8` and `\\9` escape sequences in string literals',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-nonoctal-decimal-escape',
  },
  hasSuggestions: true,
  schema: [],
  messages: {
    decimalEscape: "Don't use '{{decimalEscape}}' escape sequence.",
    refactor: "Replace '{{original}}' with '{{replacement}}'. This maintains the current functionality.",
    escapeBackslash: "Replace '{{original}}' with '{{replacement}}' to include the actual backslash character.",
  },
};

export function create(context) {
  const { sourceCode } = context;
  const { text } = sourceCode;

  const suggestion = (messageId, range, replacement) => ({
    messageId,
    data: { original: text.slice(...range), replacement },
    fix: (fixer) => fixer.replaceTextRange(range, replacement),
  });

  return {
    Literal(node) {
      const { raw } = node;
      if (typeof node.value !== 'string' || !QUICK_TEST.test(raw)) return;
      DECIMAL_ESCAPE.lastIndex = 0;
      let match;
      while ((match = DECIMAL_ESCAPE.exec(raw))) {
        const { previousEscape, decimalEscape } = match.groups;
        const end = node.range[0] + match.index + match[0].length;
        const start = end - decimalEscape.length;
        const digit = decimalEscape[1];
        const suggest =
          previousEscape === '\\0'
            ? [
                suggestion('refactor', [start - previousEscape.length, end], `${unicodeEscape('\0')}${digit}`),
                suggestion('refactor', [start, end], unicodeEscape(digit)),
              ]
            : [suggestion('refactor', [start, end], digit)];
        suggest.push(suggestion('escapeBackslash', [start, end], `\\${decimalEscape}`));
        context.report({
          node,
          loc: { start: sourceCode.getLocFromIndex(start), end: sourceCode.getLocFromIndex(end) },
          messageId: 'decimalEscape',
          data: { decimalEscape },
          suggest,
        });
      }
    },
  };
}
