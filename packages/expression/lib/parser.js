// The tree of an expression (nodes as those of ESTree: Literal, Identifier, MemberExpression...), by precedence
// climbing. Expressions only: no statements, assignments, `new`, `this`, functions other than arrow functions with an
// expression body, nor comments. With `statements`, the tree of a program: statements (declarations, if, loops,
// switch, return, throw, try, functions), assignments, ++ and --, delete, `new`, comments, destructuring, default and
// rest parameters, for...in, labels, sequences (a, b), void, instanceof, tagged templates and methods in objects;
// never `this`, classes, getters nor modules. Destructuring and default values are lowered here (see patterns.js).
import { tokenize } from './tokenizer.js';
import { ExpressionError } from './errors.js';
import { Lowering, patternNames } from './patterns.js';
import { FORBIDDEN } from './forbidden.js';

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
  // (Of programs only.)
  instanceof: 8,
});
const LOGICAL = new Set(['&&', '||', '??']);
const ASSIGN = new Set([
  '=',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '**=',
  '<<=',
  '>>=',
  '>>>=',
  '&=',
  '|=',
  '^=',
  '&&=',
  '||=',
  '??=',
]);
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
    this.statements = Boolean(options.statements);
    // (Shared with the parsers of the ${} of templates: names in between, and the functions they are declared in.)
    this.lowering = options.lowering ?? new Lowering();
    this.scopes = options.scopes ?? [[]];
    // (What this is where the parser is: { kind: program | function | method | constructor, static, derived }; arrow
    // functions have the this of where they are.)
    this.contexts = options.contexts ?? [{ kind: 'program' }];
    // (Where await can be: of each function, whether it is async; the program, at its top, and whether it is used.)
    this.awaits = options.awaits ?? [{ async: true, top: true, used: false }];
    // (The private names of the classes around: { id, names (name: kinds), uses (nodes of #names to resolve) }.)
    this.privates = options.privates ?? [];
    this.classes = options.classes ?? { count: 0 };
  }

  // A use of a #name (obj.#x, #x in obj): resolved to its class at the end of the class around.
  usePrivate(node, token) {
    if (!this.privates.length) throw this.error(`#${node.name} is not declared by a class around`, token);
    this.privates[this.privates.length - 1].uses.push({ node, token });
    return node;
  }

  // An async function (or not) around what is parsed by parse.
  withAwait(isAsync, parse, isGenerator = false) {
    this.awaits.push({ async: isAsync, generator: isGenerator });
    try {
      return parse();
    } finally {
      this.awaits.pop();
    }
  }

  // The context of this where the parser is.
  context() {
    return this.contexts[this.contexts.length - 1];
  }

  // this: of the methods, getters, setters, fields and constructors of classes (and methods of objects).
  parseThis(token) {
    this.next();
    const context = this.context();
    if (context.kind !== 'method' && context.kind !== 'constructor') {
      throw this.error('this is of the methods of classes and objects only', token);
    }
    // (In a constructor of a class that extends another: an error before super().)
    return {
      type: 'ThisExpression',
      checked: context.kind === 'constructor' && context.derived,
      start: token.start,
      end: token.end,
    };
  }

  // super(...) of a constructor of a class that extends another; super.name and super[key] of methods.
  parseSuper(token) {
    this.next();
    const context = this.context();
    if (this.is('(')) {
      if (context.kind !== 'constructor' || !context.derived) {
        throw this.error('super() is of the constructors of classes that extend another', token);
      }
      const args = this.parseArguments();
      return { type: 'SuperCall', arguments: args, start: token.start, end: this.last() };
    }
    if (context.kind !== 'method' && context.kind !== 'constructor') {
      throw this.error('super is of the methods of classes', token);
    }
    let property;
    let computed = false;
    if (this.is('.')) {
      this.next();
      const name = this.next();
      if (!name || name.type !== 'name') throw this.error('Expected a property name', name);
      property = name.value;
    } else if (this.is('[')) {
      this.next();
      property = this.parseExpression();
      this.expect(']');
      computed = true;
    } else throw this.error('Expected . or [ after super', token);
    return {
      type: 'SuperMember',
      property,
      computed,
      static: Boolean(context.static),
      start: token.start,
      end: this.last(),
    };
  }

  // A method (of a class or an object): a function of this, with its context.
  parseMethod(token, context, isAsync = false, isGenerator = false) {
    this.contexts.push(context);
    const { params, rest, body } = this.withAwait(
      isAsync,
      () => {
        const parsed = this.parseParams();
        this.scopes.push([]);
        const block = this.parseBlock();
        this.withPrologue(block, parsed.prologue, this.scopes.pop());
        return { ...parsed, body: block };
      },
      isGenerator
    );
    this.contexts.pop();
    return {
      type: 'ArrowFunctionExpression',
      method: true,
      ...(isAsync ? { async: true } : {}),
      ...(isGenerator ? { generator: true } : {}),
      params,
      ...(rest ? { rest } : {}),
      body,
      start: token.start,
      end: body.end,
    };
  }

  // class Name extends Base { constructor() {} method() {} get x() {} set x(v) {} static s() {} field = 1; }
  parseClass(declaration) {
    const token = this.next();
    let name = null;
    if (this.peek()?.type === 'name' && !this.isName('extends')) name = this.bindingName();
    if (declaration && !name) throw this.error('A class declaration needs a name', token);
    let superClass = null;
    if (this.isName('extends')) {
      this.next();
      superClass = this.parsePostfix(this.parsePrimary());
    }
    this.expect('{');
    const elements = [];
    this.classes.count += 1;
    const privateId = this.classes.count;
    // (The #names of the class: their kinds, for duplicates: a getter and a setter of one name are one.)
    const scope = { id: privateId, names: new Map(), uses: [] };
    this.privates.push(scope);
    const word = (value) => this.isName(value) && !['(', '=', ';', '}'].some((after) => this.is(after, 1));
    while (!this.is('}')) {
      if (!this.peek()) throw this.error('Expected }');
      if (this.is(';')) {
        this.next();
        continue;
      }
      const at = this.peek();
      let isStatic = false;
      if (word('static')) {
        this.next();
        isStatic = true;
        // static { ... }: run with the class as this, in its order among the static fields.
        if (this.is('{')) {
          this.contexts.push({ kind: 'method', static: true });
          this.scopes.push([]);
          const body = this.withAwait(false, () => this.parseBlock());
          this.withPrologue(body, [], this.scopes.pop());
          this.contexts.pop();
          const value = {
            type: 'ArrowFunctionExpression',
            method: true,
            params: [],
            body,
            start: at.start,
            end: body.end,
          };
          elements.push({
            kind: 'block',
            static: true,
            key: null,
            computed: false,
            value,
            start: at.start,
            end: body.end,
          });
          continue;
        }
      }
      let kind = 'method';
      let isAsync = false;
      if (word('async') && !this.peek(1)?.newline) {
        this.next();
        isAsync = true;
      } else if (word('get') || word('set')) kind = this.next().value;
      // *values() {}: a generator method.
      let isGenerator = false;
      if (this.is('*')) {
        if (kind !== 'method') throw this.error('A getter or setter cannot be a generator');
        this.next();
        isGenerator = true;
      }
      const keyToken = this.next();
      let key;
      let computed = false;
      if (keyToken && keyToken.type === 'punctuator' && keyToken.value === '[') {
        key = this.parseExpression();
        this.expect(']');
        computed = true;
      } else if (keyToken && (keyToken.type === 'name' || keyToken.type === 'string')) key = keyToken.value;
      else if (keyToken && keyToken.type === 'number') key = String(keyToken.value);
      else if (keyToken && keyToken.type !== 'private')
        throw this.error('Expected the name of a member of the class', keyToken);
      // #name: a private member.
      const isPrivate = keyToken.type === 'private';
      if (isPrivate) {
        key = keyToken.value;
        if (key === 'constructor') throw this.error('#constructor cannot be a member', keyToken);
        const kinds = scope.names.get(key) ?? [];
        const accessor = (one, other) =>
          kind === one && kinds.length === 1 && kinds[0].kind === other && kinds[0].static === isStatic;
        if (kinds.length && !accessor('get', 'set') && !accessor('set', 'get')) {
          throw this.error(`#${key} is declared once in a class`, keyToken);
        }
        kinds.push({ kind, static: isStatic });
        scope.names.set(key, kinds);
      }
      const isConstructor = !isPrivate && !isStatic && !computed && key === 'constructor';
      if (!computed && !isPrivate && !isConstructor && FORBIDDEN.has(key)) {
        throw this.error(`${key} cannot be a member of a class`, keyToken);
      }
      if (this.is('(')) {
        if (isConstructor && kind !== 'method') throw this.error('The constructor is a method', keyToken);
        if (isConstructor && elements.some((element) => element.kind === 'constructor')) {
          throw this.error('A class has one constructor', keyToken);
        }
        if (isConstructor && isAsync) throw this.error('The constructor cannot be async', keyToken);
        if (isConstructor && isGenerator) throw this.error('The constructor cannot be a generator', keyToken);
        const value = this.parseMethod(
          keyToken,
          isConstructor ? { kind: 'constructor', derived: Boolean(superClass) } : { kind: 'method', static: isStatic },
          isAsync,
          isGenerator
        );
        if (kind === 'get' && (value.params.length || value.rest))
          throw this.error('A getter takes no parameters', keyToken);
        if (kind === 'set' && (value.params.length !== 1 || value.rest))
          throw this.error('A setter takes one parameter', keyToken);
        // (A constructor takes the record of its construction first: what super() fills.)
        if (isConstructor) value.params = ['#ctor', ...value.params];
        elements.push({
          kind: isConstructor ? 'constructor' : kind,
          static: isStatic,
          key,
          computed,
          ...(isPrivate ? { private: true } : {}),
          value,
          start: at.start,
          end: this.last(),
        });
      } else {
        if (kind !== 'method' || isAsync || isGenerator) throw this.error('Expected ( of a method');
        if (isConstructor) throw this.error('constructor cannot be a field', keyToken);
        let value = null;
        if (this.is('=')) {
          this.next();
          // (The value of a field: a method of the instance, run for each.)
          this.contexts.push({ kind: 'method', static: isStatic });
          this.scopes.push([]);
          const expression = this.withAwait(false, () => this.parseExpression());
          const temps = this.scopes.pop();
          this.contexts.pop();
          const body = {
            type: 'BlockStatement',
            body: [{ type: 'ReturnStatement', argument: expression, start: expression.start, end: expression.end }],
            start: expression.start,
            end: expression.end,
          };
          this.withPrologue(body, [], temps);
          value = {
            type: 'ArrowFunctionExpression',
            method: true,
            params: [],
            body,
            start: expression.start,
            end: expression.end,
          };
        }
        if (!this.is('}')) this.endStatement();
        elements.push({
          kind: 'field',
          static: isStatic,
          key,
          computed,
          ...(isPrivate ? { private: true } : {}),
          value,
          start: at.start,
          end: this.last(),
        });
      }
    }
    this.expect('}');
    // (Its #names resolved: those it declares are of it; the others go to the class around, or are an error.)
    this.privates.pop();
    for (const use of scope.uses) {
      if (scope.names.has(use.node.name)) use.node.classId = privateId;
      else if (this.privates.length) this.privates[this.privates.length - 1].uses.push(use);
      else throw this.error(`#${use.node.name} is not declared by a class around`, use.token);
    }
    return {
      type: 'ClassExpression',
      id: name,
      superClass,
      body: elements,
      privateId,
      start: token.start,
      end: this.last(),
    };
  }

  // A name in between of an assignment of a pattern: declared in the function (or program) around.
  declareTemp(name) {
    this.scopes[this.scopes.length - 1].push(name);
  }

  // A sequence (a, b): of programs; an expression otherwise.
  parseSequence() {
    const first = this.parseExpression();
    if (!this.statements || !this.is(',')) return first;
    const expressions = [first];
    while (this.is(',')) {
      this.next();
      expressions.push(this.parseExpression());
    }
    return { type: 'SequenceExpression', expressions, start: first.start, end: this.last() };
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
    if (this.statements) return this.parseProgram();
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
    // yield, yield value, yield* iterable: of generators.
    if (this.statements && this.isName('yield')) {
      const around = this.awaits[this.awaits.length - 1];
      if (!around.generator) throw this.error('yield is of generators');
      const token = this.next();
      const delegate = this.is('*');
      if (delegate) this.next();
      const next = this.peek();
      const ends = !next || next.newline || [')', ']', '}', ',', ';', ':'].some((value) => this.is(value));
      const argument = ends && !delegate ? null : this.parseExpression();
      return { type: 'YieldExpression', argument, delegate, start: token.start, end: this.last() };
    }
    const test = this.parseBinary(0);
    if (this.statements && this.peek()?.type === 'punctuator' && ASSIGN.has(this.peek().value)) {
      const token = this.next();
      // [a, b] = [b, a], ({ x, y } = point): a pattern, lowered to assignments.
      if (
        token.value === '=' &&
        !test.parenthesized &&
        (test.type === 'ArrayExpression' || test.type === 'ObjectExpression')
      ) {
        const pattern = this.toPattern(test);
        const right = this.parseExpression();
        return this.lowering.assignment(pattern, right, (name) => this.declareTemp(name));
      }
      this.target(test, token);
      const right = this.parseExpression();
      return {
        type: 'AssignmentExpression',
        operator: token.value,
        left: test,
        right,
        start: test.start,
        end: right.end,
      };
    }
    if (!this.is('?')) return test;
    this.next();
    const consequent = this.parseExpression();
    this.expect(':');
    const alternate = this.parseExpression();
    return { type: 'ConditionalExpression', test, consequent, alternate, start: test.start, end: alternate.end };
  }

  // A pattern of an array or object written as an expression (of an assignment, a head of for...of).
  toPattern(node) {
    switch (node.type) {
      case 'Identifier':
        this.target(node, node);
        return node;
      case 'MemberExpression':
        return node;
      case 'AssignmentExpression':
        if (node.operator !== '=') throw this.error('Invalid destructuring target', node);
        return {
          type: 'AssignmentPattern',
          left: this.toPattern(node.left),
          right: node.right,
          start: node.start,
          end: node.end,
        };
      case 'ArrayExpression': {
        const elements = [];
        let rest = null;
        node.elements.forEach((element, i) => {
          if (element && element.type === 'SpreadElement') {
            if (i !== node.elements.length - 1) throw this.error('A rest element is the last one', element);
            rest = this.toPattern(element.argument);
          } else elements.push(element ? this.toPattern(element) : null);
        });
        return { type: 'ArrayPattern', elements, rest, start: node.start, end: node.end };
      }
      case 'ObjectExpression': {
        const properties = [];
        let rest = null;
        node.properties.forEach((property, i) => {
          if (property.type === 'SpreadElement') {
            if (i !== node.properties.length - 1) throw this.error('A rest element is the last one', property);
            rest = this.toPattern(property.argument);
            if (rest.type !== 'Identifier' && rest.type !== 'MemberExpression') {
              throw this.error('The rest of an object is a name or a member', property);
            }
          } else {
            properties.push({
              key: property.key,
              computed: property.computed,
              value: this.toPattern(property.value),
              start: property.value.start,
              end: property.value.end,
            });
          }
        });
        return { type: 'ObjectPattern', properties, rest, start: node.start, end: node.end };
      }
      default:
        throw this.error('Invalid destructuring target', node);
    }
  }

  // What can be assigned: a name or a member (not of an optional chain).
  target(node, token) {
    if (node.type === 'Identifier') {
      if (UNSUPPORTED.has(node.name) || node.name === 'undefined')
        throw this.error(`${node.name} cannot be assigned`, token);
      return;
    }
    if (node.type === 'MemberExpression' || node.type === 'PrivateMember') return;
    throw this.error('Only names and members can be assigned', token);
  }

  binaryOperator() {
    const token = this.peek();
    if (!token) return null;
    if (token.type === 'name' && token.value === 'in') return 'in';
    if (token.type === 'name' && token.value === 'instanceof' && this.statements) return 'instanceof';
    if (token.type !== 'punctuator' || !(token.value in BINARY)) return null;
    // With filters, | separates them.
    if (token.value === '|' && this.filters) return null;
    return token.value;
  }

  parseBinary(minPower) {
    let left = this.parseUnary();
    for (;;) {
      const operator = this.binaryOperator();
      // (#name is only of #name in object.)
      if (left.type === 'PrivateName' && operator !== 'in')
        throw this.error(`#${left.name} is only valid in #${left.name} in object`);
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
      // #name in object: the node of #name made so (it is the use resolved to its class).
      if (left.type === 'PrivateName') {
        left.type = 'PrivateIn';
        left.right = right;
        left.end = right.end;
        continue;
      }
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
      (token.type === 'punctuator' && UNARY.has(token.value)) ||
      (token.type === 'name' && (token.value === 'typeof' || (token.value === 'void' && this.statements)))
        ? token.value
        : null;
    if (operator) {
      this.next();
      const argument = this.parseUnary();
      if (this.is('**')) throw this.error('Use parentheses around a unary expression before **');
      return { type: 'UnaryExpression', operator, argument, start: token.start, end: argument.end };
    }
    if (token.type === 'punctuator' && (token.value === '++' || token.value === '--')) {
      if (!this.statements) throw this.error('Updates (++, --) are not allowed');
      this.next();
      const argument = this.parseUnary();
      this.target(argument, token);
      return {
        type: 'UpdateExpression',
        operator: token.value,
        prefix: true,
        argument,
        start: token.start,
        end: argument.end,
      };
    }
    if (this.statements && token.type === 'name' && token.value === 'await') {
      const around = this.awaits[this.awaits.length - 1];
      if (!around.async) throw this.error('await is of async functions and of the top of programs', token);
      if (around.top) around.used = true;
      this.next();
      const argument = this.parseUnary();
      return { type: 'AwaitExpression', argument, start: token.start, end: argument.end };
    }
    if (this.statements && token.type === 'name' && token.value === 'delete') {
      this.next();
      const argument = this.parseUnary();
      if (argument.type !== 'MemberExpression') throw this.error('delete takes a member', token);
      return { type: 'UnaryExpression', operator: 'delete', argument, start: token.start, end: argument.end };
    }
    const node = this.parsePostfix(this.parsePrimary());
    const after = this.peek();
    if (
      this.statements &&
      after &&
      !after.newline &&
      after.type === 'punctuator' &&
      (after.value === '++' || after.value === '--')
    ) {
      this.next();
      this.target(node, after);
      return {
        type: 'UpdateExpression',
        operator: after.value,
        prefix: false,
        argument: node,
        start: node.start,
        end: after.end,
      };
    }
    return node;
  }

  // Members, calls and optional chains: a chain with ?. is wrapped in a ChainExpression, where it ends.
  parsePostfix(base) {
    let node = base;
    let optional = false;
    for (;;) {
      if (this.is('.')) {
        this.next();
        const name = this.next();
        if (name && name.type === 'private' && this.statements) {
          // object.#name: a private member of the class around.
          node = this.usePrivate({ type: 'PrivateMember', object: node, name: name.value }, name);
        } else {
          if (!name || name.type !== 'name') throw this.error('Expected a property name', name);
          node = { type: 'MemberExpression', object: node, property: name.value, computed: false, optional: false };
        }
      } else if (this.is('?.')) {
        this.next();
        optional = true;
        if (this.peek()?.type === 'private' && this.statements) {
          // object?.#name: undefined (the rest of the chain too) of null and undefined.
          const name = this.next();
          node = this.usePrivate({ type: 'PrivateMember', object: node, name: name.value, optional: true }, name);
          node.start = base.start;
          node.end = this.last();
          continue;
        }
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
        if (!this.statements) throw this.error('Tagged templates are not allowed');
        // tag`a${x}b`: a call of the tag with the texts (an array of them, with raw) and the values.
        const token = this.next();
        const strings = {
          type: 'TemplateStrings',
          cooked: token.quasis,
          raw: token.raws,
          start: token.start,
          end: token.end,
        };
        node = {
          type: 'CallExpression',
          callee: node,
          arguments: [strings, ...this.templateExpressions(token)],
          optional: false,
        };
      } else break;
      node.start = base.start;
      node.end = this.last();
    }
    return optional ? { type: 'ChainExpression', expression: node, start: node.start, end: node.end } : node;
  }

  // The expressions of the ${} of a template.
  templateExpressions(token) {
    return token.expressions.map((part) => {
      const parser = new Parser(this.source, part.tokens, {
        statements: this.statements,
        lowering: this.lowering,
        scopes: this.scopes,
        contexts: this.contexts,
        awaits: this.awaits,
        privates: this.privates,
        classes: this.classes,
      });
      if (part.tokens.length === 0) throw this.error('Empty ${} in a template literal', token);
      const node = parser.parseSequence();
      if (parser.index < part.tokens.length) throw parser.error(`Unexpected ${describe(parser.peek())}`);
      return node;
    });
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
    if (token.type === 'regex') {
      this.next();
      const regex = { pattern: token.pattern, flags: token.flags };
      return { type: 'Literal', value: null, regex, start: token.start, end: token.end };
    }
    if (token.type === 'private' && this.statements) {
      this.next();
      return this.usePrivate({ type: 'PrivateName', name: token.value, start: token.start, end: token.end }, token);
    }
    if (token.type === 'template') {
      this.next();
      const expressions = this.templateExpressions(token);
      return { type: 'TemplateLiteral', quasis: token.quasis, expressions, start: token.start, end: token.end };
    }
    if (token.type === 'name') {
      if (this.statements && token.value === 'new') return this.parseNew();
      if (this.statements && token.value === 'function') return this.parseFunction(false);
      if (this.statements && token.value === 'this') return this.parseThis(token);
      if (this.statements && token.value === 'super') return this.parseSuper(token);
      if (this.statements && token.value === 'class') return this.parseClass(false);
      // async function () {}, async (a) => ..., async a => ... (else a name async).
      if (this.statements && token.value === 'async' && !this.peek(1)?.newline) {
        if (this.isName('function', 1)) {
          this.next();
          return this.parseFunction(false, true);
        }
        if (this.peek(1)?.type === 'name' && this.is('=>', 2)) {
          this.next();
          const name = this.next();
          return this.parseArrow({ params: [name.value], rest: null, prologue: [] }, token, true);
        }
        if (this.is('(', 1)) {
          const saved = this.index;
          this.next();
          const params = this.tryParams();
          if (params) return this.parseArrow(params, token, true);
          this.index = saved;
        }
      }
      if (UNSUPPORTED.has(token.value)) throw this.error(`${token.value} is not allowed in expressions`);
      // x => body
      if (this.is('=>', 1)) {
        this.next();
        return this.parseArrow({ params: [token.value], rest: null, prologue: [] }, token);
      }
      this.next();
      if (token.value in LITERALS) {
        return { type: 'Literal', value: LITERALS[token.value], start: token.start, end: token.end };
      }
      return { type: 'Identifier', name: token.value, start: token.start, end: token.end };
    }
    if (this.is('(')) {
      if (this.statements) {
        const params = this.tryParams();
        if (params) return this.parseArrow(params, token);
      } else {
        const params = this.arrowParams();
        if (params) return this.parseArrow({ params, rest: null, prologue: [] }, token);
      }
      this.next();
      // With filters, (value | filter) too.
      const node = this.filters ? this.parseFiltered() : this.parseSequence();
      this.expect(')');
      return { ...node, parenthesized: true };
    }
    if (this.is('[')) {
      this.next();
      const elements = [];
      while (!this.is(']')) {
        if (this.is(',')) {
          // (Holes: in patterns of programs only; the compilers refuse them in arrays.)
          if (!this.statements) throw this.error('Holes in arrays are not allowed');
          this.next();
          elements.push(null);
          continue;
        }
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

  // (a, b = 1, { c }, ...rest) => body: params (names; patterns as names in between), rest, and a prologue (defaults,
  // patterns) that goes first in the body (an expression becomes a body of statements that returns it).
  parseArrow({ params, rest, prologue }, start, isAsync = false) {
    this.expect('=>');
    return this.withAwait(isAsync, () => this.arrowBody({ params, rest, prologue }, start, isAsync));
  }

  arrowBody({ params, rest, prologue }, start, isAsync) {
    params.forEach((name, i) => {
      if (UNSUPPORTED.has(name) || name in LITERALS) throw this.error(`${name} cannot be a parameter`, start);
      if (params.indexOf(name) !== i) throw this.error(`Duplicate parameter ${name}`, start);
    });
    const node = {
      type: 'ArrowFunctionExpression',
      params,
      ...(rest ? { rest } : {}),
      ...(isAsync ? { async: true } : {}),
      start: start.start,
    };
    this.scopes.push([]);
    if (this.is('{')) {
      // { ... } after => is a body of statements in JavaScript; an object needs parentheses.
      if (!this.statements) throw this.error('Arrow functions take an expression: wrap an object in parentheses');
      const body = this.parseBlock();
      this.withPrologue(body, prologue, this.scopes.pop());
      return { ...node, body, end: body.end };
    }
    const expression = this.parseExpression();
    const temps = this.scopes.pop();
    if (prologue.length === 0 && temps.length === 0) return { ...node, body: expression, end: expression.end };
    const body = {
      type: 'BlockStatement',
      body: [{ type: 'ReturnStatement', argument: expression, start: expression.start, end: expression.end }],
      start: expression.start,
      end: expression.end,
    };
    this.withPrologue(body, prologue, temps);
    return { ...node, body, end: expression.end };
  }

  // A body with its prologue first, and the names in between of its assignments of patterns declared before it.
  withPrologue(block, prologue, temps) {
    const declared = temps.length
      ? [
          {
            type: 'VariableDeclaration',
            kind: 'let',
            declarations: temps.map((name) => ({
              type: 'VariableDeclarator',
              id: name,
              init: null,
              start: block.start,
              end: block.start,
            })),
            start: block.start,
            end: block.start,
          },
        ]
      : [];
    block.body = [...declared, ...prologue, ...block.body];
    return block;
  }

  // The parameters of an arrow function when what starts here (a parenthesis) is one, or null (and nothing read).
  tryParams() {
    const saved = this.index;
    try {
      const params = this.parseParams();
      if (this.is('=>')) return params;
    } catch (err) {
      if (!(err instanceof ExpressionError)) throw err;
    }
    this.index = saved;
    return null;
  }

  // (a, b = 1, { c, d }, [e], ...rest): { params, rest, prologue }.
  parseParams() {
    this.expect('(');
    const params = [];
    const prologue = [];
    let rest = null;
    const names = [];
    const add = (pattern, at) => {
      for (const name of patternNames(pattern)) {
        if (names.includes(name)) throw this.error(`Duplicate parameter ${name}`, at);
        names.push(name);
      }
    };
    while (!this.is(')')) {
      const at = this.peek();
      if (this.is('...')) {
        this.next();
        const target = this.parseBindingTarget();
        add(target, at);
        if (target.type === 'Identifier') rest = target.name;
        else {
          const held = this.lowering.temp(target);
          rest = held.name;
          prologue.push(this.declaration('let', this.lowering.declarators(target, held), target));
        }
        if (!this.is(')')) throw this.error('A rest parameter is the last one');
        break;
      }
      const element = this.parseBindingElement();
      add(element, at);
      if (element.type === 'Identifier') params.push(element.name);
      else if (element.type === 'AssignmentPattern' && element.left.type === 'Identifier') {
        params.push(element.left.name);
        prologue.push(this.defaultParameter(element));
      } else {
        const held = this.lowering.temp(element);
        params.push(held.name);
        prologue.push(this.declaration('let', this.lowering.declarators(element, held), element));
      }
      if (!this.is(')')) this.expect(',');
    }
    this.expect(')');
    return { params, rest, prologue };
  }

  // if (name === undefined) name = value: a default of a parameter.
  defaultParameter({ left, right, start, end }) {
    const name = { type: 'Identifier', name: left.name, start: left.start, end: left.end };
    return {
      type: 'IfStatement',
      test: {
        type: 'BinaryExpression',
        operator: '===',
        left: name,
        right: { type: 'Identifier', name: 'undefined', start, end },
        start,
        end,
      },
      consequent: {
        type: 'ExpressionStatement',
        expression: { type: 'AssignmentExpression', operator: '=', left: name, right, start, end },
        start,
        end,
      },
      alternate: null,
      start,
      end,
    };
  }

  declaration(kind, declarations, from) {
    return { type: 'VariableDeclaration', kind, declarations, start: from.start, end: from.end };
  }

  // A target of a binding: a name, or a pattern of an array or an object.
  parseBindingTarget() {
    if (this.is('[')) return this.parseArrayPattern();
    if (this.is('{')) return this.parseObjectPattern();
    const token = this.peek();
    const name = this.bindingName();
    return { type: 'Identifier', name, start: token.start, end: token.end };
  }

  // A target with its default: a = 1, { b } = {}.
  parseBindingElement() {
    const target = this.parseBindingTarget();
    if (!this.is('=')) return target;
    this.next();
    const right = this.parseExpression();
    return { type: 'AssignmentPattern', left: target, right, start: target.start, end: right.end };
  }

  parseArrayPattern() {
    const open = this.expect('[');
    const elements = [];
    let rest = null;
    while (!this.is(']')) {
      if (this.is(',')) {
        this.next();
        elements.push(null);
        continue;
      }
      if (this.is('...')) {
        this.next();
        rest = this.parseBindingTarget();
        if (!this.is(']')) throw this.error('A rest element is the last one');
        break;
      }
      elements.push(this.parseBindingElement());
      if (!this.is(']')) this.expect(',');
    }
    this.expect(']');
    return { type: 'ArrayPattern', elements, rest, start: open.start, end: this.last() };
  }

  parseObjectPattern() {
    const open = this.expect('{');
    const properties = [];
    let rest = null;
    while (!this.is('}')) {
      if (this.is('...')) {
        this.next();
        const at = this.peek();
        rest = { type: 'Identifier', name: this.bindingName(), start: at.start, end: at.end };
        if (!this.is('}')) throw this.error('A rest element is the last one');
        break;
      }
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
      let value;
      if (this.is(':')) {
        this.next();
        value = this.parseBindingElement();
      } else if (token.type === 'name' && !computed) {
        // { a }, { a = 1 }: the name of the key.
        this.index -= 1;
        value = this.parseBindingTarget();
        if (this.is('=')) {
          this.next();
          const right = this.parseExpression();
          value = { type: 'AssignmentPattern', left: value, right, start: value.start, end: right.end };
        }
      } else this.expect(':');
      properties.push({ key, computed, value, start: token.start, end: this.last() });
      if (!this.is('}')) this.expect(',');
    }
    this.expect('}');
    return { type: 'ObjectPattern', properties, rest, start: open.start, end: this.last() };
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
        // { get total() {...}, set total(v) {...} }: accessors (of programs).
        let accessor = null;
        let isAsync = false;
        const prefix = (word) =>
          this.statements && this.isName(word) && ![':', '(', ',', '}', '='].some((after) => this.is(after, 1));
        if (prefix('async') && !this.peek(1)?.newline) {
          this.next();
          isAsync = true;
        } else if (prefix('get') || prefix('set')) {
          accessor = this.next().value;
        }
        // { *values() {} }: a generator method.
        let isGenerator = false;
        if (this.statements && !accessor && this.is('*')) {
          this.next();
          isGenerator = true;
        }
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
        if (isAsync || isGenerator) {
          if (!this.is('(')) throw this.error('Expected ( of a method');
          const value = this.parseMethod(token, { kind: 'method' }, isAsync, isGenerator);
          properties.push({ type: 'Property', key, computed, value, shorthand: false });
        } else if (accessor) {
          if (!this.is('(')) throw this.error(`Expected ( of a ${accessor === 'get' ? 'getter' : 'setter'}`);
          const value = this.parseMethod(token, { kind: 'method' });
          if (accessor === 'get' && (value.params.length || value.rest))
            throw this.error('A getter takes no parameters', token);
          if (accessor === 'set' && (value.params.length !== 1 || value.rest))
            throw this.error('A setter takes one parameter', token);
          properties.push({ type: 'Property', kind: accessor, key, computed, value, shorthand: false });
        } else if (this.is(':')) {
          this.next();
          properties.push({ type: 'Property', key, computed, value: this.parseExpression(), shorthand: false });
        } else if (this.statements && token.type === 'name' && !computed && this.is('=')) {
          // { a = 1 }: only as a pattern (of an assignment); the compilers refuse it in objects.
          this.next();
          const right = this.parseExpression();
          const left = { type: 'Identifier', name: key, start: token.start, end: token.end };
          properties.push({
            type: 'Property',
            key,
            computed: false,
            value: {
              type: 'AssignmentExpression',
              operator: '=',
              left,
              right,
              coverInit: true,
              start: token.start,
              end: right.end,
            },
            shorthand: true,
          });
        } else if (this.statements && this.is('(')) {
          // { total(a) { ... } }: a method (this: the object it is called on).
          const value = this.parseMethod(token, { kind: 'method' });
          properties.push({ type: 'Property', key, computed, value, shorthand: false });
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

  // Programs: statements, and the value of the last one run (or of a return).

  parseProgram() {
    const body = [];
    // (import and export: of the top of a program. Imports go first: what they bind is there from its start.)
    const imports = [];
    const exports = [];
    while (this.index < this.tokens.length) {
      if (this.isName('import') && !this.is('(', 1) && !this.is('.', 1)) imports.push(this.parseImport());
      else if (this.isName('export')) body.push(...this.parseExport(exports));
      else body.push(this.parseStatement());
    }
    const program = { type: 'Program', body: [...imports, ...body], start: 0, end: this.source.length };
    if (this.awaits[0].used) program.async = true;
    if (exports.length) {
      // A module: what it exports given by a return of them (no return of its own; no await at its top).
      if (this.topReturn)
        throw this.error('A module (a program that exports) has no return of its own', this.topReturn);
      if (program.async) throw this.error('A module cannot await at its top');
      const declared = new Set();
      for (const statement of program.body) {
        if (statement.type === 'VariableDeclaration') for (const d of statement.declarations) declared.add(d.id);
        if (statement.type === 'FunctionDeclaration') declared.add(statement.id);
      }
      for (const { local, token } of exports) {
        if (!declared.has(local))
          throw this.error(`${local} is exported but not declared at the top of the module`, token);
      }
      const properties = exports.map(({ local, exported, token }) => ({
        type: 'Property',
        key: exported,
        computed: false,
        value: { type: 'Identifier', name: local, start: token.start, end: token.end },
        shorthand: false,
      }));
      const object = { type: 'ObjectExpression', properties, start: 0, end: 0 };
      const value = { type: 'Intrinsic', name: 'moduleExports', arguments: [object], start: 0, end: 0 };
      program.body.push({
        type: 'ReturnStatement',
        argument: value,
        start: this.source.length,
        end: this.source.length,
      });
      program.module = true;
    }
    return this.withPrologue(program, [], this.scopes[0]);
  }

  // import x from 'm', import { a, b as c } from 'm', import * as ns from 'm', import 'm': a declaration of constants
  // of the module (ImportModule: what the engine's modules give) and of its exports (importBinding: each checked).
  parseImport() {
    const token = this.next();
    let defaultName = null;
    let namespace = null;
    const named = [];
    const local = () => {
      const at = this.peek();
      return { name: this.bindingName(), at };
    };
    if (this.peek()?.type !== 'string') {
      if (this.peek()?.type === 'name' && !this.is('{')) {
        defaultName = local();
        if (this.is(',')) this.next();
      }
      if (this.is('*')) {
        this.next();
        if (!this.isName('as')) throw this.error('Expected as after import *');
        this.next();
        namespace = local();
      } else if (this.is('{')) {
        this.next();
        while (!this.is('}')) {
          const imported = this.next();
          if (!imported || (imported.type !== 'name' && imported.type !== 'string')) {
            throw this.error('Expected the name of an export', imported);
          }
          let binding;
          if (this.isName('as')) {
            this.next();
            binding = local();
          } else {
            this.index -= 1;
            binding = local();
          }
          named.push({ imported: imported.value, ...binding });
          if (!this.is('}')) this.expect(',');
        }
        this.expect('}');
      }
      if (!this.isName('from')) throw this.error('Expected from of an import');
      this.next();
    }
    const specifier = this.next();
    if (!specifier || specifier.type !== 'string')
      throw this.error('Expected the name of a module (a string)', specifier);
    this.endStatement();
    const held = this.lowering.temp(specifier);
    const binding = (name, imported, at) => ({
      type: 'VariableDeclarator',
      id: name,
      init: {
        type: 'Intrinsic',
        name: 'importBinding',
        arguments: [held, { type: 'Literal', value: imported, start: at.start, end: at.end }],
        start: at.start,
        end: at.end,
      },
      start: at.start,
      end: at.end,
    });
    const declarations = [
      {
        type: 'VariableDeclarator',
        id: held.name,
        init: { type: 'ImportModule', source: specifier.value, start: specifier.start, end: specifier.end },
        start: specifier.start,
        end: specifier.end,
      },
    ];
    if (defaultName) declarations.push(binding(defaultName.name, 'default', defaultName.at));
    if (namespace) {
      declarations.push({
        type: 'VariableDeclarator',
        id: namespace.name,
        init: held,
        start: namespace.at.start,
        end: namespace.at.end,
      });
    }
    for (const item of named) declarations.push(binding(item.name, item.imported, item.at));
    return { type: 'VariableDeclaration', kind: 'const', declarations, start: token.start, end: this.last() };
  }

  // export const a = 1, export function f() {}, export class C {}, export { a, b as c }, export default value: the
  // statements, and what they export (a name of the module and the name it is exported by) added to exports.
  parseExport(exports) {
    const token = this.next();
    const add = (local, exported, at) => {
      if (FORBIDDEN.has(exported)) throw this.error(`${exported} cannot be exported`, at);
      if (exports.some((item) => item.exported === exported)) throw this.error(`${exported} is exported twice`, at);
      exports.push({ local, exported, token: at });
    };
    if (this.isName('default')) {
      const at = this.next();
      const declares =
        (this.isName('function') && (this.peek(1)?.type === 'name' || this.is('*', 1))) ||
        (this.isName('class') && this.peek(1)?.type === 'name' && !this.isName('extends', 1)) ||
        (this.isName('async') && this.isName('function', 1));
      if (declares) {
        const statement = this.parseStatement();
        const name = statement.type === 'FunctionDeclaration' ? statement.id : statement.declarations[0].id;
        add(name, 'default', at);
        return [statement];
      }
      const value = this.parseExpression();
      this.endStatement();
      const held = this.lowering.temp(value);
      add(held.name, 'default', at);
      return [
        this.declaration(
          'const',
          [{ type: 'VariableDeclarator', id: held.name, init: value, start: value.start, end: value.end }],
          value
        ),
      ];
    }
    if (this.is('{')) {
      this.next();
      while (!this.is('}')) {
        const at = this.next();
        if (!at || at.type !== 'name') throw this.error('Expected a name to export', at);
        let exported = at.value;
        if (this.isName('as')) {
          this.next();
          const name = this.next();
          if (!name || (name.type !== 'name' && name.type !== 'string')) throw this.error('Expected a name', name);
          exported = name.value;
        }
        add(at.value, exported, at);
        if (!this.is('}')) this.expect(',');
      }
      this.expect('}');
      if (this.isName('from')) throw this.error('Exports of other modules (export ... from) are not supported');
      this.endStatement();
      return [];
    }
    if (this.is('*')) throw this.error('Exports of other modules (export * from) are not supported');
    const statement = this.parseStatement();
    if (statement.type === 'FunctionDeclaration') add(statement.id, statement.id, token);
    else if (statement.type === 'VariableDeclaration') {
      // (Names of patterns too; not those in between.)
      for (const declarator of statement.declarations) {
        if (!declarator.id.startsWith('#')) add(declarator.id, declarator.id, token);
      }
    } else throw this.error('export takes a declaration, a list of names or default', token);
    return [statement];
  }

  // The end of a statement: its ;, or a line end, a } or the end of the source before what follows.
  endStatement() {
    if (this.is(';')) {
      this.next();
      return;
    }
    const token = this.peek();
    if (!token || token.newline || this.is('}')) return;
    throw this.error(`Expected ; but found ${describe(token)}`);
  }

  // A name of a declaration or a parameter.
  bindingName() {
    const token = this.next();
    if (token && token.type === 'punctuator' && (token.value === '{' || token.value === '[')) {
      throw this.error('Destructuring is not supported here', token);
    }
    if (!token || token.type !== 'name') throw this.error('Expected a name', token);
    if (UNSUPPORTED.has(token.value) || token.value in LITERALS || token.value === 'undefined') {
      throw this.error(`${token.value} cannot be a name`, token);
    }
    return token.value;
  }

  parseStatement() {
    const token = this.peek();
    if (this.is(';')) {
      this.next();
      return { type: 'EmptyStatement', start: token.start, end: token.end };
    }
    if (this.is('{')) return this.parseBlock();
    if (token.type === 'name') {
      switch (token.value) {
        case 'let':
        case 'const':
        case 'var': {
          const node = this.parseDeclaration();
          this.endStatement();
          return node;
        }
        case 'function':
          // (function name() {}, function* name() {}: declarations.)
          if (this.peek(1)?.type === 'name' || (this.is('*', 1) && this.peek(2)?.type === 'name')) {
            return this.parseFunction(true);
          }
          break;
        case 'if':
          return this.parseIf();
        case 'for':
          return this.parseFor();
        case 'while': {
          this.next();
          const test = this.parseParenthesized();
          const body = this.parseStatement();
          return { type: 'WhileStatement', test, body, start: token.start, end: body.end };
        }
        case 'do': {
          this.next();
          const body = this.parseStatement();
          if (!this.isName('while')) throw this.error('Expected while');
          this.next();
          const test = this.parseParenthesized();
          if (this.is(';')) this.next();
          return { type: 'DoWhileStatement', test, body, start: token.start, end: this.last() };
        }
        case 'return': {
          // (A return of the program itself, not of a function: none in modules.)
          if (this.awaits.length === 1) this.topReturn ??= token;
          this.next();
          const next = this.peek();
          const argument = !next || next.newline || this.is(';') || this.is('}') ? null : this.parseSequence();
          this.endStatement();
          return { type: 'ReturnStatement', argument, start: token.start, end: this.last() };
        }
        case 'break':
        case 'continue': {
          this.next();
          const label = this.peek()?.type === 'name' && !this.peek().newline ? this.next().value : null;
          this.endStatement();
          const type = token.value === 'break' ? 'BreakStatement' : 'ContinueStatement';
          return { type, label, start: token.start, end: this.last() };
        }
        case 'throw': {
          this.next();
          if (!this.peek() || this.peek().newline) throw this.error('Expected what is thrown on the line of throw');
          const argument = this.parseSequence();
          this.endStatement();
          return { type: 'ThrowStatement', argument, start: token.start, end: this.last() };
        }
        case 'try':
          return this.parseTry();
        case 'switch':
          return this.parseSwitch();
        case 'class': {
          // class Name {...}: let Name = class Name {...}.
          const node = this.parseClass(true);
          const declarator = { type: 'VariableDeclarator', id: node.id, init: node, start: node.start, end: node.end };
          return {
            type: 'VariableDeclaration',
            kind: 'let',
            declarations: [declarator],
            start: node.start,
            end: node.end,
          };
        }
        case 'import':
        case 'export':
          throw this.error(`${token.value} is of the top of a program`);
        case 'with':
        case 'debugger':
          throw this.error(`${token.value} is not supported`);
        case 'async':
          if (this.isName('function', 1) && !this.peek(1).newline) {
            this.next();
            return this.parseFunction(true, true);
          }
          break;
        default:
          if (this.is(':', 1)) {
            // label: statement (a { that starts a statement is a block: { a: 1 } is no object).
            const block = this.tokens[this.index - 1]?.value === '{';
            const label = this.bindingName();
            this.next();
            const body = this.parseStatement();
            if (block && body.type === 'ExpressionStatement') {
              throw this.error(
                'A { that starts a statement is a block: wrap an object in parentheses, ({ a: 1 })',
                token
              );
            }
            return { type: 'LabeledStatement', label, body, start: token.start, end: body.end };
          }
      }
    }
    const expression = this.parseSequence();
    this.endStatement();
    return { type: 'ExpressionStatement', expression, start: token.start, end: this.last() };
  }

  parseParenthesized() {
    this.expect('(');
    const node = this.parseSequence();
    this.expect(')');
    return node;
  }

  parseBlock() {
    const open = this.expect('{');
    const body = [];
    while (!this.is('}')) {
      if (!this.peek()) throw this.error('Expected }');
      body.push(this.parseStatement());
    }
    this.expect('}');
    return { type: 'BlockStatement', body, start: open.start, end: this.last() };
  }

  // let a = 1, b; (const needs its value, but in for...of).
  parseDeclaration() {
    const token = this.next();
    const kind = token.value;
    const declarations = [];
    for (;;) {
      const nameToken = this.peek();
      const target = this.parseBindingTarget();
      let init = null;
      if (this.is('=')) {
        this.next();
        init = this.parseExpression();
      } else if (kind === 'const' || target.type !== 'Identifier') {
        throw this.error(target.type === 'Identifier' ? 'const needs a value' : 'A pattern needs a value', nameToken);
      }
      if (target.type === 'Identifier') {
        declarations.push({
          type: 'VariableDeclarator',
          id: target.name,
          init,
          start: nameToken.start,
          end: this.last(),
        });
      } else declarations.push(...this.lowering.declarators(target, init));
      if (!this.is(',')) break;
      this.next();
    }
    return { type: 'VariableDeclaration', kind, declarations, start: token.start, end: this.last() };
  }

  parseIf() {
    const token = this.next();
    const test = this.parseParenthesized();
    const consequent = this.parseStatement();
    let alternate = null;
    if (this.isName('else')) {
      this.next();
      alternate = this.parseStatement();
    }
    return { type: 'IfStatement', test, consequent, alternate, start: token.start, end: this.last() };
  }

  parseFor() {
    const token = this.next();
    // for await (... of ...): of async functions (and of the top of programs).
    let isAwait = false;
    if (this.isName('await')) {
      const around = this.awaits[this.awaits.length - 1];
      if (!around.async) throw this.error('for await is of async functions and of the top of programs');
      if (around.top) around.used = true;
      this.next();
      isAwait = true;
    }
    this.expect('(');
    // (Of for...of only: the loops below are told by forAwait.)
    this.forAwait = isAwait;
    let init = null;
    const declares = this.isName('let') || this.isName('const') || this.isName('var');
    // for (const item of list), for (const [key, value] of map), for (const key in object): a declaration first.
    if (declares) {
      const saved = this.index;
      const kind = this.next().value;
      const target = this.parseBindingTarget();
      if (this.isName('of') || this.isName('in')) {
        const isIn = this.next().value === 'in';
        return this.forEach(token, { kind, target }, isIn ? this.parseSequence() : this.parseExpression(), isIn);
      }
      this.index = saved;
    } else if (this.peek()?.type === 'name' && this.isName('of', 1)) {
      // for (item of list)
      const nameToken = this.next();
      const target = { type: 'Identifier', name: nameToken.value, start: nameToken.start, end: nameToken.end };
      this.target(target, nameToken);
      this.next();
      return this.forEach(token, { kind: null, target }, this.parseExpression(), false);
    } else if (this.is('[') || this.is('{')) {
      // for ([a, b] of pairs)
      const saved = this.index;
      const head = this.parsePostfix(this.parsePrimary());
      if (this.isName('of')) {
        this.next();
        return this.forEach(token, { kind: null, target: this.toPattern(head) }, this.parseExpression(), false);
      }
      this.index = saved;
    }
    if (isAwait) throw this.error('for await is of for...of');
    if (!this.is(';')) init = declares ? this.parseDeclaration() : this.parseSequence();
    // for (key in object)
    if (init?.type === 'BinaryExpression' && init.operator === 'in' && !init.parenthesized) {
      return this.forEach(token, { kind: null, target: this.toPattern(init.left) }, init.right, true);
    }
    this.expect(';');
    const test = this.is(';') ? null : this.parseSequence();
    this.expect(';');
    const update = this.is(')') ? null : this.parseSequence();
    this.expect(')');
    const body = this.parseStatement();
    return { type: 'ForStatement', init, test, update, body, start: token.start, end: body.end };
  }

  // A for...of (or for...in: of the keys JavaScript gives it, by an intrinsic) of a head { kind (of a declaration, or
  // null), target (a name, a member or a pattern) }: a pattern takes each value in the body (a name in between).
  forEach(token, { kind, target }, right, isIn) {
    const isAwait = this.forAwait;
    this.forAwait = false;
    if (isAwait && isIn) throw this.error('for await is of for...of', token);
    this.expect(')');
    let body = this.parseStatement();
    const source = isIn
      ? { type: 'Intrinsic', name: 'forInKeys', arguments: [right], start: right.start, end: right.end }
      : right;
    let left;
    let prelude = null;
    if (kind) {
      const name = target.type === 'Identifier' ? target : this.lowering.temp(target);
      const declarator = {
        type: 'VariableDeclarator',
        id: name.name,
        init: null,
        start: target.start,
        end: target.end,
      };
      left = { type: 'VariableDeclaration', kind, declarations: [declarator], start: target.start, end: target.end };
      if (target.type !== 'Identifier')
        prelude = this.declaration(kind, this.lowering.declarators(target, name), target);
    } else if (target.type === 'Identifier') left = target;
    else {
      const held = this.lowering.temp(target);
      this.declareTemp(held.name);
      left = held;
      const expression = this.lowering.assignment(target, held, (name) => this.declareTemp(name));
      prelude = { type: 'ExpressionStatement', expression, start: target.start, end: target.end };
    }
    if (prelude) body = { type: 'BlockStatement', body: [prelude, body], start: body.start, end: body.end };
    return {
      type: 'ForOfStatement',
      left,
      right: source,
      body,
      ...(isAwait ? { await: true } : {}),
      start: token.start,
      end: body.end,
    };
  }

  parseTry() {
    const token = this.next();
    const block = this.parseBlock();
    let handler = null;
    let finalizer = null;
    if (this.isName('catch')) {
      const at = this.next();
      let param = null;
      let pattern = null;
      if (this.is('(')) {
        this.next();
        const target = this.parseBindingTarget();
        if (target.type === 'Identifier') param = target.name;
        else {
          pattern = target;
          param = this.lowering.temp(target).name;
        }
        this.expect(')');
      }
      const body = this.parseBlock();
      // catch ({ message }): the pattern takes the error first in the block.
      if (pattern) {
        const held = { type: 'Identifier', name: param, start: pattern.start, end: pattern.end };
        body.body.unshift(this.declaration('let', this.lowering.declarators(pattern, held), pattern));
      }
      handler = { type: 'CatchClause', param, body, start: at.start, end: body.end };
    }
    if (this.isName('finally')) {
      this.next();
      finalizer = this.parseBlock();
    }
    if (!handler && !finalizer) throw this.error('try needs catch or finally', token);
    return { type: 'TryStatement', block, handler, finalizer, start: token.start, end: this.last() };
  }

  parseSwitch() {
    const token = this.next();
    const discriminant = this.parseParenthesized();
    this.expect('{');
    const cases = [];
    let defaults = false;
    while (!this.is('}')) {
      const at = this.peek();
      let test = null;
      if (this.isName('case')) {
        this.next();
        test = this.parseExpression();
      } else if (this.isName('default')) {
        if (defaults) throw this.error('Two defaults in a switch');
        defaults = true;
        this.next();
      } else throw this.error(at ? `Expected case or default but found ${describe(at)}` : 'Expected }');
      this.expect(':');
      const consequent = [];
      while (!this.is('}') && !this.isName('case') && !this.isName('default')) {
        if (!this.peek()) throw this.error('Expected }');
        consequent.push(this.parseStatement());
      }
      cases.push({ type: 'SwitchCase', test, consequent, start: at.start, end: this.last() });
    }
    this.expect('}');
    return { type: 'SwitchStatement', discriminant, cases, start: token.start, end: this.last() };
  }

  // function name(a, b) { ... }: a declaration (named), or an expression, as an arrow function (no this, arguments
  // nor new).
  parseFunction(declaration, isAsync = false) {
    const token = this.next();
    // function* name() {}: a generator.
    const isGenerator = this.is('*');
    if (isGenerator) this.next();
    const name = this.peek()?.type === 'name' ? this.bindingName() : null;
    if (declaration && !name) throw this.error('A function declaration needs a name', token);
    // (A function has a this of its own: none here.)
    this.contexts.push({ kind: 'function' });
    const { params, rest, body } = this.withAwait(
      isAsync,
      () => {
        const parsed = this.parseParams();
        this.scopes.push([]);
        const block = this.parseBlock();
        this.withPrologue(block, parsed.prologue, this.scopes.pop());
        return { ...parsed, body: block };
      },
      isGenerator
    );
    this.contexts.pop();
    const restOf = {
      ...(rest ? { rest } : {}),
      ...(isAsync ? { async: true } : {}),
      ...(isGenerator ? { generator: true } : {}),
    };
    if (declaration) {
      return { type: 'FunctionDeclaration', id: name, params, ...restOf, body, start: token.start, end: body.end };
    }
    return { type: 'ArrowFunctionExpression', params, ...restOf, body, start: token.start, end: body.end };
  }

  // new Name(args): the constructors of the engine (Date, Map, Set, Error...) and the classes of the program.
  parseNew() {
    const token = this.next();
    const name = this.peek();
    if (!name || name.type !== 'name') throw this.error('Expected the name of a constructor after new', name || token);
    // (new this(...) in a static method: of the class it is called on, #this.)
    const callee = name.value === 'this' ? (this.parseThis(name), '#this') : this.next().value;
    const args = this.is('(') ? this.parseArguments() : [];
    return { type: 'NewExpression', callee, arguments: args, start: token.start, end: this.last() };
  }
}

function isLogical(node, ...operators) {
  return node.type === 'LogicalExpression' && !node.parenthesized && operators.includes(node.operator);
}

function describe(token) {
  if (token.type === 'string') return 'a string';
  if (token.type === 'number') return 'a number';
  if (token.type === 'template') return 'a template literal';
  if (token.type === 'regex') return 'a regular expression';
  return JSON.stringify(token.value);
}

// The tree of an expression. `options.filters`: | separates filters (expression | name(args)).
function parse(source, options = {}) {
  if (typeof source !== 'string') throw new TypeError('An expression is a string');
  const { tokens } = tokenize(source, 0, false, { comments: Boolean(options.statements) });
  return new Parser(source, tokens, options).parseAll();
}

export { parse, Parser };
