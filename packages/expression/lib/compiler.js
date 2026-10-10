// An expression as a function: each node of its tree a closure, made once. What it runs reads only the context given,
// the parameters of its arrow functions and the globals of its engine: no property can be named __proto__,
// constructor or prototype (nor the old accessors of Object.prototype), there is no assignment, and objects are made
// with their keys as their own properties (a key __proto__ is refused).
import { ExpressionError } from './errors.js';
import { generate } from './codegen.js';

// The context of a run that is not an object (objects are taken as they are, without a call).
function contextOf(context) {
  return context === null || context === undefined ? {} : Object(context);
}

const FORBIDDEN = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'caller',
  'callee',
  'arguments',
]);

// What a ?. that met null or undefined gives to the rest of its chain: the chain is undefined.
const SHORT = Symbol('short');

class Compiler {
  // `globals`: names and values; `filters`: functions by name; `lenient`: members of null and undefined, and calls of
  // what is not a function, are undefined (not errors); `strict`: names that are not in the context nor the globals
  // are errors (not undefined).
  constructor(source, { globals, filters, lenient, strict }) {
    this.source = source;
    this.globals = globals;
    this.filters = filters;
    this.lenient = Boolean(lenient);
    this.strict = Boolean(strict);
  }

  error(message, node, code = 'XUFA_EXPR_ERR_SYNTAX') {
    return new ExpressionError(message, { code, source: this.source, position: node ? node.start : undefined });
  }

  text(node) {
    return this.source.slice(node.start, node.end);
  }

  // A name of property that cannot be reached: an error.
  checkKey(name, node) {
    if (FORBIDDEN.has(name))
      throw this.error(`${name} cannot be reached in expressions`, node, 'XUFA_EXPR_ERR_FORBIDDEN');
  }

  // The key of a computed member, checked: numbers and symbols as they are, the rest as strings (converted once).
  keyOf(node) {
    const compiler = this;
    return (value) => {
      if (typeof value === 'number' || typeof value === 'symbol') return value;
      const key = String(value);
      if (FORBIDDEN.has(key)) compiler.checkKey(key, node);
      return key;
    };
  }

  compile(node, env) {
    switch (node.type) {
      case 'Literal': {
        const { value } = node;
        return () => value;
      }
      case 'Identifier':
        return this.identifier(node, env);
      case 'TemplateLiteral':
        return this.template(node, env);
      case 'ArrayExpression':
        return this.array(node, env);
      case 'ObjectExpression':
        return this.object(node, env);
      case 'MemberExpression':
        return this.member(node, env);
      case 'CallExpression':
        return this.call(node, env);
      case 'ChainExpression': {
        const inner = this.compile(node.expression, env);
        return (s) => {
          const value = inner(s);
          return value === SHORT ? undefined : value;
        };
      }
      case 'UnaryExpression':
        return this.unary(node, env);
      case 'BinaryExpression':
        return this.binary(node, env);
      case 'LogicalExpression':
        return this.logical(node, env);
      case 'ConditionalExpression': {
        const test = this.compile(node.test, env);
        const consequent = this.compile(node.consequent, env);
        const alternate = this.compile(node.alternate, env);
        return (s) => (test(s) ? consequent(s) : alternate(s));
      }
      case 'ArrowFunctionExpression':
        return this.arrow(node, env);
      case 'Filter':
        return this.filter(node, env);
      default:
        throw this.error(`Unsupported ${node.type}`, node);
    }
  }

  identifier(node, env) {
    const { name } = node;
    // The parameters of the arrow functions around it, innermost first.
    for (let depth = env.length - 1; depth >= 0; depth -= 1) {
      const index = env[depth].indexOf(name);
      if (index !== -1) {
        const up = env.length - 1 - depth;
        if (up === 0) return (s) => s.frame[index];
        if (up === 1) return (s) => s.up.frame[index];
        return (s) => {
          let scope = s;
          for (let i = 0; i < up; i += 1) scope = scope.up;
          return scope.frame[index];
        };
      }
    }
    if (name === 'undefined') return () => undefined;
    this.checkKey(name, node);
    const hasGlobal = Object.prototype.hasOwnProperty.call(this.globals, name);
    const global = hasGlobal ? this.globals[name] : undefined;
    const { strict } = this;
    const compiler = this;
    return (s) => {
      const { ctx } = s;
      const value = ctx[name];
      if (value !== undefined || name in ctx) return value;
      if (hasGlobal) return global;
      if (strict) throw compiler.error(`${name} is not defined`, node, 'XUFA_EXPR_ERR_RUNTIME');
      return undefined;
    };
  }

  template(node, env) {
    const { quasis } = node;
    const parts = node.expressions.map((expression) => this.compile(expression, env));
    if (parts.length === 1) {
      const [first, last] = quasis;
      const [part] = parts;
      return (s) => `${first}${part(s)}${last}`;
    }
    return (s) => {
      let text = quasis[0];
      for (let i = 0; i < parts.length; i += 1) text += `${parts[i](s)}${quasis[i + 1]}`;
      return text;
    };
  }

  array(node, env) {
    const items = node.elements.map((element) =>
      element.type === 'SpreadElement'
        ? { spread: true, value: this.compile(element.argument, env) }
        : { spread: false, value: this.compile(element, env) }
    );
    if (items.every((item) => !item.spread)) {
      const values = items.map((item) => item.value);
      return (s) => values.map((value) => value(s));
    }
    return (s) => {
      const result = [];
      for (let i = 0; i < items.length; i += 1) {
        if (items[i].spread) result.push(...items[i].value(s));
        else result.push(items[i].value(s));
      }
      return result;
    };
  }

  object(node, env) {
    const entries = node.properties.map((property) => {
      if (property.type === 'SpreadElement') return { spread: this.compile(property.argument, env) };
      const value = this.compile(property.value, env);
      if (!property.computed) {
        if (property.key === '__proto__')
          throw this.error('__proto__ cannot be a key', property.value, 'XUFA_EXPR_ERR_FORBIDDEN');
        return { key: property.key, value };
      }
      const key = this.compile(property.key, env);
      const keyOf = this.keyOf(property.key);
      return { computed: (s) => keyOf(key(s)), value };
    });
    return (s) => {
      const result = {};
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        if (entry.spread) {
          const source = entry.spread(s);
          if (source !== null && source !== undefined) {
            const keys = Object.keys(source);
            for (let k = 0; k < keys.length; k += 1) define(result, keys[k], source[keys[k]]);
          }
        } else define(result, entry.computed ? entry.computed(s) : entry.key, entry.value(s));
      }
      return result;
    };
  }

  // The object and the key of a member (its object a function; its key a constant or a function).
  memberParts(node, env) {
    const object = this.compile(node.object, env);
    if (!node.computed) {
      this.checkKey(node.property, node);
      return { object, key: node.property, keyFn: null };
    }
    const property = this.compile(node.property, env);
    const keyOf = this.keyOf(node.property);
    return { object, key: null, keyFn: (s) => keyOf(property(s)) };
  }

  nullMember(node) {
    const name = node.computed ? this.text(node.property) : node.property;
    return this.error(
      `Cannot read ${name} of ${this.text(node.object)}, which is null or undefined`,
      node,
      'XUFA_EXPR_ERR_RUNTIME'
    );
  }

  member(node, env) {
    const { object, key, keyFn } = this.memberParts(node, env);
    const { optional } = node;
    const { lenient } = this;
    const compiler = this;
    return (s) => {
      const value = object(s);
      if (value === SHORT) return SHORT;
      if (value === null || value === undefined) {
        if (optional) return SHORT;
        if (lenient) return undefined;
        throw compiler.nullMember(node);
      }
      return value[keyFn ? keyFn(s) : key];
    };
  }

  argumentsOf(nodes, env) {
    const items = nodes.map((item) =>
      item.type === 'SpreadElement'
        ? { spread: true, value: this.compile(item.argument, env) }
        : { spread: false, value: this.compile(item, env) }
    );
    if (items.length === 0) return () => [];
    if (items.every((item) => !item.spread)) {
      const values = items.map((item) => item.value);
      if (values.length === 1) {
        const [first] = values;
        return (s) => [first(s)];
      }
      return (s) => values.map((value) => value(s));
    }
    return (s) => {
      const result = [];
      for (let i = 0; i < items.length; i += 1) {
        if (items[i].spread) result.push(...items[i].value(s));
        else result.push(items[i].value(s));
      }
      return result;
    };
  }

  notFunction(node) {
    return this.error(`${this.text(node.callee)} is not a function`, node, 'XUFA_EXPR_ERR_RUNTIME');
  }

  call(node, env) {
    const args = this.argumentsOf(node.arguments, env);
    const { lenient } = this;
    const compiler = this;
    const callOptional = node.optional;
    const { callee } = node;
    // A method: called with its object as this.
    if (callee.type === 'MemberExpression') {
      const { object, key, keyFn } = this.memberParts(callee, env);
      const memberOptional = callee.optional;
      return (s) => {
        const target = object(s);
        if (target === SHORT) return SHORT;
        if (target === null || target === undefined) {
          if (memberOptional) return SHORT;
          if (lenient) return undefined;
          throw compiler.nullMember(callee);
        }
        const fn = target[keyFn ? keyFn(s) : key];
        if (typeof fn !== 'function') {
          if (callOptional && (fn === null || fn === undefined)) return SHORT;
          if (lenient) return undefined;
          throw compiler.notFunction(node);
        }
        return Reflect.apply(fn, target, args(s));
      };
    }
    const fnOf = this.compile(callee, env);
    return (s) => {
      const fn = fnOf(s);
      if (fn === SHORT) return SHORT;
      if (typeof fn !== 'function') {
        if (callOptional && (fn === null || fn === undefined)) return SHORT;
        if (lenient) return undefined;
        throw compiler.notFunction(node);
      }
      return Reflect.apply(fn, undefined, args(s));
    };
  }

  unary(node, env) {
    const argument = this.compile(node.argument, env);
    switch (node.operator) {
      case '!':
        return (s) => !argument(s);
      case '-':
        return (s) => -argument(s);
      case '+':
        return (s) => +argument(s);
      case '~':
        return (s) => ~argument(s); // eslint-disable-line no-bitwise
      case 'typeof':
        return (s) => typeof argument(s);
      default:
        throw this.error(`Unsupported operator ${node.operator}`, node);
    }
  }

  binary(node, env) {
    const left = this.compile(node.left, env);
    const right = this.compile(node.right, env);
    /* eslint-disable eqeqeq, no-bitwise */
    switch (node.operator) {
      case '+':
        return (s) => left(s) + right(s);
      case '-':
        return (s) => left(s) - right(s);
      case '*':
        return (s) => left(s) * right(s);
      case '/':
        return (s) => left(s) / right(s);
      case '%':
        return (s) => left(s) % right(s);
      case '**':
        return (s) => left(s) ** right(s);
      case '==':
        return (s) => left(s) == right(s);
      case '!=':
        return (s) => left(s) != right(s);
      case '===':
        return (s) => left(s) === right(s);
      case '!==':
        return (s) => left(s) !== right(s);
      case '<':
        return (s) => left(s) < right(s);
      case '>':
        return (s) => left(s) > right(s);
      case '<=':
        return (s) => left(s) <= right(s);
      case '>=':
        return (s) => left(s) >= right(s);
      case '|':
        return (s) => left(s) | right(s);
      case '&':
        return (s) => left(s) & right(s);
      case '^':
        return (s) => left(s) ^ right(s);
      case '<<':
        return (s) => left(s) << right(s);
      case '>>':
        return (s) => left(s) >> right(s);
      case '>>>':
        return (s) => left(s) >>> right(s);
      case 'in':
        return (s) => left(s) in right(s);
      default:
        throw this.error(`Unsupported operator ${node.operator}`, node);
    }
    /* eslint-enable eqeqeq, no-bitwise */
  }

  logical(node, env) {
    const left = this.compile(node.left, env);
    const right = this.compile(node.right, env);
    switch (node.operator) {
      case '&&':
        return (s) => left(s) && right(s);
      case '||':
        return (s) => left(s) || right(s);
      default:
        return (s) => left(s) ?? right(s);
    }
  }

  // An arrow function: a function of JavaScript that runs its body here, with its arguments as a frame of names.
  arrow(node, env) {
    const body = this.compile(node.body, [...env, node.params]);
    return (s) =>
      (...args) =>
        body({ ctx: s.ctx, frame: args, up: s });
  }

  filter(node, env) {
    const { filters } = this;
    if (!filters || !Object.prototype.hasOwnProperty.call(filters, node.name)) {
      throw this.error(`Unknown filter ${node.name}`, node);
    }
    const fn = filters[node.name];
    const value = this.compile(node.expression, env);
    const args = this.argumentsOf(node.arguments, env);
    if (node.arguments.length === 0) return (s) => fn(value(s));
    return (s) => fn(value(s), ...args(s));
  }
}

// A key of an object made here: its own property (a key __proto__, which would set the prototype, is defined).
function define(object, key, value) {
  if (key === '__proto__') {
    Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
  } else object[key] = value;
}

// The function of a tree: it takes the context (an object: its properties are the names of the expression).
// The keys of a tree that is a path (a name and members of it by name: user.address.city), or null.
function pathOf(tree) {
  const keys = [];
  let node = tree.type === 'ChainExpression' ? tree.expression : tree;
  while (node.type === 'MemberExpression' && !node.computed) {
    keys.unshift(node.property);
    node = node.object;
  }
  if (node.type !== 'Identifier' || node.name === 'undefined') return null;
  keys.unshift(node.name);
  return keys.length > 1 ? keys : null;
}

// The function of a tree: it takes the context (an object: its properties are the names of the expression).
// A path read in a loop, without a scope; at null or undefined on the way, the general function gives what it gives
// there (undefined, or the error).
function pathReader(keys, options, general) {
  const [name, ...members] = keys;
  const { globals } = options;
  const hasGlobal = Object.prototype.hasOwnProperty.call(globals, name);
  const global = hasGlobal ? globals[name] : undefined;
  const { length } = members;
  return (context) => {
    const ctx = typeof context === 'object' && context !== null ? context : contextOf(context);
    let value = ctx[name];
    if (value === undefined && !(name in ctx)) {
      if (!hasGlobal) return general(context);
      value = global;
    }
    for (let i = 0; i < length; i += 1) {
      if (value === null || value === undefined) return general(context);
      value = value[members[i]];
    }
    return value;
  };
}

// The function of a tree: it takes the context (an object: its properties are the names of the expression). Closures
// first (a path, by a reader of its own); after inlineAfter runs, one function of JavaScript (see lib/codegen.js),
// which costs more to make than a few runs: expressions run a few times do not pay it. The first functions are shared
// by every expression, so V8 cannot specialize their reads; the one made reads each name and member where it is.
function compileTree(tree, source, options) {
  const compiler = new Compiler(source, options);
  const run = compiler.compile(tree, []);
  const general = (context) =>
    run({ ctx: typeof context === 'object' && context !== null ? context : contextOf(context), frame: null, up: null });
  const keys = pathOf(tree);
  const first = keys ? pathReader(keys, options, general) : general;
  if (!options.inline) return first;
  const after = options.inlineAfter;
  if (after <= 0) return generate(tree, compiler, options, SHORT) || first;
  let runs = 0;
  let fn = first;
  return (context) => {
    if (fn === first) {
      runs += 1;
      if (runs === after) fn = generate(tree, compiler, options, SHORT) || first;
    }
    return fn(context);
  };
}

export { compileTree, FORBIDDEN };
