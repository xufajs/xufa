// Control characters (U+0000 to U+001F) in regular expressions, written raw or as \x or \u escapes, in regex
// literals and in string patterns passed to RegExp(). The message lists them as \xNN.

import { RegExpValidator } from '../regexp/index.js';

// Collects the control characters of a pattern through the validator's onCharacter hook.
const collector = new (class {
  constructor() {
    this.source = '';
    this.controlChars = [];
    this.validator = new RegExpValidator(this);
  }

  // Without the u flag, a pattern with a group name is parsed twice: only the last pass counts.
  onPatternEnter() {
    this.controlChars = [];
  }

  onCharacter(start, end, cp) {
    if (cp > 0x1f) return;
    const { source } = this;
    if (source.codePointAt(start) === cp || source.startsWith('\\x', start) || source.startsWith('\\u', start)) {
      this.controlChars.push(`\\x${cp.toString(16).padStart(2, '0')}`);
    }
  }

  collect(pattern, flags) {
    this.controlChars = [];
    this.source = pattern;
    try {
      this.validator.validatePattern(pattern, undefined, undefined, {
        unicode: typeof flags === 'string' && flags.includes('u'),
        unicodeSets: typeof flags === 'string' && flags.includes('v'),
      });
    } catch {
      // Invalid patterns are left to other rules.
    }
    return this.controlChars;
  }
})();

/** The pattern and flags (null when not a string literal) of a regex literal or of RegExp()'s first argument. */
function getRegExp(node) {
  if (node.regex) return node.regex;
  if (typeof node.value !== 'string') return null;
  const { parent } = node;
  if (parent.type !== 'NewExpression' && parent.type !== 'CallExpression') return null;
  if (parent.callee.type !== 'Identifier' || parent.callee.name !== 'RegExp' || parent.arguments[0] !== node) {
    return null;
  }
  const flags = parent.arguments[1];
  return {
    pattern: node.value,
    flags: flags?.type === 'Literal' && typeof flags.value === 'string' ? flags.value : null,
  };
}

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow control characters in regular expressions',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-control-regex',
  },
  schema: [],
  messages: {
    unexpected: 'Unexpected control character(s) in regular expression: {{controlChars}}.',
  },
};

export function create(context) {
  return {
    Literal(node) {
      const regExp = getRegExp(node);
      if (!regExp) return;
      const controlChars = collector.collect(regExp.pattern, regExp.flags);
      if (controlChars.length) {
        context.report({ node, messageId: 'unexpected', data: { controlChars: controlChars.join(', ') } });
      }
    },
  };
}
