// The language of OpenL Tablets on @xufa/expression: the trees of the parser of OpenL lowered to trees of the engine
// (its programs: variables, blocks, loops, functions), compiled and run by it with its checks and its limit of steps,
// as every formula of a book. What OpenL does as Java (ints that wrap, doubles written with .0, null in sums, BigDecimal,
// the members of records and results, casts) are calls of helpers ($o, and the functions of OpenL, $f) the trees make
// with the static types known when they are compiled (literals, casts, the declared types of parameters, steps,
// variables and fields, what functions give); what a tree needs of the book (datatypes, tables called, casts) is bound
// to it as names of its own ($$0, $$1...). No text of JavaScript is made of OpenL: the engine gets trees.
import { Engine, FORBIDDEN } from '@xufa/expression';
import { RulesError } from '../values.js';
import { parse } from './parser.js';
import * as rt from './runtime.js';
import { FUNCTIONS, CONSTANTS, STATICS, newJava } from './functions.js';

// The type of a numeric operation of two types (Java's promotion, and OpenL's to BigDecimal).
function promote(a, b) {
  const has = (...types) => types.includes(a) || types.includes(b);
  if (has('BigDecimal')) return 'BigDecimal';
  if (has('BigInteger')) return has('double', 'Double', 'float', 'Float') ? 'BigDecimal' : 'BigInteger';
  if (has('double', 'Double')) return 'double';
  if (has('float', 'Float')) return 'float';
  if (has('long', 'Long')) return 'long';
  // (OpenL keeps bytes and shorts: (byte) 100 + (byte) 100 is -56.)
  const bytes = ['byte', 'Byte'];
  const shorts = ['short', 'Short', ...bytes];
  if (bytes.includes(a) && bytes.includes(b)) return 'byte';
  if (shorts.includes(a) && shorts.includes(b)) return 'short';
  if (rt.isIntType(a) && rt.isIntType(b)) return 'int';
  return null;
}
const elementOf = (type) => (type && type.endsWith('[]') ? type.slice(0, -2) : null);
const typeName = (type) => (type ? `${type.name}${'[]'.repeat(type.dims)}` : null);
const BOXES = {
  int: 'Integer',
  long: 'Long',
  double: 'Double',
  float: 'Float',
  boolean: 'Boolean',
  short: 'Short',
  byte: 'Byte',
  char: 'Character',
};

const isPlain = (object) => {
  const proto = object !== null && typeof object === 'object' ? Object.getPrototypeOf(object) : undefined;
  return proto === Object.prototype || proto === null;
};

// The helpers the trees call: what OpenL does as Java.
const HELPERS = Object.freeze({
  // A name of the context (or of a variable), else a field of the arguments named alone (the last records looked
  // at), else null.
  name(value, records, name) {
    if (value !== undefined) return value;
    if (records) for (const record of records) if (Object.hasOwn(record, name)) return record[name];
    return null;
  },
  orElse: (value, fallback) => (value !== undefined ? value : fallback),
  // A name in the expression of an array operator: a field of the element (or $field), else what it is outside.
  field(item, name, outer) {
    if (rt.isRecord(item)) {
      if (Object.hasOwn(item, name)) return item[name];
      if (name.startsWith('$') && Object.hasOwn(item, name.slice(1))) return item[name.slice(1)];
    }
    return outer;
  },
  member: rt.member,
  index(object, key, fallback) {
    const value = rt.index(object, key);
    return fallback === null ? value : (value ?? fallback);
  },
  range(fn, first, last) {
    if (typeof fn !== 'function') throw new rt.OpenLError(`No range $${first}:$${last} here`);
    return fn(first, last);
  },
  arrayOperator: rt.arrayOperator,
  callMethod: rt.callMethod,
  add: rt.add,
  arithmetic: rt.arithmetic,
  equal: rt.equal,
  relation: rt.relation,
  sameText: (x, y) =>
    x === y ||
    (x !== null &&
      y !== null &&
      x !== undefined &&
      y !== undefined &&
      rt.relation('string<=', x, y) &&
      rt.relation('string>=', x, y)),
  negate(value, type) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'bigint') return -value;
    if (value && typeof value.negate === 'function') return value.negate();
    const negated = -rt.toNumber(value);
    return rt.isIntType(type) ? rt.narrow(negated, type) : negated;
  },
  /* eslint-disable no-bitwise */
  bitNot: (value) => ~rt.toNumber(value),
  bits(operator, x, y, logical) {
    const asBoolean = typeof x === 'boolean' || logical;
    if (operator === '&') return asBoolean ? Boolean(x) && Boolean(y) : rt.toNumber(x) & rt.toNumber(y);
    if (operator === '|') return asBoolean ? Boolean(x) || Boolean(y) : rt.toNumber(x) | rt.toNumber(y);
    return asBoolean ? Boolean(x) !== Boolean(y) : rt.toNumber(x) ^ rt.toNumber(y);
  },
  shift(operator, a, b) {
    if (operator === '<<') return rt.toNumber(a) << rt.toNumber(b);
    if (operator === '>>') return rt.toNumber(a) >> rt.toNumber(b);
    return rt.toNumber(a) >>> rt.toNumber(b);
  },
  /* eslint-enable no-bitwise */
  convert: (value, type) => (value === null || value === undefined ? value : rt.cast(value, type)),
  iterable: (items) => (Array.isArray(items) ? items : items instanceof Map ? [...items.values()] : []),
  // list[i] = value (of arrays, at an index; of maps, at a key).
  setIndex(list, at, value) {
    if (list instanceof Map) list.set(at, value);
    else if (Array.isArray(list) && Number.isInteger(Number(at)) && Number(at) >= 0) list[Number(at)] = value;
    else throw new rt.OpenLError('Cannot set this element');
    return value;
  },
  // object.field++, list[i]-- (records and arrays only).
  update(object, key, delta, type, prefix, indexed) {
    if (!indexed && !isPlain(object)) return rt.setMember(Object.freeze({}), key, null);
    const old = indexed ? rt.index(object, key) : rt.member(object, key);
    const value = rt.arithmetic('-', old, -delta, type);
    if (indexed) HELPERS.setIndex(object, key, value);
    else rt.setMember(object, key, value);
    return prefix ? value : old;
  },
  // (The values of several expressions, in order: the last.)
  last: (...values) => values[values.length - 1],
  first: (value) => value,
});

const engine = new Engine({
  builtins: false,
  statements: true,
  bound: { $o: HELPERS, $f: FUNCTIONS },
  maxSteps: 10_000_000,
  cacheSize: 0,
});

// The nodes of the trees of the engine.
const lit = (value) => (value === undefined ? { type: 'Identifier', name: 'undefined' } : { type: 'Literal', value });
const id = (name) => ({ type: 'Identifier', name });
const call = (callee, args) => ({ type: 'CallExpression', callee, arguments: args, optional: false });
const member = (object, property) => ({ type: 'MemberExpression', object, property, computed: false, optional: false });
const helper = (name, ...args) => call(member(id('$o'), name), args);
const array = (elements) => ({ type: 'ArrayExpression', elements });
const not = (argument) => ({ type: 'UnaryExpression', operator: '!', argument });
const arrow = (params, body) => ({ type: 'ArrowFunctionExpression', params, body });
const assign = (left, right) => ({ type: 'AssignmentExpression', operator: '=', left, right });
const types = (list) => array(list.map((type) => lit(type ?? null)));

class Lowerer {
  constructor({ book, where, types: known = {} }) {
    this.book = book;
    this.where = where;
    // Each scope: names -> { type, local } (local: a variable of the engine); scopes of the elements of array
    // operators have \`item\` (the parameter of the element, whose fields are names there) or \`self\` (of \`this\`).
    this.scopes = [new Map(Object.entries(known).map(([name, type]) => [name, { type, local: false }]))];
    this.bound = Object.create(null);
    this.count = 0;
    this.items = 0;
  }

  fail(message) {
    throw new RulesError(`${this.where}: ${message}`, 'XUFA_RULES_ERR_EXPRESSION');
  }

  // A value the tree needs, bound to it by a name of its own.
  bind(value) {
    const name = `$$${this.count}`;
    this.count += 1;
    this.bound[name] = value;
    return id(name);
  }

  // A literal, or a value bound (objects).
  value(value) {
    return value !== null && (typeof value === 'object' || typeof value === 'function') ? this.bind(value) : lit(value);
  }

  typeOf(name) {
    for (let i = this.scopes.length - 1; i >= 0; i -= 1) {
      const entry = this.scopes[i].get(name);
      if (entry) return entry.type;
    }
    return null;
  }

  declare(name, type, local = true) {
    this.scopes[this.scopes.length - 1].set(name, { type, local });
  }

  datatype(name) {
    const table = name ? this.book?.table?.(name.replace(/\[\]$/, '')) : null;
    return table?.className === 'DatatypeTable' ? table : null;
  }

  // The type of a field of a type (a datatype's, or each element's of an array).
  fieldType(type, name) {
    if (!type) return null;
    if (name === 'length' && type.endsWith('[]')) return 'int';
    const element = elementOf(type);
    if (element) {
      const inner = this.fieldType(element, name);
      return inner ? `${inner}[]` : null;
    }
    // (A cell of a result of a spreadsheet: the type of its step, $Base of SpreadsheetResultVehiclePremium.)
    const spreadsheet = /^SpreadsheetResult(\w+)$/.exec(type);
    if (spreadsheet) {
      const table = this.book?.table?.(spreadsheet[1]);
      if (table?.className === 'SpreadsheetTable')
        return table.cellTypes?.[name.startsWith('$') ? name : `$${name}`] ?? null;
    }
    return this.datatype(type)?.params?.[name]?.type ?? null;
  }

  // A name of a member, never one that reaches prototypes.
  checkName(name) {
    if (FORBIDDEN.has(name) || rt.FORBIDDEN?.has?.(name)) this.fail(`${name} cannot be reached`);
  }

  // { node, type } of a tree of OpenL.
  node(tree) {
    const method = this[tree.type];
    if (!method || tree.type === 'node') this.fail(`${tree.type} is not supported`);
    return method.call(this, tree);
  }

  Literal(tree) {
    const type = {
      int: 'int',
      long: 'long',
      double: 'double',
      float: 'float',
      String: 'String',
      char: 'char',
      boolean: 'boolean',
      null: null,
    }[tree.kind];
    const value = tree.kind === 'float' ? Math.fround(tree.value) : tree.value;
    return { node: this.value(value), type, literal: true };
  }

  // A name read: the variables of the code, the fields of the elements of array operators around (over what is
  // outside), the context; \`raw\`: without the fields of arguments named alone (what a call calls).
  read(name, raw = false) {
    const items = [];
    let found = null;
    for (let i = this.scopes.length - 1; i >= 0 && !found; i -= 1) {
      const scope = this.scopes[i];
      if (name === 'this' && (scope.item || scope.self)) found = id(scope.item ?? scope.self);
      else if (scope.item) items.push(scope.item);
      else if (scope.get(name)?.local) found = id(name);
    }
    let node = found;
    let statics = null;
    if (!node) {
      if (raw) node = id(name);
      else if (Object.hasOwn(STATICS, name)) {
        node = helper('orElse', id(name), this.bind(STATICS[name]));
        statics = name;
      } else if (Object.hasOwn(CONSTANTS, name)) node = helper('orElse', id(name), this.value(CONSTANTS[name]));
      else node = helper('name', id(name), id('$$records'), lit(name));
    }
    for (let i = items.length - 1; i >= 0; i -= 1) node = helper('field', id(items[i]), lit(name), node);
    return { node, statics: items.length ? null : statics };
  }

  Name(tree) {
    const { name } = tree;
    const { node, statics } = this.read(name);
    const constant = Object.hasOwn(CONSTANTS, name) && !statics ? CONSTANTS[name] : undefined;
    const type =
      this.typeOf(name) ?? (constant === undefined ? null : typeof constant === 'number' ? 'double' : 'String');
    return { node, type, statics, name };
  }

  Member(tree) {
    const qualified = qualifiedName(tree);
    if (qualified && /^java\./.test(qualified)) {
      const simple = qualified.split('.').pop();
      if (Object.hasOwn(STATICS, simple)) return { node: this.bind(STATICS[simple]), type: null, statics: simple };
    }
    const object = this.node(tree.object);
    const { name } = tree;
    this.checkName(name);
    if (object.statics) {
      const field = STATICS[object.statics][name];
      if (field !== undefined && typeof field !== 'function') {
        return { node: this.value(field), type: STATICS[object.statics].types?.[name] ?? null };
      }
    }
    return { node: helper('member', object.node, lit(name)), type: this.fieldType(object.type, name) };
  }

  Index(tree) {
    const object = this.node(tree.object);
    const key = this.node(tree.index);
    const type = elementOf(object.type);
    // (Out of an array of a primitive type: its default value, 0 or false.)
    const fallback = type ? rt.defaultOf(type) : null;
    return { node: helper('index', object.node, key.node, lit(fallback)), type };
  }

  Range(tree) {
    const first = tree.first.slice(1);
    const last = tree.last.slice(1);
    return { node: helper('range', id('$range'), lit(first), lit(last)), type: null };
  }

  // arr[select all having c], arr[(x) order by e]...: the expression a function of each element.
  ArrayOperator(tree) {
    const list = this.node(tree.object);
    const element = elementOf(list.type);
    const scope = new Map();
    const param = tree.variable ?? `$item${this.items}`;
    this.items += 1;
    if (tree.variable) {
      scope.set(tree.variable, { type: element, local: true });
      scope.self = tree.variable;
    } else {
      const datatype = this.datatype(element);
      for (const field of Object.values(datatype?.params ?? {}))
        scope.set(field.name, { type: field.type, local: false });
      scope.item = param;
    }
    this.scopes.push(scope);
    const each = this.node(tree.expression);
    this.scopes.pop();
    const { operator } = tree;
    const type =
      operator === 'first'
        ? element
        : operator === 'split'
          ? list.type && `${list.type}[]`
          : operator.startsWith('transform')
            ? each.type && `${each.type}[]`
            : list.type;
    return { node: helper('arrayOperator', lit(operator), list.node, arrow([param], each.node)), type };
  }

  Call(tree) {
    // (A datatype called as a function: its constructor.)
    if (tree.callee.type === 'Name' && this.datatype(tree.callee.name) && !this.datatype(tree.callee.name).vocabulary) {
      return this.New({ type: 'New', valueType: { name: tree.callee.name, dims: 0 }, args: tree.args });
    }
    if (tree.args.some((arg) => arg.type === 'Named')) this.fail('Named arguments are only for new');
    const args = tree.args.map((arg) => this.node(arg));
    const argTypes = args.map((arg) => arg.type);
    const values = array(args.map((arg) => arg.node));
    if (tree.callee.type === 'Member') {
      const object = this.node(tree.callee.object);
      const { name } = tree.callee;
      this.checkName(name);
      if (object.statics) {
        const fn = STATICS[object.statics][name];
        if (typeof fn !== 'function') this.fail(`${object.statics}.${name} is no function`);
        const { returns } = fn;
        return {
          node: call(
            this.bind((list) => fn(...list)),
            [values]
          ),
          type: typeof returns === 'function' ? returns(argTypes) : (returns ?? null),
        };
      }
      return {
        node: helper('callMethod', object.node, lit(name), values, lit(object.type ?? null)),
        type: METHOD_TYPES[name] ?? (name === 'getClass' ? 'Class' : null),
      };
    }
    if (tree.callee.type !== 'Name') this.fail('Only names and methods can be called');
    const { name } = tree.callee;
    // $Column$Row(result): that cell of the result given (of each of an array of them), not of this spreadsheet.
    if (name.startsWith('$') && args.length === 1)
      return { node: helper('member', args[0].node, lit(name)), type: null };
    const table = this.book?.table?.(name);
    const library = Object.hasOwn(FUNCTIONS, name) ? FUNCTIONS[name] : null;
    const tableType = table && (table.type ?? table.returnType ?? table.resultType);
    const type =
      tableType && tableType !== 'any'
        ? tableType
        : library
          ? typeof library.returns === 'function'
            ? library.returns(argTypes)
            : (library.returns ?? null)
          : null;
    if (name === '__constant') {
      const { book } = this;
      return {
        node: call(
          this.bind((list) => book.constantOf(list[0]) ?? list[0]),
          [values]
        ),
        type,
      };
    }
    // (The types of the parameters: of Method tables, apart.)
    const params =
      table && Array.isArray(table.params)
        ? Array.isArray(table.paramTypes) && table.params.every((param) => typeof param === 'string')
          ? table.params.map((param, i) => ({ name: param, type: table.paramTypes[i] ?? null }))
          : table.params
        : null;
    const callTable = tableCall(params);
    // The function of the context (a table, a method), else of the library of OpenL, else the field of the object.
    const run = (fn, list) => {
      // (Not the functions every object has, toString of a context made of {}.)
      if (typeof fn === 'function' && fn !== Object.prototype[name]) return callTable(fn, list);
      if (library) return library(list, argTypes);
      if (list.length === 1) return rt.member(list[0], name);
      throw new rt.OpenLError(`No function ${name}`);
    };
    return { node: call(this.bind(run), [this.read(name, true).node, values]), type };
  }

  New(tree) {
    const name = tree.valueType.name;
    const datatype = this.datatype(name);
    if (datatype) {
      const fields = Object.values(datatype.params);
      const positional = tree.args.filter((arg) => arg.type !== 'Named').map((arg) => this.node(arg).node);
      const named = tree.args
        .filter((arg) => arg.type === 'Named')
        .map((arg) => {
          if (!datatype.params[arg.name]) this.fail(`${name} has no field ${arg.name}`);
          return { name: arg.name, value: this.node(arg.value).node };
        });
      const names = named.map((arg) => arg.name);
      const make = (list, values) => {
        const object = {};
        for (const field of fields) object[field.name] = rt.defaultOf(field.type);
        datatype.withDefaults(object);
        list.forEach((value, i) => {
          if (fields[i]) object[fields[i].name] = value;
        });
        names.forEach((field, i) => {
          object[field] = values[i];
        });
        return object;
      };
      return {
        node: call(this.bind(make), [array(positional), array(named.map((arg) => arg.value))]),
        type: name,
      };
    }
    const args = tree.args.map((arg) =>
      arg.type === 'Named' ? this.fail('Named arguments are only for datatypes') : this.node(arg).node
    );
    const make = newJava(name);
    if (!make) this.fail(`No type ${name}`);
    return { node: call(this.bind(make), [array(args)]), type: make.type ?? name };
  }

  NewArray(tree) {
    const element = typeName(tree.elementType);
    const type = `${element}[]`;
    if (tree.init) return { node: this.ArrayInit(tree.init, element).node, type };
    const sizes = tree.sizes.map((size) => (size ? this.node(size).node : lit(null)));
    const fill = rt.defaultOf(tree.elementType.name, tree.elementType.dims);
    const make = (values) => {
      const level = (at) => {
        const size = values[at] === null ? 0 : Number(values[at]);
        if (at === values.length - 1 || values[at + 1] === null) return Array.from({ length: size }, () => fill);
        return Array.from({ length: size }, () => level(at + 1));
      };
      return level(0);
    };
    return { node: call(this.bind(make), [array(sizes)]), type };
  }

  ArrayInit(tree, element = typeName(tree.elementType)) {
    const items = tree.items.map((item) =>
      item.type === 'ArrayInit' ? this.ArrayInit(item, elementOf(element)).node : this.node(item).node
    );
    const convert = element && rt.NUMBER_TYPES.has(element);
    return {
      node: array(convert ? items.map((item) => helper('convert', item, lit(element))) : items),
      type: element ? `${element}[]` : null,
    };
  }

  Unary(tree) {
    const argument = this.node(tree.argument);
    switch (tree.operator) {
      case '-': {
        const type = argument.type === 'char' ? 'int' : argument.type;
        return { node: helper('negate', argument.node, lit(type ?? null)), type };
      }
      case '+':
        return { node: argument.node, type: argument.type };
      case '~':
        return { node: helper('bitNot', argument.node), type: 'int' };
      default:
        return { node: not(argument.node), type: 'boolean' };
    }
  }

  // What an assignment changes: { read, write(value) } as nodes, and its type.
  target(tree) {
    if (tree.type === 'Name') {
      const { name } = tree;
      const read = this.read(name, true).node;
      return { read, write: (value) => assign(id(name), value), type: this.typeOf(name), name };
    }
    if (tree.type === 'Member') {
      const object = this.node(tree.object);
      this.checkName(tree.name);
      const target = member(object.node, tree.name);
      return {
        read: helper('member', object.node, lit(tree.name)),
        write: (value) => assign(target, value),
        type: this.fieldType(object.type, tree.name),
        object: object.node,
        key: lit(tree.name),
      };
    }
    if (tree.type === 'Index') {
      const object = this.node(tree.object);
      const key = this.node(tree.index);
      return {
        read: helper('index', object.node, key.node, lit(null)),
        write: (value) => helper('setIndex', object.node, key.node, value),
        type: elementOf(object.type),
        object: object.node,
        key: key.node,
        indexed: true,
      };
    }
    return this.fail('Only variables, fields and elements can be assigned');
  }

  // ++x, x--: a variable, field or element changed by one.
  Update(tree) {
    const target = this.target(tree.argument);
    const delta = tree.operator === '++' ? 1 : -1;
    const { type } = target;
    if (target.name) {
      const changed = target.write(
        helper('arithmetic', lit('-'), helper('orElse', target.read, lit(null)), lit(-delta), lit(type ?? null))
      );
      return { node: tree.prefix ? changed : helper('first', target.read, changed), type };
    }
    const node = helper(
      'update',
      target.object,
      target.key,
      lit(delta),
      lit(type ?? null),
      lit(tree.prefix),
      lit(Boolean(target.indexed))
    );
    return { node, type };
  }

  Assign(tree) {
    const target = this.target(tree.target);
    const value = this.node(tree.value);
    const operator = tree.operator.slice(0, -1);
    const type = target.type ?? value.type;
    const numeric = target.type && rt.NUMBER_TYPES.has(target.type);
    const convert = (node) => (numeric ? helper('convert', node, lit(target.type)) : node);
    if (!operator) return { node: target.write(convert(value.node)), type };
    const old = target.name ? helper('orElse', target.read, lit(null)) : target.read;
    const result =
      operator === '+'
        ? helper(
            'add',
            old,
            value.node,
            lit(target.type ?? null),
            lit(value.type ?? null),
            lit(promote(target.type, value.type) ?? target.type ?? null)
          )
        : helper('arithmetic', lit(operator), old, value.node, lit(target.type ?? null));
    return { node: target.write(convert(result)), type };
  }

  Binary(tree) {
    const left = this.node(tree.left);
    const right = this.node(tree.right);
    const a = left.node;
    const b = right.node;
    const { operator } = tree;
    const charless = (type) => (type === 'char' ? 'int' : type);
    // (A float compared: as floats.)
    const floating = [left.type, right.type].some((type) => type === 'float' || type === 'Float');
    switch (operator) {
      case '+': {
        const text = left.type === 'String' || right.type === 'String';
        const type = text ? 'String' : promote(charless(left.type), charless(right.type));
        return {
          node: helper('add', a, b, lit(left.type ?? null), lit(right.type ?? null), lit(type ?? null)),
          type,
        };
      }
      case '-':
      case '*':
      case '/':
      case '%': {
        let type = promote(charless(left.type), charless(right.type));
        // (OpenL divides whole numbers as doubles, and BigIntegers as BigDecimals.)
        if (operator === '/') {
          type =
            type === 'BigInteger' ? 'BigDecimal' : type && type !== 'BigDecimal' && type !== 'float' ? 'double' : type;
        }
        return { node: helper('arithmetic', lit(operator), a, b, lit(type ?? null)), type };
      }
      case '**':
        return { node: call(member(id('$f'), 'pow'), [array([a, b]), types([left.type, right.type])]), type: 'double' };
      case '==':
        return { node: helper('equal', a, b, lit(false), lit(floating)), type: 'boolean' };
      case '!=':
        return { node: not(helper('equal', a, b, lit(false), lit(floating))), type: 'boolean' };
      case '====':
        return { node: helper('equal', a, b, lit(true)), type: 'boolean' };
      case '!===':
        return { node: not(helper('equal', a, b, lit(true))), type: 'boolean' };
      case 'string==':
        return { node: helper('sameText', a, b), type: 'boolean' };
      case 'string!=':
      case 'string<>':
        return { node: not(helper('sameText', a, b)), type: 'boolean' };
      case '&':
      case '|':
      case '^': {
        const logical = left.type === 'boolean' || right.type === 'boolean';
        return { node: helper('bits', lit(operator), a, b, lit(logical)), type: logical ? 'boolean' : 'int' };
      }
      case '<<':
      case '>>':
      case '>>>':
        return { node: helper('shift', lit(operator), a, b), type: 'int' };
      default:
        return { node: helper('relation', lit(operator), a, b), type: 'boolean' };
    }
  }

  Logical(tree) {
    const left = this.node(tree.left);
    const right = this.node(tree.right);
    const node = {
      type: 'LogicalExpression',
      operator: tree.operator,
      left: not(not(left.node)),
      right: not(not(right.node)),
    };
    return { node, type: 'boolean' };
  }

  Conditional(tree) {
    const test = this.node(tree.test);
    const then = this.node(tree.then);
    const otherwise = this.node(tree.otherwise);
    return {
      node: { type: 'ConditionalExpression', test: test.node, consequent: then.node, alternate: otherwise.node },
      type: then.type === otherwise.type ? then.type : (then.type ?? otherwise.type),
    };
  }

  Cast(tree) {
    const argument = this.node(tree.argument);
    const { name, dims } = tree.valueType;
    const make = !dims && (name === 'BigDecimal' || name === 'BigInteger') ? newJava(name) : null;
    const vocabulary = !dims && this.datatype(name)?.vocabulary ? this.datatype(name) : null;
    const fromChar = argument.type === 'char';
    const from = argument.type;
    const fromFloat = from === 'float' || from === 'Float';
    const cast = (value) => {
      if (make) {
        if (value === null || value === undefined) return null;
        return make([fromChar ? rt.toNumber(value) : fromFloat ? rt.floatDecimal(value) : value]);
      }
      if (vocabulary && value !== null && value !== undefined && !vocabulary.allows(value)) {
        throw new rt.OpenLError(
          `Object '${value}' is outside of valid domain '${name}'. Valid values: [${vocabulary.vocabulary.values.join(', ')}]`
        );
      }
      // (One value cast to an array: an array of it.)
      if (dims && value !== null && value !== undefined && !Array.isArray(value)) return [value];
      return rt.cast(value, name, dims, from);
    };
    // (A cast to Object keeps what is known of the value: its class.)
    const type = name === 'Object' && !dims ? (argument.type ?? 'Object') : typeName(tree.valueType);
    return { node: call(this.bind(cast), [argument.node]), type };
  }

  InstanceOf(tree) {
    const argument = this.node(tree.argument);
    const name = tree.valueType?.name;
    const dims = tree.valueType?.dims;
    const datatype = this.datatype(name);
    const argType = argument.type;
    const test = (value) => {
      if (value === null || value === undefined) return false;
      if (dims) return Array.isArray(value);
      const simple = rt.classOf(value, argType).getSimpleName();
      if (simple === name || name === 'Object') return true;
      if (name === 'Number') return typeof value === 'number' || typeof value === 'bigint';
      return Boolean(datatype && rt.isRecord(value) && Object.keys(datatype.params).every((key) => key in value));
    };
    return { node: call(this.bind(test), [argument.node]), type: 'boolean' };
  }

  // X, where A - ..., B - ...: functions of the variables, each seeing those before: ((A) => ((B) => X)(...))(...).
  Let(tree) {
    const scope = new Map();
    this.scopes.push(scope);
    const bindings = tree.bindings.map((binding) => {
      const value = this.node(binding.value);
      scope.set(binding.name, { type: value.type, local: true });
      return { name: binding.name, value: value.node };
    });
    const body = this.node(tree.body);
    this.scopes.pop();
    let node = body.node;
    for (let i = bindings.length - 1; i >= 0; i -= 1) node = call(arrow([bindings[i].name], node), [bindings[i].value]);
    return { node, type: body.type };
  }

  // Statements: those of the engine.
  statement(tree) {
    switch (tree.type) {
      case 'Block': {
        this.scopes.push(new Map());
        const body = tree.body.map((item) => this.statement(item));
        this.scopes.pop();
        return { type: 'BlockStatement', body };
      }
      case 'Empty':
        return { type: 'EmptyStatement' };
      case 'Var': {
        const type = typeName(tree.valueType);
        const numeric = rt.NUMBER_TYPES.has(type);
        const declarations = tree.declarations.map(({ name, init }) => {
          let value;
          if (!init) value = lit(rt.defaultOf(tree.valueType.name, tree.valueType.dims));
          else {
            const lowered = init.type === 'ArrayInit' ? this.ArrayInit(init, elementOf(type)) : this.node(init);
            value = lowered.node;
            if (numeric) value = helper('convert', value, lit(type));
            // (A value given to a range: the range of it, IntRange r = 5.)
            if (/Range$/.test(type) && lowered.type !== type && newJava(type)) {
              const make = newJava(type);
              const toRange = (v) =>
                v === null || v === undefined || (rt.isRecord(v) && 'minIncluded' in v) ? v : make([v]);
              value = call(this.bind(toRange), [value]);
            }
          }
          this.declare(name, type);
          return { type: 'VariableDeclarator', id: name, init: value };
        });
        return { type: 'VariableDeclaration', kind: 'let', declarations };
      }
      case 'Expression':
        return { type: 'ExpressionStatement', expression: this.node(tree.expression).node };
      case 'If':
        return {
          type: 'IfStatement',
          test: this.node(tree.test).node,
          consequent: this.statement(tree.then),
          alternate: tree.otherwise ? this.statement(tree.otherwise) : null,
        };
      case 'While':
        return { type: 'WhileStatement', test: this.node(tree.test).node, body: this.statement(tree.body) };
      case 'DoWhile':
        return { type: 'DoWhileStatement', test: this.node(tree.test).node, body: this.statement(tree.body) };
      case 'For': {
        this.scopes.push(new Map());
        const init = tree.init ? this.statement(tree.init) : null;
        const test = tree.test ? this.node(tree.test).node : null;
        const updates = tree.update.map((item) => this.node(item).node);
        const body = this.statement(tree.body);
        this.scopes.pop();
        const update = updates.length === 0 ? null : updates.length === 1 ? updates[0] : helper('last', ...updates);
        const start = init && init.type === 'ExpressionStatement' ? init.expression : init;
        return { type: 'ForStatement', init: start, test, update, body };
      }
      case 'ForEach': {
        const iterable = this.node(tree.iterable).node;
        this.scopes.push(new Map([[tree.name, { type: typeName(tree.valueType), local: true }]]));
        const body = this.statement(tree.body);
        this.scopes.pop();
        const left = {
          type: 'VariableDeclaration',
          kind: 'let',
          declarations: [{ type: 'VariableDeclarator', id: tree.name, init: null }],
        };
        return { type: 'ForOfStatement', left, right: helper('iterable', iterable), body };
      }
      case 'Return':
        return { type: 'ReturnStatement', argument: tree.argument ? this.node(tree.argument).node : lit(null) };
      case 'Break':
        return { type: 'BreakStatement' };
      case 'Continue':
        return { type: 'ContinueStatement' };
      default:
        return this.fail(`${tree.type} is not supported`);
    }
  }

  // A program of statements: the value of its return, or of its last expression; else null.
  program(tree) {
    const last = tree.body[tree.body.length - 1];
    const body =
      last && last.type === 'Expression'
        ? [...tree.body.slice(0, -1), { type: 'Return', argument: last.expression }]
        : tree.body;
    const statements = body.map((item) => this.statement(item));
    return { type: 'Program', body: [...statements, { type: 'ReturnStatement', argument: lit(null) }] };
  }
}

// The name a chain of names writes (java.util.List), or null.
function qualifiedName(tree) {
  if (tree.type === 'Name') return tree.name;
  if (tree.type === 'Member') {
    const object = qualifiedName(tree.object);
    return object ? `${object}.${tree.name}` : null;
  }
  return null;
}

// A call of a table: the last arguments in an array when it takes an array (variable arguments), and the table run
// for each element of an array given where it takes one value (rules applied to arrays).
function tableCall(params) {
  if (!params || !params.length) return (fn, values) => fn(...values);
  const typeOfParam = (param) => (typeof param === 'string' ? null : (param.type ?? null));
  const paramTypes = params.map(typeOfParam);
  const last = paramTypes[paramTypes.length - 1];
  return (fn, values) => {
    if (last && last.endsWith('[]') && values.length > paramTypes.length) {
      values = [...values.slice(0, paramTypes.length - 1), values.slice(paramTypes.length - 1)];
    }
    const spread = values.map(
      (value, i) =>
        Array.isArray(value) &&
        paramTypes[i] &&
        !paramTypes[i].endsWith('[]') &&
        !['Object', 'any'].includes(paramTypes[i])
    );
    if (!spread.some(Boolean)) return fn(...values);
    // Every combination of the elements of the arrays given.
    let combinations = [[]];
    values.forEach((value, i) => {
      const options = spread[i] ? value : [value];
      combinations = combinations.flatMap((combination) => options.map((option) => [...combination, option]));
    });
    return combinations.map((combination) => fn(...combination));
  };
}

const METHOD_TYPES = {
  length: 'int',
  size: 'int',
  indexOf: 'int',
  lastIndexOf: 'int',
  intValue: 'int',
  longValue: 'long',
  doubleValue: 'double',
  floatValue: 'float',
  shortValue: 'short',
  byteValue: 'byte',
  toString: 'String',
  substring: 'String',
  toUpperCase: 'String',
  toLowerCase: 'String',
  trim: 'String',
  charAt: 'char',
  compareTo: 'int',
  equals: 'boolean',
  contains: 'boolean',
  startsWith: 'boolean',
  endsWith: 'boolean',
  isEmpty: 'boolean',
  getSimpleName: 'String',
  getName: 'String',
  hashCode: 'int',
};

// The tree of the engine of a source of OpenL, with what it binds: { tree, bound, type }.
function lowerOpenL(source, { book, where = 'OpenL', types, names } = {}) {
  let tree;
  try {
    tree = parse(source, { names });
  } catch (err) {
    throw new RulesError(`${where}: ${err.message}`, 'XUFA_RULES_ERR_EXPRESSION');
  }
  const lowerer = new Lowerer({ book, where, types });
  if (tree.type === 'Block') return { tree: lowerer.program(tree), bound: lowerer.bound, type: null };
  const { node, type } = lowerer.node(tree);
  return { tree: node, bound: lowerer.bound, type };
}

// A function of a scope (the context of the book with the values of the call) of the source, in the language of
// OpenL, run by @xufa/expression. types: the static types of names (parameters, steps); names: the names with spaces
// it may use ($Exchange Rate).
function compileOpenL(source, options = {}) {
  const { tree, bound } = lowerOpenL(source, options);
  try {
    return engine.compileTree(tree, String(source), { bound });
  } catch (err) {
    throw new RulesError(`${options.where ?? 'OpenL'}: ${err.message}`, 'XUFA_RULES_ERR_EXPRESSION');
  }
}

// The static type of a source (null when it is not known), for the types of steps and cells.
function typeOfOpenL(source, options = {}) {
  try {
    return lowerOpenL(source, options).type;
  } catch {
    return null;
  }
}

export { compileOpenL, lowerOpenL, typeOfOpenL, BOXES, HELPERS };
