// Characters made of several code points inside a character class, in regex literals and in RegExp() calls with a
// constant pattern: surrogate pairs (without the u flag, or written with a \u{...} escape), a base character with a
// combining mark or an emoji modifier, two regional indicators (a flag), and sequences joined by ZWJ. With
// allowEscape, characters written as an escape do not count. Suggested for a surrogate pair without u: the u flag.
// Literal patterns (strings, static templates, regexes) report each sequence; others report the whole argument.

import { CALL, CONSTRUCT, ReferenceTracker } from '../ast/reference-tracker.js';
import { getStaticValue, getStringIfConstant } from '../ast/static-value.js';
import { RegExpParser, visitRegExpAST } from '../regexp/index.js';
import { isCombiningCharacter, isEmojiModifier, isRegionalIndicatorSymbol, isSurrogatePair } from './utils/unicode.js';
import { isStaticTemplateLiteral, isCommaToken } from './utils/ast.js';
import { isValidWithUnicodeFlag } from './utils/regular-expressions.js';
import { parseStringLiteral, parseTemplateToken } from './utils/char-source.js';

const TRACE_MAP = { RegExp: { [CALL]: true, [CONSTRUCT]: true } };
const CODE_POINT_ESCAPE = /^\\u\{[\da-f]+\}$/iu;
const ESCAPED_CHARACTER = /(?<=^\\+).$/su;
const ZWJ = 0x200d;

const isCodePointEscape = (char) => CODE_POINT_ESCAPE.test(char.raw);

// The kinds of pairs (previous, char), in report order. combiningClass looks at the previous character even when it
// is an accepted escape.
const PAIR_KINDS = [
  [
    'surrogatePairWithoutUFlag',
    (previous, char) =>
      isSurrogatePair(previous.value, char.value) && !isCodePointEscape(previous) && !isCodePointEscape(char),
  ],
  [
    'surrogatePair',
    (previous, char) =>
      isSurrogatePair(previous.value, char.value) && (isCodePointEscape(previous) || isCodePointEscape(char)),
  ],
  ['combiningClass', (previous, char) => isCombiningCharacter(char.value) && !isCombiningCharacter(previous.value)],
  ['emojiModifier', (previous, char) => isEmojiModifier(char.value) && !isEmojiModifier(previous.value)],
  [
    'regionalIndicatorSymbol',
    (previous, char) => isRegionalIndicatorSymbol(char.value) && isRegionalIndicatorSymbol(previous.value),
  ],
];
const KINDS = [...PAIR_KINDS.map(([kind]) => kind), 'zwj'];

/**
 * The sequences of characters of a class's elements. A range ends a sequence with its min and starts the next with
 * its max; sets, nested classes, \q{...} and class expressions end it.
 */
function getCharacterSequences(elements) {
  const sequences = [];
  let seq = [];
  for (const element of elements) {
    switch (element.type) {
      case 'Character':
        seq.push(element);
        break;
      case 'CharacterClassRange':
        seq.push(element.min);
        sequences.push(seq);
        seq = [element.max];
        break;
      case 'CharacterSet':
      case 'CharacterClass':
      case 'ClassStringDisjunction':
      case 'ExpressionCharacterClass':
        if (seq.length) sequences.push(seq);
        seq = [];
        break;
      // no default
    }
  }
  if (seq.length) sequences.push(seq);
  return sequences;
}

/** Adds to `matches` the ZWJ-joined runs of `chars` (null entries break them). */
function findZwjSequences(chars, matches) {
  let sequence = null;
  for (let i = 1; i < chars.length - 1; i++) {
    const previous = chars[i - 1];
    const char = chars[i];
    const next = chars[i + 1];
    if (!previous || !char || !next || char.value !== ZWJ || previous.value === ZWJ || next.value === ZWJ) continue;
    if (sequence?.at(-1) === previous) {
      sequence.push(char, next);
    } else {
      if (sequence) matches.push(sequence);
      sequence = [previous, char, next];
    }
  }
  if (sequence) matches.push(sequence);
}

/** Whether a character's source is backslashes followed by something other than the character itself. */
function isAcceptableEscape(char, source) {
  if (!source.startsWith('\\')) return false;
  return ESCAPED_CHARACTER.exec(source)?.[0] !== String.fromCodePoint(char.value);
}

/** The static value of a node other than a RegExp object, or `{ regex }` for a regex literal (or null). */
function getStaticValueOrRegex(node, scope) {
  if (!node) return null;
  if (node.type === 'Literal' && node.regex) return { regex: node.regex };
  const staticValue = getStaticValue(node, scope);
  return staticValue?.value instanceof RegExp ? null : staticValue;
}

export const meta = {
  type: 'problem',
  defaultOptions: [{ allowEscape: false }],
  docs: {
    description: 'Disallow characters which are made with multiple code points in character class syntax',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-misleading-character-class',
  },
  hasSuggestions: true,
  schema: [
    {
      type: 'object',
      properties: { allowEscape: { type: 'boolean' } },
      additionalProperties: false,
    },
  ],
  messages: {
    surrogatePairWithoutUFlag: "Unexpected surrogate pair in character class. Use 'u' flag.",
    surrogatePair: 'Unexpected surrogate pair in character class.',
    combiningClass: 'Unexpected combined character in character class.',
    emojiModifier: 'Unexpected modified Emoji in character class.',
    regionalIndicatorSymbol: 'Unexpected national flag in character class.',
    zwj: 'Unexpected joined character sequence in character class.',
    suggestUnicodeFlag: "Add unicode 'u' flag to regex.",
  },
};

export function create(context) {
  const [{ allowEscape }] = context.options;
  const { sourceCode } = context;
  const parser = new RegExpParser();
  // Regex literals already checked as the pattern of a RegExp() call with flags.
  const checkedPatternNodes = new Set();

  /** Checks a pattern coming from `node`, with the fixer that adds the u flag. */
  function verify(node, pattern, flags, unicodeFixer) {
    let ast;
    try {
      ast = parser.parsePattern(pattern, 0, pattern.length, {
        unicode: flags.includes('u'),
        unicodeSets: flags.includes('v'),
      });
    } catch {
      return;
    }

    // A string or static template maps pattern indexes to its source through its code units.
    const isTemplate = isStaticTemplateLiteral(node);
    const isLiteral = node.type === 'Literal';
    let text = null;
    if (isTemplate) text = sourceCode.getText(node);
    else if (isLiteral && typeof node.value === 'string') text = node.raw;
    let codeUnits = null;
    const getCodeUnits = () => (codeUnits ??= isTemplate ? parseTemplateToken(text) : parseStringLiteral(text));

    const isAcceptableEscapeSequence = (char) => {
      if (isLiteral && node.regex) return isAcceptableEscape(char, char.raw);
      if (text === null) return false;
      const units = getCodeUnits();
      return isAcceptableEscape(char, text.slice(units[char.start].start, units[char.end - 1].end));
    };

    const matchesByKind = KINDS.map(() => []);
    visitRegExpAST(ast, {
      onCharacterClassEnter(classNode) {
        for (const unfiltered of getCharacterSequences(classNode.elements)) {
          const chars = allowEscape
            ? unfiltered.map((char) => (isAcceptableEscapeSequence(char) ? null : char))
            : unfiltered;
          PAIR_KINDS.forEach(([kind, test], k) => {
            const previousChars = kind === 'combiningClass' ? unfiltered : chars;
            for (let i = 1; i < chars.length; i++) {
              const previous = previousChars[i - 1];
              const char = chars[i];
              if (previous && char && test(previous, char)) matchesByKind[k].push([previous, char]);
            }
          });
          findZwjSequences(chars, matchesByKind[PAIR_KINDS.length]);
        }
      },
    });

    /** The location of a sequence of characters in the source. */
    const getLoc = (chars) => {
      const first = chars[0].start;
      const last = chars.at(-1).end - 1;
      let start;
      let end;
      if (text === null) {
        // A regex literal (or another literal): skip its leading slash.
        start = node.range[0] + 1 + first;
        end = node.range[0] + 1 + last + 1;
      } else {
        const units = getCodeUnits();
        start = node.range[0] + units[first].start;
        end = node.range[0] + units[last].end;
      }
      return { start: sourceCode.getLocFromIndex(start), end: sourceCode.getLocFromIndex(end) };
    };

    const granular = isTemplate || isLiteral;
    KINDS.forEach((messageId, k) => {
      const matches = matchesByKind[k];
      if (!matches.length) return;
      const suggest =
        messageId === 'surrogatePairWithoutUFlag'
          ? [{ messageId: 'suggestUnicodeFlag', fix: unicodeFixer }]
          : undefined;
      if (!granular) {
        context.report({ node, loc: node.loc, messageId, suggest });
        return;
      }
      for (const chars of matches) context.report({ node, loc: getLoc(chars), messageId, suggest });
    });
  }

  const canAddUnicodeFlag = (pattern) => isValidWithUnicodeFlag(context.languageOptions.ecmaVersion, pattern);

  return {
    Literal(node) {
      if (!node.regex || checkedPatternNodes.has(node)) return;
      const { pattern, flags } = node.regex;
      verify(node, pattern, flags, (fixer) => (canAddUnicodeFlag(pattern) ? fixer.insertTextAfter(node, 'u') : null));
    },

    Program(node) {
      const scope = sourceCode.getScope(node);
      const tracker = new ReferenceTracker(scope);
      for (const { node: refNode } of tracker.iterateGlobalReferences(TRACE_MAP)) {
        const [patternNode, flagsNode] = refNode.arguments;
        const evaluated = getStaticValueOrRegex(patternNode, scope);
        if (!evaluated) continue;
        let pattern;
        let flags = '';
        if (flagsNode) {
          if (evaluated.regex) {
            pattern = evaluated.regex.pattern;
            checkedPatternNodes.add(patternNode);
          } else {
            pattern = String(evaluated.value);
          }
          flags = getStringIfConstant(flagsNode, scope);
        } else {
          // `RegExp(/re/)` is checked as the literal.
          if (evaluated.regex) continue;
          pattern = String(evaluated.value);
        }
        if (typeof flags !== 'string') continue;

        verify(patternNode, pattern, flags, (fixer) => {
          if (!canAddUnicodeFlag(pattern)) return null;
          if (refNode.arguments.length === 1) {
            // After the pattern, before the closing parenthesis (and after a trailing comma).
            const penultimateToken = sourceCode.getLastToken(refNode, { skip: 1 });
            return fixer.insertTextAfter(penultimateToken, isCommaToken(penultimateToken) ? ' "u",' : ', "u"');
          }
          if (
            (flagsNode.type === 'Literal' && typeof flagsNode.value === 'string') ||
            flagsNode.type === 'TemplateLiteral'
          ) {
            return fixer.insertTextAfterRange([flagsNode.range[0], flagsNode.range[1] - 1], 'u');
          }
          return null;
        });
      }
    },
  };
}
