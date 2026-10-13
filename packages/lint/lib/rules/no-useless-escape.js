// Backslashes that escape nothing, in strings, untagged templates and regular expression literals (but the
// characters of allowRegexCharacters). Suggested: removing the backslash, or doubling it to keep it as a character
// (not offered inside a class intersection or subtraction of a `v` regexp).

import { LINEBREAKS, isDirective } from './utils/ast.js';
import { RegExpParser, visitRegExpAST } from '../regexp/index.js';

const VALID_STRING_ESCAPES = new Set([...'\\nrvtbfux', ...LINEBREAKS]);
const REGEX_GENERAL_ESCAPES = new Set('\\bcdDfnpPrsStvwWxu0123456789]');
const REGEX_NON_CHARCLASS_ESCAPES = new Set([...REGEX_GENERAL_ESCAPES, ...'^/.$*+?[{}|()Bk']);

// Characters to escape in a class in unicodeSets mode: ClassSetSyntaxCharacter ( ) [ ] { } / - \ | and `q`.
const REGEX_CLASSSET_CHARACTER_ESCAPES = new Set([...REGEX_GENERAL_ESCAPES, ...'q/[{}|()-']);

// The characters that doubled make a ClassSetReservedDoublePunctuator (&& !! ## $$ ...).
const REGEX_CLASS_SET_RESERVED_DOUBLE_PUNCTUATOR = new Set('!#$%&*+,.:;<=>?@^`~');

const STRING_ESCAPE = /\\\D/gu;

export const meta = {
  type: 'suggestion',
  defaultOptions: [{ allowRegexCharacters: [] }],
  docs: {
    description: 'Disallow unnecessary escape characters',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-useless-escape',
  },
  hasSuggestions: true,
  messages: {
    unnecessaryEscape: 'Unnecessary escape character: \\{{character}}.',
    removeEscape: 'Remove the `\\`. This maintains the current functionality.',
    removeEscapeDoNotKeepSemantics: 'Remove the `\\` if it was inserted by mistake.',
    escapeBackslash: 'Replace the `\\` with `\\\\` to include the actual backslash character.',
  },
  schema: [
    {
      type: 'object',
      properties: {
        allowRegexCharacters: { type: 'array', items: { type: 'string' }, uniqueItems: true },
      },
      additionalProperties: false,
    },
  ],
};

export function create(context) {
  const { sourceCode } = context;
  const [{ allowRegexCharacters }] = context.options;
  const parser = new RegExpParser();

  // Reports the backslash at `offset` in `node`, escaping `character`.
  function report(node, offset, character, noEscapeBackslash) {
    const start = node.range[0] + offset;
    const range = [start, start + 1];
    const loc = sourceCode.getLocFromIndex(start);
    const suggest = [
      {
        // Removing a backslash from a directive may change what it means.
        messageId: isDirective(node.parent) ? 'removeEscapeDoNotKeepSemantics' : 'removeEscape',
        fix: (fixer) => fixer.removeRange(range),
      },
    ];
    if (!noEscapeBackslash) {
      suggest.push({ messageId: 'escapeBackslash', fix: (fixer) => fixer.insertTextBeforeRange(range, '\\') });
    }
    context.report({
      node,
      loc: { start: loc, end: { line: loc.line, column: loc.column + 1 } },
      messageId: 'unnecessaryEscape',
      data: { character },
      suggest,
    });
  }

  // Checks the escapes of a string literal or a template element, whose source is `text`.
  function checkString(node, text, isTemplate) {
    STRING_ESCAPE.lastIndex = 0;
    let match;
    while ((match = STRING_ESCAPE.exec(text))) {
      const { index } = match;
      const char = text[index + 1];
      let useless = !VALID_STRING_ESCAPES.has(char);
      let isQuote;
      if (isTemplate) {
        isQuote = char === '`';
        // `\$` is needed before `{`, and `\{` after `$` (after `\$`, that one is reported).
        if (char === '$') useless = text[index + 2] !== '{';
        else if (char === '{') useless = text[index - 1] !== '$';
      } else {
        isQuote = char === node.raw[0];
      }
      if (useless && !isQuote) report(node, index, match[0].slice(1));
    }
  }

  function checkRegExp(node) {
    const { pattern, flags } = node.regex;
    const unicodeSets = flags.includes('v');
    let patternNode;
    try {
      patternNode = parser.parsePattern(pattern, 0, pattern.length, { unicode: flags.includes('u'), unicodeSets });
    } catch {
      return; // a syntax error
    }

    const classes = [];
    const enterClass = (classNode) => classes.push(classNode);
    const leaveClass = () => classes.pop();

    visitRegExpAST(patternNode, {
      onCharacterClassEnter: enterClass,
      onCharacterClassLeave: leaveClass,
      onExpressionCharacterClassEnter: enterClass,
      onExpressionCharacterClassLeave: leaveClass,
      onCharacterEnter(char) {
        if (char.raw[0] !== '\\') return;
        const escaped = char.raw.slice(1);
        // An escape that changes the character (\n, A...) is meaningful.
        if (escaped !== String.fromCodePoint(char.value) || allowRegexCharacters.includes(escaped)) return;
        const inClass = classes.at(-1);
        if (!inClass) {
          if (!REGEX_NON_CHARCLASS_ESCAPES.has(escaped)) report(node, char.start + 1, escaped);
          return;
        }
        if ((unicodeSets ? REGEX_CLASSSET_CHARACTER_ESCAPES : REGEX_GENERAL_ESCAPES).has(escaped)) return;

        const first = char.start === inClass.start + 1;
        // `^` needs escaping at the start of a class.
        if (escaped === '^' && first) return;
        if (!unicodeSets) {
          // `-` needs escaping inside a class, but not at its edges.
          if (escaped === '-' && !first && char.end !== inClass.end - 1) return;
          report(node, char.start + 1, escaped);
          return;
        }
        if (
          REGEX_CLASS_SET_RESERVED_DOUBLE_PUNCTUATOR.has(escaped) &&
          isPartOfDoublePunctuator(char, escaped, inClass)
        ) {
          return;
        }
        const parentType = char.parent.type;
        report(node, char.start + 1, escaped, parentType === 'ClassIntersection' || parentType === 'ClassSubtraction');
      },
    });

    // Whether the escaped `escaped` is next to the same character, which would make a reserved double punctuator,
    // but the `^` that negates the class.
    function isPartOfDoublePunctuator(char, escaped, classNode) {
      if (pattern[char.end] === escaped) return true;
      if (pattern[char.start - 1] !== escaped) return false;
      return escaped !== '^' || !classNode.negate || classNode.start + 1 < char.start - 1;
    }
  }

  function check(node) {
    const isTemplate = node.type === 'TemplateElement';
    if (isTemplate) {
      // The tag of a tagged template gets the backslashes.
      const literal = node.parent;
      if (literal?.parent?.type === 'TaggedTemplateExpression' && literal === literal.parent.quasi) return;
    }
    if (isTemplate || typeof node.value === 'string') {
      // JSX attributes and text have no escape sequences.
      const parentType = node.parent.type;
      if (parentType === 'JSXAttribute' || parentType === 'JSXElement' || parentType === 'JSXFragment') return;
      const text = isTemplate ? sourceCode.getText(node) : node.raw;
      if (text.includes('\\')) checkString(node, text, isTemplate);
    } else if (node.regex) {
      checkRegExp(node);
    }
  }

  return {
    Literal: check,
    TemplateElement: check,
  };
}
