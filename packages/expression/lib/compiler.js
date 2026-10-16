// An expression as a function: each node of its tree a closure, made once. What it runs reads only the context given,
// the parameters of its arrow functions and the globals of its engine: no property can be named __proto__,
// constructor or prototype (nor the old accessors of Object.prototype), there is no assignment, and objects are made
// with their keys as their own properties (a key __proto__ is refused).
import { ExpressionError } from './errors.js';
import { generate, generateProgram } from './codegen.js';
import { statements, isExpressionOnly, isLimit } from './statements.js';
import { asyncStatements } from './async.js';
import { FORBIDDEN } from './forbidden.js';
import { intrinsicsOf, INTRINSICS, templateStrings } from './intrinsics.js';
import { makeClass, makePrivates, privateGet, privateIn, heritageOf, superCall, isProgramClass } from './classes.js';
import { define, defineAccessor } from './objects.js';

// The context of a run that is not an object (objects are taken as they are, without a call).
function contextOf(context) {
  return context === null || context === undefined ? {} : Object(context);
}

// The types instanceof knows by their names (unless a name of the program is so named): those of JavaScript a value
// can be of, and the constructors of the engine.
const INSTANCE_TYPES = Object.freeze(
  Object.assign(Object.create(null), { Array, Object, Date, Map, Set, RegExp, Promise, Error, TypeError, RangeError })
);

// The frame of a function with a rest parameter: its parameters, then an array of the arguments after them.
function restFrame(args, count) {
  const frame = args.slice(0, count);
  frame.length = count;
  frame.push(args.slice(count));
  return frame;
}

import { SHORT } from './short.js';

class Compiler {
  // `globals`: names and values; `filters`: functions by name; `lenient`: members of null and undefined, and calls of
  // what is not a function, are undefined (not errors); `strict`: names that are not in the context nor the globals
  // are errors (not undefined); `tdz`: a let or const used before its declaration runs is an error.
  // `bound`: names whose values are fixed, over the context. Programs: `maxSteps` (of loops and calls), `maxDepth`
  // (of calls), `constructors` (of new, by name) and `guarded` (what cannot be changed, with `guardedToo`).
  constructor(source, options) {
    const { globals, filters, lenient, strict, maxSteps, maxDepth, constructors, guarded, bound, guardedToo } = options;
    this.source = source;
    this.globals = globals;
    this.bound = bound ?? {};
    this.guardedToo = guardedToo ?? null;
    this.filters = filters;
    this.lenient = lenient ?? false;
    // (lenient: true is both; 'members' or 'calls', one of them.)
    this.lenientMembers = this.lenient === true || this.lenient === 'members';
    this.lenientCalls = this.lenient === true || this.lenient === 'calls';
    // (Functions by name that values have as methods when they have none: the engine's `methods`.)
    this.methods = options.methods ?? null;
    this.strict = Boolean(strict);
    this.tdz = Boolean(options.tdz);
    this.maxSteps = maxSteps ?? Infinity;
    this.maxDepth = maxDepth ?? Infinity;
    this.constructors = constructors ?? {};
    this.guarded = guarded ?? new WeakSet();
    // Programs: the context as their top-level scope (scope: 'context'), and onError for their top-level statements.
    this.contextScope = Boolean(options.contextScope);
    this.onError = options.onError ?? null;
    this.depth = 0;
    this.breakable = [];
    this.labels = [];
    this.intrinsics = intrinsicsOf(this);
    // (What import gives: the loader of the engine's modules, or none.)
    this.load = options.load ?? null;
  }

  // import ... from 'name': what the module exports, by the loader of the engine (its errors at the import).
  importOf(node) {
    if (!this.load) throw this.error(`import needs the modules of the engine: no module ${node.source}`, node);
    const { load } = this;
    const compiler = this;
    return () => {
      try {
        return load(node.source);
      } catch (err) {
        if (err instanceof ExpressionError && err.position === undefined) {
          throw compiler.error(err.message, node, err.code);
        }
        throw err;
      }
    };
  }

  // Whether a name is of the frames around (a name of the program, a parameter).
  declared(name, env) {
    return env.some((frame) => frame.includes(name));
  }

  // The type instanceof takes of a name: of JavaScript, or a constructor of the engine (null: none).
  typeOf(name) {
    if (INSTANCE_TYPES[name]) return INSTANCE_TYPES[name];
    return Object.prototype.hasOwnProperty.call(this.constructors, name) ? this.constructors[name] : null;
  }

  // Whether instanceof can take a value as its type (the classes of programs).
  isClass(value) {
    return isProgramClass(value);
  }

  // A name the parser makes (#this, #home...), read in the frames around (it is always there: the parser puts it).
  hidden(name, node, env) {
    if (!this.declared(name, env)) throw this.error(`${name.slice(1)} is not where it can be`, node);
    return this.identifier({ type: 'Identifier', name, start: node.start, end: node.end }, env);
  }

  // class Name extends Base {...}: what it extends checked, its members made by the builder of classes (classes.js),
  // their functions with #home and #homeStatic (what super reads) in a frame of the class.
  classExpression(node, env) {
    const extended = Boolean(node.superClass);
    // (extends Error, Map...: the types of JavaScript by their names, as instanceof takes them.)
    const named = extended ? this.namedType(node.superClass, env) : null;
    const parentOf = extended ? (named ? () => named : this.compile(node.superClass, env)) : null;
    // (The frame of the class: what super reads, its private names (#p of its id), and its name in its body: a
    // constant, the class.)
    const frame = ['#home', '#homeStatic', `#p${node.privateId}`, ...(node.id ? [node.id] : [])];
    frame.consts = new Set(node.id ? [node.id] : []);
    const inner = [...env, frame];
    const constructorOf = node.body.find((element) => element.kind === 'constructor');
    const ctor = constructorOf ? this.functionOf(constructorOf.value, inner) : null;
    const elements = node.body
      .filter((element) => element.kind !== 'constructor')
      .map((element) => {
        let key;
        if (element.computed) {
          const value = this.compile(element.key, inner);
          const keyOf = this.keyOf(element.key);
          key = (s) => keyOf(value(s));
        } else {
          if (!element.private && element.kind !== 'block') this.checkKey(element.key, node);
          key = () => element.key;
        }
        return {
          kind: element.kind,
          static: element.static,
          private: Boolean(element.private),
          key,
          fn: element.value ? this.functionOf(element.value, inner) : null,
        };
      });
    const compiler = this;
    const name = node.id ?? null;
    return (s) => {
      const parent = parentOf ? parentOf(s) : null;
      const [home, homeStatic] = heritageOf(compiler, parent, node.superClass ?? node, extended);
      const privates = makePrivates();
      const scope = { ctx: s.ctx, frame: [home, homeStatic, privates, undefined], up: s, run: s.run };
      const spec = {
        name,
        parent,
        derived: extended,
        privates,
        bind: (Class) => {
          scope.frame[3] = Class;
        },
        ctor: ctor ? ctor(scope) : null,
        elements: elements.map((element) => ({
          kind: element.kind,
          static: element.static,
          private: element.private,
          key: element.key(scope),
          fn: element.fn ? element.fn(scope) : null,
        })),
      };
      return makeClass(compiler, spec, node);
    };
  }

  // this: #this of the method around (before super(), in a constructor that extends: an error).
  thisOf(node, env) {
    const read = this.hidden('#this', node, env);
    if (!node.checked) return read;
    const compiler = this;
    return (s) => {
      const value = read(s);
      if (value === undefined) throw compiler.error('this is used before super()', node, 'XUFA_EXPR_ERR_RUNTIME');
      return value;
    };
  }

  // super.name, super[key]: of #home (or #homeStatic in statics), read with this as its receiver (for getters).
  superParts(node, env) {
    const home = this.hidden(node.static ? '#homeStatic' : '#home', node, env);
    const self = this.hidden('#this', node, env);
    if (!node.computed) {
      this.checkKey(node.property, node);
      const { property } = node;
      return { home, self, key: () => property };
    }
    const value = this.compile(node.property, env);
    const keyOf = this.keyOf(node.property);
    return { home, self, key: (s) => keyOf(value(s)) };
  }

  error(message, node, code = 'XUFA_EXPR_ERR_SYNTAX', reason = undefined) {
    return new ExpressionError(message, { code, source: this.source, position: node ? node.start : undefined, reason });
  }

  // The text of a node (of a tree made by another parser, without positions: made of its names).
  text(node) {
    if (node.start !== undefined && this.source) return this.source.slice(node.start, node.end);
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'MemberExpression' && !node.computed) return `${this.text(node.object)}.${node.property}`;
    if (node.type === 'Literal') return JSON.stringify(node.value) ?? String(node.value);
    return '(expression)';
  }

  // A name of property that cannot be reached: an error.
  checkKey(name, node) {
    // (Names are strings: compileTree refuses trees with others; this is checked again where they are read.)
    if (typeof name !== 'string') throw this.error('A name must be a string', node, 'XUFA_EXPR_ERR_FORBIDDEN');
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
        // (A regular expression: a new one each time, as in JavaScript.)
        if (node.regex) {
          const { pattern, flags } = node.regex;
          return () => new RegExp(pattern, flags);
        }
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
        return node.operator === 'delete' ? this.remove(node, env) : this.unary(node, env);
      case 'AssignmentExpression':
        return this.assignment(node, env);
      case 'UpdateExpression':
        return this.update(node, env);
      case 'NewExpression':
        return this.construct(node, env);
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
        return node.body.type === 'BlockStatement' || node.async ? this.functionOf(node, env) : this.arrow(node, env);
      case 'AwaitExpression':
        throw this.error('await is of async functions and of the top of programs', node);
      case 'YieldExpression':
        throw this.error('yield is of generators', node);
      case 'ImportModule':
        return this.importOf(node);
      case 'Filter':
        return this.filter(node, env);
      // (Of programs: a, b; what destructuring and for...in are lowered to; the texts of a tagged template.)
      case 'SequenceExpression': {
        const parts = node.expressions.map((expression) => this.compile(expression, env));
        return (s) => {
          let value;
          for (let i = 0; i < parts.length; i += 1) value = parts[i](s);
          return value;
        };
      }
      case 'Intrinsic': {
        if (!INTRINSICS.has(node.name)) throw this.error(`Unknown intrinsic ${node.name}`, node);
        const fn = this.intrinsics[node.name];
        const args = this.argumentsOf(node.arguments, env);
        return (s) => {
          const values = args(s);
          return fn(node, values[0], values[1]);
        };
      }
      case 'TemplateStrings': {
        const strings = templateStrings(node);
        return () => strings;
      }
      // (Of classes.)
      case 'ClassExpression':
        return this.classExpression(node, env);
      case 'ThisExpression':
        return this.thisOf(node, env);
      case 'PrivateMember': {
        const object = this.compile(node.object, env);
        const privates = this.hidden(`#p${node.classId}`, node, env);
        const compiler = this;
        return (s) => {
          const value = object(s);
          if (value === SHORT) return SHORT;
          return privateGet(compiler, privates(s), node.name, value, node);
        };
      }
      case 'PrivateIn': {
        const right = this.compile(node.right, env);
        const privates = this.hidden(`#p${node.classId}`, node, env);
        const compiler = this;
        return (s) => privateIn(compiler, privates(s), node.name, right(s), node);
      }
      case 'SuperMember': {
        const { home, self, key } = this.superParts(node, env);
        return (s) => Reflect.get(home(s), key(s), self(s));
      }
      case 'SuperCall': {
        const record = this.hidden('#ctor', node, env);
        const set = this.setter('#this', node, env, true);
        const args = this.argumentsOf(node.arguments, env);
        const compiler = this;
        return (s) => {
          const instance = superCall(compiler, record(s), args(s), node);
          set(s, instance);
          return instance;
        };
      }
      default:
        throw this.error(`Unsupported ${node.type}`, node);
    }
  }

  // The type a name gives (instanceof, extends): of JavaScript or of the engine, unless the program has the name.
  namedType(node, env) {
    if (node.type !== 'Identifier' || this.declared(node.name, env)) return null;
    if (Object.prototype.hasOwnProperty.call(this.bound, node.name)) return null;
    return this.typeOf(node.name);
  }

  // a instanceof Type: a type named (of JavaScript, of the engine), else a class of the program.
  instanceOf(node, env) {
    const left = this.compile(node.left, env);
    const { right } = node;
    if (
      right.type === 'Identifier' &&
      !this.declared(right.name, env) &&
      !Object.prototype.hasOwnProperty.call(this.bound, right.name)
    ) {
      const type = this.typeOf(right.name);
      if (type) return (s) => left(s) instanceof type;
    }
    const value = this.compile(right, env);
    const compiler = this;
    return (s) => {
      const object = left(s);
      const type = value(s);
      if (compiler.isClass(type)) return object instanceof type;
      throw compiler.error(`${compiler.text(right)} is not a type instanceof takes`, right, 'XUFA_EXPR_ERR_RUNTIME');
    };
  }

  // The error of a let or const used before its declaration runs (with tdz).
  unset(node) {
    return this.error(`${node.name} is used before its declaration`, node, 'XUFA_EXPR_ERR_RUNTIME');
  }

  // Whether a name of a frame is checked for its use before its declaration: with tdz, its let and const (in the
  // frames of the closures, a let not declared yet is a hole: its frame is made with new Array(size)).
  unsetChecked(frame, name) {
    return this.tdz && Boolean(frame.lexical?.has(name));
  }

  identifier(node, env) {
    const { name } = node;
    // The parameters of the arrow functions around it, innermost first.
    for (let depth = env.length - 1; depth >= 0; depth -= 1) {
      const index = env[depth].indexOf(name);
      if (index !== -1) {
        const up = env.length - 1 - depth;
        if (this.unsetChecked(env[depth], name)) {
          const compiler = this;
          return (s) => {
            let scope = s;
            for (let i = 0; i < up; i += 1) scope = scope.up;
            const { frame } = scope;
            if (!(index in frame)) throw compiler.unset(node);
            return frame[index];
          };
        }
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
    if (Object.prototype.hasOwnProperty.call(this.bound, name)) {
      const value = this.bound[name];
      return () => value;
    }
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
    if (node.elements.includes(null)) throw this.error('Holes in arrays are not allowed', node);
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
      if (property.value?.coverInit) {
        throw this.error('{ a = 1 } is a pattern of an assignment, not an object', property.value);
      }
      const value = this.compile(property.value, env);
      // (Getters and setters: { get total() {...} }.)
      const accessor = property.kind === 'get' || property.kind === 'set' ? property.kind : null;
      if (!property.computed) {
        if (property.key === '__proto__')
          throw this.error('__proto__ cannot be a key', property.value, 'XUFA_EXPR_ERR_FORBIDDEN');
        return { key: property.key, value, accessor };
      }
      const key = this.compile(property.key, env);
      const keyOf = this.keyOf(property.key);
      return { computed: (s) => keyOf(key(s)), value, accessor };
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
        } else if (entry.accessor) {
          defineAccessor(result, entry.computed ? entry.computed(s) : entry.key, entry.accessor, entry.value(s));
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
      'XUFA_EXPR_ERR_RUNTIME',
      'nullMember'
    );
  }

  member(node, env) {
    const { object, key, keyFn } = this.memberParts(node, env);
    const { optional } = node;
    const { lenientMembers } = this;
    const compiler = this;
    return (s) => {
      const value = object(s);
      if (value === SHORT) return SHORT;
      if (value === null || value === undefined) {
        if (optional) return SHORT;
        if (lenientMembers) return undefined;
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

  // The function of the engine's methods for a call of a method of a name whose value is undefined or null, or null.
  methodOf(name, value) {
    if (!this.methods || (value !== undefined && value !== null)) return null;
    return Object.hasOwn(this.methods, name) ? this.methods[name] : null;
  }

  notFunction(node) {
    return this.error(`${this.text(node.callee)} is not a function`, node, 'XUFA_EXPR_ERR_RUNTIME', 'notFunction');
  }

  call(node, env) {
    const args = this.argumentsOf(node.arguments, env);
    const { lenientMembers, lenientCalls } = this;
    const compiler = this;
    const callOptional = node.optional;
    const { callee } = node;
    // object.#method(...): a private method of its class, with the object as this.
    if (callee.type === 'PrivateMember') {
      const object = this.compile(callee.object, env);
      const privates = this.hidden(`#p${callee.classId}`, callee, env);
      return (s) => {
        const target = object(s);
        if (target === SHORT) return SHORT;
        const fn = privateGet(compiler, privates(s), callee.name, target, callee);
        if (fn === SHORT) return SHORT;
        // (The arguments before the check, as JavaScript does: what they do happens.)
        const values = args(s);
        if (typeof fn !== 'function') {
          if (lenientCalls) return undefined;
          throw compiler.notFunction(node);
        }
        return Reflect.apply(fn, target, values);
      };
    }
    // super.method(...): the method of what the class extends, with this.
    if (callee.type === 'SuperMember') {
      const { home, self, key } = this.superParts(callee, env);
      return (s) => {
        const target = self(s);
        const fn = Reflect.get(home(s), key(s), target);
        // (The arguments before the check, as JavaScript does: what they do happens.)
        const values = args(s);
        if (typeof fn !== 'function') {
          if (lenientCalls) return undefined;
          throw compiler.notFunction(node);
        }
        return Reflect.apply(fn, target, values);
      };
    }
    // A method: called with its object as this.
    if (callee.type === 'MemberExpression') {
      const { object, key, keyFn } = this.memberParts(callee, env);
      const memberOptional = callee.optional;
      return (s) => {
        const target = object(s);
        if (target === SHORT) return SHORT;
        if (target === null || target === undefined) {
          if (memberOptional) return SHORT;
          if (lenientMembers) return undefined;
          throw compiler.nullMember(callee);
        }
        const fn = target[keyFn ? keyFn(s) : key];
        if (callOptional && (fn === null || fn === undefined)) return SHORT;
        // (The arguments before the check, as JavaScript does: what they do happens.)
        const values = args(s);
        if (typeof fn !== 'function') {
          // (A method of the engine's of that name: with the value first.)
          const method = keyFn ? null : compiler.methodOf(key, fn);
          if (method) return Reflect.apply(method, undefined, [target, ...values]);
          if (lenientCalls) return undefined;
          throw compiler.notFunction(node);
        }
        return Reflect.apply(fn, target, values);
      };
    }
    const fnOf = this.compile(callee, env);
    return (s) => {
      const fn = fnOf(s);
      if (fn === SHORT) return SHORT;
      if (callOptional && (fn === null || fn === undefined)) return SHORT;
      // (The arguments before the check, as JavaScript does: what they do happens.)
      const values = args(s);
      if (typeof fn !== 'function') {
        if (lenientCalls) return undefined;
        throw compiler.notFunction(node);
      }
      return Reflect.apply(fn, undefined, values);
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
      case 'void':
        return (s) => {
          argument(s);
          return undefined;
        };
      default:
        throw this.error(`Unsupported operator ${node.operator}`, node);
    }
  }

  binary(node, env) {
    if (node.operator === 'instanceof') return this.instanceOf(node, env);
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

  // An arrow function: a function of JavaScript that runs its body here, with its arguments as a frame of names (and
  // the rest of them, an array). Its calls are steps of the run (callbacks of map, filter... count as loops do): in
  // programs each; in expressions, of arrow functions in others (one map is as long as its data; maps in maps multiply).
  arrow(node, env) {
    const { rest } = node;
    const count = node.params.length;
    const body = this.compile(node.body, [...env, rest ? [...node.params, rest] : node.params]);
    const max = this.maxSteps;
    const compiler = this;
    const counted = this.inProgram || env.length > 0;
    if (!counted) {
      return (s) =>
        (...args) =>
          body({ ctx: s.ctx, frame: rest ? restFrame(args, count) : args, up: s, run: s.run });
    }
    return (s) =>
      (...args) => {
        const { run } = s;
        if (run && (run.steps += 1) > max) throw compiler.limit(node);
        return body({ ctx: s.ctx, frame: rest ? restFrame(args, count) : args, up: s, run });
      };
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

Object.assign(Compiler.prototype, statements, asyncStatements);

// Whether a tree has functions in functions.
function nestsFunctions(node, inside = false) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((item) => nestsFunctions(item, inside));
  const isFunction = node.type === 'ArrowFunctionExpression';
  if (isFunction && inside) return true;
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (value && typeof value === 'object' && nestsFunctions(value, inside || isFunction)) return true;
  }
  return false;
}

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

// A tree given to engine.compileTree, checked before it is compiled: trees made by other parsers, or by hand, can hold
// what the parser never makes (its own trees are made so, and not checked again). Its names, properties and keys of members, keys of objects, names of variables, of
// parameters, of constructors and of filters are strings (an array ['constructor'] would be read as the key
// "constructor" past the checks of names); its literals are values (strings, numbers, booleans, null, bigints, regular
// expressions of strings), never objects or functions; its texts of templates strings; and it has no cycles.
const VALUE_TYPES = new Set(['string', 'number', 'boolean', 'bigint', 'undefined']);

function checkTree(tree, compiler) {
  const seen = new WeakSet();
  const refuse = (what, node) => {
    throw compiler.error(`${what} of a tree must be a string`, node, 'XUFA_EXPR_ERR_FORBIDDEN');
  };
  const name = (value, what, node) => {
    if (typeof value !== 'string') refuse(what, node);
  };
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node)) throw compiler.error('A tree cannot refer to itself', null, 'XUFA_EXPR_ERR_FORBIDDEN');
    seen.add(node);
    // (Plain objects and arrays only, as the parser makes them: nothing comes from a prototype.)
    const prototype = Object.getPrototypeOf(node);
    if (prototype !== (Array.isArray(node) ? Array.prototype : Object.prototype) && prototype !== null) {
      throw compiler.error('The nodes of a tree must be plain objects and arrays', null, 'XUFA_EXPR_ERR_FORBIDDEN');
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      seen.delete(node);
      return;
    }
    switch (node.type) {
      case 'Identifier':
        name(node.name, 'A name', node);
        break;
      case 'MemberExpression':
        if (!node.computed) name(node.property, 'A property', node);
        break;
      case 'Filter':
        name(node.name, 'The name of a filter', node);
        break;
      case 'NewExpression':
        name(node.callee, 'The name of a constructor', node);
        break;
      case 'VariableDeclarator':
        name(node.id, 'The name of a variable', node);
        break;
      case 'FunctionDeclaration':
        name(node.id, 'The name of a function', node);
        if (!Array.isArray(node.params)) refuse('The parameters', node);
        for (const param of node.params) name(param, 'A parameter', node);
        if (node.rest !== undefined && node.rest !== null) name(node.rest, 'A parameter', node);
        break;
      case 'ArrowFunctionExpression':
        if (!Array.isArray(node.params)) refuse('The parameters', node);
        for (const param of node.params) name(param, 'A parameter', node);
        if (node.rest !== undefined && node.rest !== null) name(node.rest, 'A parameter', node);
        break;
      case 'CatchClause':
        if (node.param !== null && node.param !== undefined) name(node.param, 'The name of a catch', node);
        break;
      case 'TemplateLiteral':
        if (!Array.isArray(node.quasis)) refuse('The texts of a template', node);
        for (const quasi of node.quasis) name(quasi, 'A text of a template', node);
        break;
      case 'Intrinsic':
        if (!INTRINSICS.has(node.name)) throw compiler.error('Unknown intrinsic', node, 'XUFA_EXPR_ERR_FORBIDDEN');
        break;
      case 'TemplateStrings':
        for (const list of [node.cooked, node.raw]) {
          if (!Array.isArray(list)) refuse('The texts of a template', node);
          for (const text of list) name(text, 'A text of a template', node);
        }
        break;
      case 'LabeledStatement':
        name(node.label, 'A label', node);
        break;
      case 'ClassExpression':
        if (node.id !== null && node.id !== undefined) name(node.id, 'The name of a class', node);
        if (!Array.isArray(node.body)) refuse('The members of a class', node);
        for (const element of node.body) {
          if (!['constructor', 'method', 'get', 'set', 'field', 'block'].includes(element?.kind))
            refuse('A kind of member', node);
          if (element.kind === 'block' && !element.value) refuse('The body of a static block', node);
          if (!element.computed && element.kind !== 'block') name(element.key, 'A key of a class', node);
        }
        if (!Number.isInteger(node.privateId)) refuse('The id of a class', node);
        break;
      case 'SuperMember':
        if (!node.computed) name(node.property, 'A property', node);
        break;
      case 'ImportModule':
        name(node.source, 'The name of a module', node);
        break;
      case 'PrivateMember':
      case 'PrivateIn':
        name(node.name, 'A private name', node);
        if (!Number.isInteger(node.classId)) refuse('The class of a private name', node);
        break;
      case 'Property':
        if (node.kind !== undefined && node.kind !== 'init' && node.kind !== 'get' && node.kind !== 'set') {
          refuse('A kind of property', node);
        }
        if (!node.computed) name(node.key, 'A key', node);
        break;
      case 'BreakStatement':
      case 'ContinueStatement':
        if (node.label !== null && node.label !== undefined) name(node.label, 'A label', node);
        break;
      case 'Literal':
        if (node.regex) {
          name(node.regex.pattern, 'The pattern of a regular expression', node);
          name(node.regex.flags, 'The flags of a regular expression', node);
        } else if (node.value !== null && !VALUE_TYPES.has(typeof node.value)) {
          throw compiler.error('A literal of a tree is a value, not an object', node, 'XUFA_EXPR_ERR_FORBIDDEN');
        }
        seen.delete(node);
        return;
      default:
    }
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (value !== null && typeof value === 'object') walk(value);
    }
    // (A node may appear twice where it is not inside itself: a shorthand property, a tree reused.)
    seen.delete(node);
  };
  walk(tree);
}

// The function of a tree: it takes the context (an object: its properties are the names of the expression). Closures
// first (a path, by a reader of its own); after inlineAfter runs, one function of JavaScript (see lib/codegen.js, and
// lib/codegen-statements.js for programs),
// which costs more to make than a few runs: expressions run a few times do not pay it. The first functions are shared
// by every expression, so V8 cannot specialize their reads; the one made reads each name and member where it is.
// fn(context), its errors given to onError (limits aside) and undefined its value.
function withOnError(run, onError, text) {
  return (context) => {
    try {
      return run(context);
    } catch (error) {
      if (isLimit(error)) throw error;
      const ctx = typeof context === 'object' && context !== null ? context : contextOf(context);
      onError(error, { source: text, statement: 0, context: ctx });
      return undefined;
    }
  };
}

function compileTree(tree, source, options) {
  if (tree.type === 'Program') {
    // A program of one expression (or a return of one) is that expression: compiled, and inlined, as one.
    const [only] = tree.body;
    const expression =
      tree.body.length === 1 &&
      (only.type === 'ExpressionStatement' || (only.type === 'ReturnStatement' && only.argument))
        ? (only.expression ?? only.argument)
        : null;
    if (expression && isExpressionOnly(expression)) {
      const run = compileTree(expression, source, options);
      // (With onError, the error of that only statement is given to it, as those of a program's statements.)
      return options.onError ? withOnError(run, options.onError, source.slice(only.start, only.end)) : run;
    }
    const compiler = new Compiler(source, options);
    const run = compiler.program(tree);
    const closures = (context) => run(typeof context === 'object' && context !== null ? context : contextOf(context));
    // (As expressions: after inlineAfter runs, one function of JavaScript; see lib/codegen-statements.js.)
    return inlined(closures, () => generateProgram(tree, compiler, options, SHORT), options);
  }
  // (An expression with what only programs have, from a tree given: run as a program of it.)
  if (!isExpressionOnly(tree)) {
    const body = [{ type: 'ReturnStatement', argument: tree, start: tree.start, end: tree.end }];
    return compileTree({ type: 'Program', body, start: tree.start, end: tree.end, single: true }, source, options);
  }
  const compiler = new Compiler(source, options);
  const run = compiler.compile(tree, []);
  // (A count of the steps of each run when the expression has arrow functions in others: each call of them is one.)
  const counted = Number.isFinite(compiler.maxSteps) && nestsFunctions(tree);
  const general = (context) =>
    run({
      ctx: typeof context === 'object' && context !== null ? context : contextOf(context),
      frame: null,
      up: null,
      run: counted ? { steps: 0, depth: 0, last: undefined } : undefined,
    });
  let keys = pathOf(tree);
  if (keys && options.bound && Object.prototype.hasOwnProperty.call(options.bound, keys[0])) keys = null;
  const first = keys ? pathReader(keys, options, general) : general;
  return inlined(first, () => generate(tree, compiler, options, SHORT), options);
}

// The function of closures first, and after inlineAfter runs the one made by make (null: the closures go on).
function inlined(first, make, options) {
  if (!options.inline) return first;
  const after = options.inlineAfter;
  if (after <= 0) return make() || first;
  let runs = 0;
  let fn = first;
  return (context) => {
    if (fn === first) {
      runs += 1;
      if (runs === after) fn = make() || first;
    }
    return fn(context);
  };
}

// A tree of another parser (or made by hand) checked (see checkTree), with the options of the compiler for its errors.
function checkForeignTree(tree, source, options) {
  checkTree(tree, new Compiler(source, options));
}

export { compileTree, checkForeignTree, FORBIDDEN };
