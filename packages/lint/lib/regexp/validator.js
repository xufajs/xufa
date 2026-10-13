// The validator of regular expressions: the grammar of ECMAScript's patterns (its productions, in the order the
// specification tries them), from ES5 to ES2025 — Annex B's leniencies without the u and v flags, named groups (and
// the duplicates ES2025 allows in different alternatives), lookbehinds, modifiers (?i:...), Unicode properties of the
// edition, the class sets of the v flag. It reports what it reads to callbacks of its options (onCharacter(start, end,
// value), onCapturingGroupEnter(start, name)...: called as methods of the options object), which the parser builds
// trees from, and throws a RegExpSyntaxError (with regexpp's messages) at the first error.
//
//   new RegExpValidator({ ecmaVersion, strict, onCharacter... })
//     .validatePattern(source, start, end, { unicode, unicodeSets } | uFlag)
//     .validateLiteral(source, start, end)
//     .validateFlags(source, start, end)

import { Reader } from './reader.js';
import * as unicode from './unicode.js';

const LATEST_ECMA_VERSION = 2025;

const ch = (text) => text.codePointAt(0);
const BACKSPACE = 0x08;
const TAB = 0x09;
const LINE_FEED = 0x0a;
const LINE_TABULATION = 0x0b;
const FORM_FEED = 0x0c;
const CARRIAGE_RETURN = 0x0d;
const ZWNJ = 0x200c;
const ZWJ = 0x200d;
const [BANG, DOLLAR, AMPERSAND, OPEN_PAREN, CLOSE_PAREN, STAR, PLUS, COMMA, HYPHEN, DOT, SLASH] = [
  ...'!$&()*+,-./',
].map(ch);
const [ZERO, ONE, SEVEN, NINE, COLON, LESS, EQUALS, GREATER, QUESTION] = [...'0179:<=>?'].map(ch);
const [OPEN_BRACKET, BACKSLASH, CLOSE_BRACKET, CARET, UNDERSCORE, OPEN_BRACE, PIPE, CLOSE_BRACE] = [...'[\\]^_{|}'].map(
  ch
);

const isLatinLetter = (cp) => (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a);
const isDecimalDigit = (cp) => cp >= ZERO && cp <= NINE;
const isOctalDigit = (cp) => cp >= ZERO && cp <= SEVEN;
const isHexDigit = (cp) => isDecimalDigit(cp) || (cp >= 0x41 && cp <= 0x46) || (cp >= 0x61 && cp <= 0x66);
const isLineTerminator = (cp) => cp === LINE_FEED || cp === CARRIAGE_RETURN || cp === 0x2028 || cp === 0x2029;
const isLeadSurrogate = (cp) => cp >= 0xd800 && cp <= 0xdbff;
const isTrailSurrogate = (cp) => cp >= 0xdc00 && cp <= 0xdfff;
const combineSurrogates = (lead, trail) => (lead - 0xd800) * 0x400 + (trail - 0xdc00) + 0x10000;
const digitValue = (cp) => (cp >= 0x61 ? cp - 0x61 + 10 : cp >= 0x41 ? cp - 0x41 + 10 : cp - ZERO);
const codes = (text) => new Set([...text].map(ch));

// Characters with a meaning in patterns; in the class sets of the v flag; doubled, reserved there; escapable there.
const SYNTAX_CHARACTERS = codes('^$\\.*+?()[]{}|');
const CLASS_SET_SYNTAX_CHARACTERS = codes('()[]{}/-\\|');
const CLASS_SET_RESERVED_DOUBLES = codes('&!#$%*+,.:;<=>?@^`~');
const CLASS_SET_RESERVED_PUNCTUATORS = codes('&-!#%,:;<=>@`~');

const isIdentifierStart = (cp) => unicode.isIdStart(cp) || cp === DOLLAR || cp === UNDERSCORE;
const isIdentifierPart = (cp) => unicode.isIdContinue(cp) || cp === DOLLAR || cp === ZWNJ || cp === ZWJ;
const isPropertyNameCharacter = (cp) => isLatinLetter(cp) || cp === UNDERSCORE;
const isPropertyValueCharacter = (cp) => isPropertyNameCharacter(cp) || isDecimalDigit(cp);
const isModifier = (cp) => cp === ch('i') || cp === ch('m') || cp === ch('s');

// The flags, by letter, and the edition that brought each.
const FLAGS = {
  g: 'global',
  i: 'ignoreCase',
  m: 'multiline',
  u: 'unicode',
  y: 'sticky',
  s: 'dotAll',
  d: 'hasIndices',
  v: 'unicodeSets',
};
const FLAG_EDITIONS = { g: 0, i: 0, m: 0, u: 2015, y: 2015, s: 2018, d: 2022, v: 2024 };
const LETTER_OF_FLAG = Object.fromEntries(Object.entries(FLAGS).map(([letter, name]) => [name, letter]));

// \d \D \s \S \w \W: their kind and whether they negate.
const CLASS_ESCAPES = new Map([
  [ch('d'), ['digit', false]],
  [ch('D'), ['digit', true]],
  [ch('s'), ['space', false]],
  [ch('S'), ['space', true]],
  [ch('w'), ['word', false]],
  [ch('W'), ['word', true]],
]);

// \f \n \r \t \v.
const CONTROL_ESCAPES = new Map([
  [ch('f'), FORM_FEED],
  [ch('n'), LINE_FEED],
  [ch('r'), CARRIAGE_RETURN],
  [ch('t'), TAB],
  [ch('v'), LINE_TABULATION],
]);

class RegExpSyntaxError extends SyntaxError {
  constructor(message, index) {
    super(message);
    this.index = index;
  }
}

// The names of groups seen, to tell duplicates. Before ES2025 a name is once in a pattern; from it, once in each of
// the alternatives a name can be matched together in (`(?<a>x)|(?<a>y)` is fine).
class GroupNames {
  constructor() {
    this.names = new Set();
  }

  clear() {
    this.names.clear();
  }

  isEmpty() {
    return this.names.size === 0;
  }

  hasInPattern(name) {
    return this.names.has(name);
  }

  hasInScope(name) {
    return this.names.has(name);
  }

  addToScope(name) {
    this.names.add(name);
  }

  enterDisjunction() {}

  enterAlternative() {}

  leaveDisjunction() {}
}

// An alternative of a disjunction: alternatives of one disjunction (same base) exclude each other, and so do those
// of disjunctions inside them.
class Branch {
  constructor(parent, base) {
    this.parent = parent;
    this.base = base ?? this;
  }

  separatedFrom(other) {
    if (this.base === other.base && this !== other) return true;
    if (other.parent && this.separatedFrom(other.parent)) return true;
    return this.parent?.separatedFrom(other) ?? false;
  }

  child() {
    return new Branch(this, null);
  }

  sibling() {
    return new Branch(this.parent, this.base);
  }
}

class BranchedGroupNames {
  constructor() {
    this.clear();
  }

  clear() {
    this.branch = new Branch(null, null);
    this.names = new Map();
  }

  isEmpty() {
    return this.names.size === 0;
  }

  enterDisjunction() {
    this.branch = this.branch.child();
  }

  enterAlternative(index) {
    if (index !== 0) this.branch = this.branch.sibling();
  }

  leaveDisjunction() {
    this.branch = this.branch.parent;
  }

  hasInPattern(name) {
    return this.names.has(name);
  }

  hasInScope(name) {
    const branches = this.names.get(name);
    return Boolean(branches?.some((branch) => !branch.separatedFrom(this.branch)));
  }

  addToScope(name) {
    const branches = this.names.get(name);
    if (branches) branches.push(this.branch);
    else this.names.set(name, [this.branch]);
  }
}

// The callbacks, by name, and how a flags' callback is also given as onFlags (its older form).
const CALLBACKS = [
  'onLiteralEnter',
  'onLiteralLeave',
  'onPatternEnter',
  'onPatternLeave',
  'onDisjunctionEnter',
  'onDisjunctionLeave',
  'onAlternativeEnter',
  'onAlternativeLeave',
  'onGroupEnter',
  'onGroupLeave',
  'onModifiersEnter',
  'onModifiersLeave',
  'onAddModifiers',
  'onRemoveModifiers',
  'onCapturingGroupEnter',
  'onCapturingGroupLeave',
  'onQuantifier',
  'onLookaroundAssertionEnter',
  'onLookaroundAssertionLeave',
  'onEdgeAssertion',
  'onWordBoundaryAssertion',
  'onAnyCharacterSet',
  'onEscapeCharacterSet',
  'onUnicodePropertyCharacterSet',
  'onCharacter',
  'onBackreference',
  'onCharacterClassEnter',
  'onCharacterClassLeave',
  'onCharacterClassRange',
  'onClassIntersection',
  'onClassSubtraction',
  'onClassStringDisjunctionEnter',
  'onClassStringDisjunctionLeave',
  'onStringAlternativeEnter',
  'onStringAlternativeLeave',
];

class RegExpValidator {
  constructor(options) {
    this._options = options ?? {};
    this._reader = new Reader();
    this._unicodeMode = false;
    this._unicodeSetsMode = false;
    // Named groups are read (\k is a reference): with u or v, from ES2018; in strict mode from ES2023; or when the
    // pattern has a named group (a second reading).
    this._nFlag = false;
    this._lastIntValue = 0;
    this._lastRange = { min: 0, max: Number.POSITIVE_INFINITY };
    this._lastStrValue = '';
    this._lastAssertionIsQuantifiable = false;
    this._numCapturingParens = 0;
    this._backreferenceNames = new Set();
    this._srcCtx = null;
    this._groupNames = this.ecmaVersion >= 2025 ? new BranchedGroupNames() : new GroupNames();
  }

  get strict() {
    return Boolean(this._options.strict) || this._unicodeMode;
  }

  get ecmaVersion() {
    return this._options.ecmaVersion ?? LATEST_ECMA_VERSION;
  }

  /** A literal, /pattern/flags. */
  validateLiteral(source, start = 0, end = source.length) {
    this._srcCtx = { source, start, end, kind: 'literal' };
    this._unicodeSetsMode = this._unicodeMode = this._nFlag = false;
    this.reset(source, start, end);
    this.emit('onLiteralEnter', start);
    if (this.eat(SLASH) && this.eatRegExpBody() && this.eat(SLASH)) {
      const flagStart = this.index;
      const unicodeFlag = source.includes('u', flagStart);
      const unicodeSets = source.includes('v', flagStart);
      this.validateFlagsInternal(source, flagStart, end);
      this.validatePatternInternal(source, start + 1, flagStart - 1, { unicode: unicodeFlag, unicodeSets });
    } else if (start >= end) {
      this.raise('Empty');
    } else {
      this.raise(`Unexpected character '${String.fromCodePoint(this.currentCodePoint)}'`);
    }
    this.emit('onLiteralLeave', start, end);
  }

  /** Flags, `gimsuyvd`. */
  validateFlags(source, start = 0, end = source.length) {
    this._srcCtx = { source, start, end, kind: 'flags' };
    this.validateFlagsInternal(source, start, end);
  }

  /** A pattern, with the u flag (`true`) or flags ({ unicode, unicodeSets }). */
  validatePattern(source, start = 0, end = source.length, uFlagOrFlags = undefined) {
    this._srcCtx = { source, start, end, kind: 'pattern' };
    this.validatePatternInternal(source, start, end, uFlagOrFlags);
  }

  validatePatternInternal(source, start, end, uFlagOrFlags) {
    const mode = this.modeOf(uFlagOrFlags, end);
    this._unicodeMode = mode.unicodeMode;
    this._nFlag = mode.nFlag;
    this._unicodeSetsMode = mode.unicodeSetsMode;
    this.reset(source, start, end);
    this.consumePattern();
    // Without the u flag, \k is a name only when the pattern has named groups (Annex B): read it again so.
    if (!this._nFlag && this.ecmaVersion >= 2018 && !this._groupNames.isEmpty()) {
      this._nFlag = true;
      this.rewind(start);
      this.consumePattern();
    }
  }

  validateFlagsInternal(source, start, end) {
    const flags = this.parseFlags(source, start, end);
    this.emit('onRegExpFlags', start, end, flags);
    const { global, ignoreCase, multiline, unicode: u, sticky, dotAll, hasIndices } = flags;
    this.emit('onFlags', start, end, global, ignoreCase, multiline, u, sticky, dotAll, hasIndices);
  }

  modeOf(uFlagOrFlags, sourceEnd) {
    let unicodeFlag = false;
    let unicodeSets = false;
    if (uFlagOrFlags && this.ecmaVersion >= 2015) {
      if (typeof uFlagOrFlags === 'object') {
        unicodeFlag = Boolean(uFlagOrFlags.unicode);
        if (this.ecmaVersion >= 2024) unicodeSets = Boolean(uFlagOrFlags.unicodeSets);
      } else {
        unicodeFlag = uFlagOrFlags;
      }
    }
    if (unicodeFlag && unicodeSets) {
      this.raise('Invalid regular expression flags', { index: sourceEnd + 1, unicode: unicodeFlag, unicodeSets });
    }
    return {
      unicodeMode: unicodeFlag || unicodeSets,
      nFlag:
        (unicodeFlag && this.ecmaVersion >= 2018) ||
        unicodeSets ||
        Boolean(this._options.strict && this.ecmaVersion >= 2023),
      unicodeSetsMode: unicodeSets,
    };
  }

  // A callback of the options, if it has it, called as its method.
  emit(name, ...args) {
    if (this._options[name]) this._options[name](...args);
  }

  // Reading.

  get index() {
    return this._reader.index;
  }

  get currentCodePoint() {
    return this._reader.cp1;
  }

  get nextCodePoint() {
    return this._reader.cp2;
  }

  get nextCodePoint2() {
    return this._reader.cp3;
  }

  get nextCodePoint3() {
    return this._reader.cp4;
  }

  reset(source, start, end) {
    this._reader.reset(source, start, end, this._unicodeMode);
  }

  rewind(index) {
    this._reader.rewind(index);
  }

  advance() {
    this._reader.advance();
  }

  eat(cp) {
    return this._reader.eat(cp);
  }

  eat2(cp1, cp2) {
    return this._reader.eat2(cp1, cp2);
  }

  eat3(cp1, cp2, cp3) {
    return this._reader.eat3(cp1, cp2, cp3);
  }

  // An error: "Invalid regular expression: /pattern/flags: message" (the literal for a literal), at an index.
  raise(message, context) {
    const flags = {
      unicode: context?.unicode ?? (this._unicodeMode && !this._unicodeSetsMode),
      unicodeSets: context?.unicodeSets ?? this._unicodeSetsMode,
    };
    const { source, start, end, kind } = this._srcCtx;
    let shown = '';
    if (kind === 'literal') {
      const literal = source.slice(start, end);
      if (literal) shown = `: ${literal}`;
    } else if (kind === 'pattern') {
      shown = `: /${source.slice(start, end)}/${flags.unicode ? 'u' : ''}${flags.unicodeSets ? 'v' : ''}`;
    }
    throw new RegExpSyntaxError(`Invalid regular expression${shown}: ${message}`, context?.index ?? this.index);
  }

  // The body of a literal, up to its closing slash (none inside a class).
  eatRegExpBody() {
    const start = this.index;
    let inClass = false;
    let escaped = false;
    for (;;) {
      const cp = this.currentCodePoint;
      if (cp === -1 || isLineTerminator(cp))
        this.raise(`Unterminated ${inClass ? 'character class' : 'regular expression'}`);
      if (escaped) escaped = false;
      else if (cp === BACKSLASH) escaped = true;
      else if (cp === OPEN_BRACKET) inClass = true;
      else if (cp === CLOSE_BRACKET) inClass = false;
      else if ((cp === SLASH && !inClass) || (cp === STAR && this.index === start)) break;
      this.advance();
    }
    return this.index !== start;
  }

  // Pattern :: Disjunction
  consumePattern() {
    const start = this.index;
    this._numCapturingParens = this.countCapturingParens();
    this._groupNames.clear();
    this._backreferenceNames.clear();
    this.emit('onPatternEnter', start);
    this.consumeDisjunction();
    const cp = this.currentCodePoint;
    if (cp !== -1) {
      if (cp === CLOSE_PAREN) this.raise("Unmatched ')'");
      if (cp === BACKSLASH) this.raise('\\ at end of pattern');
      if (cp === CLOSE_BRACKET || cp === CLOSE_BRACE) this.raise('Lone quantifier brackets');
      this.raise(`Unexpected character '${String.fromCodePoint(cp)}'`);
    }
    for (const name of this._backreferenceNames) {
      if (!this._groupNames.hasInPattern(name)) this.raise('Invalid named capture referenced');
    }
    this.emit('onPatternLeave', start, this.index);
  }

  // The capturing groups of the pattern: ( not followed by ?, or by ?< not followed by = or !.
  countCapturingParens() {
    const start = this.index;
    let inClass = false;
    let escaped = false;
    let count = 0;
    for (let cp = this.currentCodePoint; cp !== -1; cp = this.currentCodePoint) {
      if (escaped) escaped = false;
      else if (cp === BACKSLASH) escaped = true;
      else if (cp === OPEN_BRACKET) inClass = true;
      else if (cp === CLOSE_BRACKET) inClass = false;
      else if (
        cp === OPEN_PAREN &&
        !inClass &&
        (this.nextCodePoint !== QUESTION ||
          (this.nextCodePoint2 === LESS && this.nextCodePoint3 !== EQUALS && this.nextCodePoint3 !== BANG))
      ) {
        count += 1;
      }
      this.advance();
    }
    this.rewind(start);
    return count;
  }

  // Disjunction :: Alternative ( | Alternative )*
  consumeDisjunction() {
    const start = this.index;
    let i = 0;
    this._groupNames.enterDisjunction();
    this.emit('onDisjunctionEnter', start);
    do this.consumeAlternative(i++);
    while (this.eat(PIPE));
    if (this.consumeQuantifier(true)) this.raise('Nothing to repeat');
    if (this.eat(OPEN_BRACE)) this.raise('Lone quantifier brackets');
    this.emit('onDisjunctionLeave', start, this.index);
    this._groupNames.leaveDisjunction();
  }

  // Alternative :: Term*
  consumeAlternative(i) {
    const start = this.index;
    this._groupNames.enterAlternative(i);
    this.emit('onAlternativeEnter', start, i);
    while (this.currentCodePoint !== -1 && this.consumeTerm());
    this.emit('onAlternativeLeave', start, this.index, i);
  }

  // Term :: Assertion | Atom Quantifier? (Annex B: a lookahead may be quantified, and atoms are extended)
  consumeTerm() {
    if (this._unicodeMode || this.strict) {
      return this.consumeAssertion() || (this.consumeAtom() && this.consumeOptionalQuantifier());
    }
    return (
      (this.consumeAssertion() && (!this._lastAssertionIsQuantifiable || this.consumeOptionalQuantifier())) ||
      (this.consumeExtendedAtom() && this.consumeOptionalQuantifier())
    );
  }

  consumeOptionalQuantifier() {
    this.consumeQuantifier();
    return true;
  }

  // Assertion :: ^ | $ | \b | \B | (?= ) | (?! ) | (?<= ) | (?<! )
  consumeAssertion() {
    const start = this.index;
    this._lastAssertionIsQuantifiable = false;
    if (this.eat(CARET)) {
      this.emit('onEdgeAssertion', start, this.index, 'start');
      return true;
    }
    if (this.eat(DOLLAR)) {
      this.emit('onEdgeAssertion', start, this.index, 'end');
      return true;
    }
    if (this.eat2(BACKSLASH, ch('B'))) {
      this.emit('onWordBoundaryAssertion', start, this.index, 'word', true);
      return true;
    }
    if (this.eat2(BACKSLASH, ch('b'))) {
      this.emit('onWordBoundaryAssertion', start, this.index, 'word', false);
      return true;
    }
    if (this.eat2(OPEN_PAREN, QUESTION)) {
      const lookbehind = this.ecmaVersion >= 2018 && this.eat(LESS);
      let negate = false;
      if (this.eat(EQUALS) || (negate = this.eat(BANG))) {
        const kind = lookbehind ? 'lookbehind' : 'lookahead';
        this.emit('onLookaroundAssertionEnter', start, kind, negate);
        this.consumeDisjunction();
        if (!this.eat(CLOSE_PAREN)) this.raise('Unterminated group');
        this._lastAssertionIsQuantifiable = !lookbehind && !this.strict;
        this.emit('onLookaroundAssertionLeave', start, this.index, kind, negate);
        return true;
      }
      this.rewind(start);
    }
    return false;
  }

  // Quantifier :: (* | + | ? | {n} | {n,} | {n,m}) ?? (with noConsume, only whether one is there)
  consumeQuantifier(noConsume = false) {
    const start = this.index;
    let min;
    let max;
    if (this.eat(STAR)) [min, max] = [0, Number.POSITIVE_INFINITY];
    else if (this.eat(PLUS)) [min, max] = [1, Number.POSITIVE_INFINITY];
    else if (this.eat(QUESTION)) [min, max] = [0, 1];
    else if (this.eatBracedQuantifier(noConsume)) ({ min, max } = this._lastRange);
    else return false;
    const greedy = !this.eat(QUESTION);
    if (!noConsume) this.emit('onQuantifier', start, this.index, min, max, greedy);
    return true;
  }

  eatBracedQuantifier(noError) {
    const start = this.index;
    if (!this.eat(OPEN_BRACE)) return false;
    if (this.eatDecimalDigits()) {
      const min = this._lastIntValue;
      let max = min;
      if (this.eat(COMMA)) max = this.eatDecimalDigits() ? this._lastIntValue : Number.POSITIVE_INFINITY;
      if (this.eat(CLOSE_BRACE)) {
        if (!noError && max < min) this.raise('numbers out of order in {} quantifier');
        this._lastRange = { min, max };
        return true;
      }
    }
    if (!noError && (this._unicodeMode || this.strict)) this.raise('Incomplete quantifier');
    this.rewind(start);
    return false;
  }

  // Atom :: PatternCharacter | . | \ AtomEscape | CharacterClass | ( GroupSpecifier? Disjunction ) | (?: Disjunction )
  consumeAtom() {
    return (
      this.consumePatternCharacter() ||
      this.consumeDot() ||
      this.consumeReverseSolidusAtomEscape() ||
      Boolean(this.consumeCharacterClass()) ||
      this.consumeCapturingGroup() ||
      this.consumeUncapturingGroup()
    );
  }

  consumeDot() {
    if (!this.eat(DOT)) return false;
    this.emit('onAnyCharacterSet', this.index - 1, this.index, 'any');
    return true;
  }

  consumeReverseSolidusAtomEscape() {
    const start = this.index;
    if (this.eat(BACKSLASH)) {
      if (this.consumeAtomEscape()) return true;
      this.rewind(start);
    }
    return false;
  }

  // (?: ), and from ES2025 (?ims-ims: )
  consumeUncapturingGroup() {
    const start = this.index;
    if (!this.eat2(OPEN_PAREN, QUESTION)) return false;
    this.emit('onGroupEnter', start);
    if (this.ecmaVersion >= 2025) this.consumeModifiers();
    if (!this.eat(COLON)) {
      this.rewind(start + 1);
      this.raise('Invalid group');
    }
    this.consumeDisjunction();
    if (!this.eat(CLOSE_PAREN)) this.raise('Unterminated group');
    this.emit('onGroupLeave', start, this.index);
    return true;
  }

  consumeModifiers() {
    const start = this.index;
    const hasAdd = this.eatModifiers();
    const addEnd = this.index;
    const hasHyphen = this.eat(HYPHEN);
    if (!hasAdd && !hasHyphen) return false;
    this.emit('onModifiersEnter', start);
    const add = this.parseModifiers(start, addEnd);
    this.emit('onAddModifiers', start, addEnd, add);
    if (hasHyphen) {
      const removeStart = this.index;
      if (!this.eatModifiers() && !hasAdd && this.currentCodePoint === COLON) this.raise('Invalid empty flags');
      const remove = this.parseModifiers(removeStart, this.index);
      for (const [name, on] of Object.entries(remove)) {
        if (on && add[name]) this.raise(`Duplicated flag '${LETTER_OF_FLAG[name]}'`);
      }
      this.emit('onRemoveModifiers', removeStart, this.index, remove);
    }
    this.emit('onModifiersLeave', start, this.index);
    return true;
  }

  // ( Disjunction ), (?<name> Disjunction )
  consumeCapturingGroup() {
    const start = this.index;
    if (!this.eat(OPEN_PAREN)) return false;
    let name = null;
    if (this.ecmaVersion >= 2018 && this.consumeGroupSpecifier()) {
      name = this._lastStrValue;
    } else if (this.currentCodePoint === QUESTION) {
      this.rewind(start);
      return false;
    }
    this.emit('onCapturingGroupEnter', start, name);
    this.consumeDisjunction();
    if (!this.eat(CLOSE_PAREN)) this.raise('Unterminated group');
    this.emit('onCapturingGroupLeave', start, this.index, name);
    return true;
  }

  // Annex B's ExtendedAtom: also \c alone (a backslash), braces that are not a quantifier, ] and } as characters.
  consumeExtendedAtom() {
    return (
      this.consumeDot() ||
      this.consumeReverseSolidusAtomEscape() ||
      this.consumeReverseSolidusFollowedByC() ||
      Boolean(this.consumeCharacterClass()) ||
      this.consumeCapturingGroup() ||
      this.consumeUncapturingGroup() ||
      this.consumeInvalidBracedQuantifier() ||
      this.consumeExtendedPatternCharacter()
    );
  }

  consumeReverseSolidusFollowedByC() {
    const start = this.index;
    if (this.currentCodePoint !== BACKSLASH || this.nextCodePoint !== ch('c')) return false;
    this._lastIntValue = this.currentCodePoint;
    this.advance();
    this.emit('onCharacter', start, this.index, BACKSLASH);
    return true;
  }

  consumeInvalidBracedQuantifier() {
    if (this.eatBracedQuantifier(true)) this.raise('Nothing to repeat');
    return false;
  }

  consumePatternCharacter() {
    const start = this.index;
    const cp = this.currentCodePoint;
    if (cp === -1 || SYNTAX_CHARACTERS.has(cp)) return false;
    this.advance();
    this.emit('onCharacter', start, this.index, cp);
    return true;
  }

  consumeExtendedPatternCharacter() {
    const start = this.index;
    const cp = this.currentCodePoint;
    if (cp === -1 || (SYNTAX_CHARACTERS.has(cp) && cp !== CLOSE_BRACKET && cp !== OPEN_BRACE && cp !== CLOSE_BRACE)) {
      return false;
    }
    this.advance();
    this.emit('onCharacter', start, this.index, cp);
    return true;
  }

  // ?<name>, a name not in scope yet.
  consumeGroupSpecifier() {
    const start = this.index;
    if (this.eat(QUESTION)) {
      if (this.eatGroupName()) {
        if (!this._groupNames.hasInScope(this._lastStrValue)) {
          this._groupNames.addToScope(this._lastStrValue);
          return true;
        }
        this.raise('Duplicate capture group name');
      }
      this.rewind(start);
    }
    return false;
  }

  // AtomEscape :: DecimalEscape | CharacterClassEscape | CharacterEscape | k GroupName
  consumeAtomEscape() {
    if (
      this.consumeBackreference() ||
      this.consumeCharacterClassEscape() ||
      this.consumeCharacterEscape() ||
      (this._nFlag && this.consumeKGroupName())
    ) {
      return true;
    }
    if (this.strict || this._unicodeMode) this.raise('Invalid escape');
    return false;
  }

  consumeBackreference() {
    const start = this.index;
    if (this.eatDecimalEscape()) {
      const n = this._lastIntValue;
      if (n <= this._numCapturingParens) {
        this.emit('onBackreference', start - 1, this.index, n);
        return true;
      }
      if (this.strict || this._unicodeMode) this.raise('Invalid escape');
      this.rewind(start);
    }
    return false;
  }

  // \d \D \s \S \w \W, and with u or v \p{...} \P{...}: {} or { mayContainStrings }, or null.
  consumeCharacterClassEscape() {
    const start = this.index;
    const escape = CLASS_ESCAPES.get(this.currentCodePoint);
    if (escape) {
      this.advance();
      this._lastIntValue = -1;
      this.emit('onEscapeCharacterSet', start - 1, this.index, escape[0], escape[1]);
      return {};
    }
    let negate = false;
    if (this._unicodeMode && this.ecmaVersion >= 2018 && (this.eat(ch('p')) || (negate = this.eat(ch('P'))))) {
      this._lastIntValue = -1;
      let result = null;
      if (this.eat(OPEN_BRACE) && (result = this.eatUnicodePropertyValueExpression()) && this.eat(CLOSE_BRACE)) {
        if (negate && result.strings) this.raise('Invalid property name');
        const { key, value, strings = false } = result;
        this.emit('onUnicodePropertyCharacterSet', start - 1, this.index, 'property', key, value, negate, strings);
        return { mayContainStrings: result.strings };
      }
      this.raise('Invalid property name');
    }
    return null;
  }

  // CharacterEscape :: ControlEscape | c ControlLetter | 0 | HexEscape | UnicodeEscape | (Annex B) octal | IdentityEscape
  consumeCharacterEscape() {
    const start = this.index;
    if (
      this.eatControlEscape() ||
      this.eatCControlLetter() ||
      this.eatZero() ||
      this.eatHexEscapeSequence() ||
      this.eatRegExpUnicodeEscapeSequence() ||
      (!this.strict && !this._unicodeMode && this.eatLegacyOctalEscapeSequence()) ||
      this.eatIdentityEscape()
    ) {
      this.emit('onCharacter', start - 1, this.index, this._lastIntValue);
      return true;
    }
    return false;
  }

  consumeKGroupName() {
    const start = this.index;
    if (!this.eat(ch('k'))) return false;
    if (this.eatGroupName()) {
      const name = this._lastStrValue;
      this._backreferenceNames.add(name);
      this.emit('onBackreference', start - 1, this.index, name);
      return true;
    }
    this.raise('Invalid named reference');
  }

  // CharacterClass :: [ ^? ClassContents ]
  consumeCharacterClass() {
    const start = this.index;
    if (!this.eat(OPEN_BRACKET)) return null;
    const negate = this.eat(CARET);
    this.emit('onCharacterClassEnter', start, negate, this._unicodeSetsMode);
    const result = this.consumeClassContents();
    if (!this.eat(CLOSE_BRACKET)) {
      if (this.currentCodePoint === -1) this.raise('Unterminated character class');
      this.raise('Invalid character in character class');
    }
    if (negate && result.mayContainStrings) this.raise('Negated character class may contain strings');
    this.emit('onCharacterClassLeave', start, this.index, negate);
    return result;
  }

  // ClassContents: with v a ClassSetExpression; else ranges and atoms.
  consumeClassContents() {
    if (this._unicodeSetsMode) {
      if (this.currentCodePoint === CLOSE_BRACKET) return {};
      return this.consumeClassSetExpression();
    }
    const strict = this.strict || this._unicodeMode;
    for (;;) {
      const rangeStart = this.index;
      if (!this.consumeClassAtom()) break;
      const min = this._lastIntValue;
      if (!this.eat(HYPHEN)) continue;
      this.emit('onCharacter', this.index - 1, this.index, HYPHEN);
      if (!this.consumeClassAtom()) break;
      const max = this._lastIntValue;
      // A class escape (\d...) at an end is no range: an error, or (Annex B) three atoms.
      if (min === -1 || max === -1) {
        if (strict) this.raise('Invalid character class');
        continue;
      }
      if (min > max) this.raise('Range out of order in character class');
      this.emit('onCharacterClassRange', rangeStart, this.index, min, max);
    }
    return {};
  }

  consumeClassAtom() {
    const start = this.index;
    const cp = this.currentCodePoint;
    if (cp !== -1 && cp !== BACKSLASH && cp !== CLOSE_BRACKET) {
      this.advance();
      this._lastIntValue = cp;
      this.emit('onCharacter', start, this.index, cp);
      return true;
    }
    if (this.eat(BACKSLASH)) {
      if (this.consumeClassEscape()) return true;
      if (!this.strict && this.currentCodePoint === ch('c')) {
        this._lastIntValue = BACKSLASH;
        this.emit('onCharacter', start, this.index, BACKSLASH);
        return true;
      }
      if (this.strict || this._unicodeMode) this.raise('Invalid escape');
      this.rewind(start);
    }
    return false;
  }

  // ClassEscape :: b | - (with u) | (Annex B) c digit or _ | CharacterClassEscape | CharacterEscape
  consumeClassEscape() {
    const start = this.index;
    if (this.eat(ch('b'))) {
      this._lastIntValue = BACKSPACE;
      this.emit('onCharacter', start - 1, this.index, BACKSPACE);
      return true;
    }
    if (this._unicodeMode && this.eat(HYPHEN)) {
      this._lastIntValue = HYPHEN;
      this.emit('onCharacter', start - 1, this.index, HYPHEN);
      return true;
    }
    let cp = 0;
    if (
      !this.strict &&
      !this._unicodeMode &&
      this.currentCodePoint === ch('c') &&
      (isDecimalDigit((cp = this.nextCodePoint)) || cp === UNDERSCORE)
    ) {
      this.advance();
      this.advance();
      this._lastIntValue = cp % 0x20;
      this.emit('onCharacter', start - 1, this.index, this._lastIntValue);
      return true;
    }
    return Boolean(this.consumeCharacterClassEscape()) || this.consumeCharacterEscape();
  }

  // ClassSetExpression (v) :: ClassUnion | ClassIntersection (&&) | ClassSubtraction (--)
  consumeClassSetExpression() {
    const start = this.index;
    let mayContainStrings = false;
    let result = null;
    if (this.consumeClassSetCharacter()) {
      if (this.consumeClassSetRangeFromOperator(start)) {
        this.consumeClassUnionRight({});
        return {};
      }
      mayContainStrings = false;
    } else if ((result = this.consumeClassSetOperand())) {
      mayContainStrings = result.mayContainStrings;
    } else {
      const cp = this.currentCodePoint;
      if (cp === BACKSLASH) {
        this.advance();
        this.raise('Invalid escape');
      }
      if (cp === this.nextCodePoint && CLASS_SET_RESERVED_DOUBLES.has(cp)) {
        this.raise('Invalid set operation in character class');
      }
      this.raise('Invalid character in character class');
    }
    if (this.eat2(AMPERSAND, AMPERSAND)) {
      while (this.currentCodePoint !== AMPERSAND && (result = this.consumeClassSetOperand())) {
        this.emit('onClassIntersection', start, this.index);
        if (!result.mayContainStrings) mayContainStrings = false;
        if (this.eat2(AMPERSAND, AMPERSAND)) continue;
        return { mayContainStrings };
      }
      this.raise('Invalid character in character class');
    }
    if (this.eat2(HYPHEN, HYPHEN)) {
      while (this.consumeClassSetOperand()) {
        this.emit('onClassSubtraction', start, this.index);
        if (this.eat2(HYPHEN, HYPHEN)) continue;
        return { mayContainStrings };
      }
      this.raise('Invalid character in character class');
    }
    return this.consumeClassUnionRight({ mayContainStrings });
  }

  consumeClassUnionRight(left) {
    let { mayContainStrings } = left;
    for (;;) {
      const start = this.index;
      if (this.consumeClassSetCharacter()) {
        this.consumeClassSetRangeFromOperator(start);
        continue;
      }
      const result = this.consumeClassSetOperand();
      if (!result) break;
      if (result.mayContainStrings) mayContainStrings = true;
    }
    return { mayContainStrings };
  }

  consumeClassSetRangeFromOperator(start) {
    const operatorStart = this.index;
    const min = this._lastIntValue;
    if (this.eat(HYPHEN)) {
      if (this.consumeClassSetCharacter()) {
        const max = this._lastIntValue;
        if (min === -1 || max === -1) this.raise('Invalid character class');
        if (min > max) this.raise('Range out of order in character class');
        this.emit('onCharacterClassRange', start, this.index, min, max);
        return true;
      }
      this.rewind(operatorStart);
    }
    return false;
  }

  // ClassSetOperand :: NestedClass | ClassStringDisjunction | ClassSetCharacter
  consumeClassSetOperand() {
    let result = this.consumeNestedClass();
    if (result) return result;
    result = this.consumeClassStringDisjunction();
    if (result) return result;
    return this.consumeClassSetCharacter() ? {} : null;
  }

  // NestedClass :: [ ^? ClassContents ] | \ CharacterClassEscape
  consumeNestedClass() {
    const start = this.index;
    if (this.eat(OPEN_BRACKET)) {
      const negate = this.eat(CARET);
      this.emit('onCharacterClassEnter', start, negate, true);
      const result = this.consumeClassContents();
      if (!this.eat(CLOSE_BRACKET)) this.raise('Unterminated character class');
      if (negate && result.mayContainStrings) this.raise('Negated character class may contain strings');
      this.emit('onCharacterClassLeave', start, this.index, negate);
      return result;
    }
    if (this.eat(BACKSLASH)) {
      const result = this.consumeCharacterClassEscape();
      if (result) return result;
      this.rewind(start);
    }
    return null;
  }

  // \q{ ClassString ( | ClassString )* }
  consumeClassStringDisjunction() {
    const start = this.index;
    if (!this.eat3(BACKSLASH, ch('q'), OPEN_BRACE)) return null;
    this.emit('onClassStringDisjunctionEnter', start);
    let i = 0;
    let mayContainStrings = false;
    do {
      if (this.consumeClassString(i++).mayContainStrings) mayContainStrings = true;
    } while (this.eat(PIPE));
    if (this.eat(CLOSE_BRACE)) {
      this.emit('onClassStringDisjunctionLeave', start, this.index);
      return { mayContainStrings };
    }
    this.raise('Unterminated class string disjunction');
  }

  consumeClassString(i) {
    const start = this.index;
    let count = 0;
    this.emit('onStringAlternativeEnter', start, i);
    while (this.currentCodePoint !== -1 && this.consumeClassSetCharacter()) count++;
    this.emit('onStringAlternativeLeave', start, this.index, i);
    // A string of one character is a character; of none or more, a string.
    return { mayContainStrings: count !== 1 };
  }

  // ClassSetCharacter: not a syntax character nor a reserved double; or \ CharacterEscape, a reserved punctuator, b.
  consumeClassSetCharacter() {
    const start = this.index;
    const cp = this.currentCodePoint;
    if (
      (cp !== this.nextCodePoint || !CLASS_SET_RESERVED_DOUBLES.has(cp)) &&
      cp !== -1 &&
      !CLASS_SET_SYNTAX_CHARACTERS.has(cp)
    ) {
      this._lastIntValue = cp;
      this.advance();
      this.emit('onCharacter', start, this.index, cp);
      return true;
    }
    if (this.eat(BACKSLASH)) {
      if (this.consumeCharacterEscape()) return true;
      if (CLASS_SET_RESERVED_PUNCTUATORS.has(this.currentCodePoint)) {
        this._lastIntValue = this.currentCodePoint;
        this.advance();
        this.emit('onCharacter', start, this.index, this._lastIntValue);
        return true;
      }
      if (this.eat(ch('b'))) {
        this._lastIntValue = BACKSPACE;
        this.emit('onCharacter', start, this.index, BACKSPACE);
        return true;
      }
      this.rewind(start);
    }
    return false;
  }

  // GroupName :: < RegExpIdentifierName >
  eatGroupName() {
    if (!this.eat(LESS)) return false;
    if (this.eatRegExpIdentifierName() && this.eat(GREATER)) return true;
    this.raise('Invalid capture group name');
  }

  eatRegExpIdentifierName() {
    if (!this.eatRegExpIdentifierCharacter(isIdentifierStart)) return false;
    this._lastStrValue = String.fromCodePoint(this._lastIntValue);
    while (this.eatRegExpIdentifierCharacter(isIdentifierPart))
      this._lastStrValue += String.fromCodePoint(this._lastIntValue);
    return true;
  }

  // A character of a name: itself, \u escaped, or (from ES2020, without u) a surrogate pair as one.
  eatRegExpIdentifierCharacter(accepts) {
    const start = this.index;
    const forceUFlag = !this._unicodeMode && this.ecmaVersion >= 2020;
    let cp = this.currentCodePoint;
    this.advance();
    if (cp === BACKSLASH && this.eatRegExpUnicodeEscapeSequence(forceUFlag)) {
      cp = this._lastIntValue;
    } else if (forceUFlag && isLeadSurrogate(cp) && isTrailSurrogate(this.currentCodePoint)) {
      cp = combineSurrogates(cp, this.currentCodePoint);
      this.advance();
    }
    if (accepts(cp)) {
      this._lastIntValue = cp;
      return true;
    }
    if (this.index !== start) this.rewind(start);
    return false;
  }

  eatCControlLetter() {
    const start = this.index;
    if (this.eat(ch('c'))) {
      if (this.eatControlLetter()) return true;
      this.rewind(start);
    }
    return false;
  }

  eatZero() {
    if (this.currentCodePoint !== ZERO || isDecimalDigit(this.nextCodePoint)) return false;
    this._lastIntValue = 0;
    this.advance();
    return true;
  }

  eatControlEscape() {
    const value = CONTROL_ESCAPES.get(this.currentCodePoint);
    if (value === undefined) return false;
    this.advance();
    this._lastIntValue = value;
    return true;
  }

  eatControlLetter() {
    const cp = this.currentCodePoint;
    if (!isLatinLetter(cp)) return false;
    this.advance();
    this._lastIntValue = cp % 0x20;
    return true;
  }

  // u XXXX, u XXXX \u XXXX (a surrogate pair), u{X...}: the last two with u.
  eatRegExpUnicodeEscapeSequence(forceUFlag = false) {
    const start = this.index;
    const uFlag = forceUFlag || this._unicodeMode;
    if (this.eat(ch('u'))) {
      if (
        (uFlag && this.eatRegExpUnicodeSurrogatePairEscape()) ||
        this.eatFixedHexDigits(4) ||
        (uFlag && this.eatRegExpUnicodeCodePointEscape())
      ) {
        return true;
      }
      if (this.strict || uFlag) this.raise('Invalid unicode escape');
      this.rewind(start);
    }
    return false;
  }

  eatRegExpUnicodeSurrogatePairEscape() {
    const start = this.index;
    if (this.eatFixedHexDigits(4)) {
      const lead = this._lastIntValue;
      if (isLeadSurrogate(lead) && this.eat(BACKSLASH) && this.eat(ch('u')) && this.eatFixedHexDigits(4)) {
        const trail = this._lastIntValue;
        if (isTrailSurrogate(trail)) {
          this._lastIntValue = combineSurrogates(lead, trail);
          return true;
        }
      }
      this.rewind(start);
    }
    return false;
  }

  eatRegExpUnicodeCodePointEscape() {
    const start = this.index;
    if (this.eat(OPEN_BRACE) && this.eatHexDigits() && this.eat(CLOSE_BRACE) && this._lastIntValue <= 0x10ffff) {
      return true;
    }
    this.rewind(start);
    return false;
  }

  eatIdentityEscape() {
    const cp = this.currentCodePoint;
    if (!this.isValidIdentityEscape(cp)) return false;
    this._lastIntValue = cp;
    this.advance();
    return true;
  }

  // What \ may escape: with u a syntax character or /; in strict mode, not an identifier's part; else (Annex B) any
  // but c, and k when names are read.
  isValidIdentityEscape(cp) {
    if (cp === -1) return false;
    if (this._unicodeMode) return SYNTAX_CHARACTERS.has(cp) || cp === SLASH;
    if (this.strict) return !unicode.isIdContinue(cp);
    if (this._nFlag) return cp !== ch('c') && cp !== ch('k');
    return cp !== ch('c');
  }

  eatDecimalEscape() {
    this._lastIntValue = 0;
    let cp = this.currentCodePoint;
    if (cp < ONE || cp > NINE) return false;
    do {
      this._lastIntValue = 10 * this._lastIntValue + (cp - ZERO);
      this.advance();
    } while ((cp = this.currentCodePoint) >= ZERO && cp <= NINE);
    return true;
  }

  // name=value | value: a General_Category value, a binary property, or (with v) a property of strings.
  eatUnicodePropertyValueExpression() {
    const start = this.index;
    if (this.eatUnicodePropertyName() && this.eat(EQUALS)) {
      const key = this._lastStrValue;
      if (this.eatUnicodePropertyValue()) {
        const value = this._lastStrValue;
        if (unicode.isValidProperty(this.ecmaVersion, key, value)) return { key, value: value || null };
        this.raise('Invalid property name');
      }
    }
    this.rewind(start);
    if (this.eatUnicodePropertyValue()) {
      const nameOrValue = this._lastStrValue;
      if (unicode.isValidProperty(this.ecmaVersion, 'General_Category', nameOrValue)) {
        return { key: 'General_Category', value: nameOrValue || null };
      }
      if (unicode.isValidLoneProperty(this.ecmaVersion, nameOrValue)) return { key: nameOrValue, value: null };
      if (this._unicodeSetsMode && unicode.isValidLonePropertyOfStrings(this.ecmaVersion, nameOrValue)) {
        return { key: nameOrValue, value: null, strings: true };
      }
      this.raise('Invalid property name');
    }
    return null;
  }

  eatUnicodePropertyName() {
    return this.eatWhile(isPropertyNameCharacter);
  }

  eatUnicodePropertyValue() {
    return this.eatWhile(isPropertyValueCharacter);
  }

  // The characters that pass a test, as _lastStrValue; whether there was one.
  eatWhile(accepts) {
    this._lastStrValue = '';
    while (accepts(this.currentCodePoint)) {
      this._lastStrValue += String.fromCodePoint(this.currentCodePoint);
      this.advance();
    }
    return this._lastStrValue !== '';
  }

  eatHexEscapeSequence() {
    const start = this.index;
    if (this.eat(ch('x'))) {
      if (this.eatFixedHexDigits(2)) return true;
      if (this._unicodeMode || this.strict) this.raise('Invalid escape');
      this.rewind(start);
    }
    return false;
  }

  eatDecimalDigits() {
    return this.eatNumber(isDecimalDigit, 10);
  }

  eatHexDigits() {
    return this.eatNumber(isHexDigit, 16);
  }

  // The digits there, as _lastIntValue; whether there was one.
  eatNumber(isDigit, base) {
    const start = this.index;
    this._lastIntValue = 0;
    while (isDigit(this.currentCodePoint)) {
      this._lastIntValue = base * this._lastIntValue + digitValue(this.currentCodePoint);
      this.advance();
    }
    return this.index !== start;
  }

  // Annex B: \0 to \377.
  eatLegacyOctalEscapeSequence() {
    if (!this.eatOctalDigit()) return false;
    const n1 = this._lastIntValue;
    if (this.eatOctalDigit()) {
      const n2 = this._lastIntValue;
      if (n1 <= 3 && this.eatOctalDigit()) this._lastIntValue = n1 * 64 + n2 * 8 + this._lastIntValue;
      else this._lastIntValue = n1 * 8 + n2;
    } else {
      this._lastIntValue = n1;
    }
    return true;
  }

  eatOctalDigit() {
    const cp = this.currentCodePoint;
    if (isOctalDigit(cp)) {
      this.advance();
      this._lastIntValue = cp - ZERO;
      return true;
    }
    this._lastIntValue = 0;
    return false;
  }

  eatFixedHexDigits(length) {
    const start = this.index;
    this._lastIntValue = 0;
    for (let i = 0; i < length; ++i) {
      const cp = this.currentCodePoint;
      if (!isHexDigit(cp)) {
        this.rewind(start);
        return false;
      }
      this._lastIntValue = 16 * this._lastIntValue + digitValue(cp);
      this.advance();
    }
    return true;
  }

  eatModifiers() {
    let ate = false;
    while (isModifier(this.currentCodePoint)) {
      this.advance();
      ate = true;
    }
    return ate;
  }

  parseModifiers(start, end) {
    const { ignoreCase, multiline, dotAll } = this.parseFlags(this._reader.source, start, end);
    return { ignoreCase, multiline, dotAll };
  }

  // The flags of a text, each once and of the edition.
  parseFlags(source, start, end) {
    const flags = Object.fromEntries(Object.values(FLAGS).map((name) => [name, false]));
    for (let i = start; i < end; ++i) {
      const letter = source[i];
      if (!Object.hasOwn(FLAGS, letter) || this.ecmaVersion < FLAG_EDITIONS[letter]) {
        this.raise(`Invalid flag '${letter}'`, { index: start });
      }
      if (flags[FLAGS[letter]]) this.raise(`Duplicated flag '${letter}'`, { index: start });
      flags[FLAGS[letter]] = true;
    }
    return flags;
  }
}

export { RegExpValidator, RegExpSyntaxError, LATEST_ECMA_VERSION, CALLBACKS };
