// Regex literals with an empty character class `[]`, which matches nothing. The negated `[^]` is fine. One problem
// per empty class; patterns regexpp cannot parse are ignored.

import { RegExpParser, visitRegExpAST } from '../regexp/index.js';

const parser = new RegExpParser();
const EMPTY_CLASS = /\[\]/u;

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow empty character classes in regular expressions',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-empty-character-class',
  },
  schema: [],
  messages: {
    unexpected: 'Empty class.',
  },
};

export function create(context) {
  return {
    Literal(node) {
      const { regex } = node;
      if (!regex || !EMPTY_CLASS.test(regex.pattern)) return;
      const { pattern, flags } = regex;
      let ast;
      try {
        ast = parser.parsePattern(pattern, 0, pattern.length, {
          unicode: flags.includes('u'),
          unicodeSets: flags.includes('v'),
        });
      } catch {
        return;
      }
      visitRegExpAST(ast, {
        onCharacterClassEnter(characterClass) {
          if (!characterClass.negate && !characterClass.elements.length) {
            context.report({ node, messageId: 'unexpected' });
          }
        },
      });
    },
  };
}
