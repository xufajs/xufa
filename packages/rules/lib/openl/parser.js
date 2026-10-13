// The parser of the language of OpenL Tablets: the expressions of Java (casts, new, arrays), the operators of OpenL
// (and, or, not, **, <>, ====, string==, the array operators select/order/split/transform and their @ forms), the
// phrases of BEX (is less than, equals to...), and the statements of the bodies of methods (variables, if, for,
// while, return). It gives trees for the compiler.
import { tokenize, OpenLSyntaxError } from './tokens.js';

const PRIMITIVES = new Set(['int', 'long', 'short', 'byte', 'double', 'float', 'boolean', 'char', 'void']);
// The phrases of BEX, the words after "is" (or the first word), and the operator each is.
const PHRASES = [
  [['is', 'less', 'or', 'equal'], '<='],
  [['is', 'more', 'or', 'equal'], '>='],
  [['is', 'less', 'than'], '<'],
  [['is', 'more', 'than'], '>'],
  [['is', 'greater', 'than'], '>'],
  [['is', 'no', 'more', 'than'], '<='],
  [['is', 'no', 'less', 'than'], '>='],
  [['is', 'same', 'as'], '=='],
  [['is', 'the', 'same', 'as'], '=='],
  [['is', 'different', 'from'], '!='],
  [['is', 'not'], '!='],
  [['is', 'in'], '<='],
  [['equals', 'to'], '=='],
  [['does', 'not', 'equal', 'to'], '!='],
];
const EQUALITY = new Set(['==', '!=', '<>', '====', '!===', 'string==', 'string!=', 'string<>']);
const RELATIONAL = new Set([
  '<',
  '>',
  '<=',
  '>=',
  '<==',
  '>==',
  '<===',
  '>===',
  '!>',
  '!<',
  'string<',
  'string>',
  'string<=',
  'string>=',
]);
const ASSIGNMENTS = new Set(['=', '+=', '-=', '*=', '/=', '%=']);

class Parser {
  // names: the names with spaces ($Exchange Rate) that a source can use (the steps of its spreadsheet).
  constructor(source, { names = [] } = {}) {
    this.source = source;
    this.tokens = tokenize(source);
    this.index = 0;
    this.spaced = names.filter((name) => name.includes(' '));
  }

  peek(offset = 0) {
    return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)];
  }

  next() {
    const token = this.tokens[this.index];
    if (this.index < this.tokens.length - 1) this.index += 1;
    return token;
  }

  is(value, offset = 0) {
    const token = this.peek(offset);
    return token.type === 'operator' && token.value === value;
  }

  isWord(value, offset = 0) {
    const token = this.peek(offset);
    return token.type === 'name' && token.value === value;
  }

  accept(value) {
    if (this.is(value)) return this.next();
    return null;
  }

  expect(value) {
    if (!this.is(value)) this.fail(`Expected ${value}`);
    return this.next();
  }

  fail(message, token = this.peek()) {
    const found = token.type === 'end' ? 'the end' : `"${token.value}"`;
    throw new OpenLSyntaxError(`${message}, found ${found}`, this.source, token.at);
  }

  // A type: Name(.Name)*, generics skipped, [] each: { name, dims }; null if what follows is no type.
  tryType() {
    const start = this.index;
    const token = this.peek();
    if (token.type !== 'name') return null;
    let name = this.next().value;
    // (java.util.List: a package before the name.)
    while (this.is('.') && this.peek(1).type === 'name' && (/^[A-Z]/.test(this.peek(1).value) || this.is('.', 2))) {
      this.next();
      name += `.${this.next().value}`;
    }
    if (this.is('<') && !PRIMITIVES.has(name)) {
      // Generics (List<String>): skipped when they close.
      let depth = 0;
      const save = this.index;
      do {
        if (this.is('<')) depth += 1;
        else if (this.is('>')) depth -= 1;
        else if (this.is('>>')) depth -= 2;
        else if (this.peek().type !== 'name' && !this.is(',') && !this.is('[') && !this.is(']') && !this.is('?')) {
          this.index = save;
          break;
        }
        this.next();
      } while (depth > 0 && this.peek().type !== 'end');
      if (depth > 0) this.index = save;
    }
    let dims = 0;
    while (this.is('[') && this.is(']', 1)) {
      this.next();
      this.next();
      dims += 1;
    }
    if (!name) {
      this.index = start;
      return null;
    }
    return { name, dims };
  }

  // A whole source: one expression, or statements (a body of a method; a cell with ; or declarations).
  parseProgram() {
    if (this.looksLikeStatements()) {
      const body = [];
      while (this.peek().type !== 'end') body.push(this.parseStatement());
      return { type: 'Block', body, program: true };
    }
    let expression = this.parseExpression();
    // X - Y, where X - an expression, Y - another (the explanatory variables of BEX).
    if (this.is(',') && this.isWord('where', 1)) {
      this.next();
      this.next();
      const bindings = [];
      do {
        const name = this.next();
        if (name.type !== 'name') this.fail('Expected a name', name);
        this.expect('-');
        bindings.push({ name: name.value, value: this.parseConditional() });
      } while (this.accept(','));
      expression = { type: 'Let', bindings, body: expression };
    }
    this.accept(';');
    if (this.peek().type !== 'end') this.fail('Unexpected');
    return expression;
  }

  looksLikeStatements() {
    const values = this.tokens.map((token) => (token.type === 'name' || token.type === 'operator' ? token.value : ''));
    const first = this.tokens[0];
    if (
      first.type === 'name' &&
      ['if', 'for', 'while', 'do', 'return', 'switch', 'break', 'continue'].includes(first.value)
    )
      return true;
    const semicolons = values.filter((value) => value === ';').length;
    if (semicolons > 1 || (semicolons === 1 && values[values.length - 2] !== ';')) return true;
    // A declaration: Type name = ...
    const save = this.index;
    const type = this.tryType();
    const declaration = type && this.peek().type === 'name' && (this.is('=', 1) || this.is(';', 1));
    this.index = save;
    return Boolean(declaration);
  }

  parseStatement() {
    if (this.is('{')) return this.parseBlock();
    if (this.accept(';')) return { type: 'Empty' };
    const word = this.peek().type === 'name' ? this.peek().value : null;
    if (word === 'if') {
      this.next();
      this.expect('(');
      const test = this.parseExpression();
      this.expect(')');
      const then = this.parseStatement();
      let otherwise = null;
      if (this.isWord('else')) {
        this.next();
        otherwise = this.parseStatement();
      }
      return { type: 'If', test, then, otherwise };
    }
    if (word === 'while') {
      this.next();
      this.expect('(');
      const test = this.parseExpression();
      this.expect(')');
      return { type: 'While', test, body: this.parseStatement() };
    }
    if (word === 'do') {
      this.next();
      const body = this.parseStatement();
      if (!this.isWord('while')) this.fail('Expected while');
      this.next();
      this.expect('(');
      const test = this.parseExpression();
      this.expect(')');
      this.accept(';');
      return { type: 'DoWhile', test, body };
    }
    if (word === 'for') {
      this.next();
      this.expect('(');
      // for (Type x : list)
      const save = this.index;
      const type = this.tryType();
      if (type && this.peek().type === 'name' && this.is(':', 1)) {
        const name = this.next().value;
        this.next();
        const iterable = this.parseExpression();
        this.expect(')');
        return { type: 'ForEach', name, valueType: type, iterable, body: this.parseStatement() };
      }
      this.index = save;
      const init = this.is(';') ? null : this.parseSimpleStatement();
      this.expect(';');
      const test = this.is(';') ? null : this.parseExpression();
      this.expect(';');
      const update = [];
      while (!this.is(')')) {
        update.push(this.parseExpression());
        if (!this.accept(',')) break;
      }
      this.expect(')');
      return { type: 'For', init, test, update, body: this.parseStatement() };
    }
    if (word === 'return') {
      this.next();
      const argument = this.is(';') || this.peek().type === 'end' || this.is('}') ? null : this.parseExpression();
      this.accept(';');
      return { type: 'Return', argument };
    }
    if (word === 'break' || word === 'continue') {
      this.next();
      this.accept(';');
      return { type: word === 'break' ? 'Break' : 'Continue' };
    }
    const statement = this.parseSimpleStatement();
    if (!this.accept(';') && this.peek().type !== 'end' && !this.is('}')) this.fail('Expected ;');
    return statement;
  }

  // A declaration of variables (Type a = 1, b) or an expression.
  parseSimpleStatement() {
    const save = this.index;
    const type = this.tryType();
    if (
      type &&
      this.peek().type === 'name' &&
      (this.is('=', 1) || this.is(';', 1) || this.is(',', 1) || this.is(':', 1))
    ) {
      const declarations = [];
      do {
        const name = this.next().value;
        let init = null;
        if (this.accept('=')) init = this.is('{') ? this.parseArrayInit(type) : this.parseExpression();
        declarations.push({ name, init });
      } while (this.accept(','));
      return { type: 'Var', valueType: type, declarations };
    }
    this.index = save;
    return { type: 'Expression', expression: this.parseExpression() };
  }

  parseBlock() {
    this.expect('{');
    const body = [];
    while (!this.is('}')) {
      if (this.peek().type === 'end') this.fail('Expected }');
      body.push(this.parseStatement());
    }
    this.next();
    return { type: 'Block', body };
  }

  parseExpression() {
    return this.parseAssignment();
  }

  parseAssignment() {
    const left = this.parseConditional();
    const token = this.peek();
    if (token.type === 'operator' && ASSIGNMENTS.has(token.value)) {
      if (!['Name', 'Member', 'Index'].includes(left.type)) return left;
      this.next();
      return { type: 'Assign', operator: token.value, target: left, value: this.parseAssignment() };
    }
    return left;
  }

  parseConditional() {
    const test = this.parseOr();
    if (!this.accept('?')) return test;
    const then = this.parseAssignment();
    // (Without : the value is null when the test does not hold.)
    if (!this.accept(':'))
      return { type: 'Conditional', test, then, otherwise: { type: 'Literal', value: null, kind: 'null' } };
    return { type: 'Conditional', test, then, otherwise: this.parseAssignment() };
  }

  parseOr() {
    let left = this.parseAnd();
    while (this.is('||') || this.isWord('or')) {
      this.next();
      left = { type: 'Logical', operator: '||', left, right: this.parseAnd() };
    }
    return left;
  }

  parseAnd() {
    let left = this.parseBitOr();
    while (this.is('&&') || this.isWord('and')) {
      this.next();
      left = { type: 'Logical', operator: '&&', left, right: this.parseBitOr() };
    }
    return left;
  }

  parseBitOr() {
    let left = this.parseBitXor();
    while (this.is('|')) {
      this.next();
      left = { type: 'Binary', operator: '|', left, right: this.parseBitXor() };
    }
    return left;
  }

  parseBitXor() {
    let left = this.parseBitAnd();
    while (this.is('^')) {
      this.next();
      left = { type: 'Binary', operator: '^', left, right: this.parseBitAnd() };
    }
    return left;
  }

  parseBitAnd() {
    let left = this.parseEquality();
    while (this.is('&')) {
      this.next();
      left = { type: 'Binary', operator: '&', left, right: this.parseEquality() };
    }
    return left;
  }

  // A phrase of BEX at the tokens here: its operator (and the tokens taken), or null.
  phrase() {
    for (const [words, operator] of PHRASES) {
      if (words.every((word, i) => this.isWord(word, i))) {
        this.index += words.length;
        return operator;
      }
    }
    return null;
  }

  parseEquality() {
    let left = this.parseRelational();
    for (;;) {
      const token = this.peek();
      if (token.type === 'operator' && EQUALITY.has(token.value)) {
        this.next();
        left = {
          type: 'Binary',
          operator: token.value === '<>' ? '!=' : token.value,
          left,
          right: this.parseRelational(),
        };
        continue;
      }
      const save = this.index;
      const operator = this.phrase();
      if (operator === '==' || operator === '!=') {
        left = { type: 'Binary', operator, left, right: this.parseRelational() };
        continue;
      }
      this.index = save;
      return left;
    }
  }

  parseRelational() {
    let left = this.parseShift();
    for (;;) {
      const token = this.peek();
      if (token.type === 'operator' && RELATIONAL.has(token.value)) {
        this.next();
        const operator = token.value === '!>' ? '<=' : token.value === '!<' ? '>=' : token.value;
        left = { type: 'Binary', operator, left, right: this.parseShift() };
        continue;
      }
      if (this.isWord('instanceof')) {
        this.next();
        left = { type: 'InstanceOf', argument: left, valueType: this.tryType() };
        continue;
      }
      const save = this.index;
      const operator = this.phrase();
      if (operator && operator !== '==' && operator !== '!=') {
        left = { type: 'Binary', operator, left, right: this.parseShift() };
        continue;
      }
      this.index = save;
      return left;
    }
  }

  parseShift() {
    let left = this.parseAdditive();
    while (this.is('<<') || this.is('>>') || this.is('>>>')) {
      const operator = this.next().value;
      left = { type: 'Binary', operator, left, right: this.parseAdditive() };
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.is('+') || this.is('-')) {
      const operator = this.next().value;
      left = { type: 'Binary', operator, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parsePower();
    while (this.is('*') || this.is('/') || this.is('%')) {
      const operator = this.next().value;
      left = { type: 'Binary', operator, left, right: this.parsePower() };
    }
    return left;
  }

  // ** after unary minus, from left to right (as in Excel): -2 ** 2 is 4, 2 ** 3 ** 2 is 64.
  parsePower() {
    let left = this.parseUnary();
    while (this.is('**')) {
      this.next();
      left = { type: 'Binary', operator: '**', left, right: this.parseUnary() };
    }
    return left;
  }

  parseUnary() {
    if (this.is('-') || this.is('+') || this.is('!') || this.is('~')) {
      const operator = this.next().value;
      return { type: 'Unary', operator, argument: this.parseUnary() };
    }
    if (this.isWord('not')) {
      this.next();
      return { type: 'Unary', operator: '!', argument: this.parseUnary() };
    }
    if (this.is('++') || this.is('--')) {
      const operator = this.next().value;
      return { type: 'Update', operator, prefix: true, argument: this.parseUnary() };
    }
    // (Type) value
    if (this.is('(')) {
      const save = this.index;
      this.next();
      const type = this.tryType();
      if (type && this.is(')')) {
        const after = this.peek(1);
        const castable =
          after.type === 'number' ||
          after.type === 'string' ||
          after.type === 'char' ||
          (after.type === 'name' && !['and', 'or', 'instanceof'].includes(after.value)) ||
          (after.type === 'operator' && ['(', '!', '~'].includes(after.value)) ||
          (after.type === 'operator' &&
            ['-', '+'].includes(after.value) &&
            (PRIMITIVES.has(type.name) || /^[A-Z]/.test(type.name.split('.').pop())));
        if (castable && (PRIMITIVES.has(type.name) || /^[A-Z]/.test(type.name.split('.').pop()) || type.dims)) {
          this.next();
          return { type: 'Cast', valueType: type, argument: this.parseUnary() };
        }
      }
      this.index = save;
    }
    return this.parsePostfix(this.parsePrimary());
  }

  parsePostfix(node) {
    for (;;) {
      // field of the object (BEX): object.field.
      if (node.type === 'Name' && this.isWord('of') && this.isWord('the', 1) && this.peek(2).type === 'name') {
        this.index += 2;
        const object = this.parsePostfix(this.parsePrimary());
        node = { type: 'Member', object, name: node.name };
        continue;
      }
      if (this.is('.')) {
        this.next();
        const name = this.next();
        if (name.type !== 'name') this.fail('Expected a name after .', name);
        if (this.is('('))
          node = {
            type: 'Call',
            callee: { type: 'Member', object: node, name: name.value },
            args: this.parseArguments(),
          };
        else node = { type: 'Member', object: node, name: name.value };
      } else if (this.is('[')) {
        node = this.parseIndex(node);
      } else if (this.is('(') && node.type === 'Name') {
        node = { type: 'Call', callee: node, args: this.parseArguments() };
      } else if (this.is('++') || this.is('--')) {
        if (!['Name', 'Member', 'Index'].includes(node.type)) return node;
        node = { type: 'Update', operator: this.next().value, prefix: false, argument: node };
      } else return node;
    }
  }

  // arr[i], and the array operators: [select first|all having|where c], [@ c], [!@ c], [order (increasing|
  // decreasing)? by e], [^@ e], [v@ e], [split by e], [~@ e], [transform (unique)? to e], [*@ e], [*!@ e]; each
  // with a name of the element: [(x) select ...], [(Type x) ...].
  parseIndex(object) {
    this.expect('[');
    let variable = null;
    const save = this.index;
    if (this.is('(')) {
      this.next();
      const type = this.tryType();
      if (type && this.peek().type === 'name' && this.is(')', 1)) {
        variable = this.next().value;
        this.next();
      } else if (type && this.is(')') && !type.dims && /^[a-z]/.test(type.name)) {
        variable = type.name;
        this.next();
      } else this.index = save;
    }
    const operator = this.arrayOperator();
    if (!operator) {
      if (variable) this.index = save;
      const index = this.parseExpression();
      this.expect(']');
      return { type: 'Index', object, index };
    }
    const expression = this.parseExpression();
    this.expect(']');
    return { type: 'ArrayOperator', operator, object, variable, expression };
  }

  arrayOperator() {
    const words = (...list) => list.every((word, i) => this.isWord(word, i));
    const take = (count, operator) => {
      this.index += count;
      return operator;
    };
    if (words('select', 'first', 'having') || words('select', 'first', 'where')) return take(3, 'first');
    if (words('select', 'all', 'having') || words('select', 'all', 'where')) return take(3, 'all');
    if (words('order', 'increasing', 'by')) return take(3, 'order');
    if (words('order', 'decreasing', 'by')) return take(3, 'orderDesc');
    if (words('order', 'by')) return take(2, 'order');
    if (words('split', 'by')) return take(2, 'split');
    if (words('transform', 'unique', 'to')) return take(3, 'transformUnique');
    if (words('transform', 'to')) return take(2, 'transform');
    const symbols = {
      '!@': 'first',
      '@': 'all',
      '^@': 'order',
      'v@': 'orderDesc',
      '~@': 'split',
      '*@': 'transform',
      '*!@': 'transformUnique',
    };
    const token = this.peek();
    if (token.type === 'operator' && symbols[token.value]) return take(1, symbols[token.value]);
    return null;
  }

  parseArguments() {
    this.expect('(');
    const args = [];
    while (!this.is(')')) {
      // name = value: a named argument (of constructors of datatypes).
      if (this.peek().type === 'name' && this.is('=', 1) && !this.is('==', 1)) {
        const name = this.next().value;
        this.next();
        args.push({ type: 'Named', name, value: this.parseExpression() });
      } else args.push(this.is('{') ? this.parseArrayInit(null) : this.parseExpression());
      if (!this.accept(',')) break;
    }
    this.expect(')');
    return args;
  }

  // {a, b, c}: the elements of an array (of a type, when new gives it).
  parseArrayInit(elementType) {
    this.expect('{');
    const items = [];
    while (!this.is('}')) {
      items.push(this.is('{') ? this.parseArrayInit(null) : this.parseExpression());
      if (!this.accept(',')) break;
    }
    this.expect('}');
    return { type: 'ArrayInit', elementType, items };
  }

  parsePrimary() {
    const token = this.peek();
    if (token.type === 'number') {
      this.next();
      return { type: 'Literal', value: token.value, kind: token.kind };
    }
    if (token.type === 'string') {
      this.next();
      return { type: 'Literal', value: token.value, kind: 'String' };
    }
    if (token.type === 'char') {
      this.next();
      return { type: 'Literal', value: token.value, kind: 'char' };
    }
    if (this.is('(')) {
      this.next();
      const expression = this.parseExpression();
      this.expect(')');
      return expression;
    }
    if (this.is('{')) return this.parseArrayInit(null);
    if (token.type === 'name') {
      if (token.value === 'true' || token.value === 'false') {
        this.next();
        return { type: 'Literal', value: token.value === 'true', kind: 'boolean' };
      }
      if (token.value === 'null') {
        this.next();
        return { type: 'Literal', value: null, kind: 'null' };
      }
      if (token.value === 'new') return this.parseNew();
      this.next();
      let name = token.value;
      // $Name with spaces ($Exchange Rate), as long as it is one of the names given.
      if (name.startsWith('$') && this.spaced.length) {
        let joined = name;
        let taken = 0;
        let best = null;
        while (this.peek(taken).type === 'name') {
          joined += ` ${this.peek(taken).value}`;
          taken += 1;
          if (this.spaced.some((spaced) => `$${spaced}` === joined || joined.endsWith(`$${spaced}`)))
            best = { joined, taken };
          if (
            !this.spaced.some((spaced) => `$${spaced}`.startsWith(joined) || spaced.includes(joined.split('$').pop()))
          )
            break;
        }
        if (best) {
          this.index += best.taken;
          name = best.joined;
        }
      }
      // $First:$Last (written together): the values between two steps of a spreadsheet.
      if (
        name.startsWith('$') &&
        this.is(':') &&
        this.peek().at === token.at + name.length &&
        this.peek(1).type === 'name'
      ) {
        const colon = this.peek();
        const last = this.peek(1);
        if (last.value.startsWith('$') && last.at === colon.at + 1) {
          this.index += 2;
          return { type: 'Range', first: name, last: last.value };
        }
      }
      return { type: 'Name', name };
    }
    return this.fail('Unexpected');
  }

  // new Type(args), new Type(name = value...), new Type[n], new Type[] {a, b}, new Type[] {...}[i].
  parseNew() {
    this.next();
    const token = this.peek();
    if (token.type !== 'name') this.fail('Expected a type after new');
    let name = this.next().value;
    while (this.is('.') && this.peek(1).type === 'name') {
      this.next();
      name += `.${this.next().value}`;
    }
    if (this.is('<')) {
      let depth = 0;
      do {
        if (this.is('<')) depth += 1;
        else if (this.is('>')) depth -= 1;
        this.next();
      } while (depth > 0 && this.peek().type !== 'end');
    }
    if (this.is('[')) {
      const sizes = [];
      let dims = 0;
      while (this.is('[')) {
        this.next();
        sizes.push(this.is(']') ? null : this.parseExpression());
        this.expect(']');
        dims += 1;
      }
      const init = this.is('{') ? this.parseArrayInit({ name, dims: dims - 1 }) : null;
      return { type: 'NewArray', elementType: { name, dims: dims - 1 }, sizes, init };
    }
    return { type: 'New', valueType: { name, dims: 0 }, args: this.parseArguments() };
  }
}

// The tree of a source (an expression, or a block of statements).
function parse(source, options) {
  return new Parser(String(source), options).parseProgram();
}

export { parse, Parser, PRIMITIVES };
