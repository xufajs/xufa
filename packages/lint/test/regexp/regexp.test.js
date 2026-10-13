import { RegExpParser, RegExpValidator, visitRegExpAST } from '../../lib/regexp/index.js';

const parsePattern = (pattern, flags, options) => new RegExpParser(options).parsePattern(pattern, 0, pattern.length, flags);
const errorOf = (pattern, flags, options) => {
  try {
    new RegExpValidator(options).validatePattern(pattern, undefined, undefined, flags);
    return null;
  } catch (error) {
    return `${error.message} @${error.index}`;
  }
};

describe('regular expressions: validating', () => {
  it("regexpp's messages, with the pattern and its flags", () => {
    expect(errorOf('(')).toBe('Invalid regular expression: /(/: Unterminated group @1');
    expect(errorOf('a)')).toBe("Invalid regular expression: /a)/: Unmatched ')' @1");
    expect(errorOf('[b-a]')).toBe('Invalid regular expression: /[b-a]/: Range out of order in character class @4');
    expect(errorOf('*')).toBe('Invalid regular expression: /*/: Nothing to repeat @1');
    expect(errorOf('a{2,1}')).toBe('Invalid regular expression: /a{2,1}/: numbers out of order in {} quantifier @6');
    expect(errorOf('\\p{Foo}', { unicode: true })).toBe('Invalid regular expression: /\\p{Foo}/u: Invalid property name @6');
    expect(errorOf('a', { unicode: true, unicodeSets: true })).toBe('Invalid regular expression: /a/uv: Invalid regular expression flags @2');
  });

  it('Annex B without u: what is an error with it is a character', () => {
    expect(errorOf('\\c')).toBe(null);
    expect(errorOf('\\c', { unicode: true })).toBe('Invalid regular expression: /\\c/u: Invalid escape @1');
    expect(errorOf(']{')).toBe(null);
    expect(errorOf('\\07')).toBe(null);
    expect(errorOf('(?=a)*')).toBe(null);
    expect(errorOf('(?=a)*', { unicode: true })).toBe('Invalid regular expression: /(?=a)*/u: Nothing to repeat @6');
  });

  it('named groups: duplicates in different alternatives from ES2025', () => {
    expect(errorOf('(?<a>x)|(?<a>y)')).toBe(null);
    expect(errorOf('(?<a>x)|(?<a>y)', undefined, { ecmaVersion: 2024 })).toBe(
      'Invalid regular expression: /(?<a>x)|(?<a>y)/: Duplicate capture group name @13'
    );
    expect(errorOf('(?<a>x)(?<a>y)')).toBe('Invalid regular expression: /(?<a>x)(?<a>y)/: Duplicate capture group name @12');
    expect(errorOf('\\k<b>(?<a>x)')).toBe('Invalid regular expression: /\\k<b>(?<a>x)/: Invalid named capture referenced @12');
  });

  it('the edition: lookbehind from ES2018, v from ES2024, modifiers from ES2025', () => {
    expect(errorOf('(?<=a)', undefined, { ecmaVersion: 2017 })).toBe('Invalid regular expression: /(?<=a)/: Invalid group @1');
    expect(errorOf('(?i:a)', undefined, { ecmaVersion: 2024 })).toBe('Invalid regular expression: /(?i:a)/: Invalid group @1');
    expect(errorOf('(?i:a)')).toBe(null);
    expect(errorOf('[\\q{ab}--b]', { unicodeSets: true })).toBe(null);
  });

  it('calls its callbacks as methods of its options, twice when Annex B reads names again', () => {
    const calls = [];
    const options = {
      onPatternEnter() {
        calls.push(this === options ? 'pattern' : 'not a method');
      },
      onCharacter(start, end, value) {
        calls.push(String.fromCodePoint(value));
      },
    };
    new RegExpValidator(options).validatePattern('(?<n>a)');
    expect(calls).toEqual(['pattern', 'a', 'pattern', 'a']);
  });
});

describe('regular expressions: parsing', () => {
  it("regexpp's tree, with parents and texts", () => {
    const pattern = parsePattern('a(?<n>[^b-c\\d])+\\k<n>');
    const [alternative] = pattern.alternatives;
    expect(alternative.elements.map((element) => element.type)).toEqual(['Character', 'Quantifier', 'Backreference']);
    const [, quantifier, reference] = alternative.elements;
    expect(quantifier).toMatchObject({ min: 1, max: Infinity, greedy: true, raw: '(?<n>[^b-c\\d])+' });
    const group = quantifier.element;
    expect(group).toMatchObject({ type: 'CapturingGroup', name: 'n', parent: quantifier });
    const characterClass = group.alternatives[0].elements[0];
    expect(characterClass).toMatchObject({ type: 'CharacterClass', negate: true, unicodeSets: false });
    expect(characterClass.elements.map((element) => element.type)).toEqual(['CharacterClassRange', 'CharacterSet']);
    expect(characterClass.elements[0].min).toMatchObject({ value: 0x62, parent: characterClass.elements[0] });
    expect(reference).toMatchObject({ ref: 'n', ambiguous: false, resolved: group });
    expect(group.references).toEqual([reference]);
  });

  it('class set expressions of the v flag', () => {
    const [characterClass] = parsePattern('[\\p{L}&&[a-z]]', { unicodeSets: true }).alternatives[0].elements;
    expect(characterClass.type).toBe('ExpressionCharacterClass');
    expect(characterClass.expression).toMatchObject({ type: 'ClassIntersection', raw: '\\p{L}&&[a-z]' });
    expect(characterClass.expression.left).toMatchObject({ type: 'CharacterSet', key: 'General_Category', value: 'L' });
  });

  it('literals and flags', () => {
    const literal = new RegExpParser().parseLiteral('/a/giu');
    expect(literal.flags).toMatchObject({ global: true, ignoreCase: true, unicode: true, sticky: false, raw: 'giu' });
    expect(literal.pattern.parent).toBe(literal);
  });
});

describe('regular expressions: visiting', () => {
  it('enters and leaves each node, depth first', () => {
    const events = [];
    const handlers = new Proxy({}, { get: (target, name) => (node) => events.push(`${String(name)} ${node.raw}`) });
    visitRegExpAST(parsePattern('(?i:a)|[b]'), handlers);
    expect(events).toEqual([
      'onPatternEnter (?i:a)|[b]',
      'onAlternativeEnter (?i:a)',
      'onGroupEnter (?i:a)',
      'onModifiersEnter i',
      'onModifierFlagsEnter i',
      'onModifierFlagsLeave i',
      'onModifiersLeave i',
      'onAlternativeEnter a',
      'onCharacterEnter a',
      'onCharacterLeave a',
      'onAlternativeLeave a',
      'onGroupLeave (?i:a)',
      'onAlternativeLeave (?i:a)',
      'onAlternativeEnter [b]',
      'onCharacterClassEnter [b]',
      'onCharacterEnter b',
      'onCharacterLeave b',
      'onCharacterClassLeave [b]',
      'onAlternativeLeave [b]',
      'onPatternLeave (?i:a)|[b]',
    ]);
  });
});
