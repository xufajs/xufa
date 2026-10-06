/*! xufa: @xufa/schema, @xufa/expression, @xufa/template, @xufa/yaml, @xufa/marshal, @xufa/router | MIT license */
// Made by tools/docs/lib/browser-bundle.js (pnpm docs): do not edit.
(function (root) {
  'use strict';
  var modules = {
"@xufa/expression/index.js": function (module, exports, require) {
// @xufa/expression: expressions of JavaScript (a safe part of it) compiled once and run many times, on data of their
// own. They read the context they are given, the parameters of their arrow functions and a few globals that compute
// (Math, JSON, Number...); they cannot assign, reach prototypes or constructors, nor anything else of the process.
//
//   const { compile, evaluate } = require('@xufa/expression');
//   const total = compile('items.filter(i => i.price > min).map(i => i.price * i.quantity)');
//   total({ items, min: 10 });
//   evaluate('user.name?.toUpperCase() ?? "anonymous"', { user });
const { parse } = require('./lib/parser');
const { compileTree, FORBIDDEN } = require('./lib/compiler');
const { GLOBALS } = require('./lib/globals');
const { ExpressionError, locate } = require('./lib/errors');

class Engine {
  // `globals`: names over the default ones (`builtins: false` leaves those out); `filters`: functions by name, which
  // makes `|` separate them (`price | round(2)`, the value first); `lenient`: members of null or undefined and calls of
  // what is not a function give undefined; `strict`: names not in the context nor the globals are errors;
  // `maxLength`: of a source (10000); `cacheSize`: of the expressions compiled kept (1000); `inline`: false keeps
  // expressions as closures (by default, those run `inlineAfter` times, 64, become one function of JavaScript).
  constructor(options = {}) {
    const { globals = {}, builtins = true, filters = null, lenient = false, strict = false } = options;
    this.globals = Object.freeze({ ...(builtins ? GLOBALS : {}), ...globals });
    this.filters = filters ? Object.freeze({ ...filters }) : null;
    this.lenient = Boolean(lenient);
    this.strict = Boolean(strict);
    this.maxLength = options.maxLength === undefined ? 10000 : options.maxLength;
    this.cacheSize = options.cacheSize === undefined ? 1000 : options.cacheSize;
    this.inline = options.inline !== false;
    this.inlineAfter = options.inlineAfter === undefined ? 64 : options.inlineAfter;
    this.cache = new Map();
  }

  parse(source) {
    this.check(source);
    return parse(source, { filters: Boolean(this.filters) });
  }

  check(source) {
    if (typeof source !== 'string') throw new TypeError('An expression is a string');
    if (source.length > this.maxLength) {
      throw new ExpressionError(`The expression is longer than ${this.maxLength} characters`, {
        code: 'XUFA_EXPR_ERR_LENGTH',
      });
    }
  }

  // The function of an expression: fn(context) gives its value. Kept for the next time.
  compile(source) {
    const cached = this.cache.get(source);
    if (cached) return cached;
    const tree = this.parse(source);
    const fn = compileTree(tree, source, this);
    Object.defineProperty(fn, 'source', { value: source });
    if (this.cacheSize > 0) {
      if (this.cache.size >= this.cacheSize) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(source, fn);
    }
    return fn;
  }

  evaluate(source, context) {
    return this.compile(source)(context);
  }
}

const engine = new Engine();

module.exports = {
  Engine,
  ExpressionError,
  locate,
  GLOBALS,
  FORBIDDEN,
  parse: (source, options) => parse(source, options),
  compile: (source) => engine.compile(source),
  evaluate: (source, context) => engine.evaluate(source, context),
};

},
"@xufa/expression/lib/codegen.js": function (module, exports, require) {
// An expression as one function of JavaScript, for those run often (see compileTree): its arrow functions are arrow
// functions of JavaScript, its operators those of JavaScript, and what must be checked (names of the context, members,
// calls, keys, optional chains) goes through helpers that check as the closures do and fail with their errors.
//
// Nothing of the source is code there: strings and keys are JSON literals, numbers are written by String(), operators
// come from a fixed list, and the parameters of arrow functions have names made here (a0, a1...). The tree was
// compiled to closures first, so its names and keys are checked already.
const { ExpressionError } = require('./errors');

// The context of a run that is not an object: {} for null and undefined, the object of a primitive for the others.
function contextOf(context) {
  return context === null || context === undefined ? {} : Object(context);
}

const BINARY = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',
  '==',
  '!=',
  '===',
  '!==',
  '<',
  '>',
  '<=',
  '>=',
  '|',
  '&',
  '^',
  '<<',
  '>>',
  '>>>',
  'in',
]);
const LOGICAL = new Set(['&&', '||', '??']);
const UNARY = new Set(['!', '-', '+', '~', 'typeof']);
const { hasOwnProperty } = Object.prototype;

function literal(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Object.is(value, -0) ? '(-0)' : `(${String(value)})`;
  if (typeof value === 'bigint') return `(${String(value)}n)`;
  if (value === true || value === false || value === null) return String(value);
  throw new Error(`Unexpected literal ${typeof value}`);
}

class Generator {
  constructor(compiler, SHORT) {
    this.compiler = compiler;
    this.SHORT = SHORT;
    this.nodes = [];
    this.names = 0;
    // The temporary variables of the function, and of each arrow function (declared where they are used).
    this.temps = [[]];
  }

  temp() {
    this.names += 1;
    const name = `t${this.names}`;
    this.temps[this.temps.length - 1].push(name);
    return name;
  }

  // The index of a node, for the errors of the helpers.
  at(node) {
    this.nodes.push(node);
    return this.nodes.length - 1;
  }

  // env: the parameters of the arrow functions around, innermost last: [{ name, as }].
  gen(node, env, chain = false) {
    switch (node.type) {
      case 'Literal':
        return literal(node.value);
      case 'Identifier': {
        for (let depth = env.length - 1; depth >= 0; depth -= 1) {
          const param = env[depth].find((item) => item.name === node.name);
          if (param) return param.as;
        }
        if (node.name === 'undefined') return '(void 0)';
        // The name read here (its own inline cache); what is not there, by the helper (in, globals, strict).
        const name = JSON.stringify(node.name);
        const t = this.temp();
        return `((${t} = ctx[${name}]) !== undefined ? ${t} : id(ctx, ${name}, ${this.at(node)}))`;
      }
      case 'TemplateLiteral': {
        const parts = [JSON.stringify(node.quasis[0])];
        node.expressions.forEach((expression, i) => {
          // Each value as a template literal of its own turns it to text (only code made here is in it).
          parts.push(`\`\${${this.gen(expression, env)}}\``, JSON.stringify(node.quasis[i + 1]));
        });
        return `(${parts.join(' + ')})`;
      }
      case 'ArrayExpression':
        return `[${node.elements.map((element) => this.item(element, env)).join(', ')}]`;
      case 'ObjectExpression': {
        const properties = node.properties.map((property) => {
          if (property.type === 'SpreadElement') return `...${this.gen(property.argument, env)}`;
          const value = this.gen(property.value, env);
          // __proto__ was refused as a key; computed keys are checked (and are own properties in JavaScript).
          if (!property.computed) return `${JSON.stringify(property.key)}: ${value}`;
          return `[K(${this.gen(property.key, env)}, ${this.at(property.key)})]: ${value}`;
        });
        return `({ ${properties.join(', ')} })`;
      }
      case 'MemberExpression': {
        const object = this.gen(node.object, env, chain);
        const key = this.key(node, env);
        if (chain) return `MS(${object}, ${key}, ${this.at(node)}, ${node.optional})`;
        // The member read here; null and undefined by the helper (undefined, or the error).
        const t = this.temp();
        return `((${t} = ${object}) === null || ${t} === undefined ? MN(${this.at(node)}) : ${t}[${key}])`;
      }
      case 'CallExpression':
        return this.call(node, env, chain);
      case 'ChainExpression':
        return `C(${this.gen(node.expression, env, true)})`;
      case 'UnaryExpression':
        if (!UNARY.has(node.operator)) throw new Error(`Unexpected operator ${node.operator}`);
        return `(${node.operator === 'typeof' ? 'typeof ' : node.operator}${this.gen(node.argument, env)})`;
      case 'BinaryExpression':
        if (!BINARY.has(node.operator)) throw new Error(`Unexpected operator ${node.operator}`);
        return `(${this.gen(node.left, env)} ${node.operator} ${this.gen(node.right, env)})`;
      case 'LogicalExpression':
        if (!LOGICAL.has(node.operator)) throw new Error(`Unexpected operator ${node.operator}`);
        return `(${this.gen(node.left, env)} ${node.operator} ${this.gen(node.right, env)})`;
      case 'ConditionalExpression':
        return `(${this.gen(node.test, env)} ? ${this.gen(node.consequent, env)} : ${this.gen(node.alternate, env)})`;
      case 'ArrowFunctionExpression': {
        const params = node.params.map((name) => {
          this.names += 1;
          return { name, as: `a${this.names}` };
        });
        this.temps.push([]);
        const body = this.gen(node.body, [...env, params]);
        const temps = this.temps.pop();
        const list = params.map((param) => param.as).join(', ');
        if (temps.length === 0) return `((${list}) => ${body})`;
        return `((${list}) => { let ${temps.join(', ')}; return ${body}; })`;
      }
      case 'Filter': {
        const args = [this.gen(node.expression, env), ...node.arguments.map((arg) => this.item(arg, env))];
        return `(0, FL[${JSON.stringify(node.name)}])(${args.join(', ')})`;
      }
      default:
        throw new Error(`Unexpected ${node.type}`);
    }
  }

  item(node, env) {
    return node.type === 'SpreadElement' ? `...${this.gen(node.argument, env)}` : this.gen(node, env);
  }

  key(node, env) {
    if (!node.computed) return JSON.stringify(node.property);
    return `K(${this.gen(node.property, env)}, ${this.at(node.property)})`;
  }

  call(node, env, chain) {
    const items = node.arguments.map((arg) => this.item(arg, env));
    const args = `[${items.join(', ')}]`;
    const callArgs = items.map((item) => `, ${item}`).join('');
    const index = this.at(node);
    const { callee } = node;
    if (callee.type === 'MemberExpression') {
      const object = this.gen(callee.object, env, chain);
      const key = this.key(callee, env);
      // In a chain, the arguments are evaluated only when the chain goes on.
      if (chain) return `CMS(${object}, ${key}, () => ${args}, ${index}, ${callee.optional}, ${node.optional})`;
      // The method read here and called with its object (f.call: expressions cannot assign, so no call of a function
      // is replaced but by the application); null objects and what is not a function by the helpers.
      const t = this.temp();
      const f = this.temp();
      return (
        `((${t} = ${object}) === null || ${t} === undefined ? CN(${index}) : ` +
        `typeof (${f} = ${t}[${key}]) !== 'function' ? NF(${index}) : ${f}.call(${t}${callArgs}))`
      );
    }
    const fn = this.gen(callee, env, chain);
    if (chain) return `CFS(${fn}, () => ${args}, ${index}, ${node.optional})`;
    return `CF(${fn}, ${args}, ${index})`;
  }

  // The helpers, as the closures of the compiler check and fail.
  helpers(options) {
    const { compiler, nodes, SHORT } = this;
    const { globals, filters, lenient, strict } = options;
    const RUNTIME = 'XUFA_EXPR_ERR_RUNTIME';
    const keyOf = (n) => compiler.keyOf(nodes[n]);
    const keys = new Map();
    return {
      id(ctx, name, n) {
        const value = ctx[name];
        if (value !== undefined || name in ctx) return value;
        if (hasOwnProperty.call(globals, name)) return globals[name];
        if (strict) throw compiler.error(`${name} is not defined`, nodes[n], RUNTIME);
        return undefined;
      },
      K(value, n) {
        if (typeof value === 'number' || typeof value === 'symbol') return value;
        let check = keys.get(n);
        if (!check) {
          check = keyOf(n);
          keys.set(n, check);
        }
        return check(value);
      },
      // A member of null or undefined: undefined (lenient) or the error.
      MN(n) {
        if (lenient) return undefined;
        throw compiler.nullMember(nodes[n]);
      },
      // A method of null or undefined.
      CN(n) {
        if (lenient) return undefined;
        throw compiler.nullMember(nodes[n].callee);
      },
      // A call of what is not a function.
      NF(n) {
        if (lenient) return undefined;
        throw compiler.notFunction(nodes[n]);
      },
      RA: Reflect.apply,
      M(object, key, n) {
        if (object === null || object === undefined) {
          if (lenient) return undefined;
          throw compiler.nullMember(nodes[n]);
        }
        return object[key];
      },
      MS(object, key, n, optional) {
        if (object === SHORT) return SHORT;
        if (object === null || object === undefined) {
          if (optional) return SHORT;
          if (lenient) return undefined;
          throw compiler.nullMember(nodes[n]);
        }
        return object[key];
      },
      CM(object, key, args, n) {
        if (object === null || object === undefined) {
          if (lenient) return undefined;
          throw compiler.nullMember(nodes[n].callee);
        }
        const fn = object[key];
        if (typeof fn !== 'function') {
          if (lenient) return undefined;
          throw compiler.notFunction(nodes[n]);
        }
        return Reflect.apply(fn, object, args);
      },
      CMS(object, key, args, n, memberOptional, callOptional) {
        if (object === SHORT) return SHORT;
        if (object === null || object === undefined) {
          if (memberOptional) return SHORT;
          if (lenient) return undefined;
          throw compiler.nullMember(nodes[n].callee);
        }
        const fn = object[key];
        if (typeof fn !== 'function') {
          if (callOptional && (fn === null || fn === undefined)) return SHORT;
          if (lenient) return undefined;
          throw compiler.notFunction(nodes[n]);
        }
        return Reflect.apply(fn, object, args());
      },
      CF(fn, args, n) {
        if (typeof fn !== 'function') {
          if (lenient) return undefined;
          throw compiler.notFunction(nodes[n]);
        }
        return Reflect.apply(fn, undefined, args);
      },
      CFS(fn, args, n, optional) {
        if (fn === SHORT) return SHORT;
        if (typeof fn !== 'function') {
          if (optional && (fn === null || fn === undefined)) return SHORT;
          if (lenient) return undefined;
          throw compiler.notFunction(nodes[n]);
        }
        return Reflect.apply(fn, undefined, args());
      },
      C: (value) => (value === SHORT ? undefined : value),
      S: (value) => `${value}`,
      FL: filters || {},
    };
  }
}

const HELPERS = ['id', 'K', 'M', 'MS', 'MN', 'CN', 'NF', 'RA', 'CM', 'CMS', 'CF', 'CFS', 'C', 'S', 'FL'];

// The function of a tree as JavaScript; null when functions cannot be made (code generation off).
function generate(tree, compiler, options, SHORT) {
  const generator = new Generator(compiler, SHORT);
  const body = generator.gen(tree, []);
  const helpers = generator.helpers(options);
  const [temps] = generator.temps;
  const declare = temps.length ? `let ${temps.join(', ')}; ` : '';
  try {
    // eslint-disable-next-line no-new-func
    const make = new Function(
      ...HELPERS,
      'contextOf',
      `"use strict"; return function expression(context) { const ctx = typeof context === 'object' && context !== null ? context : contextOf(context); ${declare}return ${body}; };`
    );
    return make(...HELPERS.map((name) => helpers[name]), contextOf);
  } catch (err) {
    if (err instanceof ExpressionError) throw err;
    return null;
  }
}

module.exports = { generate };

},
"@xufa/expression/lib/compiler.js": function (module, exports, require) {
// An expression as a function: each node of its tree a closure, made once. What it runs reads only the context given,
// the parameters of its arrow functions and the globals of its engine: no property can be named __proto__,
// constructor or prototype (nor the old accessors of Object.prototype), there is no assignment, and objects are made
// with their keys as their own properties (a key __proto__ is refused).
const { ExpressionError } = require('./errors');
const { generate } = require('./codegen');

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

module.exports = { compileTree, FORBIDDEN };

},
"@xufa/expression/lib/errors.js": function (module, exports, require) {
// The errors of expressions: of their syntax (XUFA_EXPR_ERR_SYNTAX), of what they cannot reach (XUFA_EXPR_ERR_FORBIDDEN)
// and of what fails while they run (XUFA_EXPR_ERR_RUNTIME), with where in the source they are.

// The line and column (both from 1) of a position of a source.
function locate(source, position) {
  let line = 1;
  let column = 1;
  for (let i = 0; i < position && i < source.length; i += 1) {
    if (source[i] === '\n') {
      line += 1;
      column = 1;
    } else column += 1;
  }
  return { line, column };
}

class ExpressionError extends Error {
  constructor(message, { code = 'XUFA_EXPR_ERR_SYNTAX', source, position } = {}) {
    const at = source !== undefined && position !== undefined ? locate(source, position) : null;
    super(at ? `${message} (line ${at.line}, column ${at.column})` : message);
    this.name = 'ExpressionError';
    this.code = code;
    if (at) {
      this.position = position;
      this.line = at.line;
      this.column = at.column;
    }
  }
}

module.exports = { ExpressionError, locate };

},
"@xufa/expression/lib/globals.js": function (module, exports, require) {
// The globals expressions have by default: functions and values that compute, and nothing that reaches the process,
// modules, timers, prototypes or constructors. Number, String and Boolean convert (Number('5')) and have their static
// helpers; Object, Array, JSON and Date have only what reads.

function withStatics(fn, source, names) {
  names.forEach((name) => {
    fn[name] = source[name];
  });
  return Object.freeze(fn);
}

const safeNumber = withStatics((value) => Number(value), Number, [
  'isInteger',
  'isFinite',
  'isNaN',
  'isSafeInteger',
  'parseFloat',
  'parseInt',
  'MAX_SAFE_INTEGER',
  'MIN_SAFE_INTEGER',
  'MAX_VALUE',
  'MIN_VALUE',
  'EPSILON',
  'POSITIVE_INFINITY',
  'NEGATIVE_INFINITY',
  'NaN',
]);
const safeString = withStatics((value) => String(value), String, ['fromCharCode', 'fromCodePoint']);
const safeBoolean = Object.freeze((value) => Boolean(value));

const GLOBALS = Object.freeze({
  Math,
  JSON: Object.freeze({ parse: JSON.parse, stringify: JSON.stringify }),
  Number: safeNumber,
  String: safeString,
  Boolean: safeBoolean,
  Array: Object.freeze({ isArray: Array.isArray }),
  Object: Object.freeze({
    keys: Object.keys,
    values: Object.values,
    entries: Object.entries,
    fromEntries: Object.fromEntries,
  }),
  Date: Object.freeze({ now: Date.now, parse: Date.parse }),
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  encodeURI,
  decodeURI,
  Infinity,
  NaN,
});

module.exports = { GLOBALS };

},
"@xufa/expression/lib/parser.js": function (module, exports, require) {
// The tree of an expression (nodes as those of ESTree: Literal, Identifier, MemberExpression...), by precedence
// climbing. Expressions only: no statements, assignments, `new`, `this`, functions other than arrow functions with an
// expression body, nor comments.
const { tokenize } = require('./tokenizer');
const { ExpressionError } = require('./errors');

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

module.exports = { parse, Parser };

},
"@xufa/expression/lib/tokenizer.js": function (module, exports, require) {
// The tokens of an expression: numbers, strings, template literals (their parts and the tokens of their ${}),
// names and punctuators. Each token has its type, value and position in the source.
const { ExpressionError } = require('./errors');

// Longest first, so '===' is not read as '==' and '='.
const PUNCTUATORS = [
  '>>>',
  '...',
  '===',
  '!==',
  '**',
  '?.',
  '??',
  '=>',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '<<',
  '>>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '!',
  '~',
  '&',
  '|',
  '^',
  '?',
  ':',
  ',',
  '.',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '=',
];

const NAME = /[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*/uy;
const DECIMAL = /(?:\d(?:_?\d)*)?(?:\.\d(?:_?\d)*|\.)?(?:[eE][+-]?\d(?:_?\d)*)?/y;
const RADIX = /0([xX][\da-fA-F](?:_?[\da-fA-F])*|[oO][0-7](?:_?[0-7])*|[bB][01](?:_?[01])*)(n?)/y;
const BIGINT = /(\d(?:_?\d)*)n/y;
const SPACE = /[\s\uFEFF]/;

const isDigit = (char) => char >= '0' && char <= '9';

// The value of an escape sequence at source[i] (after the backslash): [text, length].
function escapeAt(source, i, position) {
  const char = source[i];
  const simple = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v' };
  if (char in simple) return [simple[char], 1];
  if (char === '0' && !isDigit(source[i + 1] || '')) return ['\0', 1];
  if (char === 'x') {
    const hex = source.slice(i + 1, i + 3);
    if (!/^[\da-fA-F]{2}$/.test(hex)) throw new ExpressionError('Invalid \\x escape', { source, position });
    return [String.fromCharCode(parseInt(hex, 16)), 3];
  }
  if (char === 'u') {
    if (source[i + 1] === '{') {
      const end = source.indexOf('}', i + 2);
      const hex = end === -1 ? '' : source.slice(i + 2, end);
      const code = /^[\da-fA-F]{1,6}$/.test(hex) ? parseInt(hex, 16) : NaN;
      if (!(code <= 0x10ffff)) throw new ExpressionError('Invalid \\u escape', { source, position });
      return [String.fromCodePoint(code), end - i + 1];
    }
    const hex = source.slice(i + 1, i + 5);
    if (!/^[\da-fA-F]{4}$/.test(hex)) throw new ExpressionError('Invalid \\u escape', { source, position });
    return [String.fromCharCode(parseInt(hex, 16)), 5];
  }
  // A line continuation: nothing.
  if (char === '\r' && source[i + 1] === '\n') return ['', 2];
  if (char === '\n' || char === '\r' || char === ' ' || char === ' ') return ['', 1];
  if (isDigit(char)) throw new ExpressionError('Octal escapes are not allowed', { source, position });
  return [char, 1];
}

// Tokens from `start`; with `nested`, until the } that closes a ${ (its position is `end`).
function tokenize(source, start = 0, nested = false) {
  const tokens = [];
  let i = start;
  let depth = 0;
  const { length } = source;
  while (i < length) {
    const char = source[i];
    if (SPACE.test(char)) {
      i += 1;
      continue;
    }
    // Comments are not part of expressions.
    if (char === '/' && (source[i + 1] === '/' || source[i + 1] === '*')) {
      throw new ExpressionError('Comments are not allowed in expressions', { source, position: i });
    }
    if (isDigit(char) || (char === '.' && isDigit(source[i + 1] || ''))) {
      tokens.push(readNumber(source, i));
      i = tokens[tokens.length - 1].end;
      continue;
    }
    if (char === '"' || char === "'") {
      const token = readString(source, i);
      tokens.push(token);
      i = token.end;
      continue;
    }
    if (char === '`') {
      const token = readTemplate(source, i);
      tokens.push(token);
      i = token.end;
      continue;
    }
    NAME.lastIndex = i;
    const name = NAME.exec(source);
    if (name) {
      tokens.push({ type: 'name', value: name[0], start: i, end: i + name[0].length });
      i += name[0].length;
      continue;
    }
    let punctuator = null;
    for (let p = 0; p < PUNCTUATORS.length; p += 1) {
      if (source.startsWith(PUNCTUATORS[p], i)) {
        punctuator = PUNCTUATORS[p];
        break;
      }
    }
    // ?. followed by a digit is ? and a number (a ?.5 : 1).
    if (punctuator === '?.' && isDigit(source[i + 2] || '')) punctuator = '?';
    if (!punctuator) throw new ExpressionError(`Unexpected character ${JSON.stringify(char)}`, { source, position: i });
    if (nested) {
      if (punctuator === '{') depth += 1;
      else if (punctuator === '}') {
        if (depth === 0) return { tokens, end: i };
        depth -= 1;
      }
    }
    tokens.push({ type: 'punctuator', value: punctuator, start: i, end: i + punctuator.length });
    i += punctuator.length;
  }
  if (nested) throw new ExpressionError('Unterminated template literal', { source, position: start });
  return { tokens, end: i };
}

function readNumber(source, i) {
  RADIX.lastIndex = i;
  let match = RADIX.exec(source);
  let value;
  let end;
  if (match) {
    const digits = match[1].replace(/_/g, '');
    value = match[2] ? BigInt(`0${digits}`) : Number(`0${digits}`);
    end = i + match[0].length;
  } else {
    BIGINT.lastIndex = i;
    match = BIGINT.exec(source);
    if (match) {
      value = BigInt(match[1].replace(/_/g, ''));
      end = i + match[0].length;
    } else {
      DECIMAL.lastIndex = i;
      match = DECIMAL.exec(source);
      value = Number(match[0].replace(/_/g, ''));
      end = i + match[0].length;
    }
  }
  // 3in, 1x: a number touching a name is an error, as in JavaScript.
  NAME.lastIndex = end;
  if (NAME.exec(source) && NAME.lastIndex > end) {
    throw new ExpressionError('Invalid number', { source, position: i });
  }
  return { type: 'number', value, start: i, end };
}

function readString(source, i) {
  const quote = source[i];
  let value = '';
  let j = i + 1;
  for (;;) {
    if (j >= source.length) throw new ExpressionError('Unterminated string', { source, position: i });
    const char = source[j];
    if (char === quote) break;
    if (char === '\n' || char === '\r') throw new ExpressionError('Unterminated string', { source, position: i });
    if (char === '\\') {
      const [text, length] = escapeAt(source, j + 1, j);
      value += text;
      j += 1 + length;
    } else {
      value += char;
      j += 1;
    }
  }
  return { type: 'string', value, start: i, end: j + 1 };
}

// A template literal: its texts (cooked) and the tokens of each ${}.
function readTemplate(source, i) {
  const quasis = [];
  const expressions = [];
  let text = '';
  let j = i + 1;
  for (;;) {
    if (j >= source.length) throw new ExpressionError('Unterminated template literal', { source, position: i });
    const char = source[j];
    if (char === '`') break;
    if (char === '\\') {
      const [escaped, length] = escapeAt(source, j + 1, j);
      text += escaped;
      j += 1 + length;
    } else if (char === '$' && source[j + 1] === '{') {
      quasis.push(text);
      text = '';
      const inner = tokenize(source, j + 2, true);
      expressions.push({ tokens: inner.tokens, start: j + 2, end: inner.end });
      j = inner.end + 1;
    } else {
      // Line ends are \n, as JavaScript reads them in template literals.
      if (char === '\r') text += source[j + 1] === '\n' ? '' : '\n';
      else text += char;
      j += 1;
    }
  }
  quasis.push(text);
  return { type: 'template', quasis, expressions, start: i, end: j + 1 };
}

module.exports = { tokenize };

},
"@xufa/expression/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/expression","version":"0.1.0"};
},
"@xufa/marshal/index.js": function (module, exports, require) {
// @xufa/marshal: values as JSON that keeps classes, references, cycles and the types JSON does not have.
const { marshal, unmarshal, stringify, parse } = require('./lib/marshal');
const { clone } = require('./lib/clone');
const { Registry, registry, ENCODE, DECODE } = require('./lib/registry');
const { MarshalError } = require('./lib/errors');

module.exports = { marshal, unmarshal, stringify, parse, clone, Registry, registry, ENCODE, DECODE, MarshalError };

},
"@xufa/marshal/lib/clone.js": function (module, exports, require) {
// A deep copy that keeps what structuredClone loses: the class of every instance (its prototype, registered or not:
// in the process, the class is at hand), getters left out as structuredClone does, symbols that are global or not,
// and functions (by reference). Shared objects and cycles are kept. Registered classes with encode/decode are copied
// through them (for state in private fields).
const { registry: defaultRegistry } = require('./registry');
const { MarshalError, guard } = require('./errors');
const { types } = require('node:util');

// An error: native (Error.isError, or util.types before Node 24), or of a class that extends Error.
const isNative = typeof Error.isError === 'function' ? Error.isError : types.isNativeError;
const isError = (value) => isNative(value) || value instanceof Error;

function clone(value, options = {}) {
  const { registry = defaultRegistry, maxDepth = 1000 } = options;
  const copies = new Map();

  const define = (target, key, item) =>
    Object.defineProperty(target, key, { value: item, enumerable: true, writable: true, configurable: true });

  function copyFields(source, target, depth, own = Object.keys(source)) {
    for (const key of own) define(target, key, copy(source[key], depth));
    return target;
  }

  function copy(input, depth) {
    if (input === null || (typeof input !== 'object' && typeof input !== 'function')) return input;
    if (typeof input === 'function') return input;
    const known = copies.get(input);
    if (known !== undefined) return known;
    if (depth > maxDepth) throw new MarshalError(`Deeper than maxDepth (${maxDepth})`, 'XUFA_MARSHAL_ERR_DEPTH');
    const next = depth + 1;
    const keep = (target) => {
      copies.set(input, target);
      return target;
    };

    if (Array.isArray(input)) {
      const array = keep(new Array(input.length));
      for (let i = 0; i < input.length; i += 1) if (i in input) array[i] = copy(input[i], next);
      return array;
    }
    const proto = Object.getPrototypeOf(input);
    if (proto === Object.prototype || proto === null) {
      return copyFields(input, keep(proto === null ? Object.create(null) : {}), next);
    }
    const entry = registry.byClass.get(proto.constructor);
    if (entry && entry.encode && !isError(input)) {
      return keep(entry.decode(copy(entry.encode(input), next)));
    }
    if (types.isDate(input)) return keep(new Date(input.getTime()));
    if (types.isRegExp(input)) {
      const regexp = keep(new RegExp(input.source, input.flags));
      regexp.lastIndex = input.lastIndex;
      return regexp;
    }
    if (types.isMap(input)) {
      const map = keep(new Map());
      for (const [key, item] of input) map.set(copy(key, next), copy(item, next));
      return map;
    }
    if (types.isSet(input)) {
      const set = keep(new Set());
      for (const item of input) set.add(copy(item, next));
      return set;
    }
    if (typeof Buffer === 'function' && Buffer.isBuffer(input)) return keep(Buffer.from(input));
    if (ArrayBuffer.isView(input)) {
      const bytes = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
      if (types.isDataView(input)) return keep(new DataView(bytes));
      return keep(new input.constructor(bytes));
    }
    if (types.isArrayBuffer(input)) return keep(input.slice(0));
    if (input instanceof URL) return keep(new URL(input.href));
    if (input instanceof URLSearchParams) return keep(new URLSearchParams(input));
    if (types.isBoxedPrimitive(input)) {
      return keep(Object(input.valueOf()));
    }
    if (types.isPromise(input) || types.isWeakMap(input) || types.isWeakSet(input)) {
      throw new MarshalError(`A ${proto.constructor.name} cannot be copied`, 'XUFA_MARSHAL_ERR_TYPE');
    }
    const target = keep(Object.create(proto));
    if (isError(input)) {
      for (const key of ['message', 'stack', 'cause', 'errors']) {
        if (Object.hasOwn(input, key)) {
          Object.defineProperty(target, key, {
            value: copy(input[key], next),
            enumerable: false,
            writable: true,
            configurable: true,
          });
        }
      }
    }
    // An instance of any class: its prototype, and a copy of its own enumerable fields.
    return copyFields(input, target, next);
  }

  return copy(value, 0);
}

module.exports = { clone: guard(clone) };

},
"@xufa/marshal/lib/errors.js": function (module, exports, require) {
class MarshalError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'MarshalError';
    this.code = code;
  }
}

// A stack that ends before maxDepth (deep callers, a small stack) is the same error as maxDepth.
function guard(fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      if (err instanceof RangeError && /call stack/.test(err.message)) {
        throw new MarshalError('Too deep for the stack (lower maxDepth)', 'XUFA_MARSHAL_ERR_DEPTH');
      }
      throw err;
    }
  };
}

module.exports = { MarshalError, guard };

},
"@xufa/marshal/lib/marshal.js": function (module, exports, require) {
// marshal(value) writes a value as a JSON-safe array of nodes, unmarshal(nodes) makes it again; stringify() and
// parse() are the same through JSON text. What JSON cannot say is kept: undefined, NaN, Infinity, -0, holes, BigInt,
// Date, RegExp, Map, Set, Buffer and typed arrays, Error (with its cause, stack and fields), URL, boxed primitives,
// global symbols, objects without prototype, the instances of registered classes (as themselves), and the shape of
// the graph: an object referenced twice is one object again, and cycles come back as cycles.
//
// The format (after devalue): nodes[0] is the value. A node is a JSON primitive (the value), an array of indexes (an
// array: its items), an object of indexes (a plain object: its fields), or a tagged array, whose first item is a
// string: ["Date", ms], ["Map", k1, v1, ...], ["Class", name, {fields}]... Arrays of values hold only numbers, so a
// string first is always a tag. Negative indexes are constants (undefined, a hole, NaN, the infinities, -0).
//
// Decoding is safe for input from outside: no constructor or global is looked up by a name of the input (only the
// registered classes and a fixed list of built-ins), constructors are not called (instances are made from their
// prototype), "__proto__" is a field like any other, and depth and size have limits.
const { MarshalError, guard } = require('./errors');
const { types } = require('node:util');

// An error: native (Error.isError, or util.types before Node 24), or of a class that extends Error.
const isNative = typeof Error.isError === 'function' ? Error.isError : types.isNativeError;
const isError = (value) => isNative(value) || value instanceof Error;
const { registry: defaultRegistry } = require('./registry');

const UNDEFINED = -1;
const HOLE = -2;
const NAN = -3;
const POSITIVE_INFINITY = -4;
const NEGATIVE_INFINITY = -5;
const NEGATIVE_ZERO = -6;

const TYPED_ARRAYS = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
};
if (typeof Float16Array === 'function') TYPED_ARRAYS.Float16Array = Float16Array; // eslint-disable-line no-undef
const ERRORS = { Error, TypeError, RangeError, SyntaxError, ReferenceError, EvalError, URIError, AggregateError };

const fail = (message, code = 'XUFA_MARSHAL_ERR_INPUT') => {
  throw new MarshalError(message, code);
};

const DEFAULTS = { maxDepth: 1000, maxNodes: 10000000, unknown: 'object', functions: 'throw', stack: true };

// The kind of a typed array, from the array itself (not its prototype chain, which can be anything).
const tagOf = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag).get;
const typedArrayName = (view) => {
  const name = tagOf.call(view);
  return Object.hasOwn(TYPED_ARRAYS, name) ? name : undefined;
};

// Whether the fields of an instance can be assigned (fast) rather than defined: no setter, getter or read-only
// property in the prototypes of the class (below Object.prototype), so an assignment only makes an own field. Known
// once by class.
const assignables = new WeakMap();
function assignable(Class) {
  let known = assignables.get(Class);
  if (known === undefined) {
    known = true;
    for (let proto = Class.prototype; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
      for (const key of Reflect.ownKeys(proto)) {
        if (key === 'constructor') continue;
        const descriptor = Object.getOwnPropertyDescriptor(proto, key);
        if (descriptor.get || descriptor.set || descriptor.writable === false) known = false;
      }
    }
    assignables.set(Class, known);
  }
  return known;
}

// Buffer where there is one (Node.js); base64 by btoa and atob where there is not (browsers).
const HAS_BUFFER = typeof Buffer === 'function';
const isBuffer = (value) => HAS_BUFFER && Buffer.isBuffer(value);
function bytesOf(view) {
  if (HAS_BUFFER) return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('base64');
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let text = '';
  for (let i = 0; i < bytes.length; i += 1) text += String.fromCharCode(bytes[i]);
  return globalThis.btoa(text);
}
function bytesFrom(text) {
  if (HAS_BUFFER) return Buffer.from(text, 'base64');
  const binary = globalThis.atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- Encoding.

function marshal(value, options = {}) {
  const { registry = defaultRegistry, maxDepth, unknown, functions, stack } = { ...DEFAULTS, ...options };
  const nodes = [];
  const indexes = new Map(); // objects (and strings, bigints) => their node

  // A value as an index (or constant); with functions: 'skip', a function is SKIP (a field left out, or undefined).
  function add(input, depth) {
    switch (typeof input) {
      case 'undefined':
        return UNDEFINED;
      case 'number':
        if (Number.isNaN(input)) return NAN;
        if (input === Infinity) return POSITIVE_INFINITY;
        if (input === -Infinity) return NEGATIVE_INFINITY;
        if (input === 0 && 1 / input < 0) return NEGATIVE_ZERO;
        return push(input);
      case 'boolean':
        return push(input);
      case 'string':
        return shared(input, input);
      case 'bigint':
        return shared(input, ['BigInt', input.toString()]);
      case 'symbol': {
        const key = Symbol.keyFor(input);
        if (key === undefined)
          fail('A symbol that is not global (Symbol.for) cannot be written', 'XUFA_MARSHAL_ERR_TYPE');
        return shared(input, ['Symbol', key]);
      }
      case 'function':
        if (functions === 'skip') return SKIP;
        return fail(`A function cannot be written${input.name ? `: ${input.name}` : ''}`, 'XUFA_MARSHAL_ERR_TYPE');
      default:
        break;
    }
    if (input === null) return push(null);
    const known = indexes.get(input);
    if (known !== undefined) return known;
    if (depth > maxDepth) fail(`Deeper than maxDepth (${maxDepth})`, 'XUFA_MARSHAL_ERR_DEPTH');
    // The index first: the children can point back to it (cycles).
    const index = nodes.length;
    nodes.push(null);
    indexes.set(input, index);
    nodes[index] = nodeOf(input, depth + 1);
    return index;
  }

  // add(), where a function left out is undefined.
  function val(input, depth) {
    const index = add(input, depth);
    return index === SKIP ? UNDEFINED : index;
  }

  function push(node) {
    nodes.push(node);
    return nodes.length - 1;
  }

  // Strings and bigints are written once.
  function shared(key, node) {
    const known = indexes.get(key);
    if (known !== undefined) return known;
    const index = push(node);
    indexes.set(key, index);
    return index;
  }

  function fieldsOf(object, depth) {
    const fields = {};
    for (const key of Object.keys(object)) {
      const index = add(object[key], depth);
      if (index === SKIP) continue;
      if (key === '__proto__') Object.defineProperty(fields, key, { value: index, enumerable: true, writable: true });
      else fields[key] = index;
    }
    return fields;
  }

  function nodeOf(input, depth) {
    if (Array.isArray(input)) {
      const items = new Array(input.length);
      for (let i = 0; i < input.length; i += 1) {
        items[i] = i in input ? val(input[i], depth) : HOLE;
      }
      return items;
    }
    const proto = Object.getPrototypeOf(input);
    if (proto === Object.prototype) return fieldsOf(input, depth);
    if (proto === null) return ['Null', fieldsOf(input, depth)];
    const entry = registry.byClass.get(proto.constructor);
    if (entry && !isError(input)) {
      if (entry.encode) return ['Class', entry.name, val(entry.encode(input), depth), 1];
      return ['Class', entry.name, fieldsOf(input, depth)];
    }
    if (types.isDate(input)) {
      const time = input.getTime();
      return ['Date', Number.isNaN(time) ? null : time];
    }
    if (types.isRegExp(input)) return ['RegExp', input.source, input.flags];
    if (types.isMap(input)) {
      const node = ['Map'];
      for (const [key, item] of input) node.push(val(key, depth), val(item, depth));
      return node;
    }
    if (types.isSet(input)) {
      const node = ['Set'];
      for (const item of input) node.push(val(item, depth));
      return node;
    }
    if (isBuffer(input)) return ['Buffer', bytesOf(input)];
    if (ArrayBuffer.isView(input)) {
      if (types.isDataView(input)) return ['DataView', bytesOf(input)];
      const name = typedArrayName(input);
      if (name) return ['TypedArray', name, bytesOf(input)];
    }
    if (types.isArrayBuffer(input)) return ['ArrayBuffer', bytesOf(new Uint8Array(input))];
    if (isError(input)) return errorNode(input, entry, depth);
    if (input instanceof URL) return ['URL', input.href];
    if (input instanceof URLSearchParams) return ['URLSearchParams', input.toString()];
    if (types.isBoxedPrimitive(input)) {
      return ['Boxed', val(input.valueOf(), depth)];
    }
    // An instance of a class not registered.
    const name = (proto && proto.constructor && proto.constructor.name) || 'an object';
    if (unknown === 'error' || isOpaque(input)) {
      return fail(`${name} is not a registered class (registry.register(${name}))`, 'XUFA_MARSHAL_ERR_CLASS');
    }
    return fieldsOf(input, depth);
  }

  // ["Error", class or built-in name, message, stack, {fields}, cause, errors]
  function errorNode(error, entry, depth) {
    let kind = 'Error';
    if (entry) kind = `Class:${entry.name}`;
    else {
      const builtin = Object.keys(ERRORS).find((key) => Object.getPrototypeOf(error) === ERRORS[key].prototype);
      if (builtin) kind = builtin;
    }
    const fields = fieldsOf(error, depth);
    // The name of a custom error of no registered class is kept as a field.
    if (kind === 'Error' && error.name !== 'Error' && !('name' in fields)) fields.name = val(error.name, depth);
    return [
      'Error',
      kind,
      val(error.message, depth),
      stack && typeof error.stack === 'string' ? val(error.stack, depth) : UNDEFINED,
      fields,
      'cause' in error ? val(error.cause, depth) : HOLE,
      error instanceof AggregateError ? val(error.errors, depth) : HOLE,
    ];
  }

  // A value that is a constant (undefined, NaN, -0...) has no node: the root is a node that says which.
  const root = val(value, 0);
  return root < 0 ? [['Value', root]] : nodes;
}

const SKIP = Symbol('skip');

// Objects whose state is not in their fields (promises, weak collections, streams...): writing their fields would
// lose them quietly.
function isOpaque(input) {
  return (
    types.isPromise(input) ||
    types.isWeakMap(input) ||
    types.isWeakSet(input) ||
    (typeof WeakRef === 'function' && input instanceof WeakRef) ||
    typeof input.then === 'function'
  );
}

// --- Decoding.

function unmarshal(nodes, options = {}) {
  const { registry = defaultRegistry, maxDepth, maxNodes, unknown } = { ...DEFAULTS, ...options };
  if (!Array.isArray(nodes) || nodes.length === 0) fail('Not marshalled data: an array of nodes is expected');
  if (nodes.length > maxNodes) fail(`More nodes than maxNodes (${maxNodes})`, 'XUFA_MARSHAL_ERR_SIZE');
  const values = new Array(nodes.length);
  const state = new Uint8Array(nodes.length); // 0: not made, 1: being made (a class with decode), 2: made

  const set = (object, key, item) => {
    if (key === '__proto__')
      Object.defineProperty(object, key, { value: item, enumerable: true, writable: true, configurable: true });
    else object[key] = item;
  };
  // Fields of an instance: defined, so that no setter of its prototype runs.
  const define = (object, key, item) =>
    Object.defineProperty(object, key, { value: item, enumerable: true, writable: true, configurable: true });

  function fill(target, fields, depth, put) {
    if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) fail('Fields must be an object');
    for (const key of Object.keys(fields)) put(target, key, get(fields[key], depth));
    return target;
  }

  function get(index, depth) {
    if (typeof index !== 'number' || !Number.isInteger(index)) fail(`Not an index: ${JSON.stringify(index)}`);
    if (index < 0) {
      switch (index) {
        case UNDEFINED:
          return undefined;
        case NAN:
          return NaN;
        case POSITIVE_INFINITY:
          return Infinity;
        case NEGATIVE_INFINITY:
          return -Infinity;
        case NEGATIVE_ZERO:
          return -0;
        default:
          return fail(`Not a constant: ${index}`);
      }
    }
    if (index >= nodes.length) fail(`An index out of the nodes: ${index}`);
    if (state[index] === 2) return values[index];
    if (state[index] === 1) fail('A cycle through an instance made by decode()', 'XUFA_MARSHAL_ERR_CYCLE');
    if (depth > maxDepth) fail(`Deeper than maxDepth (${maxDepth})`, 'XUFA_MARSHAL_ERR_DEPTH');
    const node = nodes[index];
    if (node === null || typeof node !== 'object') {
      if (typeof node === 'number' && !Number.isFinite(node)) fail('A number that is not finite');
      return made(index, node);
    }
    if (!Array.isArray(node)) return fill(made(index, {}), node, depth + 1, set);
    if (typeof node[0] !== 'string') {
      const array = made(index, new Array(node.length));
      for (let i = 0; i < node.length; i += 1) if (node[i] !== HOLE) array[i] = get(node[i], depth + 1);
      return array;
    }
    return tagged(index, node, depth + 1);
  }

  function made(index, value) {
    values[index] = value;
    state[index] = 2;
    return value;
  }

  const bytes = (text) => {
    if (typeof text !== 'string') fail('Bytes must be base64 text');
    return bytesFrom(text);
  };

  function tagged(index, node, depth) {
    const [tag] = node;
    switch (tag) {
      case 'Date':
        return made(index, new Date(node[1] === null ? NaN : Number(node[1])));
      case 'RegExp':
        if (typeof node[1] !== 'string' || typeof node[2] !== 'string') fail('A RegExp needs its source and flags');
        try {
          return made(index, new RegExp(node[1], node[2]));
        } catch (err) {
          return fail(`Not a RegExp: ${err.message}`);
        }
      case 'BigInt':
        if (typeof node[1] !== 'string' || !/^-?\d+$/.test(node[1])) fail('Not a BigInt');
        return made(index, BigInt(node[1]));
      case 'Symbol':
        if (typeof node[1] !== 'string') fail('Not a symbol');
        return made(index, Symbol.for(node[1]));
      case 'Map': {
        if (node.length % 2 === 0) fail('A Map needs a value for each key');
        const map = made(index, new Map());
        for (let i = 1; i + 1 < node.length; i += 2) map.set(get(node[i], depth), get(node[i + 1], depth));
        return map;
      }
      case 'Set': {
        const set_ = made(index, new Set());
        for (let i = 1; i < node.length; i += 1) set_.add(get(node[i], depth));
        return set_;
      }
      case 'Null':
        return fill(made(index, Object.create(null)), node[1], depth, define);
      case 'Buffer':
        return made(index, bytes(node[1]));
      case 'ArrayBuffer': {
        const buffer = bytes(node[1]);
        return made(index, buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      }
      case 'DataView': {
        const buffer = bytes(node[1]);
        return made(index, new DataView(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)));
      }
      case 'TypedArray': {
        const Type = Object.hasOwn(TYPED_ARRAYS, node[1]) ? TYPED_ARRAYS[node[1]] : null;
        if (!Type) fail(`Not a typed array: ${node[1]}`);
        const buffer = bytes(node[2]);
        if (buffer.byteLength % Type.BYTES_PER_ELEMENT !== 0) fail(`Bytes that are no ${node[1]}`);
        const copy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return made(index, new Type(copy));
      }
      case 'URL':
        try {
          return made(index, new URL(node[1]));
        } catch {
          return fail('Not a URL');
        }
      case 'URLSearchParams':
        if (typeof node[1] !== 'string') fail('Not URLSearchParams');
        return made(index, new URLSearchParams(node[1]));
      case 'Boxed': {
        const primitive = get(node[1], depth);
        if (primitive === null || primitive === undefined || typeof primitive === 'object') fail('Not a primitive');
        return made(index, Object(primitive));
      }
      case 'Value':
        if (index !== 0 || !(node[1] < 0)) fail('A constant node that is not the root');
        return get(node[1], depth);
      case 'Class':
        return instance(index, node, depth);
      case 'Error':
        return error(index, node, depth);
      default:
        return fail(`Not a tag: ${JSON.stringify(tag)}`);
    }
  }

  function classOf(name) {
    if (typeof name !== 'string') fail('A class needs a name');
    const entry = registry.byName.get(name);
    if (!entry && unknown === 'error') fail(`${name} is not a registered class`, 'XUFA_MARSHAL_ERR_CLASS');
    return entry;
  }

  function instance(index, [, name, data, hooked], depth) {
    const entry = classOf(name);
    if (hooked) {
      // The data first, then the instance (a cycle through it cannot be made).
      state[index] = 1;
      const decoded = get(data, depth);
      state[index] = 0;
      if (!entry) return made(index, decoded);
      if (!entry.decode) fail(`${name} was written by its encode(), and has no decode()`, 'XUFA_MARSHAL_ERR_CLASS');
      return made(index, entry.decode(decoded));
    }
    if (entry && entry.decode) fail(`${name} has a decode(), but was written without it`, 'XUFA_MARSHAL_ERR_CLASS');
    const target = made(index, entry ? Object.create(entry.Class.prototype) : {});
    return fill(target, data, depth, entry ? (assignable(entry.Class) ? set : define) : set);
  }

  // ["Error", kind, message, stack, {fields}, cause, errors]
  function error(index, [, kind, message, stack, fields, cause, errors], depth) {
    let proto = Error.prototype;
    if (typeof kind === 'string' && kind.startsWith('Class:')) {
      const entry = classOf(kind.slice(6));
      if (entry) proto = entry.Class.prototype;
    } else if (typeof kind === 'string' && Object.hasOwn(ERRORS, kind)) {
      proto = ERRORS[kind].prototype;
    }
    const target = made(index, Object.create(proto));
    const hidden = (key, value) =>
      Object.defineProperty(target, key, { value, enumerable: false, writable: true, configurable: true });
    hidden('message', String(get(message, depth)));
    const trace = get(stack, depth);
    if (trace !== undefined) hidden('stack', String(trace));
    if (cause !== HOLE) hidden('cause', get(cause, depth));
    if (errors !== HOLE) hidden('errors', get(errors, depth));
    return fill(target, fields, depth, define);
  }

  return get(0, 0);
}

function stringify(value, options) {
  return JSON.stringify(marshal(value, options));
}

function parse(text, options) {
  let nodes;
  try {
    nodes = JSON.parse(text);
  } catch (err) {
    return fail(`Not JSON: ${err.message}`);
  }
  return unmarshal(nodes, options);
}

module.exports = {
  marshal: guard(marshal),
  unmarshal: guard(unmarshal),
  stringify: guard(stringify),
  parse: guard(parse),
};

},
"@xufa/marshal/lib/registry.js": function (module, exports, require) {
// The classes whose instances come back as themselves. A class is known by a name (its own, or one given) and can
// say how it is written: `encode(instance)` gives the data that is written (marshalled in turn) and
// `decode(data)` makes the instance again, as options of register() or as static methods of the class under the
// symbols ENCODE and DECODE. Without them, the own enumerable fields of the instance are written, and an instance is
// made again from the prototype of the class with those fields, without calling its constructor.
const { MarshalError } = require('./errors');

const ENCODE = Symbol.for('xufa.marshal.encode');
const DECODE = Symbol.for('xufa.marshal.decode');

class Registry {
  constructor() {
    this.byName = new Map();
    this.byClass = new Map();
  }

  // register(Class, { name, encode, decode }), or register(ClassA, ClassB, ...).
  register(Class, ...rest) {
    if (rest.length > 0 && typeof rest[0] === 'function') {
      [Class, ...rest].forEach((each) => this.register(each));
      return this;
    }
    const options = rest[0] || {};
    if (typeof Class !== 'function' || !Class.prototype) {
      throw new MarshalError('register() takes classes', 'XUFA_MARSHAL_ERR_REGISTER');
    }
    const name = options.name === undefined ? Class.name : options.name;
    if (typeof name !== 'string' || name === '') {
      throw new MarshalError('A class needs a name to be registered', 'XUFA_MARSHAL_ERR_REGISTER');
    }
    const taken = this.byName.get(name);
    if (taken && taken.Class !== Class) {
      throw new MarshalError(
        `Another class is registered as ${name}: give this one another name ({ name })`,
        'XUFA_MARSHAL_ERR_REGISTER'
      );
    }
    const encode = options.encode || (typeof Class[ENCODE] === 'function' ? (v) => Class[ENCODE](v) : null);
    const decode = options.decode || (typeof Class[DECODE] === 'function' ? (d) => Class[DECODE](d) : null);
    if (Boolean(encode) !== Boolean(decode)) {
      throw new MarshalError(`${name}: encode and decode go together`, 'XUFA_MARSHAL_ERR_REGISTER');
    }
    const entry = { Class, name, encode, decode };
    this.byName.set(name, entry);
    this.byClass.set(Class, entry);
    return this;
  }

  unregister(Class) {
    const entry = this.byClass.get(Class);
    if (entry) {
      this.byClass.delete(Class);
      this.byName.delete(entry.name);
    }
    return this;
  }

  has(Class) {
    return this.byClass.has(Class);
  }
}

// The registry used when none is given.
const registry = new Registry();

module.exports = { Registry, registry, ENCODE, DECODE };

},
"@xufa/marshal/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/marshal","version":"0.1.0"};
},
"@xufa/router/index.js": function (module, exports, require) {
// @xufa/router: an HTTP router with the API of find-my-way.
//
// Routes live in a radix tree per method (static parts, parameters, regular expressions, wildcards, with
// backtracking), and the routes without parameters are also kept in a Map per method: most requests are found with a
// single lookup by path.
const { METHODS } = require('node:http');
const { StaticNode, NODE_TYPES } = require('./lib/node');
const { compileTree } = require('./lib/compile');
const { Constrainer, NullObject } = require('./lib/constraints');
const { prettyPrintTree } = require('./lib/pretty-print');
const { isSafeRegex } = require('./lib/safe-regex');
const strategies = require('./lib/strategies');
const url = require('./lib/url');

const { splitEncoded, decodeParam, pathFromAbsoluteURL, removeDuplicateSlashes, trimLastSlash } = url;
const { deepEqualConstraints } = strategies;

const httpMethods = [...new Set([...METHODS, 'QUERY'])].sort();
const OPTIONAL_PARAM = /(\/:[^/()]*?)\?(\/?)/;
const ESCAPE_REGEXP = /[.*+?^${}()|[\]\\]/g;

const escapeRegExp = (string) => string.replace(ESCAPE_REGEXP, '\\$&');

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.code = 'ERR_ASSERTION';
    throw err;
  }
}

function closingParenthesis(path, index) {
  let depth = 1;
  let i = index;
  while (i < path.length) {
    i += 1;
    if (path.charCodeAt(i) === 92) {
      i += 1; // escaped character
    } else if (path.charCodeAt(i) === 41) {
      depth -= 1;
    } else if (path.charCodeAt(i) === 40) {
      depth += 1;
    }
    if (depth === 0) return i;
  }
  throw new TypeError(`Invalid regexp expression in "${path}"`);
}

// Drops the ^ and $ of a regular expression of a parameter: it is a part of the expression of its node.
function trimRegExp(source) {
  let out = source;
  if (out.charCodeAt(1) === 94) out = out.slice(0, 1) + out.slice(2);
  if (out.charCodeAt(out.length - 2) === 36) out = out.slice(0, out.length - 2) + out.slice(out.length - 1);
  return out;
}

function defaultBuildPrettyMeta(route) {
  if (!route || !route.store) return {};
  return { ...route.store };
}

// Routes whose walk in the tree costs less than this many steps are not put in the map of static routes.
const STATIC_INDEX_MIN_COST = 4;

const FOUND = 0;
const BAD_URL = 1;
const MAX_PARAM_LENGTH = 2;

class Router {
  constructor(opts = {}) {
    this._opts = opts;
    if (opts.defaultRoute) assert(typeof opts.defaultRoute === 'function', 'The default route must be a function');
    if (opts.onBadUrl) assert(typeof opts.onBadUrl === 'function', 'The bad url handler must be a function');
    if (opts.buildPrettyMeta) assert(typeof opts.buildPrettyMeta === 'function', 'buildPrettyMeta must be a function');
    if (opts.querystringParser) {
      assert(typeof opts.querystringParser === 'function', 'querystringParser must be a function');
    }
    this.defaultRoute = opts.defaultRoute || null;
    this.onBadUrl = opts.onBadUrl || null;
    this.buildPrettyMeta = opts.buildPrettyMeta || defaultBuildPrettyMeta;
    this.querystringParser = opts.querystringParser || defaultQuerystringParser;
    this.caseSensitive = opts.caseSensitive === undefined ? true : opts.caseSensitive;
    this.ignoreTrailingSlash = opts.ignoreTrailingSlash || false;
    this.ignoreDuplicateSlashes = opts.ignoreDuplicateSlashes || false;
    this.maxParamLength = opts.maxParamLength || 100;
    this.onMaxParamLength = opts.onMaxParamLength || null;
    this.allowUnsafeRegex = opts.allowUnsafeRegex || false;
    this.useSemicolonDelimiter = opts.useSemicolonDelimiter || false;
    this.constrainer = new Constrainer(opts.constraints);
    this.routes = [];
    this.trees = Object.create(null);
    this.staticRoutes = Object.create(null);
    this.treeGET = null;
    this.staticGET = null;
    this.staticIndexDirty = false;
    // The compiled walks of the trees (lib/compile.js), by method: compiled once a tree is walked COMPILE_AFTER times.
    this.tiers = Object.create(null);
    this.tierGET = null;
    // What match() returns, reused for every request.
    this.result = { status: FOUND, handler: null, store: null, params: null, querystring: '', path: '' };
  }

  on(method, path, opts, handler, store) {
    let options = opts;
    let fn = handler;
    let data = store;
    if (typeof opts === 'function') {
      if (handler !== undefined) data = handler;
      fn = opts;
      options = {};
    }
    assert(typeof path === 'string', 'Path should be a string');
    assert(path.length > 0, 'The path could not be empty');
    assert(path[0] === '/' || path[0] === '*', 'The first character of a path should be `/` or `*`');
    assert(typeof fn === 'function', 'Handler should be a function');

    const optional = path.match(OPTIONAL_PARAM);
    if (optional) {
      assert(
        path.length === optional.index + optional[0].length,
        'Optional Parameter needs to be the last parameter of the path'
      );
      this.on(method, path.replace(OPTIONAL_PARAM, '$1$2'), options, fn, data);
      this.on(method, path.replace(OPTIONAL_PARAM, '$2') || '/', options, fn, data);
      return;
    }

    let normalized = path;
    if (this.ignoreDuplicateSlashes) normalized = removeDuplicateSlashes(normalized);
    if (this.ignoreTrailingSlash) normalized = trimLastSlash(normalized);

    const methods = Array.isArray(method) ? method : [method];
    for (const m of methods) {
      assert(typeof m === 'string', 'Method should be a string');
      assert(httpMethods.includes(m), `Method '${m}' is not an http method.`);
      this.insert(m, normalized, options || {}, fn, data);
    }
  }

  insert(method, path, opts, handler, store) {
    let constraints = {};
    if (opts.constraints !== undefined) {
      assert(typeof opts.constraints === 'object' && opts.constraints !== null, 'Constraints should be an object');
      if (Object.keys(opts.constraints).length !== 0) constraints = opts.constraints;
    }
    this.constrainer.validateConstraints(constraints);
    this.constrainer.noteUsage(constraints);

    if (this.trees[method] === undefined) {
      this.trees[method] = new StaticNode('/');
      this.staticRoutes[method] = { map: new Map(), lengths: new Uint8Array(256) };
    }
    if (path === '*' && this.trees[method].prefix.length !== 0) {
      const root = this.trees[method];
      this.trees[method] = new StaticNode('');
      this.trees[method].setStaticChild('/', root);
    }
    if (method === 'GET') {
      this.treeGET = this.trees.GET;
      this.staticGET = this.staticRoutes.GET;
    }

    const walk = this.walkPattern(path, this.trees[method], true);
    let { pattern } = walk;
    if (!this.caseSensitive) pattern = pattern.toLowerCase();
    if (pattern === '*') pattern = '/*';

    for (const existing of this.routes) {
      if (
        existing.method === method &&
        existing.pattern === pattern &&
        deepEqualConstraints(existing.opts.constraints || {}, constraints)
      ) {
        throw new Error(
          `Method '${method}' already declared for route '${pattern}' with constraints '${JSON.stringify(constraints)}'`
        );
      }
    }

    const route = { method, path, pattern, params: walk.params, opts, handler, store };
    this.routes.push(route);
    walk.node.addRoute(route, this.constrainer);
    if (walk.params.length === 0 && walk.node.kind === NODE_TYPES.STATIC && path !== '*') {
      route.staticKey = walk.staticKey;
    }
    this.staticIndexDirty = true;
    this.tiers = Object.create(null);
    this.tierGET = null;
  }

  // Walks the pattern of a route through the tree, creating its nodes when `create`. Gives the last node, the names
  // of the parameters and the canonical pattern (parameters without names) used to find duplicated routes.
  walkPattern(path, root, create) {
    let pattern = path;
    let node = root;
    let parentIndex = node.prefix.length;
    const params = [];
    let staticKey = root.prefix;
    for (let i = 0; i <= pattern.length; i += 1) {
      if (pattern.charCodeAt(i) === 58 && pattern.charCodeAt(i + 1) === 58) {
        i += 1; // :: is a literal colon
        continue;
      }
      const isParam = pattern.charCodeAt(i) === 58 && pattern.charCodeAt(i + 1) !== 58;
      const isWildcard = pattern.charCodeAt(i) === 42;
      if (isParam || isWildcard || (i === pattern.length && i !== parentIndex)) {
        let staticPath = pattern.slice(parentIndex, i);
        if (!this.caseSensitive) staticPath = staticPath.toLowerCase();
        staticPath = staticPath.replaceAll('::', ':').replaceAll('%', '%25');
        node = create ? node.createStaticChild(staticPath) : node.getStaticChild(staticPath);
        if (node === null) return null;
        staticKey += staticPath;
      }
      if (isParam) {
        let isRegexNode = false;
        let paramSafe = true;
        let backtrack = '';
        const regexps = [];
        let nodePatternParts = '';
        let lastParamStart = i + 1;
        for (let j = lastParamStart; ; j += 1) {
          const code = pattern.charCodeAt(j);
          const isRegexParam = code === 40;
          const isStaticPart = code === 45 || code === 46;
          const isEndOfNode = code === 47 || j === pattern.length;
          if (isRegexParam || isStaticPart || isEndOfNode) {
            params.push(pattern.slice(lastParamStart, j));
            isRegexNode = isRegexNode || isRegexParam || isStaticPart;
            if (isRegexParam) {
              const end = closingParenthesis(pattern, j);
              const source = pattern.slice(j, end + 1);
              if (!this.allowUnsafeRegex) assert(isSafeRegex(new RegExp(source)), `The regex '${source}' is not safe!`);
              regexps.push(trimRegExp(source));
              j = end + 1;
              paramSafe = true;
            } else {
              regexps.push(paramSafe ? '(.*?)' : `(${backtrack}|(?:(?!${backtrack}).)*)`);
              paramSafe = false;
            }
            const staticStart = j;
            for (; j < pattern.length; j += 1) {
              const c = pattern.charCodeAt(j);
              if (c === 47) break;
              if (c === 58) {
                if (pattern.charCodeAt(j + 1) === 58) j += 1;
                else break;
              }
            }
            let staticPart = pattern.slice(staticStart, j);
            if (staticPart) {
              staticPart = staticPart.replaceAll('::', ':').replaceAll('%', '%25');
              backtrack = escapeRegExp(staticPart);
              regexps.push(backtrack);
            }
            lastParamStart = j + 1;
            nodePatternParts += `()${staticPart}`;
            if (isEndOfNode || pattern.charCodeAt(j) === 47 || j === pattern.length) {
              const nodePattern = isRegexNode ? nodePatternParts : staticPart;
              const nodePath = pattern.slice(i, j);
              pattern = pattern.slice(0, i + 1) + nodePattern + pattern.slice(j);
              i += nodePattern.length;
              const regex = isRegexNode ? new RegExp(`^${regexps.join('')}$`) : null;
              node = create
                ? node.createParametricChild(regex, staticPart || null, nodePath)
                : node.getParametricChild(regex, staticPart || null, nodePath);
              if (node === null) return null;
              parentIndex = i + 1;
              break;
            }
          }
        }
      } else if (isWildcard) {
        params.push('*');
        node = create ? node.createWildcardChild() : node.getWildcardChild();
        if (node === null) return null;
        parentIndex = i + 1;
        if (i !== pattern.length - 1) throw new Error('Wildcard must be the last character in the route');
      }
    }
    return { node, params, pattern, staticKey };
  }

  hasRoute(method, path, constraints) {
    return this.findRoute(method, path, constraints) !== null;
  }

  findRoute(method, path, constraints = {}) {
    if (this.trees[method] === undefined) return null;
    const walk = this.walkPattern(path, this.trees[method], false);
    if (walk === null) return null;
    let { pattern } = walk;
    if (!this.caseSensitive) pattern = pattern.toLowerCase();
    for (const route of this.routes) {
      if (
        route.method === method &&
        route.pattern === pattern &&
        deepEqualConstraints(route.opts.constraints || {}, constraints)
      ) {
        return { handler: route.handler, store: route.store, params: route.params };
      }
    }
    return null;
  }

  hasConstraintStrategy(name) {
    return this.constrainer.hasConstraintStrategy(name);
  }

  addConstraintStrategy(strategy) {
    this.constrainer.addConstraintStrategy(strategy);
    this.rebuild(this.routes);
  }

  reset() {
    this.trees = Object.create(null);
    this.staticRoutes = Object.create(null);
    this.treeGET = null;
    this.staticGET = null;
    this.staticIndexDirty = false;
    this.tiers = Object.create(null);
    this.tierGET = null;
    this.routes = [];
  }

  off(method, path, constraints) {
    assert(typeof path === 'string', 'Path should be a string');
    assert(path.length > 0, 'The path could not be empty');
    assert(path[0] === '/' || path[0] === '*', 'The first character of a path should be `/` or `*`');
    assert(
      constraints === undefined ||
        (typeof constraints === 'object' && !Array.isArray(constraints) && constraints !== null),
      'Constraints should be an object or undefined.'
    );
    const optional = path.match(OPTIONAL_PARAM);
    if (optional) {
      assert(
        path.length === optional.index + optional[0].length,
        'Optional Parameter needs to be the last parameter of the path'
      );
      this.off(method, path.replace(OPTIONAL_PARAM, '$1$2'), constraints);
      this.off(method, path.replace(OPTIONAL_PARAM, '$2') || '/', constraints);
      return;
    }
    let normalized = path;
    if (this.ignoreDuplicateSlashes) normalized = removeDuplicateSlashes(normalized);
    if (this.ignoreTrailingSlash) normalized = trimLastSlash(normalized);
    const methods = Array.isArray(method) ? method : [method];
    for (const m of methods) {
      assert(typeof m === 'string', 'Method should be a string');
      assert(httpMethods.includes(m), `Method '${m}' is not an http method.`);
      const keep = (route) =>
        m !== route.method ||
        normalized !== route.path ||
        (constraints !== undefined && !deepEqualConstraints(constraints, route.opts.constraints || {}));
      this.rebuild(this.routes.filter(keep));
    }
  }

  rebuild(routes) {
    this.reset();
    for (const route of routes) this.insert(route.method, route.path, route.opts, route.handler, route.store);
  }

  // Finds the route of a request. Returns null when there is none, or this.result (reused: read it before the next
  // call) with `status` FOUND, BAD_URL (a malformed path) or MAX_PARAM_LENGTH, and the unparsed `querystring`.
  match(method, rawUrl, derivedConstraints) {
    let root;
    let statics;
    if (method === 'GET') {
      root = this.treeGET;
      statics = this.staticGET;
    } else {
      root = this.trees[method];
      statics = this.staticRoutes[method];
    }
    if (root == null) return null;
    // The root (/), the most common route: found before any work on the URL.
    if (rawUrl === '/' && root.prefixLength === 1 && root.isLeafNode) {
      const handle = root.handlerStorage.getMatchingHandler(derivedConstraints);
      if (handle !== null) return this.found(handle, '');
    }
    if (this.staticIndexDirty) {
      this.buildStaticIndex();
      statics = this.staticRoutes[method];
    }

    let path = rawUrl;
    if (path.charCodeAt(0) !== 47) {
      path = pathFromAbsoluteURL(path);
      if (path === null) return this.badUrl(rawUrl);
    }
    if (this.ignoreDuplicateSlashes) path = removeDuplicateSlashes(path);

    // The query string starts at the first ?, # (or ; when asked); a % before it means the path has to be decoded.
    let querystring = '';
    let decodeParams = false;
    const urlLength = path.length;
    let i = 1;
    if (urlLength < NATIVE_SCAN_LENGTH) {
      for (; i < urlLength; i += 1) {
        const code = path.charCodeAt(i);
        if (code === 63 || code === 35 || code === 37 || (code === 59 && this.useSemicolonDelimiter)) break;
      }
    } else {
      // indexOf is faster on long paths, and its cost of a call is lost on short ones.
      i = firstDelimiter(path, this.useSemicolonDelimiter);
    }
    if (i < urlLength) {
      if (path.charCodeAt(i) === 37) {
        const split = splitEncoded(path, this.useSemicolonDelimiter, i);
        if (split === null) return this.badUrl(path);
        path = split.path;
        querystring = split.querystring;
        decodeParams = split.decodeParams;
      } else {
        querystring = path.slice(i + 1);
        path = path.slice(0, i);
      }
    }
    if (this.ignoreTrailingSlash) path = trimLastSlash(path);
    const originPath = path;
    if (!this.caseSensitive) path = path.toLowerCase();

    const result = this.result;
    const pathLength = path.length;
    // The root (/): found here, without the call of the compiled walk, which is too large to be inlined.
    if (pathLength === root.prefixLength && root.isLeafNode) {
      const handle = root.handlerStorage.getMatchingHandler(derivedConstraints);
      if (handle !== null) return this.found(handle, querystring);
    }
    const staticNode = pathLength > 255 || statics.lengths[pathLength] === 1 ? statics.map.get(path) : undefined;
    if (staticNode !== undefined) {
      const handle = staticNode.handlerStorage.getMatchingHandler(derivedConstraints);
      if (handle !== null) return this.found(handle, querystring);
    }

    let tier = method === 'GET' ? this.tierGET : this.tiers[method];
    if (tier == null) tier = this.newTier(method);
    const status =
      tier.walk !== null || ((tier.walks += 1) > Router.COMPILE_AFTER && this.compileTier(tier, root))
        ? tier.walk(path, originPath, pathLength, derivedConstraints, decodeParams, result)
        : this.walkTree(root, path, originPath, derivedConstraints, decodeParams, result);
    if (status === 0) {
      result.status = FOUND;
      result.querystring = querystring;
      return result;
    }
    return this.notFound(status === 2, originPath);
  }

  // The walk of a tree before it is compiled: the same as the compiled one (lib/compile.js), and the same results.
  walkTree(root, path, originPath, derivedConstraints, decodeParams, result) {
    const maxParamLength = this.maxParamLength;
    let currentNode = root;
    let pathIndex = currentNode.prefix.length;
    const params = [];
    const pathLen = path.length;
    const stack = [];
    let maxParamLengthExceeded = false;

    for (;;) {
      if (pathIndex === pathLen && currentNode.isLeafNode) {
        const handle = currentNode.handlerStorage.getMatchingHandler(derivedConstraints);
        if (handle !== null) {
          result.handler = handle.handler;
          result.store = handle.store;
          result.params = handle.createParams(params);
          return 0;
        }
      }

      let node = currentNode.getNextNode(path, pathIndex, stack, params.length);
      if (node === null) {
        if (stack.length === 0) return maxParamLengthExceeded ? 2 : 1;
        params.length = stack.pop();
        pathIndex = stack.pop();
        node = stack.pop();
      }
      currentNode = node;

      for (;;) {
        if (currentNode.kind === NODE_TYPES.STATIC) {
          pathIndex += currentNode.prefixLength;
          break;
        }
        if (currentNode.kind === NODE_TYPES.WILDCARD) {
          const param = originPath.slice(pathIndex);
          params.push(decodeParams ? decodeParam(param) : param);
          pathIndex = pathLen;
          break;
        }
        let paramEnd = originPath.indexOf('/', pathIndex);
        if (paramEnd === -1) paramEnd = pathLen;
        let param = originPath.slice(pathIndex, paramEnd);
        if (decodeParams) param = decodeParam(param);

        let failed = false;
        if (currentNode.isRegex) {
          const matched = currentNode.regex.exec(param);
          if (matched === null) {
            failed = true;
          } else {
            for (let i = 1; i < matched.length; i += 1) {
              if ((matched[i] ?? '').length > maxParamLength) {
                maxParamLengthExceeded = true;
                failed = true;
                break;
              }
            }
            if (!failed) for (let i = 1; i < matched.length; i += 1) params.push(matched[i] ?? '');
          }
        } else if (param.length > maxParamLength) {
          maxParamLengthExceeded = true;
          failed = true;
        } else {
          params.push(param);
        }

        if (failed) {
          if (stack.length === 0) return maxParamLengthExceeded ? 2 : 1;
          params.length = stack.pop();
          pathIndex = stack.pop();
          currentNode = stack.pop();
          continue;
        }
        pathIndex = paramEnd;
        break;
      }
    }
  }

  newTier(method) {
    const tier = { walks: 0, walk: null };
    this.tiers[method] = tier;
    if (method === 'GET') this.tierGET = tier;
    return tier;
  }

  // Compiles the walk of a tree; false (and not tried again) when the tree is too large for it.
  compileTier(tier, root) {
    tier.walk = compileTree(root, this.maxParamLength);
    if (tier.walk !== null) return true;
    tier.walks = -Infinity;
    return false;
  }

  // The static routes reached faster by their path than by the tree: the ones whose walk goes through several nodes
  // or by nodes with parameters, which the walk would push to try later.
  buildStaticIndex() {
    this.staticIndexDirty = false;
    for (const method of Object.keys(this.staticRoutes)) {
      this.staticRoutes[method] = { map: new Map(), lengths: new Uint8Array(256) };
    }
    for (const route of this.routes) {
      if (route.staticKey === undefined || this.trees[route.method] === undefined) continue;
      const key = route.staticKey;
      let node = this.trees[route.method];
      let index = node.prefixLength;
      let cost = 0;
      while (node !== null && index < key.length) {
        if (node.parametricChildren && (node.parametricChildren.length > 0 || node.wildcardChild !== null)) cost += 2;
        node = node.findStaticMatchingChild(key, index);
        if (node !== null) index += node.prefixLength;
        cost += 1;
      }
      if (node === null || cost < STATIC_INDEX_MIN_COST) continue;
      const statics = this.staticRoutes[route.method];
      statics.map.set(key, node);
      if (key.length < 256) statics.lengths[key.length] = 1;
    }
    this.staticGET = this.staticRoutes.GET || null;
  }

  // The result of a static route: no parameters.
  found(handle, querystring) {
    const result = this.result;
    result.status = FOUND;
    result.handler = handle.handler;
    result.store = handle.store;
    result.params = handle.createParams(EMPTY);
    result.querystring = querystring;
    return result;
  }

  badUrl(path) {
    const result = this.result;
    result.status = BAD_URL;
    result.handler = null;
    result.store = null;
    result.params = null;
    result.querystring = '';
    result.path = path;
    return result;
  }

  notFound(maxParamLengthExceeded, path) {
    if (!maxParamLengthExceeded || this.onMaxParamLength === null) return null;
    const result = this.badUrl(path);
    result.status = MAX_PARAM_LENGTH;
    return result;
  }

  // find-my-way's find(): a new object, with the query string parsed.
  find(method, path, derivedConstraints) {
    // The root, the most common route, found here: match() is too large to be inlined, and its call costs as much.
    if (path === '/' && this.querystringParser === defaultQuerystringParser) {
      const root = method === 'GET' ? this.treeGET : this.trees[method];
      if (root != null && root.prefixLength === 1 && root.isLeafNode) {
        const handle = root.handlerStorage.getMatchingHandler(derivedConstraints);
        if (handle !== null) {
          return {
            handler: handle.handler,
            store: handle.store,
            params: handle.createParams(EMPTY),
            searchParams: new NullObject(),
          };
        }
      }
    }
    const result = this.match(method, path, derivedConstraints);
    if (result === null) return null;
    if (result.status === BAD_URL) {
      if (this.onBadUrl === null) return null;
      const { onBadUrl } = this;
      const badPath = result.path;
      return { handler: (req, res) => onBadUrl(badPath, req, res), params: {}, store: null };
    }
    if (result.status === MAX_PARAM_LENGTH) {
      const { onMaxParamLength } = this;
      const longPath = result.path;
      return { handler: (req, res) => onMaxParamLength(longPath, req, res), params: {}, store: null };
    }
    return {
      handler: result.handler,
      store: result.store,
      params: result.params,
      searchParams:
        result.querystring.length === 0 && this.querystringParser === defaultQuerystringParser
          ? new NullObject()
          : this.querystringParser(result.querystring),
    };
  }

  lookup(req, res, ctx, done) {
    let context = ctx;
    let callback = done;
    if (typeof ctx === 'function') {
      callback = ctx;
      context = undefined;
    }
    if (callback === undefined) {
      const constraints = this.constrainer.deriveConstraints(req, context);
      return this.callHandler(this.find(req.method, req.url, constraints), req, res, context);
    }
    this.constrainer.deriveConstraints(req, context, (err, constraints) => {
      if (err !== null) {
        callback(err);
        return;
      }
      try {
        const handle = this.find(req.method, req.url, constraints);
        callback(null, this.callHandler(handle, req, res, context));
      } catch (error) {
        callback(error);
      }
    });
    return undefined;
  }

  callHandler(handle, req, res, ctx) {
    if (handle === null) {
      if (this.defaultRoute !== null) {
        return ctx === undefined ? this.defaultRoute(req, res) : this.defaultRoute.call(ctx, req, res);
      }
      res.statusCode = 404;
      res.end();
      return undefined;
    }
    return ctx === undefined
      ? handle.handler(req, res, handle.params, handle.store, handle.searchParams)
      : handle.handler.call(ctx, req, res, handle.params, handle.store, handle.searchParams);
  }

  prettyPrint(options = {}) {
    const opts = { ...options, buildPrettyMeta: this.buildPrettyMeta.bind(this) };
    let tree = null;
    if (opts.method === undefined) {
      const { version, host, ...custom } = this.constrainer.strategies;
      custom[strategies.httpMethod.name] = strategies.httpMethod;
      const merged = new Router({ ...this._opts, constraints: custom });
      const routes = this.routes.map((route) => ({
        ...route,
        method: 'MERGED',
        opts: { constraints: { ...route.opts.constraints, [strategies.httpMethod.name]: route.method } },
      }));
      // The merged tree is built without the checks of the methods.
      for (const route of routes) merged.insertMerged(route);
      tree = merged.trees.MERGED;
    } else {
      tree = this.trees[opts.method];
    }
    if (tree == null) return '(empty tree)';
    return prettyPrintTree(tree, opts);
  }

  insertMerged(route) {
    if (this.trees.MERGED === undefined) {
      this.trees.MERGED = new StaticNode('/');
      this.staticRoutes.MERGED = { map: new Map(), lengths: new Uint8Array(256) };
    }
    if (route.path === '*' && this.trees.MERGED.prefix.length !== 0) {
      const root = this.trees.MERGED;
      this.trees.MERGED = new StaticNode('');
      this.trees.MERGED.setStaticChild('/', root);
    }
    this.constrainer.noteUsage(route.opts.constraints);
    const walk = this.walkPattern(route.path, this.trees.MERGED, true);
    const merged = { ...route, pattern: walk.pattern, params: walk.params };
    this.routes.push(merged);
    walk.node.addRoute(merged, this.constrainer);
  }

  all(path, handler, store) {
    this.on(httpMethods, path, handler, store);
  }
}

const EMPTY = [];

const NATIVE_SCAN_LENGTH = 12;

// The index of the first ?, #, % (or ; when asked) of a path, or its length.
function firstDelimiter(path, semicolon) {
  let end = path.length;
  let index = path.indexOf('?', 1);
  if (index !== -1) end = index;
  index = path.indexOf('%', 1);
  if (index !== -1 && index < end) end = index;
  index = path.indexOf('#', 1);
  if (index !== -1 && index < end) end = index;
  if (semicolon) {
    index = path.indexOf(';', 1);
    if (index !== -1 && index < end) end = index;
  }
  return end;
}

function addQueryValue(out, key, value) {
  const existing = out[key];
  if (existing === undefined) out[key] = value;
  else if (Array.isArray(existing)) existing.push(value);
  else out[key] = [existing, value];
}

// The query string as an object, as URLSearchParams reads it. Most query strings have nothing to decode: they are
// split here, much faster; the others (%, +, a leading ?, text that is not well formed) go to URLSearchParams.
function defaultQuerystringParser(query) {
  const out = new NullObject();
  const length = query.length;
  if (length === 0) return out;
  if (query.charCodeAt(0) === 63 || query.indexOf('%') !== -1 || query.indexOf('+') !== -1 || !query.isWellFormed()) {
    for (const [key, value] of new URLSearchParams(query)) addQueryValue(out, key, value);
    return out;
  }
  let start = 0;
  while (start <= length) {
    let end = query.indexOf('&', start);
    if (end === -1) end = length;
    if (end > start) {
      const equals = query.indexOf('=', start);
      if (equals === -1 || equals > end) addQueryValue(out, query.slice(start, end), '');
      else addQueryValue(out, query.slice(start, equals), query.slice(equals + 1, end));
    }
    start = end + 1;
  }
  return out;
}

for (const method of httpMethods) {
  Router.prototype[method.toLowerCase()] = function shorthand(path, handler, store) {
    return this.on(method, path, handler, store);
  };
}

function createRouter(opts) {
  return new Router(opts);
}

Router.sanitizeUrlPath = function sanitizeUrlPath(rawUrl, useSemicolonDelimiter) {
  const decoded = url.safeDecodeURI(rawUrl, useSemicolonDelimiter);
  return decoded.shouldDecodeParam ? decodeParam(decoded.path) : decoded.path;
};

// Walks of a tree by match() before it is compiled: compiling costs more than a few walks.
Router.COMPILE_AFTER = 16;

module.exports = createRouter;
module.exports.Router = Router;
module.exports.httpMethods = httpMethods;
module.exports.FOUND = FOUND;
module.exports.BAD_URL = BAD_URL;
module.exports.MAX_PARAM_LENGTH = MAX_PARAM_LENGTH;
module.exports.sanitizeUrlPath = Router.sanitizeUrlPath;
module.exports.removeDuplicateSlashes = removeDuplicateSlashes;
module.exports.trimLastSlash = trimLastSlash;
module.exports.safeDecodeURI = url.safeDecodeURI;
module.exports.safeDecodeURIComponent = url.safeDecodeURIComponent;
module.exports.isSafeRegex = isSafeRegex;
module.exports.NullObject = NullObject;

},
"@xufa/router/lib/compile.js": function (module, exports, require) {
// Compiles the tree of a method into code that finds a route: the walk of index.js (match), with the nodes written
// as code. A static child is a case of a switch on the next character and comparisons of character codes, a
// parameter a slice up to the next slash, and backtracking is falling out of a block to the next child to try, in
// the order of the walk: the static child, the parametric children, then the wildcard. No calls per node, no stack of
// nodes to try, and the parameters are locals. The code of a large tree is split into functions of a few kilobytes,
// each one a subtree: V8 optimizes functions of that size well, and one of a hundred kilobytes badly.
//
// The function is walk(path, originPath, len, derivedConstraints, decode, result): it gives 0 when it found the
// route (its handler, store and params written to result), 1 when there is none, 2 when there is none and a
// parameter was longer than maxParamLength.
const { decodeParam } = require('./url');

// Trees with more nodes are walked by match(): the time to compile them would be too long.
const MAX_NODES = 20000;
// The code of a node larger than this has its largest subtrees moved to functions of their own.
const MAX_CHUNK = 24000;
// Prefixes longer than this are compared with startsWith() rather than one comparison per character.
const MAX_INLINE_PREFIX = 12;

function compileTree(root, maxParamLength) {
  const refs = [];
  const functions = [];
  let names = 0;
  let nodes = 0;
  const ref = (value) => {
    refs.push(value);
    return `R${refs.length - 1}`;
  };
  const name = (prefix) => `${prefix}${(names += 1)}`;

  // The code of a subtree moved to a function: it gets the index in the path (when a variable) and the parameters
  // found so far, under the names its code uses, and gives 0, 1 or 2 as walk() does.
  function extract(piece, at, params) {
    const fn = name('f');
    const args = (/^[a-z]+\d+$/.test(at) ? [at] : []).concat(params);
    const signature = ['path', 'originPath', 'len', 'dc', 'decode', 'r'].concat(args).join(', ');
    functions.push(`function ${fn}(${signature}) {\nlet exceeded = false;\n${piece}return exceeded ? 2 : 1;\n}\n`);
    const status = name('s');
    return (
      `{\nconst ${status} = ${fn}(${signature});\n` +
      `if (${status} === 0) return 0;\nif (${status} === 2) exceeded = true;\n}\n`
    );
  }

  // The code of a node whose part of the path ends at index `at` (an expression), with the parameters found so far.
  function body(node, at, params) {
    nodes += 1;
    let leaf = '';
    if (node.isLeafNode) {
      const h = name('h');
      leaf =
        `if (${at} === len) {\nconst ${h} = ${ref(node.handlerStorage)}.getMatchingHandler(dc);\n` +
        `if (${h} !== null) {\nr.handler = ${h}.handler;\nr.store = ${h}.store;\n` +
        `r.params = ${h}.createParamsArgs(${params.join(', ')});\nreturn 0;\n}\n}\n`;
    }
    // The code of each child, in the order they are tried.
    const cases = [];
    const others = [];
    const codes = node.staticChildrenCharCodes;
    if (codes !== undefined) {
      for (let i = 0; i < codes.length; i += 1) {
        cases.push({ code: codes[i], text: staticChild(node.staticChildrenNodes[i], at, params) });
      }
    }
    if (node.parametricChildren !== undefined) {
      for (const child of node.parametricChildren) others.push({ text: parametricChild(child, at, params) });
    }
    if (node.wildcardChild != null) others.push({ text: wildcardChild(node.wildcardChild, at, params) });
    // The largest ones to functions of their own, until the code of the node is small enough.
    const pieces = cases.concat(others);
    let size = pieces.reduce((sum, piece) => sum + piece.text.length, 0);
    for (const piece of [...pieces].sort((a, b) => b.text.length - a.text.length)) {
      if (size <= MAX_CHUNK) break;
      const before = piece.text.length;
      piece.text = extract(piece.text, at, params);
      size -= before - piece.text.length;
    }
    let out = leaf;
    if (cases.length !== 0) {
      out += `switch (path.charCodeAt(${at})) {\n`;
      for (const piece of cases) out += `case ${piece.code}: {\n${piece.text}break;\n}\n`;
      out += '}\n';
    }
    for (const piece of others) out += piece.text;
    return out;
  }

  // Its first character is the case of the switch: the others are compared here.
  function staticChild(node, at, params) {
    const { prefix } = node;
    const end = name('i');
    let test = '';
    if (prefix.length > MAX_INLINE_PREFIX) {
      test = `path.startsWith(${JSON.stringify(prefix)}, ${at})`;
    } else if (prefix.length > 1) {
      const checks = [];
      for (let i = 1; i < prefix.length; i += 1)
        checks.push(`path.charCodeAt(${at} + ${i}) === ${prefix.charCodeAt(i)}`);
      test = checks.join(' && ');
    }
    const code = `{\nconst ${end} = ${at} + ${prefix.length};\n${body(node, end, params)}}\n`;
    return test === '' ? code : `if (${test}) ${code}`;
  }

  function parametricChild(node, at, params) {
    const end = name('e');
    const value = name('v');
    let out =
      `{\nlet ${end} = originPath.indexOf('/', ${at});\nif (${end} === -1) ${end} = len;\n` +
      `let ${value} = originPath.slice(${at}, ${end});\nif (decode) ${value} = decodeParam(${value});\n`;
    if (node.isRegex) {
      const groups = new RegExp(`${node.regex.source}|`).exec('').length - 1;
      const match = name('m');
      const found = [];
      for (let i = 1; i <= groups; i += 1) found.push(name('p'));
      out +=
        `const ${match} = ${ref(node.regex)}.exec(${value});\nif (${match} !== null) {\n` +
        found.map((p, i) => `const ${p} = ${match}[${i + 1}] ?? '';\n`).join('') +
        `if (${found.map((p) => `${p}.length > max`).join(' || ') || 'false'}) exceeded = true;\n` +
        `else {\n${body(node, end, params.concat(found))}}\n}\n`;
    } else {
      out += `if (${value}.length > max) exceeded = true;\nelse {\n${body(node, end, params.concat(value))}}\n`;
    }
    return `${out}}\n`;
  }

  function wildcardChild(node, at, params) {
    const value = name('v');
    return (
      `{\nlet ${value} = originPath.slice(${at});\nif (decode) ${value} = decodeParam(${value});\n` +
      `${body(node, 'len', params.concat(value))}}\n`
    );
  }

  const code = body(root, String(root.prefix.length), []);
  if (nodes > MAX_NODES) return null;
  const source =
    `${refs.map((_, i) => `const R${i} = refs[${i}];`).join('\n')}\n${functions.join('')}` +
    `return function walk(path, originPath, len, dc, decode, r) {\nlet exceeded = false;\n${code}` +
    'return exceeded ? 2 : 1;\n};';
  // eslint-disable-next-line no-new-func
  return new Function('refs', 'max', 'decodeParam', source)(refs, maxParamLength, decodeParam);
}

module.exports = { compileTree };

},
"@xufa/router/lib/constraints.js": function (module, exports, require) {
// Route constraints (version, host and custom strategies), and the handlers stored on a node of the tree.
const strategies = require('./strategies');

class Constrainer {
  constructor(customStrategies) {
    this.strategies = { version: strategies.version, host: strategies.host };
    this.strategiesInUse = new Set();
    this.asyncStrategiesInUse = new Set();
    this.deriveSync = null;
    if (customStrategies) {
      for (const strategy of Object.values(customStrategies)) this.addConstraintStrategy(strategy);
    }
  }

  isStrategyUsed(name) {
    return this.strategiesInUse.has(name) || this.asyncStrategiesInUse.has(name);
  }

  hasConstraintStrategy(name) {
    const strategy = this.strategies[name];
    if (strategy === undefined) return false;
    return Boolean(strategy.isCustom) || this.isStrategyUsed(name);
  }

  addConstraintStrategy(strategy) {
    if (typeof strategy.name !== 'string' || strategy.name === '') throw new Error('strategy.name is required.');
    if (typeof strategy.storage !== 'function') throw new Error('strategy.storage function is required.');
    if (typeof strategy.deriveConstraint !== 'function') {
      throw new Error('strategy.deriveConstraint function is required.');
    }
    if (this.strategies[strategy.name] && this.strategies[strategy.name].isCustom) {
      throw new Error(`There already exists a custom constraint with the name ${strategy.name}.`);
    }
    if (this.isStrategyUsed(strategy.name)) {
      throw new Error(`There already exists a route with ${strategy.name} constraint.`);
    }
    strategy.isCustom = true;
    strategy.isAsync = strategy.deriveConstraint.length === 3;
    this.strategies[strategy.name] = strategy;
    if (strategy.mustMatchWhenDerived) this.noteUsage({ [strategy.name]: strategy });
  }

  // The constraints of a request: undefined when no route has any, so that the unconstrained handlers match.
  deriveConstraints(req, ctx, done) {
    const constraints = this.deriveSync === null ? undefined : this.deriveSync(req, ctx);
    if (done === undefined) return constraints;
    this.deriveAsyncConstraints(constraints, req, ctx, done);
    return undefined;
  }

  noteUsage(constraints) {
    if (!constraints) return;
    const before = this.strategiesInUse.size;
    for (const key of Object.keys(constraints)) {
      const strategy = this.strategies[key];
      if (strategy.isAsync) this.asyncStrategiesInUse.add(key);
      else this.strategiesInUse.add(key);
    }
    if (before !== this.strategiesInUse.size) this.buildDeriveSync();
  }

  newStoreForConstraint(name) {
    if (!this.strategies[name]) throw new Error(`No strategy registered for constraint key ${name}`);
    return this.strategies[name].storage();
  }

  validateConstraints(constraints) {
    for (const key of Object.keys(constraints)) {
      const value = constraints[key];
      if (value === undefined)
        throw new Error("Can't pass an undefined constraint value, must pass null or no key at all");
      const strategy = this.strategies[key];
      if (!strategy) throw new Error(`No strategy registered for constraint key ${key}`);
      if (strategy.validate) strategy.validate(value);
    }
  }

  deriveAsyncConstraints(constraints, req, ctx, done) {
    let pending = this.asyncStrategiesInUse.size;
    if (pending === 0) {
      done(null, constraints);
      return;
    }
    let errored = false;
    const values = constraints || {};
    for (const key of this.asyncStrategiesInUse) {
      this.strategies[key].deriveConstraint(req, ctx, (err, value) => {
        if (errored) return;
        if (err !== null) {
          errored = true;
          done(err);
          return;
        }
        values[key] = value;
        pending -= 1;
        if (pending === 0) done(null, values);
      });
    }
  }

  buildDeriveSync() {
    const used = [...this.strategiesInUse].map((key) => [key, this.strategies[key]]);
    if (used.length === 0) {
      this.deriveSync = null;
      return;
    }
    this.deriveSync = (req, ctx) => {
      const values = {};
      for (let i = 0; i < used.length; i += 1) {
        const [key, strategy] = used[i];
        if (key === 'version' && !strategy.isCustom) values.version = req.headers['accept-version'];
        else if (key === 'host' && !strategy.isCustom) values.host = req.headers.host || req.headers[':authority'];
        else values[key] = strategy.deriveConstraint(req, ctx);
      }
      return values;
    };
  }
}

const NullObject = function NullObject() {};
NullObject.prototype = Object.create(null);

// Builds the object of parameters from their values; compiled so that each one is a plain store of a property.
function compileParamsFactory(names) {
  const lines = names.map((name, i) => `params[${JSON.stringify(name)}] = values[${i}];`);
  // eslint-disable-next-line no-new-func
  return new Function(
    'NullObject',
    `return function createParams(values) {\n  const params = new NullObject();\n  ${lines.join('\n  ')}\n  return params;\n}`
  )(NullObject);
}

// The same, with the values as arguments: what the compiled walk calls, with its parameters in locals.
function compileParamsArgsFactory(names) {
  const args = names.map((_, i) => `v${i}`);
  const lines = names.map((name, i) => `params[${JSON.stringify(name)}] = v${i};`);
  // eslint-disable-next-line no-new-func
  return new Function(
    'NullObject',
    `return function createParamsArgs(${args.join(', ')}) {\n  const params = new NullObject();\n  ${lines.join('\n  ')}\n  return params;\n}`
  )(NullObject);
}

const MAX_HANDLERS = 31;

class HandlerStorage {
  constructor() {
    this.unconstrainedHandler = null;
    this.constraints = [];
    this.handlers = [];
    this.stores = null;
    this.matchConstrained = () => null;
  }

  getMatchingHandler(derivedConstraints) {
    if (derivedConstraints === undefined) return this.unconstrainedHandler;
    return this.matchConstrained(derivedConstraints);
  }

  addHandler(constrainer, route) {
    const constraints = route.opts.constraints || {};
    const handler = {
      params: route.params,
      constraints,
      handler: route.handler,
      store: route.store || null,
      createParams: compileParamsFactory(route.params),
      createParamsArgs: compileParamsArgsFactory(route.params),
    };
    // find-my-way's name of createParams, kept for code reading it
    handler._createParamsObject = handler.createParams;
    const names = Object.keys(constraints);
    if (names.length === 0) this.unconstrainedHandler = handler;
    for (const name of names) {
      if (!this.constraints.includes(name)) {
        if (name === 'version') this.constraints.unshift(name);
        else this.constraints.push(name);
      }
    }
    const merged = names.includes(strategies.httpMethod.name);
    if (!merged && this.handlers.length >= MAX_HANDLERS) {
      throw new Error(
        'find-my-way supports a maximum of 31 route handlers per node when there are constraints, limit reached'
      );
    }
    this.handlers.push(handler);
    this.handlers.sort((a, b) => Object.keys(a.constraints).length - Object.keys(b.constraints).length);
    if (!merged) this.compileMatcher(constrainer);
  }

  // Matches with bitmaps: a bit for each handler, cleared when a constraint of the request rules the handler out.
  compileMatcher(constrainer) {
    const { handlers } = this;
    this.stores = {};
    const checks = this.constraints.map((name) => {
      const store = constrainer.newStoreForConstraint(name);
      this.stores[name] = store;
      let unconstrained = 0;
      for (let i = 0; i < handlers.length; i += 1) {
        const value = handlers[i].constraints[name];
        if (value !== undefined) {
          store.set(value, (store.get(value) || 0) | (1 << i));
        } else {
          unconstrained |= 1 << i;
        }
      }
      return { name, store, unconstrained, mustMatch: Boolean(constrainer.strategies[name].mustMatchWhenDerived) };
    });
    const mustNotBeDerived = Object.keys(constrainer.strategies).filter(
      (name) => constrainer.strategies[name].mustMatchWhenDerived && !this.constraints.includes(name)
    );
    const all = 2 ** handlers.length - 1;
    this.matchConstrained = (derived) => {
      let candidates = all;
      for (let i = 0; i < checks.length; i += 1) {
        const check = checks[i];
        const value = derived[check.name];
        if (value === undefined) {
          candidates &= check.unconstrained;
        } else {
          const matches = check.store.get(value) || 0;
          candidates &= check.mustMatch ? matches : matches | check.unconstrained;
        }
        if (candidates === 0) return null;
      }
      for (let i = 0; i < mustNotBeDerived.length; i += 1) {
        if (derived[mustNotBeDerived[i]] !== undefined) return null;
      }
      return handlers[31 - Math.clz32(candidates)];
    };
  }
}

module.exports = { Constrainer, HandlerStorage, NullObject, compileParamsFactory };

},
"@xufa/router/lib/node.js": function (module, exports, require) {
// Nodes of the radix tree: static prefixes, parameters (plain or with a regular expression) and wildcards.
const { HandlerStorage } = require('./constraints');

const matchFirst = () => true;

// A function telling whether the path has the prefix at an index, its first character being already checked:
// comparisons of character codes the compiler inlines, faster than startsWith() on short prefixes.
function compilePrefixMatch(prefix) {
  if (prefix.length <= 1) return matchFirst;
  const checks = [];
  for (let i = 1; i < prefix.length; i += 1) checks.push(`path.charCodeAt(i + ${i}) === ${prefix.charCodeAt(i)}`);
  // eslint-disable-next-line no-new-func
  return new Function('path', 'i', `return ${checks.join(' && ')}`);
}

const NODE_TYPES = { STATIC: 0, PARAMETRIC: 1, WILDCARD: 2 };

class Node {
  constructor() {
    this.isLeafNode = false;
    this.routes = null;
    this.handlerStorage = null;
  }

  addRoute(route, constrainer) {
    if (this.routes === null) this.routes = [];
    if (this.handlerStorage === null) this.handlerStorage = new HandlerStorage();
    this.isLeafNode = true;
    this.routes.push(route);
    this.handlerStorage.addHandler(constrainer, route);
  }
}

class ParentNode extends Node {
  constructor() {
    super();
    // Static children by the code of their first character: a scan of a few integers beats a lookup by string.
    this.staticChildrenCharCodes = [];
    this.staticChildrenNodes = [];
  }

  setStaticChild(label, node) {
    const code = label.charCodeAt(0);
    const index = this.staticChildrenCharCodes.indexOf(code);
    if (index === -1) {
      this.staticChildrenCharCodes.push(code);
      this.staticChildrenNodes.push(node);
    } else {
      this.staticChildrenNodes[index] = node;
    }
  }

  findStaticMatchingChild(path, pathIndex) {
    const code = path.charCodeAt(pathIndex);
    const codes = this.staticChildrenCharCodes;
    for (let i = 0; i < codes.length; i += 1) {
      if (codes[i] === code) {
        const child = this.staticChildrenNodes[i];
        return child.matchPrefix(path, pathIndex) ? child : null;
      }
    }
    return null;
  }

  getStaticChild(path, pathIndex = 0) {
    if (path.length === pathIndex) return this;
    const child = this.findStaticMatchingChild(path, pathIndex);
    return child ? child.getStaticChild(path, pathIndex + child.prefixLength) : null;
  }

  createStaticChild(path) {
    if (path.length === 0) return this;
    const index = this.staticChildrenCharCodes.indexOf(path.charCodeAt(0));
    let child = index === -1 ? undefined : this.staticChildrenNodes[index];
    if (child) {
      let i = 1;
      for (; i < child.prefixLength; i += 1) {
        if (path.charCodeAt(i) !== child.prefix.charCodeAt(i)) {
          child = child.split(this, i);
          break;
        }
      }
      return child.createStaticChild(path.slice(i));
    }
    const node = new StaticNode(path);
    this.setStaticChild(path, node);
    return node;
  }
}

class StaticNode extends ParentNode {
  constructor(prefix) {
    super();
    this.prefix = prefix;
    this.prefixLength = prefix.length;
    this.matchPrefix = compilePrefixMatch(prefix);
    this.wildcardChild = null;
    this.parametricChildren = [];
    this.kind = NODE_TYPES.STATIC;
  }

  getParametricChild(regex) {
    const source = regex && regex.source;
    return this.parametricChildren.find((child) => (child.regex && child.regex.source) === source) || null;
  }

  createParametricChild(regex, staticSuffix, nodePath) {
    let child = this.getParametricChild(regex);
    if (child) {
      child.nodePaths.add(nodePath);
      return child;
    }
    child = new ParametricNode(regex, staticSuffix, nodePath);
    this.parametricChildren.push(child);
    // Regular expressions first, the ones with the longest static suffix before the ones it ends.
    this.parametricChildren.sort((a, b) => {
      if (!a.isRegex) return 1;
      if (!b.isRegex) return -1;
      if (a.staticSuffix === null) return 1;
      if (b.staticSuffix === null) return -1;
      if (b.staticSuffix.endsWith(a.staticSuffix)) return 1;
      if (a.staticSuffix.endsWith(b.staticSuffix)) return -1;
      return 0;
    });
    return child;
  }

  getWildcardChild() {
    return this.wildcardChild;
  }

  createWildcardChild() {
    this.wildcardChild = this.wildcardChild || new WildcardNode();
    return this.wildcardChild;
  }

  split(parent, length) {
    const parentPrefix = this.prefix.slice(0, length);
    const childPrefix = this.prefix.slice(length);
    this.prefix = childPrefix;
    this.prefixLength = childPrefix.length;
    this.matchPrefix = compilePrefixMatch(childPrefix);
    const node = new StaticNode(parentPrefix);
    node.setStaticChild(childPrefix, this);
    parent.setStaticChild(parentPrefix, node);
    return node;
  }

  // The next node to try; the others that could match are pushed to be tried when it fails.
  getNextNode(path, pathIndex, stack, paramsCount) {
    let node = this.findStaticMatchingChild(path, pathIndex);
    let firstParametric = 0;
    if (node === null) {
      if (this.parametricChildren.length === 0) return this.wildcardChild;
      node = this.parametricChildren[0];
      firstParametric = 1;
    }
    // Three entries per node to try later: the node, the index in the path and the number of parameters.
    if (this.wildcardChild !== null) stack.push(this.wildcardChild, pathIndex, paramsCount);
    for (let i = this.parametricChildren.length - 1; i >= firstParametric; i -= 1) {
      stack.push(this.parametricChildren[i], pathIndex, paramsCount);
    }
    return node;
  }
}

class ParametricNode extends ParentNode {
  constructor(regex, staticSuffix, nodePath) {
    super();
    this.isRegex = Boolean(regex);
    this.regex = regex || null;
    this.staticSuffix = staticSuffix || null;
    this.kind = NODE_TYPES.PARAMETRIC;
    this.nodePaths = new Set([nodePath]);
  }

  getNextNode(path, pathIndex) {
    return this.findStaticMatchingChild(path, pathIndex);
  }
}

class WildcardNode extends Node {
  constructor() {
    super();
    this.kind = NODE_TYPES.WILDCARD;
  }

  // eslint-disable-next-line class-methods-use-this
  getNextNode() {
    return null;
  }
}

module.exports = { StaticNode, ParametricNode, WildcardNode, NODE_TYPES };

},
"@xufa/router/lib/pretty-print.js": function (module, exports, require) {
// The tree of routes as text, in the format of find-my-way.
const { httpMethod, deepEqualConstraints } = require('./strategies');

const treeData = Symbol('treeData');

function printObjectTree(obj, parentPrefix = '') {
  let tree = '';
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const value = obj[key];
    const isLast = i === keys.length - 1;
    const nodePrefix = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';
    const nodeData = value[treeData] || '';
    tree += `${parentPrefix}${nodePrefix}${key}${nodeData.replaceAll('\n', `\n${parentPrefix}${childPrefix}`)}\n`;
    tree += printObjectTree(value, parentPrefix + childPrefix);
  }
  return tree;
}

function functionName(fn) {
  const name = (fn.name || '').replace('bound', '').trim();
  return `${name || 'anonymous'}()`;
}

function parseMeta(meta) {
  if (Array.isArray(meta)) return meta.map(parseMeta);
  if (typeof meta === 'symbol') return meta.toString();
  if (typeof meta === 'function') return functionName(meta);
  if (meta instanceof RegExp) return meta.toString();
  return meta;
}

function routeMetaData(route, options) {
  if (!options.includeMeta) return {};
  const meta = options.buildPrettyMeta(route);
  const out = {};
  const keys = Array.isArray(options.includeMeta) ? options.includeMeta : Reflect.ownKeys(meta);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(meta, key)) continue;
    const value = meta[key];
    if (value !== undefined && value !== null) out[key.toString()] = JSON.stringify(parseMeta(value));
  }
  return out;
}

function serializeMetaData(meta) {
  let out = '';
  for (const [key, value] of Object.entries(meta)) out += `\n• (${key}) ${value}`;
  return out;
}

function normalizeRoute(route) {
  const constraints = { ...route.opts.constraints };
  const method = constraints[httpMethod.name];
  delete constraints[httpMethod.name];
  return { ...route, method, opts: { constraints } };
}

function serializeConstraints(constraints) {
  return JSON.stringify(constraints, (key, value) => (value instanceof RegExp ? value.toString() : value));
}

function serializeRoute(route) {
  let out = ` (${route.method})`;
  const constraints = route.opts.constraints || {};
  if (Object.keys(constraints).length !== 0) out += ` ${serializeConstraints(constraints)}`;
  return out + serializeMetaData(route.metaData);
}

function sameMeta(a, b) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

function mergeSimilarRoutes(routes) {
  const merged = [];
  for (const route of routes) {
    const same = merged.find(
      (other) =>
        deepEqualConstraints(route.opts.constraints || {}, other.opts.constraints || {}) &&
        sameMeta(route.metaData, other.metaData)
    );
    if (same) same.method += `, ${route.method}`;
    else merged.push(route);
  }
  return merged;
}

function serializeNode(node, prefix, options) {
  let routes = node.routes;
  if (options.method === undefined) routes = routes.map(normalizeRoute);
  routes = routes.map((route) => ({ ...route, metaData: routeMetaData(route, options) }));
  if (options.method === undefined) routes = mergeSimilarRoutes(routes);
  return routes.map(serializeRoute).join(`\n${prefix}`);
}

function buildObjectTree(node, tree, prefix, options) {
  let subtree = tree;
  let childPrefixBase = prefix;
  if (node.isLeafNode || options.commonPrefix !== false) {
    const key = prefix || '(empty root node)';
    subtree = {};
    tree[key] = subtree;
    if (node.isLeafNode) subtree[treeData] = serializeNode(node, key, options);
    childPrefixBase = '';
  }
  if (node.staticChildrenNodes) {
    for (const child of node.staticChildrenNodes)
      buildObjectTree(child, subtree, childPrefixBase + child.prefix, options);
  }
  if (node.parametricChildren) {
    for (const child of node.parametricChildren) {
      buildObjectTree(child, subtree, childPrefixBase + Array.from(child.nodePaths).join('|'), options);
    }
  }
  if (node.wildcardChild) buildObjectTree(node.wildcardChild, subtree, '*', options);
}

function prettyPrintTree(root, options) {
  const tree = {};
  buildObjectTree(root, tree, root.prefix, options);
  return printObjectTree(tree);
}

module.exports = { prettyPrintTree };

},
"@xufa/router/lib/safe-regex.js": function (module, exports, require) {
// Whether a regular expression can backtrack catastrophically: a quantified group holding another quantifier, like
// (a+)+ or (x*)*, has a star height above one. What safe-regex checks, without its limit on repetitions.

const RANGE = /^\{(?:\d+,\d*|\d*[2-9]\d*)\}/;

const isQuantifier = (source, i) => {
  const ch = source[i];
  if (ch === '*' || ch === '+') return true;
  if (ch === '?') return false;
  // {n,}, {n,m} and {n} with n > 1 repeat
  if (ch === '{') return RANGE.test(source.slice(i, i + 24));
  return false;
};

function isSafeRegex(regex) {
  const source = regex instanceof RegExp ? regex.source : String(regex);
  // Each open group remembers whether a quantifier was seen inside it.
  const stack = [{ quantified: false }];
  let inClass = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '\\') {
      i += 1;
      if (isQuantifier(source, i + 1)) stack[stack.length - 1].quantified = true;
      continue;
    }
    if (inClass) {
      if (ch === ']') {
        inClass = false;
        if (isQuantifier(source, i + 1)) stack[stack.length - 1].quantified = true;
      }
      continue;
    }
    if (ch === '[') {
      inClass = true;
    } else if (ch === '(') {
      stack.push({ quantified: false });
    } else if (ch === ')') {
      const group = stack.length > 1 ? stack.pop() : { quantified: false };
      if (isQuantifier(source, i + 1)) {
        if (group.quantified) return false;
        stack[stack.length - 1].quantified = true;
      } else if (group.quantified) {
        stack[stack.length - 1].quantified = true;
      }
    } else if (isQuantifier(source, i)) {
      stack[stack.length - 1].quantified = true;
    }
  }
  return true;
}

module.exports = { isSafeRegex };

},
"@xufa/router/lib/strategies.js": function (module, exports, require) {
// Built-in constraint strategies: version (semver, from the Accept-Version header) and host.

function equalValue(a, b) {
  if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags;
  return a === b;
}

function SemVerStore() {
  if (!(this instanceof SemVerStore)) return new SemVerStore();
  this.store = new Map();
  this.maxMajor = 0;
  this.maxMinors = {};
  this.maxPatches = {};
}

SemVerStore.prototype.set = function set(version, value) {
  if (typeof version !== 'string') throw new TypeError('Version should be a string');
  const parts = version.split('.', 3);
  if (Number.isNaN(Number(parts[0]))) throw new TypeError('Major version must be a numeric value');
  const major = Number(parts[0]);
  const minor = Number(parts[1]) || 0;
  const patch = Number(parts[2]) || 0;
  if (major >= this.maxMajor) {
    this.maxMajor = major;
    this.store.set('x', value);
    this.store.set('*', value);
    this.store.set('x.x', value);
    this.store.set('x.x.x', value);
  }
  if (minor >= (this.maxMinors[major] || 0)) {
    this.maxMinors[major] = minor;
    this.store.set(`${major}.x`, value);
    this.store.set(`${major}.x.x`, value);
  }
  if (patch >= (this.maxPatches[`${major}.${minor}`] || 0)) {
    this.maxPatches[`${major}.${minor}`] = patch;
    this.store.set(`${major}.${minor}.x`, value);
  }
  this.store.set(`${major}.${minor}.${patch}`, value);
  return this;
};

SemVerStore.prototype.get = function get(version) {
  return this.store.get(version);
};

const version = {
  name: 'version',
  mustMatchWhenDerived: true,
  storage: SemVerStore,
  deriveConstraint: (req) => req.headers['accept-version'],
  validate(value) {
    if (typeof value !== 'string') throw new TypeError('Version should be a string');
  },
};

function HostStorage() {
  const hosts = new Map();
  const regexHosts = [];
  const regexCache = new Map();
  return {
    get(host) {
      const exact = hosts.get(host);
      if (exact) return exact;
      if (regexHosts.length === 0) return undefined;
      if (regexCache.has(host)) return regexCache.get(host);
      for (const entry of regexHosts) {
        if (entry.host.test(host)) {
          regexCache.set(host, entry.value);
          return entry.value;
        }
      }
      regexCache.set(host, undefined);
      return undefined;
    },
    set(host, value) {
      if (host instanceof RegExp) {
        regexHosts.push({ host: new RegExp(host.source, host.flags.replace(/[gy]/g, '')), value });
        regexCache.clear();
      } else {
        hosts.set(host, value);
      }
    },
  };
}

const host = {
  name: 'host',
  mustMatchWhenDerived: false,
  storage: HostStorage,
  deriveConstraint: (req) => req.headers.host || req.headers[':authority'],
  validate(value) {
    if (typeof value !== 'string' && Object.prototype.toString.call(value) !== '[object RegExp]') {
      throw new TypeError('Host should be a string or a RegExp');
    }
  },
};

// Used to print every method of a route in one tree.
const httpMethod = {
  name: '__xufa_router_http_method__',
  storage() {
    const handlers = new Map();
    return {
      get: (type) => handlers.get(type) || null,
      set: (type, value) => handlers.set(type, value),
    };
  },
  deriveConstraint: (req) => req.method,
  mustMatchWhenDerived: true,
};

function deepEqualConstraints(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !equalValue(a[key], b[key])) return false;
  }
  return true;
}

module.exports = { version, host, httpMethod, SemVerStore, HostStorage, deepEqualConstraints };

},
"@xufa/router/lib/url.js": function (module, exports, require) {
// Splitting the path from the query string, and decoding the path.
//
// The path is decoded with decodeURI, which keeps the reserved characters (# $ & + , / : ; = ? @) encoded, so that an
// encoded slash never splits a parameter. Parameters holding one of them are decoded afterwards on their own. An
// encoded % (%25) is encoded once more before decodeURI, so that it is never decoded twice.

// For the two hex digits after a %, the reserved character they decode to, or 0.
const RESERVED = new Uint8Array(768);
for (const [hex, char] of [
  ['23', '#'],
  ['24', '$'],
  ['25', '%'],
  ['26', '&'],
  ['2B', '+'],
  ['2b', '+'],
  ['2C', ','],
  ['2c', ','],
  ['2F', '/'],
  ['2f', '/'],
  ['3A', ':'],
  ['3a', ':'],
  ['3B', ';'],
  ['3b', ';'],
  ['3D', '='],
  ['3d', '='],
  ['3F', '?'],
  ['3f', '?'],
  ['40', '@'],
]) {
  RESERVED[((hex.charCodeAt(0) - 50) << 8) | hex.charCodeAt(1)] = char.charCodeAt(0);
}

function reservedCharCode(high, low) {
  if (high < 50 || high > 52 || low > 255) return 0;
  return RESERVED[((high - 50) << 8) | low];
}

// Result of splitURL(), reused: read its fields before calling it again.
const split = { path: '', querystring: '', decodeParams: false };

// Splits the request target at ?, # (and ; when asked) and decodes the path. Null when the path is malformed.
function splitURL(url, semicolon) {
  const len = url.length;
  let i = 1;
  for (; i < len; i += 1) {
    const code = url.charCodeAt(i);
    if (code === 63 || code === 35 || (code === 59 && semicolon)) {
      split.path = url.slice(0, i);
      split.querystring = url.slice(i + 1);
      split.decodeParams = false;
      return split;
    }
    if (code === 37) return splitEncoded(url, semicolon, i);
  }
  split.path = url;
  split.querystring = '';
  split.decodeParams = false;
  return split;
}

function splitEncoded(url, semicolon, start) {
  let path = url;
  let querystring = '';
  let decode = false;
  let decodeParams = false;
  for (let i = start; i < path.length; i += 1) {
    const code = path.charCodeAt(i);
    if (code === 37) {
      const reserved = reservedCharCode(path.charCodeAt(i + 1), path.charCodeAt(i + 2));
      if (reserved === 0) {
        decode = true;
      } else {
        decodeParams = true;
        if (reserved === 37) {
          decode = true;
          path = `${path.slice(0, i + 1)}25${path.slice(i + 1)}`;
          i += 2;
        }
        i += 2;
      }
    } else if (code === 63 || code === 35 || (code === 59 && semicolon)) {
      querystring = path.slice(i + 1);
      path = path.slice(0, i);
      break;
    }
  }
  if (decode) {
    try {
      split.path = decodeURI(path);
    } catch {
      return null;
    }
  } else {
    split.path = path;
  }
  split.querystring = querystring;
  split.decodeParams = decodeParams;
  return split;
}

// Decodes the reserved characters left encoded in a parameter.
function decodeParam(param) {
  const first = param.indexOf('%');
  if (first === -1) return param;
  let out = param.slice(0, first);
  let last = first;
  for (let i = first; i < param.length; i += 1) {
    if (param.charCodeAt(i) === 37) {
      const code = reservedCharCode(param.charCodeAt(i + 1), param.charCodeAt(i + 2));
      if (code !== 0) {
        out += param.slice(last, i) + String.fromCharCode(code);
        last = i + 3;
        i += 2;
      }
    }
  }
  return out + param.slice(last);
}

function safeDecodeURI(url, semicolon) {
  const result = splitURL(url, semicolon);
  if (result === null) throw new URIError('URI malformed');
  return { path: result.path, querystring: result.querystring, shouldDecodeParam: result.decodeParams };
}

// The path of an absolute-form request target (http://host/path?q), or null when it is not a valid one.
function pathFromAbsoluteURL(url) {
  const schemeEnd = url.indexOf('://');
  if (schemeEnd === -1) return url;
  const scheme = url.slice(0, schemeEnd).toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return url;
  const authorityStart = schemeEnd + 3;
  let authorityEnd = url.length;
  const pathStart = url.indexOf('/', authorityStart);
  if (pathStart !== -1) authorityEnd = pathStart;
  const queryStart = url.indexOf('?', authorityStart);
  if (queryStart !== -1 && queryStart < authorityEnd) authorityEnd = queryStart;
  if (url.indexOf('#', authorityStart) !== -1 || authorityEnd === authorityStart) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${scheme}:` || parsed.host.length === 0) return null;
  } catch {
    return null;
  }
  if (authorityEnd === url.length) return '/';
  if (authorityEnd === queryStart) return `/${url.slice(queryStart)}`;
  return url.slice(pathStart);
}

const DUPLICATE_SLASHES = /\/\/+/g;

function removeDuplicateSlashes(path) {
  return path.indexOf('//') !== -1 ? path.replace(DUPLICATE_SLASHES, '/') : path;
}

function trimLastSlash(path) {
  return path.length > 1 && path.charCodeAt(path.length - 1) === 47 ? path.slice(0, -1) : path;
}

module.exports = {
  splitURL,
  splitEncoded,
  decodeParam,
  safeDecodeURI,
  safeDecodeURIComponent: decodeParam,
  pathFromAbsoluteURL,
  removeDuplicateSlashes,
  trimLastSlash,
};

},
"@xufa/router/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/router","version":"0.1.0"};
},
"@xufa/schema/index.js": function (module, exports, require) {
'use strict';

// @xufa/schema: schemas of data. Written as code with s (plain JSON Schemas, with their TypeScript types), as JSON
// Schema (draft-04 to 2020-12), or with the builder of types (new Schema({ name: String() })); compiled into
// functions that check values (the validator of the routes of @xufa/http), written as standalone code, or inferred
// from samples. No dependencies.
//
//   const { s, compileJsonSchema } = require('@xufa/schema');
//   const Book = s.object({ title: s.string({ minLength: 1 }), pages: s.optional(s.integer({ minimum: 1 })) });
//   const validate = compileJsonSchema(Book);
//   validate({ pages: 0 }); // ['title is mandatory', 'pages must be at least 1']
module.exports = require('./src');

},
"@xufa/schema/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/schema","version":"0.1.0"};
},
"@xufa/schema/src/ajv-keywords.js": function (module, exports, require) {
// The keywords of ajv-keywords (https://github.com/ajv-validator/ajv-keywords), as definitions for the option "keywords"
// of compileJsonSchema(): ajvKeywords() gives all of them, ajvKeywords(['range', 'typeof']) the ones named. The ones
// that are other keywords written shorter are macros, and compile to the same code as those keywords.
const { deepEqual } = require('./deep-equal');

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const list = (value) => (Array.isArray(value) ? value : [value]);

// Throws when the value of `keyword` in a schema is not what it takes.
function expect(isValid, keyword, what) {
  if (!isValid) {
    throw new Error(`Unsupported JSON Schema: "${keyword}" must be ${what}`);
  }
}

const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');

const TYPEOF_NAMES = ['undefined', 'string', 'number', 'object', 'function', 'boolean', 'symbol', 'bigint'];

// Constructors "instanceof" can name, as in ajv-keywords.
// Read from globalThis, so a script that declares a global named like one of them (const { String } = ...) does not
// shadow it here.
const CONSTRUCTORS = Object.fromEntries(
  ['Object', 'Array', 'Function', 'Number', 'String', 'Boolean', 'Date', 'RegExp', 'Map', 'Set', 'Promise', 'Buffer']
    .filter((name) => typeof globalThis[name] === 'function')
    .map((name) => [name, globalThis[name]])
);

// The regular expression of "regexp": "/source/flags" or { pattern, flags }, as ajv-keywords reads it.
function regExpOf(value) {
  const what = 'a string "/pattern/flags" or { pattern, flags }';
  if (typeof value === 'string') {
    const match = /^\/(.*)\/([a-z]*)$/s.exec(value);
    expect(match !== null, 'regexp', what);
    return new RegExp(match[1], match[2]);
  }
  expect(isObject(value) && typeof value.pattern === 'string', 'regexp', what);
  return new RegExp(value.pattern, value.flags);
}

const unescapeToken = (token) => token.replace(/~1/g, '/').replace(/~0/g, '~');

// The schema "deepProperties" gives for one JSON pointer: nested "properties" down to `schema`, with the tuple of an
// array for a numeric token, as in ajv-keywords.
function deepPropertySchema(pointer, schema, draft) {
  const tokens = pointer.split('/').slice(1).map(unescapeToken);
  const root = {};
  let current = root;
  tokens.forEach((token, i) => {
    const next = i === tokens.length - 1 ? schema : {};
    current.properties = { [token]: next };
    if (/^[0-9]+$/.test(token)) {
      current.type = ['object', 'array'];
      current[draft === '2020-12' ? 'prefixItems' : 'items'] = [
        ...Array.from({ length: Number(token) }, () => ({})),
        next,
      ];
    } else {
      current.type = 'object';
    }
    current = next;
  });
  return root;
}

// Whether the value at a JSON pointer of `data` is defined, as ajv-keywords reads it for "deepRequired": the path is
// followed while the values on it are truthy (like data.a && data.a.b).
function isDefinedAt(data, tokens) {
  let current = data;
  for (let i = 0; i < tokens.length && current; i += 1) {
    current = current[tokens[i]];
  }
  return current !== undefined;
}

// Whether no two elements of `data` that are objects have equal values of `key` (deeply, NaN equal to NaN). Short
// arrays are compared pair by pair, which allocates nothing; long ones keep the values seen.
function hasUniqueProperty(data, key) {
  const isItem = (item) => item !== null && typeof item === 'object';
  const same = (a, b) =>
    a === b ||
    (Number.isNaN(a) && Number.isNaN(b)) ||
    (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && deepEqual(a, b));
  if (data.length <= 16) {
    for (let i = 1; i < data.length; i += 1) {
      if (isItem(data[i])) {
        const a = data[i][key];
        for (let j = 0; j < i; j += 1) {
          if (isItem(data[j]) && same(a, data[j][key])) {
            return false;
          }
        }
      }
    }
    return true;
  }
  const primitives = new Set();
  const objects = [];
  return data.every((item) => {
    if (!isItem(item)) {
      return true;
    }
    const property = item[key];
    if (property !== null && typeof property === 'object') {
      if (objects.some((other) => deepEqual(other, property))) {
        return false;
      }
      objects.push(property);
      return true;
    }
    if (primitives.has(property)) {
      return false;
    }
    primitives.add(property);
    return true;
  });
}

const DEFINITIONS = {
  typeof: {
    compile(value) {
      const names = list(value);
      expect(
        names.every((name) => TYPEOF_NAMES.includes(name)),
        'typeof',
        `one of ${TYPEOF_NAMES.join(', ')}`
      );
      return (data) => names.includes(typeof data);
    },
    message: (value) => `must be of typeof ${list(value).join(' or ')}`,
  },
  instanceof: {
    compile(value) {
      const names = list(value);
      const known = Object.keys(CONSTRUCTORS);
      expect(
        names.every((name) => known.includes(name)),
        'instanceof',
        `one of ${known.join(', ')}`
      );
      const constructors = names.map((name) => CONSTRUCTORS[name]);
      return (data) => constructors.some((constructor) => data instanceof constructor);
    },
    message: (value) => `must be an instance of ${list(value).join(' or ')}`,
  },
  range: {
    type: 'number',
    macro(value) {
      expect(Array.isArray(value) && value.length === 2 && value[0] <= value[1], 'range', '[minimum, maximum]');
      return { minimum: value[0], maximum: value[1] };
    },
  },
  exclusiveRange: {
    type: 'number',
    macro(value, parentSchema, { draft }) {
      expect(Array.isArray(value) && value.length === 2 && value[0] < value[1], 'exclusiveRange', '[minimum, maximum]');
      return draft === 'draft-04'
        ? { minimum: value[0], exclusiveMinimum: true, maximum: value[1], exclusiveMaximum: true }
        : { exclusiveMinimum: value[0], exclusiveMaximum: value[1] };
    },
  },
  regexp: {
    type: 'string',
    compile(value) {
      const regExp = regExpOf(value);
      // A regular expression is tested as it is, unless its flags make test() depend on the previous call.
      if (!regExp.global && !regExp.sticky) {
        return regExp;
      }
      return (data) => {
        regExp.lastIndex = 0;
        return regExp.test(data);
      };
    },
    message: (value) => `must match ${regExpOf(value)}`,
  },
  uniqueItemProperties: {
    type: 'array',
    compile(value) {
      expect(isStringList(value), 'uniqueItemProperties', 'a list of property names');
      // As in ajv-keywords, the elements that are objects (or arrays) count, and a missing property is a value too.
      return (data) => {
        if (data.length <= 1) {
          return true;
        }
        for (let k = 0; k < value.length; k += 1) {
          if (!hasUniqueProperty(data, value[k])) {
            return false;
          }
        }
        return true;
      };
    },
    message: (value) => `must have elements with unique ${value.join(', ')}`,
  },
  allRequired: {
    type: 'object',
    macro(value, parentSchema) {
      expect(typeof value === 'boolean', 'allRequired', 'true or false');
      if (!value) {
        return true;
      }
      expect(isObject(parentSchema.properties), 'allRequired', 'next to "properties"');
      return { required: Object.keys(parentSchema.properties) };
    },
  },
  anyRequired: {
    type: 'object',
    macro(value) {
      expect(isStringList(value), 'anyRequired', 'a list of property names');
      return { anyOf: value.map((key) => ({ required: [key] })) };
    },
  },
  oneRequired: {
    type: 'object',
    macro(value) {
      expect(isStringList(value), 'oneRequired', 'a list of property names');
      return { oneOf: value.map((key) => ({ required: [key] })) };
    },
  },
  patternRequired: {
    type: 'object',
    compile(value) {
      expect(isStringList(value), 'patternRequired', 'a list of patterns');
      const regExps = value.map((source) => new RegExp(source, 'u'));
      return (data) => {
        const keys = Object.keys(data);
        return regExps.every((regExp) => keys.some((key) => regExp.test(key)));
      };
    },
    message: (value) => `must have keys matching ${value.join(', ')}`,
  },
  prohibited: {
    type: 'object',
    macro(value) {
      expect(isStringList(value), 'prohibited', 'a list of property names');
      return { properties: Object.fromEntries(value.map((key) => [key, false])) };
    },
  },
  deepProperties: {
    type: 'object',
    macro(value, parentSchema, { draft }) {
      expect(isObject(value), 'deepProperties', 'an object of schemas by JSON pointer');
      return { allOf: Object.entries(value).map(([pointer, schema]) => deepPropertySchema(pointer, schema, draft)) };
    },
  },
  deepRequired: {
    type: 'object',
    compile(value) {
      expect(
        isStringList(value) && value.every((pointer) => pointer.startsWith('/')),
        'deepRequired',
        'a list of JSON pointers'
      );
      const paths = value.map((pointer) => pointer.split('/').slice(1).map(unescapeToken));
      return (data) => paths.every((tokens) => isDefinedAt(data, tokens));
    },
    message: (value, data) => {
      const missing = value.filter((pointer) => !isDefinedAt(data, pointer.split('/').slice(1).map(unescapeToken)));
      return `must have ${missing.join(', ')}`;
    },
  },
};

// Keywords of ajv-keywords that the validator leaves out, with the reason.
const LEFT_OUT = {
  transform:
    'it changes the data (the validator only assigns defaults and removes properties, see useDefaults and removeAdditional)',
  dynamicDefaults: 'it computes defaults when validating; use useDefaults with fixed defaults',
  select: 'it needs $data references',
  selectCases: 'it needs $data references',
  selectDefault: 'it needs $data references',
};

// Definitions of the keywords of ajv-keywords named in `names` (all of them by default).
function ajvKeywords(names = Object.keys(DEFINITIONS)) {
  return list(names).map((name) => {
    if (hasOwn(LEFT_OUT, name)) {
      throw new Error(`ajvKeywords: "${name}" is not supported: ${LEFT_OUT[name]}`);
    }
    if (!hasOwn(DEFINITIONS, name)) {
      throw new Error(
        `ajvKeywords: unknown keyword "${name}"; the keywords are ${Object.keys(DEFINITIONS).join(', ')}`
      );
    }
    return { keyword: name, ...DEFINITIONS[name] };
  });
}

module.exports = {
  ajvKeywords,
};

},
"@xufa/schema/src/builder.js": function (module, exports, require) {
'use strict';

// @xufa/schema: JSON Schemas written as code, with their types in TypeScript. What it makes are plain JSON Schemas
// (draft-07, the ones of fastify): routes of @xufa/http and fastify validate and serialize with them, @xufa/openapi
// documents them; in TypeScript, Infer<typeof schema> is the type of the values, and SchemaTypeProvider types the
// requests and replies of routes. No dependencies.
//
//   const { s } = require('@xufa/schema');
//   const Book = s.object({
//     id: s.integer({ minimum: 1 }),
//     title: s.string({ minLength: 1 }),
//     pages: s.optional(s.integer()),
//     status: s.enum(['draft', 'published']),
//     tags: s.array(s.string(), { uniqueItems: true }),
//   });
//   const NewBook = s.omit(Book, ['id']);           // the body of a create
//   const BookPatch = s.partial(NewBook);           // the body of an update
//   app.post('/books', { schema: { body: NewBook, response: { 201: Book } } }, handler);

// The keys of an object that are not required: a mark on the schemas given to s.optional() (not enumerable, so it is
// not in their JSON).
const OPTIONAL = Symbol.for('xufa.schema.optional');

const isSchema = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function check(value, what) {
  if (!isSchema(value)) throw new TypeError(`${what} is a schema (an object)`);
  return value;
}

// A copy of a schema (its mark of optional kept, or given).
function copyOf(schema, optional = schema[OPTIONAL] === true) {
  const copy = { ...schema };
  if (optional) Object.defineProperty(copy, OPTIONAL, { value: true, enumerable: false });
  return copy;
}

const typeOfValue = (value) => {
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'string' || typeof value === 'boolean') return typeof value;
  return null;
};

function object(properties, options = {}) {
  check(properties, 's.object(properties)');
  const props = {};
  const required = [];
  for (const [name, schema] of Object.entries(properties)) {
    check(schema, `The property ${name}`);
    props[name] = copyOf(schema, false);
    if (schema[OPTIONAL] !== true) required.push(name);
  }
  const out = { type: 'object', properties: props, ...options };
  if (required.length) out.required = required;
  return out;
}

// The properties of an object schema, as given to s.object() (those not required marked optional).
function propertiesOf(schema, what) {
  check(schema, what);
  if (schema.type !== 'object' || !isSchema(schema.properties))
    throw new TypeError(`${what} is a schema of s.object()`);
  const required = new Set(schema.required || []);
  const out = {};
  for (const [name, property] of Object.entries(schema.properties)) out[name] = copyOf(property, !required.has(name));
  return out;
}

// The options of an object schema (all but its properties and required).
function optionsOf(schema) {
  const { type, properties, required, ...options } = schema; // eslint-disable-line no-unused-vars
  return options;
}

function nullable(schema) {
  check(schema, 's.nullable(schema)');
  const optional = schema[OPTIONAL] === true;
  let out;
  if (typeof schema.type === 'string')
    out = { ...schema, type: schema.type === 'null' ? 'null' : [schema.type, 'null'] };
  else if (Array.isArray(schema.type))
    out = { ...schema, type: schema.type.includes('null') ? schema.type : [...schema.type, 'null'] };
  else out = { anyOf: [copyOf(schema, false), { type: 'null' }] };
  if (Array.isArray(out.enum) && !out.enum.includes(null)) out.enum = [...out.enum, null];
  return copyOf(out, optional);
}

const s = {
  string: (options = {}) => ({ type: 'string', ...options }),
  number: (options = {}) => ({ type: 'number', ...options }),
  integer: (options = {}) => ({ type: 'integer', ...options }),
  boolean: (options = {}) => ({ type: 'boolean', ...options }),
  null: (options = {}) => ({ type: 'null', ...options }),

  // Strings of formats (what JSON has: a date is its text).
  dateTime: (options = {}) => ({ type: 'string', format: 'date-time', ...options }),
  date: (options = {}) => ({ type: 'string', format: 'date', ...options }),
  email: (options = {}) => ({ type: 'string', format: 'email', ...options }),
  uuid: (options = {}) => ({ type: 'string', format: 'uuid', ...options }),
  uri: (options = {}) => ({ type: 'string', format: 'uri', ...options }),

  // One value; one of some values.
  literal(value, options = {}) {
    const type = typeOfValue(value);
    if (!type) throw new TypeError('s.literal(value): a string, a number, a boolean or null');
    return { type, const: value, ...options };
  },
  enum(values, options = {}) {
    if (!Array.isArray(values) || values.length === 0) throw new TypeError('s.enum(values): a list of values');
    const types = [...new Set(values.map(typeOfValue))];
    if (types.includes(null)) throw new TypeError('s.enum(values): strings, numbers, booleans or null');
    // integer is number when both are there; one type is the type, several a list.
    const merged = [...new Set(types.map((t) => (t === 'integer' && types.includes('number') ? 'number' : t)))];
    return { type: merged.length === 1 ? merged[0] : merged, enum: [...values], ...options };
  },

  array: (items, options = {}) => ({ type: 'array', items: copyOf(check(items, 's.array(items)'), false), ...options }),
  // An array of a length, of a schema for each item (draft-07: items as a list).
  tuple(items, options = {}) {
    if (!Array.isArray(items)) throw new TypeError('s.tuple(items): a list of schemas');
    return {
      type: 'array',
      items: items.map((item, i) => copyOf(check(item, `s.tuple item ${i}`), false)),
      minItems: items.length,
      maxItems: items.length,
      additionalItems: false,
      ...options,
    };
  },
  object,
  // An object of any keys, with values of a schema.
  record: (values, options = {}) => ({
    type: 'object',
    additionalProperties: copyOf(check(values, 's.record(values)'), false),
    ...options,
  }),

  // Any of some schemas (anyOf); all of them (allOf).
  union(schemas, options = {}) {
    if (!Array.isArray(schemas) || schemas.length === 0) throw new TypeError('s.union(schemas): a list of schemas');
    return { anyOf: schemas.map((schema, i) => copyOf(check(schema, `s.union schema ${i}`), false)), ...options };
  },
  intersect(schemas, options = {}) {
    if (!Array.isArray(schemas) || schemas.length === 0) throw new TypeError('s.intersect(schemas): a list of schemas');
    return { allOf: schemas.map((schema, i) => copyOf(check(schema, `s.intersect schema ${i}`), false)), ...options };
  },

  // A property that is not required (in s.object()); a value that can be null too.
  optional: (schema) => copyOf(check(schema, 's.optional(schema)'), true),
  nullable,

  // Objects from objects: some of their properties, all of them not required (or required), more of them.
  pick(schema, keys) {
    const properties = propertiesOf(schema, 's.pick(schema)');
    const out = {};
    for (const key of keys) {
      if (!Object.hasOwn(properties, key)) throw new TypeError(`s.pick(): the schema has no property ${key}`);
      out[key] = properties[key];
    }
    return object(out, optionsOf(schema));
  },
  omit(schema, keys) {
    const properties = propertiesOf(schema, 's.omit(schema)');
    for (const key of keys) {
      if (!Object.hasOwn(properties, key)) throw new TypeError(`s.omit(): the schema has no property ${key}`);
      delete properties[key];
    }
    return object(properties, optionsOf(schema));
  },
  partial(schema) {
    const properties = propertiesOf(schema, 's.partial(schema)');
    for (const key of Object.keys(properties)) properties[key] = copyOf(properties[key], true);
    return object(properties, optionsOf(schema));
  },
  required(schema) {
    const properties = propertiesOf(schema, 's.required(schema)');
    for (const key of Object.keys(properties)) properties[key] = copyOf(properties[key], false);
    return object(properties, optionsOf(schema));
  },
  extend(schema, more, options = {}) {
    const properties = propertiesOf(schema, 's.extend(schema)');
    check(more, 's.extend(schema, properties)');
    return object({ ...properties, ...more }, { ...optionsOf(schema), ...options });
  },

  // A shared schema (app.addSchema(schema) with its $id): { $ref: 'Book#' }.
  ref: (id, options = {}) => ({ $ref: id, ...options }),
  // Anything; nothing.
  any: (options = {}) => ({ ...options }),
  unknown: (options = {}) => ({ ...options }),
  never: (options = {}) => ({ not: {}, ...options }),
};

const isOptional = (schema) => isSchema(schema) && schema[OPTIONAL] === true;

module.exports = { s, isOptional, OPTIONAL };

},
"@xufa/schema/src/closed-schema.js": function (module, exports, require) {
const { Schema } = require('./schema');

class ClosedSchema extends Schema {
  constructor(schema = {}, options = {}) {
    super(schema, { ...options, isOpen: false });
  }
}

module.exports = {
  ClosedSchema,
};

},
"@xufa/schema/src/coerce.js": function (module, exports, require) {
// The option coerceTypes: a value that is not of the JSON type its schema's "type" asks for is converted to one of those
// types when it can be, with ajv's rules, before it is checked. The converted value replaces the original one in the
// object or array it is in; a value that is in neither (the value validated) is converted for the validation only.
const { ValidateType } = require('./types/validate-type');

// The types a value can be converted to, in the order "type" lists them; "array" too with coerceTypes: 'array'.
const COERCIBLE = ['string', 'number', 'integer', 'boolean', 'null'];

// Whether a value is of a JSON type, as the type checks see it (numbers are finite).
const TYPE_TESTS = {
  string: (x) => typeof x === 'string',
  number: (x) => typeof x === 'number' && Number.isFinite(x),
  integer: (x) => Number.isInteger(x),
  boolean: (x) => typeof x === 'boolean',
  null: (x) => x === null,
  object: (x) => x !== null && typeof x === 'object' && !Array.isArray(x),
  array: (x) => Array.isArray(x),
};

const isNumeric = (x) => typeof x === 'string' && x !== '' && !Number.isNaN(Number(x));

// The value converted to a type, or undefined when it cannot be (as in ajv: numbers and booleans to strings, numeric
// strings, booleans and null to numbers, 'true', 'false', 1, 0 and null to booleans, '', 0 and false to null, and any
// primitive to an array of it).
const COERCIONS = {
  string: (x) => {
    if (typeof x === 'number' || typeof x === 'boolean') {
      return String(x);
    }
    return x === null ? '' : undefined;
  },
  number: (x) => (typeof x === 'boolean' || x === null || isNumeric(x) ? Number(x) : undefined),
  integer: (x) =>
    typeof x === 'boolean' || x === null || (isNumeric(x) && Number(x) % 1 === 0) ? Number(x) : undefined,
  boolean: (x) => {
    if (x === 'false' || x === 0 || x === null) {
      return false;
    }
    return x === 'true' || x === 1 ? true : undefined;
  },
  null: (x) => (x === '' || x === 0 || x === false ? null : undefined),
  array: (x) => (x === null || ['string', 'number', 'boolean'].includes(typeof x) ? [x] : undefined),
};

// A value converted for a schema with `spec` ({ types, to, array }, see coerceSpecOf()): { value, assign }, where
// `assign` tells whether the converted value replaces the original one. With coerceTypes: 'array', an array of one
// element is first taken as that element, which is checked even when it is not converted, as in ajv.
function coerce(value, spec) {
  const matches = (x) => spec.types.some((type) => TYPE_TESTS[type](x));
  if (matches(value)) {
    return { value, assign: false };
  }
  let current = value;
  let converted;
  if (spec.array && Array.isArray(current) && current.length === 1) {
    [current] = current;
    if (matches(current)) {
      converted = current;
    }
  }
  for (let i = 0; i < spec.to.length && converted === undefined; i += 1) {
    converted = COERCIONS[spec.to[i]](current);
  }
  return converted === undefined ? { value: current, assign: false } : { value: converted, assign: true };
}

// The conversion a type asks for: its own (coerceSpec, set when converting a schema with "type"), or the one of the
// target of a reference, or of the first part of an allOf that has one.
function coerceSpecOf(type, seen = []) {
  if (!type) {
    return undefined;
  }
  if (type.coerceSpec) {
    return type.coerceSpec;
  }
  // eslint-disable-next-line global-require -- required when used: the types require this module
  const { RefType, AllOfType } = require('./types');
  if (type.constructor === RefType && !seen.includes(type)) {
    return coerceSpecOf(type.getTarget(), [...seen, type]);
  }
  if (type.constructor === AllOfType) {
    for (let i = 0; i < type.types.length; i += 1) {
      const spec = coerceSpecOf(type.types[i], seen);
      if (spec) {
        return spec;
      }
    }
  }
  return undefined;
}

// The value of container[key] for the type that checks it, converted (and written back) when its schema asks.
function readCoerced(container, key, type, value) {
  const spec = value === undefined ? undefined : coerceSpecOf(type);
  if (!spec) {
    return value;
  }
  const result = coerce(value, spec);
  if (result.assign) {
    container[key] = result.value;
  }
  return result.value;
}

// The value validated, converted for the validation only: the schema of the whole value, with coerceTypes (see
// fromJsonSchema() in json-schema.js). Its type checks the converted value, presence included.
class CoerceType extends ValidateType {
  constructor(options = {}) {
    super({ ...options, isMandatory: false, isNullable: true });
    this.type = options.type;
    this.spec = options.spec;
  }

  converted(value) {
    return value === undefined ? value : coerce(value, this.spec).value;
  }

  validate(value, fieldName = undefined) {
    return this.type.validate(this.converted(value), fieldName);
  }

  errors(value, fieldName = undefined) {
    return this.type.errors(this.converted(value), fieldName);
  }

  isValid(value) {
    return this.type.isValid(this.converted(value));
  }
}

module.exports = {
  CoerceType,
  COERCIBLE,
  TYPE_TESTS,
  coerce,
  coerceSpecOf,
  readCoerced,
};

},
"@xufa/schema/src/compile.js": function (module, exports, require) {
const { deepEqual } = require('./deep-equal');
const { Schema } = require('./schema');
const { ClosedSchema } = require('./closed-schema');
const {
  AllOfType,
  AnyOfType,
  AnyType,
  ArrayOfType,
  BooleanType,
  ConditionalType,
  EnumType,
  FloatType,
  IntegerType,
  NeverType,
  NotType,
  ObjType,
  OneOfType,
  RefType,
  StringType,
  ValuesType,
  WhenType,
  hasErrors,
  toErrors,
} = require('./types');
const { NO_TYPE, EVERY_TYPE } = require('./types/one-of');
const { KeywordType } = require('./types/keyword');
const { FORMAT_LIMITS } = require('./types/string');
const { FORMAT_COMPARES } = require('./formats');

// What the built-in comparisons of times put before a value to read its time (see compareTime() in formats.js).
const TIME_PREFIXES = new Map([
  [FORMAT_COMPARES.time, '2020-01-01T'],
  [FORMAT_COMPARES['date-time'], ''],
]);

// How the comparison of a limit of a format fails, as code (see FORMAT_LIMITS in types/string.js).
const FORMAT_LIMIT_FAILS = {
  formatMinimum: '< 0',
  formatMaximum: '> 0',
  formatExclusiveMinimum: '<= 0',
  formatExclusiveMaximum: '>= 0',
};
const { copyDefault } = require('./defaults');
const { CoerceType, coerceSpecOf } = require('./coerce');
const { codePointLength } = require('./types/code-point-length');
const { hasDuplicates } = require('./types/has-duplicates');
const { JSON_TYPES, UnevaluatedType, staticEvaluatedBy, staticEvaluatedByAll } = require('./unevaluated');
const { errorObject, pathName } = require('./error-objects');

// The path of error objects that the code `path` gives when it is the same for every value (keys and positions
// written in the schema, out of loops): an array of keys and indexes, else undefined.
function staticPath(path) {
  if (!path.startsWith('[') || !path.endsWith(']')) {
    return undefined;
  }
  try {
    const value = JSON.parse(path);
    return Array.isArray(value) && value.every((item) => typeof item === 'string' || Number.isInteger(item))
      ? value
      : undefined;
  } catch (e) {
    return undefined;
  }
}

// A literal (key or index) of the code `code`, or undefined when it is worked out when validating.
function literalOf(code) {
  try {
    const value = JSON.parse(code);
    return typeof value === 'string' || Number.isInteger(value) ? value : undefined;
  } catch (e) {
    return undefined;
  }
}

// Compiles a type tree into a single generated function, like ajv does, so validating a value runs inline code
// instead of one isValid()/errors() call per node. There are three modes:
// - check: returns true or false, like isValid().
// - first: returns the first error message or undefined, which is toErrors(type.errors(value))[0].
// - all: returns every error message, which is toErrors(type.errors(value)).
// Messages are built from the same text, in the same order, as the interpreted validate() of each type.
//
// The generated code snapshots the tree: changes made to the types after compiling are not seen.
// Schema keys and message texts are embedded with JSON.stringify, finite numbers as literals; any other value is
// passed in through the `c` array. Types that are not built-in (custom classes and subclasses) run their own
// isValid()/errors().

const MAX_INLINE_KEYS = 8;

// A check this long (in characters of generated code) goes into its own function instead of being inlined.
const MAX_INLINE_CODE = 4000;

// Checks for a value that is neither undefined nor null, like isJsonType().
const JSON_TYPE_CHECKS = {
  object: (v) => `typeof ${v} === 'object' && !Array.isArray(${v})`,
  array: (v) => `Array.isArray(${v})`,
  string: (v) => `typeof ${v} === 'string'`,
  number: (v) => `typeof ${v} === 'number'`,
};

// Code testing the JSON types a keyword of your own can be limited to, for a value neither undefined nor null.
const KEYWORD_TYPE_CHECKS = {
  string: (v) => `typeof ${v} === 'string'`,
  number: (v) => `typeof ${v} === 'number'`,
  integer: (v) => `Number.isInteger(${v})`,
  boolean: (v) => `typeof ${v} === 'boolean'`,
  object: (v) => `(typeof ${v} === 'object' && !Array.isArray(${v}))`,
  array: (v) => `Array.isArray(${v})`,
  null: () => 'false',
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// Code of the tests of coerce.js TYPE_TESTS, for the value in `x`.
const COERCE_TYPE_TESTS = {
  string: (x) => `typeof ${x} === 'string'`,
  number: (x) => `(typeof ${x} === 'number' && Number.isFinite(${x}))`,
  integer: (x) => `Number.isInteger(${x})`,
  boolean: (x) => `typeof ${x} === 'boolean'`,
  null: (x) => `${x} === null`,
  object: (x) => `(${x} !== null && typeof ${x} === 'object' && !Array.isArray(${x}))`,
  array: (x) => `Array.isArray(${x})`,
};

// Code of the conversions of coerce.js COERCIONS: [condition, value] pairs, for the value in `x` whose typeof is in `t`.
const COERCE_CODE = {
  string: (x, t) => [
    [`${t} === 'number' || ${t} === 'boolean'`, `"" + ${x}`],
    [`${x} === null`, '""'],
  ],
  number: (x, t) => [
    [`${t} === 'boolean' || ${x} === null || (${t} === 'string' && ${x} !== "" && !Number.isNaN(+${x}))`, `+${x}`],
  ],
  integer: (x, t) => [
    [
      `${t} === 'boolean' || ${x} === null || (${t} === 'string' && ${x} !== "" && !Number.isNaN(+${x}) && +${x} % 1 === 0)`,
      `+${x}`,
    ],
  ],
  boolean: (x) => [
    [`${x} === "false" || ${x} === 0 || ${x} === null`, 'false'],
    [`${x} === "true" || ${x} === 1`, 'true'],
  ],
  null: (x) => [[`${x} === "" || ${x} === 0 || ${x} === false`, 'null']],
  array: (x, t) => [[`${t} === 'string' || ${t} === 'number' || ${t} === 'boolean' || ${x} === null`, `[${x}]`]],
};

// Condition on the value in `x` (code) that its default ({ empty }, see assignDefaults()) replaces.
const missingCode = (x, { empty }) =>
  empty ? `${x} === undefined || ${x} === null || ${x} === ""` : `${x} === undefined`;

// Code creating a new copy of a JSON value (arrays, plain objects and primitives), as a default is assigned; undefined
// for other values. Keys are computed, so a "__proto__" key is a plain entry.
function literalCode(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `(${JSON.stringify(value)})` : undefined;
  }
  if (Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype) {
    const items = value.map(literalCode);
    return items.every((item) => item !== undefined) ? `[${items.join(', ')}]` : undefined;
  }
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.keys(value).map((key) => [key, literalCode(value[key])]);
    return entries.every(([, item]) => item !== undefined)
      ? `{ ${entries.map(([key, item]) => `[${JSON.stringify(key)}]: ${item}`).join(', ')} }`
      : undefined;
  }
  return undefined;
}

function ownerOf(obj, name) {
  let proto = obj;
  while (proto && !hasOwn(proto, name)) {
    proto = Object.getPrototypeOf(proto);
  }
  return proto;
}

// A subclass that overrides validate() but inherits isValid() must be checked through validate().
function checksThroughValidate(type) {
  const validateOwner = ownerOf(type, 'validate');
  const isValidOwner = ownerOf(type, 'isValid');
  return validateOwner !== isValidOwner && Object.prototype.isPrototypeOf.call(isValidOwner, validateOwner);
}

// A `path` is a JS expression giving the fieldName passed to validate(): 'undefined' at the root, 'p' in the function
// of a reference target (where it can be undefined), and otherwise an expression that gives a string. Paths are only
// evaluated to build messages.

// Name of a node in its messages, as validate() defaults fieldName to 'Value'.
function valuePath(path) {
  if (path === 'undefined') {
    return '"Value"';
  }
  return path === 'p' ? '(p === undefined ? "Value" : p)' : path;
}

// Name of a Schema in its messages, as Schema uses fieldName || 'Value'.
function schemaName(path) {
  return path === 'undefined' ? '"Value"' : `(${path} || "Value")`;
}

// Name of a Schema key, as Schema uses fieldName ? `${fieldName}.${key}` : key. `key` is a JS expression.
function keyPath(path, key) {
  return path === 'undefined' ? key : `J(${path}, ${key})`;
}

// Same text as ValuesType.validate().
function formatValue(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function valuesMessage(values) {
  if (values.length === 1) {
    return ` must be equal to ${formatValue(values[0])}`;
  }
  return ` must be one of: ${values.map(formatValue).join(', ')}`;
}

const OBJECT_METHODS = ['constructor', 'valueOf', 'toString'];

// Values made of plain objects, arrays and primitives, for which deepEqual() can be written out as code.
function isPlainValue(value) {
  if (value === null || typeof value !== 'object') {
    return typeof value !== 'bigint' && typeof value !== 'symbol' && typeof value !== 'function';
  }
  if (Array.isArray(value)) {
    return (
      Object.getPrototypeOf(value) === Array.prototype &&
      Object.keys(value).length === value.length &&
      value.every(isPlainValue)
    );
  }
  return (
    Object.getPrototypeOf(value) === Object.prototype &&
    !OBJECT_METHODS.some((key) => hasOwn(value, key)) &&
    Object.values(value).every(isPlainValue)
  );
}

// Expression for deepEqual(value, x), where `value` is a plain value, following the same steps: identity or NaN for
// primitives; for objects the same constructor, then the same length and elements (arrays) or the same key count
// and own keys (objects).
function equalsCode(value, x) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && Number.isNaN(value)) {
      return `(typeof ${x} === 'number' && ${x} !== ${x})`;
    }
    if (typeof value === 'number') {
      return `${x} === ${Number.isFinite(value) ? `(${value})` : `${value > 0 ? '' : '-'}Infinity`}`;
    }
    return `${x} === ${value === undefined ? 'undefined' : JSON.stringify(value)}`;
  }
  const isObject = `typeof ${x} === 'object' && ${x} !== null`;
  if (Array.isArray(value)) {
    const items = value.map((item, i) => equalsCode(item, `${x}[${i}]`));
    return `(${[isObject, `${x}.constructor === Array`, `${x}.length === ${value.length}`, ...items].join(' && ')})`;
  }
  const keys = Object.keys(value);
  const entries = keys.map((key) => {
    const literal = JSON.stringify(key);
    return `H.call(${x}, ${literal}) && ${equalsCode(value[key], `${x}[${literal}]`)}`;
  });
  return `(${[isObject, `${x}.constructor === Object`, `Object.keys(${x}).length === ${keys.length}`, ...entries].join(
    ' && '
  )})`;
}

// Helpers for types that are not built-in, which run their own errors().
function firstError(type, value, fieldName) {
  return toErrors(type.errors(value, fieldName))[0];
}

// The list of errors of generated code, undefined until the first error, with the errors of a type added.
function pushErrors(out, type, value, fieldName) {
  const errors = toErrors(type.errors(value, fieldName));
  if (errors.length === 0) {
    return out;
  }
  return out === undefined ? errors : out.concat(errors);
}

// The same for errors as objects: a type of your own gives messages, which become errors with the keyword "custom"
// at the path of its value (named as fieldName, undefined for the value itself).
function customErrors(type, value, path) {
  const params = { type: type.constructor.name };
  return toErrors(type.errors(value, path.length > 0 ? pathName(path) : undefined)).map((message) =>
    errorObject(path, 'custom', params, message)
  );
}

function firstErrorObject(type, value, path) {
  return customErrors(type, value, path)[0];
}

function pushErrorObjects(out, type, value, path) {
  const errors = customErrors(type, value, path);
  if (errors.length === 0) {
    return out;
  }
  return out === undefined ? errors : out.concat(errors);
}

// A message for Generator.emit(): `text` gives the code of its text; `path` is the code of the path of the value it is
// about, `keyword` the name of the check and `params` the code of an object with its details.
function messageAt(path, text, keyword, params = '{}') {
  return Object.assign(text, { path, keyword, params });
}

class Generator {
  // `structured`: errors as objects (see error-objects.js), with the paths of the values as arrays of keys and
  // indexes instead of their names.
  constructor(mode, structured = false) {
    this.mode = mode;
    this.structured = structured;
    this.constants = [];
    this.nodes = [];
    this.functions = [];
    this.checkFunctions = new Map();
    // Functions adding what a type evaluates to a Set, by kind ('properties' or 'items'): see evaluatedFunction().
    this.evaluatedFunctions = { properties: new Map(), items: new Map() };
    // Per mode, the function validating each reference target.
    this.refFunctions = { check: new Map(), first: new Map(), all: new Map() };
    this.count = 0;
    // Nodes being generated, to fall back to their own isValid()/errors() if a tree refers to itself.
    this.visiting = new Set();
    // Statement for a failed check in 'check' mode: a return, or a break out of an inlined check.
    this.fail = 'return false;';
    // Generated function being written: code shares variables only within one (see sharedMatches).
    this.scope = 0;
    this.scopes = 0;
    // OneOf nodes of an allOf whose matching alternatives a later "unevaluated*" of the same allOf reuses: the
    // variables they are recorded in, the value and function they belong to, and whether the oneOf wrote them.
    this.sharedMatches = new Map();
    // Each oneOf with a discriminator to the same alternatives without it, which other values are checked against.
    this.plainOneOfs = new Map();
    // Values ("scope:variable") whose `plain` flag an enclosing allOf declares (see allOf()).
    this.plainDeclared = new Set();
    // In 'all' mode, whether the same error can be reported twice (several parts of an allOf, alternatives, or
    // patterns checking a key): the result then keeps each error once.
    this.mayRepeat = false;
  }

  // Runs `generate` as the body of another generated function.
  inScope(generate) {
    const { scope } = this;
    this.scopes += 1;
    this.scope = this.scopes;
    const result = generate();
    this.scope = scope;
    return result;
  }

  name(prefix) {
    this.count += 1;
    return `${prefix}${this.count}`;
  }

  constant(value) {
    this.constants.push(value);
    return `c[${this.constants.length - 1}]`;
  }

  number(value) {
    return typeof value === 'number' && Number.isFinite(value) ? `(${value})` : this.constant(value);
  }

  node(type) {
    let index = this.nodes.indexOf(type);
    if (index === -1) {
      this.nodes.push(type);
      index = this.nodes.length - 1;
    }
    return `n[${index}]`;
  }

  // Statement for a failed check; `message` gives the message expression and is only called when needed.
  // The error of a failed check: `message` gives the code of its text, and says the path of the value, the keyword
  // and the code of its params (see messageAt()). Errors are texts, or objects when structured.
  emit(message) {
    if (this.mode === 'check') {
      return this.fail;
    }
    let text = message();
    let { path } = message;
    // A path known when compiling: the error object is written out, pointer included, like errorObject() builds it.
    const known = this.structured ? staticPath(path) : undefined;
    if (known) {
      const pointer = known.map((key) => `/${`${key}`.replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
      const object = `{ path: ${path}, pointer: ${JSON.stringify(pointer)}, keyword: ${JSON.stringify(message.keyword)}, params: ${message.params}, message: ${text} }`;
      return this.mode === 'first' ? `return ${object};` : `out = P(out, ${object});`;
    }
    let assign = '';
    // A path that is built (not the variable of a function, or []) is built once, in variable q, for the object and
    // its message.
    if (this.structured && path.length > 3) {
      text = text.split(path).join('q');
      assign = `q = ${path}, `;
      path = 'q';
    }
    const error = this.structured
      ? `(${assign}${this.constant(errorObject)}(${path}, ${JSON.stringify(message.keyword)}, ${message.params}, ${text}))`
      : text;
    // The list of errors is only made with the first one: valid values build none.
    return this.mode === 'first' ? `return ${error};` : `out = P(out, ${error});`;
  }

  // Code of the path of the value itself: undefined (no name), or an empty array when structured.
  rootPath() {
    return this.structured ? '[]' : 'undefined';
  }

  // Code of the name of the value at `path`, as messages start with it; a Schema is "Value" at the root.
  nameOf(path, isSchema) {
    if (!this.structured) {
      return isSchema ? schemaName(path) : valuePath(path);
    }
    // A path known when compiling has its name written out.
    const known = staticPath(path);
    if (known) {
      return JSON.stringify(pathName(known));
    }
    const name = `${this.constant(pathName)}(${path})`;
    return isSchema ? `(${name} || "Value")` : name;
  }

  // Code of the path of the key `key` (code) of the object at `path`.
  keyOf(path, key) {
    if (!this.structured) {
      return keyPath(path, key);
    }
    const known = staticPath(path);
    if (known && literalOf(key) !== undefined) {
      return JSON.stringify([...known, literalOf(key)]);
    }
    return path === '[]' ? `[${key}]` : `${path}.concat([${key}])`;
  }

  // Code of the path of the element `index` (code) of the array at `path`, whose name is `name`.
  indexOf(path, name, index) {
    if (!this.structured) {
      return `(${name} + "[" + ${index} + "]")`;
    }
    const known = staticPath(path);
    if (known && literalOf(String(index)) !== undefined) {
      return JSON.stringify([...known, literalOf(String(index))]);
    }
    return path === '[]' ? `[${index}]` : `${path}.concat([${index}])`;
  }

  // Code of the path of a key checked by propertyNames, as a value: its name is "Key <name>".
  propertyNameOf(path, key) {
    if (!this.structured) {
      return `("Key " + ${keyPath(path, key)})`;
    }
    return path === '[]' ? `[{ key: ${key} }]` : `${path}.concat([{ key: ${key} }])`;
  }

  // Checks [condition, message, pre] run in order until one fails; `rest` runs when none fails. The optional `pre`
  // statements run just before their condition, only when the previous checks passed.
  chain(checks, rest = '') {
    let code = '';
    for (let i = 0; i < checks.length; i += 1) {
      const [condition, message, pre] = checks[i];
      if (pre) {
        const remaining = this.chain([[condition, message], ...checks.slice(i + 1)], rest);
        return `${code}${i ? 'else ' : ''}{\n${pre}${remaining}}\n`;
      }
      code += `${i ? 'else ' : ''}if (${condition}) { ${this.emit(message)} }\n`;
    }
    if (!rest) {
      return code;
    }
    return checks.length ? `${code}else {\n${rest}}\n` : rest;
  }

  // Generates a separate function in 'check' mode, where a failure returns false.
  inFunction(generate) {
    const { mode, fail, visiting } = this;
    this.mode = 'check';
    this.fail = 'return false;';
    this.visiting = new Set();
    const body = this.inScope(generate);
    this.mode = mode;
    this.fail = fail;
    this.visiting = visiting;
    return body;
  }

  // Name of a boolean function checking `type`, shared by every use of the same node.
  checkFunction(type) {
    if (!this.checkFunctions.has(type)) {
      const name = this.name('check');
      this.checkFunctions.set(type, name);
      const body = this.inFunction(() => this.generate(type, 'x', 'undefined'));
      this.functions.push(`function ${name}(x) {\n${body}return true;\n}\n`);
    }
    return this.checkFunctions.get(type);
  }

  // Code that runs `onPass` when the value in `v` satisfies `type`. The check is inlined in a labelled block that a
  // failure breaks out of, which avoids a function call; a long one goes into a function instead.
  inlineCheck(type, v, onPass) {
    const { mode, fail } = this;
    const label = this.name('L');
    this.mode = 'check';
    this.fail = `break ${label};`;
    const written = [...this.sharedMatches.values()].map((shared) => [shared, shared.written]);
    const body = this.generate(type, v, 'undefined');
    this.mode = mode;
    this.fail = fail;
    if (body.length > MAX_INLINE_CODE) {
      // The inlined code is dropped, with the variables it would have written.
      written.forEach(([shared, wasWritten]) => {
        shared.written = wasWritten;
      });
      return `if (${this.checkFunction(type)}(${v})) { ${onPass} }\n`;
    }
    return `${label}: {\n${body}${onPass}\n}\n`;
  }

  // Name of the function validating a reference target in the current mode. It takes the value and, to build
  // messages, the field name (and the error list in 'all' mode), so recursive schemas call it again.
  refFunction(target) {
    const functions = this.refFunctions[this.mode];
    if (!functions.has(target)) {
      const name = this.name(`ref_${this.mode}`);
      functions.set(target, name);
      const params = { check: 'x', first: 'x, p', all: 'x, p, out' }[this.mode];
      const end = {
        check: 'return true;',
        first: 'return undefined;',
        all: 'return out;',
      }[this.mode];
      // The target may be an outer node being generated: its function is generated on its own.
      const { visiting, fail } = this;
      this.visiting = new Set();
      this.fail = 'return false;';
      let body = this.inScope(() => this.generate(target, 'x', this.mode === 'check' ? 'undefined' : 'p'));
      // The variable of the paths of error objects (see emit()).
      if (this.structured && this.mode !== 'check') {
        body = `let q;\n${body}`;
      }
      this.visiting = visiting;
      this.fail = fail;
      this.functions.push(`function ${name}(${params}) {\n${body}${end}\n}\n`);
    }
    return functions.get(target);
  }

  // Like RefType: undefined is checked here, any other value by the target.
  ref(type, v, path) {
    const onUndefined = type.isMandatory
      ? this.emit(messageAt(path, () => `${this.nameOf(path, false)} + " is mandatory"`, 'required'))
      : '';
    const target = type.getTarget();
    const fn = this.refFunction(target);
    let call = `if (!${fn}(${v})) { ${this.fail} }\n`;
    if (this.mode === 'first') {
      const e = this.name('e');
      call = `const ${e} = ${fn}(${v}, ${path});\nif (${e} !== undefined) { return ${e}; }\n`;
    } else if (this.mode === 'all') {
      call = `out = ${fn}(${v}, ${path}, out);\n`;
    }
    // Building messages, a field name that has to be built (a key or an index) is built only for an invalid value,
    // which the boolean function of the target finds first. Valid elements of an array then build no strings.
    if (this.mode !== 'check' && !/^(undefined|p|\[\]|"[^"\\]*")$/.test(path)) {
      const { mode } = this;
      this.mode = 'check';
      const check = this.refFunction(target);
      this.mode = mode;
      call = `if (!${check}(${v})) {\n${call}}\n`;
    }
    return `if (${v} === undefined) { ${onUndefined} } else {\n${call}}\n`;
  }

  // Code validating the value held in variable `v` against `type`, with `path` giving its field name. When `known`
  // names a JSON type, the value is known to be of that type (so neither undefined nor null): presence and that type
  // are not checked again. Types that accept every value give no code.
  generate(type, v, path, known = undefined) {
    if (type.constructor === RefType) {
      return this.ref(type, v, path);
    }
    if (type.constructor === CoerceType) {
      // The value validated, converted for the validation only (it is in no object or array).
      return this.coerceCode(type.spec, v) + this.generate(type.type, v, path, known);
    }
    if (this.visiting.has(type)) {
      return this.custom(type, v, path);
    }
    this.visiting.add(type);
    const isSchema = type.constructor === Schema || type.constructor === ClosedSchema;
    const name = this.nameOf(path, isSchema);
    const body = this.body(type, v, path, name, known);
    this.visiting.delete(type);
    if (body === undefined) {
      return this.custom(type, v, path);
    }
    const checks = this.chain(body.checks, body.rest);
    if (known) {
      return checks;
    }
    const text = (suffix, keyword) => messageAt(path, () => `${name} + ${JSON.stringify(suffix)}`, keyword);
    const onUndefined = type.isMandatory ? this.emit(text(' is mandatory', 'required')) : '';
    const onNull = type.isNullable ? '' : this.emit(text(' cannot be null', 'nullable'));
    if (!onUndefined && !onNull) {
      return checks ? `if (${v} !== undefined && ${v} !== null) {\n${checks}}\n` : '';
    }
    return `if (${v} === undefined) { ${onUndefined} } else if (${v} === null) { ${onNull} } else {\n${checks}}\n`;
  }

  custom(type, v, path) {
    const node = this.node(type);
    const invalid = checksThroughValidate(type)
      ? `${this.constant(hasErrors)}(${node}.validate(${v}))`
      : `!${node}.isValid(${v})`;
    let onInvalid = this.fail;
    if (this.mode === 'first') {
      onInvalid = `return r(${node}, ${v}, ${path});`;
    } else if (this.mode === 'all') {
      onInvalid = `out = a(out, ${node}, ${v}, ${path});`;
    }
    return `if (${invalid}) { ${onInvalid} }\n`;
  }

  // Checks for a value that is neither undefined nor null, as { checks, rest }; undefined when the type is not a
  // built-in one.
  body(type, v, path, name, known) {
    // A message about this value: its text is its name and `suffix`; `keyword` names the check and `params` is the code
    // of an object with its details (see messageAt()).
    const text = (suffix, keyword, params) =>
      messageAt(path, () => `${name} + ${JSON.stringify(suffix)}`, keyword, params);
    switch (type.constructor) {
      case Schema:
      case ClosedSchema:
        return this.schema(type, v, path, name, text, known);
      case ObjType:
        return {
          checks: [
            [
              `typeof ${v} !== 'object' || Array.isArray(${v})`,
              text(' must be an object', 'type', "{ type: 'object' }"),
            ],
          ],
          rest: type.schema ? this.generate(type.schema, v, path) : '',
        };
      case ArrayOfType:
        return this.arrayOf(type, v, path, name, text, known);
      case UnevaluatedType:
        return this.unevaluated(type, v, path, name);
      case AllOfType:
        return { checks: [], rest: this.allOf(type, v, path, known) };
      case ConditionalType: {
        // Without branches it accepts every value (it is kept for what "if" evaluates, see unevaluated.js).
        if (!type.thenType && !type.elseType) {
          return { checks: [], rest: '' };
        }
        // Only the chosen branch is checked and reported, like ConditionalType.validate().
        const branch = (branchType) => (branchType ? this.generate(branchType, v, path) : '');
        const ok = this.name('ok');
        const rest = `let ${ok} = false;\n${this.inlineCheck(type.ifType, v, `${ok} = true;`)}if (${ok}) {\n${branch(
          type.thenType
        )}} else {\n${branch(type.elseType)}}\n`;
        return { checks: [], rest };
      }
      case AnyOfType:
        return { checks: [], rest: this.anyOf(type, v, path) };
      case OneOfType:
        return this.oneOf(type, v, path, text);
      case KeywordType:
        return { checks: [this.keyword(type, v, path, name)] };
      case NotType: {
        const ok = this.name('ok');
        const pre = `let ${ok} = false;\n${this.inlineCheck(type.type, v, `${ok} = true;`)}`;
        return {
          checks: [[ok, text(' must not match the excluded schema', 'not'), pre]],
        };
      }
      case StringType:
        return { checks: this.string(type, v, text, known) };
      case EnumType:
        return {
          checks: [
            ...this.string(type, v, text, known),
            [
              `!${this.constant(new Set(type.options))}.has(${v})`,
              text(
                ` must be one of: ${type.options.join(', ')}`,
                'enum',
                `{ allowedValues: ${JSON.stringify(type.options)} }`
              ),
            ],
          ],
        };
      case FloatType:
        return { checks: this.float(type, v, text) };
      case IntegerType:
        return {
          checks: [
            ...this.float(type, v, text),
            [`!Number.isInteger(${v})`, text(' must be an integer', 'type', "{ type: 'integer' }")],
          ],
        };
      case BooleanType:
        return {
          checks: [[`typeof ${v} !== 'boolean'`, text(' must be a boolean', 'type', "{ type: 'boolean' }")]],
        };
      case AnyType:
        return { checks: [] };
      case NeverType:
        return { checks: [['true', text(' is not allowed', 'false')]] };
      case ValuesType:
        return {
          checks: [
            [this.notOneOf(type.values, v), text(valuesMessage(type.values), ...this.valuesKeyword(type.values))],
          ],
        };
      case WhenType:
        // The field name goes through unchanged, like WhenType.validate(). A value known to be of its JSON type
        // needs no check.
        if (known === type.jsonType) {
          return { checks: [], rest: this.generate(type.type, v, path, known) };
        }
        return {
          checks: [],
          rest: `if (${JSON_TYPE_CHECKS[type.jsonType](v)}) {\n${this.generate(type.type, v, path, type.jsonType)}}\n`,
        };
      default:
        return undefined;
    }
  }

  string(type, v, text, known) {
    const checks =
      known === 'string' ? [] : [[`typeof ${v} !== 'string'`, text(' must be a string', 'type', "{ type: 'string' }")]];
    // Code points are only counted near the limit, like hasFewerCodePoints() and hasMoreCodePoints().
    const count = () => `${this.constant(codePointLength)}(${v})`;
    if (type.min !== undefined) {
      const allowEmpty = type.allowEmpty ?? !type.isMandatory;
      const min = this.number(type.min);
      const tooShort = type.countCodePoints
        ? `(${v}.length < ${min} || (${v}.length < 2 * ${min} && ${count()} < ${min}))`
        : `${v}.length < ${min}`;
      checks.push([
        allowEmpty ? `${tooShort} && ${v}.length !== 0` : tooShort,
        text(` must be at least ${type.min} characters long`, 'minLength', `{ limit: ${this.number(type.min)} }`),
      ]);
    }
    if (type.max !== undefined) {
      const max = this.number(type.max);
      const tooLong = type.countCodePoints
        ? `(${v}.length > 2 * ${max} || (${v}.length > ${max} && ${count()} > ${max}))`
        : `${v}.length > ${max}`;
      checks.push([
        tooLong,
        text(` must be at most ${type.max} characters long`, 'maxLength', `{ limit: ${this.number(type.max)} }`),
      ]);
    }
    if (type.pattern) {
      checks.push([
        `!${this.constant(type.pattern)}.test(${v})`,
        text(' does not match the required pattern', 'pattern', `{ pattern: ${JSON.stringify(type.pattern.source)} }`),
      ]);
    }
    if (type.formatCheck !== undefined) {
      const check = this.constant(type.formatCheck);
      const matches = type.formatCheck instanceof RegExp ? `${check}.test(${v})` : `${check}(${v})`;
      checks.push([
        `!${matches}`,
        text(` must be a valid ${type.format}`, 'format', `{ format: ${JSON.stringify(type.format)} }`),
      ]);
    }
    // Limits of the format, like StringType.failedLimit(): compare() gives a number, or undefined, which passes. The
    // built-in comparisons are written out, with the limit worked out once (see compareDate() and the others in
    // formats.js): dates compare as strings (the value has the format, so it is not empty), times and date-times by
    // their time in ms, read once for every limit; a time of 0 or NaN compares as undefined.
    let ms;
    type.formatLimits.forEach(({ keyword, limit, compare }) => {
      const { text: words, comparison } = FORMAT_LIMITS[keyword];
      const literal = JSON.stringify(limit);
      const message = text(` must be ${words} ${limit}`, keyword, `{ comparison: "${comparison}", limit: ${literal} }`);
      const operator = FORMAT_LIMIT_FAILS[keyword].slice(0, -2);
      if (compare === FORMAT_COMPARES.date) {
        checks.push([`${v} ${operator} ${literal}`, message]);
      } else if (TIME_PREFIXES.has(compare)) {
        const prefix = TIME_PREFIXES.get(compare);
        const limitMs = new Date(`${prefix}${limit}`).valueOf();
        // A limit whose time is 0 compares as undefined: it never fails.
        if (limitMs) {
          let pre;
          if (!ms) {
            ms = this.name('ms');
            pre = `const ${ms} = new Date(${prefix ? `"${prefix}" + ` : ''}${v}).valueOf();\n`;
          }
          checks.push([`${ms} && ${ms} ${operator} ${limitMs}`, message, pre]);
        }
      } else {
        checks.push([`${this.constant(compare)}(${v}, ${literal}) ${FORMAT_LIMIT_FAILS[keyword]}`, message]);
      }
    });
    return checks;
  }

  float(type, v, text) {
    const limits = [
      [type.min, '<', 'must be at least', 'minimum'],
      [type.max, '>', 'must be at most', 'maximum'],
      [type.exclusiveMin, '<=', 'must be greater than', 'exclusiveMinimum'],
      [type.exclusiveMax, '>=', 'must be less than', 'exclusiveMaximum'],
    ];
    const checks = [
      [`!Number.isFinite(${v})`, text(' must be a number', 'type', "{ type: 'number' }")],
      ...limits
        .filter(([limit]) => limit !== undefined)
        .map(([limit, operator, message, keyword]) => [
          `${v} ${operator} ${this.number(limit)}`,
          text(` ${message} ${limit}`, keyword, `{ limit: ${this.number(limit)} }`),
        ]),
    ];
    if (type.multipleOf !== undefined) {
      const division = `${v} / ${this.number(type.multipleOf)}`;
      // Like FloatType.isMultiple().
      const notMultiple =
        type.multipleOfPrecision === undefined
          ? `!Number.isInteger(${division})`
          : `Math.abs(Math.round(${division}) - ${division}) > 1e-${type.multipleOfPrecision}`;
      checks.push([
        notMultiple,
        text(
          ` must be a multiple of ${type.multipleOf}`,
          'multipleOf',
          `{ multipleOf: ${this.number(type.multipleOf)} }`
        ),
      ]);
    }
    return checks;
  }

  // Like ValuesType: `v` (neither undefined nor null) is deep-equal to none of the values. Plain values are compared
  // with code written for them; others with deepEqual(), only for objects as it is false for anything else.
  // Keyword and params of the message of a ValuesType: const for one value, enum for several.
  valuesKeyword(values) {
    if (values.length === 1) {
      return ['const', this.structured ? `{ allowedValue: ${this.constant(values[0])} }` : '{}'];
    }
    return ['enum', this.structured ? `{ allowedValues: ${this.constant(values)} }` : '{}'];
  }

  notOneOf(values, v) {
    const matches = [];
    values.forEach((value) => {
      if (value === undefined || value === null) {
        // Never equal to a value that is neither undefined nor null.
      } else if (isPlainValue(value)) {
        matches.push(equalsCode(value, v));
      } else if (typeof value === 'object') {
        matches.push(`(typeof ${v} === 'object' && ${this.constant(deepEqual)}(${this.constant(value)}, ${v}))`);
      } else {
        matches.push(`${v} === ${this.constant(value)}`);
      }
    });
    return matches.length ? `!(${matches.join(' || ')})` : 'true';
  }

  // The parts run in order; in 'all' mode each one adds its errors, like AllOfType.validate(). They get the field
  // name of the allOf as it is (`path`), so a Schema part names its keys as it does on its own.
  allOf(type, v, path, known = undefined) {
    this.mayRepeat = this.mayRepeat || type.types.length > 1;
    const shared = this.shareMatches(type, v);
    let code = shared.map(({ vars }) => `let ${vars.join(' = false, ')} = false;\n`).join('');
    // Whether the value is a plain object is worked out once for all the parts (see schema()): reading __proto__ is
    // slow on objects of many shapes. The value is neither undefined nor null here.
    const plain = `${this.scope}:${v}`;
    const declares = !this.plainDeclared.has(plain);
    this.plainDeclared.add(plain);
    const parts = type.types.map((item) => this.generate(item, v, path, known)).join('');
    if (declares) {
      this.plainDeclared.delete(plain);
      if (new RegExp(`\\b${v}plain\\b`).test(parts)) {
        code += `const ${v}plain = ${v}.__proto__ === OP;\n`;
      }
    }
    code += parts;
    shared.forEach(({ oneOf, previous }) => {
      if (previous === undefined) {
        this.sharedMatches.delete(oneOf);
      } else {
        this.sharedMatches.set(oneOf, previous);
      }
    });
    return code;
  }

  // The oneOf parts of an allOf whose matching alternatives an "unevaluated*" part of the same allOf needs: oneOf()
  // records them in variables that the allOf declares, and evaluatedCondition() reads them instead of checking the
  // alternatives again. They belong to the value in `v` and to the function being written.
  shareMatches(type, v) {
    const oneOfs = new Set();
    type.types
      .filter((item) => item.constructor === UnevaluatedType)
      .forEach((unevaluated) =>
        unevaluated.siblings
          .filter((sibling) => sibling.constructor === OneOfType && type.types.includes(sibling))
          .filter((sibling) => staticEvaluatedBy(unevaluated.kind, sibling) === undefined)
          .forEach((sibling) => oneOfs.add(sibling))
      );
    return [...oneOfs].map((oneOf) => {
      const previous = this.sharedMatches.get(oneOf);
      const vars = oneOf.types.map(() => this.name('matched'));
      this.sharedMatches.set(oneOf, {
        vars,
        v,
        scope: this.scope,
        written: false,
      });
      return { oneOf, previous, vars };
    });
  }

  // The variables holding which alternatives of `oneOf` match the value in `v`, when oneOf() wrote them in the
  // function being written; undefined otherwise.
  matchesOf(oneOf, v) {
    const shared = this.sharedMatches.get(oneOf);
    return shared && shared.written && shared.v === v && shared.scope === this.scope ? shared.vars : undefined;
  }

  // Code for a value that no alternative accepts: the errors of every alternative, like AnyOfType.validate().
  noneMatches(types, v, path) {
    if (this.mode === 'check') {
      return this.fail;
    }
    if (this.mode === 'first') {
      return this.generate(types[0], v, path);
    }
    this.mayRepeat = this.mayRepeat || types.length > 1;
    return types.map((item) => this.generate(item, v, path)).join('');
  }

  // The alternatives get the field name as it is, like the parts of an allOf.
  anyOf(type, v, path) {
    if (!type.types || type.types.length === 0) {
      return '';
    }
    const ok = this.name('ok');
    let code = `let ${ok} = false;\n`;
    type.types.forEach((item, i) => {
      const check = this.inlineCheck(item, v, `${ok} = true;`);
      code += i ? `if (!${ok}) {\n${check}}\n` : check;
    });
    return `${code}if (!${ok}) {\n${this.noneMatches(type.types, v, path)}}\n`;
  }

  // Counts up to two matching alternatives, like OneOfType.countMatches().
  oneOf(type, v, path, text) {
    if (type.types.length === 0) {
      return {
        checks: [['true', text(' must match exactly one schema, but matches none', 'oneOf', '{ passing: 0 }')]],
      };
    }
    // An "unevaluated*" of the same allOf may reuse which alternatives match (see shareMatches()). When the oneOf
    // passes, every alternative has been checked.
    const shared = this.sharedMatches.get(type);
    const record = shared && shared.v === v && shared.scope === this.scope ? shared : undefined;
    // With a discriminator, objects are only checked against the alternative their tag picks. Other values are
    // checked here when the matches are recorded, else in a function of their own.
    if (type.discriminator) {
      const others = record ? this.countedOneOf(type, v, path, text, record) : undefined;
      return { checks: [], rest: this.discriminated(type, v, path, record, others) };
    }
    return { checks: [], rest: this.countedOneOf(type, v, path, text, record) };
  }

  // Code counting the alternatives the value matches, up to two, recording them in `record` when given.
  countedOneOf(type, v, path, text, record) {
    const m = this.name('m');
    let rest = `let ${m} = 0;\n`;
    type.types.forEach((item, i) => {
      const onPass = record ? `${m} += 1; ${record.vars[i]} = true;` : `${m} += 1;`;
      const check = this.inlineCheck(item, v, onPass);
      rest += i > 1 ? `if (${m} < 2) {\n${check}}\n` : check;
    });
    if (record) {
      record.written = true;
    }
    const more = this.emit(
      text(' must match exactly one schema, but matches more than one', 'oneOf', '{ passing: 2 }')
    );
    if (this.mode === 'check') {
      rest += `if (${m} !== 1) { ${this.fail} }\n`;
    } else {
      rest += `if (${m} === 0) {\n${this.noneMatches(type.types, v, path)}} else if (${m} > 1) { ${more} }\n`;
    }
    return rest;
  }

  // Code calling the function that validates `type` in the current mode (see refFunction()), for the value in `v`.
  callFunction(type, v, path) {
    const fn = this.refFunction(type);
    if (this.mode === 'first') {
      const e = this.name('e');
      return `const ${e} = ${fn}(${v}, ${path});\nif (${e} !== undefined) { return ${e}; }\n`;
    }
    return this.mode === 'all' ? `out = ${fn}(${v}, ${path}, out);\n` : `if (!${fn}(${v})) { ${this.fail} }\n`;
  }

  // Code setting variable `d` to what the discriminator of `type` picks for the value in `x`, like OneOfType.pick().
  pickCode(type, x, d) {
    const { tag, mapping, auto } = type.discriminator;
    const t = this.name('t');
    const literal = JSON.stringify(tag);
    const values = [...mapping.keys()];
    const chain = values.map((value) => `${t} === ${JSON.stringify(value)} ? ${mapping.get(value)} : `).join('');
    return (
      `let ${d} = ${EVERY_TYPE};\n` +
      `if (typeof ${x} === 'object' && ${x} !== null && !Array.isArray(${x})) {\n` +
      `const ${t} = H.call(${x}, ${literal}) ? ${x}[${literal}] : undefined;\n` +
      `${d} = ${chain}${auto ? EVERY_TYPE : NO_TYPE};\n}\n`
    );
  }

  // Like OneOfType.validate() with a discriminator: an object is checked against the alternative the value of its tag
  // (an own property) picks. An object whose tag picks none gets an error about the tag at its path, or with a
  // discriminator found in a plain oneOf (`auto`) is checked as by oneOf, like other values. Those go to a function
  // of their own (they are rare, and the validator stays small).
  // With `record`, the alternative that matches is recorded there, and `others` checks the other values.
  discriminated(type, v, path, record = undefined, others = undefined) {
    const { tag, mapping, auto } = type.discriminator;
    const t = this.name('t');
    const tagPath = this.keyOf(path, JSON.stringify(tag));
    const error = (suffix, kind) =>
      this.emit(
        messageAt(
          tagPath,
          () => `${this.nameOf(tagPath, false)} + ${JSON.stringify(suffix)}`,
          'discriminator',
          `{ error: "${kind}", tag: ${JSON.stringify(tag)}, tagValue: ${t} }`
        )
      );
    const values = [...mapping.keys()];
    const literal = JSON.stringify(tag);
    // The tag is an own property, read like the keys of a Schema (see schema()): a value read from a plain object is
    // its own unless Object.prototype has the key. Whether the object is plain is worked out here, once for the
    // alternatives too, unless an enclosing allOf did.
    const plain = `${this.scope}:${v}`;
    const declares = !this.plainDeclared.has(plain);
    this.plainDeclared.add(plain);
    const isPlainOwn = tag in Object.prototype ? '' : `${v}plain || `;
    let code = declares ? `const ${v}plain = ${v}.__proto__ === OP;\n` : '';
    code += `let ${t} = ${v}[${literal}];\n`;
    code += `if (${t} !== undefined && !(${isPlainOwn}H.call(${v}, ${literal}))) { ${t} = undefined; }\n`;
    type.types.forEach((item, i) => {
      const picks = values
        .filter((value) => mapping.get(value) === i)
        .map((value) => `${t} === ${JSON.stringify(value)}`);
      // The value is known to be an object, which the alternative does not check again.
      let branch = this.generate(item, v, path, 'object');
      if (record) {
        const matched = record.vars[i];
        const onFail = this.mode === 'check' ? this.fail : this.generate(item, v, path, 'object');
        branch = `${this.inlineCheck(item, v, `${matched} = true;`)}if (!${matched}) {\n${onFail}}\n`;
      }
      code += `${i ? 'else ' : ''}if (${picks.join(' || ')}) {\n${branch}}\n`;
    });
    if (declares) {
      this.plainDeclared.delete(plain);
    }
    // The same alternatives without the discriminator, one node for each oneOf, so they share one function.
    if (!this.plainOneOfs.has(type)) {
      this.plainOneOfs.set(type, new OneOfType({ types: type.types, isMandatory: false, isNullable: true }));
    }
    const rest = others || this.callFunction(this.plainOneOfs.get(type), v, path);
    if (auto) {
      // No alternative accepts a tag that picks none (it gives each a "const" or an "enum"), unless it is missing.
      const unknown = this.mode === 'check' ? this.fail : rest;
      code += `else if (${t} === undefined) {\n${rest}} else {\n${unknown}}\n`;
    } else {
      code += `else if (${t} === undefined) { ${error(' is mandatory', 'tag')} }\n`;
      code += `else if (typeof ${t} !== 'string') { ${error(' must be a string', 'tag')} }\n`;
      code += `else { ${error(valuesMessage(values), 'mapping')} }\n`;
    }
    return `if (typeof ${v} === 'object' && !Array.isArray(${v})) {\n${code}} else {\n${rest}}\n`;
  }

  // Code assigning the defaults ([{ key, value, empty }], see assignDefaults()) missing in the object or array in `v`:
  // each validation assigns a new copy.
  defaultsCode(v, defaults = []) {
    return defaults
      .map((entry) => {
        const property = `${v}[${JSON.stringify(entry.key)}]`;
        return `if (${missingCode(property, entry)}) { ${property} = ${this.copyCode(entry.value)}; }\n`;
      })
      .join('');
  }

  // Code converting the value in variable `x` for a schema with `spec` (see coerce() in coerce.js) and, with `place`,
  // writing the converted value there (the property or element it was read from).
  coerceCode(spec, x, place = undefined) {
    if (!spec) {
      return '';
    }
    const matches = (value) => spec.types.map((type) => COERCE_TYPE_TESTS[type](value)).join(' || ');
    const c = this.name('c');
    const t = this.name('t');
    let code = `if (${x} !== undefined && !(${matches(x)})) {\nlet ${c};\n`;
    if (spec.array) {
      code += `if (Array.isArray(${x}) && ${x}.length === 1) {\n${x} = ${x}[0];\nif (${matches(x)}) { ${c} = ${x}; }\n}\n`;
    }
    const conversions = spec.to.flatMap((type) => COERCE_CODE[type](x, t));
    code += `const ${t} = typeof ${x};\nif (${c} === undefined) {\n`;
    code += conversions
      .map(([condition, value], i) => `${i ? 'else ' : ''}if (${condition}) { ${c} = ${value}; }\n`)
      .join('');
    code += `}\nif (${c} !== undefined) { ${x} = ${c};${place ? ` ${place} = ${c};` : ''} }\n}\n`;
    return code;
  }

  // Code of a new copy of a default value.
  copyCode(value) {
    const copy = literalCode(value);
    return copy === undefined ? `${this.constant(copyDefault)}(${this.constant(value)})` : copy;
  }

  // A keyword of your own, like KeywordType.validate(): its function is called with the value, when the value is of
  // one of its JSON types.
  keyword(type, v, path, name) {
    const applies = type.jsonTypes
      ? `(${type.jsonTypes.map((jsonType) => KEYWORD_TYPE_CHECKS[jsonType](v)).join(' || ')}) && `
      : '';
    const text =
      typeof type.message === 'function'
        ? () => `${name} + " " + ${this.constant(type.message)}(${v})`
        : () => `${name} + ${JSON.stringify(` ${type.message}`)}`;
    const passes =
      type.check instanceof RegExp ? `${this.constant(type.check)}.test(${v})` : `${this.constant(type.check)}(${v})`;
    return [`${applies}!${passes}`, messageAt(path, text, type.keyword)];
  }

  arrayOf(type, v, path, name, text, known) {
    const checks =
      known === 'array' ? [] : [[`!Array.isArray(${v})`, text(' must be an array', 'type', "{ type: 'array' }")]];
    if (type.min !== undefined) {
      checks.push([
        `${v}.length < ${this.number(type.min)}`,
        text(` must have at least ${type.min} elements`, 'minItems', `{ limit: ${this.number(type.min)} }`),
      ]);
    }
    if (type.max !== undefined) {
      checks.push([
        `${v}.length > ${this.number(type.max)}`,
        text(` must have at most ${type.max} elements`, 'maxItems', `{ limit: ${this.number(type.max)} }`),
      ]);
    }
    if (type.unique) {
      checks.push([`${this.constant(hasDuplicates)}(${v})`, text(' must not have duplicate elements', 'uniqueItems')]);
    }
    const min = type.minContains === undefined ? 1 : type.minContains;
    if (type.contains && (min !== 1 || type.maxContains !== undefined)) {
      // Counts only as far as the limits need, like ArrayOfType.countMatches().
      const count = this.name('count');
      const i = this.name('i');
      const x = this.name('v');
      const stop = type.maxContains === undefined ? min : type.maxContains + 1;
      const pre = `let ${count} = 0;\nfor (let ${i} = 0; ${i} < ${v}.length && ${count} < ${this.number(
        stop
      )}; ${i} += 1) {\nconst ${x} = ${v}[${i}];\n${this.inlineCheck(type.contains, x, `${count} += 1;`)}}\n`;
      const containsChecks = [];
      if (min > 0) {
        const atLeast = min === 1 ? 'one matching element' : `${min} matching elements`;
        containsChecks.push([
          `${count} < ${this.number(min)}`,
          text(` must contain at least ${atLeast}`, 'minContains', `{ limit: ${this.number(min)} }`),
        ]);
      }
      if (type.maxContains !== undefined) {
        const atMost = type.maxContains === 1 ? 'one matching element' : `${type.maxContains} matching elements`;
        containsChecks.push([
          `${count} > ${this.number(type.maxContains)}`,
          text(` must contain at most ${atMost}`, 'maxContains', `{ limit: ${this.number(type.maxContains)} }`),
        ]);
      }
      if (containsChecks.length > 0) {
        containsChecks[0].push(pre);
        checks.push(...containsChecks);
      }
    } else if (type.contains) {
      // Runs only when the checks before it pass, like ArrayOfType.countMatches().
      const found = this.name('found');
      const i = this.name('i');
      const x = this.name('v');
      const pre = `let ${found} = false;\nfor (let ${i} = 0; ${i} < ${v}.length && !${found}; ${i} += 1) {\nconst ${x} = ${v}[${i}];\n${this.inlineCheck(
        type.contains,
        x,
        `${found} = true;`
      )}}\n`;
      checks.push([`!${found}`, text(' must contain at least one matching element', 'contains'), pre]);
    }
    let rest = '';
    const defaults = this.defaultsCode(v, type.defaults);
    if (defaults) {
      const first = known === 'array' ? 0 : 1;
      if (checks.length > first) {
        const [condition, message, pre = ''] = checks[first];
        checks[first] = [condition, message, defaults + pre];
      } else {
        rest += defaults;
      }
    }
    if (Array.isArray(type.type)) {
      type.type.forEach((item, i) => {
        const x = this.name('v');
        rest += `let ${x} = ${v}[${i}];\n${this.coerceCode(coerceSpecOf(item), x, `${v}[${i}]`)}`;
        rest += this.generate(item, x, this.indexOf(path, name, i));
      });
      if (type.additionalType) {
        const i = this.name('i');
        const x = this.name('v');
        rest += `for (let ${i} = ${type.type.length}; ${i} < ${v}.length; ${i} += 1) {\nlet ${x} = ${v}[${i}];\n`;
        rest += this.coerceCode(coerceSpecOf(type.additionalType), x, `${v}[${i}]`);
        rest += `${this.generate(type.additionalType, x, this.indexOf(path, name, i))}}\n`;
      }
    } else if (type.type) {
      const i = this.name('i');
      const x = this.name('v');
      rest += `for (let ${i} = 0; ${i} < ${v}.length; ${i} += 1) {\nlet ${x} = ${v}[${i}];\n`;
      rest += this.coerceCode(coerceSpecOf(type.type), x, `${v}[${i}]`);
      rest += `${this.generate(type.type, x, this.indexOf(path, name, i))}}\n`;
    }
    return { checks, rest };
  }

  // Name of a function (x, s) that adds to the Set s the keys (kind 'properties') or the indexes ('items') of the
  // value x that `types` evaluate, and returns true when they evaluate all of them, like evaluated() in
  // unevaluated.js. `key` names the function: a type, or an UnevaluatedType for the group of its siblings.
  evaluatedFunction(kind, key, types) {
    const functions = this.evaluatedFunctions[kind];
    if (!functions.has(key)) {
      const name = this.name('evaluated');
      functions.set(key, name);
      const body = this.inScope(() => types.map((item) => this.evaluatedCode(kind, item)).join(''));
      this.functions.push(`function ${name}(x, s) {\n${body}return false;\n}\n`);
    }
    return functions.get(key);
  }

  // Condition on the key in variable `k`: one of the keys or patterns in `known`. Empty when there are none.
  acceptedKey(known, k) {
    const keys = [...known.keys];
    const declared =
      keys.length <= MAX_INLINE_KEYS
        ? keys.map((key) => `${k} === ${JSON.stringify(key)}`)
        : [`${this.constant(known.keys)}.has(${k})`];
    const terms = [...declared, ...known.patterns.map((pattern) => `${this.constant(pattern)}.test(${k})`)];
    // In parentheses, so it can be combined with && in a larger condition.
    return terms.length > 1 ? `(${terms.join(' || ')})` : terms.join('');
  }

  // Statements of an evaluated function (value in x, Set in s) for a part that evaluates the same for every value.
  staticEvaluatedCode(kind, known) {
    if (known.all) {
      return 'return true;\n';
    }
    if (kind === 'items') {
      const i = this.name('i');
      return known.prefix > 0
        ? `for (let ${i} = 0; ${i} < ${known.prefix} && ${i} < x.length; ${i} += 1) { s.add(${i}); }\n`
        : '';
    }
    const k = this.name('k');
    const accepted = this.acceptedKey(known, k);
    return accepted ? `for (const ${k} in x) {\nif (H.call(x, ${k}) && (${accepted})) { s.add(${k}); }\n}\n` : '';
  }

  // Statements of an evaluated function (value in x, Set in s) for what `type` evaluates.
  evaluatedCode(kind, type) {
    const known = staticEvaluatedBy(kind, type);
    if (known !== undefined) {
      return this.staticEvaluatedCode(kind, known);
    }
    const check = (item) => this.checkFunction(item);
    const code = (item) => this.evaluatedCode(kind, item);
    const onMatch = (item) => `if (${check(item)}(x)) {\n${code(item)}}\n`;
    switch (type.constructor) {
      case Schema:
      case ClosedSchema: {
        // Only its "dependentSchemas" depend on the value.
        const declared = {
          all: false,
          keys: new Set(type.propertyKeys || type.keys),
          patterns: type.patternTypes.map(({ pattern }) => pattern),
          prefix: 0,
        };
        let result = this.staticEvaluatedCode(kind, declared);
        type.dependencies
          .filter((dependency) => dependency.type)
          .forEach((dependency) => {
            result += `if (H.call(x, ${JSON.stringify(dependency.key)})) {\n${onMatch(dependency.type)}}\n`;
          });
        return result;
      }
      case ArrayOfType: {
        // Only its "contains" depends on the value.
        const prefix = Array.isArray(type.type) ? type.type.length : 0;
        const i = this.name('i');
        const tuple = this.staticEvaluatedCode(kind, {
          all: false,
          keys: new Set(),
          patterns: [],
          prefix,
        });
        const contains = `if (${check(type.contains)}(x[${i}])) { s.add(${i}); }\n`;
        return `${tuple}for (let ${i} = 0; ${i} < x.length; ${i} += 1) {\n${contains}}\n`;
      }
      case AllOfType:
        return type.types.map(code).join('');
      case AnyOfType:
        return type.types.map(onMatch).join('');
      case OneOfType: {
        // What the one alternative that matches evaluates, when exactly one does. With a discriminator, only the one
        // it picks can match.
        const oks = type.types.map(() => this.name('ok'));
        const d = this.name('d');
        const pick = type.discriminator ? this.pickCode(type, 'x', d) : '';
        const picks = (i) => (type.discriminator ? `(${d} === ${EVERY_TYPE} || ${d} === ${i}) && ` : '');
        const matches =
          pick + type.types.map((item, i) => `const ${oks[i]} = ${picks(i)}${check(item)}(x);\n`).join('');
        const chosen = type.types.map((item, i) => `if (${oks[i]}) {\n${code(item)}}\n`).join('');
        return `${matches}if (${oks.join(' + ')} === 1) {\n${chosen}}\n`;
      }
      case ConditionalType: {
        // What "if" evaluates counts when the value satisfies it, with the branch taken.
        const branch = (item) => (item ? onMatch(item) : '');
        const ifTrue = `${code(type.ifType)}${branch(type.thenType)}`;
        return `if (${check(type.ifType)}(x)) {\n${ifTrue}} else {\n${branch(type.elseType)}}\n`;
      }
      case RefType: {
        const target = type.getTarget();
        return `if (${this.evaluatedFunction(kind, target, [target])}(x, s)) { return true; }\n`;
      }
      case WhenType:
        return type.jsonType === JSON_TYPES[kind] ? code(type.type) : '';
      case UnevaluatedType: {
        // Evaluates everything the other keywords leave, when those elements satisfy it.
        const siblings = type.siblings.map(code).join('');
        return type.kind === kind ? `if (${check(type)}(x)) { return true; }\n${siblings}` : siblings;
      }
      default:
        return '';
    }
  }

  // Condition that is true when `type` evaluates the key (kind 'properties') or index ('items') in variable `k` of the
  // value in `v`, like evaluated() in unevaluated.js. It adds to `prelude` the statements that compute, once, which
  // subschemas the value satisfies. Undefined when a reference leads to a part that depends on the value, which may
  // be recursive: an evaluated function handles that case.
  evaluatedCondition(kind, type, v, k, prelude) {
    const known = staticEvaluatedBy(kind, type);
    if (known !== undefined) {
      if (known.all) {
        return 'true';
      }
      if (kind === 'items') {
        return known.prefix > 0 ? `${k} < ${known.prefix}` : 'false';
      }
      return this.acceptedKey(known, k) || 'false';
    }
    const matches = (item) => {
      const ok = this.name('ok');
      prelude.push(`const ${ok} = ${this.checkFunction(item)}(${v});\n`);
      return ok;
    };
    const condition = (item) => this.evaluatedCondition(kind, item, v, k, prelude);
    const any = (parts) => (parts.some((part) => part === undefined) ? undefined : `(${parts.join(' || ')})`);
    switch (type.constructor) {
      case Schema:
      case ClosedSchema: {
        // Only its "dependentSchemas" depend on the value.
        const declared = {
          keys: new Set(type.propertyKeys || type.keys),
          patterns: type.patternTypes.map(({ pattern }) => pattern),
        };
        const parts = [this.acceptedKey(declared, k) || 'false'];
        type.dependencies
          .filter((dependency) => dependency.type)
          .forEach((dependency) => {
            const ok = this.name('ok');
            const literal = JSON.stringify(dependency.key);
            prelude.push(`const ${ok} = H.call(${v}, ${literal}) && ${this.checkFunction(dependency.type)}(${v});\n`);
            const inner = condition(dependency.type);
            parts.push(inner === undefined ? undefined : `(${ok} && ${inner})`);
          });
        return any(parts);
      }
      case ArrayOfType: {
        // Only its "contains" depends on the value.
        const prefix = Array.isArray(type.type) ? type.type.length : 0;
        const contains = `${this.checkFunction(type.contains)}(${v}[${k}])`;
        return prefix > 0 ? `(${k} < ${prefix} || ${contains})` : contains;
      }
      case AllOfType:
        return any(type.types.map(condition));
      case AnyOfType:
        return any(
          type.types.map((item) => {
            const inner = condition(item);
            return inner === undefined ? undefined : `(${matches(item)} && ${inner})`;
          })
        );
      case OneOfType: {
        // What the one alternative that matches evaluates, when exactly one does. The oneOf may have recorded which
        // match already.
        let oks = this.matchesOf(type, v);
        if (!oks && type.discriminator) {
          // Only the alternative the discriminator picks can match.
          const d = this.name('d');
          prelude.push(this.pickCode(type, v, d));
          oks = type.types.map((item, i) => {
            const ok = this.name('ok');
            prelude.push(
              `const ${ok} = (${d} === ${EVERY_TYPE} || ${d} === ${i}) && ${this.checkFunction(item)}(${v});\n`
            );
            return ok;
          });
        }
        oks = oks || type.types.map(matches);
        const one = this.name('one');
        prelude.push(`const ${one} = ${oks.join(' + ')} === 1;\n`);
        const chosen = any(
          type.types.map((item, i) => {
            const inner = condition(item);
            return inner === undefined ? undefined : `(${oks[i]} && ${inner})`;
          })
        );
        return chosen === undefined ? undefined : `(${one} && ${chosen})`;
      }
      case ConditionalType: {
        // What "if" evaluates counts when the value satisfies it, with the branch taken.
        const okIf = matches(type.ifType);
        const parts = [];
        const ifPart = condition(type.ifType);
        parts.push(ifPart === undefined ? undefined : `(${okIf} && ${ifPart})`);
        [
          [type.thenType, okIf],
          [type.elseType, `!${okIf}`],
        ].forEach(([branch, taken]) => {
          if (branch) {
            const ok = this.name('ok');
            prelude.push(`const ${ok} = ${taken} && ${this.checkFunction(branch)}(${v});\n`);
            const inner = condition(branch);
            parts.push(inner === undefined ? undefined : `(${ok} && ${inner})`);
          }
        });
        return any(parts);
      }
      case WhenType:
        return type.jsonType === JSON_TYPES[kind] ? condition(type.type) : 'false';
      case UnevaluatedType: {
        // Evaluates everything the other keywords leave, when those elements satisfy it.
        const siblings = any(type.siblings.map(condition));
        if (type.kind !== kind || siblings === undefined) {
          return siblings;
        }
        return `(${matches(type)} || ${siblings})`;
      }
      case RefType:
        // Its target depends on the value (a fixed one is handled above), and may lead back here.
        return undefined;
      default:
        return 'false';
    }
  }

  // "unevaluatedProperties"/"unevaluatedItems": a loop over the keys or elements the other keywords leave. The loop
  // skips directly what the keywords that evaluate the same for every value evaluate, like "additionalProperties",
  // and what the others evaluate for the value through a condition on the subschemas it satisfies (or, when a
  // reference makes that impossible, through a Set that a generated function fills first).
  unevaluated(type, v, path, name) {
    const isFixed = (item) => staticEvaluatedBy(type.kind, item) !== undefined;
    const known = staticEvaluatedByAll(type.kind, type.siblings.filter(isFixed));
    const varying = type.siblings.filter((item) => !isFixed(item));
    if (known.all) {
      return { checks: [], rest: '' };
    }
    // Key (or index) variable of the loop, and the condition for what the varying siblings evaluate.
    const k = this.name(type.kind === 'items' ? 'i' : 'k');
    const prelude = [];
    const conditions = varying.map((item) => this.evaluatedCondition(type.kind, item, v, k, prelude));
    let evaluated = conditions.includes(undefined) ? undefined : conditions.join(' || ');
    let collect = prelude.join('');
    let close = '';
    if (evaluated === undefined) {
      const done = this.name('done');
      collect = `const ${done} = new Set();\nif (!${this.evaluatedFunction(type.kind, type, varying)}(${v}, ${done})) {\n`;
      close = '}\n';
      evaluated = `${done}.has(${k})`;
    }
    const x = this.name('v');
    if (type.kind === 'items') {
      const code = this.generate(type.type, x, this.indexOf(path, name, k));
      if (!code) {
        return { checks: [], rest: '' };
      }
      const skip = evaluated ? `if (${evaluated}) { continue; }\n` : '';
      let rest = `if (Array.isArray(${v})) {\n${collect}for (let ${k} = ${known.prefix}; ${k} < ${v}.length; ${k} += 1) {\n`;
      rest += `${skip}const ${x} = ${v}[${k}];\n${code}}\n${close}}\n`;
      return { checks: [], rest };
    }
    const keyName = this.keyOf(path, k);
    let code;
    if (type.type.constructor === NeverType) {
      const unexpected = () => `"Unexpected key: " + ${this.nameOf(keyName, false)}`;
      code = this.emit(messageAt(keyName, unexpected, 'unevaluatedProperties', `{ property: ${k} }`));
    } else {
      const inner = this.generate(type.type, x, keyName);
      // A schema that accepts every value gives no code.
      if (!inner) {
        return { checks: [], rest: '' };
      }
      code = `const ${x} = ${v}[${k}];\n${inner}`;
    }
    const accepted = [this.acceptedKey(known, k), evaluated].filter(Boolean).join(' || ');
    const skip = accepted ? ` || ${accepted}` : '';
    let rest = `if (typeof ${v} === 'object' && !Array.isArray(${v})) {\n${collect}for (const ${k} in ${v}) {\n`;
    rest += `if (!H.call(${v}, ${k})${skip}) { continue; }\n${code}}\n${close}}\n`;
    return { checks: [], rest };
  }

  // Same order as Schema.errors(): declared keys, then extra keys, then property counts.
  schema(type, v, path, name, text, known) {
    let keysCode = '';
    // A key read to check it gets its default as it is read; the others get it first (see defaultsCode()).
    const defaultOf = new Map((type.defaults || []).map((entry) => [entry.key, entry]));
    type.keys.forEach((key) => {
      const x = this.name('v');
      const literal = JSON.stringify(key);
      const code = this.generate(type.schema[key], x, this.keyOf(path, literal));
      // A key whose type accepts anything is not read.
      if (code) {
        // Own properties only, like Schema's ownValue(). A value read from a plain object is its own unless
        // Object.prototype has the key, so the slower own-property check only runs in that case or for other
        // prototypes. The prototype is read with __proto__, as there: Object.getPrototypeOf() halves the speed.
        keysCode += `let ${x} = ${v}[${literal}];\n`;
        const isOwn = `(!${v}plain || ${literal} in OP) && !H.call(${v}, ${literal})`;
        const entry = defaultOf.get(key);
        if (entry) {
          defaultOf.delete(key);
          const copy = `${x} = ${v}[${literal}] = ${this.copyCode(entry.value)};`;
          keysCode += `if (${missingCode(x, entry)}) { ${copy} } else if (${isOwn}) { ${x} = undefined; }\n`;
        } else {
          keysCode += `if (${x} !== undefined && ${isOwn}) { ${x} = undefined; }\n`;
        }
        // With coerceTypes, the value is converted to the types of its schema and written back.
        keysCode += this.coerceCode(coerceSpecOf(type.schema[key]), x, `${v}[${literal}]`);
        keysCode += code;
      } else if (defaultOf.has(key)) {
        // Not read, but its default is assigned in the order of the keys, as ajv does.
        keysCode += this.defaultsCode(v, [defaultOf.get(key)]);
        defaultOf.delete(key);
      }
    });
    // An enclosing allOf of the same function may have worked it out already.
    const isDeclared = this.plainDeclared.has(`${this.scope}:${v}`);
    let rest = keysCode && !isDeclared ? `const ${v}plain = ${v}.__proto__ === OP;\n${keysCode}` : keysCode;
    // The defaults of the keys not read are assigned first, like Schema.isValid() does with all of them.
    rest = this.defaultsCode(v, [...defaultOf.values()]) + rest;
    const checkExtra = !type.isOpen || type.additionalType || type.removeAdditional;
    const countKeys = type.minProperties !== undefined || type.maxProperties !== undefined;
    const { patternTypes } = type;
    if (checkExtra || countKeys || patternTypes.length > 0 || type.propertyNameType) {
      const count = this.name('count');
      const k = this.name('k');
      const keyName = this.keyOf(path, k);
      rest += `let ${count} = 0;\nfor (const ${k} in ${v}) {\n`;
      rest += `if (!H.call(${v}, ${k})) { continue; }\n${count} += 1;\n`;
      if (type.propertyNameType) {
        rest += this.generate(type.propertyNameType, k, this.propertyNameOf(path, k));
      }
      // Keys matching a pattern satisfy its type and are not extra keys, like Schema.errors().
      const matched = this.name('matched');
      this.mayRepeat = this.mayRepeat || patternTypes.length > 1;
      if (patternTypes.length > 0) {
        rest += `let ${matched} = false;\n`;
        patternTypes.forEach(({ pattern, type: patternType }) => {
          const x = this.name('v');
          rest += `if (${this.constant(pattern)}.test(${k})) {\n${matched} = true;\nlet ${x} = ${v}[${k}];\n`;
          rest += this.coerceCode(coerceSpecOf(patternType), x, `${v}[${k}]`);
          rest += `${this.generate(patternType, x, keyName)}}\n`;
        });
      }
      if (checkExtra) {
        // With removeAdditional, a key only "required" names is additional (see Schema.isDeclared()).
        const keys = type.removeAdditional && type.propertyKeys ? type.propertyKeys : type.keys;
        const declared =
          keys.length <= MAX_INLINE_KEYS
            ? keys.map((key) => `${k} === ${JSON.stringify(key)}`).join(' || ') || 'false'
            : `${this.constant(new Set(keys))}.has(${k})`;
        const accepted = patternTypes.length > 0 ? `${declared} || ${matched}` : declared;
        rest += `if (!(${accepted})) {\n`;
        // removeAdditional: the key is deleted (see Schema.removes()). It still counts for minProperties and
        // maxProperties, as in ajv.
        const remove = `delete ${v}[${k}];\n`;
        if (type.removeAdditional === 'delete') {
          rest += remove;
        } else if (type.removeAdditional === 'failing') {
          rest += `if (!${this.checkFunction(type.additionalType)}(${v}[${k}])) {\n${remove}}\n`;
        } else if (!type.isOpen) {
          const unexpected = () => `"Unexpected key: " + ${this.nameOf(keyName, false)}`;
          rest += this.emit(messageAt(keyName, unexpected, 'additionalProperties', `{ property: ${k} }`));
        } else {
          const x = this.name('v');
          rest += `let ${x} = ${v}[${k}];\n${this.coerceCode(coerceSpecOf(type.additionalType), x, `${v}[${k}]`)}`;
          rest += this.generate(type.additionalType, x, keyName);
        }
        rest += '}\n';
      }
      rest += '}\n';
      if (type.minProperties !== undefined) {
        const message = text(
          ` must have at least ${type.minProperties} properties`,
          'minProperties',
          `{ limit: ${this.number(type.minProperties)} }`
        );
        rest += `if (${count} < ${this.number(type.minProperties)}) { ${this.emit(message)} }\n`;
      }
      if (type.maxProperties !== undefined) {
        const message = text(
          ` must have at most ${type.maxProperties} properties`,
          'maxProperties',
          `{ limit: ${this.number(type.maxProperties)} }`
        );
        rest += `if (${count} > ${this.number(type.maxProperties)}) { ${this.emit(message)} }\n`;
      }
    }
    rest += this.dependencies(type, v, path);
    return {
      checks:
        known === 'object'
          ? []
          : [
              [
                `typeof ${v} !== 'object' || Array.isArray(${v})`,
                text(' must be an object', 'type', "{ type: 'object' }"),
              ],
            ],
      rest,
    };
  }

  // Like Schema.errors(): a key is present when it is an own property that is not undefined.
  dependencies(type, v, path) {
    const isPresent = (literal) => `(H.call(${v}, ${literal}) && ${v}[${literal}] !== undefined)`;
    return type.dependencies
      .map(({ key, required, type: dependentType }) => {
        const literal = JSON.stringify(key);
        let code;
        if (required) {
          code = required
            .map((property) => {
              const propertyLiteral = JSON.stringify(property);
              // About the property that is missing.
              const missing = this.keyOf(path, propertyLiteral);
              const present = this.nameOf(this.keyOf(path, literal), false);
              const text = () => `${this.nameOf(missing, false)} + " is mandatory when " + ${present} + " is present"`;
              const params = `{ property: ${literal}, missingProperty: ${propertyLiteral} }`;
              const message = messageAt(missing, text, 'dependentRequired', params);
              return `if (!${isPresent(propertyLiteral)}) { ${this.emit(message)} }\n`;
            })
            .join('');
        } else {
          code = this.generate(dependentType, v, path);
        }
        return `if (${isPresent(literal)}) {\n${code}}\n`;
      })
      .join('');
  }

  // Source of the body of a function that takes the constants (c), the nodes (n) and the helpers r and a, and returns
  // the validation function. standalone.js writes it out with the constants as code.
  source(type) {
    const main = this.generate(type, 'v0', this.rootPath());
    // Every error once, like toErrors(): parts of an allOf, or alternatives, can report the same one.
    const results = {
      check: ['', 'true'],
      first: ['', 'undefined'],
      all: [
        'let out;\n',
        this.mayRepeat ? '(out === undefined ? [] : out.length > 1 ? U(out) : out)' : '(out === undefined ? [] : out)',
      ],
    };
    const [declared, end] = results[this.mode];
    // The variable of the paths of error objects (see emit()).
    const start = this.structured && this.mode !== 'check' ? `${declared}let q;\n` : declared;
    const prologue = [
      '"use strict";',
      'const H = Object.prototype.hasOwnProperty;',
      'const OP = Object.prototype;',
      'function J(fieldName, key) { return fieldName ? fieldName + "." + key : key; }',
      // Adds an error to the list, which is made with the first one.
      'function P(out, e) { if (out === undefined) { return [e]; } out.push(e); return out; }',
      // The list itself when no error repeats, which is the usual case: a new list is only built when one does. Error
      // objects repeat when their messages do.
      this.structured
        ? 'function U(e) { const m = e.map((x) => x.message); for (let i = 1; i < m.length; i += 1) { if (m.indexOf(m[i]) < i) { return e.filter((x, j) => m.indexOf(m[j]) === j); } } return e; }'
        : 'function U(e) { for (let i = 1; i < e.length; i += 1) { if (e.indexOf(e[i]) < i) { return Array.from(new Set(e)); } } return e; }',
      '',
    ].join('\n');
    return `${prologue}${this.functions.join('')}return function validate(v0) {\n${start}${main}return ${end};\n};`;
  }

  build(type) {
    const source = this.source(type);
    const [first, push] = this.structured ? [firstErrorObject, pushErrorObjects] : [firstError, pushErrors];
    // eslint-disable-next-line no-new-func -- code generation is the point: only keys, texts (JSON.stringify) and finite numbers are embedded
    return new Function('c', 'n', 'r', 'a', source)(this.constants, this.nodes, first, push);
  }
}

// Returns a (value) => boolean function equivalent to type.isValid(value).
function compileIsValid(type) {
  return new Generator('check').build(type);
}

// Returns a (value) => message | undefined function giving the first error of type.validate(value).
function compileFirstError(type) {
  return new Generator('first').build(type);
}

// Returns a (value) => messages function equivalent to toErrors(type.errors(value)) for invalid values, and giving
// an empty array for valid ones.
function compileErrors(type) {
  return new Generator('all').build(type);
}

// Returns a (value) => errors function: every error message by default (empty when valid), or with
// allErrors: false only the first one, which stops at the first failing check.
// With errors: false it returns a (value) => boolean function instead, which builds no messages at all.
// The mode of the generated code for the options of compileType(): 'check', 'first' or 'all'.
// The mode of the generated code for the options of compileType() ('check', 'first' or 'all'), and whether errors are
// objects. errors: true (default) gives messages, 'objects' error objects (see error-objects.js), false true or false.
function modeOf(options = {}) {
  const { allErrors = true, errors = true } = options;
  if (errors !== true && errors !== false && errors !== 'objects') {
    throw new Error(`Unsupported option "errors": ${JSON.stringify(errors)} is not true, false or 'objects'`);
  }
  if (errors === false) {
    return { mode: 'check', structured: false };
  }
  return {
    mode: allErrors ? 'all' : 'first',
    structured: errors === 'objects',
  };
}

// The generated code of compileType(type, options), for standalone.js: the source (see Generator.source()), with
// the constants and the nodes it uses, and its mode.
function generateSource(type, options = {}) {
  const { mode, structured } = modeOf(options);
  const generator = new Generator(mode, structured);
  const source = generator.source(type);
  return {
    mode,
    source,
    constants: generator.constants,
    nodes: generator.nodes,
  };
}

function compileType(type, options = {}) {
  const { mode, structured } = modeOf(options);
  // In 'all' mode one pass: checking validity first would walk invalid values twice.
  const validate = new Generator(mode, structured).build(type);
  if (mode !== 'first') {
    return validate;
  }
  // The first error in a list.
  return (value) => {
    const error = validate(value);
    return error === undefined ? [] : [error];
  };
}

module.exports = {
  generateSource,
  compileErrors,
  compileFirstError,
  compileIsValid,
  compileType,
};

},
"@xufa/schema/src/deep-equal.js": function (module, exports, require) {
function deepEqual(a, b) {
  if (a === b) return true;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (a.constructor !== b.constructor) return false;
    if (Array.isArray(a)) {
      const l = a.length;
      if (l !== b.length) return false;
      for (let i = 0; i < l; i += 1) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    if (a instanceof Map && b instanceof Map) {
      if (a.size !== b.size) return false;
      const keys = [...a.keys()];
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (!b.has(key)) return false;
      }
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (!deepEqual(a.get(key), b.get(key))) return false;
      }
      return true;
    }
    if (a instanceof Set && b instanceof Set) {
      if (a.size !== b.size) return false;
      const keys = [...a.keys()];
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (!b.has(key)) return false;
      }
      return true;
    }
    if (ArrayBuffer.isView(a)) {
      const l = a.length;
      if (l !== b.length) return false;
      for (let i = 0; i < l; i += 1) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    }
    if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
    if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
    if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

module.exports = { deepEqual };

},
"@xufa/schema/src/defaults.js": function (module, exports, require) {
// The option useDefaults: values of "default" assigned to missing properties and tuple elements before they are
// checked, as ajv does. Each validation assigns a new copy, so the data never shares objects with the schema.

// A copy of a default value: arrays and plain objects are copied deeply; other values are used as they are.
function copyDefault(value) {
  if (Array.isArray(value)) {
    return value.map(copyDefault);
  }
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const copy = {};
    Object.keys(value).forEach((key) => {
      // An own "__proto__" key, as JSON.parse() makes it, stays a plain entry.
      Object.defineProperty(copy, key, {
        value: copyDefault(value[key]),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    });
    return copy;
  }
  return value;
}

// Assigns the defaults ([{ key, value, empty }]) whose value is missing in `target`: undefined, or with `empty` also
// null or ''.
function assignDefaults(target, defaults) {
  for (let i = 0; i < defaults.length; i += 1) {
    const { key, value, empty } = defaults[i];
    const current = target[key];
    if (current === undefined || (empty && (current === null || current === ''))) {
      target[key] = copyDefault(value);
    }
  }
}

module.exports = {
  copyDefault,
  assignDefaults,
};

},
"@xufa/schema/src/error-objects.js": function (module, exports, require) {
// Error objects of compile({ errors: 'objects' }). The generated code keeps the path of each value as an array of keys
// and indexes; these functions name it as the messages do and build the objects. Standalone code writes them out by
// their source (see standalone-helpers.js), so they call no other function.

// The name the messages give to the value at `path`: keys joined with dots, indexes in brackets, "Value" for the
// value itself (and before an index at the root). A last segment { key } is a key checked by propertyNames, named
// "Key <name>". Same names as the string paths of compile.js.
function pathName(path) {
  let name;
  for (let i = 0; i < path.length; i += 1) {
    const segment = path[i];
    if (typeof segment === 'number') {
      name = `${name === undefined ? 'Value' : name}[${segment}]`;
    } else if (segment !== null && typeof segment === 'object') {
      return `Key ${name ? `${name}.${segment.key}` : segment.key}`;
    } else {
      name = name ? `${name}.${segment}` : segment;
    }
  }
  return name === undefined ? 'Value' : name;
}

// An error: the path of the value (keys and indexes) and its JSON Pointer, the keyword that failed with its params,
// and the message. For a key checked by propertyNames, the path is the one of its property, with propertyName: true.
function errorObject(path, keyword, params, message) {
  const last = path[path.length - 1];
  const isPropertyName = last !== null && typeof last === 'object';
  const keys = isPropertyName ? path.slice(0, -1).concat(last.key) : path.slice();
  let pointer = '';
  for (let i = 0; i < keys.length; i += 1) {
    const key = `${keys[i]}`;
    // Escaped only when it has one of the two characters to escape.
    pointer += key.includes('~') || key.includes('/') ? `/${key.replace(/~/g, '~0').replace(/\//g, '~1')}` : `/${key}`;
  }
  const error = { path: keys, pointer, keyword, params, message };
  if (isPropertyName) {
    error.propertyName = true;
  }
  return error;
}

module.exports = {
  pathName,
  errorObject,
};

},
"@xufa/schema/src/formats.js": function (module, exports, require) {
// Checks of the "format" keyword (JSON Schema) and of the `format` option of String, all of them for strings. Each
// check is a self-contained function, or one calling others of this file by name, as standalone code writes them
// out by their source (see standalone-helpers.js).

// RFC 3339 full-date, with the days of each month and leap years.
function isDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

// RFC 3339 full-time: a time with an offset. A leap second (60) is valid only at 23:59 UTC.
function isTime(value) {
  const match = /^(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:([zZ])|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) {
    return false;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  if (hour > 23 || minute > 59 || second > 60) {
    return false;
  }
  let offset = 0;
  if (!match[4]) {
    const offsetHour = Number(match[6]);
    const offsetMinute = Number(match[7]);
    if (offsetHour > 23 || offsetMinute > 59) {
      return false;
    }
    offset = (match[5] === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute);
  }
  return second < 60 || (hour * 60 + minute - offset + 1440) % 1440 === 23 * 60 + 59;
}

// RFC 3339 date-time.
function isDateTime(value) {
  const match = /^(.{10})[tT](.+)$/.exec(value);
  return match !== null && isDate(match[1]) && isTime(match[2]);
}

// ISO 8601 duration, as RFC 3339 appendix A defines it.
function isDuration(value) {
  return /^P(?:(?:\d+Y(?:\d+M(?:\d+D)?)?|\d+M(?:\d+D)?|\d+D)(?:T(?:\d+H(?:\d+M(?:\d+S)?)?|\d+M(?:\d+S)?|\d+S))?|T(?:\d+H(?:\d+M(?:\d+S)?)?|\d+M(?:\d+S)?|\d+S)|\d+W)$/.test(
    value
  );
}

function isIpv4(value) {
  return /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(value);
}

// RFC 4291 text form: eight groups, "::" for one or more groups of zeros, and an IPv4 address as the last two.
function isIpv6(value) {
  if (!/^[0-9A-Fa-f:.]+$/.test(value)) {
    return false;
  }
  const halves = value.split('::');
  if (halves.length > 2) {
    return false;
  }
  const groups = halves.map((half) => (half === '' ? [] : half.split(':')));
  const all = groups[groups.length - 1];
  let count = 0;
  if (all.length > 0 && all[all.length - 1].includes('.')) {
    if (!isIpv4(all.pop())) {
      return false;
    }
    count = 2;
  }
  const hextets = [].concat(...groups);
  if (!hextets.every((group) => /^[0-9A-Fa-f]{1,4}$/.test(group))) {
    return false;
  }
  count += hextets.length;
  return halves.length === 2 ? count < 8 : count === 8;
}

// Punycode (RFC 3492): the bias adaptation, decoding (undefined when invalid) and encoding.
function punycodeAdapt(delta, points, isFirst) {
  let result = Math.floor(delta / (isFirst ? 700 : 2));
  result += Math.floor(result / points);
  let k = 0;
  while (result > 455) {
    result = Math.floor(result / 35);
    k += 36;
  }
  return k + Math.floor((36 * result) / (result + 38));
}

function punycodeDecode(input) {
  const output = [];
  const delimiter = input.lastIndexOf('-');
  for (let j = 0; j < Math.max(delimiter, 0); j += 1) {
    if (input.charCodeAt(j) >= 0x80) {
      return undefined;
    }
    output.push(input.charCodeAt(j));
  }
  let n = 128;
  let bias = 72;
  let i = 0;
  for (let index = delimiter < 0 ? 0 : delimiter + 1; index < input.length;) {
    const old = i;
    let weight = 1;
    for (let k = 36; ; k += 36) {
      if (index >= input.length) {
        return undefined;
      }
      const code = input.charCodeAt(index);
      index += 1;
      let digit = 36;
      if (code >= 48 && code <= 57) {
        digit = code - 22;
      } else if (code >= 65 && code <= 90) {
        digit = code - 65;
      } else if (code >= 97 && code <= 122) {
        digit = code - 97;
      }
      if (digit >= 36 || digit > Math.floor((0x7fffffff - i) / weight)) {
        return undefined;
      }
      i += digit * weight;
      let t = k - bias;
      if (k <= bias) {
        t = 1;
      } else if (k >= bias + 26) {
        t = 26;
      }
      if (digit < t) {
        break;
      }
      weight *= 36 - t;
    }
    bias = punycodeAdapt(i - old, output.length + 1, old === 0);
    n += Math.floor(i / (output.length + 1));
    i %= output.length + 1;
    if (n > 0x10ffff) {
      return undefined;
    }
    output.splice(i, 0, n);
    i += 1;
  }
  return String.fromCodePoint(...output);
}

function punycodeEncode(input) {
  const points = Array.from(input, (char) => char.codePointAt(0));
  const digit = (d) => String.fromCharCode(d < 26 ? 97 + d : 22 + d);
  let output = points
    .filter((point) => point < 128)
    .map((point) => String.fromCharCode(point))
    .join('');
  const basic = output.length;
  let handled = basic;
  if (basic > 0) {
    output += '-';
  }
  let n = 128;
  let delta = 0;
  let bias = 72;
  while (handled < points.length) {
    // The smallest code point not handled yet.
    let m = 0x10ffff;
    for (let i = 0; i < points.length; i += 1) {
      if (points[i] >= n && points[i] < m) {
        m = points[i];
      }
    }
    delta += (m - n) * (handled + 1);
    n = m;
    for (let i = 0; i < points.length; i += 1) {
      if (points[i] < n) {
        delta += 1;
      }
      if (points[i] === n) {
        let q = delta;
        for (let k = 36; ; k += 36) {
          let t = k - bias;
          if (k <= bias) {
            t = 1;
          } else if (k >= bias + 26) {
            t = 26;
          }
          if (q < t) {
            break;
          }
          output += digit(t + ((q - t) % (36 - t)));
          q = Math.floor((q - t) / (36 - t));
        }
        output += digit(q);
        bias = punycodeAdapt(delta, handled + 1, handled === basic);
        delta = 0;
        handled += 1;
      }
    }
    delta += 1;
    n += 1;
  }
  return output;
}

// Bidi class of a character, approximated from its script and category: L, R, AL, AN, EN, ES, CS, ET, NSM or ON.
function bidiClass(char) {
  if (/[\u0600-\u0605\u0660-\u0669\u066B\u066C\u06DD\u0890\u0891\u08E2]/u.test(char)) {
    return 'AN';
  }
  if (/[0-9\u06F0-\u06F9\u00B2\u00B3\u00B9\u2070-\u2079\u2080-\u2089\uFF10-\uFF19]/u.test(char)) {
    return 'EN';
  }
  if (/[\p{Mn}\p{Me}]/u.test(char)) {
    return 'NSM';
  }
  if (/[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}]/u.test(char)) {
    return 'AL';
  }
  if (/[\p{Script=Hebrew}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\u200F]/u.test(char)) {
    return 'R';
  }
  if (/[+-]/.test(char)) {
    return 'ES';
  }
  if (/[,./:\u00A0]/.test(char)) {
    return 'CS';
  }
  if (/[#$%\u00A2-\u00A5\u00B0\u00B1]/u.test(char)) {
    return 'ET';
  }
  return /[\p{L}\p{Mc}]/u.test(char) ? 'L' : 'ON';
}

// The Bidi rule of RFC 5893 for a label, in a name with right-to-left labels.
function hasValidBidi(label) {
  const classes = Array.from(label, bidiClass);
  const first = classes[0];
  const last = classes.filter((type) => type !== 'NSM').pop();
  if (first === 'R' || first === 'AL') {
    return (
      classes.every((type) => ['R', 'AL', 'AN', 'EN', 'ES', 'CS', 'ET', 'ON', 'NSM'].includes(type)) &&
      ['R', 'AL', 'EN', 'AN'].includes(last) &&
      !(classes.includes('EN') && classes.includes('AN'))
    );
  }
  if (first === 'L') {
    return (
      classes.every((type) => ['L', 'EN', 'ES', 'CS', 'ET', 'ON', 'NSM'].includes(type)) && ['L', 'EN'].includes(last)
    );
  }
  return false;
}

// Whether a label (without "xn--" and already mapped) is a valid U-label: IDNA2008 (RFC 5891, 5892) code points,
// hyphens and contextual rules.
function isULabel(label) {
  const chars = Array.from(label);
  if (label.length === 0 || label.normalize('NFC') !== label || /^\p{M}/u.test(label)) {
    return false;
  }
  if (label.startsWith('-') || label.endsWith('-') || label.slice(2, 4) === '--') {
    return false;
  }
  const virama =
    /[\u094D\u09CD\u0A4D\u0ACD\u0B4D\u0BCD\u0C4D\u0CCD\u0D3B\u0D3C\u0D4D\u0DCA\u0E3A\u0F84\u1039\u103A\u1714\u1734\u17D2\u1A60\u1B44\u1BAA\u1BAB\u1BF2\u1BF3\u2D7F\uA806\uA8C4\uA953\uA9C0\uAAF6\uABED]/u;
  const joining = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mongolian}]/u;
  return chars.every((char, i) => {
    const before = chars[i - 1];
    const after = chars[i + 1];
    switch (char) {
      case '\u00DF':
      case '\u03C2':
      case '\u06FD':
      case '\u06FE':
      case '\u0F0B':
      case '\u3007':
        return true;
      case '\u00B7':
        return before === 'l' && after === 'l';
      case '\u0375':
        return after !== undefined && /\p{Script=Greek}/u.test(after);
      case '\u05F3':
      case '\u05F4':
        return before !== undefined && /\p{Script=Hebrew}/u.test(before);
      case '\u30FB':
        return chars.some(
          (other) => /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(other) && other !== '\u30FB'
        );
      case '\u200D':
        return before !== undefined && virama.test(before);
      case '\u200C': {
        if (before !== undefined && virama.test(before)) {
          return true;
        }
        // Joining letters on both sides, marks between them skipped.
        const left = chars
          .slice(0, i)
          .reverse()
          .find((other) => !/\p{Mn}/u.test(other));
        const right = chars.slice(i + 1).find((other) => !/\p{Mn}/u.test(other));
        return left !== undefined && right !== undefined && joining.test(left) && joining.test(right);
      }
      default:
        break;
    }
    if (/[\u0660-\u0669]/u.test(char)) {
      return !chars.some((other) => /[\u06F0-\u06F9]/u.test(other));
    }
    if (/[\u06F0-\u06F9]/u.test(char)) {
      return !chars.some((other) => /[\u0660-\u0669]/u.test(other));
    }
    // The code points RFC 5892 lists as DISALLOWED, marks among them.
    // eslint-disable-next-line no-misleading-character-class -- each one is a code point on its own
    if (/[\u0640\u07FA\u302E\u302F\u3031-\u3035\u303B]/u.test(char)) {
      return false;
    }
    return /[\p{Ll}\p{Lo}\p{Lm}\p{Mn}\p{Mc}\p{Nd}-]/u.test(char) && char.normalize('NFKC').toLowerCase() === char;
  });
}

// Whether a host name, after UTS 46 mapping when `isIdn`, is valid: labels of at most 63 octets (as A-labels), at most
// 253 octets in all, ASCII letters, digits and hyphens, and A-labels ("xn--") and U-labels that are valid.
function hasValidLabels(value, isIdn) {
  // A name of letter-digit-hyphen labels needs no mapping and has no right-to-left label: without "--" in the third and
  // fourth positions of a label (RFC 5891), which only a punycode label ("xn--") may have and the full check reads, it
  // only has to be at most 253 characters long.
  if (
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(value) &&
    !/(?:^|\.)[A-Za-z0-9-]{2}--/.test(value)
  ) {
    return value.length <= 253;
  }
  const mapped = isIdn
    ? value
        .normalize('NFKC')
        .replace(/[\u3002\uFF0E\uFF61]/gu, '.')
        // Code points the mapping removes (soft hyphen, zero width space, variation selectors...).
        // eslint-disable-next-line no-misleading-character-class -- each one is a code point on its own
        .replace(/[\u00AD\u200B\u2060\uFEFF\u180B-\u180D\uFE00-\uFE0F]/gu, '')
        .toLowerCase()
    : value;
  if (!isIdn && !/^[\x21-\x7E]*$/.test(mapped)) {
    return false;
  }
  const labels = mapped.split('.');
  const unicode = [];
  const ascii = [];
  const valid = labels.every((label) => {
    if (/^xn--/i.test(label)) {
      const decoded = punycodeDecode(label.slice(4).toLowerCase());
      if (
        decoded === undefined ||
        Array.from(decoded).every((char) => char.charCodeAt(0) < 0x80) ||
        punycodeEncode(decoded) !== label.slice(4).toLowerCase() ||
        !isULabel(decoded)
      ) {
        return false;
      }
      unicode.push(decoded);
      ascii.push(label);
      return label.length <= 63;
    }
    if (Array.from(label).every((char) => char.charCodeAt(0) < 0x80)) {
      unicode.push(label);
      ascii.push(label);
      return (
        /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label) &&
        !(label.slice(2, 4) === '--' && !/^xn--/i.test(label))
      );
    }
    if (!isIdn || !isULabel(label)) {
      return false;
    }
    unicode.push(label);
    ascii.push(`xn--${punycodeEncode(label)}`);
    return ascii[ascii.length - 1].length <= 63;
  });
  if (!valid || ascii.join('.').length > 253) {
    return false;
  }
  // With a right-to-left label, every label follows the Bidi rule.
  const isRtl = unicode.some((label) => Array.from(label).some((char) => ['R', 'AL', 'AN'].includes(bidiClass(char))));
  return !isRtl || unicode.every(hasValidBidi);
}

function isHostname(value) {
  return hasValidLabels(value, false);
}

// A host name up to draft-06: RFC 1123 labels, without the rules of IDNA that later drafts add.
function isRfc1123Hostname(value) {
  return (
    value.length <= 253 &&
    value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))
  );
}

function isIdnHostname(value) {
  return hasValidLabels(value, true);
}

// RFC 5321 address: a dot-atom or quoted local part, and a host name (that isHost checks) or an IP address literal.
function isEmailWith(value, isIdn, isHost) {
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) {
    return false;
  }
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  // Literals, which are compiled once (a RegExp made here would be compiled on every call).
  const dotAtom = isIdn
    ? /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~\u0080-\u{10FFFF}-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~\u0080-\u{10FFFF}-]+)*$/u
    : /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
  // A quoted local part: printable ASCII but '"' and '\', which are escaped, and in idn-email other characters too.
  const quoted = isIdn
    ? /^"(?:[\x20\x21\x23-\x5B\x5D-\x7E\u0080-\u{10FFFF}]|\\[\x20-\x7E])*"$/u
    : /^"(?:[\x20\x21\x23-\x5B\x5D-\x7E]|\\[\x20-\x7E])*"$/;
  if (!dotAtom.test(local) && !quoted.test(local)) {
    return false;
  }
  const literal = domain.charCodeAt(0) === 0x5b ? /^\[(?:IPv6:(.+)|(.+))\]$/i.exec(domain) : null;
  if (literal) {
    return literal[1] !== undefined ? isIpv6(literal[1]) : isIpv4(literal[2]);
  }
  return isHost(domain);
}

function isEmail(value) {
  return isEmailWith(value, false, isHostname);
}

function isIdnEmail(value) {
  return isEmailWith(value, true, isIdnHostname);
}

// ECMA-262 regular expression, as the u flag reads it.
function isRegex(value) {
  try {
    RegExp(value, 'u');
    return true;
  } catch (e) {
    return false;
  }
}

// URIs and IRIs (RFC 3986, 3987), built from the grammar of RFC 3986.
const PCT = '%[0-9A-Fa-f]{2}';
const SUB_DELIMS = "!$&'()*+,;=";
const UCSCHAR =
  '\\u00A0-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFEF\\u{10000}-\\u{1FFFD}\\u{20000}-\\u{2FFFD}\\u{30000}-\\u{3FFFD}\\u{40000}-\\u{4FFFD}' +
  '\\u{50000}-\\u{5FFFD}\\u{60000}-\\u{6FFFD}\\u{70000}-\\u{7FFFD}\\u{80000}-\\u{8FFFD}\\u{90000}-\\u{9FFFD}\\u{A0000}-\\u{AFFFD}' +
  '\\u{B0000}-\\u{BFFFD}\\u{C0000}-\\u{CFFFD}\\u{D0000}-\\u{DFFFD}\\u{E1000}-\\u{EFFFD}';
const IPRIVATE = '\\uE000-\\uF8FF\\u{F0000}-\\u{FFFFD}\\u{100000}-\\u{10FFFD}';
const H16 = '[0-9A-Fa-f]{1,4}';
const DEC_OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = `(?:${DEC_OCTET}\\.){3}${DEC_OCTET}`;
const LS32 = `(?:${H16}:${H16}|${IPV4})`;
const IPV6 = [
  `(?:${H16}:){6}${LS32}`,
  `::(?:${H16}:){5}${LS32}`,
  `(?:${H16})?::(?:${H16}:){4}${LS32}`,
  `(?:(?:${H16}:){0,1}${H16})?::(?:${H16}:){3}${LS32}`,
  `(?:(?:${H16}:){0,2}${H16})?::(?:${H16}:){2}${LS32}`,
  `(?:(?:${H16}:){0,3}${H16})?::${H16}:${LS32}`,
  `(?:(?:${H16}:){0,4}${H16})?::${LS32}`,
  `(?:(?:${H16}:){0,5}${H16})?::${H16}`,
  `(?:(?:${H16}:){0,6}${H16})?::`,
].join('|');

// The regular expression of a URI (or IRI) or of a reference to one.
function uriPattern(isIri, isReference) {
  const unreserved = `A-Za-z0-9\\-._~${isIri ? UCSCHAR : ''}`;
  const pchar = `(?:[${unreserved}${SUB_DELIMS}:@]|${PCT})`;
  const segmentNzNc = `(?:[${unreserved}${SUB_DELIMS}@]|${PCT})+`;
  const userinfo = `(?:[${unreserved}${SUB_DELIMS}:]|${PCT})*`;
  const ipLiteral = `\\[(?:${IPV6}|[vV][0-9A-Fa-f]+\\.[A-Za-z0-9\\-._~${SUB_DELIMS}:]+)\\]`;
  const regName = `(?:[${unreserved}${SUB_DELIMS}]|${PCT})*`;
  const authority = `(?:${userinfo}@)?(?:${ipLiteral}|${IPV4}|${regName})(?::\\d*)?`;
  const pathAbempty = `(?:/${pchar}*)*`;
  const pathAbsolute = `/(?:${pchar}+(?:/${pchar}*)*)?`;
  const pathRootless = `${pchar}+(?:/${pchar}*)*`;
  const pathNoscheme = `${segmentNzNc}(?:/${pchar}*)*`;
  const query = `(?:${pchar}|[/?${isIri ? IPRIVATE : ''}])*`;
  const fragment = `(?:${pchar}|[/?])*`;
  const tail = `(?:\\?${query})?(?:#${fragment})?`;
  const uri = `[A-Za-z][A-Za-z0-9+\\-.]*:(?://${authority}${pathAbempty}|${pathAbsolute}|${pathRootless}|)${tail}`;
  const relative = `(?://${authority}${pathAbempty}|${pathAbsolute}|${pathNoscheme}|)${tail}`;
  return new RegExp(isReference ? `^(?:${uri}|${relative})$` : `^${uri}$`, 'u');
}

// Built-in formats: a function, or a regular expression the string must match.
// Comparisons of two values of a format for formatMinimum, formatMaximum, formatExclusiveMinimum and
// formatExclusiveMaximum, as ajv-formats compares them: a negative number, 0 or a positive number, or undefined when
// either value cannot be compared (which passes the limit).
function compareDate(d1, d2) {
  if (!(d1 && d2)) {
    return undefined;
  }
  if (d1 > d2) {
    return 1;
  }
  return d1 < d2 ? -1 : 0;
}

function compareTime(t1, t2) {
  if (!(t1 && t2)) {
    return undefined;
  }
  const ms1 = new Date(`2020-01-01T${t1}`).valueOf();
  const ms2 = new Date(`2020-01-01T${t2}`).valueOf();
  return ms1 && ms2 ? ms1 - ms2 : undefined;
}

function compareDateTime(dt1, dt2) {
  if (!(dt1 && dt2)) {
    return undefined;
  }
  const ms1 = new Date(dt1).valueOf();
  const ms2 = new Date(dt2).valueOf();
  return ms1 && ms2 ? ms1 - ms2 : undefined;
}

// The built-in formats whose values can be compared, with their comparison.
const FORMAT_COMPARES = {
  date: compareDate,
  time: compareTime,
  'date-time': compareDateTime,
};

const FORMATS = {
  date: isDate,
  time: isTime,
  'date-time': isDateTime,
  duration: isDuration,
  email: isEmail,
  'idn-email': isIdnEmail,
  hostname: isHostname,
  'idn-hostname': isIdnHostname,
  ipv4: isIpv4,
  ipv6: isIpv6,
  uri: uriPattern(false, false),
  'uri-reference': uriPattern(false, true),
  iri: uriPattern(true, false),
  'iri-reference': uriPattern(true, true),
  uuid: /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/,
  // RFC 6570: literals are any character but controls, space and '"%<>\^`{|}'; variable names may have dots.
  /* eslint-disable no-control-regex -- the literals exclude the control characters */
  'uri-template':
    /^(?:[^\x00-\x20\x7F"%<>\\^`{|}]|%[0-9A-Fa-f]{2}|\{[+#./;?&=,!@|]?(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+(?:\.(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+)*(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+(?:\.(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+)*(?::[1-9][0-9]{0,3}|\*)?)*\})*$/,
  /* eslint-enable no-control-regex */
  'json-pointer': /^(?:\/(?:[^~/]|~0|~1)*)*$/,
  'relative-json-pointer': /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
  regex: isRegex,
};

// The functions of the formats, and the ones they call, by name, for standalone code.
const FORMAT_FUNCTIONS = {
  isRfc1123Hostname,
  compareDate,
  compareTime,
  compareDateTime,
  isDate,
  isTime,
  isDateTime,
  isDuration,
  isIpv4,
  isIpv6,
  punycodeAdapt,
  punycodeDecode,
  punycodeEncode,
  bidiClass,
  hasValidBidi,
  isULabel,
  hasValidLabels,
  isHostname,
  isIdnHostname,
  isEmailWith,
  isEmail,
  isIdnEmail,
  isRegex,
};

// Whether `value` has the format `check` (a function or a regular expression).
function matchesFormat(check, value) {
  return typeof check === 'function' ? check(value) : check.test(value);
}

module.exports = {
  FORMATS,
  FORMAT_COMPARES,
  FORMAT_FUNCTIONS,
  isRfc1123Hostname,
  matchesFormat,
};

},
"@xufa/schema/src/index.js": function (module, exports, require) {
const { ClosedSchema } = require('./closed-schema');
const { compileErrors, compileFirstError, compileIsValid, compileType } = require('./compile');
const {
  fromJsonSchema,
  compileJsonSchema,
  compileJsonSchemaAsync,
  loadJsonSchemas,
  builtInFormats,
} = require('./json-schema');
const { Schema } = require('./schema');
const { standaloneCode, standaloneModule, standaloneJsonSchema } = require('./standalone');
const { ajvKeywords } = require('./ajv-keywords');
const { inferJsonSchema, inferSchemaCode } = require('./infer');
// The builder: JSON Schemas written as code (s.object(), s.string()...), with their types.
const { s, isOptional, OPTIONAL } = require('./builder');
const {
  AllOfType,
  AllOf,
  allOf,
  oallOf,
  AnyType,
  Any,
  any,
  oany,
  AnyOfType,
  AnyOf,
  anyOf,
  oanyOf,
  ArrayOfType,
  ArrayOf,
  arrOf,
  oarrOf,
  BooleanType,
  Boolean,
  bool,
  obool,
  ConditionalType,
  Conditional,
  EnumType,
  Enum,
  enumt,
  oenumt,
  oenum,
  FloatType,
  Float,
  float,
  ofloat,
  num,
  onum,
  IntegerType,
  Integer,
  int,
  oint,
  NeverType,
  Never,
  never,
  NotType,
  Not,
  not,
  onot,
  ObjType,
  Obj,
  obj,
  oobj,
  OneOfType,
  OneOf,
  oneOf,
  ooneOf,
  RefType,
  Ref,
  StringType,
  String,
  str,
  ostr,
  ValidateType,
  hasErrors,
  toErrors,
  ValuesType,
  Values,
  Const,
  WhenType,
  When,
  isJsonType,
  KeywordType,
} = require('./types');

module.exports = {
  s,
  isOptional,
  OPTIONAL,
  ClosedSchema,
  compileErrors,
  compileFirstError,
  compileIsValid,
  compileType,
  fromJsonSchema,
  compileJsonSchema,
  compileJsonSchemaAsync,
  loadJsonSchemas,
  Schema,
  AllOfType,
  AllOf,
  allOf,
  oallOf,
  AnyType,
  Any,
  any,
  oany,
  AnyOfType,
  AnyOf,
  anyOf,
  oanyOf,
  ArrayOfType,
  ArrayOf,
  arrOf,
  oarrOf,
  BooleanType,
  Boolean,
  bool,
  obool,
  ConditionalType,
  Conditional,
  EnumType,
  Enum,
  enumt,
  oenumt,
  oenum,
  FloatType,
  Float,
  float,
  ofloat,
  num,
  onum,
  IntegerType,
  Integer,
  int,
  oint,
  NeverType,
  Never,
  never,
  NotType,
  Not,
  not,
  onot,
  ObjType,
  Obj,
  obj,
  oobj,
  OneOfType,
  OneOf,
  oneOf,
  ooneOf,
  RefType,
  Ref,
  StringType,
  String,
  str,
  ostr,
  ValidateType,
  hasErrors,
  toErrors,
  ValuesType,
  Values,
  Const,
  WhenType,
  When,
  isJsonType,
  standaloneCode,
  standaloneModule,
  standaloneJsonSchema,
  KeywordType,
  ajvKeywords,
  builtInFormats,
  inferJsonSchema,
  inferSchemaCode,
};

},
"@xufa/schema/src/infer.js": function (module, exports, require) {
// Schemas inferred from sample values: inferJsonSchema() gives a JSON Schema and inferSchemaCode() the source of the
// same schema in the DSL. The samples are merged position by position: the types seen at each one (an integer and a
// number give "number", null makes it nullable), the keys of objects (required when every object at that position has
// them), and the elements of arrays, all merged into one schema. Strings get a format when every one matches it.
const { FORMATS, matchesFormat } = require('./formats');

// The formats detected, in order of preference: the first one every string matches is chosen. Host names, URI
// references and the like match plain words, so they are left out; a URI needs "scheme://".
const FORMAT_CANDIDATES = ['date-time', 'date', 'time', 'email', 'uuid', 'ipv4', 'ipv6', 'uri'];
const matchesCandidate = (name, text) =>
  name === 'uri'
    ? /^[a-z][a-z0-9+.-]*:\/\//i.test(text) && matchesFormat(FORMATS.uri, text)
    : matchesFormat(FORMATS[name], text);

const DRAFT_URIS = {
  'draft-04': 'http://json-schema.org/draft-04/schema#',
  'draft-06': 'http://json-schema.org/draft-06/schema#',
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  '2019-09': 'https://json-schema.org/draft/2019-09/schema',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
};

const isIdentifier = (key) => /^[A-Za-z_$][\w$]*$/.test(key);
const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

// What the samples show at one position.
const newNode = () => ({
  null: false,
  boolean: false,
  integer: false,
  number: false,
  string: null,
  array: null,
  object: null,
});

function add(node, value, path) {
  if (value === null) {
    node.null = true;
  } else if (typeof value === 'boolean') {
    node.boolean = true;
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot infer a schema: ${value} at ${path || 'the value'} is not a JSON value`);
    }
    node[Number.isInteger(value) ? 'integer' : 'number'] = true;
  } else if (typeof value === 'string') {
    node.string = node.string || { formats: FORMAT_CANDIDATES };
    node.string.formats = node.string.formats.filter((name) => matchesCandidate(name, value));
  } else if (Array.isArray(value)) {
    node.array = node.array || { items: null };
    value.forEach((item, index) => {
      node.array.items = node.array.items || newNode();
      add(node.array.items, item, `${path}[${index}]`);
    });
  } else if (isPlainObject(value)) {
    node.object = node.object || { count: 0, keys: new Map() };
    node.object.count += 1;
    Object.keys(value).forEach((key) => {
      // A key whose value is undefined (in JavaScript samples) is taken as absent, as JSON leaves it out.
      if (value[key] === undefined) {
        return;
      }
      if (!node.object.keys.has(key)) {
        node.object.keys.set(key, { node: newNode(), count: 0 });
      }
      const entry = node.object.keys.get(key);
      entry.count += 1;
      add(entry.node, value[key], path ? `${path}.${key}` : key);
    });
  } else {
    const what = value instanceof Date ? 'a Date (use its ISO string)' : `a ${typeof value}`;
    throw new Error(`Cannot infer a schema: ${path || 'the value'} is ${what}, not a JSON value`);
  }
}

function optionsOf(options) {
  const { closed = false, formats = true, draft = '2020-12' } = options;
  if (!Object.prototype.hasOwnProperty.call(DRAFT_URIS, draft)) {
    throw new Error(`Unsupported option "draft": "${draft}" is not one of ${Object.keys(DRAFT_URIS).join(', ')}`);
  }
  return { closed: closed === true, formats: formats !== false, draft };
}

function modelOf(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('Cannot infer a schema: expected a non-empty array of sample values');
  }
  const root = newNode();
  samples.forEach((sample) => add(root, sample, ''));
  return root;
}

// The JSON types a node holds, without null, in the order they are written.
function typesOf(node) {
  const types = [];
  if (node.object) types.push('object');
  if (node.array) types.push('array');
  if (node.string) types.push('string');
  if (node.number) types.push('number');
  else if (node.integer) types.push('integer');
  if (node.boolean) types.push('boolean');
  return types;
}

const formatOf = (node, options) => (options.formats && node.string.formats[0]) || undefined;

function toJsonSchema(node, options) {
  const types = typesOf(node);
  // Only null (or nothing, for the elements of empty arrays): the type is unknown, so anything is accepted.
  if (types.length === 0) {
    return {};
  }
  const allTypes = node.null ? [...types, 'null'] : types;
  const schema = { type: allTypes.length === 1 ? allTypes[0] : allTypes };
  if (node.string && formatOf(node, options)) {
    schema.format = formatOf(node, options);
  }
  if (node.array && node.array.items) {
    schema.items = toJsonSchema(node.array.items, options);
  }
  if (node.object) {
    const keys = [...node.object.keys];
    schema.properties = Object.fromEntries(keys.map(([key, entry]) => [key, toJsonSchema(entry.node, options)]));
    const required = keys.filter(([, entry]) => entry.count === node.object.count).map(([key]) => key);
    if (required.length > 0) {
      schema.required = required;
    }
    if (options.closed) {
      schema.additionalProperties = false;
    }
  }
  return schema;
}

// A JSON Schema that accepts every sample. Options: closed (additionalProperties: false on objects), formats (detect
// formats, default true) and draft (the "$schema" written, default '2020-12').
function inferJsonSchema(samples, options = {}) {
  const settings = optionsOf(options);
  return { $schema: DRAFT_URIS[settings.draft], ...toJsonSchema(modelOf(samples), settings) };
}

const quote = (text) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

// The DSL source of a node, with its options (isMandatory, isNullable), noting the names it uses.
function toCode(node, options, extra, indent, used) {
  const pad = ' '.repeat(indent);
  const types = typesOf(node);
  const settings = [...extra];
  const use = (name) => {
    used.add(name);
    return name;
  };
  const call = (name, own = []) => {
    const all = [...own, ...settings];
    return `${use(name)}(${all.length ? `{ ${all.join(', ')} }` : ''})`;
  };
  if (types.length === 0) {
    return call('Any', ['isNullable: true']);
  }
  if (node.null) {
    settings.push('isNullable: true');
  }
  const codeOf = (type, own) => {
    switch (type) {
      case 'string': {
        const format = formatOf(node, options);
        return call('String', [...own, ...(format ? [`format: ${quote(format)}`] : [])]);
      }
      case 'integer':
        return call('Integer', own);
      case 'number':
        return call('Float', own);
      case 'boolean':
        return call('Boolean', own);
      case 'array': {
        const { items } = node.array;
        const typeOption = items ? [`type: ${toCode(items, options, [], indent, used)}`] : [];
        return call('ArrayOf', [...typeOption, ...own]);
      }
      default: {
        const name = use(options.closed ? 'ClosedSchema' : 'Schema');
        const entries = [...node.object.keys].map(([key, entry]) => {
          const optional = entry.count === node.object.count ? [] : ['isMandatory: false'];
          const value = toCode(entry.node, options, optional, indent + 2, used);
          return `${pad}  ${isIdentifier(key) ? key : quote(key)}: ${value},`;
        });
        const body = entries.length ? `{\n${entries.join('\n')}\n${pad}}` : '{}';
        const all = [...own, ...settings];
        return `new ${name}(${body}${all.length ? `, { ${all.join(', ')} }` : ''})`;
      }
    }
  };
  if (types.length === 1) {
    return codeOf(types[0], []);
  }
  // Several types: each one mandatory and not null, the combination takes the options.
  const inner = types.map((type) => toCode({ ...newNode(), [type]: node[type] }, options, [], indent + 2, used));
  return call('AnyOf', [`types: [${inner.join(', ')}]`]);
}

// The same schema as inferJsonSchema(), as the source of a JavaScript module using the DSL. Options: closed and
// formats, as there; name (of the variable, default 'schema'); module: 'commonjs' (default), 'esm' or 'none' (the
// import line).
function inferSchemaCode(samples, options = {}) {
  const settings = optionsOf(options);
  const { name = 'schema', module = 'commonjs' } = options;
  if (!isIdentifier(name)) {
    throw new Error(`Unsupported option "name": "${name}" is not a JavaScript identifier`);
  }
  if (!['commonjs', 'esm', 'none'].includes(module)) {
    throw new Error(`Unsupported option "module": "${module}" is not one of commonjs, esm, none`);
  }
  const used = new Set();
  const code = toCode(modelOf(samples), settings, [], 0, used);
  const names = [...used].sort().join(', ');
  const header = {
    commonjs: `const { ${names} } = require('@xufa/schema');\n\n`,
    esm: `import { ${names} } from '@xufa/schema';\n\n`,
    none: '',
  }[module];
  return `${header}const ${name} = ${code};\n`;
}

module.exports = { inferJsonSchema, inferSchemaCode };

},
"@xufa/schema/src/json-schema-refs.js": function (module, exports, require) {
// Resolution of JSON Schema references: JSON pointers ("#/definitions/a"), "$id" base URI changes, and anchors ("#foo":
// "$id" fragments, and from draft 2019-09 on "$anchor" and "$dynamicAnchor"), within the schema and within other
// documents registered by URI. Nothing is loaded from the network: a reference to a document that is not registered
// does not resolve. It also records the dynamic anchors of each resource ("$dynamicAnchor", and "$recursiveAnchor": true
// on a resource root as an anchor without name), which dynamic references look up in the resources being evaluated.

// Base URI of a document without "$id".
const DEFAULT_BASE = 'xufa-schema://schema/root.json';

// Keywords whose value is a subschema, a map of subschemas or a list of subschemas, where "$id" can appear.
const SCHEMA_KEYWORDS = [
  'additionalItems',
  'additionalProperties',
  'contains',
  'else',
  'if',
  'items',
  'not',
  'propertyNames',
  'then',
  'contentSchema',
  'unevaluatedItems',
  'unevaluatedProperties',
];
const SCHEMA_MAP_KEYWORDS = [
  'definitions',
  '$defs',
  'dependencies',
  'dependentSchemas',
  'patternProperties',
  'properties',
];
const SCHEMA_LIST_KEYWORDS = ['allOf', 'anyOf', 'items', 'oneOf', 'prefixItems'];

// Drafts where every keyword next to "$ref" is ignored, "$id" included.
const LEGACY_DRAFTS = ['draft-04', 'draft-06', 'draft-07'];
const isLegacy = (draft) => LEGACY_DRAFTS.includes(draft);

// The keyword that changes the base URI: "id" in draft-04, "$id" later.
const idKeyword = (draft) => (draft === 'draft-04' ? 'id' : '$id');

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function resolveUri(ref, base) {
  try {
    return new URL(ref, base).href;
  } catch (e) {
    return undefined;
  }
}

function splitFragment(uri) {
  const index = uri.indexOf('#');
  return index === -1 ? [uri, ''] : [uri.slice(0, index), uri.slice(index + 1)];
}

function decode(text) {
  try {
    return decodeURIComponent(text);
  } catch (e) {
    return undefined;
  }
}

// Follows a JSON pointer ("/a/b~1c/0") from a node; undefined when a token is missing.
function followPointer(node, pointer) {
  const tokens = pointer
    .split('/')
    .slice(1)
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = node;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (Array.isArray(current) && /^(0|[1-9][0-9]*)$/.test(token)) {
      current = current[Number(token)];
    } else if (current !== null && typeof current === 'object' && !Array.isArray(current) && hasOwn(current, token)) {
      current = current[token];
    } else {
      return undefined;
    }
  }
  return current;
}

// Documents to register, from { uri: schema } or [schema with "$id"], without a fragment other than an empty one
// ("http://json-schema.org/draft-07/schema#"). A relative URI ("address", as Fastify and ajv allow) is resolved against
// the base URI of a schema without "$id", so "$ref": "address#" in such a schema reaches it.
function documentsOf(schemas) {
  if (schemas === undefined) {
    return [];
  }
  let entries;
  if (Array.isArray(schemas)) {
    entries = schemas.map((schema) => [schema && (typeof schema.$id === 'string' ? schema.$id : schema.id), schema]);
  } else if (isObject(schemas)) {
    entries = Object.entries(schemas);
  } else {
    throw new Error('Unsupported JSON Schema option "schemas": expected an object of schemas by URI or an array');
  }
  return entries.map(([uri, schema]) => {
    const absolute = typeof uri === 'string' && uri !== '' ? resolveUri(uri, DEFAULT_BASE) : undefined;
    const [document, fragment] = absolute === undefined ? [] : splitFragment(absolute);
    if (absolute === undefined || fragment !== '') {
      throw new Error(`Unsupported JSON Schema option "schemas": "${uri}" is not a URI without fragment`);
    }
    return { uri: document, schema };
  });
}

// Drafts by the "$schema" URI (without its empty fragment) that selects them.
const DRAFT_URIS = {
  'http://json-schema.org/draft-04/schema': 'draft-04',
  'https://json-schema.org/draft-04/schema': 'draft-04',
  'http://json-schema.org/draft-06/schema': 'draft-06',
  'https://json-schema.org/draft-06/schema': 'draft-06',
  'http://json-schema.org/draft-07/schema': 'draft-07',
  'https://json-schema.org/draft-07/schema': 'draft-07',
  'https://json-schema.org/draft/2019-09/schema': '2019-09',
  'http://json-schema.org/draft/2019-09/schema': '2019-09',
  'https://json-schema.org/draft/2020-12/schema': '2020-12',
  'http://json-schema.org/draft/2020-12/schema': '2020-12',
};

// The draft a "$schema" names, or undefined.
function draftOfUri(uri) {
  return typeof uri === 'string' ? DRAFT_URIS[uri.replace(/#$/, '')] : undefined;
}

// Keywords of the vocabularies of drafts 2019-09 and 2020-12 that a meta-schema can leave out with "$vocabulary".
// The others (core, meta-data, format, content) always apply or are annotations.
const VOCABULARY_KEYWORDS = {
  validation: [
    'type',
    'enum',
    'const',
    'multipleOf',
    'maximum',
    'exclusiveMaximum',
    'minimum',
    'exclusiveMinimum',
    'maxLength',
    'minLength',
    'pattern',
    'maxItems',
    'minItems',
    'uniqueItems',
    'maxContains',
    'minContains',
    'maxProperties',
    'minProperties',
    'required',
    'dependentRequired',
  ],
  applicator: [
    'prefixItems',
    'items',
    'additionalItems',
    'contains',
    'additionalProperties',
    'properties',
    'patternProperties',
    'dependentSchemas',
    'propertyNames',
    'if',
    'then',
    'else',
    'allOf',
    'anyOf',
    'oneOf',
    'not',
  ],
  unevaluated: ['unevaluatedItems', 'unevaluatedProperties'],
};
const KNOWN_VOCABULARIES = [
  'core',
  'applicator',
  'unevaluated',
  'validation',
  'meta-data',
  'format',
  'format-annotation',
  'format-assertion',
  'content',
];

// The keywords a "$vocabulary" of `draft` leaves out: the ones of the vocabularies it does not list. In 2019-09 the
// unevaluated keywords belong to the applicator vocabulary. An unknown vocabulary is ignored when it is optional
// (false), and throws when it is required.
function ignoredKeywords(vocabulary, draft) {
  const prefix = `https://json-schema.org/draft/${draft}/vocab/`;
  const listed = new Set();
  Object.entries(vocabulary).forEach(([uri, isRequired]) => {
    const name = uri.startsWith(prefix) ? uri.slice(prefix.length) : undefined;
    if (name !== undefined && KNOWN_VOCABULARIES.includes(name)) {
      listed.add(name);
    } else if (isRequired === true) {
      throw new Error(`Unsupported JSON Schema: the meta-schema requires the vocabulary "${uri}"`);
    }
  });
  const ignored = new Set();
  Object.entries(VOCABULARY_KEYWORDS).forEach(([name, keywords]) => {
    const owner = draft === '2019-09' && name === 'unevaluated' ? 'applicator' : name;
    if (!listed.has(owner)) {
      keywords.forEach((keyword) => ignored.add(keyword));
    }
  });
  return ignored;
}

class RefIndex {
  // `draft` is the one of the root (by default the one its "$schema" names), and of the resources that name none and
  // are not inside one that does.
  constructor(root, schemas = undefined, draft = undefined) {
    this.root = root;
    // Other documents, by URI: resolved against the URI they are registered with, unless they change it with "$id".
    const documents = documentsOf(schemas);
    // Meta-schemas that "$schema" can name, which give a draft and vocabularies.
    this.documents = new Map(documents.map(({ uri, schema }) => [uri, schema]));
    this.rootDialect = draft === undefined ? this.dialectOf(root.$schema) || { draft: 'draft-07' } : { draft };
    this.draft = this.rootDialect.draft;
    // Resource URI to its dialect: { draft, ignored } with the keywords its vocabularies leave out.
    this.dialects = new Map();
    // Documents (URIs without fragment) and anchors ("uri#name") to their schema node.
    this.resources = new Map([[DEFAULT_BASE, root]]);
    this.anchors = new Map();
    // Resource URI to its dynamic anchors: name ('' for "$recursiveAnchor") to schema node.
    this.dynamicAnchors = new Map();
    // Schema node to the base URI its references are resolved against.
    this.bases = new Map();
    // Schema node to the dialect of its resource, which the conversion asks for every node.
    this.nodeDialects = new Map();
    // Schema node to the copy of it without the keywords its vocabularies leave out.
    this.views = new Map();
    this.visit(root, DEFAULT_BASE);
    documents.forEach(({ uri, schema }) => {
      this.addResource(uri, schema);
      this.visit(schema, uri);
    });
  }

  // The dialect "$schema" names: a draft, or a meta-schema of the "schemas" option with the draft its own "$schema"
  // names and the keywords its "$vocabulary" leaves out. Undefined when it names neither.
  dialectOf(schemaUri) {
    const draft = draftOfUri(schemaUri);
    if (draft !== undefined) {
      return { draft };
    }
    const meta = typeof schemaUri === 'string' ? this.documents.get(schemaUri.replace(/#$/, '')) : undefined;
    const metaDraft = isObject(meta) ? draftOfUri(meta.$schema) : undefined;
    if (metaDraft === undefined) {
      return undefined;
    }
    const hasVocabulary = !isLegacy(metaDraft) && isObject(meta.$vocabulary);
    return {
      draft: metaDraft,
      ignored: hasVocabulary ? ignoredKeywords(meta.$vocabulary, metaDraft) : undefined,
    };
  }

  // The node as its vocabularies see it: a copy without the keywords they leave out, or the node itself.
  viewOf(node) {
    const dialect = this.nodeDialects.get(node);
    const ignored = dialect && dialect.ignored;
    if (!ignored || !Object.keys(node).some((keyword) => ignored.has(keyword))) {
      return node;
    }
    if (!this.views.has(node)) {
      this.views.set(node, Object.fromEntries(Object.entries(node).filter(([keyword]) => !ignored.has(keyword))));
    }
    return this.views.get(node);
  }

  // The first document registered for a URI keeps it.
  addResource(uri, node) {
    if (!this.resources.has(uri)) {
      this.resources.set(uri, node);
    }
  }

  addDynamicAnchor(uri, name, node) {
    if (!this.dynamicAnchors.has(uri)) {
      this.dynamicAnchors.set(uri, new Map());
    }
    const anchors = this.dynamicAnchors.get(uri);
    if (!anchors.has(name)) {
      anchors.set(name, node);
    }
  }

  // Dynamic anchors of a resource, by name.
  dynamicAnchorsOf(uri) {
    return this.dynamicAnchors.get(uri) || new Map();
  }

  // URI of the resource a node belongs to, or undefined for a node that is not indexed.
  resourceOf(node) {
    return this.bases.get(node);
  }

  // Draft of the resource a node belongs to, or undefined for a node that is not indexed.
  draftOf(node) {
    const dialect = this.nodeDialects.get(node);
    return dialect && dialect.draft;
  }

  addAnchor(anchor, node) {
    if (!this.anchors.has(anchor)) {
      this.anchors.set(anchor, node);
    }
  }

  // Indexes a node and the schemas inside it. `parentDialect` is the dialect of the resource around it; a resource
  // that names another with "$schema" uses it (the root uses the one it was given).
  visit(node, parentBase, parentDialect = this.dialects.get(parentBase) || this.rootDialect) {
    if (!isObject(node) || this.bases.has(node)) {
      return;
    }
    const dialect = node === this.root ? this.rootDialect : this.dialectOf(node.$schema) || parentDialect;
    const { draft } = dialect;
    let base = parentBase;
    // Up to draft-07 every keyword next to "$ref" is ignored, "$id" included.
    const id = node[idKeyword(draft)];
    if (typeof id === 'string' && (node.$ref === undefined || !isLegacy(draft))) {
      const uri = resolveUri(id, parentBase);
      if (uri !== undefined) {
        const [document, fragment] = splitFragment(uri);
        const anchor = `${document}#${decode(fragment)}`;
        if (fragment === '') {
          base = document;
          this.addResource(document, node);
        } else {
          this.addAnchor(anchor, node);
        }
      }
    }
    if (!this.dialects.has(base)) {
      this.dialects.set(base, dialect);
    }
    // Anchors of the later drafts name the node within the resource of its base URI.
    if (!isLegacy(draft) && typeof node.$anchor === 'string') {
      this.addAnchor(`${base}#${node.$anchor}`, node);
    }
    if (draft === '2020-12' && typeof node.$dynamicAnchor === 'string') {
      this.addAnchor(`${base}#${node.$dynamicAnchor}`, node);
      this.addDynamicAnchor(base, node.$dynamicAnchor, node);
    }
    if (draft === '2019-09' && node.$recursiveAnchor === true && this.resources.get(base) === node) {
      this.addDynamicAnchor(base, '', node);
    }
    this.bases.set(node, base);
    this.nodeDialects.set(node, this.dialects.get(base));
    // Plain loops: every node of every schema goes through here when compiling.
    for (let i = 0; i < SCHEMA_KEYWORDS.length; i += 1) {
      const child = node[SCHEMA_KEYWORDS[i]];
      if (child !== undefined) {
        this.visit(child, base, dialect);
      }
    }
    for (let i = 0; i < SCHEMA_MAP_KEYWORDS.length; i += 1) {
      const map = node[SCHEMA_MAP_KEYWORDS[i]];
      if (isObject(map)) {
        const keys = Object.keys(map);
        for (let j = 0; j < keys.length; j += 1) {
          this.visit(map[keys[j]], base, dialect);
        }
      }
    }
    for (let i = 0; i < SCHEMA_LIST_KEYWORDS.length; i += 1) {
      const list = node[SCHEMA_LIST_KEYWORDS[i]];
      if (Array.isArray(list)) {
        for (let j = 0; j < list.length; j += 1) {
          this.visit(list[j], base, dialect);
        }
      }
    }
  }

  // The document `ref`, resolved against the base URI of `node`, points to when it is not registered: the one to load
  // for it to resolve. Undefined when it is registered, or relative to a document without "$id".
  missingDocument(node, ref) {
    const uri = resolveUri(ref, this.bases.get(node) ?? DEFAULT_BASE);
    if (uri === undefined) {
      return undefined;
    }
    const [document] = splitFragment(uri);
    const isKnown = this.resources.has(document) || new URL(document).protocol === new URL(DEFAULT_BASE).protocol;
    return isKnown ? undefined : document;
  }

  // Schema node that `ref` (by default the "$ref" of `node`), resolved against the base URI of `node`, points to, or
  // undefined when it is not in this document.
  resolve(node, ref = node.$ref) {
    const uri = resolveUri(ref, this.bases.get(node) ?? DEFAULT_BASE);
    if (uri === undefined) {
      return undefined;
    }
    const [document, rawFragment] = splitFragment(uri);
    const fragment = decode(rawFragment);
    if (fragment === undefined) {
      return undefined;
    }
    let target;
    if (fragment === '' || fragment.startsWith('/')) {
      const resource = this.resources.get(document);
      target = resource === undefined ? undefined : followPointer(resource, fragment);
      if (target !== undefined) {
        // A pointer can reach a node that was not indexed as a schema; its references resolve against the document.
        this.visit(target, document);
      }
    } else {
      target = this.anchors.get(`${document}#${fragment}`);
    }
    return target;
  }
}

module.exports = {
  RefIndex,
  draftOfUri,
  isLegacy,
  documentsOf,
};

},
"@xufa/schema/src/json-schema.js": function (module, exports, require) {
const { Schema } = require('./schema');
const { compileType } = require('./compile');
const { RefIndex, isLegacy, documentsOf } = require('./json-schema-refs');
const { UnevaluatedType } = require('./unevaluated');
const { KeywordType, KEYWORD_TYPE_TESTS } = require('./types/keyword');
const { CoerceType, COERCIBLE, coerceSpecOf } = require('./coerce');
const { FORMATS, FORMAT_COMPARES, isRfc1123Hostname } = require('./formats');

const {
  AllOfType,
  AnyOfType,
  AnyType,
  ArrayOfType,
  BooleanType,
  ConditionalType,
  FloatType,
  IntegerType,
  NeverType,
  NotType,
  OneOfType,
  RefType,
  StringType,
  ValuesType,
  WhenType,
} = require('./types');

const DRAFTS = ['draft-04', 'draft-06', 'draft-07', '2019-09', '2020-12'];

const ANNOTATIONS = [
  '$schema',
  '$id',
  '$comment',
  'title',
  'description',
  'default',
  'examples',
  'format',
  'readOnly',
  'writeOnly',
  'deprecated',
  'nullable',
  'contentMediaType',
  'contentEncoding',
  'contentSchema',
  // Only used through "$ref"; "$defs" is also accepted in draft-07.
  'definitions',
  '$defs',
];

// Keywords that only exist in some drafts, as annotations or checked by the code below: "id" changes the base URI in
// draft-04, as "$id" does later.
const ANNOTATIONS_04 = ['id'];
const ANNOTATIONS_2019 = ['$anchor', '$vocabulary', '$recursiveAnchor'];
const ANNOTATIONS_2020 = ['$dynamicAnchor'];

// Keywords of the later drafts that are not supported yet: they throw rather than being ignored.
const NOT_SUPPORTED_YET = [];

// Keywords that reference another schema, in each draft: "$recursiveRef" (2019-09) and "$dynamicRef" (2020-12) pick
// their target among the schema resources being evaluated (see resolveTarget()).
const REF_KEYWORDS = {
  'draft-04': ['$ref'],
  'draft-06': ['$ref'],
  'draft-07': ['$ref'],
  '2019-09': ['$ref', '$recursiveRef'],
  '2020-12': ['$ref', '$dynamicRef'],
};

// Keywords that exist only in some drafts, with the drafts that have them.
const DRAFT_KEYWORDS = {
  const: ['draft-06', 'draft-07', '2019-09', '2020-12'],
  contains: ['draft-06', 'draft-07', '2019-09', '2020-12'],
  propertyNames: ['draft-06', 'draft-07', '2019-09', '2020-12'],
  if: ['draft-07', '2019-09', '2020-12'],
  then: ['draft-07', '2019-09', '2020-12'],
  else: ['draft-07', '2019-09', '2020-12'],
  additionalItems: ['draft-04', 'draft-06', 'draft-07', '2019-09'],
  dependentRequired: ['2019-09', '2020-12'],
  dependentSchemas: ['2019-09', '2020-12'],
  minContains: ['2019-09', '2020-12'],
  maxContains: ['2019-09', '2020-12'],
  prefixItems: ['2020-12'],
  unevaluatedProperties: ['2019-09', '2020-12'],
  unevaluatedItems: ['2019-09', '2020-12'],
};

const TYPED_KEYWORDS = {
  properties: 'object',
  patternProperties: 'object',
  dependencies: 'object',
  propertyNames: 'object',
  dependentRequired: 'object',
  dependentSchemas: 'object',
  contains: 'array',
  minContains: 'array',
  maxContains: 'array',
  prefixItems: 'array',
  additionalItems: 'array',
  unevaluatedItems: 'array',
  required: 'object',
  additionalProperties: 'object',
  unevaluatedProperties: 'object',
  minProperties: 'object',
  maxProperties: 'object',
  items: 'array',
  minItems: 'array',
  maxItems: 'array',
  uniqueItems: 'array',
  minLength: 'string',
  maxLength: 'string',
  pattern: 'string',
  minimum: 'number',
  maximum: 'number',
  exclusiveMinimum: 'number',
  exclusiveMaximum: 'number',
  multipleOf: 'number',
  // Of ajv-formats: limits of the values of a format that can be compared (see formatLimitsOf()).
  formatMinimum: 'string',
  formatMaximum: 'string',
  formatExclusiveMinimum: 'string',
  formatExclusiveMaximum: 'string',
};

const FORMAT_LIMIT_KEYWORDS = ['formatMinimum', 'formatMaximum', 'formatExclusiveMinimum', 'formatExclusiveMaximum'];

const UNTYPED_KEYWORDS = [
  'type',
  'enum',
  'const',
  'anyOf',
  'oneOf',
  'not',
  'allOf',
  'if',
  'then',
  'else',
  // OpenAPI: which "oneOf" schema applies, by the value of a property (see discriminatorOf()).
  'discriminator',
];

const TYPE_NAMES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];

// State of the conversion in progress: the draft, the reference index of the document, the types converted for
// reference targets, and the references still to resolve.
let context;

function getTypeNames(json) {
  if (json.type === undefined) {
    return [];
  }
  return Array.isArray(json.type) ? json.type : [json.type];
}

// For each draft, its standard annotations and the keywords that check something (reference keywords are handled
// apart), as sets: every keyword of every node is looked up in them.
const ANNOTATIONS_OF = Object.fromEntries(
  DRAFTS.map((draft) => [
    draft,
    new Set([
      ...ANNOTATIONS,
      ...(draft === 'draft-04' ? ANNOTATIONS_04 : []),
      ...(isLegacy(draft) ? [] : ANNOTATIONS_2019),
      ...(draft === '2020-12' ? ANNOTATIONS_2020 : []),
    ]),
  ])
);
const ASSERTIONS_OF = Object.fromEntries(
  DRAFTS.map((draft) => [
    draft,
    new Set(
      [...Object.keys(TYPED_KEYWORDS), ...UNTYPED_KEYWORDS].filter(
        (keyword) => !DRAFT_KEYWORDS[keyword] || DRAFT_KEYWORDS[keyword].includes(draft)
      )
    ),
  ])
);

// Whether a keyword is an annotation in `draft`: one of the standard ones, or one the option "keywords" declares.
function isAnnotation(keyword, draft) {
  return ANNOTATIONS_OF[draft].has(keyword) || context.annotations.has(keyword);
}

// Whether a keyword checks something in `draft`: a standard one, or one of your own (the option "keywords").
function isAssertion(keyword, draft) {
  return ASSERTIONS_OF[draft].has(keyword) || context.custom.has(keyword);
}

// Whether a keyword is ignored in `draft`: an annotation, or with strict: false one that checks nothing in it (an
// unknown keyword, or one of another draft), as the JSON Schema standard reads it.
function isIgnored(keyword, draft) {
  return isAnnotation(keyword, draft) || (!context.strict && !isAssertion(keyword, draft));
}

function checkKeywords(json, path) {
  const typeNames = getTypeNames(json);
  typeNames.forEach((typeName) => {
    if (!TYPE_NAMES.includes(typeName)) {
      throw new Error(`Unsupported JSON Schema type "${typeName}" at ${path}`);
    }
  });
  // With the option "formats", a format it does not name is most likely a mistake, as in ajv's strict mode.
  if (
    context.strict &&
    context.knownFormats &&
    typeof json.format === 'string' &&
    !context.knownFormats.has(json.format)
  ) {
    throw new Error(
      `Unknown JSON Schema format "${json.format}" at ${path}: name it in the option "formats" ({ "${json.format}": false } leaves it unchecked), or use strict: false`
    );
  }
  const { draft } = context;
  Object.keys(json).forEach((keyword) => {
    if (isIgnored(keyword, draft)) {
      return;
    }
    if (NOT_SUPPORTED_YET.includes(keyword)) {
      throw new Error(`JSON Schema keyword "${keyword}" at ${path} is not supported yet`);
    }
    if (!isAssertion(keyword, draft)) {
      throw new Error(`Unsupported JSON Schema keyword "${keyword}" at ${path}`);
    }
    // Without "type" a keyword only applies to values of its type. With a "type" that excludes it, the keyword could
    // never apply, which is most likely a mistake (with strict: false it is ignored, as the standard says).
    const requiredType = TYPED_KEYWORDS[keyword];
    const isDeclared = typeNames.includes(requiredType) || (requiredType === 'number' && typeNames.includes('integer'));
    if (requiredType && context.strict && typeNames.length > 0 && !isDeclared) {
      throw new Error(`JSON Schema keyword "${keyword}" at ${path} requires "type": "${requiredType}"`);
    }
  });
}

// The draft of a schema: options.draft, or the one its "$schema" names. Without either, or with another "$schema",
// the schema is read as draft-07, as before later drafts were supported.
// The formats to check, from the option "formats": true for every built-in one, a list of built-in names, or an object
// with, for each name, true (the built-in one), a regular expression, a function, or false (a format that is known but
// not checked, as ajv's addFormat(name, true)). By name, the check: a function or a regular expression. Without the
// option, "format" is an annotation and nothing is checked.
// Also { checks, compares, known }: the comparisons of the formats whose values can be compared (the built-in date,
// time and date-time, and formats of your own given as { validate, compare }), for formatMinimum and the like; and
// with the option, the names it gives, checked or not (with strict: true another format throws).
function formatsOf(option) {
  const checks = new Map();
  const compares = new Map();
  if (option === undefined || option === false) {
    return { checks, compares, known: undefined };
  }
  const known = new Set();
  const isCheck = (check) => check instanceof RegExp || typeof check === 'function';
  const addBuiltIn = (name) => {
    if (!Object.prototype.hasOwnProperty.call(FORMATS, name)) {
      throw new Error(
        `Unsupported JSON Schema option "formats": "${name}" is not one of ${Object.keys(FORMATS).join(', ')}`
      );
    }
    checks.set(name, FORMATS[name]);
    if (FORMAT_COMPARES[name]) {
      compares.set(name, FORMAT_COMPARES[name]);
    }
  };
  if (option === true) {
    Object.keys(FORMATS).forEach(addBuiltIn);
  } else if (Array.isArray(option)) {
    option.forEach(addBuiltIn);
  } else if (option !== null && typeof option === 'object') {
    Object.entries(option).forEach(([name, check]) => {
      if (check === true) {
        addBuiltIn(name);
      } else if (isCheck(check)) {
        checks.set(name, check);
      } else if (check !== null && typeof check === 'object' && isCheck(check.validate)) {
        if (check.compare !== undefined && typeof check.compare !== 'function') {
          throw new Error(`Unsupported JSON Schema option "formats": the "compare" of "${name}" must be a function`);
        }
        checks.set(name, check.validate);
        if (check.compare) {
          compares.set(name, check.compare);
        }
      } else if (check !== false) {
        throw new Error(
          `Unsupported JSON Schema option "formats": "${name}" must be true, false, a regular expression, a function or { validate, compare }`
        );
      }
      known.add(name);
    });
  } else {
    throw new Error('Unsupported JSON Schema option "formats": expected true, a list of names or an object');
  }
  checks.forEach((check, name) => known.add(name));
  return { checks, compares, known };
}

// Every built-in format, as the option "formats" takes them ({ date: true, ... }), to add formats of your own or known
// ones left unchecked: formats: { ...builtInFormats(), int32: false }.
function builtInFormats() {
  return Object.fromEntries(Object.keys(FORMATS).map((name) => [name, true]));
}

// The limits of the value of the format of a node (formatMinimum, formatMaximum, formatExclusiveMinimum and
// formatExclusiveMaximum, of ajv-formats) as [{ keyword, limit, compare }]. As in ajv they need "format", and are
// checked only when the format is (else they are ignored, like it), which must then be one whose values can be
// compared. A limit must be a valid value of the format.
function formatLimitsOf(json, check, path) {
  return FORMAT_LIMIT_KEYWORDS.filter((keyword) => json[keyword] !== undefined).flatMap((keyword) => {
    const at = `Unsupported JSON Schema at ${path}: "${keyword}"`;
    if (json.format === undefined) {
      throw new Error(`${at} requires "format"`);
    }
    if (check === undefined) {
      return [];
    }
    const compare = context.formatCompares.get(json.format);
    if (compare === undefined) {
      throw new Error(`${at}: the values of the format "${json.format}" cannot be compared`);
    }
    const limit = json[keyword];
    const isValue = typeof limit === 'string' && (check instanceof RegExp ? check.test(limit) : check(limit));
    if (!isValue) {
      throw new Error(`${at} must be a valid ${json.format}`);
    }
    return [{ keyword, limit, compare }];
  });
}

// The format a node asks the strings to have, as options of StringType: none when "format" is not checked (the option
// "formats" does not name it, as with an unknown format, which is an annotation).
function formatOf(json, path) {
  let check = typeof json.format === 'string' ? context.formats.get(json.format) : undefined;
  // Up to draft-06 a host name follows RFC 1123 alone.
  if (check === FORMATS.hostname && (context.draft === 'draft-04' || context.draft === 'draft-06')) {
    check = isRfc1123Hostname;
  }
  const formatLimits = formatLimitsOf(json, check, path);
  return check === undefined ? {} : { format: json.format, formatCheck: check, formatLimits };
}

function draftOf(options) {
  if (options.draft !== undefined && !DRAFTS.includes(options.draft)) {
    throw new Error(`Unsupported JSON Schema option "draft": "${options.draft}" is not one of ${DRAFTS.join(', ')}`);
  }
  return options.draft;
}

// The option "useDefaults": true assigns the "default" of missing properties and tuple elements, 'empty' also the one
// of null and '' (see collectDefaults()).
function useDefaultsOf(options) {
  const { useDefaults = false } = options;
  if (useDefaults !== true && useDefaults !== false && useDefaults !== 'empty') {
    throw new Error('Unsupported JSON Schema option "useDefaults": expected true, false or \'empty\'');
  }
  return useDefaults;
}

// The option "multipleOfPrecision": a number of decimal digits; "multipleOf" then accepts a value whose division is
// within 1e-multipleOfPrecision of an integer, so 0.3 is a multiple of 0.1 (see FloatType.isMultiple()).
function multipleOfPrecisionOf(options) {
  const { multipleOfPrecision } = options;
  if (multipleOfPrecision !== undefined && !(Number.isInteger(multipleOfPrecision) && multipleOfPrecision > 0)) {
    throw new Error('Unsupported JSON Schema option "multipleOfPrecision": expected a positive integer');
  }
  return multipleOfPrecision;
}

// The option "coerceTypes": true converts values to the types "type" asks for (see coerce.js), 'array' also to and from
// arrays.
function coerceTypesOf(options) {
  const { coerceTypes = false } = options;
  if (coerceTypes !== true && coerceTypes !== false && coerceTypes !== 'array') {
    throw new Error('Unsupported JSON Schema option "coerceTypes": expected true, false or \'array\'');
  }
  return coerceTypes;
}

// The option "removeAdditional": true removes the additional properties where "additionalProperties" is false, 'all'
// every additional property of a schema with "properties" or "additionalProperties", and 'failing' also the ones that
// fail "additionalProperties" (see removalOf()).
function removeAdditionalOf(options) {
  const { removeAdditional = false } = options;
  if (![true, false, 'all', 'failing'].includes(removeAdditional)) {
    throw new Error("Unsupported JSON Schema option \"removeAdditional\": expected true, false, 'all' or 'failing'");
  }
  return removeAdditional;
}

// The option "strict": true (default) throws on unknown keywords, false ignores them.
function strictOf(options) {
  if (options.strict !== undefined && typeof options.strict !== 'boolean') {
    throw new Error('Unsupported JSON Schema option "strict": expected true or false');
  }
  return options.strict !== false;
}

// Every keyword of JSON Schema, which a keyword of your own cannot redefine.
const STANDARD_KEYWORDS = new Set([
  ...DRAFTS.flatMap((draft) => [...ANNOTATIONS_OF[draft], ...ASSERTIONS_OF[draft], ...REF_KEYWORDS[draft]]),
]);
// JSON types the definitions of macro keywords can take: the ones a WhenType tells apart.
const MACRO_TYPES = ['object', 'array', 'string', 'number'];

// A definition of a keyword of your own, checked, with its JSON types as a list (`types`, or undefined for all).
function keywordDefinitionOf(definition) {
  const at = 'Unsupported JSON Schema option "keywords":';
  if (definition === null || typeof definition !== 'object' || typeof definition.keyword !== 'string') {
    throw new Error(`${at} expected keyword names, or definitions with "keyword"`);
  }
  const { keyword, type, message } = definition;
  if (STANDARD_KEYWORDS.has(keyword)) {
    throw new Error(`${at} "${keyword}" is a keyword of JSON Schema`);
  }
  const ways = ['validate', 'compile', 'macro'].filter((way) => definition[way] !== undefined);
  if (ways.length !== 1 || typeof definition[ways[0]] !== 'function') {
    throw new Error(`${at} "${keyword}" needs one function: "validate", "compile" or "macro"`);
  }
  const types = type === undefined ? undefined : [].concat(type);
  const allowed = definition.macro ? MACRO_TYPES : Object.keys(KEYWORD_TYPE_TESTS);
  if (types !== undefined && (types.length === 0 || !types.every((name) => allowed.includes(name)))) {
    throw new Error(`${at} the "type" of "${keyword}" must be one or more of ${allowed.join(', ')}`);
  }
  if (message !== undefined && typeof message !== 'string' && typeof message !== 'function') {
    throw new Error(`${at} the "message" of "${keyword}" must be a string or a function`);
  }
  return { ...definition, types };
}

// The option "keywords": names of keywords of your own that are annotations, such as "x-internal" or "example", and
// definitions of keywords of your own that check values (see keywordDefinitionOf()).
function keywordsOf(options) {
  const { keywords = [] } = options;
  if (!Array.isArray(keywords)) {
    throw new Error('Unsupported JSON Schema option "keywords": expected a list of keyword names or definitions');
  }
  const annotations = new Set();
  const custom = new Map();
  keywords.forEach((item) => {
    if (typeof item === 'string') {
      annotations.add(item);
    } else {
      const definition = keywordDefinitionOf(item);
      custom.set(definition.keyword, definition);
    }
  });
  return { annotations, custom };
}

// The draft of a node: the one of its resource, or the one being converted for a node that is not indexed.
const draftOfNode = (json) => context.index.draftOf(json) || context.draft;

// The reference keywords of a node, in its draft.
const NO_KEYWORDS = [];
const refKeywordsOf = (json) =>
  json.$ref === undefined && json.$dynamicRef === undefined && json.$recursiveRef === undefined
    ? NO_KEYWORDS
    : REF_KEYWORDS[draftOfNode(json)].filter((keyword) => json[keyword] !== undefined);

// The keywords of a node other than its references, which later drafts apply next to them; undefined when there are
// none but ignored ones.
function besideRef(json) {
  const draft = draftOfNode(json);
  const rest = { ...json };
  REF_KEYWORDS[draft].forEach((keyword) => delete rest[keyword]);
  return Object.keys(rest).every((keyword) => isIgnored(keyword, draft)) ? undefined : rest;
}

// The node as the conversion reads it: without the keywords its vocabularies leave out and, with strict: false,
// without the keywords of other drafts, which would otherwise be read (with strict: true they throw).
function viewOf(node) {
  const view = context.index.viewOf(node);
  if (context.strict) {
    return view;
  }
  const draft = draftOfNode(node);
  const isOther = (keyword) => DRAFT_KEYWORDS[keyword] !== undefined && !DRAFT_KEYWORDS[keyword].includes(draft);
  if (!Object.keys(view).some(isOther)) {
    return view;
  }
  if (!context.views.has(node)) {
    context.views.set(node, Object.fromEntries(Object.entries(view).filter(([keyword]) => !isOther(keyword))));
  }
  return context.views.get(node);
}

// Dynamic scope: the schema resources being evaluated, from the outermost. What dynamic references need of it is,
// for each dynamic anchor name, the outermost resource that declares it; a scope holds that, with a key naming it.
// Scopes only grow, and there are few of them, so each schema is converted once for each scope it is reached in.
// A scope also remembers the scope entering each resource gives (`next`), so that is worked out once.
const newScope = (key, anchors) => ({ key, anchors, next: new Map() });

// The scope after entering the resource `uri` (undefined for a node that is not indexed, which changes nothing).
// Without dynamic anchors in the schema, the scope never changes.
function enter(scope, uri) {
  if (uri === undefined) {
    return scope;
  }
  if (!scope.next.has(uri)) {
    const added = [...context.index.dynamicAnchorsOf(uri).keys()].filter((name) => !scope.anchors.has(name));
    if (added.length === 0) {
      scope.next.set(uri, scope);
    } else {
      const anchors = new Map(scope.anchors);
      added.forEach((name) => anchors.set(name, uri));
      const key = [...anchors].map(([name, resource]) => `${name}=${resource}`).join('\n');
      // Scopes with the same anchors are the same scope, whichever way they were reached.
      if (!context.scopes.has(key)) {
        context.scopes.set(key, newScope(key, anchors));
      }
      scope.next.set(uri, context.scopes.get(key));
    }
  }
  return scope.next.get(uri);
}

// The scope after entering the resource of `node`. Without dynamic anchors in the schema, the scope never changes, and
// the resource is not looked up.
const enterNode = (scope, node) =>
  context.index.dynamicAnchors.size === 0 ? scope : enter(scope, context.index.resourceOf(node));

// The name of the anchor a reference points to ("#name" or "uri#name"), or undefined for a JSON pointer or none.
function anchorName(ref) {
  const index = ref.indexOf('#');
  if (index === -1) {
    return undefined;
  }
  const name = ref.slice(index + 1);
  if (name === '' || name.startsWith('/')) {
    return undefined;
  }
  try {
    return decodeURIComponent(name);
  } catch (e) {
    return undefined;
  }
}

// The schema node a reference keyword of `json` points to in `scope`, or undefined when it does not resolve. A
// "$dynamicRef" that first resolves to a "$dynamicAnchor" of the same name, or a "$recursiveRef" that first resolves
// to a resource with "$recursiveAnchor": true, points to the outermost resource of the scope with that anchor.
function resolveTarget(json, keyword, scope) {
  const { index } = context;
  if (keyword === '$ref') {
    return index.resolve(json);
  }
  const initial = index.resolve(json, keyword === '$recursiveRef' ? '#' : json[keyword]);
  const isObject = initial !== null && typeof initial === 'object';
  let name;
  if (keyword === '$dynamicRef') {
    name = anchorName(json.$dynamicRef);
    if (name === undefined || !isObject || initial.$dynamicAnchor !== name) {
      return initial;
    }
  } else {
    name = '';
    if (!isObject || initial.$recursiveAnchor !== true) {
      return initial;
    }
  }
  const resource = scope.anchors.get(name);
  return resource === undefined ? initial : index.dynamicAnchorsOf(resource).get(name);
}

// The keywords of your own a node has.
const customKeywordsOf = (json) =>
  context.custom.size === 0 ? NO_KEYWORDS : Object.keys(json).filter((keyword) => context.custom.has(keyword));

// What a keyword of your own gives for a node (`json` is its view), worked out once: the schema its macro returns, or
// the function checking a value, from "compile" or "validate".
function customPartOf(node, json, keyword) {
  if (!context.customParts.has(node)) {
    context.customParts.set(node, new Map());
  }
  const parts = context.customParts.get(node);
  if (!parts.has(keyword)) {
    const definition = context.custom.get(keyword);
    const value = json[keyword];
    const it = { draft: context.draft };
    let part;
    if (definition.macro) {
      part = definition.macro(value, json, it);
    } else if (definition.compile) {
      part = definition.compile(value, json, it);
      if (typeof part !== 'function' && !(part instanceof RegExp)) {
        throw new Error(
          `Unsupported JSON Schema: the "compile" of keyword "${keyword}" must return a function or a regular expression`
        );
      }
    } else {
      part = (data) => definition.validate(value, data, json);
    }
    parts.set(keyword, part);
  }
  return parts.get(keyword);
}

// null is valid only if every constraint of the node accepts it. `seen` stops at reference cycles, which give no
// value that accepts null.
function acceptsNull(json, seen = new Set(), outerScope = context.scope) {
  if (json === true) {
    return true;
  }
  if (json === false || json === null || typeof json !== 'object') {
    return false;
  }
  // The node is checked in the scope of its resource, like convert() converts it, and as its vocabularies see it.
  const scope = enterNode(outerScope, json);
  const view = viewOf(json);
  const refKeywords = refKeywordsOf(json);
  if (refKeywords.length > 0) {
    if (seen.has(json)) {
      return false;
    }
    // `seen` holds the references being followed, so a target reached again through another path is not a cycle.
    seen.add(json);
    // Up to draft-07 only "$ref" counts, and the keywords next to it are ignored.
    const followed = isLegacy(draftOfNode(json)) ? ['$ref'] : refKeywords;
    const result = followed.every((keyword) => {
      const target = resolveTarget(json, keyword, scope);
      return target !== undefined && acceptsNull(target, seen, scope);
    });
    seen.delete(json);
    const rest = isLegacy(draftOfNode(json)) ? undefined : besideRef(view);
    return result && (rest === undefined || acceptsNull(rest, seen, scope));
  }
  if (view.nullable === true) {
    return true;
  }
  const checks = [];
  if (view.type !== undefined) {
    checks.push(getTypeNames(view).includes('null'));
  }
  if (view.enum) {
    checks.push(view.enum.includes(null));
  }
  if ('const' in view) {
    checks.push(view.const === null);
  }
  if (view.anyOf) {
    checks.push(view.anyOf.some((item) => acceptsNull(item, seen, scope)));
  }
  if (view.oneOf) {
    checks.push(view.oneOf.filter((item) => acceptsNull(item, seen, scope)).length === 1);
  }
  if (view.not !== undefined) {
    checks.push(!acceptsNull(view.not, seen, scope));
  }
  if (view.allOf) {
    checks.push(view.allOf.every((item) => acceptsNull(item, seen, scope)));
  }
  if (view.if !== undefined) {
    const branch = acceptsNull(view.if, seen, scope) ? view.then : view.else;
    checks.push(branch === undefined || acceptsNull(branch, seen, scope));
  }
  // Keywords of your own that check null: the schema of a macro, or the check itself.
  customKeywordsOf(view).forEach((keyword) => {
    const definition = context.custom.get(keyword);
    if (definition.types === undefined || definition.types.includes('null')) {
      const part = customPartOf(json, view, keyword);
      checks.push(definition.macro ? acceptsNull(part, seen, scope) : Boolean(part(null)));
    }
  });
  return checks.every(Boolean);
}

// Inner types of a combination only check non-null values: the outer type owns mandatory/nullable.
function asInner(type) {
  type.isMandatory = false;
  type.isNullable = true;

  return type;
}

function combine(types, Type) {
  if (types.length === 0) {
    return new AnyType();
  }
  if (types.length === 1) {
    return types[0];
  }
  return new Type({ types: types.map(asInner) });
}

let convert;

function requiredDependency(key, dependency, path) {
  if (!Array.isArray(dependency) || !dependency.every((property) => typeof property === 'string')) {
    throw new Error(`Unsupported JSON Schema at ${path}: expected property names`);
  }
  return { key, required: dependency };
}

// A list of required properties, or a schema the whole object must satisfy, for each key: from "dependencies", and
// from "dependentRequired" and "dependentSchemas", which split it in two from draft 2019-09 on.
function convertDependencies(json, path) {
  const dependencies = json.dependencies || {};
  const dependentRequired = json.dependentRequired || {};
  const dependentSchemas = json.dependentSchemas || {};
  return [
    ...Object.keys(dependencies).map((key) => {
      const dependency = dependencies[key];
      const at = `${path}.dependencies.${key}`;
      return Array.isArray(dependency)
        ? requiredDependency(key, dependency, at)
        : { key, type: asInner(convert(dependency, at)) };
    }),
    ...Object.keys(dependentRequired).map((key) =>
      requiredDependency(key, dependentRequired[key], `${path}.dependentRequired.${key}`)
    ),
    ...Object.keys(dependentSchemas).map((key) => ({
      key,
      type: asInner(convert(dependentSchemas[key], `${path}.dependentSchemas.${key}`)),
    })),
  ];
}

// With useDefaults, the defaults of the schemas `items` (the "properties" of an object, by key, or the positions of a
// tuple) as [{ key, value, empty }]. As in ajv, defaults inside "anyOf", "oneOf", "not" and "if" (directly or through
// "$ref") are not assigned, as those schemas may not apply: with strict: true they throw.
function collectDefaults(items, keys, path) {
  if (!context.useDefaults) {
    return [];
  }
  const empty = context.useDefaults === 'empty';
  return keys
    .filter((key) => {
      const item = items[key];
      return item !== null && typeof item === 'object' && !Array.isArray(item) && item.default !== undefined;
    })
    .filter((key) => {
      if (context.composite === 0) {
        return true;
      }
      if (context.strict) {
        throw new Error(
          `Unsupported JSON Schema at ${path}: "default" of "${key}" is ignored inside "anyOf", "oneOf", "not" and "if" (useDefaults); use strict: false to ignore it`
        );
      }
      return false;
    })
    .map((key) => {
      if (key === '__proto__') {
        throw new Error(`Unsupported JSON Schema at ${path}: "default" of "__proto__" (useDefaults)`);
      }
      return { key, value: items[key].default, empty };
    });
}

// What removeAdditional does with the additional properties of an object schema: 'delete' them all, delete the
// 'failing' ones, or nothing (undefined), as in ajv.
function removalOf(json) {
  const mode = context.removeAdditional;
  const { additionalProperties } = json;
  if (mode === 'all' && (json.properties !== undefined || additionalProperties !== undefined)) {
    return 'delete';
  }
  if (mode && additionalProperties === false) {
    return 'delete';
  }
  const isSchema = additionalProperties !== null && typeof additionalProperties === 'object';
  return mode === 'failing' && isSchema ? 'failing' : undefined;
}

// Converts the schemas of a keyword that may not apply ("anyOf", "oneOf", "not" and "if"), where defaults are not
// assigned.
function inComposite(convertIt) {
  context.composite += 1;
  try {
    return convertIt();
  } finally {
    context.composite -= 1;
  }
}

function convertObject(json, path) {
  const properties = json.properties || {};
  const required = json.required || [];
  const { additionalProperties } = json;
  const additionalType =
    additionalProperties !== undefined && typeof additionalProperties === 'object'
      ? convert(additionalProperties, `${path}.additionalProperties`)
      : undefined;
  // No prototype: keys such as __proto__ or toString must be plain entries.
  const definition = Object.create(null);
  Object.keys(properties).forEach((key) => {
    definition[key] = convert(properties[key], `${path}.properties.${key}`, required.includes(key));
  });
  const patternProperties = json.patternProperties || {};
  const patternTypes = Object.keys(patternProperties).map((source) => ({
    pattern: new RegExp(source, 'u'),
    type: convert(patternProperties[source], `${path}.patternProperties.${source}`),
  }));
  // A key only "required" names must be present; its value is an additional property unless a pattern matches it, so
  // it satisfies "additionalProperties" (with false, the object is never valid).
  // With removeAdditional, it only has to be present, as in ajv, which checks "required" before removing the
  // additional properties: the key is then checked, and maybe removed, as one of them.
  const removal = removalOf(json);
  required
    .filter((key) => !Object.prototype.hasOwnProperty.call(definition, key))
    .forEach((key) => {
      const isAdditional =
        !removal && additionalProperties !== undefined && !patternTypes.some(({ pattern }) => pattern.test(key));
      definition[key] = isAdditional
        ? convert(additionalProperties, `${path}.additionalProperties`)
        : new AnyType({ isNullable: true });
    });
  const schema = new Schema(definition, {
    isOpen: additionalProperties !== false,
    additionalType,
    patternTypes,
    dependencies: convertDependencies(json, path),
    propertyNameType:
      json.propertyNames === undefined ? undefined : convert(json.propertyNames, `${path}.propertyNames`),
    minProperties: json.minProperties,
    maxProperties: json.maxProperties,
    defaults: collectDefaults(properties, Object.keys(properties), `${path}.properties`),
    removeAdditional: removal,
  });
  // For "unevaluatedProperties": the keys "properties" names (the schema also declares the ones only "required"
  // names), and whether "additionalProperties" evaluates every other key, as it does even when it is true.
  schema.propertyKeys = Object.keys(properties);
  schema.evaluatesAllKeys = additionalProperties !== undefined;
  return schema;
}

const tuple = (items, keyword, path) => items.map((item, i) => convert(item, `${path}.${keyword}[${i}]`, false));

function convertArray(json, path) {
  const { items } = json;
  let type;
  let additionalType;
  if (context.draft === '2020-12') {
    // "prefixItems" is the tuple, and "items" the type of the elements after it (or of all of them).
    if (Array.isArray(items)) {
      throw new Error(`Unsupported JSON Schema at ${path}: in draft 2020-12 "items" is a schema; use "prefixItems"`);
    }
    const rest = items === undefined ? undefined : convert(items, `${path}.items`);
    if (json.prefixItems !== undefined) {
      if (!Array.isArray(json.prefixItems)) {
        throw new Error(`Unsupported JSON Schema at ${path}: "prefixItems" must be an array`);
      }
      type = tuple(json.prefixItems, 'prefixItems', path);
      additionalType = rest;
    } else {
      type = rest;
    }
  } else {
    if (Array.isArray(items)) {
      type = tuple(items, 'items', path);
    } else if (items !== undefined) {
      type = convert(items, `${path}.items`);
    }
    // Only used after the positions of an items array.
    additionalType =
      Array.isArray(items) && json.additionalItems !== undefined
        ? convert(json.additionalItems, `${path}.additionalItems`)
        : undefined;
  }
  // Elements are values of their own: null is checked, not skipped.
  const contains = json.contains === undefined ? undefined : convert(json.contains, `${path}.contains`);
  // The positions of the tuple, whose defaults useDefaults assigns.
  let tupleItems = Array.isArray(items) && context.draft !== '2020-12' ? items : undefined;
  if (context.draft === '2020-12' && Array.isArray(json.prefixItems)) {
    tupleItems = json.prefixItems;
  }
  const array = new ArrayOfType({
    defaults: tupleItems
      ? collectDefaults(
          tupleItems,
          tupleItems.map((item, i) => i),
          path
        )
      : [],
    type,
    min: json.minItems,
    max: json.maxItems,
    unique: json.uniqueItems,
    contains,
    minContains: json.minContains,
    maxContains: json.maxContains,
    additionalType,
  });
  // For "unevaluatedItems": in draft 2020-12 "contains" evaluates the elements it matches.
  array.containsEvaluates = context.draft === '2020-12';
  return array;
}

function convertNumber(json, Type, path) {
  if (json.multipleOf !== undefined && !(typeof json.multipleOf === 'number' && json.multipleOf > 0)) {
    throw new Error(`Unsupported JSON Schema at ${path}: "multipleOf" must be a number greater than 0`);
  }
  // In draft-04 "exclusiveMinimum" and "exclusiveMaximum" are booleans that make "minimum" and "maximum" exclusive.
  const isDraft04 = context.draft === 'draft-04';
  ['exclusiveMinimum', 'exclusiveMaximum'].forEach((keyword) => {
    const expected = isDraft04 ? 'boolean' : 'number';
    const actual = typeof json[keyword];
    if (json[keyword] !== undefined && actual !== expected) {
      throw new Error(`Unsupported JSON Schema at ${path}: "${keyword}" must be a ${expected} in ${context.draft}`);
    }
  });
  if (isDraft04) {
    return new Type({
      min: json.exclusiveMinimum === true ? undefined : json.minimum,
      max: json.exclusiveMaximum === true ? undefined : json.maximum,
      exclusiveMin: json.exclusiveMinimum === true ? json.minimum : undefined,
      exclusiveMax: json.exclusiveMaximum === true ? json.maximum : undefined,
      multipleOf: json.multipleOf,
      multipleOfPrecision: context.multipleOfPrecision,
    });
  }
  return new Type({
    min: json.minimum,
    max: json.maximum,
    exclusiveMin: json.exclusiveMinimum,
    exclusiveMax: json.exclusiveMaximum,
    multipleOf: json.multipleOf,
    multipleOfPrecision: context.multipleOfPrecision,
  });
}

function convertTypeName(typeName, json, path) {
  switch (typeName) {
    case 'object':
      return convertObject(json, path);
    case 'array':
      return convertArray(json, path);
    case 'string':
      return new StringType({
        min: json.minLength,
        max: json.maxLength,
        pattern: json.pattern === undefined ? undefined : new RegExp(json.pattern, 'u'),
        allowEmpty: false,
        countCodePoints: true,
        ...formatOf(json, path),
      });
    case 'number':
      return convertNumber(json, FloatType, path);
    case 'integer':
      return convertNumber(json, IntegerType, path);
    case 'boolean':
      return new BooleanType();
    default:
      return new ValuesType({ values: [null], isNullable: true });
  }
}

// Keywords of a schema without "type": each group of them checks only the values of its JSON type.
function convertUntyped(json, path) {
  const jsonTypes = [...new Set(Object.keys(json).map((keyword) => TYPED_KEYWORDS[keyword]))].filter(Boolean);
  return jsonTypes.map(
    (jsonType) =>
      new WhenType({
        jsonType,
        type: asInner(convertTypeName(jsonType, json, path)),
      })
  );
}

// Adds "unevaluatedProperties" and "unevaluatedItems" to the types of the other keywords of a node, which decide
// what they leave to check.
function addUnevaluated(parts, json, path) {
  const siblings = [...parts];
  if (json.unevaluatedProperties !== undefined) {
    const type = convert(json.unevaluatedProperties, `${path}.unevaluatedProperties`);
    parts.push(new UnevaluatedType({ kind: 'properties', siblings, type }));
  }
  if (json.unevaluatedItems !== undefined) {
    const type = convert(json.unevaluatedItems, `${path}.unevaluatedItems`);
    parts.push(new UnevaluatedType({ kind: 'items', siblings, type }));
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// The schemas a "oneOf" schema stands for: itself and, while it only references another one, the schemas its "$ref"
// leads to. The last one has the properties.
function referencedSchemas(item) {
  const schemas = [];
  let schema = item;
  while (isObject(schema) && !schemas.includes(schema)) {
    schemas.push(schema);
    if (typeof schema.$ref !== 'string' || schema.properties !== undefined) {
      break;
    }
    schema = context.index.resolve(schema);
  }
  return schemas;
}

// The values a schema gives the property `tag` with "const" or "enum", or undefined when it gives none.
function tagValuesOf(schema, tag) {
  const property = isObject(schema) && isObject(schema.properties) ? schema.properties[tag] : undefined;
  if (!isObject(property)) {
    return undefined;
  }
  if ('const' in property) {
    return [property.const];
  }
  return Array.isArray(property.enum) ? property.enum : undefined;
}

// The name of a "oneOf" schema that is a reference, for the implicit mapping of OpenAPI: the last token of the JSON
// pointer of its "$ref" ("Dog" for "#/components/schemas/Dog"). Undefined for other schemas.
function schemaNameOf(item) {
  if (!isObject(item) || typeof item.$ref !== 'string') {
    return undefined;
  }
  const hash = item.$ref.indexOf('#');
  const pointer = hash === -1 ? '' : item.$ref.slice(hash + 1);
  if (!pointer.startsWith('/')) {
    return undefined;
  }
  try {
    const token = decodeURIComponent(pointer.slice(pointer.lastIndexOf('/') + 1));
    return token.replace(/~1/g, '/').replace(/~0/g, '~') || undefined;
  } catch (e) {
    return undefined;
  }
}

// The "discriminator" of a node (OpenAPI): the property ("propertyName") whose value picks the "oneOf" schema that
// applies. The value of each schema comes from, in this order:
// - "mapping": values to references (resolved against the node) or to schema names, as in OpenAPI;
// - a "const" or "enum" that the schema (or the schema it references) gives the property, as ajv reads it;
// - else the implicit mapping of OpenAPI: the name of the schema it references ("Dog" for "#/components/schemas/Dog").
// The values must be unique strings, and the property required by the node or by every schema. Objects are then
// checked only against the schema their value picks. With values from "const" and "enum" alone, no other schema
// accepts that value, so the result is the one of "oneOf" (`exact`); a "mapping" or a name picks the schema as OpenAPI
// does, whatever the other schemas accept. Returns { tag, mapping, exact }, with the index of the schema for each
// value.
function discriminatorOf(json, path) {
  const { discriminator } = json;
  const at = `Unsupported JSON Schema at ${path}: "discriminator"`;
  if (!isObject(discriminator) || typeof discriminator.propertyName !== 'string') {
    throw new Error(`${at} requires "propertyName"`);
  }
  const tag = discriminator.propertyName;
  if (discriminator.mapping !== undefined && !isObject(discriminator.mapping)) {
    throw new Error(`${at}: "mapping" must be an object of references or schema names by value`);
  }
  const branches = json.oneOf.map((item) => ({ schemas: referencedSchemas(item), name: schemaNameOf(item) }));
  const mapping = new Map();
  let exact = true;
  const add = (value, i) => {
    if (typeof value !== 'string' || mapping.has(value)) {
      throw new Error(`${at}: the values of "${tag}" must be unique strings`);
    }
    mapping.set(value, i);
  };
  // Values of "mapping", by the schema their reference leads to, or by schema name.
  Object.entries(discriminator.mapping || {}).forEach(([value, target]) => {
    if (typeof target !== 'string') {
      throw new Error(`${at}: "mapping"."${value}" must be a reference or a schema name`);
    }
    const isName = !target.includes('#') && !target.includes('/');
    const node = isName ? undefined : context.index.resolve(json, target);
    const i = branches.findIndex(({ schemas, name }) => (isName ? name === target : schemas.includes(node)));
    if (i === -1) {
      throw new Error(`${at}: "mapping"."${value}" ("${target}") is not one of the "oneOf" schemas`);
    }
    add(value, i);
    exact = false;
  });
  let requiredByAll = true;
  branches.forEach(({ schemas, name }, i) => {
    const schema = schemas[schemas.length - 1];
    const values = tagValuesOf(schema, tag);
    if (values !== undefined) {
      values.forEach((value) => add(value, i));
    } else if (![...mapping.values()].includes(i)) {
      if (name === undefined) {
        throw new Error(
          `${at}: every "oneOf" schema needs a value of "${tag}": a "const" or "enum" in "properties"."${tag}", an entry of "mapping", or a "$ref" to a schema named as the value`
        );
      }
      add(name, i);
      exact = false;
    }
    requiredByAll = requiredByAll && Array.isArray(schema.required) && schema.required.includes(tag);
  });
  if (!requiredByAll && !(Array.isArray(json.required) && json.required.includes(tag))) {
    throw new Error(`${at}: "${tag}" must be required`);
  }
  return { tag, mapping, exact };
}

// A "oneOf" without "discriminator" whose schemas give one property distinct string values with "const" or "enum":
// objects are checked against the schema their value picks, as with a discriminator, since no other schema accepts
// that value. A value that picks none is checked as by "oneOf", with the same errors, so the result and the errors are
// the ones of "oneOf" but for the errors of an object whose value picks a schema, which are the ones of that schema.
// Returns { tag, mapping, exact: true, auto: true }, or undefined when no property does it.
function implicitDiscriminatorOf(json) {
  if (json.oneOf.length < 2) {
    return undefined;
  }
  const schemas = json.oneOf.map((item) => {
    const chain = referencedSchemas(item);
    return chain[chain.length - 1];
  });
  const first = schemas[0];
  const candidates = isObject(first) && isObject(first.properties) ? Object.keys(first.properties) : [];
  for (let c = 0; c < candidates.length; c += 1) {
    const tag = candidates[c];
    const mapping = new Map();
    const isTag = schemas.every((schema, i) => {
      const values = tagValuesOf(schema, tag);
      return (
        values !== undefined &&
        values.length > 0 &&
        values.every((value) => typeof value === 'string' && !mapping.has(value) && mapping.set(value, i))
      );
    });
    if (isTag) {
      return { tag, mapping, exact: true, auto: true };
    }
  }
  return undefined;
}

// The types checking the keywords of your own of a node. A macro is replaced by the schema it returns, which only
// applies to the values of its JSON types when it has them.
function convertCustom(node, json, path) {
  return customKeywordsOf(json).flatMap((keyword) => {
    const definition = context.custom.get(keyword);
    const part = customPartOf(node, json, keyword);
    if (definition.macro) {
      const type = convert(part, `${path}.${keyword}`);
      if (definition.types === undefined) {
        return [type];
      }
      return definition.types.map((jsonType) => new WhenType({ jsonType, type: asInner(type) }));
    }
    const value = json[keyword];
    let { message } = definition;
    if (typeof message === 'function' && message.length < 2) {
      // It does not take the data: its text is the same for every value.
      message = message(value);
    } else if (typeof message === 'function') {
      const text = message;
      message = (data) => text(value, data);
    } else if (message === undefined) {
      message = `must pass the "${keyword}" keyword`;
    }
    // Named for the error of standalone code, which cannot contain them.
    [part, message]
      .filter((fn) => typeof fn === 'function')
      .forEach((fn) => {
        fn.validatorKeyword = keyword;
      });
    return [
      new KeywordType({
        keyword,
        check: part,
        message,
        jsonTypes: definition.types,
        isMandatory: false,
        isNullable: true,
      }),
    ];
  });
}

let convertNode;

// Converts a node within the scope of the resource it belongs to, which the nodes below it are converted in too.
convert = (json, path, isMandatory = true) => {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return convertNode(json, path, isMandatory);
  }
  const { scope, draft } = context;
  context.scope = enterNode(scope, json);
  // A resource that names another draft with "$schema" is converted in it.
  context.draft = context.index.draftOf(json) || draft;
  try {
    return convertNode(json, path, isMandatory);
  } finally {
    context.scope = scope;
    context.draft = draft;
  }
};

convertNode = (node, path, isMandatory) => {
  if (node === true) {
    return new AnyType({ isMandatory, isNullable: true });
  }
  if (node === false) {
    return new NeverType({ isMandatory, isNullable: false });
  }
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    throw new Error(`Unsupported JSON Schema at ${path}: expected an object or a boolean`);
  }
  // The keywords its vocabularies leave out are ignored; references resolve from the node itself.
  const json = viewOf(node);
  // Up to draft-07 every keyword next to "$ref" is ignored; later drafts apply them too.
  let refKeywords = NO_KEYWORDS;
  if (!isLegacy(context.draft)) {
    refKeywords = refKeywordsOf(json);
  } else if (json.$ref !== undefined) {
    refKeywords = ['$ref'];
  }
  if (refKeywords.length > 0) {
    const refs = refKeywords.map((keyword) => {
      if (typeof json[keyword] !== 'string') {
        throw new Error(`Unsupported JSON Schema at ${path}: "${keyword}" must be a string`);
      }
      if (keyword === '$recursiveRef' && json.$recursiveRef !== '#') {
        throw new Error(`Unsupported JSON Schema at ${path}: "$recursiveRef" must be "#"`);
      }
      const ref = new RefType({
        ref: json[keyword],
        isMandatory,
        isNullable: true,
      });
      // Resolved later, in the scope of this node.
      context.pending.push({
        ref,
        json: node,
        keyword,
        path,
        scope: context.scope,
        composite: context.composite,
      });
      return ref;
    });
    const rest = isLegacy(context.draft) ? undefined : besideRef(json);
    if (rest === undefined && refs.length === 1) {
      return refs[0];
    }
    // The references count as keywords that evaluate properties and elements for "unevaluated*".
    const { unevaluatedProperties, unevaluatedItems, ...others } = rest || {};
    const parts = [...refs];
    if (rest !== undefined && besideRef(others) !== undefined) {
      parts.push(convertNode(others, path, true));
    }
    addUnevaluated(parts, json, path);
    const type = new AllOfType({ types: parts.map(asInner) });
    type.isMandatory = isMandatory;
    type.isNullable = acceptsNull(node);
    return type;
  }
  checkKeywords(json, path);
  const typeNames = getTypeNames(json);
  const nonNullNames = typeNames.filter((typeName) => typeName !== 'null');
  const namesToConvert = nonNullNames.length > 0 ? nonNullNames : typeNames;
  const constraints = [];
  if (namesToConvert.length === 0) {
    constraints.push(...convertUntyped(json, path));
  } else {
    constraints.push(
      combine(
        namesToConvert.map((typeName) => convertTypeName(typeName, json, path)),
        AnyOfType
      )
    );
  }
  // A checked "format" of a schema without "type" applies to strings, like the keywords of each type (unless one of
  // them gave a string type, which has it).
  const hasStringKeyword = Object.keys(json).some((keyword) => TYPED_KEYWORDS[keyword] === 'string');
  if (namesToConvert.length === 0 && !hasStringKeyword && formatOf(json, path).format !== undefined) {
    constraints.push(
      new WhenType({
        jsonType: 'string',
        type: asInner(new StringType(formatOf(json, path))),
      })
    );
  }
  if (json.enum) {
    constraints.push(new ValuesType({ values: json.enum }));
  }
  if ('const' in json) {
    constraints.push(new ValuesType({ values: [json.const] }));
  }
  if (json.anyOf) {
    constraints.push(
      combine(
        inComposite(() => json.anyOf.map((item, i) => convert(item, `${path}.anyOf[${i}]`))),
        AnyOfType
      )
    );
  }
  if (json.oneOf) {
    if (!Array.isArray(json.oneOf) || json.oneOf.length === 0) {
      throw new Error(`Unsupported JSON Schema at ${path}: "oneOf" must be a non-empty array`);
    }
    const types = inComposite(() => json.oneOf.map((item, i) => asInner(convert(item, `${path}.oneOf[${i}]`))));
    const discriminator =
      json.discriminator === undefined ? implicitDiscriminatorOf(json) : discriminatorOf(json, path);
    constraints.push(new OneOfType({ types, discriminator }));
  } else if (json.discriminator !== undefined) {
    throw new Error(`Unsupported JSON Schema at ${path}: "discriminator" requires "oneOf"`);
  }
  if (json.not !== undefined) {
    constraints.push(new NotType({ type: asInner(inComposite(() => convert(json.not, `${path}.not`))) }));
  }
  if (json.allOf) {
    json.allOf.forEach((item, i) => constraints.push(convert(item, `${path}.allOf[${i}]`)));
  }
  // "then" and "else" are ignored without "if", and "if" alone checks nothing. From draft 2019-09 on it is kept even
  // alone, as what it evaluates counts for an "unevaluated*" of this node or of one that refers to it.
  const keepsIf = json.then !== undefined || json.else !== undefined || !isLegacy(context.draft);
  if (json.if !== undefined && keepsIf) {
    const branch = (keyword) =>
      json[keyword] === undefined ? undefined : asInner(convert(json[keyword], `${path}.${keyword}`));
    constraints.push(
      new ConditionalType({
        ifType: asInner(inComposite(() => convert(json.if, `${path}.if`))),
        thenType: branch('then'),
        elseType: branch('else'),
      })
    );
  }
  constraints.push(...convertCustom(node, json, path));
  addUnevaluated(constraints, json, path);
  const type = combine(constraints, AllOfType);
  type.isMandatory = isMandatory;
  type.isNullable = acceptsNull(node);
  // With coerceTypes, the value is converted to its types where it is read (see coerce.js). "nullable": true adds
  // null to them, as in ajv: null is kept (not converted to '' or 0), and '', 0 and false may become null.
  const coerceTypes =
    json.nullable === true && typeNames.length > 0 && !typeNames.includes('null') ? [...typeNames, 'null'] : typeNames;
  const coerceTo = coerceTypes.filter(
    (typeName) => COERCIBLE.includes(typeName) || (typeName === 'array' && context.coerceTypes === 'array')
  );
  if (context.coerceTypes && coerceTo.length > 0) {
    type.coerceSpec = { types: coerceTypes, to: coerceTo, array: context.coerceTypes === 'array' };
  }
  return type;
};

// Points every reference to the type of its target, converting each target once. Converting a target can add
// references, which the loop resolves too.
function resolveReferences() {
  while (context.pending.length > 0) {
    const { ref, json, keyword, path, scope, composite } = context.pending.shift();
    const target = resolveTarget(json, keyword, scope);
    if (target === undefined) {
      const error = new Error(
        `Unsupported JSON Schema "${keyword}": "${json[keyword]}" at ${path}: only references within the schema or to documents in the "schemas" option are supported`
      );
      // The document to load for the reference to resolve, which loadJsonSchemas() asks loadSchema for.
      error.missingSchema = context.index.missingDocument(json, keyword === '$recursiveRef' ? '#' : json[keyword]);
      throw error;
    }
    // A target is converted once for each scope it is reached in, as dynamic references in it may resolve
    // differently.
    const targetScope = enterNode(scope, target);
    if (!context.targets.has(target)) {
      context.targets.set(target, new Map());
    }
    const byScope = context.targets.get(target);
    // With useDefaults, a target reached inside "anyOf", "oneOf", "not" or "if" is converted apart, without defaults.
    const key = context.useDefaults && composite > 0 ? `${targetScope.key}\n(composite)` : targetScope.key;
    if (!byScope.has(key)) {
      context.scope = targetScope;
      context.composite = composite;
      byScope.set(key, convert(target, json[keyword]));
      context.composite = 0;
    }
    ref.target = byScope.get(key);
  }
}

// Builds a validation type from a JSON Schema (draft-07, 2019-09 or 2020-12: see draftOf()). Throws on unsupported
// keywords instead of silently ignoring them. "$ref" can point within the schema or to the documents in
// options.schemas, given as { uri: schema } or as an array of schemas with "$id"; they are only converted where
// referenced.
function fromJsonSchema(json, options = {}) {
  const strict = strictOf(options);
  const { annotations, custom } = keywordsOf(options);
  const useDefaults = useDefaultsOf(options);
  const coerceTypes = coerceTypesOf(options);
  const multipleOfPrecision = multipleOfPrecisionOf(options);
  const formats = formatsOf(options.formats);
  const removeAdditional = removeAdditionalOf(options);
  const index = new RefIndex(json, options.schemas, draftOf(options));
  // The scope before entering any resource. Scopes belong to one conversion, as they remember what follows them.
  const emptyScope = newScope('', new Map());
  context = {
    draft: index.draft,
    index,
    // Target node to the type converted for it, by the key of the scope it was converted in.
    targets: new Map(),
    pending: [],
    // Scopes by key, so the same anchors give the same scope.
    scopes: new Map([['', emptyScope]]),
    // The formats checked, by name (see formatsOf()).
    formats: formats.checks,
    // The comparisons of the formats whose values can be compared (see formatLimitsOf()).
    formatCompares: formats.compares,
    // With the option "formats", the names it gives (see checkKeywords()).
    knownFormats: formats.known,
    scope: emptyScope,
    // Options "strict" and "keywords" (see isIgnored()), and the nodes without the keywords of other drafts (viewOf()).
    strict,
    annotations,
    custom,
    views: new Map(),
    // What the keywords of your own give for each node, by keyword: the schema of a macro, or the check.
    customParts: new Map(),
    // Options "useDefaults" and "removeAdditional", and how many "anyOf", "oneOf", "not" or "if" the node being
    // converted is inside (see collectDefaults()).
    useDefaults,
    removeAdditional,
    composite: 0,
    // Option "coerceTypes" (see coerce.js).
    coerceTypes,
    // Option "multipleOfPrecision" (see FloatType.isMultiple()).
    multipleOfPrecision,
  };
  try {
    const type = convert(json, '#');
    const rootScope = enterNode(emptyScope, json);
    context.targets.set(json, new Map([[rootScope.key, type]]));
    resolveReferences();
    // The value validated is in no object or array: with coerceTypes, it is converted for the validation only.
    const spec = coerceTypes ? coerceSpecOf(type) : undefined;
    return spec ? new CoerceType({ type, spec }) : type;
  } finally {
    context = undefined;
  }
}

// Compatibility with ajv compile: returns a function that gives the list of errors for a value (empty when valid).
// With allErrors: false it stops at the first failing check and gives only that error. With errors: false it gives
// true or false instead, for when only validity matters. options.schemas registers other documents for "$ref", and
// options.draft chooses the draft, as in fromJsonSchema().
function compileJsonSchema(json, options = {}) {
  return compileType(fromJsonSchema(json, options), options);
}

// The documents a schema references that options.schemas does not have, loaded with options.loadSchema(uri), an
// async function giving the schema at an absolute URI (without fragment). Only the documents the conversion reaches
// are loaded, one at a time, including the ones they reference in turn. Resolves to options.schemas with them added,
// as an object of schemas by URI, for compileJsonSchema() or standaloneJsonSchema().
async function loadJsonSchemas(json, options = {}) {
  if (typeof options.loadSchema !== 'function') {
    throw new Error('Unsupported JSON Schema option "loadSchema": expected an async function (uri) => schema');
  }
  const schemas = Object.fromEntries(documentsOf(options.schemas).map(({ uri, schema }) => [uri, schema]));
  const loaded = new Set();
  for (;;) {
    try {
      fromJsonSchema(json, { ...options, schemas });
      return schemas;
    } catch (e) {
      const uri = e.missingSchema;
      if (uri === undefined || loaded.has(uri)) {
        throw e;
      }
      loaded.add(uri);
      // One document at a time: the next conversion tells which one is missing next.
      // eslint-disable-next-line no-await-in-loop
      schemas[uri] = await options.loadSchema(uri);
    }
  }
}

// compileJsonSchema() for a schema referencing documents to load first with options.loadSchema (see loadJsonSchemas()),
// like ajv's compileAsync().
async function compileJsonSchemaAsync(json, options = {}) {
  const schemas = await loadJsonSchemas(json, options);
  return compileJsonSchema(json, { ...options, schemas });
}

module.exports = {
  fromJsonSchema,
  compileJsonSchema,
  loadJsonSchemas,
  compileJsonSchemaAsync,
  builtInFormats,
};

},
"@xufa/schema/src/schema.js": function (module, exports, require) {
const { ObjType, ValidateType, toType } = require('./types');
const { assignDefaults } = require('./defaults');
const { readCoerced } = require('./coerce');

// Declared keys are read as own properties only: {}.toString or {}.constructor must not count as present.
// A value read from a plain object is its own unless Object.prototype has the key, which avoids the slower
// own-property check in the common case. The prototype is read with __proto__ rather than Object.getPrototypeOf(),
// which makes V8 deoptimize the code around it (twice slower). Objects without that accessor (no prototype, or an
// own "__proto__" key from JSON.parse) are not taken as plain and get the own-property check.
function ownValue(obj, key) {
  const value = obj[key];
  // eslint-disable-next-line no-proto -- see above
  if (value === undefined || (obj.__proto__ === Object.prototype && !(key in Object.prototype))) {
    return value;
  }
  return Object.prototype.hasOwnProperty.call(obj, key) ? value : undefined;
}

class Schema {
  constructor(schema = {}, options = {}) {
    this.schema = schema;
    this.options = options;
    this.isOpen = options.isOpen === undefined ? true : options.isOpen;
    this.isMandatory = options.isMandatory === undefined ? true : options.isMandatory;
    this.isNullable = options.isNullable === undefined ? false : options.isNullable;
    // Type that keys not declared in the schema must satisfy (only used when the schema is open).
    this.additionalType = toType(options.additionalType, 'Schema additionalType');
    // [{ pattern, type }]: keys matching a pattern must satisfy its type, and are not checked by additionalType.
    this.patternTypes = (options.patternTypes || []).map((item, i) => ({
      ...item,
      type: toType(item.type, `Schema patternTypes[${i}].type`),
    }));
    this.minProperties = options.minProperties;
    this.maxProperties = options.maxProperties;
    // [{ key, value, empty }]: defaults assigned to missing properties before checking them (option useDefaults).
    this.defaults = options.defaults || [];
    // What to do with additional properties (option removeAdditional): 'delete' them, delete the 'failing' ones, or
    // nothing. They are deleted where they are checked, in the same order as the compiled code.
    this.removeAdditional = options.removeAdditional;
    // [{ key, required: [properties] } or { key, type }]: when key is present, the properties must be present too,
    // or the whole object must satisfy type.
    this.dependencies = (options.dependencies || []).map((item, i) =>
      item.type === undefined ? item : { ...item, type: toType(item.type, `Schema dependencies[${i}].type`) }
    );
    // Type every key must satisfy, reported as "Key <name>".
    this.propertyNameType = toType(options.propertyNameType, 'Schema propertyNameType');
    this.visitObjs();
    this.keys = Object.keys(this.schema);
    this.keySet = new Set(this.keys);
  }

  visitObjs() {
    // Nested schemas share the options, except the ones about the keys of this object.
    const options = {
      ...this.options,
      patternTypes: undefined,
      dependencies: undefined,
      propertyNameType: undefined,
      defaults: undefined,
      removeAdditional: undefined,
    };
    const keys = Object.keys(this.schema);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const value = this.schema[key];
      if (!(value instanceof Schema)) {
        if (!(value instanceof ValidateType)) {
          this.schema[key] = new Schema(value, options);
        } else if (
          value instanceof ObjType &&
          !(value.schema instanceof ValidateType && !(value.schema instanceof Schema))
        ) {
          this.schema[key] = new Schema(value.shape instanceof Schema ? value.shape.schema : value.shape, options);
        }
      }
    }
  }

  // Fast boolean check equivalent to validate(obj).length === 0 that builds no messages.
  isValid(obj) {
    if (obj === undefined) {
      return !this.isMandatory;
    }
    if (obj === null) {
      return this.isNullable;
    }
    if (typeof obj !== 'object' || Array.isArray(obj)) {
      return false;
    }
    if (this.defaults.length > 0) {
      assignDefaults(obj, this.defaults);
    }
    const { keys } = this;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      // With coerceTypes, a value is converted to the types of its schema as it is read (see coerce.js).
      if (!this.schema[key].isValid(readCoerced(obj, key, this.schema[key], ownValue(obj, key)))) {
        return false;
      }
    }
    const objKeys = Object.keys(obj);
    const { patternTypes, propertyNameType, removeAdditional } = this;
    // The keys removeAdditional deletes still count, as in ajv.
    if (!this.hasPropertyCount(objKeys.length)) {
      return false;
    }
    if (!this.isOpen || this.additionalType || patternTypes.length > 0 || propertyNameType || removeAdditional) {
      for (let i = 0; i < objKeys.length; i += 1) {
        const key = objKeys[i];
        if (propertyNameType && !propertyNameType.isValid(key)) {
          return false;
        }
        let matched = false;
        for (let j = 0; j < patternTypes.length; j += 1) {
          if (patternTypes[j].pattern.test(key)) {
            matched = true;
            if (!patternTypes[j].type.isValid(readCoerced(obj, key, patternTypes[j].type, obj[key]))) {
              return false;
            }
          }
        }
        if (!this.isDeclared(key) && !matched) {
          if (this.removes(obj, key)) {
            delete obj[key];
          } else if (
            !this.isOpen ||
            (this.additionalType && !this.additionalType.isValid(readCoerced(obj, key, this.additionalType, obj[key])))
          ) {
            return false;
          }
        }
      }
    }
    return this.dependencies.every(
      ({ key, required, type }) =>
        ownValue(obj, key) === undefined ||
        (required ? required.every((property) => ownValue(obj, property) !== undefined) : type.isValid(obj))
    );
  }

  validate(obj, fieldName = undefined) {
    return this.isValid(obj) ? [] : this.errors(obj, fieldName);
  }

  // Whether a number of keys satisfies minProperties and maxProperties.
  hasPropertyCount(count) {
    return !(
      (this.minProperties !== undefined && count < this.minProperties) ||
      (this.maxProperties !== undefined && count > this.maxProperties)
    );
  }

  // Whether a key is declared rather than additional. With removeAdditional, a key only "required" names is additional,
  // as in ajv (`propertyKeys` are the keys "properties" names, see convertObject() in json-schema.js).
  isDeclared(key) {
    if (this.removeAdditional && this.propertyKeys) {
      return this.propertyKeys.includes(key);
    }
    return this.keySet.has(key);
  }

  // Whether removeAdditional deletes the additional property `key` of `obj`.
  removes(obj, key) {
    return (
      this.removeAdditional === 'delete' ||
      (this.removeAdditional === 'failing' && !this.additionalType.isValid(obj[key]))
    );
  }

  // Compiles the schema into generated code, several times faster than validate(): see compileType() in compile.js
  // for the options. The compiled function does not see changes made to the schema afterwards.
  compile(options = {}) {
    // eslint-disable-next-line global-require -- compile.js requires this module
    return require('./compile').compileType(this, options);
  }

  // Error messages of a value already known to be invalid.
  errors(obj, fieldName = undefined) {
    const name = fieldName || 'Value';
    const { keys: schemaKeys } = this;
    const errors = [];
    if (obj === undefined) {
      if (this.isMandatory) {
        errors.push(`${name} is mandatory`);
      }
      return errors;
    }
    if (obj === null) {
      if (!this.isNullable) {
        errors.push(`${name} cannot be null`);
      }
      return errors;
    }
    if (typeof obj !== 'object' || Array.isArray(obj)) {
      errors.push(`${name} must be an object`);
      return errors;
    }
    if (this.defaults.length > 0) {
      assignDefaults(obj, this.defaults);
    }
    for (let i = 0; i < schemaKeys.length; i += 1) {
      const key = schemaKeys[i];
      const type = this.schema[key];
      const value = readCoerced(obj, key, type, ownValue(obj, key));
      if (!type.isValid(value)) {
        errors.push(type.errors(value, fieldName ? `${fieldName}.${key}` : key));
      }
    }
    const objKeys = Object.keys(obj);
    for (let i = 0; i < objKeys.length; i += 1) {
      const key = objKeys[i];
      const keyName = fieldName ? `${fieldName}.${key}` : key;
      if (this.propertyNameType && !this.propertyNameType.isValid(key)) {
        errors.push(this.propertyNameType.errors(key, `Key ${keyName}`));
      }
      let matched = false;
      this.patternTypes.forEach(({ pattern, type }) => {
        if (pattern.test(key)) {
          matched = true;
          const value = readCoerced(obj, key, type, obj[key]);
          if (!type.isValid(value)) {
            errors.push(type.errors(value, keyName));
          }
        }
      });
      if (!this.isDeclared(key) && !matched) {
        if (this.removes(obj, key)) {
          delete obj[key];
        } else if (!this.isOpen) {
          errors.push(`Unexpected key: ${keyName}`);
        } else if (this.additionalType) {
          const value = readCoerced(obj, key, this.additionalType, obj[key]);
          if (!this.additionalType.isValid(value)) {
            errors.push(this.additionalType.errors(value, keyName));
          }
        }
      }
    }
    const count = objKeys.length;
    if (this.minProperties !== undefined && count < this.minProperties) {
      errors.push(`${name} must have at least ${this.minProperties} properties`);
    }
    if (this.maxProperties !== undefined && count > this.maxProperties) {
      errors.push(`${name} must have at most ${this.maxProperties} properties`);
    }
    this.dependencies.forEach(({ key, required, type }) => {
      if (ownValue(obj, key) === undefined) {
        return;
      }
      const keyName = fieldName ? `${fieldName}.${key}` : key;
      if (required) {
        required
          .filter((property) => ownValue(obj, property) === undefined)
          .forEach((property) => {
            const propertyName = fieldName ? `${fieldName}.${property}` : property;
            errors.push(`${propertyName} is mandatory when ${keyName} is present`);
          });
      } else if (!type.isValid(obj)) {
        errors.push(type.errors(obj, fieldName));
      }
    });
    return errors.flat(Infinity);
  }

  mandatory(isMandatory = true) {
    this.isMandatory = isMandatory;
    return this;
  }

  nullable(isNullable = true) {
    this.isNullable = isNullable;
    return this;
  }

  optional() {
    this.isMandatory = false;
    return this;
  }

  required() {
    this.isMandatory = true;
    return this;
  }

  notNull() {
    this.isNullable = false;
    return this;
  }
}

module.exports = {
  Schema,
};

},
"@xufa/schema/src/standalone-helpers.js": function (module, exports, require) {
// Generated by scripts/generate-standalone-helpers.js (npm run build:helpers): do not edit.
// Source of the library functions that standalone code calls, written into it (see standalone.js). They are kept as
// text rather than read with toString(), which tools that rewrite code (coverage, minifiers) change.
// test/standalone.test.js checks that each one behaves as the library function it copies.
/* eslint-disable no-template-curly-in-string -- the sources are code, with template literals */
const HELPER_SOURCES = {
  codePointLength: {
    calls: [],
    source: [
      'function codePointLength(value) {',
      '  let count = 0;',
      '  for (let i = 0; i < value.length; i += 1) {',
      '    const code = value.charCodeAt(i);',
      '    if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {',
      '      const next = value.charCodeAt(i + 1);',
      '      if (next >= 0xdc00 && next <= 0xdfff) {',
      '        i += 1;',
      '      }',
      '    }',
      '    count += 1;',
      '  }',
      '  return count;',
      '}',
    ].join('\n'),
  },
  deepEqual: {
    calls: [],
    source: [
      'function deepEqual(a, b) {',
      '  if (a === b) return true;',
      '  if (Number.isNaN(a) && Number.isNaN(b)) return true;',
      "  if (a && b && typeof a === 'object' && typeof b === 'object') {",
      '    if (a.constructor !== b.constructor) return false;',
      '    if (Array.isArray(a)) {',
      '      const l = a.length;',
      '      if (l !== b.length) return false;',
      '      for (let i = 0; i < l; i += 1) {',
      '        if (!deepEqual(a[i], b[i])) return false;',
      '      }',
      '      return true;',
      '    }',
      '    if (a instanceof Map && b instanceof Map) {',
      '      if (a.size !== b.size) return false;',
      '      const keys = [...a.keys()];',
      '      for (let i = 0; i < keys.length; i += 1) {',
      '        const key = keys[i];',
      '        if (!b.has(key)) return false;',
      '      }',
      '      for (let i = 0; i < keys.length; i += 1) {',
      '        const key = keys[i];',
      '        if (!deepEqual(a.get(key), b.get(key))) return false;',
      '      }',
      '      return true;',
      '    }',
      '    if (a instanceof Set && b instanceof Set) {',
      '      if (a.size !== b.size) return false;',
      '      const keys = [...a.keys()];',
      '      for (let i = 0; i < keys.length; i += 1) {',
      '        const key = keys[i];',
      '        if (!b.has(key)) return false;',
      '      }',
      '      return true;',
      '    }',
      '    if (ArrayBuffer.isView(a)) {',
      '      const l = a.length;',
      '      if (l !== b.length) return false;',
      '      for (let i = 0; i < l; i += 1) {',
      '        if (a[i] !== b[i]) return false;',
      '      }',
      '      return true;',
      '    }',
      '    if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;',
      '    if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();',
      '    if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();',
      '    const keys = Object.keys(a);',
      '    if (keys.length !== Object.keys(b).length) return false;',
      '    for (let i = 0; i < keys.length; i += 1) {',
      '      const key = keys[i];',
      '      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;',
      '      if (!deepEqual(a[key], b[key])) return false;',
      '    }',
      '    return true;',
      '  }',
      '  return false;',
      '}',
    ].join('\n'),
  },
  hasDuplicates: {
    calls: ['deepEqual'],
    source: [
      'function hasDuplicates(value) {',
      "  if (value.some((item) => item !== null && typeof item === 'object')) {",
      '    return value.some((item, i) => value.findIndex((other) => deepEqual(item, other)) !== i);',
      '  }',
      '  const seen = new Set();',
      '  for (let i = 0; i < value.length; i += 1) {',
      '    if (i in value && seen.has(value[i])) {',
      '      return true;',
      '    }',
      '    seen.add(value[i]);',
      '  }',
      '  return false;',
      '}',
    ].join('\n'),
  },
  pathName: {
    calls: [],
    source: [
      'function pathName(path) {',
      '  let name;',
      '  for (let i = 0; i < path.length; i += 1) {',
      '    const segment = path[i];',
      "    if (typeof segment === 'number') {",
      "      name = `${name === undefined ? 'Value' : name}[${segment}]`;",
      "    } else if (segment !== null && typeof segment === 'object') {",
      '      return `Key ${name ? `${name}.${segment.key}` : segment.key}`;',
      '    } else {',
      '      name = name ? `${name}.${segment}` : segment;',
      '    }',
      '  }',
      "  return name === undefined ? 'Value' : name;",
      '}',
    ].join('\n'),
  },
  errorObject: {
    calls: [],
    source: [
      'function errorObject(path, keyword, params, message) {',
      '  const last = path[path.length - 1];',
      "  const isPropertyName = last !== null && typeof last === 'object';",
      '  const keys = isPropertyName ? path.slice(0, -1).concat(last.key) : path.slice();',
      "  let pointer = '';",
      '  for (let i = 0; i < keys.length; i += 1) {',
      '    const key = `${keys[i]}`;',
      '    // Escaped only when it has one of the two characters to escape.',
      "    pointer += key.includes('~') || key.includes('/') ? `/${key.replace(/~/g, '~0').replace(/\\//g, '~1')}` : `/${key}`;",
      '  }',
      '  const error = { path: keys, pointer, keyword, params, message };',
      '  if (isPropertyName) {',
      '    error.propertyName = true;',
      '  }',
      '  return error;',
      '}',
    ].join('\n'),
  },
  isRfc1123Hostname: {
    calls: [],
    source: [
      'function isRfc1123Hostname(value) {',
      '  return (',
      '    value.length <= 253 &&',
      "    value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))",
      '  );',
      '}',
    ].join('\n'),
  },
  compareDate: {
    calls: [],
    source: [
      'function compareDate(d1, d2) {',
      '  if (!(d1 && d2)) {',
      '    return undefined;',
      '  }',
      '  if (d1 > d2) {',
      '    return 1;',
      '  }',
      '  return d1 < d2 ? -1 : 0;',
      '}',
    ].join('\n'),
  },
  compareTime: {
    calls: [],
    source: [
      'function compareTime(t1, t2) {',
      '  if (!(t1 && t2)) {',
      '    return undefined;',
      '  }',
      '  const ms1 = new Date(`2020-01-01T${t1}`).valueOf();',
      '  const ms2 = new Date(`2020-01-01T${t2}`).valueOf();',
      '  return ms1 && ms2 ? ms1 - ms2 : undefined;',
      '}',
    ].join('\n'),
  },
  compareDateTime: {
    calls: [],
    source: [
      'function compareDateTime(dt1, dt2) {',
      '  if (!(dt1 && dt2)) {',
      '    return undefined;',
      '  }',
      '  const ms1 = new Date(dt1).valueOf();',
      '  const ms2 = new Date(dt2).valueOf();',
      '  return ms1 && ms2 ? ms1 - ms2 : undefined;',
      '}',
    ].join('\n'),
  },
  isDate: {
    calls: [],
    source: [
      'function isDate(value) {',
      '  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(value);',
      '  if (!match) {',
      '    return false;',
      '  }',
      '  const year = Number(match[1]);',
      '  const month = Number(match[2]);',
      '  const day = Number(match[3]);',
      '  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);',
      '  const days = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];',
      '  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];',
      '}',
    ].join('\n'),
  },
  isTime: {
    calls: [],
    source: [
      'function isTime(value) {',
      '  const match = /^(\\d{2}):(\\d{2}):(\\d{2})(?:\\.\\d+)?(?:([zZ])|([+-])(\\d{2}):(\\d{2}))$/.exec(value);',
      '  if (!match) {',
      '    return false;',
      '  }',
      '  const hour = Number(match[1]);',
      '  const minute = Number(match[2]);',
      '  const second = Number(match[3]);',
      '  if (hour > 23 || minute > 59 || second > 60) {',
      '    return false;',
      '  }',
      '  let offset = 0;',
      '  if (!match[4]) {',
      '    const offsetHour = Number(match[6]);',
      '    const offsetMinute = Number(match[7]);',
      '    if (offsetHour > 23 || offsetMinute > 59) {',
      '      return false;',
      '    }',
      "    offset = (match[5] === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute);",
      '  }',
      '  return second < 60 || (hour * 60 + minute - offset + 1440) % 1440 === 23 * 60 + 59;',
      '}',
    ].join('\n'),
  },
  isDateTime: {
    calls: ['isDate', 'isTime'],
    source: [
      'function isDateTime(value) {',
      '  const match = /^(.{10})[tT](.+)$/.exec(value);',
      '  return match !== null && isDate(match[1]) && isTime(match[2]);',
      '}',
    ].join('\n'),
  },
  isDuration: {
    calls: [],
    source: [
      'function isDuration(value) {',
      '  return /^P(?:(?:\\d+Y(?:\\d+M(?:\\d+D)?)?|\\d+M(?:\\d+D)?|\\d+D)(?:T(?:\\d+H(?:\\d+M(?:\\d+S)?)?|\\d+M(?:\\d+S)?|\\d+S))?|T(?:\\d+H(?:\\d+M(?:\\d+S)?)?|\\d+M(?:\\d+S)?|\\d+S)|\\d+W)$/.test(',
      '    value',
      '  );',
      '}',
    ].join('\n'),
  },
  isIpv4: {
    calls: [],
    source: [
      'function isIpv4(value) {',
      '  return /^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)$/.test(value);',
      '}',
    ].join('\n'),
  },
  isIpv6: {
    calls: ['isIpv4'],
    source: [
      'function isIpv6(value) {',
      '  if (!/^[0-9A-Fa-f:.]+$/.test(value)) {',
      '    return false;',
      '  }',
      "  const halves = value.split('::');",
      '  if (halves.length > 2) {',
      '    return false;',
      '  }',
      "  const groups = halves.map((half) => (half === '' ? [] : half.split(':')));",
      '  const all = groups[groups.length - 1];',
      '  let count = 0;',
      "  if (all.length > 0 && all[all.length - 1].includes('.')) {",
      '    if (!isIpv4(all.pop())) {',
      '      return false;',
      '    }',
      '    count = 2;',
      '  }',
      '  const hextets = [].concat(...groups);',
      '  if (!hextets.every((group) => /^[0-9A-Fa-f]{1,4}$/.test(group))) {',
      '    return false;',
      '  }',
      '  count += hextets.length;',
      '  return halves.length === 2 ? count < 8 : count === 8;',
      '}',
    ].join('\n'),
  },
  punycodeAdapt: {
    calls: [],
    source: [
      'function punycodeAdapt(delta, points, isFirst) {',
      '  let result = Math.floor(delta / (isFirst ? 700 : 2));',
      '  result += Math.floor(result / points);',
      '  let k = 0;',
      '  while (result > 455) {',
      '    result = Math.floor(result / 35);',
      '    k += 36;',
      '  }',
      '  return k + Math.floor((36 * result) / (result + 38));',
      '}',
    ].join('\n'),
  },
  punycodeDecode: {
    calls: ['punycodeAdapt'],
    source: [
      'function punycodeDecode(input) {',
      '  const output = [];',
      "  const delimiter = input.lastIndexOf('-');",
      '  for (let j = 0; j < Math.max(delimiter, 0); j += 1) {',
      '    if (input.charCodeAt(j) >= 0x80) {',
      '      return undefined;',
      '    }',
      '    output.push(input.charCodeAt(j));',
      '  }',
      '  let n = 128;',
      '  let bias = 72;',
      '  let i = 0;',
      '  for (let index = delimiter < 0 ? 0 : delimiter + 1; index < input.length;) {',
      '    const old = i;',
      '    let weight = 1;',
      '    for (let k = 36; ; k += 36) {',
      '      if (index >= input.length) {',
      '        return undefined;',
      '      }',
      '      const code = input.charCodeAt(index);',
      '      index += 1;',
      '      let digit = 36;',
      '      if (code >= 48 && code <= 57) {',
      '        digit = code - 22;',
      '      } else if (code >= 65 && code <= 90) {',
      '        digit = code - 65;',
      '      } else if (code >= 97 && code <= 122) {',
      '        digit = code - 97;',
      '      }',
      '      if (digit >= 36 || digit > Math.floor((0x7fffffff - i) / weight)) {',
      '        return undefined;',
      '      }',
      '      i += digit * weight;',
      '      let t = k - bias;',
      '      if (k <= bias) {',
      '        t = 1;',
      '      } else if (k >= bias + 26) {',
      '        t = 26;',
      '      }',
      '      if (digit < t) {',
      '        break;',
      '      }',
      '      weight *= 36 - t;',
      '    }',
      '    bias = punycodeAdapt(i - old, output.length + 1, old === 0);',
      '    n += Math.floor(i / (output.length + 1));',
      '    i %= output.length + 1;',
      '    if (n > 0x10ffff) {',
      '      return undefined;',
      '    }',
      '    output.splice(i, 0, n);',
      '    i += 1;',
      '  }',
      '  return String.fromCodePoint(...output);',
      '}',
    ].join('\n'),
  },
  punycodeEncode: {
    calls: ['punycodeAdapt'],
    source: [
      'function punycodeEncode(input) {',
      '  const points = Array.from(input, (char) => char.codePointAt(0));',
      '  const digit = (d) => String.fromCharCode(d < 26 ? 97 + d : 22 + d);',
      '  let output = points',
      '    .filter((point) => point < 128)',
      '    .map((point) => String.fromCharCode(point))',
      "    .join('');",
      '  const basic = output.length;',
      '  let handled = basic;',
      '  if (basic > 0) {',
      "    output += '-';",
      '  }',
      '  let n = 128;',
      '  let delta = 0;',
      '  let bias = 72;',
      '  while (handled < points.length) {',
      '    // The smallest code point not handled yet.',
      '    let m = 0x10ffff;',
      '    for (let i = 0; i < points.length; i += 1) {',
      '      if (points[i] >= n && points[i] < m) {',
      '        m = points[i];',
      '      }',
      '    }',
      '    delta += (m - n) * (handled + 1);',
      '    n = m;',
      '    for (let i = 0; i < points.length; i += 1) {',
      '      if (points[i] < n) {',
      '        delta += 1;',
      '      }',
      '      if (points[i] === n) {',
      '        let q = delta;',
      '        for (let k = 36; ; k += 36) {',
      '          let t = k - bias;',
      '          if (k <= bias) {',
      '            t = 1;',
      '          } else if (k >= bias + 26) {',
      '            t = 26;',
      '          }',
      '          if (q < t) {',
      '            break;',
      '          }',
      '          output += digit(t + ((q - t) % (36 - t)));',
      '          q = Math.floor((q - t) / (36 - t));',
      '        }',
      '        output += digit(q);',
      '        bias = punycodeAdapt(delta, handled + 1, handled === basic);',
      '        delta = 0;',
      '        handled += 1;',
      '      }',
      '    }',
      '    delta += 1;',
      '    n += 1;',
      '  }',
      '  return output;',
      '}',
    ].join('\n'),
  },
  bidiClass: {
    calls: [],
    source: [
      'function bidiClass(char) {',
      '  if (/[\\u0600-\\u0605\\u0660-\\u0669\\u066B\\u066C\\u06DD\\u0890\\u0891\\u08E2]/u.test(char)) {',
      "    return 'AN';",
      '  }',
      '  if (/[0-9\\u06F0-\\u06F9\\u00B2\\u00B3\\u00B9\\u2070-\\u2079\\u2080-\\u2089\\uFF10-\\uFF19]/u.test(char)) {',
      "    return 'EN';",
      '  }',
      '  if (/[\\p{Mn}\\p{Me}]/u.test(char)) {',
      "    return 'NSM';",
      '  }',
      '  if (/[\\p{Script=Arabic}\\p{Script=Syriac}\\p{Script=Thaana}]/u.test(char)) {',
      "    return 'AL';",
      '  }',
      '  if (/[\\p{Script=Hebrew}\\p{Script=Nko}\\p{Script=Samaritan}\\p{Script=Mandaic}\\u200F]/u.test(char)) {',
      "    return 'R';",
      '  }',
      '  if (/[+-]/.test(char)) {',
      "    return 'ES';",
      '  }',
      '  if (/[,./:\\u00A0]/.test(char)) {',
      "    return 'CS';",
      '  }',
      '  if (/[#$%\\u00A2-\\u00A5\\u00B0\\u00B1]/u.test(char)) {',
      "    return 'ET';",
      '  }',
      "  return /[\\p{L}\\p{Mc}]/u.test(char) ? 'L' : 'ON';",
      '}',
    ].join('\n'),
  },
  hasValidBidi: {
    calls: ['bidiClass'],
    source: [
      'function hasValidBidi(label) {',
      '  const classes = Array.from(label, bidiClass);',
      '  const first = classes[0];',
      "  const last = classes.filter((type) => type !== 'NSM').pop();",
      "  if (first === 'R' || first === 'AL') {",
      '    return (',
      "      classes.every((type) => ['R', 'AL', 'AN', 'EN', 'ES', 'CS', 'ET', 'ON', 'NSM'].includes(type)) &&",
      "      ['R', 'AL', 'EN', 'AN'].includes(last) &&",
      "      !(classes.includes('EN') && classes.includes('AN'))",
      '    );',
      '  }',
      "  if (first === 'L') {",
      '    return (',
      "      classes.every((type) => ['L', 'EN', 'ES', 'CS', 'ET', 'ON', 'NSM'].includes(type)) && ['L', 'EN'].includes(last)",
      '    );',
      '  }',
      '  return false;',
      '}',
    ].join('\n'),
  },
  isULabel: {
    calls: [],
    source: [
      'function isULabel(label) {',
      '  const chars = Array.from(label);',
      "  if (label.length === 0 || label.normalize('NFC') !== label || /^\\p{M}/u.test(label)) {",
      '    return false;',
      '  }',
      "  if (label.startsWith('-') || label.endsWith('-') || label.slice(2, 4) === '--') {",
      '    return false;',
      '  }',
      '  const virama =',
      '    /[\\u094D\\u09CD\\u0A4D\\u0ACD\\u0B4D\\u0BCD\\u0C4D\\u0CCD\\u0D3B\\u0D3C\\u0D4D\\u0DCA\\u0E3A\\u0F84\\u1039\\u103A\\u1714\\u1734\\u17D2\\u1A60\\u1B44\\u1BAA\\u1BAB\\u1BF2\\u1BF3\\u2D7F\\uA806\\uA8C4\\uA953\\uA9C0\\uAAF6\\uABED]/u;',
      '  const joining = /[\\p{Script=Arabic}\\p{Script=Syriac}\\p{Script=Nko}\\p{Script=Mongolian}]/u;',
      '  return chars.every((char, i) => {',
      '    const before = chars[i - 1];',
      '    const after = chars[i + 1];',
      '    switch (char) {',
      "      case '\\u00DF':",
      "      case '\\u03C2':",
      "      case '\\u06FD':",
      "      case '\\u06FE':",
      "      case '\\u0F0B':",
      "      case '\\u3007':",
      '        return true;',
      "      case '\\u00B7':",
      "        return before === 'l' && after === 'l';",
      "      case '\\u0375':",
      '        return after !== undefined && /\\p{Script=Greek}/u.test(after);',
      "      case '\\u05F3':",
      "      case '\\u05F4':",
      '        return before !== undefined && /\\p{Script=Hebrew}/u.test(before);',
      "      case '\\u30FB':",
      '        return chars.some(',
      "          (other) => /[\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Han}]/u.test(other) && other !== '\\u30FB'",
      '        );',
      "      case '\\u200D':",
      '        return before !== undefined && virama.test(before);',
      "      case '\\u200C': {",
      '        if (before !== undefined && virama.test(before)) {',
      '          return true;',
      '        }',
      '        // Joining letters on both sides, marks between them skipped.',
      '        const left = chars',
      '          .slice(0, i)',
      '          .reverse()',
      '          .find((other) => !/\\p{Mn}/u.test(other));',
      '        const right = chars.slice(i + 1).find((other) => !/\\p{Mn}/u.test(other));',
      '        return left !== undefined && right !== undefined && joining.test(left) && joining.test(right);',
      '      }',
      '      default:',
      '        break;',
      '    }',
      '    if (/[\\u0660-\\u0669]/u.test(char)) {',
      '      return !chars.some((other) => /[\\u06F0-\\u06F9]/u.test(other));',
      '    }',
      '    if (/[\\u06F0-\\u06F9]/u.test(char)) {',
      '      return !chars.some((other) => /[\\u0660-\\u0669]/u.test(other));',
      '    }',
      '    // The code points RFC 5892 lists as DISALLOWED, marks among them.',
      '    // eslint-disable-next-line no-misleading-character-class -- each one is a code point on its own',
      '    if (/[\\u0640\\u07FA\\u302E\\u302F\\u3031-\\u3035\\u303B]/u.test(char)) {',
      '      return false;',
      '    }',
      "    return /[\\p{Ll}\\p{Lo}\\p{Lm}\\p{Mn}\\p{Mc}\\p{Nd}-]/u.test(char) && char.normalize('NFKC').toLowerCase() === char;",
      '  });',
      '}',
    ].join('\n'),
  },
  hasValidLabels: {
    calls: ['punycodeDecode', 'punycodeEncode', 'bidiClass', 'hasValidBidi', 'isULabel'],
    source: [
      'function hasValidLabels(value, isIdn) {',
      '  // A name of letter-digit-hyphen labels needs no mapping and has no right-to-left label: without "--" in the third and',
      '  // fourth positions of a label (RFC 5891), which only a punycode label ("xn--") may have and the full check reads, it',
      '  // only has to be at most 253 characters long.',
      '  if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(value) && !/(?:^|\\.)[A-Za-z0-9-]{2}--/.test(value)) {',
      '    return value.length <= 253;',
      '  }',
      '  const mapped = isIdn',
      '    ? value',
      "        .normalize('NFKC')",
      "        .replace(/[\\u3002\\uFF0E\\uFF61]/gu, '.')",
      '        // Code points the mapping removes (soft hyphen, zero width space, variation selectors...).',
      '        // eslint-disable-next-line no-misleading-character-class -- each one is a code point on its own',
      "        .replace(/[\\u00AD\\u200B\\u2060\\uFEFF\\u180B-\\u180D\\uFE00-\\uFE0F]/gu, '')",
      '        .toLowerCase()',
      '    : value;',
      '  if (!isIdn && !/^[\\x21-\\x7E]*$/.test(mapped)) {',
      '    return false;',
      '  }',
      "  const labels = mapped.split('.');",
      '  const unicode = [];',
      '  const ascii = [];',
      '  const valid = labels.every((label) => {',
      '    if (/^xn--/i.test(label)) {',
      '      const decoded = punycodeDecode(label.slice(4).toLowerCase());',
      '      if (',
      '        decoded === undefined ||',
      '        Array.from(decoded).every((char) => char.charCodeAt(0) < 0x80) ||',
      '        punycodeEncode(decoded) !== label.slice(4).toLowerCase() ||',
      '        !isULabel(decoded)',
      '      ) {',
      '        return false;',
      '      }',
      '      unicode.push(decoded);',
      '      ascii.push(label);',
      '      return label.length <= 63;',
      '    }',
      '    if (Array.from(label).every((char) => char.charCodeAt(0) < 0x80)) {',
      '      unicode.push(label);',
      '      ascii.push(label);',
      '      return (',
      '        /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label) &&',
      "        !(label.slice(2, 4) === '--' && !/^xn--/i.test(label))",
      '      );',
      '    }',
      '    if (!isIdn || !isULabel(label)) {',
      '      return false;',
      '    }',
      '    unicode.push(label);',
      '    ascii.push(`xn--${punycodeEncode(label)}`);',
      '    return ascii[ascii.length - 1].length <= 63;',
      '  });',
      "  if (!valid || ascii.join('.').length > 253) {",
      '    return false;',
      '  }',
      '  // With a right-to-left label, every label follows the Bidi rule.',
      "  const isRtl = unicode.some((label) => Array.from(label).some((char) => ['R', 'AL', 'AN'].includes(bidiClass(char))));",
      '  return !isRtl || unicode.every(hasValidBidi);',
      '}',
    ].join('\n'),
  },
  isHostname: {
    calls: ['hasValidLabels'],
    source: ['function isHostname(value) {', '  return hasValidLabels(value, false);', '}'].join('\n'),
  },
  isIdnHostname: {
    calls: ['hasValidLabels'],
    source: ['function isIdnHostname(value) {', '  return hasValidLabels(value, true);', '}'].join('\n'),
  },
  isEmailWith: {
    calls: ['isIpv4', 'isIpv6'],
    source: [
      'function isEmailWith(value, isIdn, isHost) {',
      "  const at = value.lastIndexOf('@');",
      '  if (at <= 0 || at === value.length - 1) {',
      '    return false;',
      '  }',
      '  const local = value.slice(0, at);',
      '  const domain = value.slice(at + 1);',
      '  // Literals, which are compiled once (a RegExp made here would be compiled on every call).',
      '  const dotAtom = isIdn',
      "    ? /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~\\u0080-\\u{10FFFF}-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~\\u0080-\\u{10FFFF}-]+)*$/u",
      "    : /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;",
      "  // A quoted local part: printable ASCII but '\"' and '\\', which are escaped, and in idn-email other characters too.",
      '  const quoted = isIdn',
      '    ? /^"(?:[\\x20\\x21\\x23-\\x5B\\x5D-\\x7E\\u0080-\\u{10FFFF}]|\\\\[\\x20-\\x7E])*"$/u',
      '    : /^"(?:[\\x20\\x21\\x23-\\x5B\\x5D-\\x7E]|\\\\[\\x20-\\x7E])*"$/;',
      '  if (!dotAtom.test(local) && !quoted.test(local)) {',
      '    return false;',
      '  }',
      '  const literal = domain.charCodeAt(0) === 0x5b ? /^\\[(?:IPv6:(.+)|(.+))\\]$/i.exec(domain) : null;',
      '  if (literal) {',
      '    return literal[1] !== undefined ? isIpv6(literal[1]) : isIpv4(literal[2]);',
      '  }',
      '  return isHost(domain);',
      '}',
    ].join('\n'),
  },
  isEmail: {
    calls: ['isHostname', 'isEmailWith'],
    source: ['function isEmail(value) {', '  return isEmailWith(value, false, isHostname);', '}'].join('\n'),
  },
  isIdnEmail: {
    calls: ['isIdnHostname', 'isEmailWith'],
    source: ['function isIdnEmail(value) {', '  return isEmailWith(value, true, isIdnHostname);', '}'].join('\n'),
  },
  isRegex: {
    calls: [],
    source: [
      'function isRegex(value) {',
      '  try {',
      "    RegExp(value, 'u');",
      '    return true;',
      '  } catch (e) {',
      '    return false;',
      '  }',
      '}',
    ].join('\n'),
  },
};

module.exports = { HELPER_SOURCES };

},
"@xufa/schema/src/standalone.js": function (module, exports, require) {
// Standalone code: compiled validators written out as JavaScript source, to save to a file when building and load like
// any module. Loading it generates no code (no new Function), so it runs under a strict Content Security Policy and
// where code generation is disabled, and it needs nothing else: the helpers it calls are written into it.
const { generateSource } = require('./compile');
const { fromJsonSchema } = require('./json-schema');
const { deepEqual } = require('./deep-equal');
const { codePointLength } = require('./types/code-point-length');
const { hasDuplicates } = require('./types/has-duplicates');
const { isPlainObject, toType } = require('./types/validate-type');
const { HELPER_SOURCES } = require('./standalone-helpers');
const { FORMAT_FUNCTIONS } = require('./formats');
const { errorObject, pathName } = require('./error-objects');
const { version } = require('../package.json');

// Library functions the generated code calls, by the name their source (standalone-helpers.js) defines: the helpers
// of the checks, and the functions of the formats.
const HELPERS = new Map([
  [codePointLength, 'codePointLength'],
  [deepEqual, 'deepEqual'],
  [hasDuplicates, 'hasDuplicates'],
  [pathName, 'pathName'],
  [errorObject, 'errorObject'],
  ...Object.entries(FORMAT_FUNCTIONS).map(([name, fn]) => [fn, name]),
]);

const RESERVED = new Set(
  (
    'break case catch class const continue debugger default delete do else enum export extends false finally for ' +
    'function if import in instanceof new null return super switch this throw true try typeof var void while with ' +
    'yield let static implements interface package private protected public await arguments eval undefined NaN ' +
    'Infinity module exports require'
  ).split(' ')
);

// Code for a value the generated code compares with: primitives, and arrays and plain objects of them.
function valueSource(value) {
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return 'NaN';
    }
    if (!Number.isFinite(value)) {
      return value > 0 ? 'Infinity' : '-Infinity';
    }
    return Object.is(value, -0) ? '-0' : String(value);
  }
  if (typeof value === 'bigint') {
    return `${value}n`;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${Array.from(value, (item, i) => (i in value ? valueSource(item) : '')).join(', ')}]`;
  }
  if (isPlainObject(value)) {
    // Computed keys, so a "__proto__" key is an own property, as JSON.parse() makes it.
    const entries = Object.entries(value).map(([key, item]) => `[${JSON.stringify(key)}]: ${valueSource(item)}`);
    return `{ ${entries.join(', ')} }`;
  }
  throw new Error(
    `Standalone code cannot contain the value ${String(value)}: only primitives, arrays and plain objects`
  );
}

// Code for a constant of the generated code, adding the names of the helpers it needs to `helpers`.
function constantSource(value, helpers) {
  if (typeof value === 'function') {
    const name = HELPERS.get(value);
    if (name === undefined && value.validatorKeyword !== undefined) {
      throw new Error(
        `Standalone code cannot contain the functions of the keyword "${value.validatorKeyword}": define it as a macro, or compile the schema with compileJsonSchema() instead`
      );
    }
    if (name === undefined) {
      throw new Error(`Standalone code cannot contain the function ${value.name || '(anonymous)'}`);
    }
    const add = (helper) => {
      helpers.add(helper);
      HELPER_SOURCES[helper].calls.forEach(add);
    };
    add(name);
    return name;
  }
  if (value instanceof RegExp) {
    return `new RegExp(${JSON.stringify(value.source)}, ${JSON.stringify(value.flags)})`;
  }
  if (value instanceof Set) {
    return `new Set([${Array.from(value, valueSource).join(', ')}])`;
  }
  return valueSource(value);
}

// An expression giving the validation function of `type`, as compileType(type, options) returns it.
function validatorSource(type, options, helpers) {
  const { mode, source, constants, nodes } = generateSource(toType(type, 'Standalone type'), options);
  if (nodes.length > 0) {
    const names = [...new Set(nodes.map((node) => node.constructor.name))].join(', ');
    throw new Error(
      `Standalone code cannot contain types of your own (${names}): their validate() runs when validating; compile them with compile() instead`
    );
  }
  const code = `const c = [${constants.map((value) => constantSource(value, helpers)).join(', ')}];\n`;
  const factory = `(function () {\n${code}${source}\n})()`;
  if (mode !== 'first') {
    return factory;
  }
  // The first error in a list, as compileType() gives it with allErrors: false.
  return `(function () {
const first = ${factory};
return function validate(value) {
const error = first(value);
return error === undefined ? [] : [error];
};
})()`;
}

// A module with the validators of `entries` ([name, type]): the one without name is the default export.
function moduleSource(entries, options) {
  const format = options.format === undefined ? 'commonjs' : options.format;
  if (format !== 'commonjs' && format !== 'esm') {
    throw new Error(`Unsupported standalone option "format": "${format}" is not "commonjs" or "esm"`);
  }
  const helpers = new Set();
  const validators = entries.map(([name, type]) => {
    if (name !== undefined && (!/^[A-Za-z_$][\w$]*$/.test(name) || RESERVED.has(name) || name === 'c')) {
      throw new Error(`Standalone validator name "${name}" is not a valid JavaScript name`);
    }
    return [name, validatorSource(type, options, helpers)];
  });
  const clash = validators.find(([name]) => helpers.has(name));
  if (clash) {
    throw new Error(`Standalone validator name "${clash[0]}" is the name of a helper of the generated code`);
  }
  let code = `// Generated by @xufa/schema ${version}: do not edit, generate it again instead.\n`;
  if (format === 'commonjs') {
    code += "'use strict';\n";
  }
  code += [...helpers].map((helper) => `${HELPER_SOURCES[helper].source}\n`).join('');
  validators.forEach(([name, source]) => {
    code += `const ${name === undefined ? 'validate' : name} = ${source};\n`;
  });
  const names = validators.map(([name]) => name).filter((name) => name !== undefined);
  if (names.length === 0) {
    code +=
      format === 'commonjs'
        ? 'module.exports = validate;\nmodule.exports.default = validate;\n'
        : 'export default validate;\n';
  } else {
    code += format === 'commonjs' ? `module.exports = { ${names.join(', ')} };\n` : `export { ${names.join(', ')} };\n`;
  }
  return code;
}

// Source of a module whose default export (module.exports in CommonJS) is the function compileType(type, options)
// returns. options: those of compile() (allErrors, errors), and format: 'commonjs' (default) or 'esm'.
function standaloneCode(type, options = {}) {
  return moduleSource([[undefined, type]], options);
}

// Source of a module exporting a validation function for each entry of `validators` ({ name: type }), with the
// options of standaloneCode().
function standaloneModule(validators, options = {}) {
  if (!isPlainObject(validators) || Object.keys(validators).length === 0) {
    throw new Error('standaloneModule() expects an object of types by the names to export them with');
  }
  return moduleSource(Object.entries(validators), options);
}

// standaloneCode() for a JSON Schema, with the options of compileJsonSchema() (schemas, draft) too.
function standaloneJsonSchema(json, options = {}) {
  return standaloneCode(fromJsonSchema(json, options), options);
}

module.exports = {
  standaloneCode,
  standaloneModule,
  standaloneJsonSchema,
};

},
"@xufa/schema/src/types/all-of.js": function (module, exports, require) {
const { ValidateType, toTypes } = require('./validate-type');

// Value must satisfy every type; reports the errors of the first type that fails.
class AllOfType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.types = toTypes(options.types, 'AllOf types') || [];
  }

  // The errors of every type the value fails. The field name goes to them as received: undefined for the value
  // itself, so a Schema names its keys as it does on its own.
  validate(value, fieldName = undefined) {
    const result = super.validate(value, fieldName || 'Value');
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      const errors = this.types.filter((type) => !type.isValid(value)).map((type) => type.errors(value, fieldName));
      if (errors.length <= 1) {
        return errors[0];
      }
      return errors.flat(Infinity);
    }
    return undefined;
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    for (let i = 0; i < this.types.length; i += 1) {
      if (!this.types[i].isValid(value)) {
        return false;
      }
    }
    return true;
  }
}

function AllOf(options) {
  return new AllOfType(options);
}

function allOf(types, isMandatory = true, isNullable = false) {
  if (types !== undefined && types !== null && !Array.isArray(types) && typeof types === 'object') {
    return new AllOfType(types);
  }
  return new AllOfType({ types, isMandatory, isNullable });
}

function oallOf(types, isMandatory = false, isNullable = false) {
  if (types !== undefined && types !== null && !Array.isArray(types) && typeof types === 'object') {
    return new AllOfType({ isMandatory: false, ...types });
  }
  return new AllOfType({ types, isMandatory, isNullable });
}

module.exports = {
  AllOfType,
  AllOf,
  allOf,
  oallOf,
};

},
"@xufa/schema/src/types/any-of.js": function (module, exports, require) {
const { ValidateType, toTypes } = require('./validate-type');

class AnyOfType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.types = toTypes(options.types, 'AnyOf types');
  }

  // The field name goes to the alternatives as received (see AllOfType.validate()).
  validate(value, fieldName = undefined) {
    const result = super.validate(value, fieldName || 'Value');
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      if (this.isValid(value)) {
        return undefined;
      }
      return this.types.map((type) => type.errors(value, fieldName));
    }
    return undefined;
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    if (!this.types || this.types.length === 0) {
      return true;
    }
    for (let i = 0; i < this.types.length; i += 1) {
      if (this.types[i].isValid(value)) {
        return true;
      }
    }
    return false;
  }
}

function AnyOf(options) {
  return new AnyOfType(options);
}

function anyOf(types, isMandatory = true, isNullable = false) {
  if (types !== undefined && types !== null && !Array.isArray(types) && typeof types === 'object') {
    return new AnyOfType(types);
  }
  return new AnyOfType({ types, isMandatory, isNullable });
}

function oanyOf(types, isMandatory = false, isNullable = false) {
  if (types !== undefined && types !== null && !Array.isArray(types) && typeof types === 'object') {
    return new AnyOfType({ isMandatory: false, ...types });
  }
  return new AnyOfType({ types, isMandatory, isNullable });
}

module.exports = {
  AnyOfType,
  AnyOf,
  anyOf,
  oanyOf,
};

},
"@xufa/schema/src/types/any.js": function (module, exports, require) {
const { ValidateType } = require('./validate-type');

class AnyType extends ValidateType {
  isValid(value) {
    return this.checkPresence(value) ?? true;
  }
}

function Any(options) {
  return new AnyType(options);
}

function any(isMandatory = true, isNullable = false) {
  if (isMandatory !== undefined && isMandatory !== null && typeof isMandatory === 'object') {
    return new AnyType(isMandatory);
  }
  return new AnyType({ isMandatory, isNullable });
}

function oany(isMandatory = false, isNullable = false) {
  if (isMandatory !== undefined && isMandatory !== null && typeof isMandatory === 'object') {
    return new AnyType({ isMandatory: false, ...isMandatory });
  }
  return new AnyType({ isMandatory, isNullable });
}

module.exports = {
  AnyType,
  Any,
  any,
  oany,
};

},
"@xufa/schema/src/types/array-of.js": function (module, exports, require) {
const { hasDuplicates } = require('./has-duplicates');
const { assignDefaults } = require('../defaults');
const { readCoerced } = require('../coerce');
const { ValidateType, isPlainObject, toType, toTypes } = require('./validate-type');

class ArrayOfType extends ValidateType {
  constructor(options = {}) {
    super(options);
    // A type for every element, or an array of types for the elements at each position (a tuple).
    this.type = Array.isArray(options.type)
      ? toTypes(options.type, 'ArrayOf type')
      : toType(options.type, 'ArrayOf type');
    this.min = options.min;
    this.max = options.max;
    // [{ key, value, empty }]: defaults assigned to missing positions of a tuple before checking it (useDefaults).
    this.defaults = options.defaults || [];
    this.unique = options.unique;
    // At least one element must satisfy it, or between minContains (default 1) and maxContains elements.
    this.contains = toType(options.contains, 'ArrayOf contains');
    this.minContains = options.minContains;
    this.maxContains = options.maxContains;
    // With a tuple, the elements after its last position must satisfy it.
    this.additionalType = toType(options.additionalType, 'ArrayOf additionalType');
  }

  // Number of elements matching contains, counted only as far as the limits need.
  countMatches(value) {
    const min = this.minContains === undefined ? 1 : this.minContains;
    const stop = this.maxContains === undefined ? min : this.maxContains + 1;
    let count = 0;
    for (let i = 0; i < value.length && count < stop; i += 1) {
      if (this.contains.isValid(value[i])) {
        count += 1;
      }
    }
    return count;
  }

  hasMatches(value) {
    const count = this.countMatches(value);
    const min = this.minContains === undefined ? 1 : this.minContains;
    return count >= min && (this.maxContains === undefined || count <= this.maxContains);
  }

  // Error of the elements matching contains, or undefined.
  containsError(value, fieldName) {
    const min = this.minContains === undefined ? 1 : this.minContains;
    const max = this.maxContains;
    const count = this.countMatches(value);
    if (count < min) {
      return min === 1
        ? `${fieldName} must contain at least one matching element`
        : `${fieldName} must contain at least ${min} matching elements`;
    }
    if (max !== undefined && count > max) {
      return max === 1
        ? `${fieldName} must contain at most one matching element`
        : `${fieldName} must contain at most ${max} matching elements`;
    }
    return undefined;
  }

  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      if (!Array.isArray(value)) {
        return `${fieldName} must be an array`;
      }
      if (this.defaults.length > 0) {
        assignDefaults(value, this.defaults);
      }
      if (this.min !== undefined && value.length < this.min) {
        return `${fieldName} must have at least ${this.min} elements`;
      }
      if (this.max !== undefined && value.length > this.max) {
        return `${fieldName} must have at most ${this.max} elements`;
      }
      if (this.unique && hasDuplicates(value)) {
        return `${fieldName} must not have duplicate elements`;
      }
      const containsError = this.contains && this.containsError(value, fieldName);
      if (containsError) {
        return containsError;
      }
      if (this.type) {
        const errors = [];
        const check = (type, i) => {
          // With coerceTypes, an element is converted to the types of its schema as it is read (see coerce.js).
          const item = readCoerced(value, i, type, value[i]);
          if (!type.isValid(item)) {
            errors.push(type.errors(item, `${fieldName}[${i}]`));
          }
        };
        if (Array.isArray(this.type)) {
          for (let i = 0; i < this.type.length; i += 1) {
            check(this.type[i], i);
          }
          if (this.additionalType) {
            for (let i = this.type.length; i < value.length; i += 1) {
              check(this.additionalType, i);
            }
          }
        } else {
          for (let i = 0; i < value.length; i += 1) {
            check(this.type, i);
          }
        }
        return errors.flat();
      }
    }
    return undefined;
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    if (Array.isArray(value) && this.defaults.length > 0) {
      assignDefaults(value, this.defaults);
    }
    if (
      !Array.isArray(value) ||
      (this.min !== undefined && value.length < this.min) ||
      (this.max !== undefined && value.length > this.max) ||
      (this.unique && hasDuplicates(value)) ||
      (this.contains && !this.hasMatches(value))
    ) {
      return false;
    }
    if (Array.isArray(this.type)) {
      for (let i = 0; i < this.type.length; i += 1) {
        if (!this.type[i].isValid(readCoerced(value, i, this.type[i], value[i]))) {
          return false;
        }
      }
      if (this.additionalType) {
        for (let i = this.type.length; i < value.length; i += 1) {
          if (!this.additionalType.isValid(readCoerced(value, i, this.additionalType, value[i]))) {
            return false;
          }
        }
      }
    } else if (this.type) {
      for (let i = 0; i < value.length; i += 1) {
        if (!this.type.isValid(readCoerced(value, i, this.type, value[i]))) {
          return false;
        }
      }
    }
    return true;
  }
}

function ArrayOf(options) {
  return new ArrayOfType(options);
}

const OPTION_KEYS = [
  'type',
  'min',
  'max',
  'unique',
  'contains',
  'minContains',
  'maxContains',
  'additionalType',
  'isMandatory',
  'isNullable',
];

// The first argument of arrOf() is the options when it is a plain object that is empty or has an option key;
// otherwise it is the type of the elements (a type, a schema, or a plain object of types).
function isOptions(value) {
  if (!isPlainObject(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === 0 || keys.some((key) => OPTION_KEYS.includes(key));
}

function arrOf(type, min, max, isMandatory = true, isNullable = false) {
  if (isOptions(type)) {
    return new ArrayOfType(type);
  }
  return new ArrayOfType({ type, min, max, isMandatory, isNullable });
}

function oarrOf(type, min, max, isMandatory = false, isNullable = false) {
  if (isOptions(type)) {
    return new ArrayOfType({ isMandatory: false, ...type });
  }
  return new ArrayOfType({ type, min, max, isMandatory, isNullable });
}

module.exports = {
  ArrayOfType,
  ArrayOf,
  arrOf,
  oarrOf,
};

},
"@xufa/schema/src/types/boolean.js": function (module, exports, require) {
const { ValidateType } = require('./validate-type');

class BooleanType extends ValidateType {
  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null && typeof value !== 'boolean') {
      return `${fieldName} must be a boolean`;
    }
    return undefined;
  }

  isValid(value) {
    return this.checkPresence(value) ?? typeof value === 'boolean';
  }
}

function Boolean(options) {
  return new BooleanType(options);
}

function bool(isMandatory = true, isNullable = false) {
  if (isMandatory !== undefined && isMandatory !== null && typeof isMandatory === 'object') {
    return new BooleanType(isMandatory);
  }
  return new BooleanType({ isMandatory, isNullable });
}

function obool(isMandatory = false, isNullable = false) {
  if (isMandatory !== undefined && isMandatory !== null && typeof isMandatory === 'object') {
    return new BooleanType({ isMandatory: false, ...isMandatory });
  }
  return new BooleanType({ isMandatory, isNullable });
}

module.exports = {
  BooleanType,
  Boolean,
  bool,
  obool,
};

},
"@xufa/schema/src/types/code-point-length.js": function (module, exports, require) {
// Length in Unicode code points, as JSON Schema counts it: a surrogate pair is one character. Same as [...value].length
// without building an array.
function codePointLength(value) {
  let count = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i += 1;
      }
    }
    count += 1;
  }
  return count;
}

// A string has between length / 2 and length code points, so the UTF-16 length decides the comparison unless it is
// close to the limit; only then are code points counted.
function hasFewerCodePoints(value, min) {
  return value.length < min || (value.length < 2 * min && codePointLength(value) < min);
}

function hasMoreCodePoints(value, max) {
  return value.length > 2 * max || (value.length > max && codePointLength(value) > max);
}

module.exports = {
  codePointLength,
  hasFewerCodePoints,
  hasMoreCodePoints,
};

},
"@xufa/schema/src/types/conditional.js": function (module, exports, require) {
const { ValidateType, toType } = require('./validate-type');

// When the value satisfies `ifType` it must satisfy `thenType`, otherwise `elseType`; a missing branch accepts
// anything. Only the errors of the branch are reported, like JSON Schema if/then/else.
class ConditionalType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.ifType = toType(options.ifType, 'Conditional ifType');
    this.thenType = toType(options.thenType, 'Conditional thenType');
    this.elseType = toType(options.elseType, 'Conditional elseType');
  }

  branch(value) {
    return this.ifType.isValid(value) ? this.thenType : this.elseType;
  }

  // The field name goes to the branch as received (see AllOfType.validate()).
  validate(value, fieldName = undefined) {
    const result = super.validate(value, fieldName || 'Value');
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      const branch = this.branch(value);
      if (branch && !branch.isValid(value)) {
        return branch.errors(value, fieldName);
      }
    }
    return undefined;
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    const branch = this.branch(value);
    return !branch || branch.isValid(value);
  }
}

function Conditional(options) {
  return new ConditionalType(options);
}

module.exports = {
  ConditionalType,
  Conditional,
};

},
"@xufa/schema/src/types/enum.js": function (module, exports, require) {
const { StringType } = require('./string');

class EnumType extends StringType {
  constructor(options = {}) {
    super(options);
    this.options = options.options;
  }

  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      if (!this.options.includes(value)) {
        return `${fieldName} must be one of: ${this.options.join(', ')}`;
      }
    }
    return undefined;
  }

  isValid(value) {
    return super.isValid(value) && (value === undefined || value === null || this.options.includes(value));
  }
}

function Enum(options) {
  return new EnumType(options);
}

function enumt(options, isMandatory = true, isNullable = false) {
  if (options !== undefined && options !== null && !Array.isArray(options) && typeof options === 'object') {
    return new EnumType(options);
  }
  return new EnumType({ options, isMandatory, isNullable });
}

function oenumt(options, isMandatory = false, isNullable = false) {
  if (options !== undefined && options !== null && !Array.isArray(options) && typeof options === 'object') {
    return new EnumType({ isMandatory: false, ...options });
  }
  return new EnumType({ options, isMandatory, isNullable });
}

module.exports = {
  EnumType,
  Enum,
  enumt,
  oenumt,
  oenum: oenumt,
};

},
"@xufa/schema/src/types/float.js": function (module, exports, require) {
const { ValidateType } = require('./validate-type');

class FloatType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.min = options.min;
    this.max = options.max;
    this.exclusiveMin = options.exclusiveMin;
    this.exclusiveMax = options.exclusiveMax;
    // Value divided by it must be an integer (floating point division, so 0.3 is not a multiple of 0.1), or with
    // multipleOfPrecision (a number of decimal digits) within 1e-multipleOfPrecision of one, as ajv's option.
    this.multipleOf = options.multipleOf;
    this.multipleOfPrecision = options.multipleOfPrecision;
  }

  isMultiple(value) {
    const division = value / this.multipleOf;
    if (this.multipleOfPrecision === undefined) {
      return Number.isInteger(division);
    }
    // As ajv writes it: a division that is not finite is not "too far" from an integer.
    return !(Math.abs(Math.round(division) - division) > Number(`1e-${this.multipleOfPrecision}`));
  }

  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `${fieldName} must be a number`;
      }
      if (this.min !== undefined && value < this.min) {
        return `${fieldName} must be at least ${this.min}`;
      }
      if (this.max !== undefined && value > this.max) {
        return `${fieldName} must be at most ${this.max}`;
      }
      if (this.exclusiveMin !== undefined && value <= this.exclusiveMin) {
        return `${fieldName} must be greater than ${this.exclusiveMin}`;
      }
      if (this.exclusiveMax !== undefined && value >= this.exclusiveMax) {
        return `${fieldName} must be less than ${this.exclusiveMax}`;
      }
      if (this.multipleOf !== undefined && !this.isMultiple(value)) {
        return `${fieldName} must be a multiple of ${this.multipleOf}`;
      }
    }
    return undefined;
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      (this.min === undefined || value >= this.min) &&
      (this.max === undefined || value <= this.max) &&
      (this.exclusiveMin === undefined || value > this.exclusiveMin) &&
      (this.exclusiveMax === undefined || value < this.exclusiveMax) &&
      (this.multipleOf === undefined || this.isMultiple(value))
    );
  }
}

function Float(options) {
  return new FloatType(options);
}

function float(min, max, isMandatory = true, isNullable = false) {
  if (min !== undefined && min !== null && typeof min === 'object') {
    return new FloatType(min);
  }
  return new FloatType({ min, max, isMandatory, isNullable });
}

function ofloat(min, max, isMandatory = false, isNullable = false) {
  if (min !== undefined && min !== null && typeof min === 'object') {
    return new FloatType({ isMandatory: false, ...min });
  }
  return new FloatType({ min, max, isMandatory, isNullable });
}

module.exports = {
  FloatType,
  Float,
  float,
  ofloat,
  num: float,
  onum: ofloat,
};

},
"@xufa/schema/src/types/has-duplicates.js": function (module, exports, require) {
const { deepEqual } = require('../deep-equal');

// An element is a duplicate when an earlier index (holes read as undefined) is deep-equal to it.
// Primitive arrays use a Set, which has the same equality as deepEqual for primitives (NaN included).
function hasDuplicates(value) {
  if (value.some((item) => item !== null && typeof item === 'object')) {
    return value.some((item, i) => value.findIndex((other) => deepEqual(item, other)) !== i);
  }
  const seen = new Set();
  for (let i = 0; i < value.length; i += 1) {
    if (i in value && seen.has(value[i])) {
      return true;
    }
    seen.add(value[i]);
  }
  return false;
}

module.exports = {
  hasDuplicates,
};

},
"@xufa/schema/src/types/index.js": function (module, exports, require) {
const allOf = require('./all-of');
const any = require('./any');
const anyOf = require('./any-of');
const arrayOf = require('./array-of');
const boolean = require('./boolean');
const conditional = require('./conditional');
const enums = require('./enum');
const float = require('./float');
const integer = require('./integer');
const keyword = require('./keyword');
const never = require('./never');
const not = require('./not');
const obj = require('./obj');
const oneOf = require('./one-of');
const ref = require('./ref');
const string = require('./string');
const validateType = require('./validate-type');
const values = require('./values');
const when = require('./when');

module.exports = {
  ...allOf,
  ...any,
  ...anyOf,
  ...arrayOf,
  ...boolean,
  ...conditional,
  ...enums,
  ...float,
  ...integer,
  ...keyword,
  ...never,
  ...not,
  ...obj,
  ...oneOf,
  ...ref,
  ...string,
  ...validateType,
  ...values,
  ...when,
};

},
"@xufa/schema/src/types/integer.js": function (module, exports, require) {
const { FloatType } = require('./float');

class IntegerType extends FloatType {
  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      if (!Number.isInteger(value)) {
        return `${fieldName} must be an integer`;
      }
    }
    return undefined;
  }

  isValid(value) {
    return super.isValid(value) && (value === undefined || value === null || Number.isInteger(value));
  }
}

function Integer(options) {
  return new IntegerType(options);
}

function int(min, max, isMandatory = true, isNullable = false) {
  if (min !== undefined && min !== null && typeof min === 'object') {
    return new IntegerType(min);
  }
  return new IntegerType({ min, max, isMandatory, isNullable });
}

function oint(min, max, isMandatory = false, isNullable = false) {
  if (min !== undefined && min !== null && typeof min === 'object') {
    return new IntegerType({ isMandatory: false, ...min });
  }
  return new IntegerType({ min, max, isMandatory, isNullable });
}

module.exports = {
  IntegerType,
  Integer,
  int,
  oint,
};

},
"@xufa/schema/src/types/keyword.js": function (module, exports, require) {
const { ValidateType } = require('./validate-type');

// Tests of the JSON types a keyword of your own can be limited to. null never reaches them: whether a node accepts null
// is worked out when converting (see acceptsNull() in json-schema.js).
const KEYWORD_TYPE_TESTS = {
  string: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number',
  integer: (value) => Number.isInteger(value),
  boolean: (value) => typeof value === 'boolean',
  object: (value) => typeof value === 'object' && !Array.isArray(value),
  array: (value) => Array.isArray(value),
  null: (value) => value === null,
};

// A keyword of your own (the option "keywords" of compileJsonSchema()): `check`, a function or a regular expression,
// tells whether the value passes it, and `message` gives the text after the name of the value, or `message(value)`
// does. With `jsonTypes`, it only checks values of those JSON types, as the keywords of JSON Schema do.
class KeywordType extends ValidateType {
  constructor(options = {}) {
    super(options);
    if (typeof options.check !== 'function' && !(options.check instanceof RegExp)) {
      throw new Error('KeywordType check must be a function or a regular expression');
    }
    this.keyword = options.keyword;
    this.check = options.check;
    this.message = options.message;
    this.jsonTypes = options.jsonTypes;
  }

  // Whether the keyword checks the value (neither undefined nor null).
  applies(value) {
    return !this.jsonTypes || this.jsonTypes.some((jsonType) => KEYWORD_TYPE_TESTS[jsonType](value));
  }

  passes(value) {
    return this.check instanceof RegExp ? this.check.test(value) : Boolean(this.check(value));
  }

  messageOf(value) {
    return typeof this.message === 'function' ? this.message(value) : this.message;
  }

  validate(value, fieldName = undefined) {
    const name = fieldName || 'Value';
    const result = super.validate(value, name);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null && this.applies(value) && !this.passes(value)) {
      return `${name} ${this.messageOf(value)}`;
    }
    return undefined;
  }

  isValid(value) {
    return this.checkPresence(value) ?? (!this.applies(value) || this.passes(value));
  }
}

module.exports = {
  KeywordType,
  KEYWORD_TYPE_TESTS,
};

},
"@xufa/schema/src/types/never.js": function (module, exports, require) {
const { ValidateType } = require('./validate-type');

// No value is valid, like the JSON Schema false: only undefined (when not mandatory) and null (when nullable) pass.
class NeverType extends ValidateType {
  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      return `${fieldName} is not allowed`;
    }
    return undefined;
  }

  isValid(value) {
    return this.checkPresence(value) ?? false;
  }
}

function Never(options) {
  return new NeverType(options);
}

function never(isMandatory = false, isNullable = false) {
  if (isMandatory !== undefined && isMandatory !== null && typeof isMandatory === 'object') {
    return new NeverType({ isMandatory: false, ...isMandatory });
  }
  return new NeverType({ isMandatory, isNullable });
}

module.exports = {
  NeverType,
  Never,
  never,
};

},
"@xufa/schema/src/types/not.js": function (module, exports, require) {
const { ValidateType, toType } = require('./validate-type');

// Value must not satisfy `type`.
class NotType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.type = toType(options.type, 'Not type');
  }

  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null && this.type.isValid(value)) {
      return `${fieldName} must not match the excluded schema`;
    }
    return undefined;
  }

  isValid(value) {
    return this.checkPresence(value) ?? !this.type.isValid(value);
  }
}

function Not(options) {
  return new NotType(options);
}

function not(type, isMandatory = true, isNullable = false) {
  if (type !== undefined && type !== null && !(type instanceof ValidateType) && typeof type === 'object') {
    return new NotType(type);
  }
  return new NotType({ type, isMandatory, isNullable });
}

function onot(type, isMandatory = false, isNullable = false) {
  if (type !== undefined && type !== null && !(type instanceof ValidateType) && typeof type === 'object') {
    return new NotType({ isMandatory: false, ...type });
  }
  return new NotType({ type, isMandatory, isNullable });
}

module.exports = {
  NotType,
  Not,
  not,
  onot,
};

},
"@xufa/schema/src/types/obj.js": function (module, exports, require) {
const { ValidateType, toType } = require('./validate-type');

class ObjType extends ValidateType {
  constructor(options = {}) {
    super(options);
    // The shape as given, which a Schema around it turns into a nested schema with its options (see visitObjs()), and
    // the type it stands for: a plain object of types is a Schema.
    this.shape = options.schema;
    this.schema = toType(options.schema, 'Obj schema');
  }

  // The field name goes to the schema as received (see AllOfType.validate()).
  validate(value, fieldName = undefined) {
    const name = fieldName || 'Value';
    const result = super.validate(value, name);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      if (typeof value !== 'object' || Array.isArray(value)) {
        return `${name} must be an object`;
      }
      if (this.schema) return this.schema.validate(value, fieldName);
    }
    return undefined;
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    return !this.schema || this.schema.isValid(value);
  }
}

function Obj(options) {
  return new ObjType(options);
}

const OPTION_KEYS = ['schema', 'isMandatory', 'isNullable'];

// The first argument of obj() is the options when it is a plain object that is empty or has an option key; otherwise
// it is the shape of the object (a plain object of types), like arrOf().
const isOptions = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof ValidateType) &&
  (Object.keys(value).length === 0 || Object.keys(value).some((key) => OPTION_KEYS.includes(key)));

function obj(schema, isMandatory = true, isNullable = false) {
  if (isOptions(schema)) {
    return new ObjType(schema);
  }
  return new ObjType({ schema, isMandatory, isNullable });
}

function oobj(schema, isMandatory = false, isNullable = false) {
  if (isOptions(schema)) {
    return new ObjType({ isMandatory: false, ...schema });
  }
  return new ObjType({ schema, isMandatory, isNullable });
}

module.exports = {
  ObjType,
  Obj,
  obj,
  oobj,
};

},
"@xufa/schema/src/types/one-of.js": function (module, exports, require) {
const { ValidateType, toTypes } = require('./validate-type');

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// What a discriminator picks for a value (see OneOfType.pick()): no type (the value is invalid), or every type as
// oneOf checks them.
const NO_TYPE = -1;
const EVERY_TYPE = -2;

// Value must satisfy exactly one of the types. When none does, reports the errors of every type, like AnyOfType.
// With `discriminator` ({ tag, mapping, exact, auto }: the index of the type for each value of the property `tag`), an
// object is checked only against the type its value of `tag` picks (see discriminatorOf() in json-schema.js).
class OneOfType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.types = toTypes(options.types, 'OneOf types') || [];
    this.discriminator = options.discriminator;
  }

  // The index of the type a discriminator picks for the value: the one the value of its tag (an own property) names;
  // NO_TYPE for an object whose tag names none; EVERY_TYPE without a discriminator, for other values, and for an
  // object whose tag names none when the discriminator was found in a plain oneOf (`auto`), which checks it as oneOf.
  pick(value) {
    if (!this.discriminator || !isObject(value)) {
      return EVERY_TYPE;
    }
    const { tag, mapping, auto } = this.discriminator;
    const tagValue = Object.prototype.hasOwnProperty.call(value, tag) ? value[tag] : undefined;
    if (typeof tagValue === 'string' && mapping.has(tagValue)) {
      return mapping.get(tagValue);
    }
    return auto ? EVERY_TYPE : NO_TYPE;
  }

  // The error about the tag of an object whose tag names no type, after the name of the tag.
  tagError(value) {
    const { tag, mapping } = this.discriminator;
    const tagValue = Object.prototype.hasOwnProperty.call(value, tag) ? value[tag] : undefined;
    if (tagValue === undefined) {
      return ' is mandatory';
    }
    if (typeof tagValue !== 'string') {
      return ' must be a string';
    }
    const values = [...mapping.keys()];
    return values.length === 1 ? ` must be equal to ${values[0]}` : ` must be one of: ${values.join(', ')}`;
  }

  // Number of types the value satisfies, counting up to 2.
  countMatches(value) {
    let matches = 0;
    for (let i = 0; i < this.types.length && matches < 2; i += 1) {
      if (this.types[i].isValid(value)) {
        matches += 1;
      }
    }
    return matches;
  }

  // The field name goes to the alternatives as received (see AllOfType.validate()).
  validate(value, fieldName = undefined) {
    const name = fieldName || 'Value';
    const result = super.validate(value, name);
    if (result) {
      return result;
    }
    const picked = this.pick(value);
    if (picked === NO_TYPE) {
      const { tag } = this.discriminator;
      return `${fieldName ? `${fieldName}.${tag}` : tag}${this.tagError(value)}`;
    }
    if (picked !== EVERY_TYPE) {
      return this.types[picked].validate(value, fieldName);
    }
    if (value !== undefined && value !== null) {
      const matches = this.countMatches(value);
      if (this.types.length === 0) {
        return `${name} must match exactly one schema, but matches none`;
      }
      if (matches === 0) {
        return this.types.map((type) => type.errors(value, fieldName));
      }
      if (matches > 1) {
        return `${name} must match exactly one schema, but matches more than one`;
      }
    }
    return undefined;
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    const picked = this.pick(value);
    if (picked === EVERY_TYPE) {
      return this.countMatches(value) === 1;
    }
    return picked !== NO_TYPE && this.types[picked].isValid(value);
  }
}

function OneOf(options) {
  return new OneOfType(options);
}

function oneOf(types, isMandatory = true, isNullable = false) {
  if (types !== undefined && types !== null && !Array.isArray(types) && typeof types === 'object') {
    return new OneOfType(types);
  }
  return new OneOfType({ types, isMandatory, isNullable });
}

function ooneOf(types, isMandatory = false, isNullable = false) {
  if (types !== undefined && types !== null && !Array.isArray(types) && typeof types === 'object') {
    return new OneOfType({ isMandatory: false, ...types });
  }
  return new OneOfType({ types, isMandatory, isNullable });
}

module.exports = {
  OneOfType,
  NO_TYPE,
  EVERY_TYPE,
  OneOf,
  oneOf,
  ooneOf,
};

},
"@xufa/schema/src/types/ref.js": function (module, exports, require) {
const { ValidateType, toType } = require('./validate-type');

// Validates with the type it refers to, which is set once references are resolved; recursive schemas refer back to a
// type that contains the reference. Only undefined is handled here (isMandatory); null and other values go to the
// target. The field name is passed through unchanged, so the reference does not show in messages.
class RefType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.ref = options.ref;
    this.target = toType(options.target, 'Ref target');
  }

  getTarget() {
    if (!this.target) {
      throw new Error(`Reference "${this.ref}" is not resolved`);
    }
    return this.target;
  }

  validate(value, fieldName) {
    if (value === undefined) {
      return super.validate(value, fieldName);
    }
    return this.getTarget().validate(value, fieldName);
  }

  errors(value, fieldName) {
    if (value === undefined) {
      return super.validate(value, fieldName);
    }
    return this.getTarget().errors(value, fieldName);
  }

  isValid(value) {
    if (value === undefined) {
      return !this.isMandatory;
    }
    return this.getTarget().isValid(value);
  }
}

function Ref(options) {
  return new RefType(options);
}

module.exports = {
  RefType,
  Ref,
};

},
"@xufa/schema/src/types/string.js": function (module, exports, require) {
const { hasFewerCodePoints, hasMoreCodePoints } = require('./code-point-length');
const { ValidateType } = require('./validate-type');
const { FORMATS, matchesFormat } = require('../formats');

// The limits of a format: how a comparison fails them (a comparison that is undefined never does), the text of their
// error, and their comparison in ajv's params.
const FORMAT_LIMITS = {
  formatMinimum: { fails: (result) => result < 0, text: 'at least', comparison: '>=' },
  formatMaximum: { fails: (result) => result > 0, text: 'at most', comparison: '<=' },
  formatExclusiveMinimum: { fails: (result) => result <= 0, text: 'greater than', comparison: '>' },
  formatExclusiveMaximum: { fails: (result) => result >= 0, text: 'less than', comparison: '<' },
};

class StringType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.min = options.min;
    this.max = options.max;
    this.pattern = options.pattern;
    this.allowEmpty = options.allowEmpty;
    // Count min/max in Unicode code points (as JSON Schema does) instead of UTF-16 units.
    this.countCodePoints = options.countCodePoints;
    // A format the string must have: the name of a built-in one (formats.js), or with `formatCheck` (a function or a
    // regular expression) one of the JSON Schema option "formats".
    this.format = options.format;
    this.formatCheck = options.formatCheck;
    if (this.format !== undefined && this.formatCheck === undefined) {
      if (!Object.prototype.hasOwnProperty.call(FORMATS, this.format)) {
        throw new Error(`Unknown String format "${this.format}": use one of ${Object.keys(FORMATS).join(', ')}`);
      }
      this.formatCheck = FORMATS[this.format];
    }
    // [{ keyword, limit, compare }]: limits of the value of the format (formatMinimum, formatMaximum,
    // formatExclusiveMinimum and formatExclusiveMaximum), checked with compare(value, limit) after the format.
    this.formatLimits = options.formatLimits || [];
  }

  // The first limit of the format the value does not satisfy, or undefined.
  failedLimit(value) {
    return this.formatLimits.find(({ keyword, limit, compare }) => FORMAT_LIMITS[keyword].fails(compare(value, limit)));
  }

  hasFormat(value) {
    return this.formatCheck === undefined || matchesFormat(this.formatCheck, value);
  }

  isTooShort(value) {
    return this.countCodePoints ? hasFewerCodePoints(value, this.min) : value.length < this.min;
  }

  isTooLong(value) {
    return this.countCodePoints ? hasMoreCodePoints(value, this.max) : value.length > this.max;
  }

  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      if (typeof value !== 'string') {
        return `${fieldName} must be a string`;
      }
      const skipMin = value.length === 0 && (this.allowEmpty ?? !this.isMandatory);
      if (this.min !== undefined && !skipMin && this.isTooShort(value)) {
        return `${fieldName} must be at least ${this.min} characters long`;
      }
      if (this.max !== undefined && this.isTooLong(value)) {
        return `${fieldName} must be at most ${this.max} characters long`;
      }
      if (this.pattern && !this.pattern.test(value)) {
        return `${fieldName} does not match the required pattern`;
      }
      if (!this.hasFormat(value)) {
        return `${fieldName} must be a valid ${this.format}`;
      }
      const failed = this.failedLimit(value);
      if (failed) {
        return `${fieldName} must be ${FORMAT_LIMITS[failed.keyword].text} ${failed.limit}`;
      }
    }
    return undefined;
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    if (typeof value !== 'string') {
      return false;
    }
    const skipMin = value.length === 0 && (this.allowEmpty ?? !this.isMandatory);
    return (
      (this.min === undefined || skipMin || !this.isTooShort(value)) &&
      (this.max === undefined || !this.isTooLong(value)) &&
      (!this.pattern || this.pattern.test(value)) &&
      this.hasFormat(value) &&
      this.failedLimit(value) === undefined
    );
  }
}

function String(options) {
  return new StringType(options);
}

function str(min, max, isMandatory = true, isNullable = false) {
  if (min !== undefined && min !== null && typeof min === 'object') {
    return new StringType(min);
  }
  return new StringType({ min, max, isMandatory, isNullable });
}

function ostr(min, max, isMandatory = false, isNullable = false) {
  if (min !== undefined && min !== null && typeof min === 'object') {
    return new StringType({ isMandatory: false, ...min });
  }
  return new StringType({ min, max, isMandatory, isNullable });
}

module.exports = {
  FORMAT_LIMITS,
  StringType,
  String,
  str,
  ostr,
};

},
"@xufa/schema/src/types/validate-type.js": function (module, exports, require) {
// A validate() result is undefined (valid), a string (one error) or a possibly empty array of errors.
function hasErrors(result) {
  if (!Array.isArray(result)) {
    return Boolean(result);
  }
  for (let i = 0; i < result.length; i += 1) {
    const item = result[i];
    if (!Array.isArray(item) || hasErrors(item)) {
      return true;
    }
  }
  return false;
}

class ValidateType {
  constructor(options = {}) {
    this.isMandatory = options.isMandatory !== undefined ? options.isMandatory : true;
    this.isNullable = options.isNullable !== undefined ? options.isNullable : false;
  }

  validate(value, fieldName = 'Value') {
    if (this.isMandatory && value === undefined) {
      return `${fieldName} is mandatory`;
    }
    if (!this.isNullable && value === null) {
      return `${fieldName} cannot be null`;
    }
    return undefined;
  }

  // Fast boolean check equivalent to !hasErrors(this.validate(value)) that builds no messages.
  // Built-in types override it; custom subclasses that only override validate() fall back to it.
  isValid(value) {
    return !hasErrors(this.validate(value));
  }

  // Error messages of a value already known to be invalid; containers call it on their failing children
  // so types whose validate() starts with an isValid() fast path can skip it. The field name goes to validate() as
  // received, which names the value "Value" when there is none.
  errors(value, fieldName = undefined) {
    return this.validate(value, fieldName);
  }

  // Compiles the type into generated code, several times faster than validate(): see compileType() in compile.js for
  // the options. The compiled function does not see changes made to the type afterwards.
  compile(options = {}) {
    // eslint-disable-next-line global-require -- compile.js requires this module
    return require('../compile').compileType(this, options);
  }

  // Presence part of isValid: a boolean when undefined/null decide the result, undefined otherwise.
  checkPresence(value) {
    if (value === undefined) {
      return !this.isMandatory;
    }
    if (value === null) {
      return this.isNullable;
    }
    return undefined;
  }

  mandatory(isMandatory = true) {
    this.isMandatory = isMandatory;
    return this;
  }

  nullable(isNullable = true) {
    this.isNullable = isNullable;
    return this;
  }

  optional() {
    this.isMandatory = false;
    return this;
  }

  required() {
    this.isMandatory = true;
    return this;
  }

  notNull() {
    this.isNullable = false;
    return this;
  }
}

// The messages of a validate() result as a flat list, each one once: parts of an allOf, or alternatives, can report
// the same error.
function toErrors(result) {
  if (Array.isArray(result)) {
    return Array.from(new Set(result.flat(Infinity)));
  }
  return result ? [result] : [];
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Normalizes an option that holds a type. A plain object stands for new Schema(object), as it does for a key of a
// Schema; other objects (types, schemas) are kept; anything else throws now instead of failing when validating.
function toType(value, name) {
  if (value === undefined || value instanceof ValidateType) {
    return value;
  }
  if (isPlainObject(value)) {
    // eslint-disable-next-line global-require -- schema.js requires this module
    const { Schema } = require('../schema');
    return new Schema(value);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be a type or an object of types`);
  }
  return value;
}

function toTypes(values, name) {
  if (values === undefined) {
    return values;
  }
  if (!Array.isArray(values)) {
    throw new TypeError(`${name} must be an array of types`);
  }
  return values.map((value, i) => toType(value, `${name}[${i}]`));
}

module.exports = {
  ValidateType,
  hasErrors,
  toErrors,
  isPlainObject,
  toType,
  toTypes,
};

},
"@xufa/schema/src/types/values.js": function (module, exports, require) {
const { deepEqual } = require('../deep-equal');
const { ValidateType } = require('./validate-type');

function formatValue(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// Value must be deep-equal to one of the given values, whatever their type.
class ValuesType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.values = options.values || [];
  }

  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null && !this.values.some((item) => deepEqual(item, value))) {
      if (this.values.length === 1) {
        return `${fieldName} must be equal to ${formatValue(this.values[0])}`;
      }
      return `${fieldName} must be one of: ${this.values.map(formatValue).join(', ')}`;
    }
    return undefined;
  }

  isValid(value) {
    return this.checkPresence(value) ?? this.values.some((item) => deepEqual(item, value));
  }
}

function Values(options) {
  return new ValuesType(options);
}

function Const(value, options = {}) {
  return new ValuesType({ ...options, values: [value] });
}

module.exports = {
  ValuesType,
  Values,
  Const,
};

},
"@xufa/schema/src/types/when.js": function (module, exports, require) {
const { ValidateType, toType } = require('./validate-type');

const JSON_TYPES = ['object', 'array', 'string', 'number'];

function isJsonType(value, jsonType) {
  switch (jsonType) {
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    default:
      return typeof value === 'number';
  }
}

// Checks the value with `type` only when it has the given JSON type (object, array, string or number); values of
// other types are valid. This is how JSON Schema applies keywords such as minimum or properties when no "type" is
// declared. The field name is passed through unchanged, so the wrapper does not show in messages.
class WhenType extends ValidateType {
  constructor(options = {}) {
    super(options);
    if (!JSON_TYPES.includes(options.jsonType)) {
      throw new Error(`WhenType jsonType must be one of: ${JSON_TYPES.join(', ')}`);
    }
    this.jsonType = options.jsonType;
    this.type = toType(options.type, 'When type');
  }

  validate(value, fieldName) {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null && isJsonType(value, this.jsonType)) {
      return this.type.validate(value, fieldName);
    }
    return undefined;
  }

  errors(value, fieldName) {
    return this.validate(value, fieldName);
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    return !isJsonType(value, this.jsonType) || this.type.isValid(value);
  }
}

function When(options) {
  return new WhenType(options);
}

module.exports = {
  WhenType,
  When,
  isJsonType,
};

},
"@xufa/schema/src/unevaluated.js": function (module, exports, require) {
// "unevaluatedProperties" and "unevaluatedItems" (JSON Schema 2019-09 and 2020-12): the keys or elements of a value
// that no other keyword of the schema evaluated must satisfy a schema. Which ones were evaluated depends on the value:
// a keyword such as "properties" evaluates the keys it names, and an applicator ("anyOf", "oneOf", "if", "$ref",
// "dependentSchemas") passes on what its subschemas evaluated, but only from the ones the value satisfies. "allOf"
// passes on what all of them evaluate: when one fails, the allOf fails, so what it evaluated never counts.
// When what the other keywords evaluate does not depend on the value, staticEvaluated() gives it to the compiler.
const { Schema } = require('./schema');
const { ClosedSchema } = require('./closed-schema');
const {
  AllOfType,
  AnyOfType,
  ArrayOfType,
  ConditionalType,
  NeverType,
  OneOfType,
  RefType,
  ValidateType,
  WhenType,
  isJsonType,
} = require('./types');
const { NO_TYPE, EVERY_TYPE } = require('./types/one-of');

// What a type evaluated: true for everything, or a Set of keys (or of element indexes).
const ALL = true;

// Kinds of element: keys of objects or indexes of arrays.
const JSON_TYPES = { properties: 'object', items: 'array' };

function merge(target, result) {
  if (result === ALL || target === ALL) {
    return ALL;
  }
  result.forEach((item) => target.add(item));
  return target;
}

// What `type` evaluates of `value`, for kind 'properties' or 'items'. `seen` holds the references being followed with
// their values, to stop at cycles.
let evaluated;

const evaluatedByAll = (kind, types, value, seen) =>
  types.reduce((result, item) => merge(result, evaluated(kind, item, value, seen)), new Set());

// Keys of the object `value` that a Schema evaluates: the ones "properties" names or a pattern matches, all of them
// with "additionalProperties", and what the "dependentSchemas" of its present keys evaluate.
function schemaKeys(type, value, seen) {
  if (type.evaluatesAllKeys || !type.isOpen || type.additionalType) {
    return ALL;
  }
  const declared = type.propertyKeys ? new Set(type.propertyKeys) : type.keySet;
  let keys = new Set();
  Object.keys(value).forEach((key) => {
    if (declared.has(key) || type.patternTypes.some(({ pattern }) => pattern.test(key))) {
      keys.add(key);
    }
  });
  type.dependencies.forEach((dependency) => {
    const isPresent = Object.prototype.hasOwnProperty.call(value, dependency.key);
    if (dependency.type && isPresent && dependency.type.isValid(value)) {
      keys = merge(keys, evaluated('properties', dependency.type, value, seen));
    }
  });
  return keys;
}

// Indexes of the array `value` that an ArrayOf evaluates: the positions of a tuple, all of them with a type for every
// element or after the tuple, and in draft 2020-12 the ones that match "contains".
function arrayItems(type, value) {
  if ((type.type && !Array.isArray(type.type)) || type.additionalType) {
    return ALL;
  }
  const items = new Set();
  if (Array.isArray(type.type)) {
    for (let i = 0; i < Math.min(type.type.length, value.length); i += 1) {
      items.add(i);
    }
  }
  if (type.contains && type.containsEvaluates) {
    value.forEach((item, i) => {
      if (type.contains.isValid(item)) {
        items.add(i);
      }
    });
  }
  return items;
}

// Checks the keys or elements of a value that the other keywords of its schema, `siblings`, leave: they must satisfy
// `type`. `kind` is 'properties' or 'items'. It checks only values of the JSON type of its kind.
class UnevaluatedType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.kind = options.kind;
    this.jsonType = JSON_TYPES[options.kind];
    this.siblings = options.siblings || [];
    this.type = options.type;
  }

  // Keys or indexes that the siblings do not evaluate. What the siblings evaluate counts even from the ones that fail,
  // so an invalid property is reported once, by the keyword that checks it.
  unevaluated(value) {
    const done = evaluatedByAll(this.kind, this.siblings, value, []);
    if (done === ALL) {
      return [];
    }
    const elements = this.kind === 'properties' ? Object.keys(value) : value.map((item, i) => i);
    return elements.filter((element) => !done.has(element));
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    if (!isJsonType(value, this.jsonType)) {
      return true;
    }
    return this.unevaluated(value).every((element) => this.type.isValid(value[element]));
  }

  // Keys are named like the keys of a Schema, and a key no schema allows like its "additionalProperties": false.
  errors(value, fieldName) {
    const presence = super.validate(value, fieldName || 'Value');
    if (presence !== undefined) {
      return presence;
    }
    if (!isJsonType(value, this.jsonType)) {
      return [];
    }
    return this.unevaluated(value)
      .filter((element) => !this.type.isValid(value[element]))
      .map((element) => {
        if (this.kind === 'items') {
          return this.type.errors(value[element], `${fieldName || 'Value'}[${element}]`);
        }
        const keyName = fieldName ? `${fieldName}.${element}` : element;
        return this.type instanceof NeverType
          ? `Unexpected key: ${keyName}`
          : this.type.errors(value[element], keyName);
      });
  }

  validate(value, fieldName) {
    return this.isValid(value) ? undefined : this.errors(value, fieldName);
  }
}

evaluated = (kind, type, value, seen = []) => {
  switch (type.constructor) {
    case Schema:
    case ClosedSchema:
      return kind === 'properties' ? schemaKeys(type, value, seen) : new Set();
    case ArrayOfType:
      return kind === 'items' ? arrayItems(type, value) : new Set();
    case AllOfType:
      return evaluatedByAll(kind, type.types, value, seen);
    case AnyOfType:
      return evaluatedByAll(
        kind,
        type.types.filter((item) => item.isValid(value)),
        value,
        seen
      );
    case OneOfType: {
      // With a discriminator, the type it picks, when the value satisfies it.
      const picked = type.pick(value);
      if (picked !== EVERY_TYPE) {
        const isPicked = picked !== NO_TYPE && type.types[picked].isValid(value);
        return isPicked ? evaluated(kind, type.types[picked], value, seen) : new Set();
      }
      const valid = type.types.filter((item) => item.isValid(value));
      return valid.length === 1 ? evaluated(kind, valid[0], value, seen) : new Set();
    }
    case ConditionalType: {
      // The annotations of "if" count when the value satisfies it.
      if (type.ifType.isValid(value)) {
        const result = evaluated(kind, type.ifType, value, seen);
        return type.thenType && type.thenType.isValid(value)
          ? merge(result, evaluated(kind, type.thenType, value, seen))
          : result;
      }
      return type.elseType && type.elseType.isValid(value) ? evaluated(kind, type.elseType, value, seen) : new Set();
    }
    case RefType:
      if (seen.some(([ref, seenValue]) => ref === type && seenValue === value)) {
        return new Set();
      }
      return evaluated(kind, type.getTarget(), value, [...seen, [type, value]]);
    case WhenType:
      return isJsonType(value, type.jsonType) ? evaluated(kind, type.type, value, seen) : new Set();
    case UnevaluatedType:
      // Evaluates everything the other keywords leave, when those elements satisfy it.
      if (type.kind === kind && type.isValid(value)) {
        return ALL;
      }
      return evaluatedByAll(kind, type.siblings, value, seen);
    default:
      return new Set();
  }
};

// What `type` evaluates for any value, when it does not depend on the value: { all } for everything, else the
// declared keys, the patterns of keys and the length of a tuple (the evaluated indexes are the ones below it).
// Undefined when it depends on the value.
const NONE = { all: false, keys: [], patterns: [], prefix: 0 };
const EVERYTHING = { ...NONE, all: true };

function union(a, b) {
  if (a === undefined || b === undefined) {
    return undefined;
  }
  return {
    all: a.all || b.all,
    keys: [...a.keys, ...b.keys],
    patterns: [...a.patterns, ...b.patterns],
    prefix: Math.max(a.prefix, b.prefix),
  };
}

const isNone = (result) =>
  result !== undefined &&
  !result.all &&
  result.keys.length === 0 &&
  result.patterns.length === 0 &&
  result.prefix === 0;

let staticOf;

const staticOfAll = (kind, types, seen) =>
  types.reduce((result, item) => union(result, staticOf(kind, item, seen)), NONE);

// Alternatives pass on what the ones that match evaluate, which depends on the value, unless none evaluates anything.
const staticOfAlternatives = (kind, types, seen) =>
  types.every((item) => item === undefined || isNone(staticOf(kind, item, seen))) ? NONE : undefined;

staticOf = (kind, type, seen = []) => {
  switch (type.constructor) {
    case Schema:
    case ClosedSchema:
      if (kind !== 'properties') {
        return NONE;
      }
      if (type.evaluatesAllKeys || !type.isOpen || type.additionalType) {
        return EVERYTHING;
      }
      if (type.dependencies.some((dependency) => dependency.type && !isNone(staticOf(kind, dependency.type, seen)))) {
        return undefined;
      }
      return {
        ...NONE,
        keys: type.propertyKeys || type.keys,
        patterns: type.patternTypes.map(({ pattern }) => pattern),
      };
    case ArrayOfType:
      if (kind !== 'items') {
        return NONE;
      }
      if ((type.type && !Array.isArray(type.type)) || type.additionalType) {
        return EVERYTHING;
      }
      if (type.contains && type.containsEvaluates) {
        return undefined;
      }
      return { ...NONE, prefix: Array.isArray(type.type) ? type.type.length : 0 };
    case AllOfType:
      return staticOfAll(kind, type.types, seen);
    case AnyOfType:
    case OneOfType:
      return staticOfAlternatives(kind, type.types, seen);
    case ConditionalType:
      return staticOfAlternatives(kind, [type.ifType, type.thenType, type.elseType], seen);
    case RefType:
      return seen.includes(type) ? undefined : staticOf(kind, type.getTarget(), [...seen, type]);
    case WhenType:
      return type.jsonType === JSON_TYPES[kind] ? staticOf(kind, type.type, seen) : NONE;
    case UnevaluatedType:
      return type.kind === kind ? EVERYTHING : staticOfAll(kind, type.siblings, seen);
    default:
      return NONE;
  }
};

const withKeySet = (result) => result && { ...result, keys: new Set(result.keys) };

// What `types` evaluate together for any value, of kind 'properties' or 'items', or undefined when it depends on the
// value.
function staticEvaluatedByAll(kind, types) {
  return withKeySet(staticOfAll(kind, types, []));
}

// What `type` evaluates for any value, of kind 'properties' or 'items', or undefined when it depends on the value.
function staticEvaluatedBy(kind, type) {
  return withKeySet(staticOf(kind, type, []));
}

module.exports = {
  JSON_TYPES,
  UnevaluatedType,
  staticEvaluatedBy,
  staticEvaluatedByAll,
};

},
"@xufa/template/index.js": function (module, exports, require) {
// @xufa/template: templates of text and HTML with the expressions of @xufa/expression, compiled once and rendered
// many times. {{ expression }} writes a value escaped for HTML ({{{ expression }}} as it is); filters change values
// ({{ name | upper }}); blocks: {{#if}} {{else if}} {{else}} {{/if}}, {{#each items as item, key}} {{else}} {{/each}}
// (with loop.index, loop.first, loop.last...), {{#with value as name}} {{/with}}; partials {{> name}} and
// {{> name context}}; comments {{! ... }} and {{!-- ... --}}; {{~ and ~}} take out the white space around a tag.
//
//   const { render, fill } = require('@xufa/template');
//   render('<h1>{{ title | upper }}</h1>{{#each items as item}}<li>{{ item.name }}</li>{{/each}}', data);
//   fill({ url: '{{ env.DATABASE_URL }}', port: '{{ Number(env.PORT ?? 5432) }}' }, { env: process.env });
const { Engine } = require('@xufa/expression');
const { TemplateCompiler } = require('./lib/compiler');
const { TemplateError } = require('./lib/errors');
const { FILTERS, SafeString, escapeHtml } = require('./lib/filters');
const { templatePlugin } = require('./lib/plugin');

const NO_ESCAPE = (text) => text;

class TemplateEngine {
  // `filters`: over the default ones; `globals` and `builtins`: those of the expressions (see @xufa/expression);
  // `escape`: true (HTML, the default), false, or a function of the text; `strict`: names not given and members of
  // null are errors (by default they are nothing); `partials`: sources by name; `maxDepth`: of partials in partials
  // (32); `cacheSize`: of templates kept (500); `inline`: false keeps paths ({{ user.name }}) as closures, not read in a
  // function made for the template (that is, with code generation off).
  constructor(options = {}) {
    this.options = options;
    this.inline = options.inline !== false && !options.strict;
    this.filters = { ...FILTERS, ...options.filters };
    this.partials = new Map(Object.entries(options.partials || {}));
    // loadPartial(name): the source of a partial that is not registered (or undefined).
    this.loadPartial = options.loadPartial || null;
    this.maxDepth = options.maxDepth === undefined ? 32 : options.maxDepth;
    this.cacheSize = options.cacheSize === undefined ? 500 : options.cacheSize;
    const { escape = true } = options;
    if (escape === true) this.escapeFn = escapeHtml;
    else if (escape === false) this.escapeFn = NO_ESCAPE;
    else if (typeof escape === 'function') this.escapeFn = escape;
    else throw new TypeError('escape is true, false or a function');
    this.makeExpressions();
  }

  makeExpressions() {
    const { globals, builtins, strict } = this.options;
    this.expressions = new Engine({
      globals,
      builtins,
      filters: this.filters,
      lenient: !strict,
      strict: Boolean(strict),
      cacheSize: 2000,
    });
    this.cache = new Map();
    this.partialCache = new Map();
    this.loadedCache = new Map();
  }

  // A filter more (or another): templates compiled before are compiled again.
  filter(name, fn) {
    if (typeof fn !== 'function') throw new TypeError('A filter is a function');
    this.filters[name] = fn;
    this.makeExpressions();
    return this;
  }

  // A partial: its source, by name ({{> name}}).
  partial(name, source) {
    if (typeof source !== 'string') throw new TypeError('A partial is the source of a template');
    this.partials.set(name, source);
    this.partialCache.clear();
    return this;
  }

  partialOf(name, escape) {
    const mode = escape === this.escapeFn ? 'e' : 'r';
    const key = `${mode}:${name}`;
    let compiled = this.partialCache.get(key);
    if (compiled) return compiled;
    const registered = this.partials.get(name);
    if (registered !== undefined) {
      compiled = new TemplateCompiler(this, registered, { name, escape }).compile();
      this.partialCache.set(key, compiled);
      return compiled;
    }
    // Not registered: loadPartial(name) gives its source (the files of a folder: see the plugin), compiled once for each
    // source (a file that changed is compiled again).
    if (!this.loadPartial) return null;
    const source = this.loadPartial(name);
    if (source === undefined || source === null) return null;
    const sourceKey = `${mode}:${name}:${source}`;
    compiled = this.loadedCache.get(sourceKey);
    if (!compiled) {
      compiled = new TemplateCompiler(this, source, { name, escape }).compile();
      if (this.loadedCache.size >= this.cacheSize) this.loadedCache.delete(this.loadedCache.keys().next().value);
      this.loadedCache.set(sourceKey, compiled);
    }
    return compiled;
  }

  // The function of a template: render(context) gives its text. `options.name` names it in errors; `options.escape`
  // false writes values as they are.
  compile(source, options = {}) {
    if (typeof source !== 'string') throw new TypeError('A template is a string');
    const escape = options.escape === false ? NO_ESCAPE : this.escapeFn;
    const key = `${escape === this.escapeFn ? 'e' : 'r'}:${options.name || ''}:${source}`;
    let compiled = this.cache.get(key);
    if (!compiled) {
      compiled = new TemplateCompiler(this, source, { name: options.name, escape }).compile();
      if (this.cacheSize > 0) {
        if (this.cache.size >= this.cacheSize) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, compiled);
      }
    }
    return compiled;
  }

  render(source, context, options) {
    return this.compile(source, options)(context);
  }

  // Values of data with templates in their strings (configuration, messages...), as they are written (not escaped):
  // a string that is one {{ expression }} alone gives its value (a number, an object...), the others their text;
  // arrays and plain objects are filled item by item. The rest is as it is.
  fill(value, context) {
    if (typeof value === 'string') {
      if (!value.includes('{{')) return value;
      const compiled = this.compile(value, { escape: false });
      return compiled.value ? compiled.value(context) : compiled(context);
    }
    if (Array.isArray(value)) return value.map((item) => this.fill(item, context));
    if (value !== null && typeof value === 'object') {
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) return value;
      const result = {};
      Object.keys(value).forEach((key) => {
        const filled = this.fill(value[key], context);
        // A key __proto__ (of JSON) stays a key: it does not set the prototype.
        if (key === '__proto__') {
          Object.defineProperty(result, key, { value: filled, enumerable: true, writable: true, configurable: true });
        } else result[key] = filled;
      });
      return result;
    }
    return value;
  }
}

const engine = new TemplateEngine();

module.exports = {
  TemplateEngine,
  TemplateError,
  plugin: templatePlugin,
  SafeString,
  escapeHtml,
  FILTERS,
  compile: (source, options) => engine.compile(source, options),
  render: (source, context, options) => engine.render(source, context, options),
  fill: (value, context) => engine.fill(value, context),
};

},
"@xufa/template/lib/compiler.js": function (module, exports, require) {
// A template as a function: its parts as a tree of blocks (if, each, with, partials), each a closure that gives its
// text. Expressions are those of @xufa/expression, with the filters of the engine; the names of a block (the item
// of an each, the name of a with) are in a context made over the one around it.
const { ExpressionError, FORBIDDEN } = require('@xufa/expression');
const { scan } = require('./scanner');
const { TemplateError } = require('./errors');
const { SafeString, escapeHtml } = require('./filters');

const NAME = /^[A-Za-z_$][\w$]*$/;
// A path: a name and members of it by name or index (user.name, items[0].price, user?.address.city).
const PATH = /^[A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*|\s*\[\s*\d+\s*\])*$/;
const SIMPLE_PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const PATH_PART = /[A-Za-z_$][\w$]*|\[\s*(\d+)\s*\]/g;
const NOT_PATHS = new Set(['true', 'false', 'null', 'undefined']);
// Renders of a list of nodes before it is made one function (see render()).
const INLINE_AFTER = 16;
const { hasOwnProperty } = Object.prototype;

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// A value as text: null and undefined are nothing; arrays and plain objects, JSON.
function stringify(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (value instanceof SafeString) return value.value;
  if (Array.isArray(value) || isPlainObject(value)) return JSON.stringify(value);
  return String(value);
}

// The entries of what an each goes through: [key, value] (indexes for lists).
function entriesOf(value) {
  if (value === null || value === undefined || value === false) return [];
  if (Array.isArray(value)) return value.map((item, i) => [i, item]);
  if (value instanceof Map) return [...value];
  if (typeof value === 'string' || typeof value[Symbol.iterator] === 'function')
    return [...value].map((item, i) => [i, item]);
  if (typeof value === 'object') return Object.entries(value);
  return [];
}

// A context over another, with names of its own (as own properties: a name __proto__, of data given to a partial,
// does not set its prototype).
function child(context, names) {
  const scope = Object.create(context);
  const keys = Object.keys(names);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (key === '__proto__') {
      Object.defineProperty(scope, key, { value: names[key], enumerable: true, writable: true, configurable: true });
    } else scope[key] = names[key];
  }
  return scope;
}

class TemplateCompiler {
  // `engine`: the TemplateEngine (its expressions, partials and escaping); `name`: of the template, for errors.
  constructor(engine, source, { name, escape }) {
    this.engine = engine;
    this.source = source;
    this.name = name;
    this.escape = escape;
  }

  error(message, position, code = 'XUFA_TEMPLATE_ERR_SYNTAX', cause) {
    return new TemplateError(message, { code, source: this.source, position, name: this.name, cause });
  }

  // An expression of a tag at `offset` of the template: its function; its errors as errors of the template, there.
  expression(text, offset) {
    let fn;
    try {
      fn = this.engine.expressions.compile(text);
    } catch (err) {
      if (err instanceof ExpressionError) {
        const message = err.message.replace(/ \(line \d+, column \d+\)$/, '');
        throw this.error(
          message,
          offset + (err.position || 0),
          err.code === 'XUFA_EXPR_ERR_FORBIDDEN' ? err.code : undefined
        );
      }
      throw err;
    }
    const compiler = this;
    return (context) => {
      try {
        return fn(context);
      } catch (err) {
        if (err instanceof ExpressionError) {
          const message = err.message.replace(/ \(line \d+, column \d+\)$/, '');
          throw compiler.error(message, offset + (err.position || 0), 'XUFA_TEMPLATE_ERR_RUNTIME', err);
        }
        throw err;
      }
    };
  }

  // The keys of an expression that is a path (compiled already: its names are checked), to read it inline; null for
  // the others, and in strict engines (whose errors the closures give).
  pathOf(text) {
    if (!this.engine.inline) return null;
    let keys;
    // Most are names and dots (user.name): split; the others are read part by part.
    if (SIMPLE_PATH.test(text)) keys = text.split('.');
    else {
      if (!PATH.test(text)) return null;
      keys = [];
      PATH_PART.lastIndex = 0;
      for (let match = PATH_PART.exec(text); match !== null; match = PATH_PART.exec(text)) {
        keys.push(match[1] === undefined ? match[0] : Number(match[1]));
      }
    }
    if (NOT_PATHS.has(keys[0]) || keys.some((key) => typeof key === 'string' && FORBIDDEN.has(key))) return null;
    return keys;
  }

  // What writes a value: escaped (escaped true) or as it is.
  converter(escaped) {
    const escape = escaped ? this.escape : null;
    if (!escape) return stringify;
    const html = escape === escapeHtml;
    return (result) => {
      if (typeof result === 'string') return escape(result);
      // Numbers and booleans have nothing to escape (with the HTML escaping).
      if (typeof result === 'number' || typeof result === 'boolean')
        return html ? String(result) : escape(String(result));
      return result instanceof SafeString ? result.value : escape(stringify(result));
    };
  }

  // The value of a name of the context, or of the globals of the expressions (as expressions read names).
  reader() {
    const { globals } = this.engine.expressions;
    return (context, name) => {
      const value = context[name];
      if (value !== undefined || name in context) return value;
      return hasOwnProperty.call(globals, name) ? globals[name] : undefined;
    };
  }

  // A list of nodes as one function of JavaScript: its texts, and its paths read inline (as members of null are
  // nothing in templates), joined with +; the other nodes are called (V). Nothing of the template is code there: texts
  // and names are JSON literals, and paths were checked. Null when functions cannot be made (code generation off).
  inlined(nodes, items) {
    if (!nodes.some((node) => node.type === 'output' && this.pathOf(node.source))) return null;
    const parts = [];
    const values = [];
    const key = (part) => (typeof part === 'number' ? String(part) : JSON.stringify(part));
    nodes.forEach((node, i) => {
      if (node.type === 'text') parts.push(JSON.stringify(node.text));
      else if (node.type === 'output' && this.pathOf(node.source)) {
        const [first, ...rest] = this.pathOf(node.source);
        let read = `id(ctx, ${JSON.stringify(first)})`;
        if (rest.length) {
          read = `(t = ${read}) == null ? undefined : `;
          rest.forEach((part, j) => {
            read += j === rest.length - 1 ? `t[${key(part)}]` : `(t = t[${key(part)}]) == null ? undefined : `;
          });
        }
        parts.push(`${node.escape ? 'o' : 's'}(${read})`);
      } else {
        values.push(items[i]);
        parts.push(`V[${values.length - 1}](ctx, depth)`);
      }
    });
    try {
      // eslint-disable-next-line no-new-func
      const make = new Function(
        'V',
        'o',
        's',
        'id',
        `return function inlined(ctx, depth) { let t; return ${parts.join(' + ')}; };`
      );
      return make(values, this.converter(true), this.converter(false), this.reader());
    } catch {
      return null;
    }
  }

  checkName(name, position) {
    if (!NAME.test(name) || FORBIDDEN.has(name)) throw this.error(`${name} cannot be a name`, position);
  }

  // The tree: { nodes } of the template, and whether it is one expression alone (its value: fill()).
  build() {
    const parts = scan(this.source, this.name);
    const root = { type: 'root', nodes: [] };
    const stack = [root];
    const top = () => stack[stack.length - 1];
    parts.forEach((part) => {
      const block = top();
      const target = block.otherwise || block.current || block.nodes;
      switch (part.kind) {
        case 'text':
          target.push({ type: 'text', text: part.text });
          break;
        case 'comment':
          break;
        case 'output':
        case 'raw':
          if (!part.body) throw this.error('Empty tag', part.position);
          target.push({
            type: 'output',
            value: this.expression(part.body, part.start),
            source: part.body,
            escape: part.kind === 'output',
          });
          break;
        case '#':
          stack.push(this.open(part, target));
          break;
        case 'else':
          this.otherwise(part, block);
          break;
        case '/': {
          const name = part.body.slice(1).trim();
          if (block.type === 'root') throw this.error(`{{/${name}}} closes no block`, part.position);
          if (name !== block.type) throw this.error(`{{/${name}}} closes {{#${block.type}}}`, part.position);
          stack.pop();
          break;
        }
        case '>':
          target.push(this.partial(part));
          break;
        default:
      }
    });
    if (stack.length > 1) {
      const open = top();
      throw this.error(`{{#${open.type}}} is not closed`, open.position);
    }
    const single = parts.length === 1 && (parts[0].kind === 'output' || parts[0].kind === 'raw') ? root.nodes[0] : null;
    return { nodes: root.nodes, single };
  }

  open(part, target) {
    const body = part.body.slice(1);
    const match = /^\s*([a-z]+)\b/.exec(body);
    if (!match) throw this.error('Expected a block: {{#if}}, {{#each}} or {{#with}}', part.position);
    const keyword = match[1];
    const offset = part.start + 1 + match[0].length;
    const rest = body.slice(match[0].length);
    const restOffset = offset + (rest.length - rest.trimStart().length);
    const expression = rest.trim();
    if (!expression) throw this.error(`{{#${keyword}}} needs an expression`, part.position);
    if (keyword === 'if') {
      const node = { type: 'if', position: part.position, branches: [], otherwise: null };
      node.branches.push({ test: this.expression(expression, restOffset), nodes: [] });
      node.current = node.branches[0].nodes;
      target.push(node);
      return node;
    }
    if (keyword === 'each' || keyword === 'with') {
      // ... as item, key (each) or ... as name (with).
      const names = /\s+as\s+([A-Za-z_$][\w$]*)(?:\s*,\s*([A-Za-z_$][\w$]*))?\s*$/.exec(expression);
      if (keyword === 'with' && (!names || names[2]))
        throw this.error('{{#with value as name}} needs one name', part.position);
      const source = names ? expression.slice(0, names.index) : expression;
      const item = names ? names[1] : 'item';
      const key = names ? names[2] || null : null;
      this.checkName(item, part.position);
      if (key) this.checkName(key, part.position);
      const node = {
        type: keyword,
        position: part.position,
        value: this.expression(source, restOffset),
        item,
        key,
        nodes: [],
        otherwise: null,
      };
      target.push(node);
      return node;
    }
    throw this.error(`Unknown block {{#${keyword}}} (if, each, with)`, part.position);
  }

  otherwise(part, block) {
    const match = /^else(?:\s+if\s+([\s\S]+))?$/.exec(part.body);
    if (!match) throw this.error('Expected {{else}} or {{else if condition}}', part.position);
    if (block.type === 'if') {
      if (block.otherwise) throw this.error('{{else}} after {{else}}', part.position);
      if (match[1]) {
        const offset = part.start + part.body.indexOf(match[1]);
        const branch = { test: this.expression(match[1], offset), nodes: [] };
        block.branches.push(branch);
        block.current = branch.nodes;
      } else block.otherwise = [];
      return;
    }
    if (block.type === 'each' && !match[1] && !block.otherwise) {
      block.otherwise = [];
      return;
    }
    throw this.error('{{else}} out of {{#if}} or {{#each}}', part.position);
  }

  partial(part) {
    const match = /^>\s*([\w./-]+)\s*([\s\S]*)$/.exec(part.body);
    if (!match) throw this.error('Expected {{> name}} or {{> name context}}', part.position);
    const [, name, rest] = match;
    const value = rest ? this.expression(rest, part.start + part.body.indexOf(rest, 1 + name.length)) : null;
    return { type: 'partial', name, value, position: part.position };
  }

  // The closure of a list of nodes: it gives their text. Texts are joined with +, which V8 makes cheap (ropes, flattened
  // once); an array joined at the end costs more than the rest of a short template.
  render(nodes) {
    const items = nodes.map((node) => this.renderNode(node));
    const closures = this.joined(items);
    if (!this.engine.inline || !nodes.some((node) => node.type === 'output')) return closures;
    // With paths: closures first, and once the template has been rendered INLINE_AFTER times, one function that reads
    // them inline (making it costs more than a few renders: templates rendered a few times do not pay it).
    const { hot } = this;
    let run = closures;
    let tried = false;
    return (context, depth) => {
      if (!tried && hot.renders >= INLINE_AFTER) {
        tried = true;
        run = this.inlined(nodes, items) || closures;
      }
      return run(context, depth);
    };
  }

  // Closures joined: their texts with +.
  joined(items) {
    switch (items.length) {
      case 0:
        return () => '';
      case 1:
        return items[0];
      case 2: {
        const [a, b] = items;
        return (context, depth) => a(context, depth) + b(context, depth);
      }
      case 3: {
        const [a, b, c] = items;
        return (context, depth) => a(context, depth) + b(context, depth) + c(context, depth);
      }
      default:
        return (context, depth) => {
          let text = '';
          for (let i = 0; i < items.length; i += 1) text += items[i](context, depth);
          return text;
        };
    }
  }

  renderNode(node) {
    switch (node.type) {
      case 'text': {
        const { text } = node;
        return () => text;
      }
      case 'output': {
        const { value } = node;
        const convert = this.converter(node.escape);
        return (context) => convert(value(context));
      }
      case 'if': {
        const branches = node.branches.map((branch) => ({ test: branch.test, body: this.render(branch.nodes) }));
        const otherwise = node.otherwise ? this.render(node.otherwise) : null;
        return (context, depth) => {
          for (let i = 0; i < branches.length; i += 1) {
            if (branches[i].test(context)) return branches[i].body(context, depth);
          }
          return otherwise ? otherwise(context, depth) : '';
        };
      }
      case 'each': {
        const body = this.render(node.nodes);
        const otherwise = node.otherwise ? this.render(node.otherwise) : null;
        const { value, item, key } = node;
        return (context, depth) => {
          const list = value(context);
          // Lists as they are; the rest as [key, value] entries.
          const isList = Array.isArray(list);
          const entries = isList ? list : entriesOf(list);
          const { length } = entries;
          if (length === 0) return otherwise ? otherwise(context, depth) : '';
          let text = '';
          for (let i = 0; i < length; i += 1) {
            const entryKey = isList ? i : entries[i][0];
            // The names were checked when it was compiled (none is __proto__); those given go over loop.
            const scope = Object.create(context);
            scope.loop = { index: i, number: i + 1, first: i === 0, last: i === length - 1, length, key: entryKey };
            scope[item] = isList ? entries[i] : entries[i][1];
            if (key) scope[key] = entryKey;
            text += body(scope, depth);
          }
          return text;
        };
      }
      case 'with': {
        const body = this.render(node.nodes);
        const { value, item } = node;
        return (context, depth) => body(child(context, { [item]: value(context) }), depth);
      }
      case 'partial': {
        const { engine } = this;
        const { name, value, position } = node;
        const compiler = this;
        return (context, depth) => {
          if (depth >= engine.maxDepth) {
            throw compiler.error(
              `Partials deeper than ${engine.maxDepth} (${name})`,
              position,
              'XUFA_TEMPLATE_ERR_PARTIAL'
            );
          }
          const partial = engine.partialOf(name, compiler.escape);
          if (!partial) throw compiler.error(`Unknown partial ${name}`, position, 'XUFA_TEMPLATE_ERR_PARTIAL');
          let scope = context;
          if (value) {
            const given = value(context);
            scope = given && typeof given === 'object' ? child(context, given) : context;
          }
          return partial.text(scope, depth + 1);
        };
      }
      default:
        throw new Error(`Unknown node ${node.type}`);
    }
  }

  // The template: render(context) gives its text (render.text(context, depth), for partials); with one expression
  // alone, render.value(context) gives its value (not as text).
  compile() {
    const { nodes, single } = this.build();
    // How many times the template was rendered (whole, or as a partial).
    const hot = { renders: 0 };
    this.hot = hot;
    const inner = this.render(nodes);
    const text = (context, depth) => {
      hot.renders += 1;
      return inner(context, depth);
    };
    const render = (context) => text(context === null || context === undefined ? {} : context, 0);
    render.text = text;
    if (single) render.value = (context) => single.value(context === null || context === undefined ? {} : context);
    Object.defineProperty(render, 'source', { value: this.source });
    // render.stream(context, { chunkSize }): the text in chunks, made as they are read (made the first time it is used).
    let streamer = null;
    render.stream = (context, options = {}) => {
      if (!streamer) streamer = this.streamNodes(nodes);
      hot.renders += 1;
      return chunksOf(streamer, context === null || context === undefined ? {} : context, options.chunkSize || CHUNK);
    };
    return render;
  }

  // A list of nodes as a generator: the text of each node is added to state.text, and given (yield) when it is
  // chunkSize long. Lists of each and branches of if are generators too (a list of many items is given as it is
  // made); the other nodes are their closures.
  streamNodes(nodes) {
    const parts = nodes.map((node) => this.streamNode(node));
    return function* streamList(context, depth, state) {
      for (let i = 0; i < parts.length; i += 1) yield* parts[i](context, depth, state);
    };
  }

  streamNode(node) {
    if (node.type === 'if') {
      const branches = node.branches.map((branch) => ({ test: branch.test, body: this.streamNodes(branch.nodes) }));
      const otherwise = node.otherwise ? this.streamNodes(node.otherwise) : null;
      return function* streamIf(context, depth, state) {
        for (let i = 0; i < branches.length; i += 1) {
          if (branches[i].test(context)) {
            yield* branches[i].body(context, depth, state);
            return;
          }
        }
        if (otherwise) yield* otherwise(context, depth, state);
      };
    }
    if (node.type === 'each') {
      const otherwise = node.otherwise ? this.streamNodes(node.otherwise) : null;
      const { value, item, key } = node;
      // An item without lists of its own is rendered as render() does (inline, when hot), and the chunks are cut
      // between items; one with lists is a generator too.
      if (!hasEach(node.nodes)) {
        const text = this.render(node.nodes);
        return function* streamItems(context, depth, state) {
          const list = value(context);
          const isList = Array.isArray(list);
          const entries = isList ? list : entriesOf(list);
          const { length } = entries;
          if (length === 0) {
            if (otherwise) yield* otherwise(context, depth, state);
            return;
          }
          const { chunkSize } = state;
          let chunk = state.text;
          for (let i = 0; i < length; i += 1) {
            const entryKey = isList ? i : entries[i][0];
            const scope = Object.create(context);
            scope.loop = { index: i, number: i + 1, first: i === 0, last: i === length - 1, length, key: entryKey };
            scope[item] = isList ? entries[i] : entries[i][1];
            if (key) scope[key] = entryKey;
            chunk += text(scope, depth);
            if (chunk.length >= chunkSize) {
              state.text = '';
              yield chunk;
              chunk = '';
            }
          }
          state.text = chunk;
        };
      }
      const body = this.streamNodes(node.nodes);
      return function* streamEach(context, depth, state) {
        const list = value(context);
        const isList = Array.isArray(list);
        const entries = isList ? list : entriesOf(list);
        const { length } = entries;
        if (length === 0) {
          if (otherwise) yield* otherwise(context, depth, state);
          return;
        }
        for (let i = 0; i < length; i += 1) {
          const entryKey = isList ? i : entries[i][0];
          // As render(): the names were checked when it was compiled.
          const scope = Object.create(context);
          scope.loop = { index: i, number: i + 1, first: i === 0, last: i === length - 1, length, key: entryKey };
          scope[item] = isList ? entries[i] : entries[i][1];
          if (key) scope[key] = entryKey;
          yield* body(scope, depth, state);
        }
      };
    }
    const text = this.renderNode(node);
    return function* streamText(context, depth, state) {
      state.text += text(context, depth);
      if (state.text.length >= state.chunkSize) {
        const chunk = state.text;
        state.text = '';
        yield chunk;
      }
    };
  }
}

// Whether nodes have an each (in them, or in their branches).
function hasEach(nodes) {
  return nodes.some(
    (node) =>
      node.type === 'each' ||
      (node.type === 'if' &&
        (node.branches.some((branch) => hasEach(branch.nodes)) || hasEach(node.otherwise || []))) ||
      (node.type === 'with' && hasEach(node.nodes))
  );
}

// The size of the chunks of streams (characters).
const CHUNK = 65536;

function* chunksOf(streamer, context, chunkSize) {
  const state = { text: '', chunkSize };
  yield* streamer(context, 0, state);
  if (state.text) yield state.text;
}

module.exports = { TemplateCompiler, stringify };

},
"@xufa/template/lib/errors.js": function (module, exports, require) {
// The errors of templates: their syntax (XUFA_TEMPLATE_ERR_SYNTAX, also for expressions in them), what fails while they
// render (XUFA_TEMPLATE_ERR_RUNTIME, with the ExpressionError as cause) and partials not found or too deep
// (XUFA_TEMPLATE_ERR_PARTIAL). With the template's name, line and column.
const { locate } = require('@xufa/expression');

class TemplateError extends Error {
  constructor(message, { code = 'XUFA_TEMPLATE_ERR_SYNTAX', source, position, name, cause } = {}) {
    const at = source !== undefined && position !== undefined ? locate(source, position) : null;
    const where = [name, at && `line ${at.line}, column ${at.column}`].filter(Boolean).join(', ');
    super(where ? `${message} (${where})` : message, cause ? { cause } : undefined);
    this.name = 'TemplateError';
    this.code = code;
    if (name) this.template = name;
    if (at) {
      this.position = position;
      this.line = at.line;
      this.column = at.column;
    }
  }
}

module.exports = { TemplateError };

},
"@xufa/template/lib/filters.js": function (module, exports, require) {
// HTML escaping, strings that are HTML already (SafeString), and the filters templates have by default:
// {{ name | upper }}, {{ price | number('es-ES', { style: 'currency', currency: 'EUR' }) }}...

class SafeString {
  constructor(value) {
    this.value = String(value);
  }

  toString() {
    return this.value;
  }

  toJSON() {
    return this.value;
  }
}

const UNSAFE = /[&<>"'`]/;

// HTML escaped: the text scanned once, the safe runs between the characters to escape copied as they are.
function escapeHtml(value) {
  const text = String(value);
  const first = text.search(UNSAFE);
  if (first === -1) return text;
  let result = '';
  let last = 0;
  for (let i = first; i < text.length; i += 1) {
    let entity;
    switch (text.charCodeAt(i)) {
      case 38:
        entity = '&amp;';
        break;
      case 60:
        entity = '&lt;';
        break;
      case 62:
        entity = '&gt;';
        break;
      case 34:
        entity = '&quot;';
        break;
      case 39:
        entity = '&#39;';
        break;
      case 96:
        entity = '&#96;';
        break;
      default:
        continue;
    }
    if (last !== i) result += text.slice(last, i);
    result += entity;
    last = i + 1;
  }
  return last === text.length ? result : result + text.slice(last);
}

const isEmpty = (value) => value === null || value === undefined || value === '';
const text = (value) => (value === null || value === undefined ? '' : String(value));
const listOf = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [...value];
  if (value && typeof value[Symbol.iterator] === 'function') return [...value];
  return [];
};

const FILTERS = {
  upper: (value) => text(value).toUpperCase(),
  lower: (value) => text(value).toLowerCase(),
  capitalize: (value) => {
    const string = text(value);
    return string.charAt(0).toUpperCase() + string.slice(1);
  },
  trim: (value) => text(value).trim(),
  default: (value, fallback = '') => (isEmpty(value) ? fallback : value),
  json: (value, indent) => JSON.stringify(value, null, indent),
  join: (value, separator = ', ') => listOf(value).join(separator),
  length: (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'string' || Array.isArray(value)) return value.length;
    if (value instanceof Map || value instanceof Set) return value.size;
    return typeof value === 'object' ? Object.keys(value).length : 0;
  },
  first: (value) => listOf(value)[0],
  last: (value) => {
    const list = listOf(value);
    return list[list.length - 1];
  },
  reverse: (value) => (typeof value === 'string' ? [...value].reverse().join('') : [...listOf(value)].reverse()),
  slice: (value, start, end) => (typeof value === 'string' ? value.slice(start, end) : listOf(value).slice(start, end)),
  keys: (value) => (value && typeof value === 'object' ? Object.keys(value) : []),
  values: (value) => (value && typeof value === 'object' ? Object.values(value) : []),
  truncate: (value, length = 80, end = '…') => {
    const string = text(value);
    return string.length > length ? string.slice(0, Math.max(0, length - end.length)) + end : string;
  },
  replace: (value, search, replacement = '') => text(value).split(String(search)).join(String(replacement)),
  round: (value, digits = 0) => {
    const factor = 10 ** digits;
    return Math.round(Number(value) * factor) / factor;
  },
  fixed: (value, digits = 0) => Number(value).toFixed(digits),
  number: (value, locale, options) => new Intl.NumberFormat(locale, options).format(value),
  date: (value, locale, options) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, options).format(date);
  },
  urlencode: (value) => encodeURIComponent(text(value)),
  escape: (value) => new SafeString(escapeHtml(text(value))),
  safe: (value) => new SafeString(text(value)),
};

module.exports = { FILTERS, SafeString, escapeHtml };

},
"@xufa/template/lib/plugin.js": function (module, exports, require) {
// The plugin of templates for @xufa/http (and fastify), as @fastify/view: views are files of a folder, rendered with
// the data given and sent as HTML.
//
//   app.register(template.plugin, { root: 'views', layout: 'layout', defaultContext: { site: 'xufa' } });
//   app.get('/users/:id', async (request, reply) => reply.view('users/show', { user }));
//
// reply.view(name, data, options) renders <root>/<name><extension> and sends it (text/html, unless the reply has a
// content type); reply.viewAsync() and app.view() give the text. The context of a view is defaultContext, then
// reply.locals (set in hooks), then the data given. With a layout (of the plugin, or options.layout of a call; false
// for none), the view is rendered first and given to the layout as body. Partials are files too:
// {{> partials/header}} is <root>/partials/header<extension>.
//
// With `stream` (of the plugin, or of a call), the view is sent in chunks (chunkSize characters, 64 KB) made as the
// client reads them: the first bytes go at once, and a large page is never whole in memory. Its files are read and
// compiled first (a view that is not there is a 500); an error while it renders cuts the response.
//
// Names are inside root: a name that leads out of it (.., an absolute path) is refused, so a view named by a request
// cannot read other files. Files are read once with `cache` (by default when NODE_ENV is production); without it,
// every render reads them again (edits are seen at once), and the templates are compiled again only when they changed.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const { TemplateError } = require('./errors');
const { SafeString } = require('./filters');

function templatePlugin(app, options, done) {
  // The engine is required here: index.js requires this file.
  const { TemplateEngine } = require('..'); // eslint-disable-line global-require
  const {
    root = 'views',
    extension = '.html',
    layout = null,
    defaultContext = {},
    cache = process.env.NODE_ENV === 'production',
    propertyName = 'view',
    stream = false,
    chunkSize = 65536,
    engine: given,
    ...engineOptions
  } = options;
  const base = path.resolve(root);
  const files = new Map();

  // The file of a name, inside root (null: the name leads out of it).
  const fileOf = (name) => {
    if (typeof name !== 'string' || name === '' || name.includes('\0') || path.isAbsolute(name)) return null;
    const file = path.resolve(base, path.extname(name) ? name : `${name}${extension}`);
    const relative = path.relative(base, file);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return file;
  };
  const notFound = (name, cause) => {
    const err = new TemplateError(`No view ${name} in ${root}`, { code: 'XUFA_TEMPLATE_ERR_NOT_FOUND', cause });
    err.statusCode = 500;
    return err;
  };

  async function read(name) {
    const file = fileOf(name);
    if (!file) throw notFound(name);
    if (cache && files.has(file)) return files.get(file);
    let source;
    try {
      source = await fsp.readFile(file, 'utf8');
    } catch (err) {
      throw notFound(name, err);
    }
    if (cache) files.set(file, source);
    return source;
  }

  // Partials while a template renders: read at once (the renders are synchronous), kept with `cache`.
  function readPartial(name) {
    const file = fileOf(name);
    if (!file) return undefined;
    if (cache && files.has(file)) return files.get(file);
    let source;
    try {
      source = fs.readFileSync(file, 'utf8');
    } catch {
      return undefined;
    }
    if (cache) files.set(file, source);
    return source;
  }

  const engine = given || new TemplateEngine({ ...engineOptions, loadPartial: readPartial });
  if (given && !given.loadPartial) given.loadPartial = readPartial;

  // A view ready to render: its template, its layout's (or null) and its context; the files are read and compiled
  // here, so a view that is not there fails before anything is sent.
  async function prepare(name, data, callOptions = {}, locals) {
    const context = { ...defaultContext, ...locals, ...data };
    const page = engine.compile(await read(name), { name });
    const outer = callOptions.layout === undefined ? layout : callOptions.layout;
    const frame = outer ? engine.compile(await read(outer), { name: outer }) : null;
    return { page, frame, context };
  }

  // The text of a view: rendered with its context, then given to its layout as body.
  async function render(name, data, callOptions, locals) {
    const { page, frame, context } = await prepare(name, data, callOptions, locals);
    if (!frame) return page(context);
    return frame({ ...context, body: new SafeString(page(context)) });
  }

  // The text of a view in chunks, made as they are read: the layout is rendered with a marker as its body and cut
  // there (its head, the chunks of the view, its tail); a layout that does not write its body once, as it is, is
  // rendered whole.
  function* chunks({ page, frame, context }) {
    if (!frame) {
      yield* page.stream(context, { chunkSize });
      return;
    }
    const marker = `\u0000xufa-body-${randomUUID()}\u0000`;
    const outer = frame({ ...context, body: new SafeString(marker) });
    const at = outer.indexOf(marker);
    if (at === -1 || outer.indexOf(marker, at + 1) !== -1) {
      yield frame({ ...context, body: new SafeString(page(context)) });
      return;
    }
    yield outer.slice(0, at);
    yield* page.stream(context, { chunkSize });
    yield outer.slice(at + marker.length);
  }

  app.decorate(propertyName, (name, data, callOptions) => render(name, data, callOptions));
  if (!app.hasReplyDecorator('locals')) app.decorateReply('locals', null);
  app.decorateReply(`${propertyName}Async`, function viewAsync(name, data, callOptions) {
    return render(name, data, callOptions, this.locals);
  });
  app.decorateReply(propertyName, function view(name, data, callOptions = {}) {
    const streamed = callOptions.stream === undefined ? stream : callOptions.stream;
    const sent = streamed
      ? prepare(name, data, callOptions, this.locals).then((view) => Readable.from(chunks(view), { objectMode: false }))
      : render(name, data, callOptions, this.locals);
    sent.then(
      (body) => {
        if (!this.hasHeader('content-type')) this.type('text/html; charset=utf-8');
        this.send(body);
      },
      (err) => this.send(err)
    );
    return this;
  });
  done();
}

templatePlugin[Symbol.for('skip-override')] = true;
templatePlugin[Symbol.for('fastify.display-name')] = '@xufa/template';

module.exports = { templatePlugin };

},
"@xufa/template/lib/scanner.js": function (module, exports, require) {
// The parts of a template: texts and tags. A tag is {{ expression }} (escaped), {{{ expression }}} (as it is),
// {{#if}}, {{else}}, {{/if}} and the other blocks, {{> partial}} or {{! comment }} ({{!-- comment --}} can hold }}).
// {{~ and ~}} take out the white space before and after a tag; \{{ is the text {{.
const { TemplateError } = require('./errors');

// The end of the expression that starts at `i`: where `close` is, out of strings and braces.
function endOf(source, i, close, name, tag = i) {
  let depth = 0;
  let j = i;
  while (j < source.length) {
    const char = source[j];
    if (char === '"' || char === "'") {
      j = skipString(source, j, name);
      continue;
    }
    if (char === '`') {
      j = skipTemplate(source, j, name);
      continue;
    }
    if (depth === 0 && (source.startsWith(close, j) || source.startsWith(`~${close}`, j))) return j;
    if (char === '{') depth += 1;
    else if (char === '}') depth = Math.max(0, depth - 1);
    j += 1;
  }
  throw new TemplateError(`Unclosed tag (expected ${close})`, { source, position: tag, name });
}

function skipString(source, i, name) {
  const quote = source[i];
  let j = i + 1;
  while (j < source.length && source[j] !== quote) {
    if (source[j] === '\\') j += 1;
    else if (source[j] === '\n') break;
    j += 1;
  }
  if (source[j] !== quote) throw new TemplateError('Unterminated string', { source, position: i, name });
  return j + 1;
}

function skipTemplate(source, i, name) {
  let j = i + 1;
  while (j < source.length && source[j] !== '`') {
    if (source[j] === '\\') j += 2;
    else if (source[j] === '$' && source[j + 1] === '{') {
      j = endOf(source, j + 2, '}', name) + 1;
    } else j += 1;
  }
  if (source[j] !== '`') throw new TemplateError('Unterminated template literal', { source, position: i, name });
  return j + 1;
}

// Texts and tags, in order. A tag: { kind, body (its text, trimmed), start (of its body), position (of {{) }.
function scan(source, name) {
  const parts = [];
  let text = '';
  let i = 0;
  let trimNext = false;
  const pushText = () => {
    if (text) parts.push({ kind: 'text', text });
    text = '';
  };
  while (i < source.length) {
    const open = source.indexOf('{{', i);
    if (open === -1) {
      text += source.slice(i);
      break;
    }
    // \{{: the text {{.
    if (open > 0 && source[open - 1] === '\\') {
      text += `${source.slice(i, open - 1)}{{`;
      i = open + 2;
      continue;
    }
    text += source.slice(i, open);
    if (trimNext) {
      text = text.replace(/^\s+/, '');
      trimNext = false;
    }
    let j = open + 2;
    const raw = source[j] === '{';
    if (raw) j += 1;
    if (source[j] === '~') {
      text = text.replace(/\s+$/, '');
      j += 1;
    }
    pushText();
    let kind;
    let body;
    let end;
    if (!raw && source.startsWith('!--', j)) {
      end = source.indexOf('--', j + 3);
      while (end !== -1 && !/^--~?}}/.test(source.slice(end, end + 5))) end = source.indexOf('--', end + 1);
      if (end === -1) throw new TemplateError('Unclosed comment', { source, position: open, name });
      kind = 'comment';
      body = '';
      end += 2;
    } else if (!raw && source[j] === '!') {
      end = source.indexOf('}}', j);
      if (end === -1) throw new TemplateError('Unclosed comment', { source, position: open, name });
      if (source[end - 1] === '~') end -= 1;
      kind = 'comment';
      body = '';
    } else {
      end = endOf(source, j, raw ? '}}}' : '}}', name, open);
      body = source.slice(j, end);
      kind = raw ? 'raw' : 'output';
      const marker = body.trimStart()[0];
      if (!raw && (marker === '#' || marker === '/' || marker === '>')) kind = marker;
      if (!raw && /^\s*else\b/.test(body)) kind = 'else';
    }
    const start = j + (body.length - body.trimStart().length);
    parts.push({ kind, body: body.trim(), start, position: open });
    if (source[end] === '~') {
      trimNext = true;
      end += 1;
    }
    i = end + (raw ? 3 : 2);
  }
  if (trimNext) text = text.replace(/^\s+/, '');
  pushText();
  return parts;
}

module.exports = { scan };

},
"@xufa/template/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/template","version":"0.1.0"};
},
"@xufa/yaml/index.js": function (module, exports, require) {
// @xufa/yaml: js-yaml 4.1.0 (MIT, LICENSE.js-yaml), with no dependencies: YAML 1.2 load and dump.
'use strict';


var loader = require('./lib/loader');
var dumper = require('./lib/dumper');


function renamed(from, to) {
  return function () {
    throw new Error('Function yaml.' + from + ' is removed in js-yaml 4. ' +
      'Use yaml.' + to + ' instead, which is now safe by default.');
  };
}


module.exports.Type                = require('./lib/type');
module.exports.Schema              = require('./lib/schema');
module.exports.FAILSAFE_SCHEMA     = require('./lib/schema/failsafe');
module.exports.JSON_SCHEMA         = require('./lib/schema/json');
module.exports.CORE_SCHEMA         = require('./lib/schema/core');
module.exports.DEFAULT_SCHEMA      = require('./lib/schema/default');
module.exports.load                = loader.load;
module.exports.loadAll             = loader.loadAll;
module.exports.dump                = dumper.dump;
module.exports.YAMLException       = require('./lib/exception');

// Re-export all types in case user wants to create custom schema
module.exports.types = {
  binary:    require('./lib/type/binary'),
  float:     require('./lib/type/float'),
  map:       require('./lib/type/map'),
  null:      require('./lib/type/null'),
  pairs:     require('./lib/type/pairs'),
  set:       require('./lib/type/set'),
  timestamp: require('./lib/type/timestamp'),
  bool:      require('./lib/type/bool'),
  int:       require('./lib/type/int'),
  merge:     require('./lib/type/merge'),
  omap:      require('./lib/type/omap'),
  seq:       require('./lib/type/seq'),
  str:       require('./lib/type/str')
};

// Removed functions from JS-YAML 3.0.x
module.exports.safeLoad            = renamed('safeLoad', 'load');
module.exports.safeLoadAll         = renamed('safeLoadAll', 'loadAll');
module.exports.safeDump            = renamed('safeDump', 'dump');

},
"@xufa/yaml/lib/common.js": function (module, exports, require) {
'use strict';


function isNothing(subject) {
  return (typeof subject === 'undefined') || (subject === null);
}


function isObject(subject) {
  return (typeof subject === 'object') && (subject !== null);
}


function toArray(sequence) {
  if (Array.isArray(sequence)) return sequence;
  else if (isNothing(sequence)) return [];

  return [ sequence ];
}


function extend(target, source) {
  var index, length, key, sourceKeys;

  if (source) {
    sourceKeys = Object.keys(source);

    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }

  return target;
}


function repeat(string, count) {
  var result = '', cycle;

  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }

  return result;
}


function isNegativeZero(number) {
  return (number === 0) && (Number.NEGATIVE_INFINITY === 1 / number);
}


module.exports.isNothing      = isNothing;
module.exports.isObject       = isObject;
module.exports.toArray        = toArray;
module.exports.repeat         = repeat;
module.exports.isNegativeZero = isNegativeZero;
module.exports.extend         = extend;

},
"@xufa/yaml/lib/dumper.js": function (module, exports, require) {
'use strict';

/*eslint-disable no-use-before-define*/

var common              = require('./common');
var YAMLException       = require('./exception');
var DEFAULT_SCHEMA      = require('./schema/default');

var _toString       = Object.prototype.toString;
var _hasOwnProperty = Object.prototype.hasOwnProperty;

var CHAR_BOM                  = 0xFEFF;
var CHAR_TAB                  = 0x09; /* Tab */
var CHAR_LINE_FEED            = 0x0A; /* LF */
var CHAR_CARRIAGE_RETURN      = 0x0D; /* CR */
var CHAR_SPACE                = 0x20; /* Space */
var CHAR_EXCLAMATION          = 0x21; /* ! */
var CHAR_DOUBLE_QUOTE         = 0x22; /* " */
var CHAR_SHARP                = 0x23; /* # */
var CHAR_PERCENT              = 0x25; /* % */
var CHAR_AMPERSAND            = 0x26; /* & */
var CHAR_SINGLE_QUOTE         = 0x27; /* ' */
var CHAR_ASTERISK             = 0x2A; /* * */
var CHAR_COMMA                = 0x2C; /* , */
var CHAR_MINUS                = 0x2D; /* - */
var CHAR_COLON                = 0x3A; /* : */
var CHAR_EQUALS               = 0x3D; /* = */
var CHAR_GREATER_THAN         = 0x3E; /* > */
var CHAR_QUESTION             = 0x3F; /* ? */
var CHAR_COMMERCIAL_AT        = 0x40; /* @ */
var CHAR_LEFT_SQUARE_BRACKET  = 0x5B; /* [ */
var CHAR_RIGHT_SQUARE_BRACKET = 0x5D; /* ] */
var CHAR_GRAVE_ACCENT         = 0x60; /* ` */
var CHAR_LEFT_CURLY_BRACKET   = 0x7B; /* { */
var CHAR_VERTICAL_LINE        = 0x7C; /* | */
var CHAR_RIGHT_CURLY_BRACKET  = 0x7D; /* } */

var ESCAPE_SEQUENCES = {};

ESCAPE_SEQUENCES[0x00]   = '\\0';
ESCAPE_SEQUENCES[0x07]   = '\\a';
ESCAPE_SEQUENCES[0x08]   = '\\b';
ESCAPE_SEQUENCES[0x09]   = '\\t';
ESCAPE_SEQUENCES[0x0A]   = '\\n';
ESCAPE_SEQUENCES[0x0B]   = '\\v';
ESCAPE_SEQUENCES[0x0C]   = '\\f';
ESCAPE_SEQUENCES[0x0D]   = '\\r';
ESCAPE_SEQUENCES[0x1B]   = '\\e';
ESCAPE_SEQUENCES[0x22]   = '\\"';
ESCAPE_SEQUENCES[0x5C]   = '\\\\';
ESCAPE_SEQUENCES[0x85]   = '\\N';
ESCAPE_SEQUENCES[0xA0]   = '\\_';
ESCAPE_SEQUENCES[0x2028] = '\\L';
ESCAPE_SEQUENCES[0x2029] = '\\P';

var DEPRECATED_BOOLEANS_SYNTAX = [
  'y', 'Y', 'yes', 'Yes', 'YES', 'on', 'On', 'ON',
  'n', 'N', 'no', 'No', 'NO', 'off', 'Off', 'OFF'
];

var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;

function compileStyleMap(schema, map) {
  var result, keys, index, length, tag, style, type;

  if (map === null) return {};

  result = {};
  keys = Object.keys(map);

  for (index = 0, length = keys.length; index < length; index += 1) {
    tag = keys[index];
    style = String(map[tag]);

    if (tag.slice(0, 2) === '!!') {
      tag = 'tag:yaml.org,2002:' + tag.slice(2);
    }
    type = schema.compiledTypeMap['fallback'][tag];

    if (type && _hasOwnProperty.call(type.styleAliases, style)) {
      style = type.styleAliases[style];
    }

    result[tag] = style;
  }

  return result;
}

function encodeHex(character) {
  var string, handle, length;

  string = character.toString(16).toUpperCase();

  if (character <= 0xFF) {
    handle = 'x';
    length = 2;
  } else if (character <= 0xFFFF) {
    handle = 'u';
    length = 4;
  } else if (character <= 0xFFFFFFFF) {
    handle = 'U';
    length = 8;
  } else {
    throw new YAMLException('code point within a string may not be greater than 0xFFFFFFFF');
  }

  return '\\' + handle + common.repeat('0', length - string.length) + string;
}


var QUOTING_TYPE_SINGLE = 1,
    QUOTING_TYPE_DOUBLE = 2;

function State(options) {
  this.schema        = options['schema'] || DEFAULT_SCHEMA;
  this.indent        = Math.max(1, (options['indent'] || 2));
  this.noArrayIndent = options['noArrayIndent'] || false;
  this.skipInvalid   = options['skipInvalid'] || false;
  this.flowLevel     = (common.isNothing(options['flowLevel']) ? -1 : options['flowLevel']);
  this.styleMap      = compileStyleMap(this.schema, options['styles'] || null);
  this.sortKeys      = options['sortKeys'] || false;
  this.lineWidth     = options['lineWidth'] || 80;
  this.noRefs        = options['noRefs'] || false;
  this.noCompatMode  = options['noCompatMode'] || false;
  this.condenseFlow  = options['condenseFlow'] || false;
  this.quotingType   = options['quotingType'] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
  this.forceQuotes   = options['forceQuotes'] || false;
  this.replacer      = typeof options['replacer'] === 'function' ? options['replacer'] : null;

  this.implicitTypes = this.schema.compiledImplicit;
  this.explicitTypes = this.schema.compiledExplicit;

  this.tag = null;
  this.result = '';

  this.duplicates = [];
  this.usedDuplicates = null;
}

// Indents every line in a string. Empty lines (\n only) are not indented.
function indentString(string, spaces) {
  var ind = common.repeat(' ', spaces),
      position = 0,
      next = -1,
      result = '',
      line,
      length = string.length;

  while (position < length) {
    next = string.indexOf('\n', position);
    if (next === -1) {
      line = string.slice(position);
      position = length;
    } else {
      line = string.slice(position, next + 1);
      position = next + 1;
    }

    if (line.length && line !== '\n') result += ind;

    result += line;
  }

  return result;
}

function generateNextLine(state, level) {
  return '\n' + common.repeat(' ', state.indent * level);
}

function testImplicitResolving(state, str) {
  var index, length, type;

  for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
    type = state.implicitTypes[index];

    if (type.resolve(str)) {
      return true;
    }
  }

  return false;
}

// [33] s-white ::= s-space | s-tab
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}

// Returns true if the character can be printed without escaping.
// From YAML 1.2: "any allowed characters known to be non-printable
// should also be escaped. [However,] This isn’t mandatory"
// Derived from nb-char - \t - #x85 - #xA0 - #x2028 - #x2029.
function isPrintable(c) {
  return  (0x00020 <= c && c <= 0x00007E)
      || ((0x000A1 <= c && c <= 0x00D7FF) && c !== 0x2028 && c !== 0x2029)
      || ((0x0E000 <= c && c <= 0x00FFFD) && c !== CHAR_BOM)
      ||  (0x10000 <= c && c <= 0x10FFFF);
}

// [34] ns-char ::= nb-char - s-white
// [27] nb-char ::= c-printable - b-char - c-byte-order-mark
// [26] b-char  ::= b-line-feed | b-carriage-return
// Including s-white (for some reason, examples doesn't match specs in this aspect)
// ns-char ::= c-printable - b-line-feed - b-carriage-return - c-byte-order-mark
function isNsCharOrWhitespace(c) {
  return isPrintable(c)
    && c !== CHAR_BOM
    // - b-char
    && c !== CHAR_CARRIAGE_RETURN
    && c !== CHAR_LINE_FEED;
}

// [127]  ns-plain-safe(c) ::= c = flow-out  ⇒ ns-plain-safe-out
//                             c = flow-in   ⇒ ns-plain-safe-in
//                             c = block-key ⇒ ns-plain-safe-out
//                             c = flow-key  ⇒ ns-plain-safe-in
// [128] ns-plain-safe-out ::= ns-char
// [129]  ns-plain-safe-in ::= ns-char - c-flow-indicator
// [130]  ns-plain-char(c) ::=  ( ns-plain-safe(c) - “:” - “#” )
//                            | ( /* An ns-char preceding */ “#” )
//                            | ( “:” /* Followed by an ns-plain-safe(c) */ )
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
  var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
    // ns-plain-safe
    inblock ? // c = flow-in
      cIsNsCharOrWhitespace
      : cIsNsCharOrWhitespace
        // - c-flow-indicator
        && c !== CHAR_COMMA
        && c !== CHAR_LEFT_SQUARE_BRACKET
        && c !== CHAR_RIGHT_SQUARE_BRACKET
        && c !== CHAR_LEFT_CURLY_BRACKET
        && c !== CHAR_RIGHT_CURLY_BRACKET
  )
    // ns-plain-char
    && c !== CHAR_SHARP // false on '#'
    && !(prev === CHAR_COLON && !cIsNsChar) // false on ': '
    || (isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP) // change to true on '[^ ]#'
    || (prev === CHAR_COLON && cIsNsChar); // change to true on ':[^ ]'
}

// Simplified test for values allowed as the first character in plain style.
function isPlainSafeFirst(c) {
  // Uses a subset of ns-char - c-indicator
  // where ns-char = nb-char - s-white.
  // No support of ( ( “?” | “:” | “-” ) /* Followed by an ns-plain-safe(c)) */ ) part
  return isPrintable(c) && c !== CHAR_BOM
    && !isWhitespace(c) // - s-white
    // - (c-indicator ::=
    // “-” | “?” | “:” | “,” | “[” | “]” | “{” | “}”
    && c !== CHAR_MINUS
    && c !== CHAR_QUESTION
    && c !== CHAR_COLON
    && c !== CHAR_COMMA
    && c !== CHAR_LEFT_SQUARE_BRACKET
    && c !== CHAR_RIGHT_SQUARE_BRACKET
    && c !== CHAR_LEFT_CURLY_BRACKET
    && c !== CHAR_RIGHT_CURLY_BRACKET
    // | “#” | “&” | “*” | “!” | “|” | “=” | “>” | “'” | “"”
    && c !== CHAR_SHARP
    && c !== CHAR_AMPERSAND
    && c !== CHAR_ASTERISK
    && c !== CHAR_EXCLAMATION
    && c !== CHAR_VERTICAL_LINE
    && c !== CHAR_EQUALS
    && c !== CHAR_GREATER_THAN
    && c !== CHAR_SINGLE_QUOTE
    && c !== CHAR_DOUBLE_QUOTE
    // | “%” | “@” | “`”)
    && c !== CHAR_PERCENT
    && c !== CHAR_COMMERCIAL_AT
    && c !== CHAR_GRAVE_ACCENT;
}

// Simplified test for values allowed as the last character in plain style.
function isPlainSafeLast(c) {
  // just not whitespace or colon, it will be checked to be plain character later
  return !isWhitespace(c) && c !== CHAR_COLON;
}

// Same as 'string'.codePointAt(pos), but works in older browsers.
function codePointAt(string, pos) {
  var first = string.charCodeAt(pos), second;
  if (first >= 0xD800 && first <= 0xDBFF && pos + 1 < string.length) {
    second = string.charCodeAt(pos + 1);
    if (second >= 0xDC00 && second <= 0xDFFF) {
      // https://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
      return (first - 0xD800) * 0x400 + second - 0xDC00 + 0x10000;
    }
  }
  return first;
}

// Determines whether block indentation indicator is required.
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}

var STYLE_PLAIN   = 1,
    STYLE_SINGLE  = 2,
    STYLE_LITERAL = 3,
    STYLE_FOLDED  = 4,
    STYLE_DOUBLE  = 5;

// Determines which scalar styles are possible and returns the preferred style.
// lineWidth = -1 => no limit.
// Pre-conditions: str.length > 0.
// Post-conditions:
//    STYLE_PLAIN or STYLE_SINGLE => no \n are in the string.
//    STYLE_LITERAL => no lines are suitable for folding (or lineWidth is -1).
//    STYLE_FOLDED => a line > lineWidth and can be folded (and lineWidth != -1).
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth,
  testAmbiguousType, quotingType, forceQuotes, inblock) {

  var i;
  var char = 0;
  var prevChar = null;
  var hasLineBreak = false;
  var hasFoldableLine = false; // only checked if shouldTrackWidth
  var shouldTrackWidth = lineWidth !== -1;
  var previousLineBreak = -1; // count the first line correctly
  var plain = isPlainSafeFirst(codePointAt(string, 0))
          && isPlainSafeLast(codePointAt(string, string.length - 1));

  if (singleLineOnly || forceQuotes) {
    // Case: no block styles.
    // Check for disallowed characters to rule out plain and single.
    for (i = 0; i < string.length; char >= 0x10000 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
  } else {
    // Case: block styles permitted.
    for (i = 0; i < string.length; char >= 0x10000 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (char === CHAR_LINE_FEED) {
        hasLineBreak = true;
        // Check if any line can be folded.
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine ||
            // Foldable line = too long, and not more-indented.
            (i - previousLineBreak - 1 > lineWidth &&
             string[previousLineBreak + 1] !== ' ');
          previousLineBreak = i;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    // in case the end is missing a \n
    hasFoldableLine = hasFoldableLine || (shouldTrackWidth &&
      (i - previousLineBreak - 1 > lineWidth &&
       string[previousLineBreak + 1] !== ' '));
  }
  // Although every style can represent \n without escaping, prefer block styles
  // for multiline, since they're more readable and they don't add empty lines.
  // Also prefer folding a super-long line.
  if (!hasLineBreak && !hasFoldableLine) {
    // Strings interpretable as another type have to be quoted;
    // e.g. the string 'true' vs. the boolean true.
    if (plain && !forceQuotes && !testAmbiguousType(string)) {
      return STYLE_PLAIN;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  // Edge case: block indentation indicator can only have one digit.
  if (indentPerLevel > 9 && needIndentIndicator(string)) {
    return STYLE_DOUBLE;
  }
  // At this point we know block styles are valid.
  // Prefer literal style unless we want to fold.
  if (!forceQuotes) {
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
  }
  return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}

// Note: line breaking/folding is implemented for only the folded style.
// NB. We drop the last trailing newline (if any) of a returned block scalar
//  since the dumper adds its own newline. This always works:
//    • No ending newline => unaffected; already using strip "-" chomping.
//    • Ending newline    => removed then restored.
//  Importantly, this keeps the "+" chomp indicator from gaining an extra line.
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = (function () {
    if (string.length === 0) {
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    }
    if (!state.noCompatMode) {
      if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? ('"' + string + '"') : ("'" + string + "'");
      }
    }

    var indent = state.indent * Math.max(1, level); // no 0-indent scalars
    // As indentation gets deeper, let the width decrease monotonically
    // to the lower bound min(state.lineWidth, 40).
    // Note that this implies
    //  state.lineWidth ≤ 40 + state.indent: width is fixed at the lower bound.
    //  state.lineWidth > 40 + state.indent: width decreases until the lower bound.
    // This behaves better than a constant minimum width which disallows narrower options,
    // or an indent threshold which causes the width to suddenly increase.
    var lineWidth = state.lineWidth === -1
      ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);

    // Without knowing if keys are implicit/explicit, assume implicit for safety.
    var singleLineOnly = iskey
      // No block styles in flow mode.
      || (state.flowLevel > -1 && level >= state.flowLevel);
    function testAmbiguity(string) {
      return testImplicitResolving(state, string);
    }

    switch (chooseScalarStyle(string, singleLineOnly, state.indent, lineWidth,
      testAmbiguity, state.quotingType, state.forceQuotes && !iskey, inblock)) {

      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return '|' + blockHeader(string, state.indent)
          + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return '>' + blockHeader(string, state.indent)
          + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string, lineWidth) + '"';
      default:
        throw new YAMLException('impossible error: invalid scalar style');
    }
  }());
}

// Pre-conditions: string is valid for a block scalar, 1 <= indentPerLevel <= 9.
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : '';

  // note the special case: the string '\n' counts as a "trailing" empty line.
  var clip =          string[string.length - 1] === '\n';
  var keep = clip && (string[string.length - 2] === '\n' || string === '\n');
  var chomp = keep ? '+' : (clip ? '' : '-');

  return indentIndicator + chomp + '\n';
}

// (See the note for writeScalar.)
function dropEndingNewline(string) {
  return string[string.length - 1] === '\n' ? string.slice(0, -1) : string;
}

// Note: a long line without a suitable break point will exceed the width limit.
// Pre-conditions: every char in str isPrintable, str.length > 0, width > 0.
function foldString(string, width) {
  // In folded style, $k$ consecutive newlines output as $k+1$ newlines—
  // unless they're before or after a more-indented line, or at the very
  // beginning or end, in which case $k$ maps to $k$.
  // Therefore, parse each chunk as newline(s) followed by a content line.
  var lineRe = /(\n+)([^\n]*)/g;

  // first line (possibly an empty line)
  var result = (function () {
    var nextLF = string.indexOf('\n');
    nextLF = nextLF !== -1 ? nextLF : string.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string.slice(0, nextLF), width);
  }());
  // If we haven't reached the first content line yet, don't add an extra \n.
  var prevMoreIndented = string[0] === '\n' || string[0] === ' ';
  var moreIndented;

  // rest of the lines
  var match;
  while ((match = lineRe.exec(string))) {
    var prefix = match[1], line = match[2];
    moreIndented = (line[0] === ' ');
    result += prefix
      + (!prevMoreIndented && !moreIndented && line !== ''
        ? '\n' : '')
      + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }

  return result;
}

// Greedy line breaking.
// Picks the longest line under the limit each time,
// otherwise settles for the shortest line over the limit.
// NB. More-indented lines *cannot* be folded, as that would add an extra \n.
function foldLine(line, width) {
  if (line === '' || line[0] === ' ') return line;

  // Since a more-indented line adds a \n, breaks can't be followed by a space.
  var breakRe = / [^ ]/g; // note: the match index will always be <= length-2.
  var match;
  // start is an inclusive index. end, curr, and next are exclusive.
  var start = 0, end, curr = 0, next = 0;
  var result = '';

  // Invariants: 0 <= start <= length-1.
  //   0 <= curr <= next <= max(0, length-2). curr - start <= width.
  // Inside the loop:
  //   A match implies length >= 2, so curr and next are <= length-2.
  while ((match = breakRe.exec(line))) {
    next = match.index;
    // maintain invariant: curr - start <= width
    if (next - start > width) {
      end = (curr > start) ? curr : next; // derive end <= length-2
      result += '\n' + line.slice(start, end);
      // skip the space that was output as \n
      start = end + 1;                    // derive start <= length-1
    }
    curr = next;
  }

  // By the invariants, start <= length-1, so there is something left over.
  // It is either the whole string or a part starting from non-whitespace.
  result += '\n';
  // Insert a break if the remainder is too long and there is a break available.
  if (line.length - start > width && curr > start) {
    result += line.slice(start, curr) + '\n' + line.slice(curr + 1);
  } else {
    result += line.slice(start);
  }

  return result.slice(1); // drop extra \n joiner
}

// Escapes a double-quoted string.
function escapeString(string) {
  var result = '';
  var char = 0;
  var escapeSeq;

  for (var i = 0; i < string.length; char >= 0x10000 ? i += 2 : i++) {
    char = codePointAt(string, i);
    escapeSeq = ESCAPE_SEQUENCES[char];

    if (!escapeSeq && isPrintable(char)) {
      result += string[i];
      if (char >= 0x10000) result += string[i + 1];
    } else {
      result += escapeSeq || encodeHex(char);
    }
  }

  return result;
}

function writeFlowSequence(state, level, object) {
  var _result = '',
      _tag    = state.tag,
      index,
      length,
      value;

  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];

    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }

    // Write only valid elements, put null instead of invalid elements.
    if (writeNode(state, level, value, false, false) ||
        (typeof value === 'undefined' &&
         writeNode(state, level, null, false, false))) {

      if (_result !== '') _result += ',' + (!state.condenseFlow ? ' ' : '');
      _result += state.dump;
    }
  }

  state.tag = _tag;
  state.dump = '[' + _result + ']';
}

function writeBlockSequence(state, level, object, compact) {
  var _result = '',
      _tag    = state.tag,
      index,
      length,
      value;

  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];

    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }

    // Write only valid elements, put null instead of invalid elements.
    if (writeNode(state, level + 1, value, true, true, false, true) ||
        (typeof value === 'undefined' &&
         writeNode(state, level + 1, null, true, true, false, true))) {

      if (!compact || _result !== '') {
        _result += generateNextLine(state, level);
      }

      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        _result += '-';
      } else {
        _result += '- ';
      }

      _result += state.dump;
    }
  }

  state.tag = _tag;
  state.dump = _result || '[]'; // Empty sequence if no valid values.
}

function writeFlowMapping(state, level, object) {
  var _result       = '',
      _tag          = state.tag,
      objectKeyList = Object.keys(object),
      index,
      length,
      objectKey,
      objectValue,
      pairBuffer;

  for (index = 0, length = objectKeyList.length; index < length; index += 1) {

    pairBuffer = '';
    if (_result !== '') pairBuffer += ', ';

    if (state.condenseFlow) pairBuffer += '"';

    objectKey = objectKeyList[index];
    objectValue = object[objectKey];

    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }

    if (!writeNode(state, level, objectKey, false, false)) {
      continue; // Skip this pair because of invalid key;
    }

    if (state.dump.length > 1024) pairBuffer += '? ';

    pairBuffer += state.dump + (state.condenseFlow ? '"' : '') + ':' + (state.condenseFlow ? '' : ' ');

    if (!writeNode(state, level, objectValue, false, false)) {
      continue; // Skip this pair because of invalid value.
    }

    pairBuffer += state.dump;

    // Both key and value are valid.
    _result += pairBuffer;
  }

  state.tag = _tag;
  state.dump = '{' + _result + '}';
}

function writeBlockMapping(state, level, object, compact) {
  var _result       = '',
      _tag          = state.tag,
      objectKeyList = Object.keys(object),
      index,
      length,
      objectKey,
      objectValue,
      explicitPair,
      pairBuffer;

  // Allow sorting keys so that the output file is deterministic
  if (state.sortKeys === true) {
    // Default sorting
    objectKeyList.sort();
  } else if (typeof state.sortKeys === 'function') {
    // Custom sort function
    objectKeyList.sort(state.sortKeys);
  } else if (state.sortKeys) {
    // Something is wrong
    throw new YAMLException('sortKeys must be a boolean or a function');
  }

  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = '';

    if (!compact || _result !== '') {
      pairBuffer += generateNextLine(state, level);
    }

    objectKey = objectKeyList[index];
    objectValue = object[objectKey];

    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }

    if (!writeNode(state, level + 1, objectKey, true, true, true)) {
      continue; // Skip this pair because of invalid key.
    }

    explicitPair = (state.tag !== null && state.tag !== '?') ||
                   (state.dump && state.dump.length > 1024);

    if (explicitPair) {
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += '?';
      } else {
        pairBuffer += '? ';
      }
    }

    pairBuffer += state.dump;

    if (explicitPair) {
      pairBuffer += generateNextLine(state, level);
    }

    if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
      continue; // Skip this pair because of invalid value.
    }

    if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
      pairBuffer += ':';
    } else {
      pairBuffer += ': ';
    }

    pairBuffer += state.dump;

    // Both key and value are valid.
    _result += pairBuffer;
  }

  state.tag = _tag;
  state.dump = _result || '{}'; // Empty mapping if no valid pairs.
}

function detectType(state, object, explicit) {
  var _result, typeList, index, length, type, style;

  typeList = explicit ? state.explicitTypes : state.implicitTypes;

  for (index = 0, length = typeList.length; index < length; index += 1) {
    type = typeList[index];

    if ((type.instanceOf  || type.predicate) &&
        (!type.instanceOf || ((typeof object === 'object') && (object instanceof type.instanceOf))) &&
        (!type.predicate  || type.predicate(object))) {

      if (explicit) {
        if (type.multi && type.representName) {
          state.tag = type.representName(object);
        } else {
          state.tag = type.tag;
        }
      } else {
        state.tag = '?';
      }

      if (type.represent) {
        style = state.styleMap[type.tag] || type.defaultStyle;

        if (_toString.call(type.represent) === '[object Function]') {
          _result = type.represent(object, style);
        } else if (_hasOwnProperty.call(type.represent, style)) {
          _result = type.represent[style](object, style);
        } else {
          throw new YAMLException('!<' + type.tag + '> tag resolver accepts not "' + style + '" style');
        }

        state.dump = _result;
      }

      return true;
    }
  }

  return false;
}

// Serializes `object` and writes it to global `result`.
// Returns true on success, or false on invalid object.
//
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null;
  state.dump = object;

  if (!detectType(state, object, false)) {
    detectType(state, object, true);
  }

  var type = _toString.call(state.dump);
  var inblock = block;
  var tagStr;

  if (block) {
    block = (state.flowLevel < 0 || state.flowLevel > level);
  }

  var objectOrArray = type === '[object Object]' || type === '[object Array]',
      duplicateIndex,
      duplicate;

  if (objectOrArray) {
    duplicateIndex = state.duplicates.indexOf(object);
    duplicate = duplicateIndex !== -1;
  }

  if ((state.tag !== null && state.tag !== '?') || duplicate || (state.indent !== 2 && level > 0)) {
    compact = false;
  }

  if (duplicate && state.usedDuplicates[duplicateIndex]) {
    state.dump = '*ref_' + duplicateIndex;
  } else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
      state.usedDuplicates[duplicateIndex] = true;
    }
    if (type === '[object Object]') {
      if (block && (Object.keys(state.dump).length !== 0)) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) {
          state.dump = '&ref_' + duplicateIndex + state.dump;
        }
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) {
          state.dump = '&ref_' + duplicateIndex + ' ' + state.dump;
        }
      }
    } else if (type === '[object Array]') {
      if (block && (state.dump.length !== 0)) {
        if (state.noArrayIndent && !isblockseq && level > 0) {
          writeBlockSequence(state, level - 1, state.dump, compact);
        } else {
          writeBlockSequence(state, level, state.dump, compact);
        }
        if (duplicate) {
          state.dump = '&ref_' + duplicateIndex + state.dump;
        }
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) {
          state.dump = '&ref_' + duplicateIndex + ' ' + state.dump;
        }
      }
    } else if (type === '[object String]') {
      if (state.tag !== '?') {
        writeScalar(state, state.dump, level, iskey, inblock);
      }
    } else if (type === '[object Undefined]') {
      return false;
    } else {
      if (state.skipInvalid) return false;
      throw new YAMLException('unacceptable kind of an object to dump ' + type);
    }

    if (state.tag !== null && state.tag !== '?') {
      // Need to encode all characters except those allowed by the spec:
      //
      // [35] ns-dec-digit    ::=  [#x30-#x39] /* 0-9 */
      // [36] ns-hex-digit    ::=  ns-dec-digit
      //                         | [#x41-#x46] /* A-F */ | [#x61-#x66] /* a-f */
      // [37] ns-ascii-letter ::=  [#x41-#x5A] /* A-Z */ | [#x61-#x7A] /* a-z */
      // [38] ns-word-char    ::=  ns-dec-digit | ns-ascii-letter | “-”
      // [39] ns-uri-char     ::=  “%” ns-hex-digit ns-hex-digit | ns-word-char | “#”
      //                         | “;” | “/” | “?” | “:” | “@” | “&” | “=” | “+” | “$” | “,”
      //                         | “_” | “.” | “!” | “~” | “*” | “'” | “(” | “)” | “[” | “]”
      //
      // Also need to encode '!' because it has special meaning (end of tag prefix).
      //
      tagStr = encodeURI(
        state.tag[0] === '!' ? state.tag.slice(1) : state.tag
      ).replace(/!/g, '%21');

      if (state.tag[0] === '!') {
        tagStr = '!' + tagStr;
      } else if (tagStr.slice(0, 18) === 'tag:yaml.org,2002:') {
        tagStr = '!!' + tagStr.slice(18);
      } else {
        tagStr = '!<' + tagStr + '>';
      }

      state.dump = tagStr + ' ' + state.dump;
    }
  }

  return true;
}

function getDuplicateReferences(object, state) {
  var objects = [],
      duplicatesIndexes = [],
      index,
      length;

  inspectNode(object, objects, duplicatesIndexes);

  for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  }
  state.usedDuplicates = new Array(length);
}

function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList,
      index,
      length;

  if (object !== null && typeof object === 'object') {
    index = objects.indexOf(object);
    if (index !== -1) {
      if (duplicatesIndexes.indexOf(index) === -1) {
        duplicatesIndexes.push(index);
      }
    } else {
      objects.push(object);

      if (Array.isArray(object)) {
        for (index = 0, length = object.length; index < length; index += 1) {
          inspectNode(object[index], objects, duplicatesIndexes);
        }
      } else {
        objectKeyList = Object.keys(object);

        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
          inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
        }
      }
    }
  }
}

function dump(input, options) {
  options = options || {};

  var state = new State(options);

  if (!state.noRefs) getDuplicateReferences(input, state);

  var value = input;

  if (state.replacer) {
    value = state.replacer.call({ '': value }, '', value);
  }

  if (writeNode(state, 0, value, true, true)) return state.dump + '\n';

  return '';
}

module.exports.dump = dump;

},
"@xufa/yaml/lib/exception.js": function (module, exports, require) {
// YAML error class. http://stackoverflow.com/questions/8458984
//
'use strict';


function formatError(exception, compact) {
  var where = '', message = exception.reason || '(unknown reason)';

  if (!exception.mark) return message;

  if (exception.mark.name) {
    where += 'in "' + exception.mark.name + '" ';
  }

  where += '(' + (exception.mark.line + 1) + ':' + (exception.mark.column + 1) + ')';

  if (!compact && exception.mark.snippet) {
    where += '\n\n' + exception.mark.snippet;
  }

  return message + ' ' + where;
}


function YAMLException(reason, mark) {
  // Super constructor
  Error.call(this);

  this.name = 'YAMLException';
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);

  // Include stack trace in error object
  if (Error.captureStackTrace) {
    // Chrome and NodeJS
    Error.captureStackTrace(this, this.constructor);
  } else {
    // FF, IE 10+ and Safari 6+. Fallback for others
    this.stack = (new Error()).stack || '';
  }
}


// Inherit from Error
YAMLException.prototype = Object.create(Error.prototype);
YAMLException.prototype.constructor = YAMLException;


YAMLException.prototype.toString = function toString(compact) {
  return this.name + ': ' + formatError(this, compact);
};


module.exports = YAMLException;

},
"@xufa/yaml/lib/loader.js": function (module, exports, require) {
'use strict';

/*eslint-disable max-len,no-use-before-define*/

var common              = require('./common');
var YAMLException       = require('./exception');
var makeSnippet         = require('./snippet');
var DEFAULT_SCHEMA      = require('./schema/default');


var _hasOwnProperty = Object.prototype.hasOwnProperty;


var CONTEXT_FLOW_IN   = 1;
var CONTEXT_FLOW_OUT  = 2;
var CONTEXT_BLOCK_IN  = 3;
var CONTEXT_BLOCK_OUT = 4;


var CHOMPING_CLIP  = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP  = 3;


var PATTERN_NON_PRINTABLE         = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS       = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE            = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI               = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;


function _class(obj) { return Object.prototype.toString.call(obj); }

function is_EOL(c) {
  return (c === 0x0A/* LF */) || (c === 0x0D/* CR */);
}

function is_WHITE_SPACE(c) {
  return (c === 0x09/* Tab */) || (c === 0x20/* Space */);
}

function is_WS_OR_EOL(c) {
  return (c === 0x09/* Tab */) ||
         (c === 0x20/* Space */) ||
         (c === 0x0A/* LF */) ||
         (c === 0x0D/* CR */);
}

function is_FLOW_INDICATOR(c) {
  return c === 0x2C/* , */ ||
         c === 0x5B/* [ */ ||
         c === 0x5D/* ] */ ||
         c === 0x7B/* { */ ||
         c === 0x7D/* } */;
}

function fromHexCode(c) {
  var lc;

  if ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */)) {
    return c - 0x30;
  }

  /*eslint-disable no-bitwise*/
  lc = c | 0x20;

  if ((0x61/* a */ <= lc) && (lc <= 0x66/* f */)) {
    return lc - 0x61 + 10;
  }

  return -1;
}

function escapedHexLen(c) {
  if (c === 0x78/* x */) { return 2; }
  if (c === 0x75/* u */) { return 4; }
  if (c === 0x55/* U */) { return 8; }
  return 0;
}

function fromDecimalCode(c) {
  if ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */)) {
    return c - 0x30;
  }

  return -1;
}

function simpleEscapeSequence(c) {
  /* eslint-disable indent */
  return (c === 0x30/* 0 */) ? '\x00' :
        (c === 0x61/* a */) ? '\x07' :
        (c === 0x62/* b */) ? '\x08' :
        (c === 0x74/* t */) ? '\x09' :
        (c === 0x09/* Tab */) ? '\x09' :
        (c === 0x6E/* n */) ? '\x0A' :
        (c === 0x76/* v */) ? '\x0B' :
        (c === 0x66/* f */) ? '\x0C' :
        (c === 0x72/* r */) ? '\x0D' :
        (c === 0x65/* e */) ? '\x1B' :
        (c === 0x20/* Space */) ? ' ' :
        (c === 0x22/* " */) ? '\x22' :
        (c === 0x2F/* / */) ? '/' :
        (c === 0x5C/* \ */) ? '\x5C' :
        (c === 0x4E/* N */) ? '\x85' :
        (c === 0x5F/* _ */) ? '\xA0' :
        (c === 0x4C/* L */) ? '\u2028' :
        (c === 0x50/* P */) ? '\u2029' : '';
}

function charFromCodepoint(c) {
  if (c <= 0xFFFF) {
    return String.fromCharCode(c);
  }
  // Encode UTF-16 surrogate pair
  // https://en.wikipedia.org/wiki/UTF-16#Code_points_U.2B010000_to_U.2B10FFFF
  return String.fromCharCode(
    ((c - 0x010000) >> 10) + 0xD800,
    ((c - 0x010000) & 0x03FF) + 0xDC00
  );
}

var simpleEscapeCheck = new Array(256); // integer, for fast access
var simpleEscapeMap = new Array(256);
for (var i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}


function State(input, options) {
  this.input = input;

  this.filename  = options['filename']  || null;
  this.schema    = options['schema']    || DEFAULT_SCHEMA;
  this.onWarning = options['onWarning'] || null;
  // (Hidden) Remove? makes the loader to expect YAML 1.1 documents
  // if such documents have no explicit %YAML directive
  this.legacy    = options['legacy']    || false;

  this.json      = options['json']      || false;
  this.listener  = options['listener']  || null;

  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap       = this.schema.compiledTypeMap;

  this.length     = input.length;
  this.position   = 0;
  this.line       = 0;
  this.lineStart  = 0;
  this.lineIndent = 0;

  // position of first leading tab in the current line,
  // used to make sure there are no tabs in the indentation
  this.firstTabInLine = -1;

  this.documents = [];

  /*
  this.version;
  this.checkLineBreaks;
  this.tagMap;
  this.anchorMap;
  this.tag;
  this.anchor;
  this.kind;
  this.result;*/

}


function generateError(state, message) {
  var mark = {
    name:     state.filename,
    buffer:   state.input.slice(0, -1), // omit trailing \0
    position: state.position,
    line:     state.line,
    column:   state.position - state.lineStart
  };

  mark.snippet = makeSnippet(mark);

  return new YAMLException(message, mark);
}

function throwError(state, message) {
  throw generateError(state, message);
}

function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}


var directiveHandlers = {

  YAML: function handleYamlDirective(state, name, args) {

    var match, major, minor;

    if (state.version !== null) {
      throwError(state, 'duplication of %YAML directive');
    }

    if (args.length !== 1) {
      throwError(state, 'YAML directive accepts exactly one argument');
    }

    match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);

    if (match === null) {
      throwError(state, 'ill-formed argument of the YAML directive');
    }

    major = parseInt(match[1], 10);
    minor = parseInt(match[2], 10);

    if (major !== 1) {
      throwError(state, 'unacceptable YAML version of the document');
    }

    state.version = args[0];
    state.checkLineBreaks = (minor < 2);

    if (minor !== 1 && minor !== 2) {
      throwWarning(state, 'unsupported YAML version of the document');
    }
  },

  TAG: function handleTagDirective(state, name, args) {

    var handle, prefix;

    if (args.length !== 2) {
      throwError(state, 'TAG directive accepts exactly two arguments');
    }

    handle = args[0];
    prefix = args[1];

    if (!PATTERN_TAG_HANDLE.test(handle)) {
      throwError(state, 'ill-formed tag handle (first argument) of the TAG directive');
    }

    if (_hasOwnProperty.call(state.tagMap, handle)) {
      throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
    }

    if (!PATTERN_TAG_URI.test(prefix)) {
      throwError(state, 'ill-formed tag prefix (second argument) of the TAG directive');
    }

    try {
      prefix = decodeURIComponent(prefix);
    } catch (err) {
      throwError(state, 'tag prefix is malformed: ' + prefix);
    }

    state.tagMap[handle] = prefix;
  }
};


function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;

  if (start < end) {
    _result = state.input.slice(start, end);

    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 0x09 ||
              (0x20 <= _character && _character <= 0x10FFFF))) {
          throwError(state, 'expected valid JSON character');
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, 'the stream contains non-printable characters');
    }

    state.result += _result;
  }
}

function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;

  if (!common.isObject(source)) {
    throwError(state, 'cannot merge mappings; the provided source object is unacceptable');
  }

  sourceKeys = Object.keys(source);

  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];

    if (!_hasOwnProperty.call(destination, key)) {
      destination[key] = source[key];
      overridableKeys[key] = true;
    }
  }
}

function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode,
  startLine, startLineStart, startPos) {

  var index, quantity;

  // The output is a plain object here, so keys can only be strings.
  // We need to convert keyNode to a string, but doing so can hang the process
  // (deeply nested arrays that explode exponentially using aliases).
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);

    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, 'nested arrays are not supported inside keys');
      }

      if (typeof keyNode === 'object' && _class(keyNode[index]) === '[object Object]') {
        keyNode[index] = '[object Object]';
      }
    }
  }

  // Avoid code execution in load() via toString property
  // (still use its own toString for arrays, timestamps,
  // and whatever user schema extensions happen to have @@toStringTag)
  if (typeof keyNode === 'object' && _class(keyNode) === '[object Object]') {
    keyNode = '[object Object]';
  }


  keyNode = String(keyNode);

  if (_result === null) {
    _result = {};
  }

  if (keyTag === 'tag:yaml.org,2002:merge') {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json &&
        !_hasOwnProperty.call(overridableKeys, keyNode) &&
        _hasOwnProperty.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, 'duplicated mapping key');
    }

    // used for this specific key only because Object.defineProperty is slow
    if (keyNode === '__proto__') {
      Object.defineProperty(_result, keyNode, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: valueNode
      });
    } else {
      _result[keyNode] = valueNode;
    }
    delete overridableKeys[keyNode];
  }

  return _result;
}

function readLineBreak(state) {
  var ch;

  ch = state.input.charCodeAt(state.position);

  if (ch === 0x0A/* LF */) {
    state.position++;
  } else if (ch === 0x0D/* CR */) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 0x0A/* LF */) {
      state.position++;
    }
  } else {
    throwError(state, 'a line break is expected');
  }

  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}

function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0,
      ch = state.input.charCodeAt(state.position);

  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 0x09/* Tab */ && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }

    if (allowComments && ch === 0x23/* # */) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 0x0A/* LF */ && ch !== 0x0D/* CR */ && ch !== 0);
    }

    if (is_EOL(ch)) {
      readLineBreak(state);

      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;

      while (ch === 0x20/* Space */) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }

  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, 'deficient indentation');
  }

  return lineBreaks;
}

function testDocumentSeparator(state) {
  var _position = state.position,
      ch;

  ch = state.input.charCodeAt(_position);

  // Condition state.position === state.lineStart is tested
  // in parent on each call, for efficiency. No needs to test here again.
  if ((ch === 0x2D/* - */ || ch === 0x2E/* . */) &&
      ch === state.input.charCodeAt(_position + 1) &&
      ch === state.input.charCodeAt(_position + 2)) {

    _position += 3;

    ch = state.input.charCodeAt(_position);

    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }

  return false;
}

function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += ' ';
  } else if (count > 1) {
    state.result += common.repeat('\n', count - 1);
  }
}


function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding,
      following,
      captureStart,
      captureEnd,
      hasPendingContent,
      _line,
      _lineStart,
      _lineIndent,
      _kind = state.kind,
      _result = state.result,
      ch;

  ch = state.input.charCodeAt(state.position);

  if (is_WS_OR_EOL(ch)      ||
      is_FLOW_INDICATOR(ch) ||
      ch === 0x23/* # */    ||
      ch === 0x26/* & */    ||
      ch === 0x2A/* * */    ||
      ch === 0x21/* ! */    ||
      ch === 0x7C/* | */    ||
      ch === 0x3E/* > */    ||
      ch === 0x27/* ' */    ||
      ch === 0x22/* " */    ||
      ch === 0x25/* % */    ||
      ch === 0x40/* @ */    ||
      ch === 0x60/* ` */) {
    return false;
  }

  if (ch === 0x3F/* ? */ || ch === 0x2D/* - */) {
    following = state.input.charCodeAt(state.position + 1);

    if (is_WS_OR_EOL(following) ||
        withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }

  state.kind = 'scalar';
  state.result = '';
  captureStart = captureEnd = state.position;
  hasPendingContent = false;

  while (ch !== 0) {
    if (ch === 0x3A/* : */) {
      following = state.input.charCodeAt(state.position + 1);

      if (is_WS_OR_EOL(following) ||
          withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }

    } else if (ch === 0x23/* # */) {
      preceding = state.input.charCodeAt(state.position - 1);

      if (is_WS_OR_EOL(preceding)) {
        break;
      }

    } else if ((state.position === state.lineStart && testDocumentSeparator(state)) ||
               withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;

    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);

      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }

    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }

    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }

    ch = state.input.charCodeAt(++state.position);
  }

  captureSegment(state, captureStart, captureEnd, false);

  if (state.result) {
    return true;
  }

  state.kind = _kind;
  state.result = _result;
  return false;
}

function readSingleQuotedScalar(state, nodeIndent) {
  var ch,
      captureStart, captureEnd;

  ch = state.input.charCodeAt(state.position);

  if (ch !== 0x27/* ' */) {
    return false;
  }

  state.kind = 'scalar';
  state.result = '';
  state.position++;
  captureStart = captureEnd = state.position;

  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 0x27/* ' */) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);

      if (ch === 0x27/* ' */) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }

    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;

    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, 'unexpected end of the document within a single quoted scalar');

    } else {
      state.position++;
      captureEnd = state.position;
    }
  }

  throwError(state, 'unexpected end of the stream within a single quoted scalar');
}

function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart,
      captureEnd,
      hexLength,
      hexResult,
      tmp,
      ch;

  ch = state.input.charCodeAt(state.position);

  if (ch !== 0x22/* " */) {
    return false;
  }

  state.kind = 'scalar';
  state.result = '';
  state.position++;
  captureStart = captureEnd = state.position;

  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 0x22/* " */) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;

    } else if (ch === 0x5C/* \ */) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);

      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);

        // TODO: rework to inline fn with no type cast?
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;

      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;

        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);

          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;

          } else {
            throwError(state, 'expected hexadecimal character');
          }
        }

        state.result += charFromCodepoint(hexResult);

        state.position++;

      } else {
        throwError(state, 'unknown escape sequence');
      }

      captureStart = captureEnd = state.position;

    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;

    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, 'unexpected end of the document within a double quoted scalar');

    } else {
      state.position++;
      captureEnd = state.position;
    }
  }

  throwError(state, 'unexpected end of the stream within a double quoted scalar');
}

function readFlowCollection(state, nodeIndent) {
  var readNext = true,
      _line,
      _lineStart,
      _pos,
      _tag     = state.tag,
      _result,
      _anchor  = state.anchor,
      following,
      terminator,
      isPair,
      isExplicitPair,
      isMapping,
      overridableKeys = Object.create(null),
      keyNode,
      keyTag,
      valueNode,
      ch;

  ch = state.input.charCodeAt(state.position);

  if (ch === 0x5B/* [ */) {
    terminator = 0x5D;/* ] */
    isMapping = false;
    _result = [];
  } else if (ch === 0x7B/* { */) {
    terminator = 0x7D;/* } */
    isMapping = true;
    _result = {};
  } else {
    return false;
  }

  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }

  ch = state.input.charCodeAt(++state.position);

  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);

    ch = state.input.charCodeAt(state.position);

    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? 'mapping' : 'sequence';
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, 'missed comma between flow collection entries');
    } else if (ch === 0x2C/* , */) {
      // "flow collection entries can never be completely empty", as per YAML 1.2, section 7.4
      throwError(state, "expected the node content, but found ','");
    }

    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;

    if (ch === 0x3F/* ? */) {
      following = state.input.charCodeAt(state.position + 1);

      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }

    _line = state.line; // Save the current line.
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);

    ch = state.input.charCodeAt(state.position);

    if ((isExplicitPair || state.line === _line) && ch === 0x3A/* : */) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }

    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }

    skipSeparationSpace(state, true, nodeIndent);

    ch = state.input.charCodeAt(state.position);

    if (ch === 0x2C/* , */) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }

  throwError(state, 'unexpected end of the stream within a flow collection');
}

function readBlockScalar(state, nodeIndent) {
  var captureStart,
      folding,
      chomping       = CHOMPING_CLIP,
      didReadContent = false,
      detectedIndent = false,
      textIndent     = nodeIndent,
      emptyLines     = 0,
      atMoreIndented = false,
      tmp,
      ch;

  ch = state.input.charCodeAt(state.position);

  if (ch === 0x7C/* | */) {
    folding = false;
  } else if (ch === 0x3E/* > */) {
    folding = true;
  } else {
    return false;
  }

  state.kind = 'scalar';
  state.result = '';

  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);

    if (ch === 0x2B/* + */ || ch === 0x2D/* - */) {
      if (CHOMPING_CLIP === chomping) {
        chomping = (ch === 0x2B/* + */) ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, 'repeat of a chomping mode identifier');
      }

    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, 'bad explicit indentation width of a block scalar; it cannot be less than one');
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, 'repeat of an indentation width identifier');
      }

    } else {
      break;
    }
  }

  if (is_WHITE_SPACE(ch)) {
    do { ch = state.input.charCodeAt(++state.position); }
    while (is_WHITE_SPACE(ch));

    if (ch === 0x23/* # */) {
      do { ch = state.input.charCodeAt(++state.position); }
      while (!is_EOL(ch) && (ch !== 0));
    }
  }

  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;

    ch = state.input.charCodeAt(state.position);

    while ((!detectedIndent || state.lineIndent < textIndent) &&
           (ch === 0x20/* Space */)) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }

    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }

    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }

    // End of the scalar.
    if (state.lineIndent < textIndent) {

      // Perform the chomping.
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat('\n', didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) { // i.e. only if the scalar is not empty.
          state.result += '\n';
        }
      }

      // Break this `while` cycle and go to the funciton's epilogue.
      break;
    }

    // Folded style: use fancy rules to handle line breaks.
    if (folding) {

      // Lines starting with white space characters (more-indented lines) are not folded.
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        // except for the first content line (cf. Example 8.1)
        state.result += common.repeat('\n', didReadContent ? 1 + emptyLines : emptyLines);

      // End of more-indented block.
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat('\n', emptyLines + 1);

      // Just one line break - perceive as the same line.
      } else if (emptyLines === 0) {
        if (didReadContent) { // i.e. only if we have already read some scalar content.
          state.result += ' ';
        }

      // Several line breaks - perceive as different lines.
      } else {
        state.result += common.repeat('\n', emptyLines);
      }

    // Literal style: just add exact number of line breaks between content lines.
    } else {
      // Keep all line breaks except the header line break.
      state.result += common.repeat('\n', didReadContent ? 1 + emptyLines : emptyLines);
    }

    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;

    while (!is_EOL(ch) && (ch !== 0)) {
      ch = state.input.charCodeAt(++state.position);
    }

    captureSegment(state, captureStart, state.position, false);
  }

  return true;
}

function readBlockSequence(state, nodeIndent) {
  var _line,
      _tag      = state.tag,
      _anchor   = state.anchor,
      _result   = [],
      following,
      detected  = false,
      ch;

  // there is a leading tab before this token, so it can't be a block sequence/mapping;
  // it can still be flow sequence/mapping or a scalar
  if (state.firstTabInLine !== -1) return false;

  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }

  ch = state.input.charCodeAt(state.position);

  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, 'tab characters must not be used in indentation');
    }

    if (ch !== 0x2D/* - */) {
      break;
    }

    following = state.input.charCodeAt(state.position + 1);

    if (!is_WS_OR_EOL(following)) {
      break;
    }

    detected = true;
    state.position++;

    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }

    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);

    ch = state.input.charCodeAt(state.position);

    if ((state.line === _line || state.lineIndent > nodeIndent) && (ch !== 0)) {
      throwError(state, 'bad indentation of a sequence entry');
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }

  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = 'sequence';
    state.result = _result;
    return true;
  }
  return false;
}

function readBlockMapping(state, nodeIndent, flowIndent) {
  var following,
      allowCompact,
      _line,
      _keyLine,
      _keyLineStart,
      _keyPos,
      _tag          = state.tag,
      _anchor       = state.anchor,
      _result       = {},
      overridableKeys = Object.create(null),
      keyTag        = null,
      keyNode       = null,
      valueNode     = null,
      atExplicitKey = false,
      detected      = false,
      ch;

  // there is a leading tab before this token, so it can't be a block sequence/mapping;
  // it can still be flow sequence/mapping or a scalar
  if (state.firstTabInLine !== -1) return false;

  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }

  ch = state.input.charCodeAt(state.position);

  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, 'tab characters must not be used in indentation');
    }

    following = state.input.charCodeAt(state.position + 1);
    _line = state.line; // Save the current line.

    //
    // Explicit notation case. There are two separate blocks:
    // first for the key (denoted by "?") and second for the value (denoted by ":")
    //
    if ((ch === 0x3F/* ? */ || ch === 0x3A/* : */) && is_WS_OR_EOL(following)) {

      if (ch === 0x3F/* ? */) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }

        detected = true;
        atExplicitKey = true;
        allowCompact = true;

      } else if (atExplicitKey) {
        // i.e. 0x3A/* : */ === character after the explicit key.
        atExplicitKey = false;
        allowCompact = true;

      } else {
        throwError(state, 'incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line');
      }

      state.position += 1;
      ch = following;

    //
    // Implicit notation case. Flow-style node as the key first, then ":", and the value.
    //
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;

      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        // Neither implicit nor explicit notation.
        // Reading is done. Go to the epilogue.
        break;
      }

      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);

        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }

        if (ch === 0x3A/* : */) {
          ch = state.input.charCodeAt(++state.position);

          if (!is_WS_OR_EOL(ch)) {
            throwError(state, 'a whitespace character is expected after the key-value separator within a block mapping');
          }

          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }

          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;

        } else if (detected) {
          throwError(state, 'can not read an implicit mapping pair; a colon is missed');

        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true; // Keep the result of `composeNode`.
        }

      } else if (detected) {
        throwError(state, 'can not read a block mapping entry; a multiline key may not be an implicit key');

      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true; // Keep the result of `composeNode`.
      }
    }

    //
    // Common reading code for both explicit and implicit notations.
    //
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }

      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }

      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }

      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }

    if ((state.line === _line || state.lineIndent > nodeIndent) && (ch !== 0)) {
      throwError(state, 'bad indentation of a mapping entry');
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }

  //
  // Epilogue.
  //

  // Special case: last mapping's node contains only the key in explicit notation.
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }

  // Expose the resulting mapping.
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = 'mapping';
    state.result = _result;
  }

  return detected;
}

function readTagProperty(state) {
  var _position,
      isVerbatim = false,
      isNamed    = false,
      tagHandle,
      tagName,
      ch;

  ch = state.input.charCodeAt(state.position);

  if (ch !== 0x21/* ! */) return false;

  if (state.tag !== null) {
    throwError(state, 'duplication of a tag property');
  }

  ch = state.input.charCodeAt(++state.position);

  if (ch === 0x3C/* < */) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);

  } else if (ch === 0x21/* ! */) {
    isNamed = true;
    tagHandle = '!!';
    ch = state.input.charCodeAt(++state.position);

  } else {
    tagHandle = '!';
  }

  _position = state.position;

  if (isVerbatim) {
    do { ch = state.input.charCodeAt(++state.position); }
    while (ch !== 0 && ch !== 0x3E/* > */);

    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, 'unexpected end of the stream within a verbatim tag');
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {

      if (ch === 0x21/* ! */) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);

          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, 'named tag handle cannot contain such characters');
          }

          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, 'tag suffix cannot contain exclamation marks');
        }
      }

      ch = state.input.charCodeAt(++state.position);
    }

    tagName = state.input.slice(_position, state.position);

    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, 'tag suffix cannot contain flow indicator characters');
    }
  }

  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, 'tag name cannot contain such characters: ' + tagName);
  }

  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, 'tag name is malformed: ' + tagName);
  }

  if (isVerbatim) {
    state.tag = tagName;

  } else if (_hasOwnProperty.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;

  } else if (tagHandle === '!') {
    state.tag = '!' + tagName;

  } else if (tagHandle === '!!') {
    state.tag = 'tag:yaml.org,2002:' + tagName;

  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }

  return true;
}

function readAnchorProperty(state) {
  var _position,
      ch;

  ch = state.input.charCodeAt(state.position);

  if (ch !== 0x26/* & */) return false;

  if (state.anchor !== null) {
    throwError(state, 'duplication of an anchor property');
  }

  ch = state.input.charCodeAt(++state.position);
  _position = state.position;

  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }

  if (state.position === _position) {
    throwError(state, 'name of an anchor node must contain at least one character');
  }

  state.anchor = state.input.slice(_position, state.position);
  return true;
}

function readAlias(state) {
  var _position, alias,
      ch;

  ch = state.input.charCodeAt(state.position);

  if (ch !== 0x2A/* * */) return false;

  ch = state.input.charCodeAt(++state.position);
  _position = state.position;

  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }

  if (state.position === _position) {
    throwError(state, 'name of an alias node must contain at least one character');
  }

  alias = state.input.slice(_position, state.position);

  if (!_hasOwnProperty.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }

  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}

function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles,
      allowBlockScalars,
      allowBlockCollections,
      indentStatus = 1, // 1: this>parent, 0: this=parent, -1: this<parent
      atNewLine  = false,
      hasContent = false,
      typeIndex,
      typeQuantity,
      typeList,
      type,
      flowIndent,
      blockIndent;

  if (state.listener !== null) {
    state.listener('open', state);
  }

  state.tag    = null;
  state.anchor = null;
  state.kind   = null;
  state.result = null;

  allowBlockStyles = allowBlockScalars = allowBlockCollections =
    CONTEXT_BLOCK_OUT === nodeContext ||
    CONTEXT_BLOCK_IN  === nodeContext;

  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;

      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }

  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;

        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }

  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }

  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }

    blockIndent = state.position - state.lineStart;

    if (indentStatus === 1) {
      if (allowBlockCollections &&
          (readBlockSequence(state, blockIndent) ||
           readBlockMapping(state, blockIndent, flowIndent)) ||
          readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if ((allowBlockScalars && readBlockScalar(state, flowIndent)) ||
            readSingleQuotedScalar(state, flowIndent) ||
            readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;

        } else if (readAlias(state)) {
          hasContent = true;

          if (state.tag !== null || state.anchor !== null) {
            throwError(state, 'alias node should not have any properties');
          }

        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;

          if (state.tag === null) {
            state.tag = '?';
          }
        }

        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      // Special case: block sequences are allowed to have same indentation level as the parent.
      // http://www.yaml.org/spec/1.2/spec.html#id2799784
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }

  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }

  } else if (state.tag === '?') {
    // Implicit resolving is not allowed for non-scalar types, and '?'
    // non-specific tag is only automatically assigned to plain scalars.
    //
    // We only need to check kind conformity in case user explicitly assigns '?'
    // tag, for example like this: "!<?> [0]"
    //
    if (state.result !== null && state.kind !== 'scalar') {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }

    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type = state.implicitTypes[typeIndex];

      if (type.resolve(state.result)) { // `state.result` updated in resolver if matched
        state.result = type.construct(state.result);
        state.tag = type.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== '!') {
    if (_hasOwnProperty.call(state.typeMap[state.kind || 'fallback'], state.tag)) {
      type = state.typeMap[state.kind || 'fallback'][state.tag];
    } else {
      // looking for multi type
      type = null;
      typeList = state.typeMap.multi[state.kind || 'fallback'];

      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type = typeList[typeIndex];
          break;
        }
      }
    }

    if (!type) {
      throwError(state, 'unknown tag !<' + state.tag + '>');
    }

    if (state.result !== null && type.kind !== state.kind) {
      throwError(state, 'unacceptable node kind for !<' + state.tag + '> tag; it should be "' + type.kind + '", not "' + state.kind + '"');
    }

    if (!type.resolve(state.result, state.tag)) { // `state.result` updated in resolver if matched
      throwError(state, 'cannot resolve a node with !<' + state.tag + '> explicit tag');
    } else {
      state.result = type.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }

  if (state.listener !== null) {
    state.listener('close', state);
  }
  return state.tag !== null ||  state.anchor !== null || hasContent;
}

function readDocument(state) {
  var documentStart = state.position,
      _position,
      directiveName,
      directiveArgs,
      hasDirectives = false,
      ch;

  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = Object.create(null);
  state.anchorMap = Object.create(null);

  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);

    ch = state.input.charCodeAt(state.position);

    if (state.lineIndent > 0 || ch !== 0x25/* % */) {
      break;
    }

    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;

    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }

    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];

    if (directiveName.length < 1) {
      throwError(state, 'directive name must not be less than one character in length');
    }

    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }

      if (ch === 0x23/* # */) {
        do { ch = state.input.charCodeAt(++state.position); }
        while (ch !== 0 && !is_EOL(ch));
        break;
      }

      if (is_EOL(ch)) break;

      _position = state.position;

      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }

      directiveArgs.push(state.input.slice(_position, state.position));
    }

    if (ch !== 0) readLineBreak(state);

    if (_hasOwnProperty.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }

  skipSeparationSpace(state, true, -1);

  if (state.lineIndent === 0 &&
      state.input.charCodeAt(state.position)     === 0x2D/* - */ &&
      state.input.charCodeAt(state.position + 1) === 0x2D/* - */ &&
      state.input.charCodeAt(state.position + 2) === 0x2D/* - */) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);

  } else if (hasDirectives) {
    throwError(state, 'directives end mark is expected');
  }

  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);

  if (state.checkLineBreaks &&
      PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, 'non-ASCII line breaks are interpreted as content');
  }

  state.documents.push(state.result);

  if (state.position === state.lineStart && testDocumentSeparator(state)) {

    if (state.input.charCodeAt(state.position) === 0x2E/* . */) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }

  if (state.position < (state.length - 1)) {
    throwError(state, 'end of the stream or a document separator is expected');
  } else {
    return;
  }
}


function loadDocuments(input, options) {
  input = String(input);
  options = options || {};

  if (input.length !== 0) {

    // Add tailing `\n` if not exists
    if (input.charCodeAt(input.length - 1) !== 0x0A/* LF */ &&
        input.charCodeAt(input.length - 1) !== 0x0D/* CR */) {
      input += '\n';
    }

    // Strip BOM
    if (input.charCodeAt(0) === 0xFEFF) {
      input = input.slice(1);
    }
  }

  var state = new State(input, options);

  var nullpos = input.indexOf('\0');

  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, 'null byte is not allowed in input');
  }

  // Use 0 as string terminator. That significantly simplifies bounds check.
  state.input += '\0';

  while (state.input.charCodeAt(state.position) === 0x20/* Space */) {
    state.lineIndent += 1;
    state.position += 1;
  }

  while (state.position < (state.length - 1)) {
    readDocument(state);
  }

  return state.documents;
}


function loadAll(input, iterator, options) {
  if (iterator !== null && typeof iterator === 'object' && typeof options === 'undefined') {
    options = iterator;
    iterator = null;
  }

  var documents = loadDocuments(input, options);

  if (typeof iterator !== 'function') {
    return documents;
  }

  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}


function load(input, options) {
  var documents = loadDocuments(input, options);

  if (documents.length === 0) {
    /*eslint-disable no-undefined*/
    return undefined;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new YAMLException('expected a single document in the stream, but found more');
}


module.exports.loadAll = loadAll;
module.exports.load    = load;

},
"@xufa/yaml/lib/schema.js": function (module, exports, require) {
'use strict';

/*eslint-disable max-len*/

var YAMLException = require('./exception');
var Type          = require('./type');


function compileList(schema, name) {
  var result = [];

  schema[name].forEach(function (currentType) {
    var newIndex = result.length;

    result.forEach(function (previousType, previousIndex) {
      if (previousType.tag === currentType.tag &&
          previousType.kind === currentType.kind &&
          previousType.multi === currentType.multi) {

        newIndex = previousIndex;
      }
    });

    result[newIndex] = currentType;
  });

  return result;
}


function compileMap(/* lists... */) {
  var result = {
        scalar: {},
        sequence: {},
        mapping: {},
        fallback: {},
        multi: {
          scalar: [],
          sequence: [],
          mapping: [],
          fallback: []
        }
      }, index, length;

  function collectType(type) {
    if (type.multi) {
      result.multi[type.kind].push(type);
      result.multi['fallback'].push(type);
    } else {
      result[type.kind][type.tag] = result['fallback'][type.tag] = type;
    }
  }

  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}


function Schema(definition) {
  return this.extend(definition);
}


Schema.prototype.extend = function extend(definition) {
  var implicit = [];
  var explicit = [];

  if (definition instanceof Type) {
    // Schema.extend(type)
    explicit.push(definition);

  } else if (Array.isArray(definition)) {
    // Schema.extend([ type1, type2, ... ])
    explicit = explicit.concat(definition);

  } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
    // Schema.extend({ explicit: [ type1, type2, ... ], implicit: [ type1, type2, ... ] })
    if (definition.implicit) implicit = implicit.concat(definition.implicit);
    if (definition.explicit) explicit = explicit.concat(definition.explicit);

  } else {
    throw new YAMLException('Schema.extend argument should be a Type, [ Type ], ' +
      'or a schema definition ({ implicit: [...], explicit: [...] })');
  }

  implicit.forEach(function (type) {
    if (!(type instanceof Type)) {
      throw new YAMLException('Specified list of YAML types (or a single Type object) contains a non-Type object.');
    }

    if (type.loadKind && type.loadKind !== 'scalar') {
      throw new YAMLException('There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.');
    }

    if (type.multi) {
      throw new YAMLException('There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.');
    }
  });

  explicit.forEach(function (type) {
    if (!(type instanceof Type)) {
      throw new YAMLException('Specified list of YAML types (or a single Type object) contains a non-Type object.');
    }
  });

  var result = Object.create(Schema.prototype);

  result.implicit = (this.implicit || []).concat(implicit);
  result.explicit = (this.explicit || []).concat(explicit);

  result.compiledImplicit = compileList(result, 'implicit');
  result.compiledExplicit = compileList(result, 'explicit');
  result.compiledTypeMap  = compileMap(result.compiledImplicit, result.compiledExplicit);

  return result;
};


module.exports = Schema;

},
"@xufa/yaml/lib/schema/core.js": function (module, exports, require) {
// Standard YAML's Core schema.
// http://www.yaml.org/spec/1.2/spec.html#id2804923
//
// NOTE: JS-YAML does not support schema-specific tag resolution restrictions.
// So, Core schema has no distinctions from JSON schema is JS-YAML.


'use strict';


module.exports = require('./json');

},
"@xufa/yaml/lib/schema/default.js": function (module, exports, require) {
// JS-YAML's default schema for `safeLoad` function.
// It is not described in the YAML specification.
//
// This schema is based on standard YAML's Core schema and includes most of
// extra types described at YAML tag repository. (http://yaml.org/type/)


'use strict';


module.exports = require('./core').extend({
  implicit: [
    require('../type/timestamp'),
    require('../type/merge')
  ],
  explicit: [
    require('../type/binary'),
    require('../type/omap'),
    require('../type/pairs'),
    require('../type/set')
  ]
});

},
"@xufa/yaml/lib/schema/failsafe.js": function (module, exports, require) {
// Standard YAML's Failsafe schema.
// http://www.yaml.org/spec/1.2/spec.html#id2802346


'use strict';


var Schema = require('../schema');


module.exports = new Schema({
  explicit: [
    require('../type/str'),
    require('../type/seq'),
    require('../type/map')
  ]
});

},
"@xufa/yaml/lib/schema/json.js": function (module, exports, require) {
// Standard YAML's JSON schema.
// http://www.yaml.org/spec/1.2/spec.html#id2803231
//
// NOTE: JS-YAML does not support schema-specific tag resolution restrictions.
// So, this schema is not such strict as defined in the YAML specification.
// It allows numbers in binary notaion, use `Null` and `NULL` as `null`, etc.


'use strict';


module.exports = require('./failsafe').extend({
  implicit: [
    require('../type/null'),
    require('../type/bool'),
    require('../type/int'),
    require('../type/float')
  ]
});

},
"@xufa/yaml/lib/snippet.js": function (module, exports, require) {
'use strict';


var common = require('./common');


// get snippet for a single line, respecting maxLength
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = '';
  var tail = '';
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;

  if (position - lineStart > maxHalfLength) {
    head = ' ... ';
    lineStart = position - maxHalfLength + head.length;
  }

  if (lineEnd - position > maxHalfLength) {
    tail = ' ...';
    lineEnd = position + maxHalfLength - tail.length;
  }

  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, '→') + tail,
    pos: position - lineStart + head.length // relative position
  };
}


function padStart(string, max) {
  return common.repeat(' ', max - string.length) + string;
}


function makeSnippet(mark, options) {
  options = Object.create(options || null);

  if (!mark.buffer) return null;

  if (!options.maxLength) options.maxLength = 79;
  if (typeof options.indent      !== 'number') options.indent      = 1;
  if (typeof options.linesBefore !== 'number') options.linesBefore = 3;
  if (typeof options.linesAfter  !== 'number') options.linesAfter  = 2;

  var re = /\r?\n|\r|\0/g;
  var lineStarts = [ 0 ];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;

  while ((match = re.exec(mark.buffer))) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);

    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }

  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;

  var result = '', i, line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);

  for (i = 1; i <= options.linesBefore; i++) {
    if (foundLineNo - i < 0) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo - i],
      lineEnds[foundLineNo - i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
      maxLineLength
    );
    result = common.repeat(' ', options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) +
      ' | ' + line.str + '\n' + result;
  }

  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(' ', options.indent) + padStart((mark.line + 1).toString(), lineNoLength) +
    ' | ' + line.str + '\n';
  result += common.repeat('-', options.indent + lineNoLength + 3 + line.pos) + '^' + '\n';

  for (i = 1; i <= options.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length) break;
    line = getLine(
      mark.buffer,
      lineStarts[foundLineNo + i],
      lineEnds[foundLineNo + i],
      mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
      maxLineLength
    );
    result += common.repeat(' ', options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) +
      ' | ' + line.str + '\n';
  }

  return result.replace(/\n$/, '');
}


module.exports = makeSnippet;

},
"@xufa/yaml/lib/type.js": function (module, exports, require) {
'use strict';

var YAMLException = require('./exception');

var TYPE_CONSTRUCTOR_OPTIONS = [
  'kind',
  'multi',
  'resolve',
  'construct',
  'instanceOf',
  'predicate',
  'represent',
  'representName',
  'defaultStyle',
  'styleAliases'
];

var YAML_NODE_KINDS = [
  'scalar',
  'sequence',
  'mapping'
];

function compileStyleAliases(map) {
  var result = {};

  if (map !== null) {
    Object.keys(map).forEach(function (style) {
      map[style].forEach(function (alias) {
        result[String(alias)] = style;
      });
    });
  }

  return result;
}

function Type(tag, options) {
  options = options || {};

  Object.keys(options).forEach(function (name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new YAMLException('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });

  // TODO: Add tag format check.
  this.options       = options; // keep original options in case user wants to extend this type later
  this.tag           = tag;
  this.kind          = options['kind']          || null;
  this.resolve       = options['resolve']       || function () { return true; };
  this.construct     = options['construct']     || function (data) { return data; };
  this.instanceOf    = options['instanceOf']    || null;
  this.predicate     = options['predicate']     || null;
  this.represent     = options['represent']     || null;
  this.representName = options['representName'] || null;
  this.defaultStyle  = options['defaultStyle']  || null;
  this.multi         = options['multi']         || false;
  this.styleAliases  = compileStyleAliases(options['styleAliases'] || null);

  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new YAMLException('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}

module.exports = Type;

},
"@xufa/yaml/lib/type/binary.js": function (module, exports, require) {
'use strict';

/*eslint-disable no-bitwise*/


var Type = require('../type');


// [ 64, 65, 66 ] -> [ padding, CR, LF ]
var BASE64_MAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r';


function resolveYamlBinary(data) {
  if (data === null) return false;

  var code, idx, bitlen = 0, max = data.length, map = BASE64_MAP;

  // Convert one by one.
  for (idx = 0; idx < max; idx++) {
    code = map.indexOf(data.charAt(idx));

    // Skip CR/LF
    if (code > 64) continue;

    // Fail on illegal characters
    if (code < 0) return false;

    bitlen += 6;
  }

  // If there are any bits left, source was corrupted
  return (bitlen % 8) === 0;
}

function constructYamlBinary(data) {
  var idx, tailbits,
      input = data.replace(/[\r\n=]/g, ''), // remove CR/LF & padding to simplify scan
      max = input.length,
      map = BASE64_MAP,
      bits = 0,
      result = [];

  // Collect by 6*4 bits (3 bytes)

  for (idx = 0; idx < max; idx++) {
    if ((idx % 4 === 0) && idx) {
      result.push((bits >> 16) & 0xFF);
      result.push((bits >> 8) & 0xFF);
      result.push(bits & 0xFF);
    }

    bits = (bits << 6) | map.indexOf(input.charAt(idx));
  }

  // Dump tail

  tailbits = (max % 4) * 6;

  if (tailbits === 0) {
    result.push((bits >> 16) & 0xFF);
    result.push((bits >> 8) & 0xFF);
    result.push(bits & 0xFF);
  } else if (tailbits === 18) {
    result.push((bits >> 10) & 0xFF);
    result.push((bits >> 2) & 0xFF);
  } else if (tailbits === 12) {
    result.push((bits >> 4) & 0xFF);
  }

  return new Uint8Array(result);
}

function representYamlBinary(object /*, style*/) {
  var result = '', bits = 0, idx, tail,
      max = object.length,
      map = BASE64_MAP;

  // Convert every three bytes to 4 ASCII characters.

  for (idx = 0; idx < max; idx++) {
    if ((idx % 3 === 0) && idx) {
      result += map[(bits >> 18) & 0x3F];
      result += map[(bits >> 12) & 0x3F];
      result += map[(bits >> 6) & 0x3F];
      result += map[bits & 0x3F];
    }

    bits = (bits << 8) + object[idx];
  }

  // Dump tail

  tail = max % 3;

  if (tail === 0) {
    result += map[(bits >> 18) & 0x3F];
    result += map[(bits >> 12) & 0x3F];
    result += map[(bits >> 6) & 0x3F];
    result += map[bits & 0x3F];
  } else if (tail === 2) {
    result += map[(bits >> 10) & 0x3F];
    result += map[(bits >> 4) & 0x3F];
    result += map[(bits << 2) & 0x3F];
    result += map[64];
  } else if (tail === 1) {
    result += map[(bits >> 2) & 0x3F];
    result += map[(bits << 4) & 0x3F];
    result += map[64];
    result += map[64];
  }

  return result;
}

function isBinary(obj) {
  return Object.prototype.toString.call(obj) ===  '[object Uint8Array]';
}

module.exports = new Type('tag:yaml.org,2002:binary', {
  kind: 'scalar',
  resolve: resolveYamlBinary,
  construct: constructYamlBinary,
  predicate: isBinary,
  represent: representYamlBinary
});

},
"@xufa/yaml/lib/type/bool.js": function (module, exports, require) {
'use strict';

var Type = require('../type');

function resolveYamlBoolean(data) {
  if (data === null) return false;

  var max = data.length;

  return (max === 4 && (data === 'true' || data === 'True' || data === 'TRUE')) ||
         (max === 5 && (data === 'false' || data === 'False' || data === 'FALSE'));
}

function constructYamlBoolean(data) {
  return data === 'true' ||
         data === 'True' ||
         data === 'TRUE';
}

function isBoolean(object) {
  return Object.prototype.toString.call(object) === '[object Boolean]';
}

module.exports = new Type('tag:yaml.org,2002:bool', {
  kind: 'scalar',
  resolve: resolveYamlBoolean,
  construct: constructYamlBoolean,
  predicate: isBoolean,
  represent: {
    lowercase: function (object) { return object ? 'true' : 'false'; },
    uppercase: function (object) { return object ? 'TRUE' : 'FALSE'; },
    camelcase: function (object) { return object ? 'True' : 'False'; }
  },
  defaultStyle: 'lowercase'
});

},
"@xufa/yaml/lib/type/float.js": function (module, exports, require) {
'use strict';

var common = require('../common');
var Type   = require('../type');

var YAML_FLOAT_PATTERN = new RegExp(
  // 2.5e4, 2.5 and integers
  '^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?' +
  // .2e4, .2
  // special case, seems not from spec
  '|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?' +
  // .inf
  '|[-+]?\\.(?:inf|Inf|INF)' +
  // .nan
  '|\\.(?:nan|NaN|NAN))$');

function resolveYamlFloat(data) {
  if (data === null) return false;

  if (!YAML_FLOAT_PATTERN.test(data) ||
      // Quick hack to not allow integers end with `_`
      // Probably should update regexp & check speed
      data[data.length - 1] === '_') {
    return false;
  }

  return true;
}

function constructYamlFloat(data) {
  var value, sign;

  value  = data.replace(/_/g, '').toLowerCase();
  sign   = value[0] === '-' ? -1 : 1;

  if ('+-'.indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }

  if (value === '.inf') {
    return (sign === 1) ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;

  } else if (value === '.nan') {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}


var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;

function representYamlFloat(object, style) {
  var res;

  if (isNaN(object)) {
    switch (style) {
      case 'lowercase': return '.nan';
      case 'uppercase': return '.NAN';
      case 'camelcase': return '.NaN';
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case 'lowercase': return '.inf';
      case 'uppercase': return '.INF';
      case 'camelcase': return '.Inf';
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case 'lowercase': return '-.inf';
      case 'uppercase': return '-.INF';
      case 'camelcase': return '-.Inf';
    }
  } else if (common.isNegativeZero(object)) {
    return '-0.0';
  }

  res = object.toString(10);

  // JS stringifier can build scientific format without dots: 5e-100,
  // while YAML requres dot: 5.e-100. Fix it with simple hack

  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace('e', '.e') : res;
}

function isFloat(object) {
  return (Object.prototype.toString.call(object) === '[object Number]') &&
         (object % 1 !== 0 || common.isNegativeZero(object));
}

module.exports = new Type('tag:yaml.org,2002:float', {
  kind: 'scalar',
  resolve: resolveYamlFloat,
  construct: constructYamlFloat,
  predicate: isFloat,
  represent: representYamlFloat,
  defaultStyle: 'lowercase'
});

},
"@xufa/yaml/lib/type/int.js": function (module, exports, require) {
'use strict';

var common = require('../common');
var Type   = require('../type');

function isHexCode(c) {
  return ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */)) ||
         ((0x41/* A */ <= c) && (c <= 0x46/* F */)) ||
         ((0x61/* a */ <= c) && (c <= 0x66/* f */));
}

function isOctCode(c) {
  return ((0x30/* 0 */ <= c) && (c <= 0x37/* 7 */));
}

function isDecCode(c) {
  return ((0x30/* 0 */ <= c) && (c <= 0x39/* 9 */));
}

function resolveYamlInteger(data) {
  if (data === null) return false;

  var max = data.length,
      index = 0,
      hasDigits = false,
      ch;

  if (!max) return false;

  ch = data[index];

  // sign
  if (ch === '-' || ch === '+') {
    ch = data[++index];
  }

  if (ch === '0') {
    // 0
    if (index + 1 === max) return true;
    ch = data[++index];

    // base 2, base 8, base 16

    if (ch === 'b') {
      // base 2
      index++;

      for (; index < max; index++) {
        ch = data[index];
        if (ch === '_') continue;
        if (ch !== '0' && ch !== '1') return false;
        hasDigits = true;
      }
      return hasDigits && ch !== '_';
    }


    if (ch === 'x') {
      // base 16
      index++;

      for (; index < max; index++) {
        ch = data[index];
        if (ch === '_') continue;
        if (!isHexCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== '_';
    }


    if (ch === 'o') {
      // base 8
      index++;

      for (; index < max; index++) {
        ch = data[index];
        if (ch === '_') continue;
        if (!isOctCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== '_';
    }
  }

  // base 10 (except 0)

  // value should not start with `_`;
  if (ch === '_') return false;

  for (; index < max; index++) {
    ch = data[index];
    if (ch === '_') continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }

  // Should have digits and should not end with `_`
  if (!hasDigits || ch === '_') return false;

  return true;
}

function constructYamlInteger(data) {
  var value = data, sign = 1, ch;

  if (value.indexOf('_') !== -1) {
    value = value.replace(/_/g, '');
  }

  ch = value[0];

  if (ch === '-' || ch === '+') {
    if (ch === '-') sign = -1;
    value = value.slice(1);
    ch = value[0];
  }

  if (value === '0') return 0;

  if (ch === '0') {
    if (value[1] === 'b') return sign * parseInt(value.slice(2), 2);
    if (value[1] === 'x') return sign * parseInt(value.slice(2), 16);
    if (value[1] === 'o') return sign * parseInt(value.slice(2), 8);
  }

  return sign * parseInt(value, 10);
}

function isInteger(object) {
  return (Object.prototype.toString.call(object)) === '[object Number]' &&
         (object % 1 === 0 && !common.isNegativeZero(object));
}

module.exports = new Type('tag:yaml.org,2002:int', {
  kind: 'scalar',
  resolve: resolveYamlInteger,
  construct: constructYamlInteger,
  predicate: isInteger,
  represent: {
    binary:      function (obj) { return obj >= 0 ? '0b' + obj.toString(2) : '-0b' + obj.toString(2).slice(1); },
    octal:       function (obj) { return obj >= 0 ? '0o'  + obj.toString(8) : '-0o'  + obj.toString(8).slice(1); },
    decimal:     function (obj) { return obj.toString(10); },
    /* eslint-disable max-len */
    hexadecimal: function (obj) { return obj >= 0 ? '0x' + obj.toString(16).toUpperCase() :  '-0x' + obj.toString(16).toUpperCase().slice(1); }
  },
  defaultStyle: 'decimal',
  styleAliases: {
    binary:      [ 2,  'bin' ],
    octal:       [ 8,  'oct' ],
    decimal:     [ 10, 'dec' ],
    hexadecimal: [ 16, 'hex' ]
  }
});

},
"@xufa/yaml/lib/type/map.js": function (module, exports, require) {
'use strict';

var Type = require('../type');

module.exports = new Type('tag:yaml.org,2002:map', {
  kind: 'mapping',
  construct: function (data) { return data !== null ? data : {}; }
});

},
"@xufa/yaml/lib/type/merge.js": function (module, exports, require) {
'use strict';

var Type = require('../type');

function resolveYamlMerge(data) {
  return data === '<<' || data === null;
}

module.exports = new Type('tag:yaml.org,2002:merge', {
  kind: 'scalar',
  resolve: resolveYamlMerge
});

},
"@xufa/yaml/lib/type/null.js": function (module, exports, require) {
'use strict';

var Type = require('../type');

function resolveYamlNull(data) {
  if (data === null) return true;

  var max = data.length;

  return (max === 1 && data === '~') ||
         (max === 4 && (data === 'null' || data === 'Null' || data === 'NULL'));
}

function constructYamlNull() {
  return null;
}

function isNull(object) {
  return object === null;
}

module.exports = new Type('tag:yaml.org,2002:null', {
  kind: 'scalar',
  resolve: resolveYamlNull,
  construct: constructYamlNull,
  predicate: isNull,
  represent: {
    canonical: function () { return '~';    },
    lowercase: function () { return 'null'; },
    uppercase: function () { return 'NULL'; },
    camelcase: function () { return 'Null'; },
    empty:     function () { return '';     }
  },
  defaultStyle: 'lowercase'
});

},
"@xufa/yaml/lib/type/omap.js": function (module, exports, require) {
'use strict';

var Type = require('../type');

var _hasOwnProperty = Object.prototype.hasOwnProperty;
var _toString       = Object.prototype.toString;

function resolveYamlOmap(data) {
  if (data === null) return true;

  var objectKeys = [], index, length, pair, pairKey, pairHasKey,
      object = data;

  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;

    if (_toString.call(pair) !== '[object Object]') return false;

    for (pairKey in pair) {
      if (_hasOwnProperty.call(pair, pairKey)) {
        if (!pairHasKey) pairHasKey = true;
        else return false;
      }
    }

    if (!pairHasKey) return false;

    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
    else return false;
  }

  return true;
}

function constructYamlOmap(data) {
  return data !== null ? data : [];
}

module.exports = new Type('tag:yaml.org,2002:omap', {
  kind: 'sequence',
  resolve: resolveYamlOmap,
  construct: constructYamlOmap
});

},
"@xufa/yaml/lib/type/pairs.js": function (module, exports, require) {
'use strict';

var Type = require('../type');

var _toString = Object.prototype.toString;

function resolveYamlPairs(data) {
  if (data === null) return true;

  var index, length, pair, keys, result,
      object = data;

  result = new Array(object.length);

  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];

    if (_toString.call(pair) !== '[object Object]') return false;

    keys = Object.keys(pair);

    if (keys.length !== 1) return false;

    result[index] = [ keys[0], pair[keys[0]] ];
  }

  return true;
}

function constructYamlPairs(data) {
  if (data === null) return [];

  var index, length, pair, keys, result,
      object = data;

  result = new Array(object.length);

  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];

    keys = Object.keys(pair);

    result[index] = [ keys[0], pair[keys[0]] ];
  }

  return result;
}

module.exports = new Type('tag:yaml.org,2002:pairs', {
  kind: 'sequence',
  resolve: resolveYamlPairs,
  construct: constructYamlPairs
});

},
"@xufa/yaml/lib/type/seq.js": function (module, exports, require) {
'use strict';

var Type = require('../type');

module.exports = new Type('tag:yaml.org,2002:seq', {
  kind: 'sequence',
  construct: function (data) { return data !== null ? data : []; }
});

},
"@xufa/yaml/lib/type/set.js": function (module, exports, require) {
'use strict';

var Type = require('../type');

var _hasOwnProperty = Object.prototype.hasOwnProperty;

function resolveYamlSet(data) {
  if (data === null) return true;

  var key, object = data;

  for (key in object) {
    if (_hasOwnProperty.call(object, key)) {
      if (object[key] !== null) return false;
    }
  }

  return true;
}

function constructYamlSet(data) {
  return data !== null ? data : {};
}

module.exports = new Type('tag:yaml.org,2002:set', {
  kind: 'mapping',
  resolve: resolveYamlSet,
  construct: constructYamlSet
});

},
"@xufa/yaml/lib/type/str.js": function (module, exports, require) {
'use strict';

var Type = require('../type');

module.exports = new Type('tag:yaml.org,2002:str', {
  kind: 'scalar',
  construct: function (data) { return data !== null ? data : ''; }
});

},
"@xufa/yaml/lib/type/timestamp.js": function (module, exports, require) {
'use strict';

var Type = require('../type');

var YAML_DATE_REGEXP = new RegExp(
  '^([0-9][0-9][0-9][0-9])'          + // [1] year
  '-([0-9][0-9])'                    + // [2] month
  '-([0-9][0-9])$');                   // [3] day

var YAML_TIMESTAMP_REGEXP = new RegExp(
  '^([0-9][0-9][0-9][0-9])'          + // [1] year
  '-([0-9][0-9]?)'                   + // [2] month
  '-([0-9][0-9]?)'                   + // [3] day
  '(?:[Tt]|[ \\t]+)'                 + // ...
  '([0-9][0-9]?)'                    + // [4] hour
  ':([0-9][0-9])'                    + // [5] minute
  ':([0-9][0-9])'                    + // [6] second
  '(?:\\.([0-9]*))?'                 + // [7] fraction
  '(?:[ \\t]*(Z|([-+])([0-9][0-9]?)' + // [8] tz [9] tz_sign [10] tz_hour
  '(?::([0-9][0-9]))?))?$');           // [11] tz_minute

function resolveYamlTimestamp(data) {
  if (data === null) return false;
  if (YAML_DATE_REGEXP.exec(data) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
  return false;
}

function constructYamlTimestamp(data) {
  var match, year, month, day, hour, minute, second, fraction = 0,
      delta = null, tz_hour, tz_minute, date;

  match = YAML_DATE_REGEXP.exec(data);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);

  if (match === null) throw new Error('Date resolve error');

  // match: [1] year [2] month [3] day

  year = +(match[1]);
  month = +(match[2]) - 1; // JS month starts with 0
  day = +(match[3]);

  if (!match[4]) { // no hour
    return new Date(Date.UTC(year, month, day));
  }

  // match: [4] hour [5] minute [6] second [7] fraction

  hour = +(match[4]);
  minute = +(match[5]);
  second = +(match[6]);

  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) { // milli-seconds
      fraction += '0';
    }
    fraction = +fraction;
  }

  // match: [8] tz [9] tz_sign [10] tz_hour [11] tz_minute

  if (match[9]) {
    tz_hour = +(match[10]);
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 60000; // delta in mili-seconds
    if (match[9] === '-') delta = -delta;
  }

  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));

  if (delta) date.setTime(date.getTime() - delta);

  return date;
}

function representYamlTimestamp(object /*, style*/) {
  return object.toISOString();
}

module.exports = new Type('tag:yaml.org,2002:timestamp', {
  kind: 'scalar',
  resolve: resolveYamlTimestamp,
  construct: constructYamlTimestamp,
  instanceOf: Date,
  represent: representYamlTimestamp
});

},
"@xufa/yaml/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/yaml","version":"0.1.0"};
},
"node:crypto": function (module, exports, require) {

var refuse = function () { throw new Error('node:crypto is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:fs": function (module, exports, require) {

var refuse = function () { throw new Error('node:fs is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:fs/promises": function (module, exports, require) {

var refuse = function () { throw new Error('node:fs/promises is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:http": function (module, exports, require) {

module.exports = {
  METHODS: ['ACL', 'BIND', 'CHECKOUT', 'CONNECT', 'COPY', 'DELETE', 'GET', 'HEAD', 'LINK', 'LOCK', 'M-SEARCH', 'MERGE',
    'MKACTIVITY', 'MKCALENDAR', 'MKCOL', 'MOVE', 'NOTIFY', 'OPTIONS', 'PATCH', 'POST', 'PROPFIND', 'PROPPATCH', 'PURGE',
    'PUT', 'QUERY', 'REBIND', 'REPORT', 'SEARCH', 'SOURCE', 'SUBSCRIBE', 'TRACE', 'UNBIND', 'UNLINK', 'UNLOCK',
    'UNSUBSCRIBE'],
  STATUS_CODES: {},
};
},
"node:path": function (module, exports, require) {

var refuse = function () { throw new Error('node:path is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:stream": function (module, exports, require) {

var refuse = function () { throw new Error('node:stream is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:util": function (module, exports, require) {

var tag = function (value) { return Object.prototype.toString.call(value).slice(8, -1); };
var is = function (name) { return function (value) { return tag(value) === name; }; };
module.exports = {
  types: {
    isDate: is('Date'), isRegExp: is('RegExp'), isMap: is('Map'), isSet: is('Set'), isWeakMap: is('WeakMap'),
    isWeakSet: is('WeakSet'), isPromise: is('Promise'), isDataView: is('DataView'), isArrayBuffer: is('ArrayBuffer'),
    isNativeError: function (value) { return value instanceof Error; },
    isBoxedPrimitive: function (value) {
      return value !== null && typeof value === 'object' && ['Number', 'String', 'Boolean', 'BigInt', 'Symbol'].indexOf(tag(value)) >= 0;
    },
  },
  inspect: Object.assign(function (value) { try { return JSON.stringify(value); } catch (e) { return String(value); } }, { custom: Symbol.for('nodejs.util.inspect.custom') }),
  format: function () { return Array.prototype.join.call(arguments, ' '); },
};
}
  };
  var mains = {"@xufa/schema":"@xufa/schema/index.js","@xufa/expression":"@xufa/expression/index.js","@xufa/template":"@xufa/template/index.js","@xufa/yaml":"@xufa/yaml/index.js","@xufa/marshal":"@xufa/marshal/index.js","@xufa/router":"@xufa/router/index.js"};
  var cache = {};
  function resolve(from, request) {
    if (modules[request] && request.indexOf('node:') === 0) return request;
    if (mains[request]) return mains[request];
    if (request.charAt(0) !== '.') throw new Error('Not in the browser bundle: ' + request + ' (from ' + from + ')');
    var parts = from.split('/').slice(0, -1).concat(request.split('/'));
    var stack = [];
    parts.forEach(function (part) {
      if (part === '..') stack.pop();
      else if (part !== '.' && part !== '') stack.push(part);
    });
    var id = stack.join('/');
    var found = [id, id + '.js', id + '.json', id + '/index.js'].filter(function (c) { return modules[c]; })[0];
    if (!found) throw new Error('Cannot find module ' + request + ' from ' + from);
    return found;
  }
  function load(id) {
    if (!cache[id]) {
      var module = { exports: {} };
      cache[id] = module;
      modules[id].call(module.exports, module, module.exports, function (request) {
        return load(resolve(id, request));
      });
    }
    return cache[id].exports;
  }
  function main(name) {
    return load(mains[name]);
  }
  root.xufa = {
    schema: main('@xufa/schema'),
    expression: main('@xufa/expression'),
    template: main('@xufa/template'),
    yaml: main('@xufa/yaml'),
    marshal: main('@xufa/marshal'),
    router: main('@xufa/router'),
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
