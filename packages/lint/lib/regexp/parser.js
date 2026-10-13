// The parser of regular expressions: the tree of a pattern (or a literal, or flags), built from what the validator
// reads. Every node has its type, parent, start, end and raw text; the types and fields are regexpp's (rules read
// them): Pattern, Alternative, Group (with Modifiers and ModifierFlags), CapturingGroup, Quantifier, Assertion,
// Character, CharacterSet, CharacterClass, CharacterClassRange, ExpressionCharacterClass, ClassIntersection,
// ClassSubtraction, ClassStringDisjunction, StringAlternative, Backreference, Flags, RegExpLiteral.
//
//   new RegExpParser({ ecmaVersion, strict }).parsePattern(source, start, end, { unicode, unicodeSets })

import { RegExpValidator, LATEST_ECMA_VERSION } from './validator.js';

const HYPHEN = 0x2d;
const CLASS_SET_OPERANDS = new Set([
  'Character',
  'CharacterSet',
  'CharacterClass',
  'ExpressionCharacterClass',
  'ClassStringDisjunction',
]);

// A tree under construction: the validator's callbacks, as methods. A node being read is the current one (node).
class TreeBuilder {
  constructor(options) {
    this.strict = Boolean(options?.strict);
    this.ecmaVersion = options?.ecmaVersion ?? LATEST_ECMA_VERSION;
    this.source = '';
    this.node = null;
    this.flagsNode = null;
    // The left side of && and -- of each class, built as their operands are read.
    this.expressions = new Map();
    this.backreferences = [];
    this.capturingGroups = [];
  }

  get pattern() {
    if (this.node?.type !== 'Pattern') throw new Error('UnknownError');
    return this.node;
  }

  get flags() {
    if (this.flagsNode?.type !== 'Flags') throw new Error('UnknownError');
    return this.flagsNode;
  }

  // A node of a type in the current one, its text from start to end.
  leaf(type, start, end, fields) {
    return { type, parent: this.node, start, end, raw: this.source.slice(start, end), ...fields };
  }

  // A node with content, made current; closed (its end and text) when its end is read.
  open(type, start, fields) {
    const node = { type, parent: this.node, start, end: start, raw: '', ...fields };
    this.node = node;
    return node;
  }

  close(start, end) {
    const node = this.node;
    node.end = end;
    node.raw = this.source.slice(start, end);
    this.node = node.parent;
    return node;
  }

  expect(...types) {
    if (!types.includes(this.node.type)) throw new Error('UnknownError');
  }

  onRegExpFlags(start, end, flags) {
    const { global, ignoreCase, multiline, unicode, sticky, dotAll, hasIndices, unicodeSets } = flags;
    this.flagsNode = {
      type: 'Flags',
      parent: null,
      start,
      end,
      raw: this.source.slice(start, end),
      global,
      ignoreCase,
      multiline,
      unicode,
      sticky,
      dotAll,
      hasIndices,
      unicodeSets,
    };
  }

  onPatternEnter(start) {
    this.node = { type: 'Pattern', parent: null, start, end: start, raw: '', alternatives: [] };
    this.backreferences.length = 0;
    this.capturingGroups.length = 0;
  }

  // The pattern read: each backreference resolved to its group (or, a name of groups in alternatives, its groups).
  onPatternLeave(start, end) {
    this.node.end = end;
    this.node.raw = this.source.slice(start, end);
    for (const reference of this.backreferences) {
      const { ref } = reference;
      const groups =
        typeof ref === 'number'
          ? [this.capturingGroups[ref - 1]]
          : this.capturingGroups.filter((group) => group.name === ref);
      reference.ambiguous = groups.length !== 1;
      reference.resolved = groups.length === 1 ? groups[0] : groups;
      for (const group of groups) group.references.push(reference);
    }
  }

  onAlternativeEnter(start) {
    this.expect('Assertion', 'CapturingGroup', 'Group', 'Pattern');
    const parent = this.node;
    parent.alternatives.push(this.open('Alternative', start, { elements: [] }));
  }

  onAlternativeLeave(start, end) {
    this.expect('Alternative');
    this.close(start, end);
  }

  onGroupEnter(start) {
    this.expect('Alternative');
    const parent = this.node;
    parent.elements.push(this.open('Group', start, { modifiers: null, alternatives: [] }));
  }

  onGroupLeave(start, end) {
    this.expect('Group');
    this.close(start, end);
  }

  onModifiersEnter(start) {
    this.expect('Group');
    const parent = this.node;
    parent.modifiers = this.open('Modifiers', start, { add: null, remove: null });
  }

  onModifiersLeave(start, end) {
    this.expect('Modifiers');
    this.close(start, end);
  }

  onAddModifiers(start, end, { ignoreCase, multiline, dotAll }) {
    this.expect('Modifiers');
    this.node.add = this.leaf('ModifierFlags', start, end, { ignoreCase, multiline, dotAll });
  }

  onRemoveModifiers(start, end, { ignoreCase, multiline, dotAll }) {
    this.expect('Modifiers');
    this.node.remove = this.leaf('ModifierFlags', start, end, { ignoreCase, multiline, dotAll });
  }

  onCapturingGroupEnter(start, name) {
    this.expect('Alternative');
    const parent = this.node;
    const group = this.open('CapturingGroup', start, { name, alternatives: [], references: [] });
    parent.elements.push(group);
    this.capturingGroups.push(group);
  }

  onCapturingGroupLeave(start, end) {
    this.expect('CapturingGroup');
    this.close(start, end);
  }

  // A quantifier takes the element before it.
  onQuantifier(start, end, min, max, greedy) {
    this.expect('Alternative');
    const parent = this.node;
    const element = parent.elements.pop();
    if (
      element == null ||
      element.type === 'Quantifier' ||
      (element.type === 'Assertion' && element.kind !== 'lookahead')
    ) {
      throw new Error('UnknownError');
    }
    const node = {
      type: 'Quantifier',
      parent,
      start: element.start,
      end,
      raw: this.source.slice(element.start, end),
      min,
      max,
      greedy,
      element,
    };
    parent.elements.push(node);
    element.parent = node;
  }

  onLookaroundAssertionEnter(start, kind, negate) {
    this.expect('Alternative');
    const parent = this.node;
    parent.elements.push(this.open('Assertion', start, { kind, negate, alternatives: [] }));
  }

  onLookaroundAssertionLeave(start, end) {
    this.expect('Assertion');
    this.close(start, end);
  }

  onEdgeAssertion(start, end, kind) {
    this.expect('Alternative');
    this.node.elements.push(this.leaf('Assertion', start, end, { kind }));
  }

  onWordBoundaryAssertion(start, end, kind, negate) {
    this.expect('Alternative');
    this.node.elements.push(this.leaf('Assertion', start, end, { kind, negate }));
  }

  onAnyCharacterSet(start, end, kind) {
    this.expect('Alternative');
    this.node.elements.push(this.leaf('CharacterSet', start, end, { kind }));
  }

  onEscapeCharacterSet(start, end, kind, negate) {
    this.expect('Alternative', 'CharacterClass');
    this.node.elements.push(this.leaf('CharacterSet', start, end, { kind, negate }));
  }

  onUnicodePropertyCharacterSet(start, end, kind, key, value, negate, strings) {
    this.expect('Alternative', 'CharacterClass');
    const parent = this.node;
    if (strings && ((parent.type === 'CharacterClass' && !parent.unicodeSets) || negate || value !== null)) {
      throw new Error('UnknownError');
    }
    parent.elements.push(this.leaf('CharacterSet', start, end, { kind, strings, key, value, negate }));
  }

  onCharacter(start, end, value) {
    this.expect('Alternative', 'CharacterClass', 'StringAlternative');
    this.node.elements.push(this.leaf('Character', start, end, { value }));
  }

  onBackreference(start, end, ref) {
    this.expect('Alternative');
    const node = this.leaf('Backreference', start, end, { ref, ambiguous: false, resolved: null });
    this.node.elements.push(node);
    this.backreferences.push(node);
  }

  onCharacterClassEnter(start, negate, unicodeSets) {
    const parent = this.node;
    if (parent.type !== 'Alternative' && !(parent.type === 'CharacterClass' && parent.unicodeSets && unicodeSets)) {
      throw new Error('UnknownError');
    }
    parent.elements.push(this.open('CharacterClass', start, { unicodeSets, negate, elements: [] }));
  }

  // A class read; one with && or -- becomes an ExpressionCharacterClass of its expression.
  onCharacterClassLeave(start, end) {
    this.expect('CharacterClass');
    const node = this.close(start, end);
    const { parent } = node;
    if (parent.type !== 'Alternative' && parent.type !== 'CharacterClass') throw new Error('UnknownError');
    const expression = this.expressions.get(node);
    if (!expression) return;
    if (node.elements.length > 0) throw new Error('UnknownError');
    this.expressions.delete(node);
    const replacement = {
      type: 'ExpressionCharacterClass',
      parent,
      start: node.start,
      end: node.end,
      raw: node.raw,
      negate: node.negate,
      expression,
    };
    expression.parent = replacement;
    if (node !== parent.elements.pop()) throw new Error('UnknownError');
    parent.elements.push(replacement);
  }

  // A range takes the characters before it (and, without v, the hyphen between them).
  onCharacterClassRange(start, end) {
    this.expect('CharacterClass');
    const parent = this.node;
    const { elements } = parent;
    const max = elements.pop();
    if (max?.type !== 'Character') throw new Error('UnknownError');
    if (!parent.unicodeSets) {
      const hyphen = elements.pop();
      if (hyphen?.type !== 'Character' || hyphen.value !== HYPHEN) throw new Error('UnknownError');
    }
    const min = elements.pop();
    if (min?.type !== 'Character') throw new Error('UnknownError');
    const node = this.leaf('CharacterClassRange', start, end, { min, max });
    min.parent = node;
    max.parent = node;
    elements.push(node);
  }

  onClassIntersection(start, end) {
    this.setOperation('ClassIntersection', 'ClassSubtraction', start, end);
  }

  onClassSubtraction(start, end) {
    this.setOperation('ClassSubtraction', 'ClassIntersection', start, end);
  }

  // && or --: the expression so far (or the operand before) and the operand just read.
  setOperation(type, otherType, start, end) {
    const parent = this.node;
    if (parent.type !== 'CharacterClass' || !parent.unicodeSets) throw new Error('UnknownError');
    const right = parent.elements.pop();
    const left = this.expressions.get(parent) ?? parent.elements.pop();
    if (
      !left ||
      !right ||
      left.type === otherType ||
      (left.type !== type && !CLASS_SET_OPERANDS.has(left.type)) ||
      !CLASS_SET_OPERANDS.has(right.type)
    ) {
      throw new Error('UnknownError');
    }
    const node = this.leaf(type, start, end, { left, right });
    left.parent = node;
    right.parent = node;
    this.expressions.set(parent, node);
  }

  onClassStringDisjunctionEnter(start) {
    const parent = this.node;
    if (parent.type !== 'CharacterClass' || !parent.unicodeSets) throw new Error('UnknownError');
    parent.elements.push(this.open('ClassStringDisjunction', start, { alternatives: [] }));
  }

  onClassStringDisjunctionLeave(start, end) {
    this.expect('ClassStringDisjunction');
    this.close(start, end);
  }

  onStringAlternativeEnter(start) {
    this.expect('ClassStringDisjunction');
    const parent = this.node;
    parent.alternatives.push(this.open('StringAlternative', start, { elements: [] }));
  }

  onStringAlternativeLeave(start, end) {
    this.expect('StringAlternative');
    this.close(start, end);
  }
}

class RegExpParser {
  constructor(options) {
    this._builder = new TreeBuilder(options);
    this._validator = new RegExpValidator(this._builder);
  }

  /** A literal, /pattern/flags: a RegExpLiteral with its pattern and flags. */
  parseLiteral(source, start = 0, end = source.length) {
    this._builder.source = source;
    this._validator.validateLiteral(source, start, end);
    const { pattern, flags } = this._builder;
    const literal = { type: 'RegExpLiteral', parent: null, start, end, raw: source, pattern, flags };
    pattern.parent = literal;
    flags.parent = literal;
    return literal;
  }

  parseFlags(source, start = 0, end = source.length) {
    this._builder.source = source;
    this._validator.validateFlags(source, start, end);
    return this._builder.flags;
  }

  parsePattern(source, start = 0, end = source.length, uFlagOrFlags = undefined) {
    this._builder.source = source;
    this._validator.validatePattern(source, start, end, uFlagOrFlags);
    return this._builder.pattern;
  }
}

export { RegExpParser };
