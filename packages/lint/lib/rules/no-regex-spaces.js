// Two or more consecutive spaces outside of character classes in a regular expression: a literal, or a string given
// to `RegExp()` / `new RegExp()` (not shadowed) with no flags or string flags. Only the first run is reported, and
// only if the source has two consecutive spaces (so `RegExp(' \ ')` is not). Fixed to ` {n}` when the pattern is
// written as is in the source.

import { getVariableByName } from './utils/ast.js';
import { RegExpParser, visitRegExpAST } from '../regexp/index.js';

const parser = new RegExpParser();
const DOUBLE_SPACE = / {2}/u;

/** Whether a node is a string literal. */
const isString = (node) => node?.type === 'Literal' && typeof node.value === 'string';

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Disallow multiple spaces in regular expressions',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-regex-spaces',
  },
  schema: [],
  fixable: 'code',
  messages: {
    multipleSpaces: 'Spaces are hard to count. Use {{{length}}}.',
  },
};

export function create(context) {
  const { sourceCode } = context;

  /** Checks `pattern`, written as `raw` in the source from `start`, reporting on `node`. */
  function check(node, pattern, raw, start, flags) {
    if (!DOUBLE_SPACE.test(raw)) return;
    let ast;
    try {
      ast = parser.parsePattern(pattern, 0, pattern.length, {
        unicode: flags.includes('u'),
        unicodeSets: flags.includes('v'),
      });
    } catch {
      return;
    }
    const classes = [];
    visitRegExpAST(ast, { onCharacterClassEnter: (cc) => classes.push(cc) });

    // A run of spaces, unless its last space is quantified (then the run but that space).
    const spaces = /( {2,})(?: [+*{?]|[^+*{?]|$)/gu;
    let match;
    while ((match = spaces.exec(pattern))) {
      const { index } = match;
      if (classes.some((cc) => cc.start <= index && index < cc.end)) continue;
      const { length } = match[1];
      context.report({
        node,
        messageId: 'multipleSpaces',
        data: { length },
        fix: (fixer) =>
          pattern === raw ? fixer.replaceTextRange([start + index, start + index + length], ` {${length}}`) : null,
      });
      return;
    }
  }

  function checkCall(node) {
    const { callee, arguments: args } = node;
    if (callee.type !== 'Identifier' || callee.name !== 'RegExp') return;
    const [patternNode, flagsNode] = args;
    if (!isString(patternNode)) return;
    if (args.length >= 2 && !isString(flagsNode)) return;
    if (getVariableByName(sourceCode.getScope(node), 'RegExp')?.defs.length > 0) return;
    const { value, raw, range } = patternNode;
    check(node, value, raw.slice(1, -1), range[0] + 1, args.length < 2 ? '' : flagsNode.value);
  }

  return {
    Literal(node) {
      const { regex, raw } = node;
      if (regex) check(node, regex.pattern, raw.slice(1, raw.lastIndexOf('/')), node.range[0] + 1, regex.flags);
    },
    CallExpression: checkCall,
    NewExpression: checkCall,
  };
}
