// The tree of an expression (nodes as those of ESTree: Literal, Identifier, MemberExpression...), by precedence
// climbing. Expressions only: no statements, assignments, `new`, `this`, functions other than arrow functions with an
// expression body, nor comments.
import { tokenize } from './tokenizer.js';
import { ExpressionError } from './errors.js';

// Binding power of binary operators (higher binds tighter). The tables have no prototype: a name such as
// constructor is not in them.
const BINARY = Object.assign(Object.create(null), {
  '??': 1,
  '||': 2,
  '&&': 3,
  '|': 4,
  '^': 5,
  '&': 6,
  '==': 7,
  '!=': 7,
  '===': 7,
  '!==': 7,
  '<': 8,
  '>': 8,
  '<=': 8,
  '>=': 8,
  in: 8,
  '<<': 9,
  '>>': 9,
  '>>>': 9,
  '+': 10,
  '-': 10,
  '*': 11,
  '/': 11,
  '%': 11,
  '**': 12,
});
const LOGICAL = new Set(['&&', '||', '??']);
const UNARY = new Set(['!', '-', '+', '~', 'typeof']);
const LITERALS = Object.assign(Object.create(null), { true: true, false: false, null: null });
const UNSUPPORTED = new Set([
  'new',
  'this',
  'function',
  'class',
  'delete',
  'void',
  'instanceof',
  'await',
  'yield',
  'super',
  'import',
  'var',
  'let',
  'const',
  'return',
  'if',
  'for',
  'while',
  'do',
  'switch',
  'throw',
  'try',
  'with',
  'debugger',
]);

class Parser {
  constructor(source, tokens, options = {}) {
    this.source = source;
    this.tokens = tokens;
    this.index = 0;
    this.filters = Boolean(options.filters);
  }

  error(message, token = this.peek()) {
    const position = token ? token.start : this.source.length;
    return new ExpressionError(message, { source: this.source, position });
  }

  peek(offset = 0) {
    return this.tokens[this.index + offset];
  }

  next() {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  is(value, offset = 0) {
    const token = this.peek(offset);
    return Boolean(token && token.type === 'punctuator' && token.value === value);
  }

  isName(value, offset = 0) {
    const token = this.peek(offset);
    return Boolean(token && token.type === 'name' && token.value === value);
  }

  expect(value) {
    if (!this.is(value)) {
      const token = this.peek();
      throw this.error(token ? `Expected ${value} but found ${describe(token)}` : `Expected ${value}`);
    }
    return this.next();
  }

  // The whole source: one expression (with filters, `expression | filter(args) | ...`).
  parseAll() {
    if (this.tokens.length === 0) throw this.error('Empty expression');
    const node = this.filters ? this.parseFiltered() : this.parseExpression();
    if (this.index < this.tokens.length) {
      const token = this.peek();
      if (token.type === 'punctuator' && token.value === '=') throw this.error('Assignments are not allowed');
      if (token.type === 'punctuator' && token.value === ',') throw this.error('Sequences (a, b) are not allowed');
      throw this.error(`Unexpected ${describe(token)}`);
    }
    return node;
  }

  parseFiltered() {
    let node = this.parseExpression();
    while (this.is('|')) {
      const bar = this.next();
      const name = this.next();
      if (!name || name.type !== 'name') throw this.error('Expected the name of a filter', name || bar);
      const args = this.is('(') ? this.parseArguments() : [];
      node = {
        type: 'Filter',
        name: name.value,
        expression: node,
        arguments: args,
        start: node.start,
        end: this.last(),
      };
    }
    return node;
  }

  last() {
    const token = this.tokens[this.index - 1];
    return token ? token.end : 0;
  }

  parseExpression() {
    const test = this.parseBinary(0);
    if (!this.is('?')) return test;
    this.next();
    const consequent = this.parseExpression();
    this.expect(':');
    const alternate = this.parseExpression();
    return { type: 'ConditionalExpression', test, consequent, alternate, start: test.start, end: alternate.end };
  }

  binaryOperator() {
    const token = this.peek();
    if (!token) return null;
    if (token.type === 'name' && token.value === 'in') return 'in';
    if (token.type !== 'punctuator' || !(token.value in BINARY)) return null;
    // With filters, | separates them.
    if (token.value === '|' && this.filters) return null;
    return token.value;
  }

  parseBinary(minPower) {
    let left = this.parseUnary();
    for (;;) {
      const operator = this.binaryOperator();
      if (!operator) return left;
      const power = BINARY[operator];
      if (power <= minPower) return left;
      const token = this.next();
      // ** binds to the right; the others to the left.
      const right = this.parseBinary(operator === '**' ? power - 1 : power);
      // ?? cannot be mixed with || or && without parentheses (as in JavaScript).
      const mixed =
        (operator === '??' && (isLogical(left, '||', '&&') || isLogical(right, '||', '&&'))) ||
        ((operator === '||' || operator === '&&') && (isLogical(left, '??') || isLogical(right, '??')));
      if (mixed) throw this.error('?? cannot be mixed with || or && without parentheses', token);
      left = {
        type: LOGICAL.has(operator) ? 'LogicalExpression' : 'BinaryExpression',
        operator,
        left,
        right,
        start: left.start,
        end: right.end,
      };
    }
  }

  parseUnary() {
    const token = this.peek();
    if (!token) throw this.error('Unexpected end of the expression');
    const operator =
      (token.type === 'punctuator' && UNARY.has(token.value)) || (token.type === 'name' && token.value === 'typeof')
        ? token.value
        : null;
    if (operator) {
      this.next();
      const argument = this.parseUnary();
      if (this.is('**')) throw this.error('Use parentheses around a unary expression before **');
      return { type: 'UnaryExpression', operator, argument, start: token.start, end: argument.end };
    }
    if (token.type === 'punctuator' && (token.value === '++' || token.value === '--')) {
      throw this.error('Updates (++, --) are not allowed');
    }
    return this.parsePostfix(this.parsePrimary());
  }

  // Members, calls and optional chains: a chain with ?. is wrapped in a ChainExpression, where it ends.
  parsePostfix(base) {
    let node = base;
    let optional = false;
    for (;;) {
      if (this.is('.')) {
        this.next();
        const name = this.next();
        if (!name || name.type !== 'name') throw this.error('Expected a property name', name);
        node = { type: 'MemberExpression', object: node, property: name.value, computed: false, optional: false };
      } else if (this.is('?.')) {
        this.next();
        optional = true;
        if (this.is('(')) {
          node = { type: 'CallExpression', callee: node, arguments: this.parseArguments(), optional: true };
        } else if (this.is('[')) {
          this.next();
          const property = this.parseExpression();
          this.expect(']');
          node = { type: 'MemberExpression', object: node, property, computed: true, optional: true };
        } else {
          const name = this.next();
          if (!name || name.type !== 'name') throw this.error('Expected a property name', name);
          node = { type: 'MemberExpression', object: node, property: name.value, computed: false, optional: true };
        }
      } else if (this.is('[')) {
        this.next();
        const property = this.parseExpression();
        this.expect(']');
        node = { type: 'MemberExpression', object: node, property, computed: true, optional: false };
      } else if (this.is('(')) {
        node = { type: 'CallExpression', callee: node, arguments: this.parseArguments(), optional: false };
      } else if (this.peek() && this.peek().type === 'template') {
        throw this.error('Tagged templates are not allowed');
      } else break;
      node.start = base.start;
      node.end = this.last();
    }
    return optional ? { type: 'ChainExpression', expression: node, start: node.start, end: node.end } : node;
  }

  parseArguments() {
    this.expect('(');
    const args = [];
    while (!this.is(')')) {
      args.push(this.parseElement());
      if (!this.is(')')) this.expect(',');
    }
    this.expect(')');
    return args;
  }

  // An item of a list (arguments, arrays): an expression or ...spread.
  parseElement() {
    if (this.is('...')) {
      const token = this.next();
      const argument = this.parseExpression();
      return { type: 'SpreadElement', argument, start: token.start, end: argument.end };
    }
    return this.parseExpression();
  }

  parsePrimary() {
    const token = this.peek();
    if (!token) throw this.error('Unexpected end of the expression');
    if (token.type === 'number' || token.type === 'string') {
      this.next();
      return { type: 'Literal', value: token.value, start: token.start, end: token.end };
    }
    if (token.type === 'template') {
      this.next();
      const expressions = token.expressions.map((part) => {
        const parser = new Parser(this.source, part.tokens);
        if (part.tokens.length === 0) throw this.error('Empty ${} in a template literal', token);
        const node = parser.parseExpression();
        if (parser.index < part.tokens.length) throw parser.error(`Unexpected ${describe(parser.peek())}`);
        return node;
      });
      return { type: 'TemplateLiteral', quasis: token.quasis, expressions, start: token.start, end: token.end };
    }
    if (token.type === 'name') {
      if (UNSUPPORTED.has(token.value)) throw this.error(`${token.value} is not allowed in expressions`);
      // x => body
      if (this.is('=>', 1)) {
        this.next();
        return this.parseArrow([token.value], token);
      }
      this.next();
      if (token.value in LITERALS) {
        return { type: 'Literal', value: LITERALS[token.value], start: token.start, end: token.end };
      }
      return { type: 'Identifier', name: token.value, start: token.start, end: token.end };
    }
    if (this.is('(')) {
      const params = this.arrowParams();
      if (params) return this.parseArrow(params, token);
      this.next();
      // With filters, (value | filter) too.
      const node = this.filters ? this.parseFiltered() : this.parseExpression();
      this.expect(')');
      return { ...node, parenthesized: true };
    }
    if (this.is('[')) {
      this.next();
      const elements = [];
      while (!this.is(']')) {
        if (this.is(',')) throw this.error('Holes in arrays are not allowed');
        elements.push(this.parseElement());
        if (!this.is(']')) this.expect(',');
      }
      this.expect(']');
      return { type: 'ArrayExpression', elements, start: token.start, end: this.last() };
    }
    if (this.is('{')) return this.parseObject();
    throw this.error(`Unexpected ${describe(token)}`);
  }

  // (a, b) => ...: the names of the parameters, when what starts here is an arrow function.
  arrowParams() {
    const params = [];
    let i = 1;
    if (!this.is(')', i)) {
      for (;;) {
        const token = this.peek(i);
        if (!token || token.type !== 'name') return null;
        params.push(token.value);
        i += 1;
        if (this.is(')', i)) break;
        if (!this.is(',', i)) return null;
        i += 1;
      }
    }
    if (!this.is('=>', i + 1)) return null;
    this.index += i + 1;
    return params;
  }

  parseArrow(params, start) {
    this.expect('=>');
    if (this.is('{')) {
      // { ... } after => is a body of statements in JavaScript; an object needs parentheses.
      throw this.error('Arrow functions take an expression: wrap an object in parentheses');
    }
    params.forEach((name, i) => {
      if (UNSUPPORTED.has(name) || name in LITERALS) throw this.error(`${name} cannot be a parameter`, start);
      if (params.indexOf(name) !== i) throw this.error(`Duplicate parameter ${name}`, start);
    });
    const body = this.parseExpression();
    return { type: 'ArrowFunctionExpression', params, body, start: start.start, end: body.end };
  }

  parseObject() {
    const open = this.expect('{');
    const properties = [];
    while (!this.is('}')) {
      if (this.is('...')) {
        const token = this.next();
        const argument = this.parseExpression();
        properties.push({ type: 'SpreadElement', argument, start: token.start, end: argument.end });
      } else {
        const token = this.next();
        let key;
        let computed = false;
        if (token && token.type === 'punctuator' && token.value === '[') {
          key = this.parseExpression();
          this.expect(']');
          computed = true;
        } else if (token && (token.type === 'name' || token.type === 'string')) key = token.value;
        else if (token && token.type === 'number') key = String(token.value);
        else throw this.error('Expected a property name', token);
        if (this.is(':')) {
          this.next();
          properties.push({ type: 'Property', key, computed, value: this.parseExpression(), shorthand: false });
        } else if (token.type === 'name' && !computed && (this.is(',') || this.is('}'))) {
          if (UNSUPPORTED.has(key) || key in LITERALS) throw this.error(`${key} is not allowed in expressions`, token);
          // { name }: the value of the name.
          properties.push({
            type: 'Property',
            key,
            computed: false,
            value: { type: 'Identifier', name: key, start: token.start, end: token.end },
            shorthand: true,
          });
        } else if (this.is('(')) throw this.error('Methods are not allowed in objects');
        else this.expect(':');
      }
      if (!this.is('}')) this.expect(',');
    }
    this.expect('}');
    return { type: 'ObjectExpression', properties, start: open.start, end: this.last() };
  }
}

function isLogical(node, ...operators) {
  return node.type === 'LogicalExpression' && !node.parenthesized && operators.includes(node.operator);
}

function describe(token) {
  if (token.type === 'string') return 'a string';
  if (token.type === 'number') return 'a number';
  if (token.type === 'template') return 'a template literal';
  return JSON.stringify(token.value);
}

// The tree of an expression. `options.filters`: | separates filters (expression | name(args)).
function parse(source, options = {}) {
  if (typeof source !== 'string') throw new TypeError('An expression is a string');
  const { tokens } = tokenize(source);
  return new Parser(source, tokens, options).parseAll();
}

export { parse, Parser };
