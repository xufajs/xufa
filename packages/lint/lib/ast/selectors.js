// Selectors of rules' listeners (`CallExpression > MemberExpression.callee[computed=false]:exit`), as ESLint reads
// them: parsed by esquery's grammar into esquery's trees, analyzed for the node types they can match and their
// specificity (what ESLint's linter/esquery.js computes), and compiled to a test of a node.
//
//   parse(source) -> { source, isExit, root, nodeTypes, attributeCount, identifierCount, compare(other), test }
//
// test(node, stack, top): whether the node matches, its ancestors being stack[top - 1] (its parent), stack[top - 2]...
// down to stack[0], the root.

import { KEYS, getKeys, isNode } from './visitor-keys.js';

// The parser: esquery's grammar (a PEG), read in the order its rules try their alternatives. Like the PEG, it keeps
// the furthest place a terminal failed and what was expected there, which is what an error reports.

const FAILED = Symbol('failed');

// A text in the PEG's messages: backslashes, quotes and control characters escaped (\0, \t, \n, \r, \xHH).
const NAMED_ESCAPES = { '\\': '\\\\', '"': '\\"', '\0': '\\0', '\t': '\\t', '\n': '\\n', '\r': '\\r' };

function literalEscape(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (NAMED_ESCAPES[ch]) out += NAMED_ESCAPES[ch];
    else if (code <= 0x1f || (code >= 0x7f && code <= 0x9f))
      out += `\\x${code.toString(16).toUpperCase().padStart(2, '0')}`;
    else out += ch;
  }
  return out;
}

// What the parser expects at a place, as the PEG's messages describe it, and the test of a character.
const expected = (description) => description;
const literal = (text) => ({ text, description: `"${literalEscape(text)}"` });
const SPACE = literal(' ');
const NAME_CHAR = { test: /^[^ [\],():#!=><~+.]/, description: '[^ [\\],():#!=><~+.]' };
const DIGIT = { test: /^[0-9]/, description: '[0-9]' };
const RELATION = { test: /^[><!]/, description: '[><!]' };
const ORDER = { test: /^[><]/, description: '[><]' };
const DOUBLE_QUOTED = { test: /^[^\\"]/, description: '[^\\\\"]' };
const SINGLE_QUOTED = { test: /^[^\\']/, description: "[^\\\\']" };
const TYPE_CHAR = { test: /^[^ )]/, description: '[^ )]' };
const FLAG = { test: /^[imsu]/, description: '[imsu]' };
const CLASS_CHAR = { test: /^[^\]\\]/, description: '[^\\]\\\\]' };
const REGEXP_CHAR = { test: /^[^/\\[]/, description: '[^/\\\\[]' };
const ANY = 'any character';
const END = 'end of input';

const unescapeString = (text) =>
  text.replace(/\\(.)/g, (all, ch) => ({ b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' })[ch] ?? ch);

const nth = (type, value) => ({ type, index: { type: 'literal', value } });

class Parser {
  constructor(input) {
    this.input = input;
    this.pos = 0;
    this.failPos = 0;
    this.expected = [];
  }

  fail(description) {
    if (this.pos < this.failPos) return;
    if (this.pos > this.failPos) {
      this.failPos = this.pos;
      this.expected = [];
    }
    this.expected.push(description);
  }

  text(terminal) {
    if (this.input.startsWith(terminal.text, this.pos)) {
      this.pos += terminal.text.length;
      return terminal.text;
    }
    this.fail(terminal.description);
    return FAILED;
  }

  char(terminal) {
    const ch = this.input.charAt(this.pos);
    if (terminal.test.test(ch)) {
      this.pos += 1;
      return ch;
    }
    this.fail(terminal.description);
    return FAILED;
  }

  // One or more characters of a class (zero or more with `min` 0), as a string.
  chars(terminal, min = 1) {
    let out = '';
    for (let ch = this.char(terminal); ch !== FAILED; ch = this.char(terminal)) out += ch;
    return out.length >= min ? out : FAILED;
  }

  any() {
    if (this.pos < this.input.length) return this.input.charAt(this.pos++);
    this.fail(expected(ANY));
    return FAILED;
  }

  // A sequence of parts, each a function returning FAILED or a value: their values, or FAILED (back where it began).
  seq(...parts) {
    const start = this.pos;
    const values = [];
    for (const part of parts) {
      const value = part();
      if (value === FAILED) {
        this.pos = start;
        return FAILED;
      }
      values.push(value);
    }
    return values;
  }

  // The first alternative that does not fail.
  first(...alternatives) {
    for (const alternative of alternatives) {
      const value = alternative();
      if (value !== FAILED) return value;
    }
    return FAILED;
  }

  // An optional part: its value, or null.
  maybe(part) {
    const value = part();
    return value === FAILED ? null : value;
  }

  start() {
    const parsed = this.seq(
      () => this.spaces(),
      () => this.selectors(),
      () => this.spaces()
    );
    if (parsed !== FAILED) {
      const [, list] = parsed;
      return list.length === 1 ? list[0] : { type: 'matches', selectors: list };
    }
    this.spaces();
    return undefined;
  }

  spaces() {
    while (this.text(SPACE) !== FAILED);
    return ' ';
  }

  identifierName() {
    return this.chars(NAME_CHAR);
  }

  binaryOp() {
    const around = (terminal, type) => () => {
      const value = this.seq(
        () => this.spaces(),
        () => this.text(literal(terminal)),
        () => this.spaces()
      );
      return value === FAILED ? FAILED : type;
    };
    return this.first(around('>', 'child'), around('~', 'sibling'), around('+', 'adjacent'), () => {
      const value = this.seq(
        () => this.text(SPACE),
        () => this.spaces()
      );
      return value === FAILED ? FAILED : 'descendant';
    });
  }

  // `item` and more after commas.
  list(item) {
    const head = item();
    if (head === FAILED) return FAILED;
    const items = [head];
    for (;;) {
      const next = this.seq(
        () => this.spaces(),
        () => this.text(literal(',')),
        () => this.spaces(),
        item
      );
      if (next === FAILED) break;
      items.push(next[3]);
    }
    return items;
  }

  selectors() {
    return this.list(() => this.selector());
  }

  hasSelectors() {
    return this.list(() => this.hasSelector());
  }

  hasSelector() {
    const start = this.pos;
    const op = this.maybe(() => this.binaryOp());
    const selector = this.selector();
    if (selector === FAILED) {
      this.pos = start;
      return FAILED;
    }
    return op ? { type: op, left: { type: 'exactNode' }, right: selector } : selector;
  }

  selector() {
    let selector = this.sequence();
    if (selector === FAILED) return FAILED;
    for (;;) {
      const next = this.seq(
        () => this.binaryOp(),
        () => this.sequence()
      );
      if (next === FAILED) return selector;
      selector = { type: next[0], left: selector, right: next[1] };
    }
  }

  sequence() {
    const start = this.pos;
    const subject = this.maybe(() => this.text(literal('!')));
    const atoms = [];
    for (let atom = this.atom(); atom !== FAILED; atom = this.atom()) atoms.push(atom);
    if (!atoms.length) {
      this.pos = start;
      return FAILED;
    }
    const sequence = atoms.length === 1 ? atoms[0] : { type: 'compound', selectors: atoms };
    if (subject) sequence.subject = true;
    return sequence;
  }

  atom() {
    return this.first(
      () => (this.text(literal('*')) === FAILED ? FAILED : { type: 'wildcard', value: '*' }),
      () => this.identifier(),
      () => this.attribute(),
      () => this.field(),
      () => this.withSelectors(':not(', 'not', () => this.selectors()),
      () => this.withSelectors(':matches(', 'matches', () => this.selectors()),
      () => this.withSelectors(':is(', 'matches', () => this.selectors()),
      () => this.withSelectors(':has(', 'has', () => this.hasSelectors()),
      () => (this.text(literal(':first-child')) === FAILED ? FAILED : nth('nth-child', 1)),
      () => (this.text(literal(':last-child')) === FAILED ? FAILED : nth('nth-last-child', 1)),
      () => this.nthChild(':nth-child(', 'nth-child'),
      () => this.nthChild(':nth-last-child(', 'nth-last-child'),
      () => {
        const value = this.seq(
          () => this.text(literal(':')),
          () => this.identifierName()
        );
        return value === FAILED ? FAILED : { type: 'class', name: value[1] };
      }
    );
  }

  identifier() {
    const value = this.seq(
      () => this.maybe(() => this.text(literal('#'))),
      () => this.identifierName()
    );
    return value === FAILED ? FAILED : { type: 'identifier', value: value[1] };
  }

  attribute() {
    const value = this.seq(
      () => this.text(literal('[')),
      () => this.spaces(),
      () => this.attributeValue(),
      () => this.spaces(),
      () => this.text(literal(']'))
    );
    return value === FAILED ? FAILED : value[2];
  }

  attributeName() {
    const head = this.identifierName();
    if (head === FAILED) return FAILED;
    let name = head;
    for (;;) {
      const next = this.seq(
        () => this.text(literal('.')),
        () => this.identifierName()
      );
      if (next === FAILED) return name;
      name += `.${next[1]}`;
    }
  }

  attributeValue() {
    const withValue = (operator, value) => () => {
      const parsed = this.seq(
        () => this.attributeName(),
        () => this.spaces(),
        operator,
        () => this.spaces(),
        value
      );
      return parsed === FAILED ? FAILED : { type: 'attribute', name: parsed[0], operator: parsed[2], value: parsed[4] };
    };
    return this.first(
      withValue(
        () => this.equality(),
        () =>
          this.first(
            () => this.typeValue(),
            () => this.regexp()
          )
      ),
      withValue(
        () => this.comparison(),
        () =>
          this.first(
            () => this.string(),
            () => this.number(),
            () => this.path()
          )
      ),
      () => {
        const name = this.attributeName();
        return name === FAILED ? FAILED : { type: 'attribute', name };
      }
    );
  }

  equality() {
    const value = this.seq(
      () => this.maybe(() => this.text(literal('!'))),
      () => this.text(literal('='))
    );
    return value === FAILED ? FAILED : `${value[0] ?? ''}=`;
  }

  comparison() {
    return this.first(
      () => {
        const value = this.seq(
          () => this.maybe(() => this.char(RELATION)),
          () => this.text(literal('='))
        );
        return value === FAILED ? FAILED : `${value[0] ?? ''}=`;
      },
      () => this.char(ORDER)
    );
  }

  string() {
    const quoted = (quote, plain) => () => {
      const start = this.pos;
      if (this.text(literal(quote)) === FAILED) return FAILED;
      let text = '';
      for (;;) {
        const ch = this.char(plain);
        if (ch !== FAILED) {
          text += ch;
          continue;
        }
        const escaped = this.seq(
          () => this.text(literal('\\')),
          () => this.any()
        );
        if (escaped === FAILED) break;
        text += escaped[0] + escaped[1];
      }
      if (this.text(literal(quote)) === FAILED) {
        this.pos = start;
        return FAILED;
      }
      return { type: 'literal', value: unescapeString(text) };
    };
    return this.first(quoted('"', DOUBLE_QUOTED), quoted("'", SINGLE_QUOTED));
  }

  number() {
    const start = this.pos;
    const leading = this.maybe(() => {
      const value = this.seq(
        () => this.chars(DIGIT, 0),
        () => this.text(literal('.'))
      );
      return value === FAILED ? FAILED : value.join('');
    });
    const digits = this.chars(DIGIT);
    if (digits === FAILED) {
      this.pos = start;
      return FAILED;
    }
    return { type: 'literal', value: parseFloat((leading ?? '') + digits) };
  }

  path() {
    const name = this.identifierName();
    return name === FAILED ? FAILED : { type: 'literal', value: name };
  }

  typeValue() {
    const value = this.seq(
      () => this.text(literal('type(')),
      () => this.spaces(),
      () => this.chars(TYPE_CHAR),
      () => this.spaces(),
      () => this.text(literal(')'))
    );
    return value === FAILED ? FAILED : { type: 'type', value: value[2] };
  }

  regexp() {
    const start = this.pos;
    if (this.text(literal('/')) === FAILED) return FAILED;
    let pattern = '';
    for (;;) {
      const part = this.first(
        () => this.regexpClass(),
        () => this.regexpEscape(),
        () => this.chars(REGEXP_CHAR)
      );
      if (part === FAILED) break;
      pattern += part;
    }
    if (!pattern || this.text(literal('/')) === FAILED) {
      this.pos = start;
      return FAILED;
    }
    const flags = this.chars(FLAG);
    return { type: 'regexp', value: new RegExp(pattern, flags === FAILED ? '' : flags) };
  }

  regexpClass() {
    const start = this.pos;
    if (this.text(literal('[')) === FAILED) return FAILED;
    let inner = '';
    for (;;) {
      const part = this.first(
        () => this.char(CLASS_CHAR),
        () => this.regexpEscape()
      );
      if (part === FAILED) break;
      inner += part;
    }
    if (this.text(literal(']')) === FAILED) {
      this.pos = start;
      return FAILED;
    }
    return `[${inner}]`;
  }

  regexpEscape() {
    const value = this.seq(
      () => this.text(literal('\\')),
      () => this.any()
    );
    return value === FAILED ? FAILED : `\\${value[1]}`;
  }

  field() {
    const start = this.pos;
    if (this.text(literal('.')) === FAILED) return FAILED;
    const name = this.attributeName();
    if (name === FAILED) {
      this.pos = start;
      return FAILED;
    }
    return { type: 'field', name };
  }

  withSelectors(opening, type, list) {
    const value = this.seq(
      () => this.text(literal(opening)),
      () => this.spaces(),
      list,
      () => this.spaces(),
      () => this.text(literal(')'))
    );
    return value === FAILED ? FAILED : { type, selectors: value[2] };
  }

  nthChild(opening, type) {
    const value = this.seq(
      () => this.text(literal(opening)),
      () => this.spaces(),
      () => this.chars(DIGIT),
      () => this.spaces(),
      () => this.text(literal(')'))
    );
    return value === FAILED ? FAILED : nth(type, parseInt(value[2], 10));
  }

  // The tree of the whole input, or a SyntaxError that says where it fails and what was expected there.
  parse() {
    const result = this.start();
    if (result !== FAILED && this.pos === this.input.length) return result;
    if (result !== FAILED && this.pos < this.input.length) this.fail(expected(END));
    const descriptions = [...new Set(this.expected)].sort();
    const wanted =
      descriptions.length <= 2
        ? descriptions.join(' or ')
        : `${descriptions.slice(0, -1).join(', ')}, or ${descriptions.at(-1)}`;
    const at = this.failPos;
    const found = at < this.input.length ? `"${literalEscape(this.input.charAt(at))}"` : END;
    const error = new SyntaxError(`Expected ${wanted} but ${found} found.`);
    error.location = { start: { offset: at }, end: { offset: at < this.input.length ? at + 1 : at } };
    throw error;
  }
}

function parseSelector(source) {
  try {
    return new Parser(source).parse();
  } catch (error) {
    if (typeof error.location?.start?.offset !== 'number') throw error;
    throw new SyntaxError(
      `Syntax error in selector "${source}" at position ${error.location.start.offset}: ${error.message}`,
      { cause: error }
    );
  }
}

// What ESLint computes of a selector to index and order it: the node types it can match (null: any), and its
// specificity (attributes and fields, then types).
function analyze(root) {
  let attributeCount = 0;
  let identifierCount = 0;
  const union = (lists) => [...new Set(lists.flat())];
  const intersection = (lists) =>
    lists.slice(1).reduce((out, list) => out.filter((type) => list.includes(type)), [...new Set(lists[0])]);
  const typesOf = (selector) => {
    switch (selector.type) {
      case 'identifier':
        identifierCount++;
        return [selector.value];
      case 'not':
        selector.selectors.forEach(typesOf);
        return null;
      case 'matches': {
        const lists = selector.selectors.map(typesOf);
        return lists.every(Boolean) ? union(lists) : null;
      }
      case 'compound': {
        const lists = selector.selectors.map(typesOf).filter(Boolean);
        return lists.length ? intersection(lists) : null;
      }
      case 'attribute':
      case 'field':
      case 'nth-child':
      case 'nth-last-child':
        attributeCount++;
        return null;
      case 'child':
      case 'descendant':
      case 'sibling':
      case 'adjacent':
        typesOf(selector.left);
        return typesOf(selector.right);
      case 'class':
        return selector.name === 'function'
          ? ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']
          : null;
      default:
        return null;
    }
  };
  return { nodeTypes: typesOf(root), attributeCount, identifierCount };
}

// The matching of a selector's tree, as esquery matches it, compiled to closures.

const ALWAYS = () => true;
const keysOf = (node) => KEYS[node.type] ?? getKeys(node);

function getPath(object, path) {
  let value = object;
  for (const key of path) {
    if (value == null) return value;
    value = value[key];
  }
  return value;
}

// Whether following `path` from `ancestor` (through arrays, any of their items) reaches `node`.
function inPath(node, ancestor, path, from) {
  let current = ancestor;
  for (let i = from; i < path.length; ++i) {
    if (current == null) return false;
    const field = current[path[i]];
    if (Array.isArray(field)) return field.some((item) => inPath(node, item, path, i + 1));
    current = field;
  }
  return node === current;
}

// The arrays of a node's children that hold `node`, with its index in each.
function* listsHolding(parent, node) {
  for (const key of keysOf(parent)) {
    const list = parent[key];
    if (!Array.isArray(list)) continue;
    const index = list.indexOf(node);
    if (index >= 0) yield [list, index];
  }
}

function sibling(node, test, stack, top, before) {
  if (top === 0) return false;
  for (const [list, index] of listsHolding(stack[top - 1], node)) {
    const [from, to] = before ? [0, index] : [index + 1, list.length];
    for (let k = from; k < to; ++k) if (isNode(list[k]) && test(list[k], stack, top)) return true;
  }
  return false;
}

function adjacent(node, test, stack, top, before) {
  if (top === 0) return false;
  for (const [list, index] of listsHolding(stack[top - 1], node)) {
    const other = before ? list[index - 1] : list[index + 1];
    if ((before ? index > 0 : index < list.length - 1) && isNode(other) && test(other, stack, top)) return true;
  }
  return false;
}

function nthChild(node, stack, top, n) {
  if (n === 0 || top === 0) return false;
  const parent = stack[top - 1];
  for (const key of keysOf(parent)) {
    const list = parent[key];
    if (!Array.isArray(list)) continue;
    const index = n < 0 ? list.length + n : n - 1;
    if (index >= 0 && index < list.length && list[index] === node) return true;
  }
  return false;
}

// The classes of ESLint's JavaScript language (matchesSelectorClass).
function matchesClass(name, node, parent) {
  const { type } = node;
  switch (name.toLowerCase()) {
    case 'statement':
      if (type.slice(-9) === 'Statement') return true;
    // falls through: a declaration is a statement
    case 'declaration':
      return type.slice(-11) === 'Declaration';
    case 'pattern':
      if (type.slice(-7) === 'Pattern') return true;
    // falls through: an expression is a pattern
    case 'expression':
      return (
        type.slice(-10) === 'Expression' ||
        type.slice(-7) === 'Literal' ||
        (type === 'Identifier' && (parent === undefined || parent.type !== 'MetaProperty')) ||
        type === 'MetaProperty'
      );
    case 'function':
      return type === 'FunctionDeclaration' || type === 'FunctionExpression' || type === 'ArrowFunctionExpression';
    default:
      throw new Error(`Unknown class name: ${name}`);
  }
}

function attributeTest(selector) {
  const path = selector.name.split('.');
  const { operator, value } = selector;
  const valueOf = (node) => getPath(node, path);
  switch (operator) {
    case undefined:
      return (node) => valueOf(node) != null;
    case '=':
    case '!=': {
      const equal = operator === '=';
      if (value.type === 'regexp') {
        return equal
          ? (node) => {
              const found = valueOf(node);
              return typeof found === 'string' && value.value.test(found);
            }
          : (node) => !value.value.test(valueOf(node));
      }
      if (value.type === 'literal') {
        const text = `${value.value}`;
        return (node) => (text === `${valueOf(node)}`) === equal;
      }
      if (value.type === 'type') return (node) => (value.value === typeof valueOf(node)) === equal;
      throw new Error(`Unknown selector value type: ${value.type}`);
    }
    case '<=':
      return (node) => valueOf(node) <= value.value;
    case '<':
      return (node) => valueOf(node) < value.value;
    case '>':
      return (node) => valueOf(node) > value.value;
    case '>=':
      return (node) => valueOf(node) >= value.value;
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}

// `:has(...)`: whether a node of the subtree (the node itself first) matches, its ancestors counted from the node.
function hasTest(tests) {
  return (node) => {
    const stack = [];
    const walk = (current) => {
      for (const test of tests) if (test(current, stack, stack.length)) return true;
      stack.push(current);
      for (const key of keysOf(current)) {
        const child = current[key];
        if (Array.isArray(child)) {
          for (const item of child) if (isNode(item) && walk(item)) return true;
        } else if (isNode(child) && walk(child)) {
          return true;
        }
      }
      stack.pop();
      return false;
    };
    return walk(node);
  };
}

function compile(selector) {
  if (selector == null) return ALWAYS;
  switch (selector.type) {
    case 'wildcard':
      return ALWAYS;
    case 'identifier': {
      const { value } = selector;
      const lower = value.toLowerCase();
      return (node) => node.type === value || node.type.toLowerCase() === lower;
    }
    case 'exactNode':
      return (node, stack, top) => top === 0;
    case 'field': {
      const path = selector.name.split('.');
      return (node, stack, top) => inPath(node, stack[top - path.length], path, 0);
    }
    case 'matches': {
      const tests = selector.selectors.map(compile);
      return (node, stack, top) => tests.some((test) => test(node, stack, top));
    }
    case 'compound': {
      const tests = selector.selectors.map(compile);
      return (node, stack, top) => tests.every((test) => test(node, stack, top));
    }
    case 'not': {
      const tests = selector.selectors.map(compile);
      return (node, stack, top) => !tests.some((test) => test(node, stack, top));
    }
    case 'has':
      return hasTest(selector.selectors.map(compile));
    case 'child': {
      const left = compile(selector.left);
      const right = compile(selector.right);
      return (node, stack, top) => top > 0 && right(node, stack, top) && left(stack[top - 1], stack, top - 1);
    }
    case 'descendant': {
      const left = compile(selector.left);
      const right = compile(selector.right);
      return (node, stack, top) => {
        if (!right(node, stack, top)) return false;
        for (let i = top - 1; i >= 0; --i) if (left(stack[i], stack, i)) return true;
        return false;
      };
    }
    case 'attribute':
      return attributeTest(selector);
    case 'sibling': {
      const left = compile(selector.left);
      const right = compile(selector.right);
      const both = Boolean(selector.left.subject);
      return (node, stack, top) =>
        (right(node, stack, top) && sibling(node, left, stack, top, true)) ||
        (both && left(node, stack, top) && sibling(node, right, stack, top, false));
    }
    case 'adjacent': {
      const left = compile(selector.left);
      const right = compile(selector.right);
      const both = Boolean(selector.right.subject);
      return (node, stack, top) =>
        (right(node, stack, top) && adjacent(node, left, stack, top, true)) ||
        (both && left(node, stack, top) && adjacent(node, right, stack, top, false));
    }
    case 'nth-child':
    case 'nth-last-child': {
      const n = selector.type === 'nth-child' ? selector.index.value : -selector.index.value;
      const right = compile(selector.right);
      return (node, stack, top) => right(node, stack, top) && nthChild(node, stack, top, n);
    }
    case 'class':
      return (node, stack, top) => matchesClass(selector.name, node, top > 0 ? stack[top - 1] : undefined);
    default:
      throw new Error(`Unknown selector type: ${selector.type}`);
  }
}

class Selector {
  constructor(source, root) {
    this.source = source;
    this.isExit = source.endsWith(':exit');
    this.root = root;
    Object.assign(this, analyze(root));
    // A selector that is a type alone matches every node of its type: listeners finds it by type, and does not test.
    this.byTypeAlone = root.type === 'identifier';
    this.test = compile(root);
  }

  // The order of selectors that match a node: the less specific first (fewer attributes, then fewer types), then
  // by their text.
  compare(other) {
    return (
      this.attributeCount - other.attributeCount ||
      this.identifierCount - other.identifierCount ||
      (this.source <= other.source ? -1 : 1)
    );
  }
}

const cache = new Map();

/** A selector of a listener, parsed (and kept: the same text is parsed once). */
function parse(source) {
  let selector = cache.get(source);
  if (selector) return selector;
  const text = source.replace(/:exit$/u, '');
  let root;
  if (text === '*') root = { type: 'wildcard', value: '*' };
  else if (/^[a-z]+$/iu.test(text)) root = { type: 'identifier', value: text };
  else root = parseSelector(text);
  selector = new Selector(source, root);
  cache.set(source, selector);
  return selector;
}

export { parse, parseSelector, matchesClass };
