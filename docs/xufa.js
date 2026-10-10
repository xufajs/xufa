/*! xufa: @xufa/schema, @xufa/expression, @xufa/template, @xufa/yaml, @xufa/marshal, @xufa/router, @xufa/serializer | MIT license */
// Made by tools/docs/lib/browser-bundle.js (pnpm docs): do not edit.
(function (root) {
  'use strict';
  // Buffer, for the modules that write bytes (the writer of @xufa/serializer): what they use of it, over Uint8Array
  // and TextEncoder, when the browser has none. In this scope only: nothing is added to the page.
  var Buffer = root.Buffer || (function () {
    var encoder = new TextEncoder();
    var decoder = new TextDecoder();
    class BrowserBuffer extends Uint8Array {
      static allocUnsafe(size) { return new BrowserBuffer(size); }
      static allocUnsafeSlow(size) { return new BrowserBuffer(size); }
      static alloc(size) { return new BrowserBuffer(size); }
      static isBuffer(value) { return value instanceof BrowserBuffer; }
      static byteLength(text) { return typeof text === 'string' ? encoder.encode(text).length : text.byteLength; }
      static concat(list) {
        var out = new BrowserBuffer(list.reduce(function (sum, part) { return sum + part.length; }, 0));
        list.reduce(function (offset, part) { out.set(part, offset); return offset + part.length; }, 0);
        return out;
      }
      static from(value) {
        var bytes = typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value);
        var out = new BrowserBuffer(bytes.length);
        out.set(bytes);
        return out;
      }
      utf8Write(text, offset, length) {
        return encoder.encodeInto(text, this.subarray(offset, offset + length)).written;
      }
      utf8Slice(start, end) {
        return decoder.decode(this.subarray(start, end));
      }
      copy(target, targetStart, sourceStart, sourceEnd) {
        var part = this.subarray(sourceStart || 0, sourceEnd === undefined ? this.length : sourceEnd);
        target.set(part, targetStart || 0);
        return part.length;
      }
      toString(encoding, start, end) {
        return decoder.decode(this.subarray(start || 0, end === undefined ? this.length : end));
      }
    }
    return BrowserBuffer;
  })();
  var modules = {
"@xufa/expression/index.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var expression_exports = {};
__export(expression_exports, {
  Engine: () => Engine,
  ExpressionError: () => import_errors.ExpressionError,
  FORBIDDEN: () => import_compiler.FORBIDDEN,
  GLOBALS: () => import_globals.GLOBALS,
  compile: () => compile,
  evaluate: () => evaluate,
  locate: () => import_errors.locate,
  parse: () => __parse
});
module.exports = __toCommonJS(expression_exports);
var import_parser = require("./lib/parser.js");
var import_compiler = require("./lib/compiler.js");
var import_globals = require("./lib/globals.js");
var import_errors = require("./lib/errors.js");
class Engine {
  // `globals`: names over the default ones (`builtins: false` leaves those out); `filters`: functions by name, which
  // makes `|` separate them (`price | round(2)`, the value first); `lenient`: members of null or undefined and calls of
  // what is not a function give undefined; `strict`: names not in the context nor the globals are errors;
  // `maxLength`: of a source (10000); `cacheSize`: of the expressions compiled kept (1000); `inline`: false keeps
  // expressions as closures (by default, those run `inlineAfter` times, 64, become one function of JavaScript).
  constructor(options = {}) {
    const { globals = {}, builtins = true, filters = null, lenient = false, strict = false } = options;
    this.globals = Object.freeze({ ...builtins ? import_globals.GLOBALS : {}, ...globals });
    this.filters = filters ? Object.freeze({ ...filters }) : null;
    this.lenient = Boolean(lenient);
    this.strict = Boolean(strict);
    this.maxLength = options.maxLength === void 0 ? 1e4 : options.maxLength;
    this.cacheSize = options.cacheSize === void 0 ? 1e3 : options.cacheSize;
    this.inline = options.inline !== false;
    this.inlineAfter = options.inlineAfter === void 0 ? 64 : options.inlineAfter;
    this.cache = /* @__PURE__ */ new Map();
  }
  parse(source) {
    this.check(source);
    return (0, import_parser.parse)(source, { filters: Boolean(this.filters) });
  }
  check(source) {
    if (typeof source !== "string") throw new TypeError("An expression is a string");
    if (source.length > this.maxLength) {
      throw new import_errors.ExpressionError(`The expression is longer than ${this.maxLength} characters`, {
        code: "XUFA_EXPR_ERR_LENGTH"
      });
    }
  }
  // The function of an expression: fn(context) gives its value. Kept for the next time.
  compile(source) {
    const cached = this.cache.get(source);
    if (cached) return cached;
    const tree = this.parse(source);
    const fn = (0, import_compiler.compileTree)(tree, source, this);
    Object.defineProperty(fn, "source", { value: source });
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
const __parse = (source, options) => (0, import_parser.parse)(source, options);
const compile = (source) => engine.compile(source);
const evaluate = (source, context) => engine.evaluate(source, context);

},
"@xufa/expression/lib/codegen.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var codegen_exports = {};
__export(codegen_exports, {
  generate: () => generate
});
module.exports = __toCommonJS(codegen_exports);
var import_errors = require("./errors.js");
function contextOf(context) {
  return context === null || context === void 0 ? {} : Object(context);
}
const BINARY = /* @__PURE__ */ new Set([
  "+",
  "-",
  "*",
  "/",
  "%",
  "**",
  "==",
  "!=",
  "===",
  "!==",
  "<",
  ">",
  "<=",
  ">=",
  "|",
  "&",
  "^",
  "<<",
  ">>",
  ">>>",
  "in"
]);
const LOGICAL = /* @__PURE__ */ new Set(["&&", "||", "??"]);
const UNARY = /* @__PURE__ */ new Set(["!", "-", "+", "~", "typeof"]);
const { hasOwnProperty } = Object.prototype;
function literal(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return Object.is(value, -0) ? "(-0)" : `(${String(value)})`;
  if (typeof value === "bigint") return `(${String(value)}n)`;
  if (value === true || value === false || value === null) return String(value);
  throw new Error(`Unexpected literal ${typeof value}`);
}
class Generator {
  constructor(compiler, SHORT) {
    this.compiler = compiler;
    this.SHORT = SHORT;
    this.nodes = [];
    this.names = 0;
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
      case "Literal":
        return literal(node.value);
      case "Identifier": {
        for (let depth = env.length - 1; depth >= 0; depth -= 1) {
          const param = env[depth].find((item) => item.name === node.name);
          if (param) return param.as;
        }
        if (node.name === "undefined") return "(void 0)";
        const name = JSON.stringify(node.name);
        const t = this.temp();
        return `((${t} = ctx[${name}]) !== undefined ? ${t} : id(ctx, ${name}, ${this.at(node)}))`;
      }
      case "TemplateLiteral": {
        const parts = [JSON.stringify(node.quasis[0])];
        node.expressions.forEach((expression, i) => {
          parts.push(`\`\${${this.gen(expression, env)}}\``, JSON.stringify(node.quasis[i + 1]));
        });
        return `(${parts.join(" + ")})`;
      }
      case "ArrayExpression":
        return `[${node.elements.map((element) => this.item(element, env)).join(", ")}]`;
      case "ObjectExpression": {
        const properties = node.properties.map((property) => {
          if (property.type === "SpreadElement") return `...${this.gen(property.argument, env)}`;
          const value = this.gen(property.value, env);
          if (!property.computed) return `${JSON.stringify(property.key)}: ${value}`;
          return `[K(${this.gen(property.key, env)}, ${this.at(property.key)})]: ${value}`;
        });
        return `({ ${properties.join(", ")} })`;
      }
      case "MemberExpression": {
        const object = this.gen(node.object, env, chain);
        const key = this.key(node, env);
        if (chain) return `MS(${object}, ${key}, ${this.at(node)}, ${node.optional})`;
        const t = this.temp();
        return `((${t} = ${object}) === null || ${t} === undefined ? MN(${this.at(node)}) : ${t}[${key}])`;
      }
      case "CallExpression":
        return this.call(node, env, chain);
      case "ChainExpression":
        return `C(${this.gen(node.expression, env, true)})`;
      case "UnaryExpression":
        if (!UNARY.has(node.operator)) throw new Error(`Unexpected operator ${node.operator}`);
        return `(${node.operator === "typeof" ? "typeof " : node.operator}${this.gen(node.argument, env)})`;
      case "BinaryExpression":
        if (!BINARY.has(node.operator)) throw new Error(`Unexpected operator ${node.operator}`);
        return `(${this.gen(node.left, env)} ${node.operator} ${this.gen(node.right, env)})`;
      case "LogicalExpression":
        if (!LOGICAL.has(node.operator)) throw new Error(`Unexpected operator ${node.operator}`);
        return `(${this.gen(node.left, env)} ${node.operator} ${this.gen(node.right, env)})`;
      case "ConditionalExpression":
        return `(${this.gen(node.test, env)} ? ${this.gen(node.consequent, env)} : ${this.gen(node.alternate, env)})`;
      case "ArrowFunctionExpression": {
        const params = node.params.map((name) => {
          this.names += 1;
          return { name, as: `a${this.names}` };
        });
        this.temps.push([]);
        const body = this.gen(node.body, [...env, params]);
        const temps = this.temps.pop();
        const list = params.map((param) => param.as).join(", ");
        if (temps.length === 0) return `((${list}) => ${body})`;
        return `((${list}) => { let ${temps.join(", ")}; return ${body}; })`;
      }
      case "Filter": {
        const args = [this.gen(node.expression, env), ...node.arguments.map((arg) => this.item(arg, env))];
        return `(0, FL[${JSON.stringify(node.name)}])(${args.join(", ")})`;
      }
      default:
        throw new Error(`Unexpected ${node.type}`);
    }
  }
  item(node, env) {
    return node.type === "SpreadElement" ? `...${this.gen(node.argument, env)}` : this.gen(node, env);
  }
  key(node, env) {
    if (!node.computed) return JSON.stringify(node.property);
    return `K(${this.gen(node.property, env)}, ${this.at(node.property)})`;
  }
  call(node, env, chain) {
    const items = node.arguments.map((arg) => this.item(arg, env));
    const args = `[${items.join(", ")}]`;
    const callArgs = items.map((item) => `, ${item}`).join("");
    const index = this.at(node);
    const { callee } = node;
    if (callee.type === "MemberExpression") {
      const object = this.gen(callee.object, env, chain);
      const key = this.key(callee, env);
      if (chain) return `CMS(${object}, ${key}, () => ${args}, ${index}, ${callee.optional}, ${node.optional})`;
      const t = this.temp();
      const f = this.temp();
      return `((${t} = ${object}) === null || ${t} === undefined ? CN(${index}) : typeof (${f} = ${t}[${key}]) !== 'function' ? NF(${index}) : ${f}.call(${t}${callArgs}))`;
    }
    const fn = this.gen(callee, env, chain);
    if (chain) return `CFS(${fn}, () => ${args}, ${index}, ${node.optional})`;
    return `CF(${fn}, ${args}, ${index})`;
  }
  // The helpers, as the closures of the compiler check and fail.
  helpers(options) {
    const { compiler, nodes, SHORT } = this;
    const { globals, filters, lenient, strict } = options;
    const RUNTIME = "XUFA_EXPR_ERR_RUNTIME";
    const keyOf = (n) => compiler.keyOf(nodes[n]);
    const keys = /* @__PURE__ */ new Map();
    return {
      id(ctx, name, n) {
        const value = ctx[name];
        if (value !== void 0 || name in ctx) return value;
        if (hasOwnProperty.call(globals, name)) return globals[name];
        if (strict) throw compiler.error(`${name} is not defined`, nodes[n], RUNTIME);
        return void 0;
      },
      K(value, n) {
        if (typeof value === "number" || typeof value === "symbol") return value;
        let check = keys.get(n);
        if (!check) {
          check = keyOf(n);
          keys.set(n, check);
        }
        return check(value);
      },
      // A member of null or undefined: undefined (lenient) or the error.
      MN(n) {
        if (lenient) return void 0;
        throw compiler.nullMember(nodes[n]);
      },
      // A method of null or undefined.
      CN(n) {
        if (lenient) return void 0;
        throw compiler.nullMember(nodes[n].callee);
      },
      // A call of what is not a function.
      NF(n) {
        if (lenient) return void 0;
        throw compiler.notFunction(nodes[n]);
      },
      RA: Reflect.apply,
      M(object, key, n) {
        if (object === null || object === void 0) {
          if (lenient) return void 0;
          throw compiler.nullMember(nodes[n]);
        }
        return object[key];
      },
      MS(object, key, n, optional) {
        if (object === SHORT) return SHORT;
        if (object === null || object === void 0) {
          if (optional) return SHORT;
          if (lenient) return void 0;
          throw compiler.nullMember(nodes[n]);
        }
        return object[key];
      },
      CM(object, key, args, n) {
        if (object === null || object === void 0) {
          if (lenient) return void 0;
          throw compiler.nullMember(nodes[n].callee);
        }
        const fn = object[key];
        if (typeof fn !== "function") {
          if (lenient) return void 0;
          throw compiler.notFunction(nodes[n]);
        }
        return Reflect.apply(fn, object, args);
      },
      CMS(object, key, args, n, memberOptional, callOptional) {
        if (object === SHORT) return SHORT;
        if (object === null || object === void 0) {
          if (memberOptional) return SHORT;
          if (lenient) return void 0;
          throw compiler.nullMember(nodes[n].callee);
        }
        const fn = object[key];
        if (typeof fn !== "function") {
          if (callOptional && (fn === null || fn === void 0)) return SHORT;
          if (lenient) return void 0;
          throw compiler.notFunction(nodes[n]);
        }
        return Reflect.apply(fn, object, args());
      },
      CF(fn, args, n) {
        if (typeof fn !== "function") {
          if (lenient) return void 0;
          throw compiler.notFunction(nodes[n]);
        }
        return Reflect.apply(fn, void 0, args);
      },
      CFS(fn, args, n, optional) {
        if (fn === SHORT) return SHORT;
        if (typeof fn !== "function") {
          if (optional && (fn === null || fn === void 0)) return SHORT;
          if (lenient) return void 0;
          throw compiler.notFunction(nodes[n]);
        }
        return Reflect.apply(fn, void 0, args());
      },
      C: (value) => value === SHORT ? void 0 : value,
      S: (value) => `${value}`,
      FL: filters || {}
    };
  }
}
const HELPERS = ["id", "K", "M", "MS", "MN", "CN", "NF", "RA", "CM", "CMS", "CF", "CFS", "C", "S", "FL"];
function generate(tree, compiler, options, SHORT) {
  const generator = new Generator(compiler, SHORT);
  const body = generator.gen(tree, []);
  const helpers = generator.helpers(options);
  const [temps] = generator.temps;
  const declare = temps.length ? `let ${temps.join(", ")}; ` : "";
  try {
    const make = new Function(
      ...HELPERS,
      "contextOf",
      `"use strict"; return function expression(context) { const ctx = typeof context === 'object' && context !== null ? context : contextOf(context); ${declare}return ${body}; };`
    );
    return make(...HELPERS.map((name) => helpers[name]), contextOf);
  } catch (err) {
    if (err instanceof import_errors.ExpressionError) throw err;
    return null;
  }
}

},
"@xufa/expression/lib/compiler.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var compiler_exports = {};
__export(compiler_exports, {
  FORBIDDEN: () => FORBIDDEN,
  compileTree: () => compileTree
});
module.exports = __toCommonJS(compiler_exports);
var import_errors = require("./errors.js");
var import_codegen = require("./codegen.js");
function contextOf(context) {
  return context === null || context === void 0 ? {} : Object(context);
}
const FORBIDDEN = /* @__PURE__ */ new Set([
  "__proto__",
  "constructor",
  "prototype",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
  "caller",
  "callee",
  "arguments"
]);
const SHORT = /* @__PURE__ */ Symbol("short");
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
  error(message, node, code = "XUFA_EXPR_ERR_SYNTAX") {
    return new import_errors.ExpressionError(message, { code, source: this.source, position: node ? node.start : void 0 });
  }
  text(node) {
    return this.source.slice(node.start, node.end);
  }
  // A name of property that cannot be reached: an error.
  checkKey(name, node) {
    if (FORBIDDEN.has(name))
      throw this.error(`${name} cannot be reached in expressions`, node, "XUFA_EXPR_ERR_FORBIDDEN");
  }
  // The key of a computed member, checked: numbers and symbols as they are, the rest as strings (converted once).
  keyOf(node) {
    const compiler = this;
    return (value) => {
      if (typeof value === "number" || typeof value === "symbol") return value;
      const key = String(value);
      if (FORBIDDEN.has(key)) compiler.checkKey(key, node);
      return key;
    };
  }
  compile(node, env) {
    switch (node.type) {
      case "Literal": {
        const { value } = node;
        return () => value;
      }
      case "Identifier":
        return this.identifier(node, env);
      case "TemplateLiteral":
        return this.template(node, env);
      case "ArrayExpression":
        return this.array(node, env);
      case "ObjectExpression":
        return this.object(node, env);
      case "MemberExpression":
        return this.member(node, env);
      case "CallExpression":
        return this.call(node, env);
      case "ChainExpression": {
        const inner = this.compile(node.expression, env);
        return (s) => {
          const value = inner(s);
          return value === SHORT ? void 0 : value;
        };
      }
      case "UnaryExpression":
        return this.unary(node, env);
      case "BinaryExpression":
        return this.binary(node, env);
      case "LogicalExpression":
        return this.logical(node, env);
      case "ConditionalExpression": {
        const test = this.compile(node.test, env);
        const consequent = this.compile(node.consequent, env);
        const alternate = this.compile(node.alternate, env);
        return (s) => test(s) ? consequent(s) : alternate(s);
      }
      case "ArrowFunctionExpression":
        return this.arrow(node, env);
      case "Filter":
        return this.filter(node, env);
      default:
        throw this.error(`Unsupported ${node.type}`, node);
    }
  }
  identifier(node, env) {
    const { name } = node;
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
    if (name === "undefined") return () => void 0;
    this.checkKey(name, node);
    const hasGlobal = Object.prototype.hasOwnProperty.call(this.globals, name);
    const global = hasGlobal ? this.globals[name] : void 0;
    const { strict } = this;
    const compiler = this;
    return (s) => {
      const { ctx } = s;
      const value = ctx[name];
      if (value !== void 0 || name in ctx) return value;
      if (hasGlobal) return global;
      if (strict) throw compiler.error(`${name} is not defined`, node, "XUFA_EXPR_ERR_RUNTIME");
      return void 0;
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
    const items = node.elements.map(
      (element) => element.type === "SpreadElement" ? { spread: true, value: this.compile(element.argument, env) } : { spread: false, value: this.compile(element, env) }
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
      if (property.type === "SpreadElement") return { spread: this.compile(property.argument, env) };
      const value = this.compile(property.value, env);
      if (!property.computed) {
        if (property.key === "__proto__")
          throw this.error("__proto__ cannot be a key", property.value, "XUFA_EXPR_ERR_FORBIDDEN");
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
          if (source !== null && source !== void 0) {
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
      "XUFA_EXPR_ERR_RUNTIME"
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
      if (value === null || value === void 0) {
        if (optional) return SHORT;
        if (lenient) return void 0;
        throw compiler.nullMember(node);
      }
      return value[keyFn ? keyFn(s) : key];
    };
  }
  argumentsOf(nodes, env) {
    const items = nodes.map(
      (item) => item.type === "SpreadElement" ? { spread: true, value: this.compile(item.argument, env) } : { spread: false, value: this.compile(item, env) }
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
    return this.error(`${this.text(node.callee)} is not a function`, node, "XUFA_EXPR_ERR_RUNTIME");
  }
  call(node, env) {
    const args = this.argumentsOf(node.arguments, env);
    const { lenient } = this;
    const compiler = this;
    const callOptional = node.optional;
    const { callee } = node;
    if (callee.type === "MemberExpression") {
      const { object, key, keyFn } = this.memberParts(callee, env);
      const memberOptional = callee.optional;
      return (s) => {
        const target = object(s);
        if (target === SHORT) return SHORT;
        if (target === null || target === void 0) {
          if (memberOptional) return SHORT;
          if (lenient) return void 0;
          throw compiler.nullMember(callee);
        }
        const fn = target[keyFn ? keyFn(s) : key];
        if (typeof fn !== "function") {
          if (callOptional && (fn === null || fn === void 0)) return SHORT;
          if (lenient) return void 0;
          throw compiler.notFunction(node);
        }
        return Reflect.apply(fn, target, args(s));
      };
    }
    const fnOf = this.compile(callee, env);
    return (s) => {
      const fn = fnOf(s);
      if (fn === SHORT) return SHORT;
      if (typeof fn !== "function") {
        if (callOptional && (fn === null || fn === void 0)) return SHORT;
        if (lenient) return void 0;
        throw compiler.notFunction(node);
      }
      return Reflect.apply(fn, void 0, args(s));
    };
  }
  unary(node, env) {
    const argument = this.compile(node.argument, env);
    switch (node.operator) {
      case "!":
        return (s) => !argument(s);
      case "-":
        return (s) => -argument(s);
      case "+":
        return (s) => +argument(s);
      case "~":
        return (s) => ~argument(s);
      // eslint-disable-line no-bitwise
      case "typeof":
        return (s) => typeof argument(s);
      default:
        throw this.error(`Unsupported operator ${node.operator}`, node);
    }
  }
  binary(node, env) {
    const left = this.compile(node.left, env);
    const right = this.compile(node.right, env);
    switch (node.operator) {
      case "+":
        return (s) => left(s) + right(s);
      case "-":
        return (s) => left(s) - right(s);
      case "*":
        return (s) => left(s) * right(s);
      case "/":
        return (s) => left(s) / right(s);
      case "%":
        return (s) => left(s) % right(s);
      case "**":
        return (s) => left(s) ** right(s);
      case "==":
        return (s) => left(s) == right(s);
      case "!=":
        return (s) => left(s) != right(s);
      case "===":
        return (s) => left(s) === right(s);
      case "!==":
        return (s) => left(s) !== right(s);
      case "<":
        return (s) => left(s) < right(s);
      case ">":
        return (s) => left(s) > right(s);
      case "<=":
        return (s) => left(s) <= right(s);
      case ">=":
        return (s) => left(s) >= right(s);
      case "|":
        return (s) => left(s) | right(s);
      case "&":
        return (s) => left(s) & right(s);
      case "^":
        return (s) => left(s) ^ right(s);
      case "<<":
        return (s) => left(s) << right(s);
      case ">>":
        return (s) => left(s) >> right(s);
      case ">>>":
        return (s) => left(s) >>> right(s);
      case "in":
        return (s) => left(s) in right(s);
      default:
        throw this.error(`Unsupported operator ${node.operator}`, node);
    }
  }
  logical(node, env) {
    const left = this.compile(node.left, env);
    const right = this.compile(node.right, env);
    switch (node.operator) {
      case "&&":
        return (s) => left(s) && right(s);
      case "||":
        return (s) => left(s) || right(s);
      default:
        return (s) => left(s) ?? right(s);
    }
  }
  // An arrow function: a function of JavaScript that runs its body here, with its arguments as a frame of names.
  arrow(node, env) {
    const body = this.compile(node.body, [...env, node.params]);
    return (s) => (...args) => body({ ctx: s.ctx, frame: args, up: s });
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
function define(object, key, value) {
  if (key === "__proto__") {
    Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
  } else object[key] = value;
}
function pathOf(tree) {
  const keys = [];
  let node = tree.type === "ChainExpression" ? tree.expression : tree;
  while (node.type === "MemberExpression" && !node.computed) {
    keys.unshift(node.property);
    node = node.object;
  }
  if (node.type !== "Identifier" || node.name === "undefined") return null;
  keys.unshift(node.name);
  return keys.length > 1 ? keys : null;
}
function pathReader(keys, options, general) {
  const [name, ...members] = keys;
  const { globals } = options;
  const hasGlobal = Object.prototype.hasOwnProperty.call(globals, name);
  const global = hasGlobal ? globals[name] : void 0;
  const { length } = members;
  return (context) => {
    const ctx = typeof context === "object" && context !== null ? context : contextOf(context);
    let value = ctx[name];
    if (value === void 0 && !(name in ctx)) {
      if (!hasGlobal) return general(context);
      value = global;
    }
    for (let i = 0; i < length; i += 1) {
      if (value === null || value === void 0) return general(context);
      value = value[members[i]];
    }
    return value;
  };
}
function compileTree(tree, source, options) {
  const compiler = new Compiler(source, options);
  const run = compiler.compile(tree, []);
  const general = (context) => run({ ctx: typeof context === "object" && context !== null ? context : contextOf(context), frame: null, up: null });
  const keys = pathOf(tree);
  const first = keys ? pathReader(keys, options, general) : general;
  if (!options.inline) return first;
  const after = options.inlineAfter;
  if (after <= 0) return (0, import_codegen.generate)(tree, compiler, options, SHORT) || first;
  let runs = 0;
  let fn = first;
  return (context) => {
    if (fn === first) {
      runs += 1;
      if (runs === after) fn = (0, import_codegen.generate)(tree, compiler, options, SHORT) || first;
    }
    return fn(context);
  };
}

},
"@xufa/expression/lib/errors.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var errors_exports = {};
__export(errors_exports, {
  ExpressionError: () => ExpressionError,
  locate: () => locate
});
module.exports = __toCommonJS(errors_exports);
function locate(source, position) {
  let line = 1;
  let column = 1;
  for (let i = 0; i < position && i < source.length; i += 1) {
    if (source[i] === "\n") {
      line += 1;
      column = 1;
    } else column += 1;
  }
  return { line, column };
}
class ExpressionError extends Error {
  constructor(message, { code = "XUFA_EXPR_ERR_SYNTAX", source, position } = {}) {
    const at = source !== void 0 && position !== void 0 ? locate(source, position) : null;
    super(at ? `${message} (line ${at.line}, column ${at.column})` : message);
    this.name = "ExpressionError";
    this.code = code;
    if (at) {
      this.position = position;
      this.line = at.line;
      this.column = at.column;
    }
  }
}

},
"@xufa/expression/lib/globals.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var globals_exports = {};
__export(globals_exports, {
  GLOBALS: () => GLOBALS
});
module.exports = __toCommonJS(globals_exports);
function withStatics(fn, source, names) {
  names.forEach((name) => {
    fn[name] = source[name];
  });
  return Object.freeze(fn);
}
const safeNumber = withStatics((value) => Number(value), Number, [
  "isInteger",
  "isFinite",
  "isNaN",
  "isSafeInteger",
  "parseFloat",
  "parseInt",
  "MAX_SAFE_INTEGER",
  "MIN_SAFE_INTEGER",
  "MAX_VALUE",
  "MIN_VALUE",
  "EPSILON",
  "POSITIVE_INFINITY",
  "NEGATIVE_INFINITY",
  "NaN"
]);
const safeString = withStatics((value) => String(value), String, ["fromCharCode", "fromCodePoint"]);
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
    fromEntries: Object.fromEntries
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
  Infinity: Infinity,
  NaN: NaN
});

},
"@xufa/expression/lib/parser.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var parser_exports = {};
__export(parser_exports, {
  Parser: () => Parser,
  parse: () => parse
});
module.exports = __toCommonJS(parser_exports);
var import_tokenizer = require("./tokenizer.js");
var import_errors = require("./errors.js");
const BINARY = Object.assign(/* @__PURE__ */ Object.create(null), {
  "??": 1,
  "||": 2,
  "&&": 3,
  "|": 4,
  "^": 5,
  "&": 6,
  "==": 7,
  "!=": 7,
  "===": 7,
  "!==": 7,
  "<": 8,
  ">": 8,
  "<=": 8,
  ">=": 8,
  in: 8,
  "<<": 9,
  ">>": 9,
  ">>>": 9,
  "+": 10,
  "-": 10,
  "*": 11,
  "/": 11,
  "%": 11,
  "**": 12
});
const LOGICAL = /* @__PURE__ */ new Set(["&&", "||", "??"]);
const UNARY = /* @__PURE__ */ new Set(["!", "-", "+", "~", "typeof"]);
const LITERALS = Object.assign(/* @__PURE__ */ Object.create(null), { true: true, false: false, null: null });
const UNSUPPORTED = /* @__PURE__ */ new Set([
  "new",
  "this",
  "function",
  "class",
  "delete",
  "void",
  "instanceof",
  "await",
  "yield",
  "super",
  "import",
  "var",
  "let",
  "const",
  "return",
  "if",
  "for",
  "while",
  "do",
  "switch",
  "throw",
  "try",
  "with",
  "debugger"
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
    return new import_errors.ExpressionError(message, { source: this.source, position });
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
    return Boolean(token && token.type === "punctuator" && token.value === value);
  }
  isName(value, offset = 0) {
    const token = this.peek(offset);
    return Boolean(token && token.type === "name" && token.value === value);
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
    if (this.tokens.length === 0) throw this.error("Empty expression");
    const node = this.filters ? this.parseFiltered() : this.parseExpression();
    if (this.index < this.tokens.length) {
      const token = this.peek();
      if (token.type === "punctuator" && token.value === "=") throw this.error("Assignments are not allowed");
      if (token.type === "punctuator" && token.value === ",") throw this.error("Sequences (a, b) are not allowed");
      throw this.error(`Unexpected ${describe(token)}`);
    }
    return node;
  }
  parseFiltered() {
    let node = this.parseExpression();
    while (this.is("|")) {
      const bar = this.next();
      const name = this.next();
      if (!name || name.type !== "name") throw this.error("Expected the name of a filter", name || bar);
      const args = this.is("(") ? this.parseArguments() : [];
      node = {
        type: "Filter",
        name: name.value,
        expression: node,
        arguments: args,
        start: node.start,
        end: this.last()
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
    if (!this.is("?")) return test;
    this.next();
    const consequent = this.parseExpression();
    this.expect(":");
    const alternate = this.parseExpression();
    return { type: "ConditionalExpression", test, consequent, alternate, start: test.start, end: alternate.end };
  }
  binaryOperator() {
    const token = this.peek();
    if (!token) return null;
    if (token.type === "name" && token.value === "in") return "in";
    if (token.type !== "punctuator" || !(token.value in BINARY)) return null;
    if (token.value === "|" && this.filters) return null;
    return token.value;
  }
  parseBinary(minPower) {
    let left = this.parseUnary();
    for (; ; ) {
      const operator = this.binaryOperator();
      if (!operator) return left;
      const power = BINARY[operator];
      if (power <= minPower) return left;
      const token = this.next();
      const right = this.parseBinary(operator === "**" ? power - 1 : power);
      const mixed = operator === "??" && (isLogical(left, "||", "&&") || isLogical(right, "||", "&&")) || (operator === "||" || operator === "&&") && (isLogical(left, "??") || isLogical(right, "??"));
      if (mixed) throw this.error("?? cannot be mixed with || or && without parentheses", token);
      left = {
        type: LOGICAL.has(operator) ? "LogicalExpression" : "BinaryExpression",
        operator,
        left,
        right,
        start: left.start,
        end: right.end
      };
    }
  }
  parseUnary() {
    const token = this.peek();
    if (!token) throw this.error("Unexpected end of the expression");
    const operator = token.type === "punctuator" && UNARY.has(token.value) || token.type === "name" && token.value === "typeof" ? token.value : null;
    if (operator) {
      this.next();
      const argument = this.parseUnary();
      if (this.is("**")) throw this.error("Use parentheses around a unary expression before **");
      return { type: "UnaryExpression", operator, argument, start: token.start, end: argument.end };
    }
    if (token.type === "punctuator" && (token.value === "++" || token.value === "--")) {
      throw this.error("Updates (++, --) are not allowed");
    }
    return this.parsePostfix(this.parsePrimary());
  }
  // Members, calls and optional chains: a chain with ?. is wrapped in a ChainExpression, where it ends.
  parsePostfix(base) {
    let node = base;
    let optional = false;
    for (; ; ) {
      if (this.is(".")) {
        this.next();
        const name = this.next();
        if (!name || name.type !== "name") throw this.error("Expected a property name", name);
        node = { type: "MemberExpression", object: node, property: name.value, computed: false, optional: false };
      } else if (this.is("?.")) {
        this.next();
        optional = true;
        if (this.is("(")) {
          node = { type: "CallExpression", callee: node, arguments: this.parseArguments(), optional: true };
        } else if (this.is("[")) {
          this.next();
          const property = this.parseExpression();
          this.expect("]");
          node = { type: "MemberExpression", object: node, property, computed: true, optional: true };
        } else {
          const name = this.next();
          if (!name || name.type !== "name") throw this.error("Expected a property name", name);
          node = { type: "MemberExpression", object: node, property: name.value, computed: false, optional: true };
        }
      } else if (this.is("[")) {
        this.next();
        const property = this.parseExpression();
        this.expect("]");
        node = { type: "MemberExpression", object: node, property, computed: true, optional: false };
      } else if (this.is("(")) {
        node = { type: "CallExpression", callee: node, arguments: this.parseArguments(), optional: false };
      } else if (this.peek() && this.peek().type === "template") {
        throw this.error("Tagged templates are not allowed");
      } else break;
      node.start = base.start;
      node.end = this.last();
    }
    return optional ? { type: "ChainExpression", expression: node, start: node.start, end: node.end } : node;
  }
  parseArguments() {
    this.expect("(");
    const args = [];
    while (!this.is(")")) {
      args.push(this.parseElement());
      if (!this.is(")")) this.expect(",");
    }
    this.expect(")");
    return args;
  }
  // An item of a list (arguments, arrays): an expression or ...spread.
  parseElement() {
    if (this.is("...")) {
      const token = this.next();
      const argument = this.parseExpression();
      return { type: "SpreadElement", argument, start: token.start, end: argument.end };
    }
    return this.parseExpression();
  }
  parsePrimary() {
    const token = this.peek();
    if (!token) throw this.error("Unexpected end of the expression");
    if (token.type === "number" || token.type === "string") {
      this.next();
      return { type: "Literal", value: token.value, start: token.start, end: token.end };
    }
    if (token.type === "template") {
      this.next();
      const expressions = token.expressions.map((part) => {
        const parser = new Parser(this.source, part.tokens);
        if (part.tokens.length === 0) throw this.error("Empty ${} in a template literal", token);
        const node = parser.parseExpression();
        if (parser.index < part.tokens.length) throw parser.error(`Unexpected ${describe(parser.peek())}`);
        return node;
      });
      return { type: "TemplateLiteral", quasis: token.quasis, expressions, start: token.start, end: token.end };
    }
    if (token.type === "name") {
      if (UNSUPPORTED.has(token.value)) throw this.error(`${token.value} is not allowed in expressions`);
      if (this.is("=>", 1)) {
        this.next();
        return this.parseArrow([token.value], token);
      }
      this.next();
      if (token.value in LITERALS) {
        return { type: "Literal", value: LITERALS[token.value], start: token.start, end: token.end };
      }
      return { type: "Identifier", name: token.value, start: token.start, end: token.end };
    }
    if (this.is("(")) {
      const params = this.arrowParams();
      if (params) return this.parseArrow(params, token);
      this.next();
      const node = this.filters ? this.parseFiltered() : this.parseExpression();
      this.expect(")");
      return { ...node, parenthesized: true };
    }
    if (this.is("[")) {
      this.next();
      const elements = [];
      while (!this.is("]")) {
        if (this.is(",")) throw this.error("Holes in arrays are not allowed");
        elements.push(this.parseElement());
        if (!this.is("]")) this.expect(",");
      }
      this.expect("]");
      return { type: "ArrayExpression", elements, start: token.start, end: this.last() };
    }
    if (this.is("{")) return this.parseObject();
    throw this.error(`Unexpected ${describe(token)}`);
  }
  // (a, b) => ...: the names of the parameters, when what starts here is an arrow function.
  arrowParams() {
    const params = [];
    let i = 1;
    if (!this.is(")", i)) {
      for (; ; ) {
        const token = this.peek(i);
        if (!token || token.type !== "name") return null;
        params.push(token.value);
        i += 1;
        if (this.is(")", i)) break;
        if (!this.is(",", i)) return null;
        i += 1;
      }
    }
    if (!this.is("=>", i + 1)) return null;
    this.index += i + 1;
    return params;
  }
  parseArrow(params, start) {
    this.expect("=>");
    if (this.is("{")) {
      throw this.error("Arrow functions take an expression: wrap an object in parentheses");
    }
    params.forEach((name, i) => {
      if (UNSUPPORTED.has(name) || name in LITERALS) throw this.error(`${name} cannot be a parameter`, start);
      if (params.indexOf(name) !== i) throw this.error(`Duplicate parameter ${name}`, start);
    });
    const body = this.parseExpression();
    return { type: "ArrowFunctionExpression", params, body, start: start.start, end: body.end };
  }
  parseObject() {
    const open = this.expect("{");
    const properties = [];
    while (!this.is("}")) {
      if (this.is("...")) {
        const token = this.next();
        const argument = this.parseExpression();
        properties.push({ type: "SpreadElement", argument, start: token.start, end: argument.end });
      } else {
        const token = this.next();
        let key;
        let computed = false;
        if (token && token.type === "punctuator" && token.value === "[") {
          key = this.parseExpression();
          this.expect("]");
          computed = true;
        } else if (token && (token.type === "name" || token.type === "string")) key = token.value;
        else if (token && token.type === "number") key = String(token.value);
        else throw this.error("Expected a property name", token);
        if (this.is(":")) {
          this.next();
          properties.push({ type: "Property", key, computed, value: this.parseExpression(), shorthand: false });
        } else if (token.type === "name" && !computed && (this.is(",") || this.is("}"))) {
          if (UNSUPPORTED.has(key) || key in LITERALS) throw this.error(`${key} is not allowed in expressions`, token);
          properties.push({
            type: "Property",
            key,
            computed: false,
            value: { type: "Identifier", name: key, start: token.start, end: token.end },
            shorthand: true
          });
        } else if (this.is("(")) throw this.error("Methods are not allowed in objects");
        else this.expect(":");
      }
      if (!this.is("}")) this.expect(",");
    }
    this.expect("}");
    return { type: "ObjectExpression", properties, start: open.start, end: this.last() };
  }
}
function isLogical(node, ...operators) {
  return node.type === "LogicalExpression" && !node.parenthesized && operators.includes(node.operator);
}
function describe(token) {
  if (token.type === "string") return "a string";
  if (token.type === "number") return "a number";
  if (token.type === "template") return "a template literal";
  return JSON.stringify(token.value);
}
function parse(source, options = {}) {
  if (typeof source !== "string") throw new TypeError("An expression is a string");
  const { tokens } = (0, import_tokenizer.tokenize)(source);
  return new Parser(source, tokens, options).parseAll();
}

},
"@xufa/expression/lib/tokenizer.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var tokenizer_exports = {};
__export(tokenizer_exports, {
  tokenize: () => tokenize
});
module.exports = __toCommonJS(tokenizer_exports);
var import_errors = require("./errors.js");
const PUNCTUATORS = [
  ">>>",
  "...",
  "===",
  "!==",
  "**",
  "?.",
  "??",
  "=>",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "<<",
  ">>",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "!",
  "~",
  "&",
  "|",
  "^",
  "?",
  ":",
  ",",
  ".",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  "="
];
const NAME = /[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*/uy;
const DECIMAL = /(?:\d(?:_?\d)*)?(?:\.\d(?:_?\d)*|\.)?(?:[eE][+-]?\d(?:_?\d)*)?/y;
const RADIX = /0([xX][\da-fA-F](?:_?[\da-fA-F])*|[oO][0-7](?:_?[0-7])*|[bB][01](?:_?[01])*)(n?)/y;
const BIGINT = /(\d(?:_?\d)*)n/y;
const SPACE = /[\s\uFEFF]/;
const isDigit = (char) => char >= "0" && char <= "9";
function escapeAt(source, i, position) {
  const char = source[i];
  const simple = { n: "\n", t: "	", r: "\r", b: "\b", f: "\f", v: "\v" };
  if (char in simple) return [simple[char], 1];
  if (char === "0" && !isDigit(source[i + 1] || "")) return ["\0", 1];
  if (char === "x") {
    const hex = source.slice(i + 1, i + 3);
    if (!/^[\da-fA-F]{2}$/.test(hex)) throw new import_errors.ExpressionError("Invalid \\x escape", { source, position });
    return [String.fromCharCode(parseInt(hex, 16)), 3];
  }
  if (char === "u") {
    if (source[i + 1] === "{") {
      const end = source.indexOf("}", i + 2);
      const hex2 = end === -1 ? "" : source.slice(i + 2, end);
      const code = /^[\da-fA-F]{1,6}$/.test(hex2) ? parseInt(hex2, 16) : NaN;
      if (!(code <= 1114111)) throw new import_errors.ExpressionError("Invalid \\u escape", { source, position });
      return [String.fromCodePoint(code), end - i + 1];
    }
    const hex = source.slice(i + 1, i + 5);
    if (!/^[\da-fA-F]{4}$/.test(hex)) throw new import_errors.ExpressionError("Invalid \\u escape", { source, position });
    return [String.fromCharCode(parseInt(hex, 16)), 5];
  }
  if (char === "\r" && source[i + 1] === "\n") return ["", 2];
  if (char === "\n" || char === "\r" || char === "\u2028" || char === "\u2029") return ["", 1];
  if (isDigit(char)) throw new import_errors.ExpressionError("Octal escapes are not allowed", { source, position });
  return [char, 1];
}
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
    if (char === "/" && (source[i + 1] === "/" || source[i + 1] === "*")) {
      throw new import_errors.ExpressionError("Comments are not allowed in expressions", { source, position: i });
    }
    if (isDigit(char) || char === "." && isDigit(source[i + 1] || "")) {
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
    if (char === "`") {
      const token = readTemplate(source, i);
      tokens.push(token);
      i = token.end;
      continue;
    }
    NAME.lastIndex = i;
    const name = NAME.exec(source);
    if (name) {
      tokens.push({ type: "name", value: name[0], start: i, end: i + name[0].length });
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
    if (punctuator === "?." && isDigit(source[i + 2] || "")) punctuator = "?";
    if (!punctuator) throw new import_errors.ExpressionError(`Unexpected character ${JSON.stringify(char)}`, { source, position: i });
    if (nested) {
      if (punctuator === "{") depth += 1;
      else if (punctuator === "}") {
        if (depth === 0) return { tokens, end: i };
        depth -= 1;
      }
    }
    tokens.push({ type: "punctuator", value: punctuator, start: i, end: i + punctuator.length });
    i += punctuator.length;
  }
  if (nested) throw new import_errors.ExpressionError("Unterminated template literal", { source, position: start });
  return { tokens, end: i };
}
function readNumber(source, i) {
  RADIX.lastIndex = i;
  let match = RADIX.exec(source);
  let value;
  let end;
  if (match) {
    const digits = match[1].replace(/_/g, "");
    value = match[2] ? BigInt(`0${digits}`) : Number(`0${digits}`);
    end = i + match[0].length;
  } else {
    BIGINT.lastIndex = i;
    match = BIGINT.exec(source);
    if (match) {
      value = BigInt(match[1].replace(/_/g, ""));
      end = i + match[0].length;
    } else {
      DECIMAL.lastIndex = i;
      match = DECIMAL.exec(source);
      value = Number(match[0].replace(/_/g, ""));
      end = i + match[0].length;
    }
  }
  NAME.lastIndex = end;
  if (NAME.exec(source) && NAME.lastIndex > end) {
    throw new import_errors.ExpressionError("Invalid number", { source, position: i });
  }
  return { type: "number", value, start: i, end };
}
function readString(source, i) {
  const quote = source[i];
  let value = "";
  let j = i + 1;
  for (; ; ) {
    if (j >= source.length) throw new import_errors.ExpressionError("Unterminated string", { source, position: i });
    const char = source[j];
    if (char === quote) break;
    if (char === "\n" || char === "\r") throw new import_errors.ExpressionError("Unterminated string", { source, position: i });
    if (char === "\\") {
      const [text, length] = escapeAt(source, j + 1, j);
      value += text;
      j += 1 + length;
    } else {
      value += char;
      j += 1;
    }
  }
  return { type: "string", value, start: i, end: j + 1 };
}
function readTemplate(source, i) {
  const quasis = [];
  const expressions = [];
  let text = "";
  let j = i + 1;
  for (; ; ) {
    if (j >= source.length) throw new import_errors.ExpressionError("Unterminated template literal", { source, position: i });
    const char = source[j];
    if (char === "`") break;
    if (char === "\\") {
      const [escaped, length] = escapeAt(source, j + 1, j);
      text += escaped;
      j += 1 + length;
    } else if (char === "$" && source[j + 1] === "{") {
      quasis.push(text);
      text = "";
      const inner = tokenize(source, j + 2, true);
      expressions.push({ tokens: inner.tokens, start: j + 2, end: inner.end });
      j = inner.end + 1;
    } else {
      if (char === "\r") text += source[j + 1] === "\n" ? "" : "\n";
      else text += char;
      j += 1;
    }
  }
  quasis.push(text);
  return { type: "template", quasis, expressions, start: i, end: j + 1 };
}

},
"@xufa/expression/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/expression","version":"0.1.0"};
},
"@xufa/marshal/index.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var marshal_exports = {};
__export(marshal_exports, {
  DECODE: () => import_registry.DECODE,
  ENCODE: () => import_registry.ENCODE,
  MarshalError: () => import_errors.MarshalError,
  Registry: () => import_registry.Registry,
  clone: () => import_clone.clone,
  marshal: () => import_marshal.marshal,
  parse: () => import_marshal.parse,
  registry: () => import_registry.registry,
  stringify: () => import_marshal.stringify,
  unmarshal: () => import_marshal.unmarshal
});
module.exports = __toCommonJS(marshal_exports);
var import_marshal = require("./lib/marshal.js");
var import_clone = require("./lib/clone.js");
var import_registry = require("./lib/registry.js");
var import_errors = require("./lib/errors.js");

},
"@xufa/marshal/lib/clone.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var clone_exports = {};
__export(clone_exports, {
  clone: () => __clone
});
module.exports = __toCommonJS(clone_exports);
var import_registry = require("./registry.js");
var import_errors = require("./errors.js");
var import_node_util = require("node:util");
const isNative = typeof Error.isError === "function" ? Error.isError : import_node_util.types.isNativeError;
const isError = (value) => isNative(value) || value instanceof Error;
function clone(value, options = {}) {
  const { registry = import_registry.registry, maxDepth = 1e3 } = options;
  const copies = /* @__PURE__ */ new Map();
  const define = (target, key, item) => Object.defineProperty(target, key, { value: item, enumerable: true, writable: true, configurable: true });
  function copyFields(source, target, depth, own = Object.keys(source)) {
    for (const key of own) define(target, key, copy(source[key], depth));
    return target;
  }
  function copy(input, depth) {
    if (input === null || typeof input !== "object" && typeof input !== "function") return input;
    if (typeof input === "function") return input;
    const known = copies.get(input);
    if (known !== void 0) return known;
    if (depth > maxDepth) throw new import_errors.MarshalError(`Deeper than maxDepth (${maxDepth})`, "XUFA_MARSHAL_ERR_DEPTH");
    const next = depth + 1;
    const keep = (target2) => {
      copies.set(input, target2);
      return target2;
    };
    if (Array.isArray(input)) {
      const array = keep(new Array(input.length));
      for (let i = 0; i < input.length; i += 1) if (i in input) array[i] = copy(input[i], next);
      return array;
    }
    const proto = Object.getPrototypeOf(input);
    if (proto === Object.prototype || proto === null) {
      return copyFields(input, keep(proto === null ? /* @__PURE__ */ Object.create(null) : {}), next);
    }
    const entry = registry.byClass.get(proto.constructor);
    if (entry && entry.encode && !isError(input)) {
      return keep(entry.decode(copy(entry.encode(input), next)));
    }
    if (import_node_util.types.isDate(input)) return keep(new Date(input.getTime()));
    if (import_node_util.types.isRegExp(input)) {
      const regexp = keep(new RegExp(input.source, input.flags));
      regexp.lastIndex = input.lastIndex;
      return regexp;
    }
    if (import_node_util.types.isMap(input)) {
      const map = keep(/* @__PURE__ */ new Map());
      for (const [key, item] of input) map.set(copy(key, next), copy(item, next));
      return map;
    }
    if (import_node_util.types.isSet(input)) {
      const set = keep(/* @__PURE__ */ new Set());
      for (const item of input) set.add(copy(item, next));
      return set;
    }
    if (typeof Buffer === "function" && Buffer.isBuffer(input)) return keep(Buffer.from(input));
    if (ArrayBuffer.isView(input)) {
      const bytes = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
      if (import_node_util.types.isDataView(input)) return keep(new DataView(bytes));
      return keep(new input.constructor(bytes));
    }
    if (import_node_util.types.isArrayBuffer(input)) return keep(input.slice(0));
    if (input instanceof URL) return keep(new URL(input.href));
    if (input instanceof URLSearchParams) return keep(new URLSearchParams(input));
    if (import_node_util.types.isBoxedPrimitive(input)) {
      return keep(Object(input.valueOf()));
    }
    if (import_node_util.types.isPromise(input) || import_node_util.types.isWeakMap(input) || import_node_util.types.isWeakSet(input)) {
      throw new import_errors.MarshalError(`A ${proto.constructor.name} cannot be copied`, "XUFA_MARSHAL_ERR_TYPE");
    }
    const target = keep(Object.create(proto));
    if (isError(input)) {
      for (const key of ["message", "stack", "cause", "errors"]) {
        if (Object.hasOwn(input, key)) {
          Object.defineProperty(target, key, {
            value: copy(input[key], next),
            enumerable: false,
            writable: true,
            configurable: true
          });
        }
      }
    }
    return copyFields(input, target, next);
  }
  return copy(value, 0);
}
const __clone = (0, import_errors.guard)(clone);

},
"@xufa/marshal/lib/errors.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var errors_exports = {};
__export(errors_exports, {
  MarshalError: () => MarshalError,
  guard: () => guard
});
module.exports = __toCommonJS(errors_exports);
class MarshalError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "MarshalError";
    this.code = code;
  }
}
function guard(fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      if (err instanceof RangeError && /call stack/.test(err.message)) {
        throw new MarshalError("Too deep for the stack (lower maxDepth)", "XUFA_MARSHAL_ERR_DEPTH");
      }
      throw err;
    }
  };
}

},
"@xufa/marshal/lib/marshal.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var marshal_exports = {};
__export(marshal_exports, {
  marshal: () => __marshal,
  parse: () => __parse,
  stringify: () => __stringify,
  unmarshal: () => __unmarshal
});
module.exports = __toCommonJS(marshal_exports);
var import_errors = require("./errors.js");
var import_node_util = require("node:util");
var import_registry = require("./registry.js");
const isNative = typeof Error.isError === "function" ? Error.isError : import_node_util.types.isNativeError;
const isError = (value) => isNative(value) || value instanceof Error;
const MARK = "\xA4";
const MARK_CODE = 164;
const UNDEFINED = "\xA4u";
const HOLE = "\xA4h";
const NAN = "\xA4N";
const POSITIVE_INFINITY = "\xA4I";
const NEGATIVE_INFINITY = "\xA4i";
const NEGATIVE_ZERO = "\xA4z";
const DATE = "\xA4D";
const REF = "\xA4R";
const BIGINT = "\xA4B";
const STRING = "\xA4S";
const T = {
  Array: "\xA4Array",
  Object: "\xA4Object",
  Map: "\xA4Map",
  Set: "\xA4Set",
  Null: "\xA4Null",
  RegExp: "\xA4RegExp",
  Symbol: "\xA4Symbol",
  Buffer: "\xA4Buffer",
  ArrayBuffer: "\xA4ArrayBuffer",
  DataView: "\xA4DataView",
  TypedArray: "\xA4TypedArray",
  URL: "\xA4URL",
  URLSearchParams: "\xA4URLSearchParams",
  Boxed: "\xA4Boxed",
  Error: "\xA4Error",
  Table: "\xA4Table"
};
const marked = (item) => typeof item === "string" && item.charCodeAt(0) === MARK_CODE;
const LONG = 64;
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
  BigUint64Array
};
if (typeof Float16Array === "function") TYPED_ARRAYS.Float16Array = Float16Array;
const ERRORS = { Error, TypeError, RangeError, SyntaxError, ReferenceError, EvalError, URIError, AggregateError };
const fail = (message, code = "XUFA_MARSHAL_ERR_INPUT") => {
  throw new import_errors.MarshalError(message, code);
};
const DEFAULTS = { maxDepth: 1e3, maxNodes: 1e7, unknown: "object", functions: "throw", stack: true };
const optionsOf = (options) => options === void 0 ? DEFAULTS : { ...DEFAULTS, ...options };
const tagOf = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag).get;
const typedArrayName = (view) => {
  const name = tagOf.call(view);
  return Object.hasOwn(TYPED_ARRAYS, name) ? name : void 0;
};
const assignables = /* @__PURE__ */ new WeakMap();
function assignable(Class) {
  let known = assignables.get(Class);
  if (known === void 0) {
    known = true;
    for (let proto = Class.prototype; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
      for (const key of Reflect.ownKeys(proto)) {
        if (key === "constructor") continue;
        const descriptor = Object.getOwnPropertyDescriptor(proto, key);
        if (descriptor.get || descriptor.set || descriptor.writable === false) known = false;
      }
    }
    assignables.set(Class, known);
  }
  return known;
}
const getTime = Date.prototype.getTime;
const setValues = Set.prototype.values;
const mapEntries = Map.prototype.entries;
function iterated(object, method) {
  try {
    return method.call(object);
  } catch {
    return null;
  }
}
const HAS_BUFFER = typeof Buffer === "function";
const isBuffer = (value) => HAS_BUFFER && Buffer.isBuffer(value);
function bytesOf(view) {
  if (HAS_BUFFER) return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString("base64");
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let text = "";
  for (let i = 0; i < bytes.length; i += 1) text += String.fromCharCode(bytes[i]);
  return globalThis.btoa(text);
}
function bytesFrom(text) {
  if (HAS_BUFFER) return Buffer.from(text, "base64");
  const binary = globalThis.atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
const defineOwn = (object, key, item) => Object.defineProperty(object, key, { value: item, enumerable: true, writable: true, configurable: true });
const put = (object, key, item) => {
  if (key === "__proto__") defineOwn(object, key, item);
  else object[key] = item;
};
const SKIP = /* @__PURE__ */ Symbol("skip");
function encode(value, options, share) {
  const { registry = import_registry.registry, maxDepth, unknown, functions, stack } = optionsOf(options);
  const numbers = /* @__PURE__ */ new Map();
  let count = 0;
  function add(input, depth) {
    switch (typeof input) {
      case "string":
        if (input.length >= LONG) {
          const known2 = numbers.get(input);
          if (known2 !== void 0) return REF + known2;
          numbers.set(input, count);
          count += 1;
        }
        return input.charCodeAt(0) === MARK_CODE ? STRING + input : input;
      case "number":
        if (input - input === 0 && (input !== 0 || 1 / input > 0)) return input;
        if (Number.isNaN(input)) return NAN;
        if (input === Infinity) return POSITIVE_INFINITY;
        if (input === -Infinity) return NEGATIVE_INFINITY;
        return NEGATIVE_ZERO;
      case "boolean":
        return input;
      case "undefined":
        return UNDEFINED;
      case "bigint":
        return BIGINT + input.toString();
      case "symbol": {
        const key = Symbol.keyFor(input);
        if (key === void 0)
          fail("A symbol that is not global (Symbol.for) cannot be written", "XUFA_MARSHAL_ERR_TYPE");
        return [T.Symbol, key];
      }
      case "function":
        if (functions === "skip") return SKIP;
        return fail(`A function cannot be written${input.name ? `: ${input.name}` : ""}`, "XUFA_MARSHAL_ERR_TYPE");
      default:
        break;
    }
    if (input === null) return null;
    const known = numbers.get(input);
    if (known !== void 0) return REF + known;
    if (depth > maxDepth) fail(`Deeper than maxDepth (${maxDepth})`, "XUFA_MARSHAL_ERR_DEPTH");
    numbers.set(input, count);
    count += 1;
    if (Array.isArray(input)) return arrayOf(input, depth + 1);
    const proto = Object.getPrototypeOf(input);
    if (proto === Object.prototype) return objectOf(input, depth + 1, share);
    return nodeOf(input, proto, depth + 1);
  }
  function val(input, depth) {
    const written = add(input, depth);
    return written === SKIP ? UNDEFINED : written;
  }
  function fieldsOf(object, depth, same, fields = same ? null : {}) {
    const keys = Object.keys(object);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const item = object[key];
      const written = add(item, depth);
      if (fields === null) {
        if (written === item) continue;
        fields = {};
        for (let j = 0; j < i; j += 1) put(fields, keys[j], object[keys[j]]);
      }
      if (written !== SKIP) put(fields, key, written);
    }
    return fields === null ? object : fields;
  }
  function objectOf(object, depth, same) {
    const fields = fieldsOf(object, depth, same);
    return Object.hasOwn(object, "@") ? [T.Object, fields] : fields;
  }
  function tableOf(input, depth) {
    const { length } = input;
    if (length < 2 || functions === "skip") return null;
    const first = input[0];
    if (first === null || typeof first !== "object" || Array.isArray(first)) return null;
    const proto = Object.getPrototypeOf(first);
    let name = null;
    if (proto !== Object.prototype) {
      const entry = proto === null ? void 0 : registry.byProto.get(proto);
      if (entry === void 0 || entry.error || entry.encode) return null;
      name = entry.name;
    }
    const keys = Object.keys(first);
    const width = keys.length;
    if (width === 0) return null;
    for (let i = 0; i < length; i += 1) {
      const item = input[i];
      if (!rowOf(item, proto, keys) || numbers.has(item)) {
        for (let j = 0; j < i; j += 1) numbers.delete(input[j]);
        return null;
      }
      numbers.set(item, count + i);
    }
    count += length;
    const table = new Array(3 + length * width);
    table[0] = T.Table;
    table[1] = name;
    table[2] = keys;
    let k = 3;
    for (let i = 0; i < length; i += 1) {
      const item = input[i];
      for (let j = 0; j < width; j += 1) {
        table[k] = val(item[keys[j]], depth + 1);
        k += 1;
      }
    }
    return table;
  }
  function rowOf(item, proto, keys) {
    if (item === null || typeof item !== "object" || Object.getPrototypeOf(item) !== proto) return false;
    const own = Object.keys(item);
    if (own.length !== keys.length) return false;
    for (let j = 0; j < keys.length; j += 1) if (own[j] !== keys[j]) return false;
    return true;
  }
  function arrayOf(input, depth) {
    const table = tableOf(input, depth);
    if (table !== null) return table;
    const { length } = input;
    let items = share ? null : new Array(length);
    for (let i = 0; i < length; i += 1) {
      const item = input[i];
      const written = item === void 0 && !(i in input) ? HOLE : val(item, depth);
      if (items === null) {
        if (written === item) continue;
        items = input.slice(0, i);
        items.length = length;
      }
      items[i] = written;
    }
    const array = items === null ? input : items;
    return length > 0 && marked(array[0]) ? [T.Array, ...array] : array;
  }
  function nodeOf(input, proto, depth) {
    if (proto === Date.prototype) {
      try {
        return dateOf(input);
      } catch {
      }
    }
    if (proto === Set.prototype) {
      const values = iterated(input, setValues);
      if (values !== null) return setOf(values, depth);
    } else if (proto === Map.prototype) {
      const entries = iterated(input, mapEntries);
      if (entries !== null) return mapOf(entries, depth);
    }
    if (proto === null) return [T.Null, fieldsOf(input, depth, false)];
    const entry = registry.byProto.get(proto);
    if (entry !== void 0 && !entry.error) {
      if (entry.encode) return [`${MARK}@${entry.name}`, val(entry.encode(input), depth), 1];
      if (Object.hasOwn(input, "@")) return [`${MARK}@${entry.name}`, fieldsOf(input, depth, false)];
      return fieldsOf(input, depth, false, { "@": entry.name });
    }
    if (import_node_util.types.isDate(input)) return dateOf(input);
    if (import_node_util.types.isRegExp(input)) return [T.RegExp, input.source, input.flags];
    if (import_node_util.types.isMap(input)) return mapOf(mapEntries.call(input), depth);
    if (import_node_util.types.isSet(input)) return setOf(setValues.call(input), depth);
    if (isBuffer(input)) return [T.Buffer, bytesOf(input)];
    if (ArrayBuffer.isView(input)) {
      if (import_node_util.types.isDataView(input)) return [T.DataView, bytesOf(input)];
      const name2 = typedArrayName(input);
      if (name2) return [T.TypedArray, name2, bytesOf(input)];
    }
    if (import_node_util.types.isArrayBuffer(input)) return [T.ArrayBuffer, bytesOf(new Uint8Array(input))];
    if (isError(input)) return errorNode(input, entry, depth);
    if (input instanceof URL) return [T.URL, input.href];
    if (input instanceof URLSearchParams) return [T.URLSearchParams, input.toString()];
    if (import_node_util.types.isBoxedPrimitive(input)) return [T.Boxed, val(input.valueOf(), depth)];
    const name = proto && proto.constructor && proto.constructor.name || "an object";
    if (unknown === "error" || isOpaque(input)) {
      return fail(`${name} is not a registered class (registry.register(${name}))`, "XUFA_MARSHAL_ERR_CLASS");
    }
    return objectOf(input, depth, share && typeof input.toJSON !== "function");
  }
  function mapOf(entries, depth) {
    const node = [T.Map];
    for (const [key, item] of entries) node.push(val(key, depth), val(item, depth));
    return node;
  }
  function setOf(values, depth) {
    const node = [T.Set];
    for (const item of values) node.push(val(item, depth));
    return node;
  }
  function dateOf(date) {
    const time = getTime.call(date);
    return time === time ? DATE + time : DATE;
  }
  function errorNode(error, entry, depth) {
    let kind = "Error";
    if (entry) kind = `Class:${entry.name}`;
    else {
      const builtin = Object.keys(ERRORS).find((key) => Object.getPrototypeOf(error) === ERRORS[key].prototype);
      if (builtin) kind = builtin;
    }
    const message = val(error.message, depth);
    const trace = stack && typeof error.stack === "string" ? val(error.stack, depth) : UNDEFINED;
    const fields = fieldsOf(error, depth, false);
    if (kind === "Error" && error.name !== "Error" && !("name" in fields)) fields.name = val(error.name, depth);
    return [
      T.Error,
      kind,
      message,
      trace,
      fields,
      "cause" in error ? val(error.cause, depth) : HOLE,
      error instanceof AggregateError ? val(error.errors, depth) : HOLE
    ];
  }
  return val(value, 0);
}
function isOpaque(input) {
  return import_node_util.types.isPromise(input) || import_node_util.types.isWeakMap(input) || import_node_util.types.isWeakSet(input) || typeof WeakRef === "function" && input instanceof WeakRef || typeof input.then === "function";
}
const PENDING = /* @__PURE__ */ Symbol("pending");
function integerAt(text) {
  let i = 2;
  let sign = 1;
  if (text.charCodeAt(2) === 45) {
    sign = -1;
    i = 3;
  }
  if (i >= text.length || text.length - i > 15) return NaN;
  let value = 0;
  for (; i < text.length; i += 1) {
    const digit = text.charCodeAt(i) - 48;
    if (digit < 0 || digit > 9) return NaN;
    value = value * 10 + digit;
  }
  return sign * value;
}
const PLAIN = { entry: null, set: put };
function decode(data, options, own) {
  const { registry = import_registry.registry, maxDepth, maxNodes, unknown } = optionsOf(options);
  const made = [];
  const entries = /* @__PURE__ */ new Map();
  let size = 0;
  function fill(target, fields, depth, set) {
    if (fields === null || typeof fields !== "object" || Array.isArray(fields)) fail("Fields must be an object");
    const keys = Object.keys(fields);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      set(target, key, get(fields[key], depth));
    }
    return target;
  }
  function get(node, depth) {
    size += 1;
    if (size > maxNodes) fail(`More values than maxNodes (${maxNodes})`, "XUFA_MARSHAL_ERR_SIZE");
    if (typeof node !== "object") {
      if (typeof node === "string") {
        if (node.charCodeAt(0) === MARK_CODE) return special(node);
        if (node.length >= LONG) made.push(node);
        return node;
      }
      if (typeof node === "number") {
        if (node - node !== 0) fail("A number that is not finite");
        return node;
      }
      if (typeof node === "boolean") return node;
      return fail(`Not data: ${typeof node}`);
    }
    if (node === null) return null;
    if (depth > maxDepth) fail(`Deeper than maxDepth (${maxDepth})`, "XUFA_MARSHAL_ERR_DEPTH");
    if (Array.isArray(node)) {
      if (node.length > 0 && marked(node[0])) return tagged(node, depth + 1);
      return items(node, 0, depth + 1);
    }
    const name = node["@"];
    if (name !== void 0 && Object.hasOwn(node, "@")) return instance(node, name, depth + 1);
    return plain(node, depth + 1);
  }
  function special(node) {
    if (node.length === 2) {
      switch (node) {
        case UNDEFINED:
          return void 0;
        case NAN:
          return NaN;
        case POSITIVE_INFINITY:
          return Infinity;
        case NEGATIVE_INFINITY:
          return -Infinity;
        case NEGATIVE_ZERO:
          return -0;
        case DATE:
          return keep(/* @__PURE__ */ new Date(NaN));
        case HOLE:
          return fail("A hole out of an array");
        default:
          return fail(`Not a tag: ${JSON.stringify(node)}`);
      }
    }
    switch (node.charCodeAt(1)) {
      case 68: {
        let time = integerAt(node);
        if (time !== time) time = Number(node.slice(2));
        if (!Number.isFinite(time)) fail(`Not a date: ${JSON.stringify(node.slice(2))}`);
        return keep(new Date(time));
      }
      case 82: {
        const number = integerAt(node);
        if (!Number.isInteger(number) || number < 0 || number >= made.length) {
          fail(`Not a reference: ${JSON.stringify(node.slice(2))}`);
        }
        const value = made[number];
        if (value === PENDING) fail("A cycle through an instance made by decode()", "XUFA_MARSHAL_ERR_CYCLE");
        return value;
      }
      case 66: {
        const digits = node.slice(2);
        if (!/^-?\d+$/.test(digits)) fail("Not a BigInt");
        return BigInt(digits);
      }
      case 83: {
        const text = node.slice(2);
        if (text.length >= LONG) made.push(text);
        return text;
      }
      default:
        return fail(`Not a tag: ${JSON.stringify(node)}`);
    }
  }
  function plain(node, depth) {
    if (own) {
      made.push(node);
      const keys = Object.keys(node);
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        const item = node[key];
        const value = get(item, depth);
        if (value !== item) put(node, key, value);
      }
      return node;
    }
    return fill(keep({}), node, depth, put);
  }
  function items(node, first, depth) {
    const length = node.length - first;
    const array = own && first === 0 ? node : new Array(length);
    made.push(array);
    for (let i = 0; i < length; i += 1) {
      const item = node[i + first];
      if (item === HOLE) {
        if (array === node) delete array[i];
        continue;
      }
      const value = get(item, depth);
      if (value !== item || array !== node) array[i] = value;
    }
    return array;
  }
  const bytes = (text) => {
    if (typeof text !== "string") fail("Bytes must be base64 text");
    return bytesFrom(text);
  };
  function tagged(node, depth) {
    const [tag] = node;
    if (tag.charCodeAt(1) === 64) return encoded(node, depth);
    switch (tag) {
      case T.Array:
        return items(node, 1, depth);
      case T.Table: {
        const [, name, keys] = node;
        if (!Array.isArray(keys) || keys.length === 0 || !keys.every((key) => typeof key === "string")) {
          fail("A table needs its keys");
        }
        if ((node.length - 3) % keys.length !== 0) fail("A table needs a value for each key");
        const { entry, set } = name === null ? PLAIN : classNamed(name);
        const count = (node.length - 3) / keys.length;
        const array = keep(new Array(count));
        for (let i = 0; i < count; i += 1) array[i] = entry === null ? keep({}) : made_(entry, name);
        for (let i = 0, k = 3; i < count; i += 1) {
          const target = array[i];
          for (let j = 0; j < keys.length; j += 1, k += 1) set(target, keys[j], get(node[k], depth));
        }
        return array;
      }
      case T.Object:
        if (node[1] === null || typeof node[1] !== "object" || Array.isArray(node[1])) fail("Fields must be an object");
        if (own) return plain(node[1], depth);
        return fill(keep({}), node[1], depth, put);
      case T.RegExp:
        if (typeof node[1] !== "string" || typeof node[2] !== "string") fail("A RegExp needs its source and flags");
        try {
          return keep(new RegExp(node[1], node[2]));
        } catch (err) {
          return fail(`Not a RegExp: ${err.message}`);
        }
      case T.Symbol:
        if (typeof node[1] !== "string") fail("Not a symbol");
        return Symbol.for(node[1]);
      case T.Map: {
        if (node.length % 2 === 0) fail("A Map needs a value for each key");
        const map = keep(/* @__PURE__ */ new Map());
        for (let i = 1; i + 1 < node.length; i += 2) map.set(get(node[i], depth), get(node[i + 1], depth));
        return map;
      }
      case T.Set: {
        const set_ = keep(/* @__PURE__ */ new Set());
        for (let i = 1; i < node.length; i += 1) set_.add(get(node[i], depth));
        return set_;
      }
      case T.Null:
        return fill(keep(/* @__PURE__ */ Object.create(null)), node[1], depth, defineOwn);
      case T.Buffer:
        return keep(bytes(node[1]));
      case T.ArrayBuffer: {
        const buffer = bytes(node[1]);
        return keep(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      }
      case T.DataView: {
        const buffer = bytes(node[1]);
        return keep(new DataView(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)));
      }
      case T.TypedArray: {
        const Type = Object.hasOwn(TYPED_ARRAYS, node[1]) ? TYPED_ARRAYS[node[1]] : null;
        if (!Type) fail(`Not a typed array: ${node[1]}`);
        const buffer = bytes(node[2]);
        if (buffer.byteLength % Type.BYTES_PER_ELEMENT !== 0) fail(`Bytes that are no ${node[1]}`);
        const copy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return keep(new Type(copy));
      }
      case T.URL:
        try {
          return keep(new URL(node[1]));
        } catch {
          return fail("Not a URL");
        }
      case T.URLSearchParams:
        if (typeof node[1] !== "string") fail("Not URLSearchParams");
        return keep(new URLSearchParams(node[1]));
      case T.Boxed: {
        const number = reserve();
        const primitive = get(node[1], depth);
        if (primitive === null || primitive === void 0 || typeof primitive === "object") fail("Not a primitive");
        made[number] = Object(primitive);
        return made[number];
      }
      case T.Error:
        return error(node, depth);
      default:
        return fail(`Not a tag: ${JSON.stringify(tag)}`);
    }
  }
  function keep(value) {
    made.push(value);
    return value;
  }
  function reserve() {
    made.push(PENDING);
    return made.length - 1;
  }
  function classNamed(name) {
    if (typeof name !== "string") fail("A class needs a name");
    let known = entries.get(name);
    if (known === void 0) {
      const entry = registry.byName.get(name) || null;
      if (!entry && unknown === "error") fail(`${name} is not a registered class`, "XUFA_MARSHAL_ERR_CLASS");
      known = { entry, set: entry && !assignable(entry.Class) ? defineOwn : put };
      entries.set(name, known);
    }
    return known;
  }
  const entryOf = (name) => classNamed(name).entry;
  function made_(entry, name) {
    if (entry && entry.decode) fail(`${name} has a decode(), but was written without it`, "XUFA_MARSHAL_ERR_CLASS");
    return keep(entry ? Object.create(entry.Class.prototype) : {});
  }
  function instance(node, name, depth) {
    const { entry, set } = classNamed(name);
    const target = made_(entry, name);
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (key !== "@") set(target, key, get(node[key], depth));
    }
    return target;
  }
  function encoded([tag, data2, hooked], depth) {
    const name = tag.slice(2);
    const { entry, set } = classNamed(name);
    if (hooked) {
      const number = reserve();
      const decoded = get(data2, depth);
      if (!entry) return made[number] = decoded;
      if (!entry.decode) fail(`${name} was written by its encode(), and has no decode()`, "XUFA_MARSHAL_ERR_CLASS");
      return made[number] = entry.decode(decoded);
    }
    return fill(made_(entry, name), data2, depth, set);
  }
  function error([, kind, message, stack, fields, cause, errors], depth) {
    let proto = Error.prototype;
    if (typeof kind === "string" && kind.startsWith("Class:")) {
      const entry = entryOf(kind.slice(6));
      if (entry) proto = entry.Class.prototype;
    } else if (typeof kind === "string" && Object.hasOwn(ERRORS, kind)) {
      proto = ERRORS[kind].prototype;
    }
    const target = keep(Object.create(proto));
    const hidden = (key, value) => Object.defineProperty(target, key, { value, enumerable: false, writable: true, configurable: true });
    hidden("message", String(get(message, depth)));
    const trace = get(stack, depth);
    if (trace !== void 0) hidden("stack", String(trace));
    fill(target, fields, depth, defineOwn);
    if (cause !== HOLE) hidden("cause", get(cause, depth));
    if (errors !== HOLE) hidden("errors", get(errors, depth));
    return target;
  }
  return get(data, 0);
}
function marshal(value, options) {
  return encode(value, options, false);
}
function unmarshal(data, options) {
  return decode(data, options, false);
}
function stringify(value, options) {
  return JSON.stringify(encode(value, options, true));
}
function parse(text, options) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return fail(`Not JSON: ${err.message}`);
  }
  return decode(data, options, true);
}
const __marshal = (0, import_errors.guard)(marshal);
const __unmarshal = (0, import_errors.guard)(unmarshal);
const __stringify = (0, import_errors.guard)(stringify);
const __parse = (0, import_errors.guard)(parse);

},
"@xufa/marshal/lib/registry.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var registry_exports = {};
__export(registry_exports, {
  DECODE: () => DECODE,
  ENCODE: () => ENCODE,
  Registry: () => Registry,
  registry: () => registry
});
module.exports = __toCommonJS(registry_exports);
var import_errors = require("./errors.js");
const ENCODE = /* @__PURE__ */ Symbol.for("xufa.marshal.encode");
const DECODE = /* @__PURE__ */ Symbol.for("xufa.marshal.decode");
class Registry {
  constructor() {
    this.byName = /* @__PURE__ */ new Map();
    this.byClass = /* @__PURE__ */ new Map();
    this.byProto = /* @__PURE__ */ new Map();
  }
  // register(Class, { name, encode, decode }), or register(ClassA, ClassB, ...).
  register(Class, ...rest) {
    if (rest.length > 0 && typeof rest[0] === "function") {
      [Class, ...rest].forEach((each) => this.register(each));
      return this;
    }
    const options = rest[0] || {};
    if (typeof Class !== "function" || !Class.prototype) {
      throw new import_errors.MarshalError("register() takes classes", "XUFA_MARSHAL_ERR_REGISTER");
    }
    const name = options.name === void 0 ? Class.name : options.name;
    if (typeof name !== "string" || name === "") {
      throw new import_errors.MarshalError("A class needs a name to be registered", "XUFA_MARSHAL_ERR_REGISTER");
    }
    const taken = this.byName.get(name);
    if (taken && taken.Class !== Class) {
      throw new import_errors.MarshalError(
        `Another class is registered as ${name}: give this one another name ({ name })`,
        "XUFA_MARSHAL_ERR_REGISTER"
      );
    }
    const encode = options.encode || (typeof Class[ENCODE] === "function" ? (v) => Class[ENCODE](v) : null);
    const decode = options.decode || (typeof Class[DECODE] === "function" ? (d) => Class[DECODE](d) : null);
    if (Boolean(encode) !== Boolean(decode)) {
      throw new import_errors.MarshalError(`${name}: encode and decode go together`, "XUFA_MARSHAL_ERR_REGISTER");
    }
    const error = Class === Error || Class.prototype instanceof Error;
    const entry = { Class, name, encode, decode, error };
    this.byName.set(name, entry);
    this.byClass.set(Class, entry);
    this.byProto.set(Class.prototype, entry);
    return this;
  }
  unregister(Class) {
    const entry = this.byClass.get(Class);
    if (entry) {
      this.byClass.delete(Class);
      this.byProto.delete(Class.prototype);
      this.byName.delete(entry.name);
    }
    return this;
  }
  has(Class) {
    return this.byClass.has(Class);
  }
}
const registry = new Registry();

},
"@xufa/marshal/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/marshal","version":"0.1.0"};
},
"@xufa/router/index.js": function (module, exports, require) {
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var router_exports = {};
__export(router_exports, {
  BAD_URL: () => BAD_URL,
  FOUND: () => FOUND,
  MAX_PARAM_LENGTH: () => MAX_PARAM_LENGTH,
  NullObject: () => import_constraints.NullObject,
  Router: () => Router,
  default: () => router_default,
  httpMethods: () => httpMethods,
  isSafeRegex: () => import_safe_regex.isSafeRegex,
  "module.exports": () => createRouter,
  removeDuplicateSlashes: () => removeDuplicateSlashes,
  safeDecodeURI: () => __safeDecodeURI,
  safeDecodeURIComponent: () => __safeDecodeURIComponent,
  sanitizeUrlPath: () => __sanitizeUrlPath,
  trimLastSlash: () => trimLastSlash
});
module.exports = __toCommonJS(router_exports);
var import_node_http = require("node:http");
var import_node = require("./lib/node.js");
var import_compile = require("./lib/compile.js");
var import_constraints = require("./lib/constraints.js");
var import_pretty_print = require("./lib/pretty-print.js");
var import_safe_regex = require("./lib/safe-regex.js");
var strategies = __toESM(require("./lib/strategies.js"));
var url = __toESM(require("./lib/url.js"));
const { splitEncoded, decodeParam, pathFromAbsoluteURL, removeDuplicateSlashes, trimLastSlash } = url;
const { deepEqualConstraints } = strategies;
const httpMethods = [.../* @__PURE__ */ new Set([...import_node_http.METHODS, "QUERY"])].sort();
const OPTIONAL_PARAM = /(\/:[^/()]*?)\?(\/?)/;
const ESCAPE_REGEXP = /[.*+?^${}()|[\]\\]/g;
const escapeRegExp = (string) => string.replace(ESCAPE_REGEXP, "\\$&");
function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.code = "ERR_ASSERTION";
    throw err;
  }
}
function closingParenthesis(path, index) {
  let depth = 1;
  let i = index;
  while (i < path.length) {
    i += 1;
    if (path.charCodeAt(i) === 92) {
      i += 1;
    } else if (path.charCodeAt(i) === 41) {
      depth -= 1;
    } else if (path.charCodeAt(i) === 40) {
      depth += 1;
    }
    if (depth === 0) return i;
  }
  throw new TypeError(`Invalid regexp expression in "${path}"`);
}
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
const STATIC_INDEX_MIN_COST = 4;
const FOUND = 0;
const BAD_URL = 1;
const MAX_PARAM_LENGTH = 2;
class Router {
  constructor(opts = {}) {
    this._opts = opts;
    if (opts.defaultRoute) assert(typeof opts.defaultRoute === "function", "The default route must be a function");
    if (opts.onBadUrl) assert(typeof opts.onBadUrl === "function", "The bad url handler must be a function");
    if (opts.buildPrettyMeta) assert(typeof opts.buildPrettyMeta === "function", "buildPrettyMeta must be a function");
    if (opts.querystringParser) {
      assert(typeof opts.querystringParser === "function", "querystringParser must be a function");
    }
    this.defaultRoute = opts.defaultRoute || null;
    this.onBadUrl = opts.onBadUrl || null;
    this.buildPrettyMeta = opts.buildPrettyMeta || defaultBuildPrettyMeta;
    this.querystringParser = opts.querystringParser || defaultQuerystringParser;
    this.caseSensitive = opts.caseSensitive === void 0 ? true : opts.caseSensitive;
    this.ignoreTrailingSlash = opts.ignoreTrailingSlash || false;
    this.ignoreDuplicateSlashes = opts.ignoreDuplicateSlashes || false;
    this.maxParamLength = opts.maxParamLength || 100;
    this.onMaxParamLength = opts.onMaxParamLength || null;
    this.allowUnsafeRegex = opts.allowUnsafeRegex || false;
    this.useSemicolonDelimiter = opts.useSemicolonDelimiter || false;
    this.constrainer = new import_constraints.Constrainer(opts.constraints);
    this.routes = [];
    this.trees = /* @__PURE__ */ Object.create(null);
    this.staticRoutes = /* @__PURE__ */ Object.create(null);
    this.treeGET = null;
    this.staticGET = null;
    this.staticIndexDirty = false;
    this.tiers = /* @__PURE__ */ Object.create(null);
    this.tierGET = null;
    this.result = { status: FOUND, handler: null, store: null, params: null, querystring: "", path: "" };
  }
  on(method, path, opts, handler, store) {
    let options = opts;
    let fn = handler;
    let data = store;
    if (typeof opts === "function") {
      if (handler !== void 0) data = handler;
      fn = opts;
      options = {};
    }
    assert(typeof path === "string", "Path should be a string");
    assert(path.length > 0, "The path could not be empty");
    assert(path[0] === "/" || path[0] === "*", "The first character of a path should be `/` or `*`");
    assert(typeof fn === "function", "Handler should be a function");
    const optional = path.match(OPTIONAL_PARAM);
    if (optional) {
      assert(
        path.length === optional.index + optional[0].length,
        "Optional Parameter needs to be the last parameter of the path"
      );
      this.on(method, path.replace(OPTIONAL_PARAM, "$1$2"), options, fn, data);
      this.on(method, path.replace(OPTIONAL_PARAM, "$2") || "/", options, fn, data);
      return;
    }
    let normalized = path;
    if (this.ignoreDuplicateSlashes) normalized = removeDuplicateSlashes(normalized);
    if (this.ignoreTrailingSlash) normalized = trimLastSlash(normalized);
    const methods = Array.isArray(method) ? method : [method];
    for (const m of methods) {
      assert(typeof m === "string", "Method should be a string");
      assert(httpMethods.includes(m), `Method '${m}' is not an http method.`);
      this.insert(m, normalized, options || {}, fn, data);
    }
  }
  insert(method, path, opts, handler, store) {
    let constraints = {};
    if (opts.constraints !== void 0) {
      assert(typeof opts.constraints === "object" && opts.constraints !== null, "Constraints should be an object");
      if (Object.keys(opts.constraints).length !== 0) constraints = opts.constraints;
    }
    this.constrainer.validateConstraints(constraints);
    this.constrainer.noteUsage(constraints);
    if (this.trees[method] === void 0) {
      this.trees[method] = new import_node.StaticNode("/");
      this.staticRoutes[method] = { map: /* @__PURE__ */ new Map(), lengths: new Uint8Array(256) };
    }
    if (path === "*" && this.trees[method].prefix.length !== 0) {
      const root = this.trees[method];
      this.trees[method] = new import_node.StaticNode("");
      this.trees[method].setStaticChild("/", root);
    }
    if (method === "GET") {
      this.treeGET = this.trees.GET;
      this.staticGET = this.staticRoutes.GET;
    }
    const walk = this.walkPattern(path, this.trees[method], true);
    let { pattern } = walk;
    if (!this.caseSensitive) pattern = pattern.toLowerCase();
    if (pattern === "*") pattern = "/*";
    for (const existing of this.routes) {
      if (existing.method === method && existing.pattern === pattern && deepEqualConstraints(existing.opts.constraints || {}, constraints)) {
        throw new Error(
          `Method '${method}' already declared for route '${pattern}' with constraints '${JSON.stringify(constraints)}'`
        );
      }
    }
    const route = { method, path, pattern, params: walk.params, opts, handler, store };
    this.routes.push(route);
    walk.node.addRoute(route, this.constrainer);
    if (walk.params.length === 0 && walk.node.kind === import_node.NODE_TYPES.STATIC && path !== "*") {
      route.staticKey = walk.staticKey;
    }
    this.staticIndexDirty = true;
    this.tiers = /* @__PURE__ */ Object.create(null);
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
        i += 1;
        continue;
      }
      const isParam = pattern.charCodeAt(i) === 58 && pattern.charCodeAt(i + 1) !== 58;
      const isWildcard = pattern.charCodeAt(i) === 42;
      if (isParam || isWildcard || i === pattern.length && i !== parentIndex) {
        let staticPath = pattern.slice(parentIndex, i);
        if (!this.caseSensitive) staticPath = staticPath.toLowerCase();
        staticPath = staticPath.replaceAll("::", ":").replaceAll("%", "%25");
        node = create ? node.createStaticChild(staticPath) : node.getStaticChild(staticPath);
        if (node === null) return null;
        staticKey += staticPath;
      }
      if (isParam) {
        let isRegexNode = false;
        let paramSafe = true;
        let backtrack = "";
        const regexps = [];
        let nodePatternParts = "";
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
              if (!this.allowUnsafeRegex) assert((0, import_safe_regex.isSafeRegex)(new RegExp(source)), `The regex '${source}' is not safe!`);
              regexps.push(trimRegExp(source));
              j = end + 1;
              paramSafe = true;
            } else {
              regexps.push(paramSafe ? "(.*?)" : `(${backtrack}|(?:(?!${backtrack}).)*)`);
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
              staticPart = staticPart.replaceAll("::", ":").replaceAll("%", "%25");
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
              const regex = isRegexNode ? new RegExp(`^${regexps.join("")}$`) : null;
              node = create ? node.createParametricChild(regex, staticPart || null, nodePath) : node.getParametricChild(regex, staticPart || null, nodePath);
              if (node === null) return null;
              parentIndex = i + 1;
              break;
            }
          }
        }
      } else if (isWildcard) {
        params.push("*");
        node = create ? node.createWildcardChild() : node.getWildcardChild();
        if (node === null) return null;
        parentIndex = i + 1;
        if (i !== pattern.length - 1) throw new Error("Wildcard must be the last character in the route");
      }
    }
    return { node, params, pattern, staticKey };
  }
  hasRoute(method, path, constraints) {
    return this.findRoute(method, path, constraints) !== null;
  }
  findRoute(method, path, constraints = {}) {
    if (this.trees[method] === void 0) return null;
    const walk = this.walkPattern(path, this.trees[method], false);
    if (walk === null) return null;
    let { pattern } = walk;
    if (!this.caseSensitive) pattern = pattern.toLowerCase();
    for (const route of this.routes) {
      if (route.method === method && route.pattern === pattern && deepEqualConstraints(route.opts.constraints || {}, constraints)) {
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
    this.trees = /* @__PURE__ */ Object.create(null);
    this.staticRoutes = /* @__PURE__ */ Object.create(null);
    this.treeGET = null;
    this.staticGET = null;
    this.staticIndexDirty = false;
    this.tiers = /* @__PURE__ */ Object.create(null);
    this.tierGET = null;
    this.routes = [];
  }
  off(method, path, constraints) {
    assert(typeof path === "string", "Path should be a string");
    assert(path.length > 0, "The path could not be empty");
    assert(path[0] === "/" || path[0] === "*", "The first character of a path should be `/` or `*`");
    assert(
      constraints === void 0 || typeof constraints === "object" && !Array.isArray(constraints) && constraints !== null,
      "Constraints should be an object or undefined."
    );
    const optional = path.match(OPTIONAL_PARAM);
    if (optional) {
      assert(
        path.length === optional.index + optional[0].length,
        "Optional Parameter needs to be the last parameter of the path"
      );
      this.off(method, path.replace(OPTIONAL_PARAM, "$1$2"), constraints);
      this.off(method, path.replace(OPTIONAL_PARAM, "$2") || "/", constraints);
      return;
    }
    let normalized = path;
    if (this.ignoreDuplicateSlashes) normalized = removeDuplicateSlashes(normalized);
    if (this.ignoreTrailingSlash) normalized = trimLastSlash(normalized);
    const methods = Array.isArray(method) ? method : [method];
    for (const m of methods) {
      assert(typeof m === "string", "Method should be a string");
      assert(httpMethods.includes(m), `Method '${m}' is not an http method.`);
      const keep = (route) => m !== route.method || normalized !== route.path || constraints !== void 0 && !deepEqualConstraints(constraints, route.opts.constraints || {});
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
    if (method === "GET") {
      root = this.treeGET;
      statics = this.staticGET;
    } else {
      root = this.trees[method];
      statics = this.staticRoutes[method];
    }
    if (root == null) return null;
    if (rawUrl === "/" && root.prefixLength === 1 && root.isLeafNode) {
      const handle = root.handlerStorage.getMatchingHandler(derivedConstraints);
      if (handle !== null) return this.found(handle, "");
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
    let querystring = "";
    let decodeParams = false;
    const urlLength = path.length;
    let i = 1;
    if (urlLength < NATIVE_SCAN_LENGTH) {
      for (; i < urlLength; i += 1) {
        const code = path.charCodeAt(i);
        if (code === 63 || code === 35 || code === 37 || code === 59 && this.useSemicolonDelimiter) break;
      }
    } else {
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
    if (pathLength === root.prefixLength && root.isLeafNode) {
      const handle = root.handlerStorage.getMatchingHandler(derivedConstraints);
      if (handle !== null) return this.found(handle, querystring);
    }
    const staticNode = pathLength > 255 || statics.lengths[pathLength] === 1 ? statics.map.get(path) : void 0;
    if (staticNode !== void 0) {
      const handle = staticNode.handlerStorage.getMatchingHandler(derivedConstraints);
      if (handle !== null) return this.found(handle, querystring);
    }
    let tier = method === "GET" ? this.tierGET : this.tiers[method];
    if (tier == null) tier = this.newTier(method);
    const status = tier.walk !== null || (tier.walks += 1) > Router.COMPILE_AFTER && this.compileTier(tier, root) ? tier.walk(path, originPath, pathLength, derivedConstraints, decodeParams, result) : this.walkTree(root, path, originPath, derivedConstraints, decodeParams, result);
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
    for (; ; ) {
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
      for (; ; ) {
        if (currentNode.kind === import_node.NODE_TYPES.STATIC) {
          pathIndex += currentNode.prefixLength;
          break;
        }
        if (currentNode.kind === import_node.NODE_TYPES.WILDCARD) {
          const param2 = originPath.slice(pathIndex);
          params.push(decodeParams ? decodeParam(param2) : param2);
          pathIndex = pathLen;
          break;
        }
        let paramEnd = originPath.indexOf("/", pathIndex);
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
              if ((matched[i] ?? "").length > maxParamLength) {
                maxParamLengthExceeded = true;
                failed = true;
                break;
              }
            }
            if (!failed) for (let i = 1; i < matched.length; i += 1) params.push(matched[i] ?? "");
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
    if (method === "GET") this.tierGET = tier;
    return tier;
  }
  // Compiles the walk of a tree; false (and not tried again) when the tree is too large for it.
  compileTier(tier, root) {
    tier.walk = (0, import_compile.compileTree)(root, this.maxParamLength);
    if (tier.walk !== null) return true;
    tier.walks = -Infinity;
    return false;
  }
  // The static routes reached faster by their path than by the tree: the ones whose walk goes through several nodes
  // or by nodes with parameters, which the walk would push to try later.
  buildStaticIndex() {
    this.staticIndexDirty = false;
    for (const method of Object.keys(this.staticRoutes)) {
      this.staticRoutes[method] = { map: /* @__PURE__ */ new Map(), lengths: new Uint8Array(256) };
    }
    for (const route of this.routes) {
      if (route.staticKey === void 0 || this.trees[route.method] === void 0) continue;
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
    result.querystring = "";
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
    if (path === "/" && this.querystringParser === defaultQuerystringParser) {
      const root = method === "GET" ? this.treeGET : this.trees[method];
      if (root != null && root.prefixLength === 1 && root.isLeafNode) {
        const handle = root.handlerStorage.getMatchingHandler(derivedConstraints);
        if (handle !== null) {
          return {
            handler: handle.handler,
            store: handle.store,
            params: handle.createParams(EMPTY),
            searchParams: new import_constraints.NullObject()
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
      searchParams: result.querystring.length === 0 && this.querystringParser === defaultQuerystringParser ? new import_constraints.NullObject() : this.querystringParser(result.querystring)
    };
  }
  lookup(req, res, ctx, done) {
    let context = ctx;
    let callback = done;
    if (typeof ctx === "function") {
      callback = ctx;
      context = void 0;
    }
    if (callback === void 0) {
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
    return void 0;
  }
  callHandler(handle, req, res, ctx) {
    if (handle === null) {
      if (this.defaultRoute !== null) {
        return ctx === void 0 ? this.defaultRoute(req, res) : this.defaultRoute.call(ctx, req, res);
      }
      res.statusCode = 404;
      res.end();
      return void 0;
    }
    return ctx === void 0 ? handle.handler(req, res, handle.params, handle.store, handle.searchParams) : handle.handler.call(ctx, req, res, handle.params, handle.store, handle.searchParams);
  }
  prettyPrint(options = {}) {
    const opts = { ...options, buildPrettyMeta: this.buildPrettyMeta.bind(this) };
    let tree = null;
    if (opts.method === void 0) {
      const { version, host, ...custom } = this.constrainer.strategies;
      custom[strategies.httpMethod.name] = strategies.httpMethod;
      const merged = new Router({ ...this._opts, constraints: custom });
      const routes = this.routes.map((route) => ({
        ...route,
        method: "MERGED",
        opts: { constraints: { ...route.opts.constraints, [strategies.httpMethod.name]: route.method } }
      }));
      for (const route of routes) merged.insertMerged(route);
      tree = merged.trees.MERGED;
    } else {
      tree = this.trees[opts.method];
    }
    if (tree == null) return "(empty tree)";
    return (0, import_pretty_print.prettyPrintTree)(tree, opts);
  }
  insertMerged(route) {
    if (this.trees.MERGED === void 0) {
      this.trees.MERGED = new import_node.StaticNode("/");
      this.staticRoutes.MERGED = { map: /* @__PURE__ */ new Map(), lengths: new Uint8Array(256) };
    }
    if (route.path === "*" && this.trees.MERGED.prefix.length !== 0) {
      const root = this.trees.MERGED;
      this.trees.MERGED = new import_node.StaticNode("");
      this.trees.MERGED.setStaticChild("/", root);
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
function firstDelimiter(path, semicolon) {
  let end = path.length;
  let index = path.indexOf("?", 1);
  if (index !== -1) end = index;
  index = path.indexOf("%", 1);
  if (index !== -1 && index < end) end = index;
  index = path.indexOf("#", 1);
  if (index !== -1 && index < end) end = index;
  if (semicolon) {
    index = path.indexOf(";", 1);
    if (index !== -1 && index < end) end = index;
  }
  return end;
}
function addQueryValue(out, key, value) {
  const existing = out[key];
  if (existing === void 0) out[key] = value;
  else if (Array.isArray(existing)) existing.push(value);
  else out[key] = [existing, value];
}
function defaultQuerystringParser(query) {
  const out = new import_constraints.NullObject();
  const length = query.length;
  if (length === 0) return out;
  if (query.charCodeAt(0) === 63 || query.indexOf("%") !== -1 || query.indexOf("+") !== -1 || !query.isWellFormed()) {
    for (const [key, value] of new URLSearchParams(query)) addQueryValue(out, key, value);
    return out;
  }
  let start = 0;
  while (start <= length) {
    let end = query.indexOf("&", start);
    if (end === -1) end = length;
    if (end > start) {
      const equals = query.indexOf("=", start);
      if (equals === -1 || equals > end) addQueryValue(out, query.slice(start, end), "");
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
Router.COMPILE_AFTER = 16;
var router_default = createRouter;
createRouter.Router = Router;
createRouter.httpMethods = httpMethods;
createRouter.FOUND = FOUND;
createRouter.BAD_URL = BAD_URL;
createRouter.MAX_PARAM_LENGTH = MAX_PARAM_LENGTH;
createRouter.sanitizeUrlPath = Router.sanitizeUrlPath;
const __sanitizeUrlPath = createRouter.sanitizeUrlPath;
createRouter.removeDuplicateSlashes = removeDuplicateSlashes;
createRouter.trimLastSlash = trimLastSlash;
createRouter.safeDecodeURI = url.safeDecodeURI;
const __safeDecodeURI = createRouter.safeDecodeURI;
createRouter.safeDecodeURIComponent = url.safeDecodeURIComponent;
const __safeDecodeURIComponent = createRouter.safeDecodeURIComponent;
createRouter.isSafeRegex = import_safe_regex.isSafeRegex;
createRouter.NullObject = import_constraints.NullObject;

},
"@xufa/router/lib/compile.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var compile_exports = {};
__export(compile_exports, {
  compileTree: () => compileTree
});
module.exports = __toCommonJS(compile_exports);
var import_url = require("./url.js");
const MAX_NODES = 2e4;
const MAX_CHUNK = 24e3;
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
  const name = (prefix) => `${prefix}${names += 1}`;
  function extract(piece, at, params) {
    const fn = name("f");
    const args = (/^[a-z]+\d+$/.test(at) ? [at] : []).concat(params);
    const signature = ["path", "originPath", "len", "dc", "decode", "r"].concat(args).join(", ");
    functions.push(`function ${fn}(${signature}) {
let exceeded = false;
${piece}return exceeded ? 2 : 1;
}
`);
    const status = name("s");
    return `{
const ${status} = ${fn}(${signature});
if (${status} === 0) return 0;
if (${status} === 2) exceeded = true;
}
`;
  }
  function body(node, at, params) {
    nodes += 1;
    let leaf = "";
    if (node.isLeafNode) {
      const h = name("h");
      leaf = `if (${at} === len) {
const ${h} = ${ref(node.handlerStorage)}.getMatchingHandler(dc);
if (${h} !== null) {
r.handler = ${h}.handler;
r.store = ${h}.store;
r.params = ${h}.createParamsArgs(${params.join(", ")});
return 0;
}
}
`;
    }
    const cases = [];
    const others = [];
    const codes = node.staticChildrenCharCodes;
    if (codes !== void 0) {
      for (let i = 0; i < codes.length; i += 1) {
        cases.push({ code: codes[i], text: staticChild(node.staticChildrenNodes[i], at, params) });
      }
    }
    if (node.parametricChildren !== void 0) {
      for (const child of node.parametricChildren) others.push({ text: parametricChild(child, at, params) });
    }
    if (node.wildcardChild != null) others.push({ text: wildcardChild(node.wildcardChild, at, params) });
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
      out += `switch (path.charCodeAt(${at})) {
`;
      for (const piece of cases) out += `case ${piece.code}: {
${piece.text}break;
}
`;
      out += "}\n";
    }
    for (const piece of others) out += piece.text;
    return out;
  }
  function staticChild(node, at, params) {
    const { prefix } = node;
    const end = name("i");
    let test = "";
    if (prefix.length > MAX_INLINE_PREFIX) {
      test = `path.startsWith(${JSON.stringify(prefix)}, ${at})`;
    } else if (prefix.length > 1) {
      const checks = [];
      for (let i = 1; i < prefix.length; i += 1)
        checks.push(`path.charCodeAt(${at} + ${i}) === ${prefix.charCodeAt(i)}`);
      test = checks.join(" && ");
    }
    const code2 = `{
const ${end} = ${at} + ${prefix.length};
${body(node, end, params)}}
`;
    return test === "" ? code2 : `if (${test}) ${code2}`;
  }
  function parametricChild(node, at, params) {
    const end = name("e");
    const value = name("v");
    let out = `{
let ${end} = originPath.indexOf('/', ${at});
if (${end} === -1) ${end} = len;
let ${value} = originPath.slice(${at}, ${end});
if (decode) ${value} = decodeParam(${value});
`;
    if (node.isRegex) {
      const groups = new RegExp(`${node.regex.source}|`).exec("").length - 1;
      const match = name("m");
      const found = [];
      for (let i = 1; i <= groups; i += 1) found.push(name("p"));
      out += `const ${match} = ${ref(node.regex)}.exec(${value});
if (${match} !== null) {
` + found.map((p, i) => `const ${p} = ${match}[${i + 1}] ?? '';
`).join("") + `if (${found.map((p) => `${p}.length > max`).join(" || ") || "false"}) exceeded = true;
else {
${body(node, end, params.concat(found))}}
}
`;
    } else {
      out += `if (${value}.length > max) exceeded = true;
else {
${body(node, end, params.concat(value))}}
`;
    }
    return `${out}}
`;
  }
  function wildcardChild(node, at, params) {
    const value = name("v");
    return `{
let ${value} = originPath.slice(${at});
if (decode) ${value} = decodeParam(${value});
${body(node, "len", params.concat(value))}}
`;
  }
  const code = body(root, String(root.prefix.length), []);
  if (nodes > MAX_NODES) return null;
  const source = `${refs.map((_, i) => `const R${i} = refs[${i}];`).join("\n")}
${functions.join("")}return function walk(path, originPath, len, dc, decode, r) {
let exceeded = false;
${code}return exceeded ? 2 : 1;
};`;
  return new Function("refs", "max", "decodeParam", source)(refs, maxParamLength, import_url.decodeParam);
}

},
"@xufa/router/lib/constraints.js": function (module, exports, require) {
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var constraints_exports = {};
__export(constraints_exports, {
  Constrainer: () => Constrainer,
  HandlerStorage: () => HandlerStorage,
  NullObject: () => NullObject,
  compileParamsFactory: () => compileParamsFactory
});
module.exports = __toCommonJS(constraints_exports);
var strategies = __toESM(require("./strategies.js"));
class Constrainer {
  constructor(customStrategies) {
    this.strategies = { version: strategies.version, host: strategies.host };
    this.strategiesInUse = /* @__PURE__ */ new Set();
    this.asyncStrategiesInUse = /* @__PURE__ */ new Set();
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
    if (strategy === void 0) return false;
    return Boolean(strategy.isCustom) || this.isStrategyUsed(name);
  }
  addConstraintStrategy(strategy) {
    if (typeof strategy.name !== "string" || strategy.name === "") throw new Error("strategy.name is required.");
    if (typeof strategy.storage !== "function") throw new Error("strategy.storage function is required.");
    if (typeof strategy.deriveConstraint !== "function") {
      throw new Error("strategy.deriveConstraint function is required.");
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
    const constraints = this.deriveSync === null ? void 0 : this.deriveSync(req, ctx);
    if (done === void 0) return constraints;
    this.deriveAsyncConstraints(constraints, req, ctx, done);
    return void 0;
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
      if (value === void 0)
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
        if (key === "version" && !strategy.isCustom) values.version = req.headers["accept-version"];
        else if (key === "host" && !strategy.isCustom) values.host = req.headers.host || req.headers[":authority"];
        else values[key] = strategy.deriveConstraint(req, ctx);
      }
      return values;
    };
  }
}
const NullObject = function NullObject2() {
};
NullObject.prototype = /* @__PURE__ */ Object.create(null);
function compileParamsFactory(names) {
  const lines = names.map((name, i) => `params[${JSON.stringify(name)}] = values[${i}];`);
  return new Function(
    "NullObject",
    `return function createParams(values) {
  const params = new NullObject();
  ${lines.join("\n  ")}
  return params;
}`
  )(NullObject);
}
function compileParamsArgsFactory(names) {
  const args = names.map((_, i) => `v${i}`);
  const lines = names.map((name, i) => `params[${JSON.stringify(name)}] = v${i};`);
  return new Function(
    "NullObject",
    `return function createParamsArgs(${args.join(", ")}) {
  const params = new NullObject();
  ${lines.join("\n  ")}
  return params;
}`
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
    if (derivedConstraints === void 0) return this.unconstrainedHandler;
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
      createParamsArgs: compileParamsArgsFactory(route.params)
    };
    handler._createParamsObject = handler.createParams;
    const names = Object.keys(constraints);
    if (names.length === 0) this.unconstrainedHandler = handler;
    for (const name of names) {
      if (!this.constraints.includes(name)) {
        if (name === "version") this.constraints.unshift(name);
        else this.constraints.push(name);
      }
    }
    const merged = names.includes(strategies.httpMethod.name);
    if (!merged && this.handlers.length >= MAX_HANDLERS) {
      throw new Error(
        "find-my-way supports a maximum of 31 route handlers per node when there are constraints, limit reached"
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
        if (value !== void 0) {
          store.set(value, (store.get(value) || 0) | 1 << i);
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
        if (value === void 0) {
          candidates &= check.unconstrained;
        } else {
          const matches = check.store.get(value) || 0;
          candidates &= check.mustMatch ? matches : matches | check.unconstrained;
        }
        if (candidates === 0) return null;
      }
      for (let i = 0; i < mustNotBeDerived.length; i += 1) {
        if (derived[mustNotBeDerived[i]] !== void 0) return null;
      }
      return handlers[31 - Math.clz32(candidates)];
    };
  }
}

},
"@xufa/router/lib/node.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var node_exports = {};
__export(node_exports, {
  NODE_TYPES: () => NODE_TYPES,
  ParametricNode: () => ParametricNode,
  StaticNode: () => StaticNode,
  WildcardNode: () => WildcardNode
});
module.exports = __toCommonJS(node_exports);
var import_constraints = require("./constraints.js");
const matchFirst = () => true;
function compilePrefixMatch(prefix) {
  if (prefix.length <= 1) return matchFirst;
  const checks = [];
  for (let i = 1; i < prefix.length; i += 1) checks.push(`path.charCodeAt(i + ${i}) === ${prefix.charCodeAt(i)}`);
  return new Function("path", "i", `return ${checks.join(" && ")}`);
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
    if (this.handlerStorage === null) this.handlerStorage = new import_constraints.HandlerStorage();
    this.isLeafNode = true;
    this.routes.push(route);
    this.handlerStorage.addHandler(constrainer, route);
  }
}
class ParentNode extends Node {
  constructor() {
    super();
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
    let child = index === -1 ? void 0 : this.staticChildrenNodes[index];
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
    this.nodePaths = /* @__PURE__ */ new Set([nodePath]);
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

},
"@xufa/router/lib/pretty-print.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var pretty_print_exports = {};
__export(pretty_print_exports, {
  prettyPrintTree: () => prettyPrintTree
});
module.exports = __toCommonJS(pretty_print_exports);
var import_strategies = require("./strategies.js");
const treeData = /* @__PURE__ */ Symbol("treeData");
function printObjectTree(obj, parentPrefix = "") {
  let tree = "";
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const value = obj[key];
    const isLast = i === keys.length - 1;
    const nodePrefix = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
    const childPrefix = isLast ? "    " : "\u2502   ";
    const nodeData = value[treeData] || "";
    tree += `${parentPrefix}${nodePrefix}${key}${nodeData.replaceAll("\n", `
${parentPrefix}${childPrefix}`)}
`;
    tree += printObjectTree(value, parentPrefix + childPrefix);
  }
  return tree;
}
function functionName(fn) {
  const name = (fn.name || "").replace("bound", "").trim();
  return `${name || "anonymous"}()`;
}
function parseMeta(meta) {
  if (Array.isArray(meta)) return meta.map(parseMeta);
  if (typeof meta === "symbol") return meta.toString();
  if (typeof meta === "function") return functionName(meta);
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
    if (value !== void 0 && value !== null) out[key.toString()] = JSON.stringify(parseMeta(value));
  }
  return out;
}
function serializeMetaData(meta) {
  let out = "";
  for (const [key, value] of Object.entries(meta)) out += `
\u2022 (${key}) ${value}`;
  return out;
}
function normalizeRoute(route) {
  const constraints = { ...route.opts.constraints };
  const method = constraints[import_strategies.httpMethod.name];
  delete constraints[import_strategies.httpMethod.name];
  return { ...route, method, opts: { constraints } };
}
function serializeConstraints(constraints) {
  return JSON.stringify(constraints, (key, value) => value instanceof RegExp ? value.toString() : value);
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
      (other) => (0, import_strategies.deepEqualConstraints)(route.opts.constraints || {}, other.opts.constraints || {}) && sameMeta(route.metaData, other.metaData)
    );
    if (same) same.method += `, ${route.method}`;
    else merged.push(route);
  }
  return merged;
}
function serializeNode(node, prefix, options) {
  let routes = node.routes;
  if (options.method === void 0) routes = routes.map(normalizeRoute);
  routes = routes.map((route) => ({ ...route, metaData: routeMetaData(route, options) }));
  if (options.method === void 0) routes = mergeSimilarRoutes(routes);
  return routes.map(serializeRoute).join(`
${prefix}`);
}
function buildObjectTree(node, tree, prefix, options) {
  let subtree = tree;
  let childPrefixBase = prefix;
  if (node.isLeafNode || options.commonPrefix !== false) {
    const key = prefix || "(empty root node)";
    subtree = {};
    tree[key] = subtree;
    if (node.isLeafNode) subtree[treeData] = serializeNode(node, key, options);
    childPrefixBase = "";
  }
  if (node.staticChildrenNodes) {
    for (const child of node.staticChildrenNodes)
      buildObjectTree(child, subtree, childPrefixBase + child.prefix, options);
  }
  if (node.parametricChildren) {
    for (const child of node.parametricChildren) {
      buildObjectTree(child, subtree, childPrefixBase + Array.from(child.nodePaths).join("|"), options);
    }
  }
  if (node.wildcardChild) buildObjectTree(node.wildcardChild, subtree, "*", options);
}
function prettyPrintTree(root, options) {
  const tree = {};
  buildObjectTree(root, tree, root.prefix, options);
  return printObjectTree(tree);
}

},
"@xufa/router/lib/safe-regex.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var safe_regex_exports = {};
__export(safe_regex_exports, {
  isSafeRegex: () => isSafeRegex
});
module.exports = __toCommonJS(safe_regex_exports);
const RANGE = /^\{(?:\d+,\d*|\d*[2-9]\d*)\}/;
const isQuantifier = (source, i) => {
  const ch = source[i];
  if (ch === "*" || ch === "+") return true;
  if (ch === "?") return false;
  if (ch === "{") return RANGE.test(source.slice(i, i + 24));
  return false;
};
function isSafeRegex(regex) {
  const source = regex instanceof RegExp ? regex.source : String(regex);
  const stack = [{ quantified: false }];
  let inClass = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "\\") {
      i += 1;
      if (isQuantifier(source, i + 1)) stack[stack.length - 1].quantified = true;
      continue;
    }
    if (inClass) {
      if (ch === "]") {
        inClass = false;
        if (isQuantifier(source, i + 1)) stack[stack.length - 1].quantified = true;
      }
      continue;
    }
    if (ch === "[") {
      inClass = true;
    } else if (ch === "(") {
      stack.push({ quantified: false });
    } else if (ch === ")") {
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

},
"@xufa/router/lib/strategies.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var strategies_exports = {};
__export(strategies_exports, {
  HostStorage: () => HostStorage,
  SemVerStore: () => SemVerStore,
  deepEqualConstraints: () => deepEqualConstraints,
  host: () => host,
  httpMethod: () => httpMethod,
  version: () => version
});
module.exports = __toCommonJS(strategies_exports);
function equalValue(a, b) {
  if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags;
  return a === b;
}
function SemVerStore() {
  if (!(this instanceof SemVerStore)) return new SemVerStore();
  this.store = /* @__PURE__ */ new Map();
  this.maxMajor = 0;
  this.maxMinors = {};
  this.maxPatches = {};
}
SemVerStore.prototype.set = function set(version2, value) {
  if (typeof version2 !== "string") throw new TypeError("Version should be a string");
  const parts = version2.split(".", 3);
  if (Number.isNaN(Number(parts[0]))) throw new TypeError("Major version must be a numeric value");
  const major = Number(parts[0]);
  const minor = Number(parts[1]) || 0;
  const patch = Number(parts[2]) || 0;
  if (major >= this.maxMajor) {
    this.maxMajor = major;
    this.store.set("x", value);
    this.store.set("*", value);
    this.store.set("x.x", value);
    this.store.set("x.x.x", value);
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
SemVerStore.prototype.get = function get(version2) {
  return this.store.get(version2);
};
const version = {
  name: "version",
  mustMatchWhenDerived: true,
  storage: SemVerStore,
  deriveConstraint: (req) => req.headers["accept-version"],
  validate(value) {
    if (typeof value !== "string") throw new TypeError("Version should be a string");
  }
};
function HostStorage() {
  const hosts = /* @__PURE__ */ new Map();
  const regexHosts = [];
  const regexCache = /* @__PURE__ */ new Map();
  return {
    get(host2) {
      const exact = hosts.get(host2);
      if (exact) return exact;
      if (regexHosts.length === 0) return void 0;
      if (regexCache.has(host2)) return regexCache.get(host2);
      for (const entry of regexHosts) {
        if (entry.host.test(host2)) {
          regexCache.set(host2, entry.value);
          return entry.value;
        }
      }
      regexCache.set(host2, void 0);
      return void 0;
    },
    set(host2, value) {
      if (host2 instanceof RegExp) {
        regexHosts.push({ host: new RegExp(host2.source, host2.flags.replace(/[gy]/g, "")), value });
        regexCache.clear();
      } else {
        hosts.set(host2, value);
      }
    }
  };
}
const host = {
  name: "host",
  mustMatchWhenDerived: false,
  storage: HostStorage,
  deriveConstraint: (req) => req.headers.host || req.headers[":authority"],
  validate(value) {
    if (typeof value !== "string" && Object.prototype.toString.call(value) !== "[object RegExp]") {
      throw new TypeError("Host should be a string or a RegExp");
    }
  }
};
const httpMethod = {
  name: "__xufa_router_http_method__",
  storage() {
    const handlers = /* @__PURE__ */ new Map();
    return {
      get: (type) => handlers.get(type) || null,
      set: (type, value) => handlers.set(type, value)
    };
  },
  deriveConstraint: (req) => req.method,
  mustMatchWhenDerived: true
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

},
"@xufa/router/lib/url.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var url_exports = {};
__export(url_exports, {
  decodeParam: () => decodeParam,
  pathFromAbsoluteURL: () => pathFromAbsoluteURL,
  removeDuplicateSlashes: () => removeDuplicateSlashes,
  safeDecodeURI: () => safeDecodeURI,
  safeDecodeURIComponent: () => decodeParam,
  splitEncoded: () => splitEncoded,
  splitURL: () => splitURL,
  trimLastSlash: () => trimLastSlash
});
module.exports = __toCommonJS(url_exports);
const RESERVED = new Uint8Array(768);
for (const [hex, char] of [
  ["23", "#"],
  ["24", "$"],
  ["25", "%"],
  ["26", "&"],
  ["2B", "+"],
  ["2b", "+"],
  ["2C", ","],
  ["2c", ","],
  ["2F", "/"],
  ["2f", "/"],
  ["3A", ":"],
  ["3a", ":"],
  ["3B", ";"],
  ["3b", ";"],
  ["3D", "="],
  ["3d", "="],
  ["3F", "?"],
  ["3f", "?"],
  ["40", "@"]
]) {
  RESERVED[hex.charCodeAt(0) - 50 << 8 | hex.charCodeAt(1)] = char.charCodeAt(0);
}
function reservedCharCode(high, low) {
  if (high < 50 || high > 52 || low > 255) return 0;
  return RESERVED[high - 50 << 8 | low];
}
const split = { path: "", querystring: "", decodeParams: false };
function splitURL(url, semicolon) {
  const len = url.length;
  let i = 1;
  for (; i < len; i += 1) {
    const code = url.charCodeAt(i);
    if (code === 63 || code === 35 || code === 59 && semicolon) {
      split.path = url.slice(0, i);
      split.querystring = url.slice(i + 1);
      split.decodeParams = false;
      return split;
    }
    if (code === 37) return splitEncoded(url, semicolon, i);
  }
  split.path = url;
  split.querystring = "";
  split.decodeParams = false;
  return split;
}
function splitEncoded(url, semicolon, start) {
  let path = url;
  let querystring = "";
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
    } else if (code === 63 || code === 35 || code === 59 && semicolon) {
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
function decodeParam(param) {
  const first = param.indexOf("%");
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
  if (result === null) throw new URIError("URI malformed");
  return { path: result.path, querystring: result.querystring, shouldDecodeParam: result.decodeParams };
}
function pathFromAbsoluteURL(url) {
  const schemeEnd = url.indexOf("://");
  if (schemeEnd === -1) return url;
  const scheme = url.slice(0, schemeEnd).toLowerCase();
  if (scheme !== "http" && scheme !== "https") return url;
  const authorityStart = schemeEnd + 3;
  let authorityEnd = url.length;
  const pathStart = url.indexOf("/", authorityStart);
  if (pathStart !== -1) authorityEnd = pathStart;
  const queryStart = url.indexOf("?", authorityStart);
  if (queryStart !== -1 && queryStart < authorityEnd) authorityEnd = queryStart;
  if (url.indexOf("#", authorityStart) !== -1 || authorityEnd === authorityStart) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${scheme}:` || parsed.host.length === 0) return null;
  } catch {
    return null;
  }
  if (authorityEnd === url.length) return "/";
  if (authorityEnd === queryStart) return `/${url.slice(queryStart)}`;
  return url.slice(pathStart);
}
const DUPLICATE_SLASHES = /\/\/+/g;
function removeDuplicateSlashes(path) {
  return path.indexOf("//") !== -1 ? path.replace(DUPLICATE_SLASHES, "/") : path;
}
function trimLastSlash(path) {
  return path.length > 1 && path.charCodeAt(path.length - 1) === 47 ? path.slice(0, -1) : path;
}

},
"@xufa/router/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/router","version":"0.1.0"};
},
"@xufa/schema/index.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var schema_exports = {};
__export(schema_exports, {
  AllOf: () => import_types.AllOf,
  AllOfType: () => import_types.AllOfType,
  Any: () => import_types.Any,
  AnyOf: () => import_types.AnyOf,
  AnyOfType: () => import_types.AnyOfType,
  AnyType: () => import_types.AnyType,
  ArrayOf: () => import_types.ArrayOf,
  ArrayOfType: () => import_types.ArrayOfType,
  Boolean: () => import_types.Boolean,
  BooleanType: () => import_types.BooleanType,
  ClosedSchema: () => import_closed_schema.ClosedSchema,
  Conditional: () => import_types.Conditional,
  ConditionalType: () => import_types.ConditionalType,
  Const: () => import_types.Const,
  Enum: () => import_types.Enum,
  EnumType: () => import_types.EnumType,
  Float: () => import_types.Float,
  FloatType: () => import_types.FloatType,
  Integer: () => import_types.Integer,
  IntegerType: () => import_types.IntegerType,
  KeywordType: () => import_types.KeywordType,
  Never: () => import_types.Never,
  NeverType: () => import_types.NeverType,
  Not: () => import_types.Not,
  NotType: () => import_types.NotType,
  OPTIONAL: () => import_builder.OPTIONAL,
  Obj: () => import_types.Obj,
  ObjType: () => import_types.ObjType,
  OneOf: () => import_types.OneOf,
  OneOfType: () => import_types.OneOfType,
  Ref: () => import_types.Ref,
  RefType: () => import_types.RefType,
  Schema: () => import_schema.Schema,
  String: () => import_types.String,
  StringType: () => import_types.StringType,
  ValidateType: () => import_types.ValidateType,
  Values: () => import_types.Values,
  ValuesType: () => import_types.ValuesType,
  When: () => import_types.When,
  WhenType: () => import_types.WhenType,
  ajvKeywords: () => import_ajv_keywords.ajvKeywords,
  allOf: () => import_types.allOf,
  any: () => import_types.any,
  anyOf: () => import_types.anyOf,
  arrOf: () => import_types.arrOf,
  bool: () => import_types.bool,
  builtInFormats: () => import_json_schema.builtInFormats,
  compileErrors: () => import_compile.compileErrors,
  compileFirstError: () => import_compile.compileFirstError,
  compileIsValid: () => import_compile.compileIsValid,
  compileJsonSchema: () => import_json_schema.compileJsonSchema,
  compileJsonSchemaAsync: () => import_json_schema.compileJsonSchemaAsync,
  compileType: () => import_compile.compileType,
  enumt: () => import_types.enumt,
  float: () => import_types.float,
  fromJsonSchema: () => import_json_schema.fromJsonSchema,
  hasErrors: () => import_types.hasErrors,
  inferJsonSchema: () => import_infer.inferJsonSchema,
  inferSchemaCode: () => import_infer.inferSchemaCode,
  int: () => import_types.int,
  isJsonType: () => import_types.isJsonType,
  isOptional: () => import_builder.isOptional,
  loadJsonSchemas: () => import_json_schema.loadJsonSchemas,
  never: () => import_types.never,
  not: () => import_types.not,
  num: () => import_types.num,
  oallOf: () => import_types.oallOf,
  oany: () => import_types.oany,
  oanyOf: () => import_types.oanyOf,
  oarrOf: () => import_types.oarrOf,
  obj: () => import_types.obj,
  obool: () => import_types.obool,
  oenum: () => import_types.oenum,
  oenumt: () => import_types.oenumt,
  ofloat: () => import_types.ofloat,
  oint: () => import_types.oint,
  oneOf: () => import_types.oneOf,
  onot: () => import_types.onot,
  onum: () => import_types.onum,
  oobj: () => import_types.oobj,
  ooneOf: () => import_types.ooneOf,
  ostr: () => import_types.ostr,
  s: () => import_builder.s,
  standaloneCode: () => import_standalone.standaloneCode,
  standaloneJsonSchema: () => import_standalone.standaloneJsonSchema,
  standaloneModule: () => import_standalone.standaloneModule,
  str: () => import_types.str,
  toErrors: () => import_types.toErrors
});
module.exports = __toCommonJS(schema_exports);
var import_closed_schema = require("./lib/closed-schema.js");
var import_compile = require("./lib/compile.js");
var import_json_schema = require("./lib/json-schema.js");
var import_schema = require("./lib/schema.js");
var import_standalone = require("./lib/standalone.js");
var import_ajv_keywords = require("./lib/ajv-keywords.js");
var import_infer = require("./lib/infer.js");
var import_builder = require("./lib/builder.js");
var import_types = require("./lib/types/index.js");

},
"@xufa/schema/lib/ajv-keywords.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var ajv_keywords_exports = {};
__export(ajv_keywords_exports, {
  ajvKeywords: () => ajvKeywords
});
module.exports = __toCommonJS(ajv_keywords_exports);
var import_deep_equal = require("./deep-equal.js");
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const list = (value) => Array.isArray(value) ? value : [value];
function expect(isValid, keyword, what) {
  if (!isValid) {
    throw new Error(`Unsupported JSON Schema: "${keyword}" must be ${what}`);
  }
}
const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === "string");
const TYPEOF_NAMES = ["undefined", "string", "number", "object", "function", "boolean", "symbol", "bigint"];
const CONSTRUCTORS = Object.fromEntries(
  ["Object", "Array", "Function", "Number", "String", "Boolean", "Date", "RegExp", "Map", "Set", "Promise", "Buffer"].filter((name) => typeof globalThis[name] === "function").map((name) => [name, globalThis[name]])
);
function regExpOf(value) {
  const what = 'a string "/pattern/flags" or { pattern, flags }';
  if (typeof value === "string") {
    const match = /^\/(.*)\/([a-z]*)$/s.exec(value);
    expect(match !== null, "regexp", what);
    return new RegExp(match[1], match[2]);
  }
  expect(isObject(value) && typeof value.pattern === "string", "regexp", what);
  return new RegExp(value.pattern, value.flags);
}
const unescapeToken = (token) => token.replace(/~1/g, "/").replace(/~0/g, "~");
function deepPropertySchema(pointer, schema, draft) {
  const tokens = pointer.split("/").slice(1).map(unescapeToken);
  const root = {};
  let current = root;
  tokens.forEach((token, i) => {
    const next = i === tokens.length - 1 ? schema : {};
    current.properties = { [token]: next };
    if (/^[0-9]+$/.test(token)) {
      current.type = ["object", "array"];
      current[draft === "2020-12" ? "prefixItems" : "items"] = [
        ...Array.from({ length: Number(token) }, () => ({})),
        next
      ];
    } else {
      current.type = "object";
    }
    current = next;
  });
  return root;
}
function isDefinedAt(data, tokens) {
  let current = data;
  for (let i = 0; i < tokens.length && current; i += 1) {
    current = current[tokens[i]];
  }
  return current !== void 0;
}
function hasUniqueProperty(data, key) {
  const isItem = (item) => item !== null && typeof item === "object";
  const same = (a, b) => a === b || Number.isNaN(a) && Number.isNaN(b) || a !== null && b !== null && typeof a === "object" && typeof b === "object" && (0, import_deep_equal.deepEqual)(a, b);
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
  const primitives = /* @__PURE__ */ new Set();
  const objects = [];
  return data.every((item) => {
    if (!isItem(item)) {
      return true;
    }
    const property = item[key];
    if (property !== null && typeof property === "object") {
      if (objects.some((other) => (0, import_deep_equal.deepEqual)(other, property))) {
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
        "typeof",
        `one of ${TYPEOF_NAMES.join(", ")}`
      );
      return (data) => names.includes(typeof data);
    },
    message: (value) => `must be of typeof ${list(value).join(" or ")}`
  },
  instanceof: {
    compile(value) {
      const names = list(value);
      const known = Object.keys(CONSTRUCTORS);
      expect(
        names.every((name) => known.includes(name)),
        "instanceof",
        `one of ${known.join(", ")}`
      );
      const constructors = names.map((name) => CONSTRUCTORS[name]);
      return (data) => constructors.some((constructor) => data instanceof constructor);
    },
    message: (value) => `must be an instance of ${list(value).join(" or ")}`
  },
  range: {
    type: "number",
    macro(value) {
      expect(Array.isArray(value) && value.length === 2 && value[0] <= value[1], "range", "[minimum, maximum]");
      return { minimum: value[0], maximum: value[1] };
    }
  },
  exclusiveRange: {
    type: "number",
    macro(value, parentSchema, { draft }) {
      expect(Array.isArray(value) && value.length === 2 && value[0] < value[1], "exclusiveRange", "[minimum, maximum]");
      return draft === "draft-04" ? { minimum: value[0], exclusiveMinimum: true, maximum: value[1], exclusiveMaximum: true } : { exclusiveMinimum: value[0], exclusiveMaximum: value[1] };
    }
  },
  regexp: {
    type: "string",
    compile(value) {
      const regExp = regExpOf(value);
      if (!regExp.global && !regExp.sticky) {
        return regExp;
      }
      return (data) => {
        regExp.lastIndex = 0;
        return regExp.test(data);
      };
    },
    message: (value) => `must match ${regExpOf(value)}`
  },
  uniqueItemProperties: {
    type: "array",
    compile(value) {
      expect(isStringList(value), "uniqueItemProperties", "a list of property names");
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
    message: (value) => `must have elements with unique ${value.join(", ")}`
  },
  allRequired: {
    type: "object",
    macro(value, parentSchema) {
      expect(typeof value === "boolean", "allRequired", "true or false");
      if (!value) {
        return true;
      }
      expect(isObject(parentSchema.properties), "allRequired", 'next to "properties"');
      return { required: Object.keys(parentSchema.properties) };
    }
  },
  anyRequired: {
    type: "object",
    macro(value) {
      expect(isStringList(value), "anyRequired", "a list of property names");
      return { anyOf: value.map((key) => ({ required: [key] })) };
    }
  },
  oneRequired: {
    type: "object",
    macro(value) {
      expect(isStringList(value), "oneRequired", "a list of property names");
      return { oneOf: value.map((key) => ({ required: [key] })) };
    }
  },
  patternRequired: {
    type: "object",
    compile(value) {
      expect(isStringList(value), "patternRequired", "a list of patterns");
      const regExps = value.map((source) => new RegExp(source, "u"));
      return (data) => {
        const keys = Object.keys(data);
        return regExps.every((regExp) => keys.some((key) => regExp.test(key)));
      };
    },
    message: (value) => `must have keys matching ${value.join(", ")}`
  },
  prohibited: {
    type: "object",
    macro(value) {
      expect(isStringList(value), "prohibited", "a list of property names");
      return { properties: Object.fromEntries(value.map((key) => [key, false])) };
    }
  },
  deepProperties: {
    type: "object",
    macro(value, parentSchema, { draft }) {
      expect(isObject(value), "deepProperties", "an object of schemas by JSON pointer");
      return { allOf: Object.entries(value).map(([pointer, schema]) => deepPropertySchema(pointer, schema, draft)) };
    }
  },
  deepRequired: {
    type: "object",
    compile(value) {
      expect(
        isStringList(value) && value.every((pointer) => pointer.startsWith("/")),
        "deepRequired",
        "a list of JSON pointers"
      );
      const paths = value.map((pointer) => pointer.split("/").slice(1).map(unescapeToken));
      return (data) => paths.every((tokens) => isDefinedAt(data, tokens));
    },
    message: (value, data) => {
      const missing = value.filter((pointer) => !isDefinedAt(data, pointer.split("/").slice(1).map(unescapeToken)));
      return `must have ${missing.join(", ")}`;
    }
  }
};
const LEFT_OUT = {
  transform: "it changes the data (the validator only assigns defaults and removes properties, see useDefaults and removeAdditional)",
  dynamicDefaults: "it computes defaults when validating; use useDefaults with fixed defaults",
  select: "it needs $data references",
  selectCases: "it needs $data references",
  selectDefault: "it needs $data references"
};
function ajvKeywords(names = Object.keys(DEFINITIONS)) {
  return list(names).map((name) => {
    if (hasOwn(LEFT_OUT, name)) {
      throw new Error(`ajvKeywords: "${name}" is not supported: ${LEFT_OUT[name]}`);
    }
    if (!hasOwn(DEFINITIONS, name)) {
      throw new Error(
        `ajvKeywords: unknown keyword "${name}"; the keywords are ${Object.keys(DEFINITIONS).join(", ")}`
      );
    }
    return { keyword: name, ...DEFINITIONS[name] };
  });
}

},
"@xufa/schema/lib/builder.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var builder_exports = {};
__export(builder_exports, {
  OPTIONAL: () => OPTIONAL,
  isOptional: () => isOptional,
  s: () => s
});
module.exports = __toCommonJS(builder_exports);
const OPTIONAL = /* @__PURE__ */ Symbol.for("xufa.schema.optional");
const isSchema = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function check(value, what) {
  if (!isSchema(value)) throw new TypeError(`${what} is a schema (an object)`);
  return value;
}
function copyOf(schema, optional = schema[OPTIONAL] === true) {
  const copy = { ...schema };
  if (optional) Object.defineProperty(copy, OPTIONAL, { value: true, enumerable: false });
  return copy;
}
const typeOfValue = (value) => {
  if (value === null) return "null";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "string" || typeof value === "boolean") return typeof value;
  return null;
};
function object(properties, options = {}) {
  check(properties, "s.object(properties)");
  const props = {};
  const required = [];
  for (const [name, schema] of Object.entries(properties)) {
    check(schema, `The property ${name}`);
    props[name] = copyOf(schema, false);
    if (schema[OPTIONAL] !== true) required.push(name);
  }
  const out = { type: "object", properties: props, ...options };
  if (required.length) out.required = required;
  return out;
}
function propertiesOf(schema, what) {
  check(schema, what);
  if (schema.type !== "object" || !isSchema(schema.properties))
    throw new TypeError(`${what} is a schema of s.object()`);
  const required = new Set(schema.required || []);
  const out = {};
  for (const [name, property] of Object.entries(schema.properties)) out[name] = copyOf(property, !required.has(name));
  return out;
}
function optionsOf(schema) {
  const { type, properties, required, ...options } = schema;
  return options;
}
function nullable(schema) {
  check(schema, "s.nullable(schema)");
  const optional = schema[OPTIONAL] === true;
  let out;
  if (typeof schema.type === "string")
    out = { ...schema, type: schema.type === "null" ? "null" : [schema.type, "null"] };
  else if (Array.isArray(schema.type))
    out = { ...schema, type: schema.type.includes("null") ? schema.type : [...schema.type, "null"] };
  else out = { anyOf: [copyOf(schema, false), { type: "null" }] };
  if (Array.isArray(out.enum) && !out.enum.includes(null)) out.enum = [...out.enum, null];
  return copyOf(out, optional);
}
const s = {
  string: (options = {}) => ({ type: "string", ...options }),
  number: (options = {}) => ({ type: "number", ...options }),
  integer: (options = {}) => ({ type: "integer", ...options }),
  boolean: (options = {}) => ({ type: "boolean", ...options }),
  null: (options = {}) => ({ type: "null", ...options }),
  // Strings of formats (what JSON has: a date is its text).
  dateTime: (options = {}) => ({ type: "string", format: "date-time", ...options }),
  date: (options = {}) => ({ type: "string", format: "date", ...options }),
  email: (options = {}) => ({ type: "string", format: "email", ...options }),
  uuid: (options = {}) => ({ type: "string", format: "uuid", ...options }),
  uri: (options = {}) => ({ type: "string", format: "uri", ...options }),
  // One value; one of some values.
  literal(value, options = {}) {
    const type = typeOfValue(value);
    if (!type) throw new TypeError("s.literal(value): a string, a number, a boolean or null");
    return { type, const: value, ...options };
  },
  enum(values, options = {}) {
    if (!Array.isArray(values) || values.length === 0) throw new TypeError("s.enum(values): a list of values");
    const types = [...new Set(values.map(typeOfValue))];
    if (types.includes(null)) throw new TypeError("s.enum(values): strings, numbers, booleans or null");
    const merged = [...new Set(types.map((t) => t === "integer" && types.includes("number") ? "number" : t))];
    return { type: merged.length === 1 ? merged[0] : merged, enum: [...values], ...options };
  },
  array: (items, options = {}) => ({ type: "array", items: copyOf(check(items, "s.array(items)"), false), ...options }),
  // An array of a length, of a schema for each item (draft-07: items as a list).
  tuple(items, options = {}) {
    if (!Array.isArray(items)) throw new TypeError("s.tuple(items): a list of schemas");
    return {
      type: "array",
      items: items.map((item, i) => copyOf(check(item, `s.tuple item ${i}`), false)),
      minItems: items.length,
      maxItems: items.length,
      additionalItems: false,
      ...options
    };
  },
  object,
  // An object of any keys, with values of a schema.
  record: (values, options = {}) => ({
    type: "object",
    additionalProperties: copyOf(check(values, "s.record(values)"), false),
    ...options
  }),
  // Any of some schemas (anyOf); all of them (allOf).
  union(schemas, options = {}) {
    if (!Array.isArray(schemas) || schemas.length === 0) throw new TypeError("s.union(schemas): a list of schemas");
    return { anyOf: schemas.map((schema, i) => copyOf(check(schema, `s.union schema ${i}`), false)), ...options };
  },
  intersect(schemas, options = {}) {
    if (!Array.isArray(schemas) || schemas.length === 0) throw new TypeError("s.intersect(schemas): a list of schemas");
    return { allOf: schemas.map((schema, i) => copyOf(check(schema, `s.intersect schema ${i}`), false)), ...options };
  },
  // A property that is not required (in s.object()); a value that can be null too.
  optional: (schema) => copyOf(check(schema, "s.optional(schema)"), true),
  nullable,
  // Objects from objects: some of their properties, all of them not required (or required), more of them.
  pick(schema, keys) {
    const properties = propertiesOf(schema, "s.pick(schema)");
    const out = {};
    for (const key of keys) {
      if (!Object.hasOwn(properties, key)) throw new TypeError(`s.pick(): the schema has no property ${key}`);
      out[key] = properties[key];
    }
    return object(out, optionsOf(schema));
  },
  omit(schema, keys) {
    const properties = propertiesOf(schema, "s.omit(schema)");
    for (const key of keys) {
      if (!Object.hasOwn(properties, key)) throw new TypeError(`s.omit(): the schema has no property ${key}`);
      delete properties[key];
    }
    return object(properties, optionsOf(schema));
  },
  partial(schema) {
    const properties = propertiesOf(schema, "s.partial(schema)");
    for (const key of Object.keys(properties)) properties[key] = copyOf(properties[key], true);
    return object(properties, optionsOf(schema));
  },
  required(schema) {
    const properties = propertiesOf(schema, "s.required(schema)");
    for (const key of Object.keys(properties)) properties[key] = copyOf(properties[key], false);
    return object(properties, optionsOf(schema));
  },
  extend(schema, more, options = {}) {
    const properties = propertiesOf(schema, "s.extend(schema)");
    check(more, "s.extend(schema, properties)");
    return object({ ...properties, ...more }, { ...optionsOf(schema), ...options });
  },
  // A shared schema (app.addSchema(schema) with its $id): { $ref: 'Book#' }.
  ref: (id, options = {}) => ({ $ref: id, ...options }),
  // Anything; nothing.
  any: (options = {}) => ({ ...options }),
  unknown: (options = {}) => ({ ...options }),
  never: (options = {}) => ({ not: {}, ...options })
};
const isOptional = (schema) => isSchema(schema) && schema[OPTIONAL] === true;

},
"@xufa/schema/lib/closed-schema.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var closed_schema_exports = {};
__export(closed_schema_exports, {
  ClosedSchema: () => ClosedSchema
});
module.exports = __toCommonJS(closed_schema_exports);
var import_schema = require("./schema.js");
class ClosedSchema extends import_schema.Schema {
  constructor(schema = {}, options = {}) {
    super(schema, { ...options, isOpen: false });
  }
}

},
"@xufa/schema/lib/coerce.js": function (module, exports, require) {
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var coerce_exports = {};
__export(coerce_exports, {
  COERCIBLE: () => COERCIBLE,
  CoerceType: () => CoerceType,
  TYPE_TESTS: () => TYPE_TESTS,
  coerce: () => coerce,
  coerceSpecOf: () => coerceSpecOf,
  readCoerced: () => readCoerced
});
module.exports = __toCommonJS(coerce_exports);
var import_validate_type = require("./types/validate-type.js");
var indexModule = __toESM(require("./types/index.js"));
const COERCIBLE = ["string", "number", "integer", "boolean", "null"];
const TYPE_TESTS = {
  string: (x) => typeof x === "string",
  number: (x) => typeof x === "number" && Number.isFinite(x),
  integer: (x) => Number.isInteger(x),
  boolean: (x) => typeof x === "boolean",
  null: (x) => x === null,
  object: (x) => x !== null && typeof x === "object" && !Array.isArray(x),
  array: (x) => Array.isArray(x)
};
const isNumeric = (x) => typeof x === "string" && x !== "" && !Number.isNaN(Number(x));
const COERCIONS = {
  string: (x) => {
    if (typeof x === "number" || typeof x === "boolean") {
      return String(x);
    }
    return x === null ? "" : void 0;
  },
  number: (x) => typeof x === "boolean" || x === null || isNumeric(x) ? Number(x) : void 0,
  integer: (x) => typeof x === "boolean" || x === null || isNumeric(x) && Number(x) % 1 === 0 ? Number(x) : void 0,
  boolean: (x) => {
    if (x === "false" || x === 0 || x === null) {
      return false;
    }
    return x === "true" || x === 1 ? true : void 0;
  },
  null: (x) => x === "" || x === 0 || x === false ? null : void 0,
  array: (x) => x === null || ["string", "number", "boolean"].includes(typeof x) ? [x] : void 0
};
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
  for (let i = 0; i < spec.to.length && converted === void 0; i += 1) {
    converted = COERCIONS[spec.to[i]](current);
  }
  return converted === void 0 ? { value: current, assign: false } : { value: converted, assign: true };
}
let TYPES;
function coerceSpecOf(type, seen = []) {
  if (!type) {
    return void 0;
  }
  if (type.coerceSpec) {
    return type.coerceSpec;
  }
  if (TYPES === void 0) TYPES = indexModule;
  const { RefType, AllOfType } = TYPES;
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
  return void 0;
}
function readCoerced(container, key, type, value) {
  const spec = value === void 0 ? void 0 : coerceSpecOf(type);
  if (!spec) {
    return value;
  }
  const result = coerce(value, spec);
  if (result.assign) {
    container[key] = result.value;
  }
  return result.value;
}
class CoerceType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super({ ...options, isMandatory: false, isNullable: true });
    this.type = options.type;
    this.spec = options.spec;
  }
  converted(value) {
    return value === void 0 ? value : coerce(value, this.spec).value;
  }
  validate(value, fieldName = void 0) {
    return this.type.validate(this.converted(value), fieldName);
  }
  errors(value, fieldName = void 0) {
    return this.type.errors(this.converted(value), fieldName);
  }
  isValid(value) {
    return this.type.isValid(this.converted(value));
  }
}

},
"@xufa/schema/lib/compile.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var compile_exports = {};
__export(compile_exports, {
  compileErrors: () => compileErrors,
  compileFirstError: () => compileFirstError,
  compileIsValid: () => compileIsValid,
  compileType: () => compileType,
  generateSource: () => generateSource
});
module.exports = __toCommonJS(compile_exports);
var import_deep_equal = require("./deep-equal.js");
var import_validate_type = require("./types/validate-type.js");
var import_schema = require("./schema.js");
var import_closed_schema = require("./closed-schema.js");
var import_types = require("./types/index.js");
var import_one_of = require("./types/one-of.js");
var import_keyword = require("./types/keyword.js");
var import_string = require("./types/string.js");
var import_formats = require("./formats.js");
var import_defaults = require("./defaults.js");
var import_coerce = require("./coerce.js");
var import_code_point_length = require("./types/code-point-length.js");
var import_has_duplicates = require("./types/has-duplicates.js");
var import_unevaluated = require("./unevaluated.js");
var import_error_objects = require("./error-objects.js");
const TIME_PREFIXES = /* @__PURE__ */ new Map([
  [import_formats.FORMAT_COMPARES.time, "2020-01-01T"],
  [import_formats.FORMAT_COMPARES["date-time"], ""]
]);
const FORMAT_LIMIT_FAILS = {
  formatMinimum: "< 0",
  formatMaximum: "> 0",
  formatExclusiveMinimum: "<= 0",
  formatExclusiveMaximum: ">= 0"
};
function staticPath(path) {
  if (!path.startsWith("[") || !path.endsWith("]")) {
    return void 0;
  }
  try {
    const value = JSON.parse(path);
    return Array.isArray(value) && value.every((item) => typeof item === "string" || Number.isInteger(item)) ? value : void 0;
  } catch (e) {
    return void 0;
  }
}
function literalOf(code) {
  try {
    const value = JSON.parse(code);
    return typeof value === "string" || Number.isInteger(value) ? value : void 0;
  } catch (e) {
    return void 0;
  }
}
const MAX_INLINE_KEYS = 8;
const MAX_INLINE_CODE = 4e3;
const JSON_TYPE_CHECKS = {
  object: (v) => `typeof ${v} === 'object' && !Array.isArray(${v})`,
  array: (v) => `Array.isArray(${v})`,
  string: (v) => `typeof ${v} === 'string'`,
  number: (v) => `typeof ${v} === 'number'`
};
const KEYWORD_TYPE_CHECKS = {
  string: (v) => `typeof ${v} === 'string'`,
  number: (v) => `typeof ${v} === 'number'`,
  integer: (v) => `Number.isInteger(${v})`,
  boolean: (v) => `typeof ${v} === 'boolean'`,
  object: (v) => `(typeof ${v} === 'object' && !Array.isArray(${v}))`,
  array: (v) => `Array.isArray(${v})`,
  null: () => "false"
};
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const COERCE_TYPE_TESTS = {
  string: (x) => `typeof ${x} === 'string'`,
  number: (x) => `(typeof ${x} === 'number' && Number.isFinite(${x}))`,
  integer: (x) => `Number.isInteger(${x})`,
  boolean: (x) => `typeof ${x} === 'boolean'`,
  null: (x) => `${x} === null`,
  object: (x) => `(${x} !== null && typeof ${x} === 'object' && !Array.isArray(${x}))`,
  array: (x) => `Array.isArray(${x})`
};
const COERCE_CODE = {
  string: (x, t) => [
    [`${t} === 'number' || ${t} === 'boolean'`, `"" + ${x}`],
    [`${x} === null`, '""']
  ],
  number: (x, t) => [
    [`${t} === 'boolean' || ${x} === null || (${t} === 'string' && ${x} !== "" && !Number.isNaN(+${x}))`, `+${x}`]
  ],
  integer: (x, t) => [
    [
      `${t} === 'boolean' || ${x} === null || (${t} === 'string' && ${x} !== "" && !Number.isNaN(+${x}) && +${x} % 1 === 0)`,
      `+${x}`
    ]
  ],
  boolean: (x) => [
    [`${x} === "false" || ${x} === 0 || ${x} === null`, "false"],
    [`${x} === "true" || ${x} === 1`, "true"]
  ],
  null: (x) => [[`${x} === "" || ${x} === 0 || ${x} === false`, "null"]],
  array: (x, t) => [[`${t} === 'string' || ${t} === 'number' || ${t} === 'boolean' || ${x} === null`, `[${x}]`]]
};
const missingCode = (x, { empty }) => empty ? `${x} === undefined || ${x} === null || ${x} === ""` : `${x} === undefined`;
function literalCode(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? `(${JSON.stringify(value)})` : void 0;
  }
  if (Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype) {
    const items = value.map(literalCode);
    return items.every((item) => item !== void 0) ? `[${items.join(", ")}]` : void 0;
  }
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.keys(value).map((key) => [key, literalCode(value[key])]);
    return entries.every(([, item]) => item !== void 0) ? `{ ${entries.map(([key, item]) => `[${JSON.stringify(key)}]: ${item}`).join(", ")} }` : void 0;
  }
  return void 0;
}
function ownerOf(obj, name) {
  let proto = obj;
  while (proto && !hasOwn(proto, name)) {
    proto = Object.getPrototypeOf(proto);
  }
  return proto;
}
function checksThroughValidate(type) {
  const validateOwner = ownerOf(type, "validate");
  const isValidOwner = ownerOf(type, "isValid");
  return validateOwner !== isValidOwner && Object.prototype.isPrototypeOf.call(isValidOwner, validateOwner);
}
function valuePath(path) {
  if (path === "undefined") {
    return '"Value"';
  }
  return path === "p" ? '(p === undefined ? "Value" : p)' : path;
}
function literalValue(code) {
  const last = code.length - 1;
  if (last < 1 || code.charCodeAt(0) !== 34 || code.charCodeAt(last) !== 34) {
    return void 0;
  }
  const inner = code.slice(1, last);
  return inner.indexOf('"') === -1 && inner.indexOf("\\") === -1 ? inner : void 0;
}
const TEXT_CODES = /* @__PURE__ */ new Map();
function messageCode(name, suffix, fold) {
  let text = TEXT_CODES.get(suffix);
  if (text === void 0) {
    text = JSON.stringify(suffix);
    if (TEXT_CODES.size < 1e4) TEXT_CODES.set(suffix, text);
  }
  if (fold) {
    const known = literalValue(name);
    if (known !== void 0) {
      return `"${known}${text.slice(1)}`;
    }
  }
  return `${name} + ${text}`;
}
function schemaName(path, fold) {
  if (fold) {
    const known = literalValue(path);
    if (known !== void 0) {
      return known ? path : '"Value"';
    }
  }
  return path === "undefined" ? '"Value"' : `(${path} || "Value")`;
}
function keyPath(path, key, fold) {
  if (path === "undefined") {
    return key;
  }
  if (fold) {
    const field = literalValue(path);
    const name = literalValue(key);
    if (field !== void 0 && name !== void 0) {
      return field ? `"${field}.${name}"` : key;
    }
  }
  return `J(${path}, ${key})`;
}
function formatValue(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}
function valuesMessage(values) {
  if (values.length === 1) {
    return ` must be equal to ${formatValue(values[0])}`;
  }
  return ` must be one of: ${values.map(formatValue).join(", ")}`;
}
const OBJECT_METHODS = ["constructor", "valueOf", "toString"];
function isPlainValue(value) {
  if (value === null || typeof value !== "object") {
    return typeof value !== "bigint" && typeof value !== "symbol" && typeof value !== "function";
  }
  if (Array.isArray(value)) {
    return Object.getPrototypeOf(value) === Array.prototype && Object.keys(value).length === value.length && value.every(isPlainValue);
  }
  return Object.getPrototypeOf(value) === Object.prototype && !OBJECT_METHODS.some((key) => hasOwn(value, key)) && Object.values(value).every(isPlainValue);
}
function equalsCode(value, x) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && Number.isNaN(value)) {
      return `(typeof ${x} === 'number' && ${x} !== ${x})`;
    }
    if (typeof value === "number") {
      return `${x} === ${Number.isFinite(value) ? `(${value})` : `${value > 0 ? "" : "-"}Infinity`}`;
    }
    return `${x} === ${value === void 0 ? "undefined" : JSON.stringify(value)}`;
  }
  const isObject = `typeof ${x} === 'object' && ${x} !== null`;
  if (Array.isArray(value)) {
    const items = value.map((item, i) => equalsCode(item, `${x}[${i}]`));
    return `(${[isObject, `${x}.constructor === Array`, `${x}.length === ${value.length}`, ...items].join(" && ")})`;
  }
  const keys = Object.keys(value);
  const entries = keys.map((key) => {
    const literal = JSON.stringify(key);
    return `H.call(${x}, ${literal}) && ${equalsCode(value[key], `${x}[${literal}]`)}`;
  });
  return `(${[isObject, `${x}.constructor === Object`, `Object.keys(${x}).length === ${keys.length}`, ...entries].join(
    " && "
  )})`;
}
function firstError(type, value, fieldName) {
  return (0, import_types.toErrors)(type.errors(value, fieldName))[0];
}
function pushErrors(out, type, value, fieldName) {
  const errors = (0, import_types.toErrors)(type.errors(value, fieldName));
  if (errors.length === 0) {
    return out;
  }
  return out === void 0 ? errors : out.concat(errors);
}
function customErrors(type, value, path) {
  const params = { type: type.constructor.name };
  return (0, import_types.toErrors)(type.errors(value, path.length > 0 ? (0, import_error_objects.pathName)(path) : void 0)).map(
    (message) => (0, import_error_objects.errorObject)(path, "custom", params, message)
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
  return out === void 0 ? errors : out.concat(errors);
}
const NO_MESSAGE = Object.freeze({ text: () => "", path: "undefined", keyword: "", params: "{}" });
function messageAt(path, text, keyword, params = "{}") {
  return { text, path, keyword, params };
}
const HELPER_SOURCE = (structured) => `"use strict";
return [
  Object.prototype.hasOwnProperty,
  Object.prototype,
  function J(fieldName, key) { return fieldName ? fieldName + "." + key : key; },
  function P(out, e) { if (out === undefined) { return [e]; } out.push(e); return out; },
  ${structured ? "function U(e) { const m = e.map((x) => x.message); for (let i = 1; i < m.length; i += 1) { if (m.indexOf(m[i]) < i) { return e.filter((x, j) => m.indexOf(m[j]) === j); } } return e; }" : "function U(e) { for (let i = 1; i < e.length; i += 1) { if (e.indexOf(e[i]) < i) { return Array.from(new Set(e)); } } return e; }"},
];`;
const HELPERS = new Function(HELPER_SOURCE(false))();
const STRUCTURED_HELPERS = new Function(HELPER_SOURCE(true))();
class Generator {
  // `structured`: errors as objects (see error-objects.js), with the paths of the values as arrays of keys and
  // indexes instead of their names.
  // `fold`: the option foldMessages (see messageCode()).
  constructor(mode, structured = false, fold = false) {
    this.mode = mode;
    this.structured = structured;
    this.fold = fold;
    this.constants = [];
    this.nodes = [];
    this.functions = [];
    this.checkFunctions = /* @__PURE__ */ new Map();
    this.evaluatedFunctions = { properties: /* @__PURE__ */ new Map(), items: /* @__PURE__ */ new Map() };
    this.refFunctions = { check: /* @__PURE__ */ new Map(), first: /* @__PURE__ */ new Map(), all: /* @__PURE__ */ new Map() };
    this.count = 0;
    this.visiting = /* @__PURE__ */ new Set();
    this.fail = "return false;";
    this.scope = 0;
    this.scopes = 0;
    this.sharedMatches = /* @__PURE__ */ new Map();
    this.plainOneOfs = /* @__PURE__ */ new Map();
    this.plainDeclared = /* @__PURE__ */ new Set();
    this.plainUsed = /* @__PURE__ */ new Set();
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
    return typeof value === "number" && Number.isFinite(value) ? `(${value})` : this.constant(value);
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
    if (this.mode === "check") {
      return this.fail;
    }
    let text = message.text();
    let { path } = message;
    const known = this.structured ? staticPath(path) : void 0;
    if (known) {
      const pointer = known.map((key) => `/${`${key}`.replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
      const object = `{ path: ${path}, pointer: ${JSON.stringify(pointer)}, keyword: ${JSON.stringify(message.keyword)}, params: ${message.params}, message: ${text} }`;
      return this.mode === "first" ? `return ${object};` : `out = P(out, ${object});`;
    }
    let assign = "";
    if (this.structured && path.length > 3) {
      text = text.split(path).join("q");
      assign = `q = ${path}, `;
      path = "q";
    }
    const error = this.structured ? `(${assign}${this.constant(import_error_objects.errorObject)}(${path}, ${JSON.stringify(message.keyword)}, ${message.params}, ${text}))` : text;
    return this.mode === "first" ? `return ${error};` : `out = P(out, ${error});`;
  }
  // Code of the path of the value itself: undefined (no name), or an empty array when structured.
  rootPath() {
    return this.structured ? "[]" : "undefined";
  }
  // Code of the name of the value at `path`, as messages start with it; a Schema is "Value" at the root.
  nameOf(path, isSchema) {
    if (!this.structured) {
      return isSchema ? schemaName(path, this.fold) : valuePath(path);
    }
    const known = staticPath(path);
    if (known) {
      return JSON.stringify((0, import_error_objects.pathName)(known));
    }
    const name = `${this.constant(import_error_objects.pathName)}(${path})`;
    return isSchema ? `(${name} || "Value")` : name;
  }
  // Code of the path of the key `key` (code) of the object at `path`.
  keyOf(path, key) {
    if (!this.structured) {
      return keyPath(path, key, this.fold);
    }
    const known = staticPath(path);
    if (known && literalOf(key) !== void 0) {
      return JSON.stringify([...known, literalOf(key)]);
    }
    return path === "[]" ? `[${key}]` : `${path}.concat([${key}])`;
  }
  // Code of the path of the element `index` (code) of the array at `path`, whose name is `name`.
  indexOf(path, name, index) {
    if (!this.structured) {
      return `(${name} + "[" + ${index} + "]")`;
    }
    const known = staticPath(path);
    if (known && literalOf(String(index)) !== void 0) {
      return JSON.stringify([...known, literalOf(String(index))]);
    }
    return path === "[]" ? `[${index}]` : `${path}.concat([${index}])`;
  }
  // Code of the path of a key checked by propertyNames, as a value: its name is "Key <name>".
  propertyNameOf(path, key) {
    if (!this.structured) {
      return `("Key " + ${keyPath(path, key, this.fold)})`;
    }
    return path === "[]" ? `[{ key: ${key} }]` : `${path}.concat([{ key: ${key} }])`;
  }
  // Checks [condition, message, pre] run in order until one fails; `rest` runs when none fails. The optional `pre`
  // statements run just before their condition, only when the previous checks passed.
  chain(checks, rest = "") {
    let code = "";
    for (let i = 0; i < checks.length; i += 1) {
      const [condition, message, pre] = checks[i];
      if (pre) {
        const remaining = this.chain([[condition, message], ...checks.slice(i + 1)], rest);
        return `${code}${i ? "else " : ""}{
${pre}${remaining}}
`;
      }
      code += `${i ? "else " : ""}if (${condition}) { ${this.emit(message)} }
`;
    }
    if (!rest) {
      return code;
    }
    return checks.length ? `${code}else {
${rest}}
` : rest;
  }
  // Generates a separate function in 'check' mode, where a failure returns false.
  inFunction(generate) {
    const { mode, fail, visiting } = this;
    this.mode = "check";
    this.fail = "return false;";
    this.visiting = /* @__PURE__ */ new Set();
    const body = this.inScope(generate);
    this.mode = mode;
    this.fail = fail;
    this.visiting = visiting;
    return body;
  }
  // Name of a boolean function checking `type`, shared by every use of the same node.
  checkFunction(type) {
    if (!this.checkFunctions.has(type)) {
      const name = this.name("check");
      this.checkFunctions.set(type, name);
      const body = this.inFunction(() => this.generate(type, "x", "undefined"));
      this.functions.push(`function ${name}(x) {
${body}return true;
}
`);
    }
    return this.checkFunctions.get(type);
  }
  // Code that runs `onPass` when the value in `v` satisfies `type`. The check is inlined in a labelled block that a
  // failure breaks out of, which avoids a function call; a long one goes into a function instead.
  inlineCheck(type, v, onPass) {
    const { mode, fail } = this;
    const label = this.name("L");
    this.mode = "check";
    this.fail = `break ${label};`;
    const written = [...this.sharedMatches.values()].map((shared) => [shared, shared.written]);
    const body = this.generate(type, v, "undefined");
    this.mode = mode;
    this.fail = fail;
    if (body.length > MAX_INLINE_CODE) {
      written.forEach(([shared, wasWritten]) => {
        shared.written = wasWritten;
      });
      return `if (${this.checkFunction(type)}(${v})) { ${onPass} }
`;
    }
    return `${label}: {
${body}${onPass}
}
`;
  }
  // Name of the function validating a reference target in the current mode. It takes the value and, to build
  // messages, the field name (and the error list in 'all' mode), so recursive schemas call it again.
  refFunction(target) {
    const functions = this.refFunctions[this.mode];
    if (!functions.has(target)) {
      const name = this.name(`ref_${this.mode}`);
      functions.set(target, name);
      const params = { check: "x", first: "x, p", all: "x, p, out" }[this.mode];
      const end = {
        check: "return true;",
        first: "return undefined;",
        all: "return out;"
      }[this.mode];
      const { visiting, fail } = this;
      this.visiting = /* @__PURE__ */ new Set();
      this.fail = "return false;";
      let body = this.inScope(() => this.generate(target, "x", this.mode === "check" ? "undefined" : "p"));
      if (this.structured && this.mode !== "check") {
        body = `let q;
${body}`;
      }
      this.visiting = visiting;
      this.fail = fail;
      this.functions.push(`function ${name}(${params}) {
${body}${end}
}
`);
    }
    return functions.get(target);
  }
  // Like RefType: undefined is checked here, any other value by the target.
  ref(type, v, path) {
    const onUndefined = type.isMandatory ? this.emit(messageAt(path, () => messageCode(this.nameOf(path, false), " is mandatory", this.fold), "required")) : "";
    const target = type.getTarget();
    const fn = this.refFunction(target);
    let call = `if (!${fn}(${v})) { ${this.fail} }
`;
    if (this.mode === "first") {
      const e = this.name("e");
      call = `const ${e} = ${fn}(${v}, ${path});
if (${e} !== undefined) { return ${e}; }
`;
    } else if (this.mode === "all") {
      call = `out = ${fn}(${v}, ${path}, out);
`;
    }
    if (this.mode !== "check" && !/^(undefined|p|\[\]|"[^"\\]*")$/.test(path)) {
      const { mode } = this;
      this.mode = "check";
      const check = this.refFunction(target);
      this.mode = mode;
      call = `if (!${check}(${v})) {
${call}}
`;
    }
    return `if (${v} === undefined) { ${onUndefined} } else {
${call}}
`;
  }
  // Code validating the value held in variable `v` against `type`, with `path` giving its field name. When `known`
  // names a JSON type, the value is known to be of that type (so neither undefined nor null): presence and that type
  // are not checked again. Types that accept every value give no code.
  generate(type, v, path, known = void 0) {
    if (type.constructor === import_types.RefType) {
      return this.ref(type, v, path);
    }
    if (type.constructor === import_coerce.CoerceType) {
      return this.coerceCode(type.spec, v) + this.generate(type.type, v, path, known);
    }
    if (this.visiting.has(type)) {
      return this.custom(type, v, path);
    }
    this.visiting.add(type);
    const isSchema = type.constructor === import_schema.Schema || type.constructor === import_closed_schema.ClosedSchema;
    const name = this.nameOf(path, isSchema);
    const body = this.body(type, v, path, name, known);
    this.visiting.delete(type);
    if (body === void 0) {
      return this.custom(type, v, path);
    }
    const checks = this.chain(body.checks, body.rest);
    if (known) {
      return checks;
    }
    const text = (suffix, keyword) => this.mode === "check" ? NO_MESSAGE : messageAt(path, () => messageCode(name, suffix, this.fold), keyword);
    const onUndefined = type.isMandatory ? this.emit(text(" is mandatory", "required")) : "";
    const onNull = type.isNullable ? "" : this.emit(text(" cannot be null", "nullable"));
    if (!onUndefined && !onNull) {
      return checks ? `if (${v} !== undefined && ${v} !== null) {
${checks}}
` : "";
    }
    return `if (${v} === undefined) { ${onUndefined} } else if (${v} === null) { ${onNull} } else {
${checks}}
`;
  }
  custom(type, v, path) {
    const node = this.node(type);
    const invalid = checksThroughValidate(type) ? `${this.constant(import_types.hasErrors)}(${node}.validate(${v}))` : `!${node}.isValid(${v})`;
    let onInvalid = this.fail;
    if (this.mode === "first") {
      onInvalid = `return r(${node}, ${v}, ${path});`;
    } else if (this.mode === "all") {
      onInvalid = `out = a(out, ${node}, ${v}, ${path});`;
    }
    return `if (${invalid}) { ${onInvalid} }
`;
  }
  // Checks for a value that is neither undefined nor null, as { checks, rest }; undefined when the type is not a
  // built-in one.
  body(type, v, path, name, known) {
    const text = (suffix, keyword, params) => this.mode === "check" ? NO_MESSAGE : messageAt(path, () => messageCode(name, suffix, this.fold), keyword, params);
    switch (type.constructor) {
      case import_schema.Schema:
      case import_closed_schema.ClosedSchema:
        return this.schema(type, v, path, name, text, known);
      case import_types.ObjType:
        return {
          checks: [
            [
              `typeof ${v} !== 'object' || Array.isArray(${v})`,
              text(" must be an object", "type", "{ type: 'object' }")
            ]
          ],
          rest: type.schema ? this.generate(type.schema, v, path) : ""
        };
      case import_types.ArrayOfType:
        return this.arrayOf(type, v, path, name, text, known);
      case import_unevaluated.UnevaluatedType:
        return this.unevaluated(type, v, path, name);
      case import_types.AllOfType:
        return { checks: [], rest: this.allOf(type, v, path, known) };
      case import_types.ConditionalType: {
        if (!type.thenType && !type.elseType) {
          return { checks: [], rest: "" };
        }
        const branch = (branchType) => branchType ? this.generate(branchType, v, path) : "";
        const ok = this.name("ok");
        const rest = `let ${ok} = false;
${this.inlineCheck(type.ifType, v, `${ok} = true;`)}if (${ok}) {
${branch(
          type.thenType
        )}} else {
${branch(type.elseType)}}
`;
        return { checks: [], rest };
      }
      case import_types.AnyOfType:
        return { checks: [], rest: this.anyOf(type, v, path) };
      case import_types.OneOfType:
        return this.oneOf(type, v, path, text);
      case import_keyword.KeywordType:
        return { checks: [this.keyword(type, v, path, name)] };
      case import_types.NotType: {
        const ok = this.name("ok");
        const pre = `let ${ok} = false;
${this.inlineCheck(type.type, v, `${ok} = true;`)}`;
        return {
          checks: [[ok, text(" must not match the excluded schema", "not"), pre]]
        };
      }
      case import_types.StringType:
        return { checks: this.string(type, v, text, known) };
      case import_types.EnumType:
        return {
          checks: [
            ...this.string(type, v, text, known),
            [
              `!${this.constant(new Set(type.options))}.has(${v})`,
              text(
                ` must be one of: ${type.options.join(", ")}`,
                "enum",
                `{ allowedValues: ${JSON.stringify(type.options)} }`
              )
            ]
          ]
        };
      case import_types.FloatType:
        return { checks: this.float(type, v, text) };
      case import_types.IntegerType:
        return {
          checks: [
            ...this.float(type, v, text),
            [`!Number.isInteger(${v})`, text(" must be an integer", "type", "{ type: 'integer' }")]
          ]
        };
      case import_types.BooleanType:
        return {
          checks: [[`typeof ${v} !== 'boolean'`, text(" must be a boolean", "type", "{ type: 'boolean' }")]]
        };
      case import_types.AnyType:
        return { checks: [] };
      case import_types.NeverType:
        return { checks: [["true", text(" is not allowed", "false")]] };
      case import_types.ValuesType:
        return {
          checks: [
            [this.notOneOf(type.values, v), text(valuesMessage(type.values), ...this.valuesKeyword(type.values))]
          ]
        };
      case import_types.WhenType:
        if (known === type.jsonType) {
          return { checks: [], rest: this.generate(type.type, v, path, known) };
        }
        return {
          checks: [],
          rest: `if (${JSON_TYPE_CHECKS[type.jsonType](v)}) {
${this.generate(type.type, v, path, type.jsonType)}}
`
        };
      default:
        return void 0;
    }
  }
  string(type, v, text, known) {
    const checks = known === "string" ? [] : [[`typeof ${v} !== 'string'`, text(" must be a string", "type", "{ type: 'string' }")]];
    const count = () => `${this.constant(import_code_point_length.codePointLength)}(${v})`;
    if (type.min !== void 0) {
      const allowEmpty = type.allowEmpty ?? !type.isMandatory;
      const min = this.number(type.min);
      const tooShort = type.countCodePoints ? `(${v}.length < ${min} || (${v}.length < 2 * ${min} && ${count()} < ${min}))` : `${v}.length < ${min}`;
      checks.push([
        allowEmpty ? `${tooShort} && ${v}.length !== 0` : tooShort,
        text(` must be at least ${type.min} characters long`, "minLength", `{ limit: ${this.number(type.min)} }`)
      ]);
    }
    if (type.max !== void 0) {
      const max = this.number(type.max);
      const tooLong = type.countCodePoints ? `(${v}.length > 2 * ${max} || (${v}.length > ${max} && ${count()} > ${max}))` : `${v}.length > ${max}`;
      checks.push([
        tooLong,
        text(` must be at most ${type.max} characters long`, "maxLength", `{ limit: ${this.number(type.max)} }`)
      ]);
    }
    if (type.pattern) {
      checks.push([
        `!${this.constant(type.pattern)}.test(${v})`,
        text(" does not match the required pattern", "pattern", `{ pattern: ${JSON.stringify(type.pattern.source)} }`)
      ]);
    }
    if (type.formatCheck !== void 0) {
      const check = this.constant(type.formatCheck);
      const matches = type.formatCheck instanceof RegExp ? `${check}.test(${v})` : `${check}(${v})`;
      checks.push([
        `!${matches}`,
        text(` must be a valid ${type.format}`, "format", `{ format: ${JSON.stringify(type.format)} }`)
      ]);
    }
    let ms;
    type.formatLimits.forEach(({ keyword, limit, compare }) => {
      const { text: words, comparison } = import_string.FORMAT_LIMITS[keyword];
      const literal = JSON.stringify(limit);
      const message = text(` must be ${words} ${limit}`, keyword, `{ comparison: "${comparison}", limit: ${literal} }`);
      const operator = FORMAT_LIMIT_FAILS[keyword].slice(0, -2);
      if (compare === import_formats.FORMAT_COMPARES.date) {
        checks.push([`${v} ${operator} ${literal}`, message]);
      } else if (TIME_PREFIXES.has(compare)) {
        const prefix = TIME_PREFIXES.get(compare);
        const limitMs = (/* @__PURE__ */ new Date(`${prefix}${limit}`)).valueOf();
        if (limitMs) {
          let pre;
          if (!ms) {
            ms = this.name("ms");
            pre = `const ${ms} = new Date(${prefix ? `"${prefix}" + ` : ""}${v}).valueOf();
`;
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
      [type.min, "<", "must be at least", "minimum"],
      [type.max, ">", "must be at most", "maximum"],
      [type.exclusiveMin, "<=", "must be greater than", "exclusiveMinimum"],
      [type.exclusiveMax, ">=", "must be less than", "exclusiveMaximum"]
    ];
    const checks = [
      [`!Number.isFinite(${v})`, text(" must be a number", "type", "{ type: 'number' }")],
      ...limits.filter(([limit]) => limit !== void 0).map(([limit, operator, message, keyword]) => [
        `${v} ${operator} ${this.number(limit)}`,
        text(` ${message} ${limit}`, keyword, `{ limit: ${this.number(limit)} }`)
      ])
    ];
    if (type.multipleOf !== void 0) {
      const division = `${v} / ${this.number(type.multipleOf)}`;
      const notMultiple = type.multipleOfPrecision === void 0 ? `!Number.isInteger(${division})` : `Math.abs(Math.round(${division}) - ${division}) > 1e-${type.multipleOfPrecision}`;
      checks.push([
        notMultiple,
        text(
          ` must be a multiple of ${type.multipleOf}`,
          "multipleOf",
          `{ multipleOf: ${this.number(type.multipleOf)} }`
        )
      ]);
    }
    return checks;
  }
  // Like ValuesType: `v` (neither undefined nor null) is deep-equal to none of the values. Plain values are compared
  // with code written for them; others with deepEqual(), only for objects as it is false for anything else.
  // Keyword and params of the message of a ValuesType: const for one value, enum for several.
  valuesKeyword(values) {
    if (values.length === 1) {
      return ["const", this.structured ? `{ allowedValue: ${this.constant(values[0])} }` : "{}"];
    }
    return ["enum", this.structured ? `{ allowedValues: ${this.constant(values)} }` : "{}"];
  }
  notOneOf(values, v) {
    const matches = [];
    values.forEach((value) => {
      if (value === void 0 || value === null) {
      } else if (isPlainValue(value)) {
        matches.push(equalsCode(value, v));
      } else if (typeof value === "object") {
        matches.push(`(typeof ${v} === 'object' && ${this.constant(import_deep_equal.deepEqual)}(${this.constant(value)}, ${v}))`);
      } else {
        matches.push(`${v} === ${this.constant(value)}`);
      }
    });
    return matches.length ? `!(${matches.join(" || ")})` : "true";
  }
  // The parts run in order; in 'all' mode each one adds its errors, like AllOfType.validate(). They get the field
  // name of the allOf as it is (`path`), so a Schema part names its keys as it does on its own.
  allOf(type, v, path, known = void 0) {
    this.mayRepeat = this.mayRepeat || type.types.length > 1;
    const shared = this.shareMatches(type, v);
    let code = shared.map(({ vars }) => `let ${vars.join(" = false, ")} = false;
`).join("");
    const plain = `${this.scope}:${v}`;
    const declares = !this.plainDeclared.has(plain);
    this.plainDeclared.add(plain);
    if (declares) this.plainUsed.delete(plain);
    const parts = type.types.map((item) => this.generate(item, v, path, known)).join("");
    if (declares) {
      this.plainDeclared.delete(plain);
      if (this.plainUsed.has(plain)) {
        this.plainUsed.delete(plain);
        code += `const ${v}plain = ${v}.__proto__ === OP;
`;
      }
    }
    code += parts;
    shared.forEach(({ oneOf, previous }) => {
      if (previous === void 0) {
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
    const oneOfs = /* @__PURE__ */ new Set();
    type.types.filter((item) => item.constructor === import_unevaluated.UnevaluatedType).forEach(
      (unevaluated) => unevaluated.siblings.filter((sibling) => sibling.constructor === import_types.OneOfType && type.types.includes(sibling)).filter((sibling) => (0, import_unevaluated.staticEvaluatedBy)(unevaluated.kind, sibling) === void 0).forEach((sibling) => oneOfs.add(sibling))
    );
    return [...oneOfs].map((oneOf) => {
      const previous = this.sharedMatches.get(oneOf);
      const vars = oneOf.types.map(() => this.name("matched"));
      this.sharedMatches.set(oneOf, {
        vars,
        v,
        scope: this.scope,
        written: false
      });
      return { oneOf, previous, vars };
    });
  }
  // The variables holding which alternatives of `oneOf` match the value in `v`, when oneOf() wrote them in the
  // function being written; undefined otherwise.
  matchesOf(oneOf, v) {
    const shared = this.sharedMatches.get(oneOf);
    return shared && shared.written && shared.v === v && shared.scope === this.scope ? shared.vars : void 0;
  }
  // Code for a value that no alternative accepts: the errors of every alternative, like AnyOfType.validate().
  noneMatches(types, v, path) {
    if (this.mode === "check") {
      return this.fail;
    }
    if (this.mode === "first") {
      return this.generate(types[0], v, path);
    }
    this.mayRepeat = this.mayRepeat || types.length > 1;
    return types.map((item) => this.generate(item, v, path)).join("");
  }
  // The alternatives get the field name as it is, like the parts of an allOf.
  anyOf(type, v, path) {
    if (!type.types || type.types.length === 0) {
      return "";
    }
    const ok = this.name("ok");
    let code = `let ${ok} = false;
`;
    type.types.forEach((item, i) => {
      const check = this.inlineCheck(item, v, `${ok} = true;`);
      code += i ? `if (!${ok}) {
${check}}
` : check;
    });
    return `${code}if (!${ok}) {
${this.noneMatches(type.types, v, path)}}
`;
  }
  // Counts up to two matching alternatives, like OneOfType.countMatches().
  oneOf(type, v, path, text) {
    if (type.types.length === 0) {
      return {
        checks: [["true", text(" must match exactly one schema, but matches none", "oneOf", "{ passing: 0 }")]]
      };
    }
    const shared = this.sharedMatches.get(type);
    const record = shared && shared.v === v && shared.scope === this.scope ? shared : void 0;
    if (type.discriminator) {
      const others = record ? this.countedOneOf(type, v, path, text, record) : void 0;
      return { checks: [], rest: this.discriminated(type, v, path, record, others) };
    }
    return { checks: [], rest: this.countedOneOf(type, v, path, text, record) };
  }
  // Code counting the alternatives the value matches, up to two, recording them in `record` when given.
  countedOneOf(type, v, path, text, record) {
    const m = this.name("m");
    let rest = `let ${m} = 0;
`;
    type.types.forEach((item, i) => {
      const onPass = record ? `${m} += 1; ${record.vars[i]} = true;` : `${m} += 1;`;
      const check = this.inlineCheck(item, v, onPass);
      rest += i > 1 ? `if (${m} < 2) {
${check}}
` : check;
    });
    if (record) {
      record.written = true;
    }
    const more = this.emit(
      text(" must match exactly one schema, but matches more than one", "oneOf", "{ passing: 2 }")
    );
    if (this.mode === "check") {
      rest += `if (${m} !== 1) { ${this.fail} }
`;
    } else {
      rest += `if (${m} === 0) {
${this.noneMatches(type.types, v, path)}} else if (${m} > 1) { ${more} }
`;
    }
    return rest;
  }
  // Code calling the function that validates `type` in the current mode (see refFunction()), for the value in `v`.
  callFunction(type, v, path) {
    const fn = this.refFunction(type);
    if (this.mode === "first") {
      const e = this.name("e");
      return `const ${e} = ${fn}(${v}, ${path});
if (${e} !== undefined) { return ${e}; }
`;
    }
    return this.mode === "all" ? `out = ${fn}(${v}, ${path}, out);
` : `if (!${fn}(${v})) { ${this.fail} }
`;
  }
  // Code setting variable `d` to what the discriminator of `type` picks for the value in `x`, like OneOfType.pick().
  pickCode(type, x, d) {
    const { tag, mapping, auto } = type.discriminator;
    const t = this.name("t");
    const literal = JSON.stringify(tag);
    const values = [...mapping.keys()];
    const chain = values.map((value) => `${t} === ${JSON.stringify(value)} ? ${mapping.get(value)} : `).join("");
    return `let ${d} = ${import_one_of.EVERY_TYPE};
if (typeof ${x} === 'object' && ${x} !== null && !Array.isArray(${x})) {
const ${t} = H.call(${x}, ${literal}) ? ${x}[${literal}] : undefined;
${d} = ${chain}${auto ? import_one_of.EVERY_TYPE : import_one_of.NO_TYPE};
}
`;
  }
  // Like OneOfType.validate() with a discriminator: an object is checked against the alternative the value of its tag
  // (an own property) picks. An object whose tag picks none gets an error about the tag at its path, or with a
  // discriminator found in a plain oneOf (`auto`) is checked as by oneOf, like other values. Those go to a function
  // of their own (they are rare, and the validator stays small).
  // With `record`, the alternative that matches is recorded there, and `others` checks the other values.
  discriminated(type, v, path, record = void 0, others = void 0) {
    const { tag, mapping, auto } = type.discriminator;
    const t = this.name("t");
    const tagPath = this.keyOf(path, JSON.stringify(tag));
    const error = (suffix, kind) => this.emit(
      messageAt(
        tagPath,
        () => messageCode(this.nameOf(tagPath, false), suffix, this.fold),
        "discriminator",
        `{ error: "${kind}", tag: ${JSON.stringify(tag)}, tagValue: ${t} }`
      )
    );
    const values = [...mapping.keys()];
    const literal = JSON.stringify(tag);
    const plain = `${this.scope}:${v}`;
    const declares = !this.plainDeclared.has(plain);
    this.plainDeclared.add(plain);
    const isPlainOwn = tag in Object.prototype ? "" : `${v}plain || `;
    if (isPlainOwn) this.plainUsed.add(plain);
    let code = declares ? `const ${v}plain = ${v}.__proto__ === OP;
` : "";
    code += `let ${t} = ${v}[${literal}];
`;
    code += `if (${t} !== undefined && !(${isPlainOwn}H.call(${v}, ${literal}))) { ${t} = undefined; }
`;
    type.types.forEach((item, i) => {
      const picks = values.filter((value) => mapping.get(value) === i).map((value) => `${t} === ${JSON.stringify(value)}`);
      let branch = this.generate(item, v, path, "object");
      if (record) {
        const matched = record.vars[i];
        const onFail = this.mode === "check" ? this.fail : this.generate(item, v, path, "object");
        branch = `${this.inlineCheck(item, v, `${matched} = true;`)}if (!${matched}) {
${onFail}}
`;
      }
      code += `${i ? "else " : ""}if (${picks.join(" || ")}) {
${branch}}
`;
    });
    if (declares) {
      this.plainDeclared.delete(plain);
    }
    if (!this.plainOneOfs.has(type)) {
      this.plainOneOfs.set(type, new import_types.OneOfType({ types: type.types, isMandatory: false, isNullable: true }));
    }
    const rest = others || this.callFunction(this.plainOneOfs.get(type), v, path);
    if (auto) {
      const unknown = this.mode === "check" ? this.fail : rest;
      code += `else if (${t} === undefined) {
${rest}} else {
${unknown}}
`;
    } else {
      code += `else if (${t} === undefined) { ${error(" is mandatory", "tag")} }
`;
      code += `else if (typeof ${t} !== 'string') { ${error(" must be a string", "tag")} }
`;
      code += `else { ${error(valuesMessage(values), "mapping")} }
`;
    }
    return `if (typeof ${v} === 'object' && !Array.isArray(${v})) {
${code}} else {
${rest}}
`;
  }
  // Code assigning the defaults ([{ key, value, empty }], see assignDefaults()) missing in the object or array in `v`:
  // each validation assigns a new copy.
  defaultsCode(v, defaults = []) {
    return defaults.map((entry) => {
      const property = `${v}[${JSON.stringify(entry.key)}]`;
      return `if (${missingCode(property, entry)}) { ${property} = ${this.copyCode(entry.value)}; }
`;
    }).join("");
  }
  // Code converting the value in variable `x` for a schema with `spec` (see coerce() in coerce.js) and, with `place`,
  // writing the converted value there (the property or element it was read from).
  coerceCode(spec, x, place = void 0) {
    if (!spec) {
      return "";
    }
    const matches = (value) => spec.types.map((type) => COERCE_TYPE_TESTS[type](value)).join(" || ");
    const c = this.name("c");
    const t = this.name("t");
    let code = `if (${x} !== undefined && !(${matches(x)})) {
let ${c};
`;
    if (spec.array) {
      code += `if (Array.isArray(${x}) && ${x}.length === 1) {
${x} = ${x}[0];
if (${matches(x)}) { ${c} = ${x}; }
}
`;
    }
    const conversions = spec.to.flatMap((type) => COERCE_CODE[type](x, t));
    code += `const ${t} = typeof ${x};
if (${c} === undefined) {
`;
    code += conversions.map(([condition, value], i) => `${i ? "else " : ""}if (${condition}) { ${c} = ${value}; }
`).join("");
    code += `}
if (${c} !== undefined) { ${x} = ${c};${place ? ` ${place} = ${c};` : ""} }
}
`;
    return code;
  }
  // Code of a new copy of a default value.
  copyCode(value) {
    const copy = literalCode(value);
    return copy === void 0 ? `${this.constant(import_defaults.copyDefault)}(${this.constant(value)})` : copy;
  }
  // A keyword of your own, like KeywordType.validate(): its function is called with the value, when the value is of
  // one of its JSON types.
  keyword(type, v, path, name) {
    const applies = type.jsonTypes ? `(${type.jsonTypes.map((jsonType) => KEYWORD_TYPE_CHECKS[jsonType](v)).join(" || ")}) && ` : "";
    const text = typeof type.message === "function" ? () => `${name} + " " + ${this.constant(type.message)}(${v})` : () => `${name} + ${JSON.stringify(` ${type.message}`)}`;
    const passes = type.check instanceof RegExp ? `${this.constant(type.check)}.test(${v})` : `${this.constant(type.check)}(${v})`;
    return [`${applies}!${passes}`, messageAt(path, text, type.keyword)];
  }
  arrayOf(type, v, path, name, text, known) {
    const checks = known === "array" ? [] : [[`!Array.isArray(${v})`, text(" must be an array", "type", "{ type: 'array' }")]];
    if (type.min !== void 0) {
      checks.push([
        `${v}.length < ${this.number(type.min)}`,
        text(` must have at least ${type.min} elements`, "minItems", `{ limit: ${this.number(type.min)} }`)
      ]);
    }
    if (type.max !== void 0) {
      checks.push([
        `${v}.length > ${this.number(type.max)}`,
        text(` must have at most ${type.max} elements`, "maxItems", `{ limit: ${this.number(type.max)} }`)
      ]);
    }
    if (type.unique) {
      checks.push([`${this.constant(import_has_duplicates.hasDuplicates)}(${v})`, text(" must not have duplicate elements", "uniqueItems")]);
    }
    const min = type.minContains === void 0 ? 1 : type.minContains;
    if (type.contains && (min !== 1 || type.maxContains !== void 0)) {
      const count = this.name("count");
      const i = this.name("i");
      const x = this.name("v");
      const stop = type.maxContains === void 0 ? min : type.maxContains + 1;
      const pre = `let ${count} = 0;
for (let ${i} = 0; ${i} < ${v}.length && ${count} < ${this.number(
        stop
      )}; ${i} += 1) {
const ${x} = ${v}[${i}];
${this.inlineCheck(type.contains, x, `${count} += 1;`)}}
`;
      const containsChecks = [];
      if (min > 0) {
        const atLeast = min === 1 ? "one matching element" : `${min} matching elements`;
        containsChecks.push([
          `${count} < ${this.number(min)}`,
          text(` must contain at least ${atLeast}`, "minContains", `{ limit: ${this.number(min)} }`)
        ]);
      }
      if (type.maxContains !== void 0) {
        const atMost = type.maxContains === 1 ? "one matching element" : `${type.maxContains} matching elements`;
        containsChecks.push([
          `${count} > ${this.number(type.maxContains)}`,
          text(` must contain at most ${atMost}`, "maxContains", `{ limit: ${this.number(type.maxContains)} }`)
        ]);
      }
      if (containsChecks.length > 0) {
        containsChecks[0].push(pre);
        checks.push(...containsChecks);
      }
    } else if (type.contains) {
      const found = this.name("found");
      const i = this.name("i");
      const x = this.name("v");
      const pre = `let ${found} = false;
for (let ${i} = 0; ${i} < ${v}.length && !${found}; ${i} += 1) {
const ${x} = ${v}[${i}];
${this.inlineCheck(
        type.contains,
        x,
        `${found} = true;`
      )}}
`;
      checks.push([`!${found}`, text(" must contain at least one matching element", "contains"), pre]);
    }
    let rest = "";
    const defaults = this.defaultsCode(v, type.defaults);
    if (defaults) {
      const first = known === "array" ? 0 : 1;
      if (checks.length > first) {
        const [condition, message, pre = ""] = checks[first];
        checks[first] = [condition, message, defaults + pre];
      } else {
        rest += defaults;
      }
    }
    if (Array.isArray(type.type)) {
      type.type.forEach((item, i) => {
        const x = this.name("v");
        rest += `let ${x} = ${v}[${i}];
${this.coerceCode((0, import_coerce.coerceSpecOf)(item), x, `${v}[${i}]`)}`;
        rest += this.generate(item, x, this.indexOf(path, name, i));
      });
      if (type.additionalType) {
        const i = this.name("i");
        const x = this.name("v");
        rest += `for (let ${i} = ${type.type.length}; ${i} < ${v}.length; ${i} += 1) {
let ${x} = ${v}[${i}];
`;
        rest += this.coerceCode((0, import_coerce.coerceSpecOf)(type.additionalType), x, `${v}[${i}]`);
        rest += `${this.generate(type.additionalType, x, this.indexOf(path, name, i))}}
`;
      }
    } else if (type.type) {
      const i = this.name("i");
      const x = this.name("v");
      rest += `for (let ${i} = 0; ${i} < ${v}.length; ${i} += 1) {
let ${x} = ${v}[${i}];
`;
      rest += this.coerceCode((0, import_coerce.coerceSpecOf)(type.type), x, `${v}[${i}]`);
      rest += `${this.generate(type.type, x, this.indexOf(path, name, i))}}
`;
    }
    return { checks, rest };
  }
  // Name of a function (x, s) that adds to the Set s the keys (kind 'properties') or the indexes ('items') of the
  // value x that `types` evaluate, and returns true when they evaluate all of them, like evaluated() in
  // unevaluated.js. `key` names the function: a type, or an UnevaluatedType for the group of its siblings.
  evaluatedFunction(kind, key, types) {
    const functions = this.evaluatedFunctions[kind];
    if (!functions.has(key)) {
      const name = this.name("evaluated");
      functions.set(key, name);
      const body = this.inScope(() => types.map((item) => this.evaluatedCode(kind, item)).join(""));
      this.functions.push(`function ${name}(x, s) {
${body}return false;
}
`);
    }
    return functions.get(key);
  }
  // Condition on the key in variable `k`: one of the keys or patterns in `known`. Empty when there are none.
  acceptedKey(known, k) {
    const keys = [...known.keys];
    const declared = keys.length <= MAX_INLINE_KEYS ? keys.map((key) => `${k} === ${JSON.stringify(key)}`) : [`${this.constant(known.keys)}.has(${k})`];
    const terms = [...declared, ...known.patterns.map((pattern) => `${this.constant(pattern)}.test(${k})`)];
    return terms.length > 1 ? `(${terms.join(" || ")})` : terms.join("");
  }
  // Statements of an evaluated function (value in x, Set in s) for a part that evaluates the same for every value.
  staticEvaluatedCode(kind, known) {
    if (known.all) {
      return "return true;\n";
    }
    if (kind === "items") {
      const i = this.name("i");
      return known.prefix > 0 ? `for (let ${i} = 0; ${i} < ${known.prefix} && ${i} < x.length; ${i} += 1) { s.add(${i}); }
` : "";
    }
    const k = this.name("k");
    const accepted = this.acceptedKey(known, k);
    return accepted ? `for (const ${k} in x) {
if (H.call(x, ${k}) && (${accepted})) { s.add(${k}); }
}
` : "";
  }
  // Statements of an evaluated function (value in x, Set in s) for what `type` evaluates.
  evaluatedCode(kind, type) {
    const known = (0, import_unevaluated.staticEvaluatedBy)(kind, type);
    if (known !== void 0) {
      return this.staticEvaluatedCode(kind, known);
    }
    const check = (item) => this.checkFunction(item);
    const code = (item) => this.evaluatedCode(kind, item);
    const onMatch = (item) => `if (${check(item)}(x)) {
${code(item)}}
`;
    switch (type.constructor) {
      case import_schema.Schema:
      case import_closed_schema.ClosedSchema: {
        const declared = {
          all: false,
          keys: new Set(type.propertyKeys || type.keys),
          patterns: type.patternTypes.map(({ pattern }) => pattern),
          prefix: 0
        };
        let result = this.staticEvaluatedCode(kind, declared);
        type.dependencies.filter((dependency) => dependency.type).forEach((dependency) => {
          result += `if (H.call(x, ${JSON.stringify(dependency.key)})) {
${onMatch(dependency.type)}}
`;
        });
        return result;
      }
      case import_types.ArrayOfType: {
        const prefix = Array.isArray(type.type) ? type.type.length : 0;
        const i = this.name("i");
        const tuple = this.staticEvaluatedCode(kind, {
          all: false,
          keys: /* @__PURE__ */ new Set(),
          patterns: [],
          prefix
        });
        const contains = `if (${check(type.contains)}(x[${i}])) { s.add(${i}); }
`;
        return `${tuple}for (let ${i} = 0; ${i} < x.length; ${i} += 1) {
${contains}}
`;
      }
      case import_types.AllOfType:
        return type.types.map(code).join("");
      case import_types.AnyOfType:
        return type.types.map(onMatch).join("");
      case import_types.OneOfType: {
        const oks = type.types.map(() => this.name("ok"));
        const d = this.name("d");
        const pick = type.discriminator ? this.pickCode(type, "x", d) : "";
        const picks = (i) => type.discriminator ? `(${d} === ${import_one_of.EVERY_TYPE} || ${d} === ${i}) && ` : "";
        const matches = pick + type.types.map((item, i) => `const ${oks[i]} = ${picks(i)}${check(item)}(x);
`).join("");
        const chosen = type.types.map((item, i) => `if (${oks[i]}) {
${code(item)}}
`).join("");
        return `${matches}if (${oks.join(" + ")} === 1) {
${chosen}}
`;
      }
      case import_types.ConditionalType: {
        const branch = (item) => item ? onMatch(item) : "";
        const ifTrue = `${code(type.ifType)}${branch(type.thenType)}`;
        return `if (${check(type.ifType)}(x)) {
${ifTrue}} else {
${branch(type.elseType)}}
`;
      }
      case import_types.RefType: {
        const target = type.getTarget();
        return `if (${this.evaluatedFunction(kind, target, [target])}(x, s)) { return true; }
`;
      }
      case import_types.WhenType:
        return type.jsonType === import_unevaluated.JSON_TYPES[kind] ? code(type.type) : "";
      case import_unevaluated.UnevaluatedType: {
        const siblings = type.siblings.map(code).join("");
        return type.kind === kind ? `if (${check(type)}(x)) { return true; }
${siblings}` : siblings;
      }
      default:
        return "";
    }
  }
  // Condition that is true when `type` evaluates the key (kind 'properties') or index ('items') in variable `k` of the
  // value in `v`, like evaluated() in unevaluated.js. It adds to `prelude` the statements that compute, once, which
  // subschemas the value satisfies. Undefined when a reference leads to a part that depends on the value, which may
  // be recursive: an evaluated function handles that case.
  evaluatedCondition(kind, type, v, k, prelude) {
    const known = (0, import_unevaluated.staticEvaluatedBy)(kind, type);
    if (known !== void 0) {
      if (known.all) {
        return "true";
      }
      if (kind === "items") {
        return known.prefix > 0 ? `${k} < ${known.prefix}` : "false";
      }
      return this.acceptedKey(known, k) || "false";
    }
    const matches = (item) => {
      const ok = this.name("ok");
      prelude.push(`const ${ok} = ${this.checkFunction(item)}(${v});
`);
      return ok;
    };
    const condition = (item) => this.evaluatedCondition(kind, item, v, k, prelude);
    const any = (parts) => parts.some((part) => part === void 0) ? void 0 : `(${parts.join(" || ")})`;
    switch (type.constructor) {
      case import_schema.Schema:
      case import_closed_schema.ClosedSchema: {
        const declared = {
          keys: new Set(type.propertyKeys || type.keys),
          patterns: type.patternTypes.map(({ pattern }) => pattern)
        };
        const parts = [this.acceptedKey(declared, k) || "false"];
        type.dependencies.filter((dependency) => dependency.type).forEach((dependency) => {
          const ok = this.name("ok");
          const literal = JSON.stringify(dependency.key);
          prelude.push(`const ${ok} = H.call(${v}, ${literal}) && ${this.checkFunction(dependency.type)}(${v});
`);
          const inner = condition(dependency.type);
          parts.push(inner === void 0 ? void 0 : `(${ok} && ${inner})`);
        });
        return any(parts);
      }
      case import_types.ArrayOfType: {
        const prefix = Array.isArray(type.type) ? type.type.length : 0;
        const contains = `${this.checkFunction(type.contains)}(${v}[${k}])`;
        return prefix > 0 ? `(${k} < ${prefix} || ${contains})` : contains;
      }
      case import_types.AllOfType:
        return any(type.types.map(condition));
      case import_types.AnyOfType:
        return any(
          type.types.map((item) => {
            const inner = condition(item);
            return inner === void 0 ? void 0 : `(${matches(item)} && ${inner})`;
          })
        );
      case import_types.OneOfType: {
        let oks = this.matchesOf(type, v);
        if (!oks && type.discriminator) {
          const d = this.name("d");
          prelude.push(this.pickCode(type, v, d));
          oks = type.types.map((item, i) => {
            const ok = this.name("ok");
            prelude.push(
              `const ${ok} = (${d} === ${import_one_of.EVERY_TYPE} || ${d} === ${i}) && ${this.checkFunction(item)}(${v});
`
            );
            return ok;
          });
        }
        oks = oks || type.types.map(matches);
        const one = this.name("one");
        prelude.push(`const ${one} = ${oks.join(" + ")} === 1;
`);
        const chosen = any(
          type.types.map((item, i) => {
            const inner = condition(item);
            return inner === void 0 ? void 0 : `(${oks[i]} && ${inner})`;
          })
        );
        return chosen === void 0 ? void 0 : `(${one} && ${chosen})`;
      }
      case import_types.ConditionalType: {
        const okIf = matches(type.ifType);
        const parts = [];
        const ifPart = condition(type.ifType);
        parts.push(ifPart === void 0 ? void 0 : `(${okIf} && ${ifPart})`);
        [
          [type.thenType, okIf],
          [type.elseType, `!${okIf}`]
        ].forEach(([branch, taken]) => {
          if (branch) {
            const ok = this.name("ok");
            prelude.push(`const ${ok} = ${taken} && ${this.checkFunction(branch)}(${v});
`);
            const inner = condition(branch);
            parts.push(inner === void 0 ? void 0 : `(${ok} && ${inner})`);
          }
        });
        return any(parts);
      }
      case import_types.WhenType:
        return type.jsonType === import_unevaluated.JSON_TYPES[kind] ? condition(type.type) : "false";
      case import_unevaluated.UnevaluatedType: {
        const siblings = any(type.siblings.map(condition));
        if (type.kind !== kind || siblings === void 0) {
          return siblings;
        }
        return `(${matches(type)} || ${siblings})`;
      }
      case import_types.RefType:
        return void 0;
      default:
        return "false";
    }
  }
  // "unevaluatedProperties"/"unevaluatedItems": a loop over the keys or elements the other keywords leave. The loop
  // skips directly what the keywords that evaluate the same for every value evaluate, like "additionalProperties",
  // and what the others evaluate for the value through a condition on the subschemas it satisfies (or, when a
  // reference makes that impossible, through a Set that a generated function fills first).
  unevaluated(type, v, path, name) {
    const isFixed = (item) => (0, import_unevaluated.staticEvaluatedBy)(type.kind, item) !== void 0;
    const known = (0, import_unevaluated.staticEvaluatedByAll)(type.kind, type.siblings.filter(isFixed));
    const varying = type.siblings.filter((item) => !isFixed(item));
    if (known.all) {
      return { checks: [], rest: "" };
    }
    const k = this.name(type.kind === "items" ? "i" : "k");
    const prelude = [];
    const conditions = varying.map((item) => this.evaluatedCondition(type.kind, item, v, k, prelude));
    let evaluated = conditions.includes(void 0) ? void 0 : conditions.join(" || ");
    let collect = prelude.join("");
    let close = "";
    if (evaluated === void 0) {
      const done = this.name("done");
      collect = `const ${done} = new Set();
if (!${this.evaluatedFunction(type.kind, type, varying)}(${v}, ${done})) {
`;
      close = "}\n";
      evaluated = `${done}.has(${k})`;
    }
    const x = this.name("v");
    if (type.kind === "items") {
      const code2 = this.generate(type.type, x, this.indexOf(path, name, k));
      if (!code2) {
        return { checks: [], rest: "" };
      }
      const skip2 = evaluated ? `if (${evaluated}) { continue; }
` : "";
      let rest2 = `if (Array.isArray(${v})) {
${collect}for (let ${k} = ${known.prefix}; ${k} < ${v}.length; ${k} += 1) {
`;
      rest2 += `${skip2}const ${x} = ${v}[${k}];
${code2}}
${close}}
`;
      return { checks: [], rest: rest2 };
    }
    const keyName = this.keyOf(path, k);
    let code;
    if (type.type.constructor === import_types.NeverType) {
      const unexpected = () => `"Unexpected key: " + ${this.nameOf(keyName, false)}`;
      code = this.emit(messageAt(keyName, unexpected, "unevaluatedProperties", `{ property: ${k} }`));
    } else {
      const inner = this.generate(type.type, x, keyName);
      if (!inner) {
        return { checks: [], rest: "" };
      }
      code = `const ${x} = ${v}[${k}];
${inner}`;
    }
    const accepted = [this.acceptedKey(known, k), evaluated].filter(Boolean).join(" || ");
    const skip = accepted ? ` || ${accepted}` : "";
    let rest = `if (typeof ${v} === 'object' && !Array.isArray(${v})) {
${collect}for (const ${k} in ${v}) {
`;
    rest += `if (!H.call(${v}, ${k})${skip}) { continue; }
${code}}
${close}}
`;
    return { checks: [], rest };
  }
  // Same order as Schema.errors(): declared keys, then extra keys, then property counts.
  schema(type, v, path, name, text, known) {
    let keysCode = "";
    const hasDefaults = type.defaults !== void 0 && type.defaults.length > 0;
    const defaultOf = hasDefaults ? new Map(type.defaults.map((entry) => [entry.key, entry])) : void 0;
    type.keys.forEach((key) => {
      const x = this.name("v");
      const literal = JSON.stringify(key);
      const code = this.generate(type.schema[key], x, this.keyOf(path, literal));
      if (code) {
        keysCode += `let ${x} = ${v}[${literal}];
`;
        const isOwn = `(!${v}plain || ${literal} in OP) && !H.call(${v}, ${literal})`;
        this.plainUsed.add(`${this.scope}:${v}`);
        const entry = hasDefaults ? defaultOf.get(key) : void 0;
        if (entry) {
          defaultOf.delete(key);
          const copy = `${x} = ${v}[${literal}] = ${this.copyCode(entry.value)};`;
          keysCode += `if (${missingCode(x, entry)}) { ${copy} } else if (${isOwn}) { ${x} = undefined; }
`;
        } else {
          keysCode += `if (${x} !== undefined && ${isOwn}) { ${x} = undefined; }
`;
        }
        keysCode += this.coerceCode((0, import_coerce.coerceSpecOf)(type.schema[key]), x, `${v}[${literal}]`);
        keysCode += code;
      } else if (hasDefaults && defaultOf.has(key)) {
        keysCode += this.defaultsCode(v, [defaultOf.get(key)]);
        defaultOf.delete(key);
      }
    });
    const isDeclared = this.plainDeclared.has(`${this.scope}:${v}`);
    let rest = keysCode && !isDeclared ? `const ${v}plain = ${v}.__proto__ === OP;
${keysCode}` : keysCode;
    if (hasDefaults) {
      rest = this.defaultsCode(v, [...defaultOf.values()]) + rest;
    }
    const checkExtra = !type.isOpen || type.additionalType || type.removeAdditional;
    const countKeys = type.minProperties !== void 0 || type.maxProperties !== void 0;
    const { patternTypes } = type;
    if (checkExtra || countKeys || patternTypes.length > 0 || type.propertyNameType) {
      const count = this.name("count");
      const k = this.name("k");
      const keyName = this.keyOf(path, k);
      rest += `let ${count} = 0;
for (const ${k} in ${v}) {
`;
      rest += `if (!H.call(${v}, ${k})) { continue; }
${count} += 1;
`;
      if (type.propertyNameType) {
        rest += this.generate(type.propertyNameType, k, this.propertyNameOf(path, k));
      }
      const matched = this.name("matched");
      this.mayRepeat = this.mayRepeat || patternTypes.length > 1;
      if (patternTypes.length > 0) {
        rest += `let ${matched} = false;
`;
        patternTypes.forEach(({ pattern, type: patternType }) => {
          const x = this.name("v");
          rest += `if (${this.constant(pattern)}.test(${k})) {
${matched} = true;
let ${x} = ${v}[${k}];
`;
          rest += this.coerceCode((0, import_coerce.coerceSpecOf)(patternType), x, `${v}[${k}]`);
          rest += `${this.generate(patternType, x, keyName)}}
`;
        });
      }
      if (checkExtra) {
        const keys = type.removeAdditional && type.propertyKeys ? type.propertyKeys : type.keys;
        const declared = keys.length <= MAX_INLINE_KEYS ? keys.map((key) => `${k} === ${JSON.stringify(key)}`).join(" || ") || "false" : `${this.constant(new Set(keys))}.has(${k})`;
        const accepted = patternTypes.length > 0 ? `${declared} || ${matched}` : declared;
        rest += `if (!(${accepted})) {
`;
        const remove = `delete ${v}[${k}];
`;
        if (type.removeAdditional === "delete") {
          rest += remove;
        } else if (type.removeAdditional === "failing") {
          rest += `if (!${this.checkFunction(type.additionalType)}(${v}[${k}])) {
${remove}}
`;
        } else if (!type.isOpen) {
          const unexpected = () => `"Unexpected key: " + ${this.nameOf(keyName, false)}`;
          rest += this.emit(messageAt(keyName, unexpected, "additionalProperties", `{ property: ${k} }`));
        } else {
          const x = this.name("v");
          rest += `let ${x} = ${v}[${k}];
${this.coerceCode((0, import_coerce.coerceSpecOf)(type.additionalType), x, `${v}[${k}]`)}`;
          rest += this.generate(type.additionalType, x, keyName);
        }
        rest += "}\n";
      }
      rest += "}\n";
      if (type.minProperties !== void 0) {
        const message = text(
          ` must have at least ${type.minProperties} properties`,
          "minProperties",
          `{ limit: ${this.number(type.minProperties)} }`
        );
        rest += `if (${count} < ${this.number(type.minProperties)}) { ${this.emit(message)} }
`;
      }
      if (type.maxProperties !== void 0) {
        const message = text(
          ` must have at most ${type.maxProperties} properties`,
          "maxProperties",
          `{ limit: ${this.number(type.maxProperties)} }`
        );
        rest += `if (${count} > ${this.number(type.maxProperties)}) { ${this.emit(message)} }
`;
      }
    }
    rest += this.dependencies(type, v, path);
    return {
      checks: known === "object" ? [] : [
        [
          `typeof ${v} !== 'object' || Array.isArray(${v})`,
          text(" must be an object", "type", "{ type: 'object' }")
        ]
      ],
      rest
    };
  }
  // Like Schema.errors(): a key is present when it is an own property that is not undefined.
  dependencies(type, v, path) {
    const isPresent = (literal) => `(H.call(${v}, ${literal}) && ${v}[${literal}] !== undefined)`;
    return type.dependencies.map(({ key, required, type: dependentType }) => {
      const literal = JSON.stringify(key);
      let code;
      if (required) {
        code = required.map((property) => {
          const propertyLiteral = JSON.stringify(property);
          const missing = this.keyOf(path, propertyLiteral);
          const present = this.nameOf(this.keyOf(path, literal), false);
          const text = () => `${this.nameOf(missing, false)} + " is mandatory when " + ${present} + " is present"`;
          const params = `{ property: ${literal}, missingProperty: ${propertyLiteral} }`;
          const message = messageAt(missing, text, "dependentRequired", params);
          return `if (!${isPresent(propertyLiteral)}) { ${this.emit(message)} }
`;
        }).join("");
      } else {
        code = this.generate(dependentType, v, path);
      }
      return `if (${isPresent(literal)}) {
${code}}
`;
    }).join("");
  }
  // Source of the body of a function that takes the constants (c), the nodes (n) and the helpers r and a, and returns
  // the validation function. standalone.js writes it out with the constants as code. With `shared`, the helpers of
  // the prologue (H, OP, J, P, U) are not written: build() gives them as parameters, made once (V8 then has less code
  // to parse for every schema compiled).
  source(type, shared = false) {
    const main = this.generate(type, "v0", this.rootPath());
    const results = {
      check: ["", "true"],
      first: ["", "undefined"],
      all: [
        "let out;\n",
        this.mayRepeat ? "(out === undefined ? [] : out.length > 1 ? U(out) : out)" : "(out === undefined ? [] : out)"
      ]
    };
    const [declared, end] = results[this.mode];
    const start = this.structured && this.mode !== "check" ? `${declared}let q;
` : declared;
    if (shared) {
      return `"use strict";
${this.functions.join("")}return function validate(v0) {
${start}${main}return ${end};
};`;
    }
    const prologue = [
      '"use strict";',
      "const H = Object.prototype.hasOwnProperty;",
      "const OP = Object.prototype;",
      'function J(fieldName, key) { return fieldName ? fieldName + "." + key : key; }',
      // Adds an error to the list, which is made with the first one.
      "function P(out, e) { if (out === undefined) { return [e]; } out.push(e); return out; }",
      // The list itself when no error repeats, which is the usual case: a new list is only built when one does. Error
      // objects repeat when their messages do.
      this.structured ? "function U(e) { const m = e.map((x) => x.message); for (let i = 1; i < m.length; i += 1) { if (m.indexOf(m[i]) < i) { return e.filter((x, j) => m.indexOf(m[j]) === j); } } return e; }" : "function U(e) { for (let i = 1; i < e.length; i += 1) { if (e.indexOf(e[i]) < i) { return Array.from(new Set(e)); } } return e; }",
      ""
    ].join("\n");
    return `${prologue}${this.functions.join("")}return function validate(v0) {
${start}${main}return ${end};
};`;
  }
  build(type) {
    const source = this.source(type, true);
    const [first, push] = this.structured ? [firstErrorObject, pushErrorObjects] : [firstError, pushErrors];
    const helpers = this.structured ? STRUCTURED_HELPERS : HELPERS;
    return new Function("c", "n", "r", "a", "H", "OP", "J", "P", "U", source)(
      this.constants,
      this.nodes,
      first,
      push,
      ...helpers
    );
  }
}
function compileIsValid(type) {
  return new Generator("check").build(type);
}
function compileFirstError(type) {
  return new Generator("first").build(type);
}
function compileErrors(type) {
  return new Generator("all").build(type);
}
function modeOf(options = {}) {
  const { allErrors = true, errors = true, foldMessages = false } = options;
  if (foldMessages !== true && foldMessages !== false) {
    throw new Error(`Unsupported option "foldMessages": ${JSON.stringify(foldMessages)} is not true or false`);
  }
  if (errors !== true && errors !== false && errors !== "objects") {
    throw new Error(`Unsupported option "errors": ${JSON.stringify(errors)} is not true, false or 'objects'`);
  }
  if (errors === false) {
    return { mode: "check", structured: false, fold: false };
  }
  return {
    mode: allErrors ? "all" : "first",
    structured: errors === "objects",
    fold: foldMessages
  };
}
function generateSource(type, options = {}) {
  const { mode, structured, fold } = modeOf(options);
  const generator = new Generator(mode, structured, fold);
  const source = generator.source(type);
  return {
    mode,
    source,
    constants: generator.constants,
    nodes: generator.nodes
  };
}
function compileType(type, options = {}) {
  const { mode, structured, fold } = modeOf(options);
  const validate = new Generator(mode, structured, fold).build(type);
  if (mode !== "first") {
    return validate;
  }
  return (value) => {
    const error = validate(value);
    return error === void 0 ? [] : [error];
  };
}
(0, import_validate_type.provide)({ compileType });

},
"@xufa/schema/lib/deep-equal.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var deep_equal_exports = {};
__export(deep_equal_exports, {
  deepEqual: () => deepEqual
});
module.exports = __toCommonJS(deep_equal_exports);
function deepEqual(a, b) {
  if (a === b) return true;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a && b && typeof a === "object" && typeof b === "object") {
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
      const keys2 = [...a.keys()];
      for (let i = 0; i < keys2.length; i += 1) {
        const key = keys2[i];
        if (!b.has(key)) return false;
      }
      for (let i = 0; i < keys2.length; i += 1) {
        const key = keys2[i];
        if (!deepEqual(a.get(key), b.get(key))) return false;
      }
      return true;
    }
    if (a instanceof Set && b instanceof Set) {
      if (a.size !== b.size) return false;
      const keys2 = [...a.keys()];
      for (let i = 0; i < keys2.length; i += 1) {
        const key = keys2[i];
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

},
"@xufa/schema/lib/defaults.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var defaults_exports = {};
__export(defaults_exports, {
  assignDefaults: () => assignDefaults,
  copyDefault: () => copyDefault
});
module.exports = __toCommonJS(defaults_exports);
function copyDefault(value) {
  if (Array.isArray(value)) {
    return value.map(copyDefault);
  }
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const copy = {};
    Object.keys(value).forEach((key) => {
      Object.defineProperty(copy, key, {
        value: copyDefault(value[key]),
        enumerable: true,
        writable: true,
        configurable: true
      });
    });
    return copy;
  }
  return value;
}
function assignDefaults(target, defaults) {
  for (let i = 0; i < defaults.length; i += 1) {
    const { key, value, empty } = defaults[i];
    const current = target[key];
    if (current === void 0 || empty && (current === null || current === "")) {
      target[key] = copyDefault(value);
    }
  }
}

},
"@xufa/schema/lib/error-objects.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var error_objects_exports = {};
__export(error_objects_exports, {
  errorObject: () => errorObject,
  pathName: () => pathName
});
module.exports = __toCommonJS(error_objects_exports);
function pathName(path) {
  let name;
  for (let i = 0; i < path.length; i += 1) {
    const segment = path[i];
    if (typeof segment === "number") {
      name = `${name === void 0 ? "Value" : name}[${segment}]`;
    } else if (segment !== null && typeof segment === "object") {
      return `Key ${name ? `${name}.${segment.key}` : segment.key}`;
    } else {
      name = name ? `${name}.${segment}` : segment;
    }
  }
  return name === void 0 ? "Value" : name;
}
function errorObject(path, keyword, params, message) {
  const last = path[path.length - 1];
  const isPropertyName = last !== null && typeof last === "object";
  const keys = isPropertyName ? path.slice(0, -1).concat(last.key) : path.slice();
  let pointer = "";
  for (let i = 0; i < keys.length; i += 1) {
    const key = `${keys[i]}`;
    pointer += key.includes("~") || key.includes("/") ? `/${key.replace(/~/g, "~0").replace(/\//g, "~1")}` : `/${key}`;
  }
  const error = { path: keys, pointer, keyword, params, message };
  if (isPropertyName) {
    error.propertyName = true;
  }
  return error;
}

},
"@xufa/schema/lib/formats.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var formats_exports = {};
__export(formats_exports, {
  FORMATS: () => FORMATS,
  FORMAT_COMPARES: () => FORMAT_COMPARES,
  FORMAT_FUNCTIONS: () => FORMAT_FUNCTIONS,
  isRfc1123Hostname: () => isRfc1123Hostname,
  matchesFormat: () => matchesFormat
});
module.exports = __toCommonJS(formats_exports);
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
    offset = (match[5] === "-" ? -1 : 1) * (offsetHour * 60 + offsetMinute);
  }
  return second < 60 || (hour * 60 + minute - offset + 1440) % 1440 === 23 * 60 + 59;
}
function isDateTime(value) {
  const match = /^(.{10})[tT](.+)$/.exec(value);
  return match !== null && isDate(match[1]) && isTime(match[2]);
}
function isDuration(value) {
  return /^P(?:(?:\d+Y(?:\d+M(?:\d+D)?)?|\d+M(?:\d+D)?|\d+D)(?:T(?:\d+H(?:\d+M(?:\d+S)?)?|\d+M(?:\d+S)?|\d+S))?|T(?:\d+H(?:\d+M(?:\d+S)?)?|\d+M(?:\d+S)?|\d+S)|\d+W)$/.test(
    value
  );
}
function isIpv4(value) {
  return /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(value);
}
function isIpv6(value) {
  if (!/^[0-9A-Fa-f:.]+$/.test(value)) {
    return false;
  }
  const halves = value.split("::");
  if (halves.length > 2) {
    return false;
  }
  const groups = halves.map((half) => half === "" ? [] : half.split(":"));
  const all = groups[groups.length - 1];
  let count = 0;
  if (all.length > 0 && all[all.length - 1].includes(".")) {
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
function punycodeAdapt(delta, points, isFirst) {
  let result = Math.floor(delta / (isFirst ? 700 : 2));
  result += Math.floor(result / points);
  let k = 0;
  while (result > 455) {
    result = Math.floor(result / 35);
    k += 36;
  }
  return k + Math.floor(36 * result / (result + 38));
}
function punycodeDecode(input) {
  const output = [];
  const delimiter = input.lastIndexOf("-");
  for (let j = 0; j < Math.max(delimiter, 0); j += 1) {
    if (input.charCodeAt(j) >= 128) {
      return void 0;
    }
    output.push(input.charCodeAt(j));
  }
  let n = 128;
  let bias = 72;
  let i = 0;
  for (let index = delimiter < 0 ? 0 : delimiter + 1; index < input.length; ) {
    const old = i;
    let weight = 1;
    for (let k = 36; ; k += 36) {
      if (index >= input.length) {
        return void 0;
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
      if (digit >= 36 || digit > Math.floor((2147483647 - i) / weight)) {
        return void 0;
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
    if (n > 1114111) {
      return void 0;
    }
    output.splice(i, 0, n);
    i += 1;
  }
  return String.fromCodePoint(...output);
}
function punycodeEncode(input) {
  const points = Array.from(input, (char) => char.codePointAt(0));
  const digit = (d) => String.fromCharCode(d < 26 ? 97 + d : 22 + d);
  let output = points.filter((point) => point < 128).map((point) => String.fromCharCode(point)).join("");
  const basic = output.length;
  let handled = basic;
  if (basic > 0) {
    output += "-";
  }
  let n = 128;
  let delta = 0;
  let bias = 72;
  while (handled < points.length) {
    let m = 1114111;
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
          output += digit(t + (q - t) % (36 - t));
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
function bidiClass(char) {
  if (/[\u0600-\u0605\u0660-\u0669\u066B\u066C\u06DD\u0890\u0891\u08E2]/u.test(char)) {
    return "AN";
  }
  if (/[0-9\u06F0-\u06F9\u00B2\u00B3\u00B9\u2070-\u2079\u2080-\u2089\uFF10-\uFF19]/u.test(char)) {
    return "EN";
  }
  if (/[\p{Mn}\p{Me}]/u.test(char)) {
    return "NSM";
  }
  if (/[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}]/u.test(char)) {
    return "AL";
  }
  if (/[\p{Script=Hebrew}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\u200F]/u.test(char)) {
    return "R";
  }
  if (/[+-]/.test(char)) {
    return "ES";
  }
  if (/[,./:\u00A0]/.test(char)) {
    return "CS";
  }
  if (/[#$%\u00A2-\u00A5\u00B0\u00B1]/u.test(char)) {
    return "ET";
  }
  return /[\p{L}\p{Mc}]/u.test(char) ? "L" : "ON";
}
function hasValidBidi(label) {
  const classes = Array.from(label, bidiClass);
  const first = classes[0];
  const last = classes.filter((type) => type !== "NSM").pop();
  if (first === "R" || first === "AL") {
    return classes.every((type) => ["R", "AL", "AN", "EN", "ES", "CS", "ET", "ON", "NSM"].includes(type)) && ["R", "AL", "EN", "AN"].includes(last) && !(classes.includes("EN") && classes.includes("AN"));
  }
  if (first === "L") {
    return classes.every((type) => ["L", "EN", "ES", "CS", "ET", "ON", "NSM"].includes(type)) && ["L", "EN"].includes(last);
  }
  return false;
}
function isULabel(label) {
  const chars = Array.from(label);
  if (label.length === 0 || label.normalize("NFC") !== label || /^\p{M}/u.test(label)) {
    return false;
  }
  if (label.startsWith("-") || label.endsWith("-") || label.slice(2, 4) === "--") {
    return false;
  }
  const virama = /[\u094D\u09CD\u0A4D\u0ACD\u0B4D\u0BCD\u0C4D\u0CCD\u0D3B\u0D3C\u0D4D\u0DCA\u0E3A\u0F84\u1039\u103A\u1714\u1734\u17D2\u1A60\u1B44\u1BAA\u1BAB\u1BF2\u1BF3\u2D7F\uA806\uA8C4\uA953\uA9C0\uAAF6\uABED]/u;
  const joining = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mongolian}]/u;
  return chars.every((char, i) => {
    const before = chars[i - 1];
    const after = chars[i + 1];
    switch (char) {
      case "\xDF":
      case "\u03C2":
      case "\u06FD":
      case "\u06FE":
      case "\u0F0B":
      case "\u3007":
        return true;
      case "\xB7":
        return before === "l" && after === "l";
      case "\u0375":
        return after !== void 0 && /\p{Script=Greek}/u.test(after);
      case "\u05F3":
      case "\u05F4":
        return before !== void 0 && /\p{Script=Hebrew}/u.test(before);
      case "\u30FB":
        return chars.some(
          (other) => /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(other) && other !== "\u30FB"
        );
      case "\u200D":
        return before !== void 0 && virama.test(before);
      case "\u200C": {
        if (before !== void 0 && virama.test(before)) {
          return true;
        }
        const left = chars.slice(0, i).reverse().find((other) => !/\p{Mn}/u.test(other));
        const right = chars.slice(i + 1).find((other) => !/\p{Mn}/u.test(other));
        return left !== void 0 && right !== void 0 && joining.test(left) && joining.test(right);
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
    if (/[\u0640\u07FA\u302E\u302F\u3031-\u3035\u303B]/u.test(char)) {
      return false;
    }
    return /[\p{Ll}\p{Lo}\p{Lm}\p{Mn}\p{Mc}\p{Nd}-]/u.test(char) && char.normalize("NFKC").toLowerCase() === char;
  });
}
function hasValidLabels(value, isIdn) {
  if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(value) && !/(?:^|\.)[A-Za-z0-9-]{2}--/.test(value)) {
    return value.length <= 253;
  }
  const mapped = isIdn ? value.normalize("NFKC").replace(/[\u3002\uFF0E\uFF61]/gu, ".").replace(/[\u00AD\u200B\u2060\uFEFF\u180B-\u180D\uFE00-\uFE0F]/gu, "").toLowerCase() : value;
  if (!isIdn && !/^[\x21-\x7E]*$/.test(mapped)) {
    return false;
  }
  const labels = mapped.split(".");
  const unicode = [];
  const ascii = [];
  const valid = labels.every((label) => {
    if (/^xn--/i.test(label)) {
      const decoded = punycodeDecode(label.slice(4).toLowerCase());
      if (decoded === void 0 || Array.from(decoded).every((char) => char.charCodeAt(0) < 128) || punycodeEncode(decoded) !== label.slice(4).toLowerCase() || !isULabel(decoded)) {
        return false;
      }
      unicode.push(decoded);
      ascii.push(label);
      return label.length <= 63;
    }
    if (Array.from(label).every((char) => char.charCodeAt(0) < 128)) {
      unicode.push(label);
      ascii.push(label);
      return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label) && !(label.slice(2, 4) === "--" && !/^xn--/i.test(label));
    }
    if (!isIdn || !isULabel(label)) {
      return false;
    }
    unicode.push(label);
    ascii.push(`xn--${punycodeEncode(label)}`);
    return ascii[ascii.length - 1].length <= 63;
  });
  if (!valid || ascii.join(".").length > 253) {
    return false;
  }
  const isRtl = unicode.some((label) => Array.from(label).some((char) => ["R", "AL", "AN"].includes(bidiClass(char))));
  return !isRtl || unicode.every(hasValidBidi);
}
function isHostname(value) {
  return hasValidLabels(value, false);
}
function isRfc1123Hostname(value) {
  return value.length <= 253 && value.split(".").every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}
function isIdnHostname(value) {
  return hasValidLabels(value, true);
}
function isEmailWith(value, isIdn, isHost) {
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) {
    return false;
  }
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dotAtom = isIdn ? /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~\u0080-\u{10FFFF}-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~\u0080-\u{10FFFF}-]+)*$/u : /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
  const quoted = isIdn ? /^"(?:[\x20\x21\x23-\x5B\x5D-\x7E\u0080-\u{10FFFF}]|\\[\x20-\x7E])*"$/u : /^"(?:[\x20\x21\x23-\x5B\x5D-\x7E]|\\[\x20-\x7E])*"$/;
  if (!dotAtom.test(local) && !quoted.test(local)) {
    return false;
  }
  const literal = domain.charCodeAt(0) === 91 ? /^\[(?:IPv6:(.+)|(.+))\]$/i.exec(domain) : null;
  if (literal) {
    return literal[1] !== void 0 ? isIpv6(literal[1]) : isIpv4(literal[2]);
  }
  return isHost(domain);
}
function isEmail(value) {
  return isEmailWith(value, false, isHostname);
}
function isIdnEmail(value) {
  return isEmailWith(value, true, isIdnHostname);
}
function isRegex(value) {
  try {
    RegExp(value, "u");
    return true;
  } catch (e) {
    return false;
  }
}
const PCT = "%[0-9A-Fa-f]{2}";
const SUB_DELIMS = "!$&'()*+,;=";
const UCSCHAR = "\\u00A0-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFEF\\u{10000}-\\u{1FFFD}\\u{20000}-\\u{2FFFD}\\u{30000}-\\u{3FFFD}\\u{40000}-\\u{4FFFD}\\u{50000}-\\u{5FFFD}\\u{60000}-\\u{6FFFD}\\u{70000}-\\u{7FFFD}\\u{80000}-\\u{8FFFD}\\u{90000}-\\u{9FFFD}\\u{A0000}-\\u{AFFFD}\\u{B0000}-\\u{BFFFD}\\u{C0000}-\\u{CFFFD}\\u{D0000}-\\u{DFFFD}\\u{E1000}-\\u{EFFFD}";
const IPRIVATE = "\\uE000-\\uF8FF\\u{F0000}-\\u{FFFFD}\\u{100000}-\\u{10FFFD}";
const H16 = "[0-9A-Fa-f]{1,4}";
const DEC_OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
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
  `(?:(?:${H16}:){0,6}${H16})?::`
].join("|");
function uriPattern(isIri, isReference) {
  const unreserved = `A-Za-z0-9\\-._~${isIri ? UCSCHAR : ""}`;
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
  const query = `(?:${pchar}|[/?${isIri ? IPRIVATE : ""}])*`;
  const fragment = `(?:${pchar}|[/?])*`;
  const tail = `(?:\\?${query})?(?:#${fragment})?`;
  const uri = `[A-Za-z][A-Za-z0-9+\\-.]*:(?://${authority}${pathAbempty}|${pathAbsolute}|${pathRootless}|)${tail}`;
  const relative = `(?://${authority}${pathAbempty}|${pathAbsolute}|${pathNoscheme}|)${tail}`;
  return new RegExp(isReference ? `^(?:${uri}|${relative})$` : `^${uri}$`, "u");
}
function compareDate(d1, d2) {
  if (!(d1 && d2)) {
    return void 0;
  }
  if (d1 > d2) {
    return 1;
  }
  return d1 < d2 ? -1 : 0;
}
function compareTime(t1, t2) {
  if (!(t1 && t2)) {
    return void 0;
  }
  const ms1 = (/* @__PURE__ */ new Date(`2020-01-01T${t1}`)).valueOf();
  const ms2 = (/* @__PURE__ */ new Date(`2020-01-01T${t2}`)).valueOf();
  return ms1 && ms2 ? ms1 - ms2 : void 0;
}
function compareDateTime(dt1, dt2) {
  if (!(dt1 && dt2)) {
    return void 0;
  }
  const ms1 = new Date(dt1).valueOf();
  const ms2 = new Date(dt2).valueOf();
  return ms1 && ms2 ? ms1 - ms2 : void 0;
}
const FORMAT_COMPARES = {
  date: compareDate,
  time: compareTime,
  "date-time": compareDateTime
};
const FORMATS = {
  date: isDate,
  time: isTime,
  "date-time": isDateTime,
  duration: isDuration,
  email: isEmail,
  "idn-email": isIdnEmail,
  hostname: isHostname,
  "idn-hostname": isIdnHostname,
  ipv4: isIpv4,
  ipv6: isIpv6,
  uri: uriPattern(false, false),
  "uri-reference": uriPattern(false, true),
  iri: uriPattern(true, false),
  "iri-reference": uriPattern(true, true),
  uuid: /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/,
  // RFC 6570: literals are any character but controls, space and '"%<>\^`{|}'; variable names may have dots.
  /* eslint-disable no-control-regex -- the literals exclude the control characters */
  "uri-template": /^(?:[^\x00-\x20\x7F"%<>\\^`{|}]|%[0-9A-Fa-f]{2}|\{[+#./;?&=,!@|]?(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+(?:\.(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+)*(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+(?:\.(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+)*(?::[1-9][0-9]{0,3}|\*)?)*\})*$/,
  /* eslint-enable no-control-regex */
  "json-pointer": /^(?:\/(?:[^~/]|~0|~1)*)*$/,
  "relative-json-pointer": /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
  regex: isRegex
};
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
  isRegex
};
function matchesFormat(check, value) {
  return typeof check === "function" ? check(value) : check.test(value);
}

},
"@xufa/schema/lib/infer.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var infer_exports = {};
__export(infer_exports, {
  inferJsonSchema: () => inferJsonSchema,
  inferSchemaCode: () => inferSchemaCode
});
module.exports = __toCommonJS(infer_exports);
var import_formats = require("./formats.js");
const FORMAT_CANDIDATES = ["date-time", "date", "time", "email", "uuid", "ipv4", "ipv6", "uri"];
const matchesCandidate = (name, text) => name === "uri" ? /^[a-z][a-z0-9+.-]*:\/\//i.test(text) && (0, import_formats.matchesFormat)(import_formats.FORMATS.uri, text) : (0, import_formats.matchesFormat)(import_formats.FORMATS[name], text);
const DRAFT_URIS = {
  "draft-04": "http://json-schema.org/draft-04/schema#",
  "draft-06": "http://json-schema.org/draft-06/schema#",
  "draft-07": "http://json-schema.org/draft-07/schema#",
  "2019-09": "https://json-schema.org/draft/2019-09/schema",
  "2020-12": "https://json-schema.org/draft/2020-12/schema"
};
const isIdentifier = (key) => /^[A-Za-z_$][\w$]*$/.test(key);
const isPlainObject = (value) => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const newNode = () => ({
  null: false,
  boolean: false,
  integer: false,
  number: false,
  string: null,
  array: null,
  object: null
});
function add(node, value, path) {
  if (value === null) {
    node.null = true;
  } else if (typeof value === "boolean") {
    node.boolean = true;
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot infer a schema: ${value} at ${path || "the value"} is not a JSON value`);
    }
    node[Number.isInteger(value) ? "integer" : "number"] = true;
  } else if (typeof value === "string") {
    node.string = node.string || { formats: FORMAT_CANDIDATES };
    node.string.formats = node.string.formats.filter((name) => matchesCandidate(name, value));
  } else if (Array.isArray(value)) {
    node.array = node.array || { items: null };
    value.forEach((item, index) => {
      node.array.items = node.array.items || newNode();
      add(node.array.items, item, `${path}[${index}]`);
    });
  } else if (isPlainObject(value)) {
    node.object = node.object || { count: 0, keys: /* @__PURE__ */ new Map() };
    node.object.count += 1;
    Object.keys(value).forEach((key) => {
      if (value[key] === void 0) {
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
    const what = value instanceof Date ? "a Date (use its ISO string)" : `a ${typeof value}`;
    throw new Error(`Cannot infer a schema: ${path || "the value"} is ${what}, not a JSON value`);
  }
}
function optionsOf(options) {
  const { closed = false, formats = true, draft = "2020-12" } = options;
  if (!Object.prototype.hasOwnProperty.call(DRAFT_URIS, draft)) {
    throw new Error(`Unsupported option "draft": "${draft}" is not one of ${Object.keys(DRAFT_URIS).join(", ")}`);
  }
  return { closed: closed === true, formats: formats !== false, draft };
}
function modelOf(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error("Cannot infer a schema: expected a non-empty array of sample values");
  }
  const root = newNode();
  samples.forEach((sample) => add(root, sample, ""));
  return root;
}
function typesOf(node) {
  const types = [];
  if (node.object) types.push("object");
  if (node.array) types.push("array");
  if (node.string) types.push("string");
  if (node.number) types.push("number");
  else if (node.integer) types.push("integer");
  if (node.boolean) types.push("boolean");
  return types;
}
const formatOf = (node, options) => options.formats && node.string.formats[0] || void 0;
function toJsonSchema(node, options) {
  const types = typesOf(node);
  if (types.length === 0) {
    return {};
  }
  const allTypes = node.null ? [...types, "null"] : types;
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
function inferJsonSchema(samples, options = {}) {
  const settings = optionsOf(options);
  return { $schema: DRAFT_URIS[settings.draft], ...toJsonSchema(modelOf(samples), settings) };
}
const quote = (text) => `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
function toCode(node, options, extra, indent, used) {
  const pad = " ".repeat(indent);
  const types = typesOf(node);
  const settings = [...extra];
  const use = (name) => {
    used.add(name);
    return name;
  };
  const call = (name, own = []) => {
    const all = [...own, ...settings];
    return `${use(name)}(${all.length ? `{ ${all.join(", ")} }` : ""})`;
  };
  if (types.length === 0) {
    return call("Any", ["isNullable: true"]);
  }
  if (node.null) {
    settings.push("isNullable: true");
  }
  const codeOf = (type, own) => {
    switch (type) {
      case "string": {
        const format = formatOf(node, options);
        return call("String", [...own, ...format ? [`format: ${quote(format)}`] : []]);
      }
      case "integer":
        return call("Integer", own);
      case "number":
        return call("Float", own);
      case "boolean":
        return call("Boolean", own);
      case "array": {
        const { items } = node.array;
        const typeOption = items ? [`type: ${toCode(items, options, [], indent, used)}`] : [];
        return call("ArrayOf", [...typeOption, ...own]);
      }
      default: {
        const name = use(options.closed ? "ClosedSchema" : "Schema");
        const entries = [...node.object.keys].map(([key, entry]) => {
          const optional = entry.count === node.object.count ? [] : ["isMandatory: false"];
          const value = toCode(entry.node, options, optional, indent + 2, used);
          return `${pad}  ${isIdentifier(key) ? key : quote(key)}: ${value},`;
        });
        const body = entries.length ? `{
${entries.join("\n")}
${pad}}` : "{}";
        const all = [...own, ...settings];
        return `new ${name}(${body}${all.length ? `, { ${all.join(", ")} }` : ""})`;
      }
    }
  };
  if (types.length === 1) {
    return codeOf(types[0], []);
  }
  const inner = types.map((type) => toCode({ ...newNode(), [type]: node[type] }, options, [], indent + 2, used));
  return call("AnyOf", [`types: [${inner.join(", ")}]`]);
}
function inferSchemaCode(samples, options = {}) {
  const settings = optionsOf(options);
  const { name = "schema", module: module2 = "commonjs" } = options;
  if (!isIdentifier(name)) {
    throw new Error(`Unsupported option "name": "${name}" is not a JavaScript identifier`);
  }
  if (!["commonjs", "esm", "none"].includes(module2)) {
    throw new Error(`Unsupported option "module": "${module2}" is not one of commonjs, esm, none`);
  }
  const used = /* @__PURE__ */ new Set();
  const code = toCode(modelOf(samples), settings, [], 0, used);
  const names = [...used].sort().join(", ");
  const header = {
    commonjs: `const { ${names} } = require('@xufa/schema');

`,
    esm: `import { ${names} } from '@xufa/schema';

`,
    none: ""
  }[module2];
  return `${header}const ${name} = ${code};
`;
}

},
"@xufa/schema/lib/json-schema-refs.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var json_schema_refs_exports = {};
__export(json_schema_refs_exports, {
  RefIndex: () => RefIndex,
  documentsOf: () => documentsOf,
  draftOfUri: () => draftOfUri,
  isLegacy: () => isLegacy
});
module.exports = __toCommonJS(json_schema_refs_exports);
const DEFAULT_BASE = "xufa-schema://schema/root.json";
const SCHEMA_KEYWORDS = [
  "additionalItems",
  "additionalProperties",
  "contains",
  "else",
  "if",
  "items",
  "not",
  "propertyNames",
  "then",
  "contentSchema",
  "unevaluatedItems",
  "unevaluatedProperties"
];
const SCHEMA_MAP_KEYWORDS = [
  "definitions",
  "$defs",
  "dependencies",
  "dependentSchemas",
  "patternProperties",
  "properties"
];
const SCHEMA_LIST_KEYWORDS = ["allOf", "anyOf", "items", "oneOf", "prefixItems"];
const CHILD_ORDER = /* @__PURE__ */ Object.create(null);
SCHEMA_KEYWORDS.forEach((keyword, i) => {
  CHILD_ORDER[keyword] = i;
});
SCHEMA_MAP_KEYWORDS.forEach((keyword, i) => {
  CHILD_ORDER[keyword] = SCHEMA_KEYWORDS.length + i;
});
const LIST_ORDER = /* @__PURE__ */ Object.create(null);
SCHEMA_LIST_KEYWORDS.forEach((keyword, i) => {
  LIST_ORDER[keyword] = SCHEMA_KEYWORDS.length + SCHEMA_MAP_KEYWORDS.length + i;
});
const MAP_START = SCHEMA_KEYWORDS.length;
const LIST_START = SCHEMA_KEYWORDS.length + SCHEMA_MAP_KEYWORDS.length;
const LEGACY_DRAFTS = ["draft-04", "draft-06", "draft-07"];
const isLegacy = (draft) => LEGACY_DRAFTS.includes(draft);
const idKeyword = (draft) => draft === "draft-04" ? "id" : "$id";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
function resolveUri(ref, base) {
  try {
    return new URL(ref, base).href;
  } catch (e) {
    return void 0;
  }
}
function splitFragment(uri) {
  const index = uri.indexOf("#");
  return index === -1 ? [uri, ""] : [uri.slice(0, index), uri.slice(index + 1)];
}
function decode(text) {
  try {
    return decodeURIComponent(text);
  } catch (e) {
    return void 0;
  }
}
function followPointer(node, pointer) {
  const tokens = pointer.split("/").slice(1).map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current = node;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (Array.isArray(current) && /^(0|[1-9][0-9]*)$/.test(token)) {
      current = current[Number(token)];
    } else if (current !== null && typeof current === "object" && !Array.isArray(current) && hasOwn(current, token)) {
      current = current[token];
    } else {
      return void 0;
    }
  }
  return current;
}
function documentsOf(schemas) {
  if (schemas === void 0) {
    return [];
  }
  let entries;
  if (Array.isArray(schemas)) {
    entries = schemas.map((schema) => [schema && (typeof schema.$id === "string" ? schema.$id : schema.id), schema]);
  } else if (isObject(schemas)) {
    entries = Object.entries(schemas);
  } else {
    throw new Error('Unsupported JSON Schema option "schemas": expected an object of schemas by URI or an array');
  }
  return entries.map(([uri, schema]) => {
    const absolute = typeof uri === "string" && uri !== "" ? resolveUri(uri, DEFAULT_BASE) : void 0;
    const [document, fragment] = absolute === void 0 ? [] : splitFragment(absolute);
    if (absolute === void 0 || fragment !== "") {
      throw new Error(`Unsupported JSON Schema option "schemas": "${uri}" is not a URI without fragment`);
    }
    return { uri: document, schema };
  });
}
const DRAFT_URIS = {
  "http://json-schema.org/draft-04/schema": "draft-04",
  "https://json-schema.org/draft-04/schema": "draft-04",
  "http://json-schema.org/draft-06/schema": "draft-06",
  "https://json-schema.org/draft-06/schema": "draft-06",
  "http://json-schema.org/draft-07/schema": "draft-07",
  "https://json-schema.org/draft-07/schema": "draft-07",
  "https://json-schema.org/draft/2019-09/schema": "2019-09",
  "http://json-schema.org/draft/2019-09/schema": "2019-09",
  "https://json-schema.org/draft/2020-12/schema": "2020-12",
  "http://json-schema.org/draft/2020-12/schema": "2020-12"
};
function draftOfUri(uri) {
  return typeof uri === "string" ? DRAFT_URIS[uri.replace(/#$/, "")] : void 0;
}
const VOCABULARY_KEYWORDS = {
  validation: [
    "type",
    "enum",
    "const",
    "multipleOf",
    "maximum",
    "exclusiveMaximum",
    "minimum",
    "exclusiveMinimum",
    "maxLength",
    "minLength",
    "pattern",
    "maxItems",
    "minItems",
    "uniqueItems",
    "maxContains",
    "minContains",
    "maxProperties",
    "minProperties",
    "required",
    "dependentRequired"
  ],
  applicator: [
    "prefixItems",
    "items",
    "additionalItems",
    "contains",
    "additionalProperties",
    "properties",
    "patternProperties",
    "dependentSchemas",
    "propertyNames",
    "if",
    "then",
    "else",
    "allOf",
    "anyOf",
    "oneOf",
    "not"
  ],
  unevaluated: ["unevaluatedItems", "unevaluatedProperties"]
};
const KNOWN_VOCABULARIES = [
  "core",
  "applicator",
  "unevaluated",
  "validation",
  "meta-data",
  "format",
  "format-annotation",
  "format-assertion",
  "content"
];
function ignoredKeywords(vocabulary, draft) {
  const prefix = `https://json-schema.org/draft/${draft}/vocab/`;
  const listed = /* @__PURE__ */ new Set();
  Object.entries(vocabulary).forEach(([uri, isRequired]) => {
    const name = uri.startsWith(prefix) ? uri.slice(prefix.length) : void 0;
    if (name !== void 0 && KNOWN_VOCABULARIES.includes(name)) {
      listed.add(name);
    } else if (isRequired === true) {
      throw new Error(`Unsupported JSON Schema: the meta-schema requires the vocabulary "${uri}"`);
    }
  });
  const ignored = /* @__PURE__ */ new Set();
  Object.entries(VOCABULARY_KEYWORDS).forEach(([name, keywords]) => {
    const owner = draft === "2019-09" && name === "unevaluated" ? "applicator" : name;
    if (!listed.has(owner)) {
      keywords.forEach((keyword) => ignored.add(keyword));
    }
  });
  return ignored;
}
class RefIndex {
  // `draft` is the one of the root (by default the one its "$schema" names), and of the resources that name none and
  // are not inside one that does.
  constructor(root, schemas = void 0, draft = void 0) {
    this.root = root;
    const documents = documentsOf(schemas);
    this.documents = new Map(documents.map(({ uri, schema }) => [uri, schema]));
    this.rootDialect = draft === void 0 ? this.dialectOf(root.$schema) || { draft: "draft-07" } : { draft };
    this.draft = this.rootDialect.draft;
    this.dialects = /* @__PURE__ */ new Map();
    this.resources = /* @__PURE__ */ new Map([[DEFAULT_BASE, root]]);
    this.anchors = /* @__PURE__ */ new Map();
    this.dynamicAnchors = /* @__PURE__ */ new Map();
    this.bases = /* @__PURE__ */ new Map();
    this.nodeDialects = /* @__PURE__ */ new Map();
    this.views = /* @__PURE__ */ new Map();
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
    if (draft !== void 0) {
      return { draft };
    }
    const meta = typeof schemaUri === "string" ? this.documents.get(schemaUri.replace(/#$/, "")) : void 0;
    const metaDraft = isObject(meta) ? draftOfUri(meta.$schema) : void 0;
    if (metaDraft === void 0) {
      return void 0;
    }
    const hasVocabulary = !isLegacy(metaDraft) && isObject(meta.$vocabulary);
    return {
      draft: metaDraft,
      ignored: hasVocabulary ? ignoredKeywords(meta.$vocabulary, metaDraft) : void 0
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
  // Whether the vocabularies of the resource of a node leave out keywords (then viewOf() gives a copy without them).
  ignoresKeywords(node) {
    const dialect = this.nodeDialects.get(node);
    return dialect !== void 0 && dialect.ignored !== void 0;
  }
  // The first document registered for a URI keeps it.
  addResource(uri, node) {
    if (!this.resources.has(uri)) {
      this.resources.set(uri, node);
    }
  }
  addDynamicAnchor(uri, name, node) {
    if (!this.dynamicAnchors.has(uri)) {
      this.dynamicAnchors.set(uri, /* @__PURE__ */ new Map());
    }
    const anchors = this.dynamicAnchors.get(uri);
    if (!anchors.has(name)) {
      anchors.set(name, node);
    }
  }
  // Dynamic anchors of a resource, by name.
  dynamicAnchorsOf(uri) {
    return this.dynamicAnchors.get(uri) || /* @__PURE__ */ new Map();
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
    let dialect = parentDialect;
    if (node === this.root) dialect = this.rootDialect;
    else if (node.$schema !== void 0) dialect = this.dialectOf(node.$schema) || parentDialect;
    const { draft } = dialect;
    let base = parentBase;
    const id = node[idKeyword(draft)];
    if (typeof id === "string" && (node.$ref === void 0 || !isLegacy(draft))) {
      const uri = resolveUri(id, parentBase);
      if (uri !== void 0) {
        const [document, fragment] = splitFragment(uri);
        const anchor = `${document}#${decode(fragment)}`;
        if (fragment === "") {
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
    if (!isLegacy(draft) && typeof node.$anchor === "string") {
      this.addAnchor(`${base}#${node.$anchor}`, node);
    }
    if (draft === "2020-12" && typeof node.$dynamicAnchor === "string") {
      this.addAnchor(`${base}#${node.$dynamicAnchor}`, node);
      this.addDynamicAnchor(base, node.$dynamicAnchor, node);
    }
    if (draft === "2019-09" && node.$recursiveAnchor === true && this.resources.get(base) === node) {
      this.addDynamicAnchor(base, "", node);
    }
    this.bases.set(node, base);
    this.nodeDialects.set(node, this.dialects.get(base));
    const keys = Object.keys(node);
    let children;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const value = node[key];
      const order = Array.isArray(value) ? LIST_ORDER[key] : CHILD_ORDER[key];
      if (order !== void 0) {
        if (children === void 0) children = [];
        children.push(order, key);
      }
    }
    if (children === void 0) {
      return;
    }
    if (children.length > 2) {
      const pairs = [];
      for (let i = 0; i < children.length; i += 2) pairs.push([children[i], children[i + 1]]);
      pairs.sort((a, b) => a[0] - b[0]);
      children = pairs.flat();
    }
    for (let i = 0; i < children.length; i += 2) {
      const order = children[i];
      const value = node[children[i + 1]];
      if (order < MAP_START) {
        this.visit(value, base, dialect);
      } else if (order < LIST_START) {
        if (isObject(value)) {
          const mapKeys = Object.keys(value);
          for (let j = 0; j < mapKeys.length; j += 1) {
            this.visit(value[mapKeys[j]], base, dialect);
          }
        }
      } else {
        for (let j = 0; j < value.length; j += 1) {
          this.visit(value[j], base, dialect);
        }
      }
    }
  }
  // The document `ref`, resolved against the base URI of `node`, points to when it is not registered: the one to load
  // for it to resolve. Undefined when it is registered, or relative to a document without "$id".
  missingDocument(node, ref) {
    const uri = resolveUri(ref, this.bases.get(node) ?? DEFAULT_BASE);
    if (uri === void 0) {
      return void 0;
    }
    const [document] = splitFragment(uri);
    const isKnown = this.resources.has(document) || new URL(document).protocol === new URL(DEFAULT_BASE).protocol;
    return isKnown ? void 0 : document;
  }
  // Schema node that `ref` (by default the "$ref" of `node`), resolved against the base URI of `node`, points to, or
  // undefined when it is not in this document.
  resolve(node, ref = node.$ref) {
    const uri = resolveUri(ref, this.bases.get(node) ?? DEFAULT_BASE);
    if (uri === void 0) {
      return void 0;
    }
    const [document, rawFragment] = splitFragment(uri);
    const fragment = decode(rawFragment);
    if (fragment === void 0) {
      return void 0;
    }
    let target;
    if (fragment === "" || fragment.startsWith("/")) {
      const resource = this.resources.get(document);
      target = resource === void 0 ? void 0 : followPointer(resource, fragment);
      if (target !== void 0) {
        this.visit(target, document);
      }
    } else {
      target = this.anchors.get(`${document}#${fragment}`);
    }
    return target;
  }
}

},
"@xufa/schema/lib/json-schema.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var json_schema_exports = {};
__export(json_schema_exports, {
  builtInFormats: () => builtInFormats,
  compileJsonSchema: () => compileJsonSchema,
  compileJsonSchemaAsync: () => compileJsonSchemaAsync,
  fromJsonSchema: () => fromJsonSchema,
  loadJsonSchemas: () => loadJsonSchemas
});
module.exports = __toCommonJS(json_schema_exports);
var import_schema = require("./schema.js");
var import_compile = require("./compile.js");
var import_json_schema_refs = require("./json-schema-refs.js");
var import_merge_patch = require("./merge-patch.js");
var import_unevaluated = require("./unevaluated.js");
var import_keyword = require("./types/keyword.js");
var import_coerce = require("./coerce.js");
var import_formats = require("./formats.js");
var import_types = require("./types/index.js");
const DRAFTS = ["draft-04", "draft-06", "draft-07", "2019-09", "2020-12"];
const ANNOTATIONS = [
  "$schema",
  "$id",
  "$comment",
  "title",
  "description",
  "default",
  "examples",
  "format",
  "readOnly",
  "writeOnly",
  "deprecated",
  "nullable",
  "contentMediaType",
  "contentEncoding",
  "contentSchema",
  // Only used through "$ref"; "$defs" is also accepted in draft-07.
  "definitions",
  "$defs"
];
const ANNOTATIONS_04 = ["id"];
const ANNOTATIONS_2019 = ["$anchor", "$vocabulary", "$recursiveAnchor"];
const ANNOTATIONS_2020 = ["$dynamicAnchor"];
const NOT_SUPPORTED_YET = [];
const REF_KEYWORDS = {
  "draft-04": ["$ref"],
  "draft-06": ["$ref"],
  "draft-07": ["$ref"],
  "2019-09": ["$ref", "$recursiveRef"],
  "2020-12": ["$ref", "$dynamicRef"]
};
const DRAFT_KEYWORDS = {
  const: ["draft-06", "draft-07", "2019-09", "2020-12"],
  contains: ["draft-06", "draft-07", "2019-09", "2020-12"],
  propertyNames: ["draft-06", "draft-07", "2019-09", "2020-12"],
  if: ["draft-07", "2019-09", "2020-12"],
  then: ["draft-07", "2019-09", "2020-12"],
  else: ["draft-07", "2019-09", "2020-12"],
  additionalItems: ["draft-04", "draft-06", "draft-07", "2019-09"],
  dependentRequired: ["2019-09", "2020-12"],
  dependentSchemas: ["2019-09", "2020-12"],
  minContains: ["2019-09", "2020-12"],
  maxContains: ["2019-09", "2020-12"],
  prefixItems: ["2020-12"],
  unevaluatedProperties: ["2019-09", "2020-12"],
  unevaluatedItems: ["2019-09", "2020-12"]
};
const TYPED_KEYWORDS = {
  properties: "object",
  patternProperties: "object",
  dependencies: "object",
  propertyNames: "object",
  dependentRequired: "object",
  dependentSchemas: "object",
  contains: "array",
  minContains: "array",
  maxContains: "array",
  prefixItems: "array",
  additionalItems: "array",
  unevaluatedItems: "array",
  required: "object",
  additionalProperties: "object",
  unevaluatedProperties: "object",
  minProperties: "object",
  maxProperties: "object",
  items: "array",
  minItems: "array",
  maxItems: "array",
  uniqueItems: "array",
  minLength: "string",
  maxLength: "string",
  pattern: "string",
  minimum: "number",
  maximum: "number",
  exclusiveMinimum: "number",
  exclusiveMaximum: "number",
  multipleOf: "number",
  // Of ajv-formats: limits of the values of a format that can be compared (see formatLimitsOf()).
  formatMinimum: "string",
  formatMaximum: "string",
  formatExclusiveMinimum: "string",
  formatExclusiveMaximum: "string"
};
const FORMAT_LIMIT_KEYWORDS = ["formatMinimum", "formatMaximum", "formatExclusiveMinimum", "formatExclusiveMaximum"];
const UNTYPED_KEYWORDS = [
  "type",
  "enum",
  "const",
  "anyOf",
  "oneOf",
  "not",
  "allOf",
  "if",
  "then",
  "else",
  // OpenAPI: which "oneOf" schema applies, by the value of a property (see discriminatorOf()).
  "discriminator"
];
const TYPE_NAMES = ["object", "array", "string", "number", "integer", "boolean", "null"];
let context;
function getTypeNames(json) {
  if (json.type === void 0) {
    return [];
  }
  return Array.isArray(json.type) ? json.type : [json.type];
}
const ANNOTATIONS_OF = Object.fromEntries(
  DRAFTS.map((draft) => [
    draft,
    /* @__PURE__ */ new Set([
      ...ANNOTATIONS,
      ...draft === "draft-04" ? ANNOTATIONS_04 : [],
      ...(0, import_json_schema_refs.isLegacy)(draft) ? [] : ANNOTATIONS_2019,
      ...draft === "2020-12" ? ANNOTATIONS_2020 : []
    ])
  ])
);
const ASSERTIONS_OF = Object.fromEntries(
  DRAFTS.map((draft) => [
    draft,
    new Set(
      [...Object.keys(TYPED_KEYWORDS), ...UNTYPED_KEYWORDS].filter(
        (keyword) => !DRAFT_KEYWORDS[keyword] || DRAFT_KEYWORDS[keyword].includes(draft)
      )
    )
  ])
);
function isAnnotation(keyword, draft) {
  return ANNOTATIONS_OF[draft].has(keyword) || context.annotations.has(keyword);
}
function isAssertion(keyword, draft) {
  return ASSERTIONS_OF[draft].has(keyword) || context.custom.has(keyword);
}
function isIgnored(keyword, draft) {
  return isAnnotation(keyword, draft) || !context.strict && !isAssertion(keyword, draft);
}
function checkKeywords(json, path) {
  const typeNames = getTypeNames(json);
  typeNames.forEach((typeName) => {
    if (!TYPE_NAMES.includes(typeName)) {
      throw new Error(`Unsupported JSON Schema type "${typeName}" at ${path}`);
    }
  });
  if (context.strict && context.knownFormats && typeof json.format === "string" && !context.knownFormats.has(json.format)) {
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
    const requiredType = TYPED_KEYWORDS[keyword];
    const isDeclared = typeNames.includes(requiredType) || requiredType === "number" && typeNames.includes("integer");
    if (requiredType && context.strict && typeNames.length > 0 && !isDeclared) {
      throw new Error(`JSON Schema keyword "${keyword}" at ${path} requires "type": "${requiredType}"`);
    }
  });
}
function formatsOf(option) {
  const checks = /* @__PURE__ */ new Map();
  const compares = /* @__PURE__ */ new Map();
  if (option === void 0 || option === false) {
    return { checks, compares, known: void 0 };
  }
  const known = /* @__PURE__ */ new Set();
  const isCheck = (check) => check instanceof RegExp || typeof check === "function";
  const addBuiltIn = (name) => {
    if (!Object.prototype.hasOwnProperty.call(import_formats.FORMATS, name)) {
      throw new Error(
        `Unsupported JSON Schema option "formats": "${name}" is not one of ${Object.keys(import_formats.FORMATS).join(", ")}`
      );
    }
    checks.set(name, import_formats.FORMATS[name]);
    if (import_formats.FORMAT_COMPARES[name]) {
      compares.set(name, import_formats.FORMAT_COMPARES[name]);
    }
  };
  if (option === true) {
    Object.keys(import_formats.FORMATS).forEach(addBuiltIn);
  } else if (Array.isArray(option)) {
    option.forEach(addBuiltIn);
  } else if (option !== null && typeof option === "object") {
    Object.entries(option).forEach(([name, check]) => {
      if (check === true) {
        addBuiltIn(name);
      } else if (isCheck(check)) {
        checks.set(name, check);
      } else if (check !== null && typeof check === "object" && isCheck(check.validate)) {
        if (check.compare !== void 0 && typeof check.compare !== "function") {
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
function builtInFormats() {
  return Object.fromEntries(Object.keys(import_formats.FORMATS).map((name) => [name, true]));
}
function formatLimitsOf(json, check, path) {
  return FORMAT_LIMIT_KEYWORDS.filter((keyword) => json[keyword] !== void 0).flatMap((keyword) => {
    const at = `Unsupported JSON Schema at ${path}: "${keyword}"`;
    if (json.format === void 0) {
      throw new Error(`${at} requires "format"`);
    }
    if (check === void 0) {
      return [];
    }
    const compare = context.formatCompares.get(json.format);
    if (compare === void 0) {
      throw new Error(`${at}: the values of the format "${json.format}" cannot be compared`);
    }
    const limit = json[keyword];
    const isValue = typeof limit === "string" && (check instanceof RegExp ? check.test(limit) : check(limit));
    if (!isValue) {
      throw new Error(`${at} must be a valid ${json.format}`);
    }
    return [{ keyword, limit, compare }];
  });
}
function formatOf(json, path) {
  let check = typeof json.format === "string" ? context.formats.get(json.format) : void 0;
  if (check === import_formats.FORMATS.hostname && (context.draft === "draft-04" || context.draft === "draft-06")) {
    check = import_formats.isRfc1123Hostname;
  }
  const formatLimits = formatLimitsOf(json, check, path);
  return check === void 0 ? {} : { format: json.format, formatCheck: check, formatLimits };
}
function draftOf(options) {
  if (options.draft !== void 0 && !DRAFTS.includes(options.draft)) {
    throw new Error(`Unsupported JSON Schema option "draft": "${options.draft}" is not one of ${DRAFTS.join(", ")}`);
  }
  return options.draft;
}
function useDefaultsOf(options) {
  const { useDefaults = false } = options;
  if (useDefaults !== true && useDefaults !== false && useDefaults !== "empty") {
    throw new Error(`Unsupported JSON Schema option "useDefaults": expected true, false or 'empty'`);
  }
  return useDefaults;
}
function multipleOfPrecisionOf(options) {
  const { multipleOfPrecision } = options;
  if (multipleOfPrecision !== void 0 && !(Number.isInteger(multipleOfPrecision) && multipleOfPrecision > 0)) {
    throw new Error('Unsupported JSON Schema option "multipleOfPrecision": expected a positive integer');
  }
  return multipleOfPrecision;
}
function coerceTypesOf(options) {
  const { coerceTypes = false } = options;
  if (coerceTypes !== true && coerceTypes !== false && coerceTypes !== "array") {
    throw new Error(`Unsupported JSON Schema option "coerceTypes": expected true, false or 'array'`);
  }
  return coerceTypes;
}
function removeAdditionalOf(options) {
  const { removeAdditional = false } = options;
  if (![true, false, "all", "failing"].includes(removeAdditional)) {
    throw new Error(`Unsupported JSON Schema option "removeAdditional": expected true, false, 'all' or 'failing'`);
  }
  return removeAdditional;
}
function strictOf(options) {
  if (options.strict !== void 0 && typeof options.strict !== "boolean") {
    throw new Error('Unsupported JSON Schema option "strict": expected true or false');
  }
  return options.strict !== false;
}
const STANDARD_KEYWORDS = /* @__PURE__ */ new Set([
  ...DRAFTS.flatMap((draft) => [...ANNOTATIONS_OF[draft], ...ASSERTIONS_OF[draft], ...REF_KEYWORDS[draft]])
]);
const MACRO_TYPES = ["object", "array", "string", "number"];
function keywordDefinitionOf(definition) {
  const at = 'Unsupported JSON Schema option "keywords":';
  if (definition === null || typeof definition !== "object" || typeof definition.keyword !== "string") {
    throw new Error(`${at} expected keyword names, or definitions with "keyword"`);
  }
  const { keyword, type, message } = definition;
  if (STANDARD_KEYWORDS.has(keyword)) {
    throw new Error(`${at} "${keyword}" is a keyword of JSON Schema`);
  }
  const ways = ["validate", "compile", "macro"].filter((way) => definition[way] !== void 0);
  if (ways.length !== 1 || typeof definition[ways[0]] !== "function") {
    throw new Error(`${at} "${keyword}" needs one function: "validate", "compile" or "macro"`);
  }
  const types = type === void 0 ? void 0 : [].concat(type);
  const allowed = definition.macro ? MACRO_TYPES : Object.keys(import_keyword.KEYWORD_TYPE_TESTS);
  if (types !== void 0 && (types.length === 0 || !types.every((name) => allowed.includes(name)))) {
    throw new Error(`${at} the "type" of "${keyword}" must be one or more of ${allowed.join(", ")}`);
  }
  if (message !== void 0 && typeof message !== "string" && typeof message !== "function") {
    throw new Error(`${at} the "message" of "${keyword}" must be a string or a function`);
  }
  return { ...definition, types };
}
function keywordsOf(options) {
  const { keywords = [] } = options;
  if (!Array.isArray(keywords)) {
    throw new Error('Unsupported JSON Schema option "keywords": expected a list of keyword names or definitions');
  }
  const annotations = /* @__PURE__ */ new Set();
  const custom = /* @__PURE__ */ new Map();
  keywords.forEach((item) => {
    if (typeof item === "string") {
      annotations.add(item);
    } else {
      const definition = keywordDefinitionOf(item);
      custom.set(definition.keyword, definition);
    }
  });
  return { annotations, custom };
}
const draftOfNode = (json) => context.index.draftOf(json) || context.draft;
const NO_KEYWORDS = [];
const refKeywordsOf = (json) => json.$ref === void 0 && json.$dynamicRef === void 0 && json.$recursiveRef === void 0 ? NO_KEYWORDS : REF_KEYWORDS[draftOfNode(json)].filter((keyword) => json[keyword] !== void 0);
function besideRef(json) {
  const draft = draftOfNode(json);
  const rest = { ...json };
  REF_KEYWORDS[draft].forEach((keyword) => delete rest[keyword]);
  return Object.keys(rest).every((keyword) => isIgnored(keyword, draft)) ? void 0 : rest;
}
function viewOf(node) {
  const view = context.index.viewOf(node);
  if (context.strict) {
    return view;
  }
  const draft = draftOfNode(node);
  const isOther = (keyword) => DRAFT_KEYWORDS[keyword] !== void 0 && !DRAFT_KEYWORDS[keyword].includes(draft);
  if (!Object.keys(view).some(isOther)) {
    return view;
  }
  if (!context.views.has(node)) {
    context.views.set(node, Object.fromEntries(Object.entries(view).filter(([keyword]) => !isOther(keyword))));
  }
  return context.views.get(node);
}
const newScope = (key, anchors) => ({ key, anchors, next: /* @__PURE__ */ new Map() });
function enter(scope, uri) {
  if (uri === void 0) {
    return scope;
  }
  if (!scope.next.has(uri)) {
    const added = [...context.index.dynamicAnchorsOf(uri).keys()].filter((name) => !scope.anchors.has(name));
    if (added.length === 0) {
      scope.next.set(uri, scope);
    } else {
      const anchors = new Map(scope.anchors);
      added.forEach((name) => anchors.set(name, uri));
      const key = [...anchors].map(([name, resource]) => `${name}=${resource}`).join("\n");
      if (!context.scopes.has(key)) {
        context.scopes.set(key, newScope(key, anchors));
      }
      scope.next.set(uri, context.scopes.get(key));
    }
  }
  return scope.next.get(uri);
}
const enterNode = (scope, node) => context.index.dynamicAnchors.size === 0 ? scope : enter(scope, context.index.resourceOf(node));
function anchorName(ref) {
  const index = ref.indexOf("#");
  if (index === -1) {
    return void 0;
  }
  const name = ref.slice(index + 1);
  if (name === "" || name.startsWith("/")) {
    return void 0;
  }
  try {
    return decodeURIComponent(name);
  } catch (e) {
    return void 0;
  }
}
function resolveTarget(json, keyword, scope) {
  const { index } = context;
  if (keyword === "$ref") {
    return index.resolve(json);
  }
  const initial = index.resolve(json, keyword === "$recursiveRef" ? "#" : json[keyword]);
  const isObject2 = initial !== null && typeof initial === "object";
  let name;
  if (keyword === "$dynamicRef") {
    name = anchorName(json.$dynamicRef);
    if (name === void 0 || !isObject2 || initial.$dynamicAnchor !== name) {
      return initial;
    }
  } else {
    name = "";
    if (!isObject2 || initial.$recursiveAnchor !== true) {
      return initial;
    }
  }
  const resource = scope.anchors.get(name);
  return resource === void 0 ? initial : index.dynamicAnchorsOf(resource).get(name);
}
const customKeywordsOf = (json) => context.custom.size === 0 ? NO_KEYWORDS : Object.keys(json).filter((keyword) => context.custom.has(keyword));
function customPartOf(node, json, keyword) {
  if (!context.customParts.has(node)) {
    context.customParts.set(node, /* @__PURE__ */ new Map());
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
      if (typeof part !== "function" && !(part instanceof RegExp)) {
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
function acceptsNull(json, seen = void 0, outerScope = context.scope) {
  if (json === true) {
    return true;
  }
  if (json === false || json === null || typeof json !== "object") {
    return false;
  }
  if (typeof json.type === "string" && json.type !== "null" && json.nullable !== true && json.$ref === void 0 && json.$dynamicRef === void 0 && json.$recursiveRef === void 0 && !context.index.ignoresKeywords(json)) {
    return false;
  }
  const scope = enterNode(outerScope, json);
  const view = viewOf(json);
  const refKeywords = refKeywordsOf(json);
  if (refKeywords.length > 0) {
    if (seen === void 0) {
      seen = /* @__PURE__ */ new Set();
    } else if (seen.has(json)) {
      return false;
    }
    seen.add(json);
    const followed = (0, import_json_schema_refs.isLegacy)(draftOfNode(json)) ? ["$ref"] : refKeywords;
    const result = followed.every((keyword) => {
      const target = resolveTarget(json, keyword, scope);
      return target !== void 0 && acceptsNull(target, seen, scope);
    });
    seen.delete(json);
    const rest = (0, import_json_schema_refs.isLegacy)(draftOfNode(json)) ? void 0 : besideRef(view);
    return result && (rest === void 0 || acceptsNull(rest, seen, scope));
  }
  if (view.nullable === true) {
    return true;
  }
  const checks = [];
  if (view.type !== void 0) {
    checks.push(getTypeNames(view).includes("null"));
  }
  if (view.enum) {
    checks.push(view.enum.includes(null));
  }
  if ("const" in view) {
    checks.push(view.const === null);
  }
  if (view.anyOf) {
    checks.push(view.anyOf.some((item) => acceptsNull(item, seen, scope)));
  }
  if (view.oneOf) {
    checks.push(view.oneOf.filter((item) => acceptsNull(item, seen, scope)).length === 1);
  }
  if (view.not !== void 0) {
    checks.push(!acceptsNull(view.not, seen, scope));
  }
  if (view.allOf) {
    checks.push(view.allOf.every((item) => acceptsNull(item, seen, scope)));
  }
  if (view.if !== void 0) {
    const branch = acceptsNull(view.if, seen, scope) ? view.then : view.else;
    checks.push(branch === void 0 || acceptsNull(branch, seen, scope));
  }
  customKeywordsOf(view).forEach((keyword) => {
    const definition = context.custom.get(keyword);
    if (definition.types === void 0 || definition.types.includes("null")) {
      const part = customPartOf(json, view, keyword);
      checks.push(definition.macro ? acceptsNull(part, seen, scope) : Boolean(part(null)));
    }
  });
  return checks.every(Boolean);
}
function asInner(type) {
  type.isMandatory = false;
  type.isNullable = true;
  return type;
}
function combine(types, Type) {
  if (types.length === 0) {
    return new import_types.AnyType();
  }
  if (types.length === 1) {
    return types[0];
  }
  return new Type({ types: types.map(asInner) });
}
let convert;
function requiredDependency(key, dependency, path) {
  if (!Array.isArray(dependency) || !dependency.every((property) => typeof property === "string")) {
    throw new Error(`Unsupported JSON Schema at ${path}: expected property names`);
  }
  return { key, required: dependency };
}
function convertDependencies(json, path) {
  const dependencies = json.dependencies || {};
  const dependentRequired = json.dependentRequired || {};
  const dependentSchemas = json.dependentSchemas || {};
  return [
    ...Object.keys(dependencies).map((key) => {
      const dependency = dependencies[key];
      const at = `${path}.dependencies.${key}`;
      return Array.isArray(dependency) ? requiredDependency(key, dependency, at) : { key, type: asInner(convert(dependency, at)) };
    }),
    ...Object.keys(dependentRequired).map(
      (key) => requiredDependency(key, dependentRequired[key], `${path}.dependentRequired.${key}`)
    ),
    ...Object.keys(dependentSchemas).map((key) => ({
      key,
      type: asInner(convert(dependentSchemas[key], `${path}.dependentSchemas.${key}`))
    }))
  ];
}
function collectDefaults(items, keys, path) {
  if (!context.useDefaults) {
    return [];
  }
  const empty = context.useDefaults === "empty";
  return keys.filter((key) => {
    const item = items[key];
    return item !== null && typeof item === "object" && !Array.isArray(item) && item.default !== void 0;
  }).filter((key) => {
    if (context.composite === 0) {
      return true;
    }
    if (context.strict) {
      throw new Error(
        `Unsupported JSON Schema at ${path}: "default" of "${key}" is ignored inside "anyOf", "oneOf", "not" and "if" (useDefaults); use strict: false to ignore it`
      );
    }
    return false;
  }).map((key) => {
    if (key === "__proto__") {
      throw new Error(`Unsupported JSON Schema at ${path}: "default" of "__proto__" (useDefaults)`);
    }
    return { key, value: items[key].default, empty };
  });
}
function removalOf(json) {
  const mode = context.removeAdditional;
  const { additionalProperties } = json;
  if (mode === "all" && (json.properties !== void 0 || additionalProperties !== void 0)) {
    return "delete";
  }
  if (mode && additionalProperties === false) {
    return "delete";
  }
  const isSchema = additionalProperties !== null && typeof additionalProperties === "object";
  return mode === "failing" && isSchema ? "failing" : void 0;
}
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
  const additionalType = additionalProperties !== void 0 && typeof additionalProperties === "object" ? convert(additionalProperties, `${path}.additionalProperties`) : void 0;
  const definition = /* @__PURE__ */ Object.create(null);
  Object.keys(properties).forEach((key) => {
    definition[key] = convert(properties[key], `${path}.properties.${key}`, required.includes(key));
  });
  const patternProperties = json.patternProperties || {};
  const patternTypes = Object.keys(patternProperties).map((source) => ({
    pattern: new RegExp(source, "u"),
    type: convert(patternProperties[source], `${path}.patternProperties.${source}`)
  }));
  const removal = removalOf(json);
  required.filter((key) => !Object.prototype.hasOwnProperty.call(definition, key)).forEach((key) => {
    const isAdditional = !removal && additionalProperties !== void 0 && !patternTypes.some(({ pattern }) => pattern.test(key));
    definition[key] = isAdditional ? convert(additionalProperties, `${path}.additionalProperties`) : new import_types.AnyType({ isNullable: true });
  });
  const schema = new import_schema.Schema(definition, {
    isOpen: additionalProperties !== false,
    additionalType,
    patternTypes,
    dependencies: convertDependencies(json, path),
    propertyNameType: json.propertyNames === void 0 ? void 0 : convert(json.propertyNames, `${path}.propertyNames`),
    minProperties: json.minProperties,
    maxProperties: json.maxProperties,
    defaults: collectDefaults(properties, Object.keys(properties), `${path}.properties`),
    removeAdditional: removal
  });
  schema.propertyKeys = Object.keys(properties);
  schema.evaluatesAllKeys = additionalProperties !== void 0;
  return schema;
}
const tuple = (items, keyword, path) => items.map((item, i) => convert(item, `${path}.${keyword}[${i}]`, false));
function convertArray(json, path) {
  const { items } = json;
  let type;
  let additionalType;
  if (context.draft === "2020-12") {
    if (Array.isArray(items)) {
      throw new Error(`Unsupported JSON Schema at ${path}: in draft 2020-12 "items" is a schema; use "prefixItems"`);
    }
    const rest = items === void 0 ? void 0 : convert(items, `${path}.items`);
    if (json.prefixItems !== void 0) {
      if (!Array.isArray(json.prefixItems)) {
        throw new Error(`Unsupported JSON Schema at ${path}: "prefixItems" must be an array`);
      }
      type = tuple(json.prefixItems, "prefixItems", path);
      additionalType = rest;
    } else {
      type = rest;
    }
  } else {
    if (Array.isArray(items)) {
      type = tuple(items, "items", path);
    } else if (items !== void 0) {
      type = convert(items, `${path}.items`);
    }
    additionalType = Array.isArray(items) && json.additionalItems !== void 0 ? convert(json.additionalItems, `${path}.additionalItems`) : void 0;
  }
  const contains = json.contains === void 0 ? void 0 : convert(json.contains, `${path}.contains`);
  let tupleItems = Array.isArray(items) && context.draft !== "2020-12" ? items : void 0;
  if (context.draft === "2020-12" && Array.isArray(json.prefixItems)) {
    tupleItems = json.prefixItems;
  }
  const array = new import_types.ArrayOfType({
    defaults: tupleItems ? collectDefaults(
      tupleItems,
      tupleItems.map((item, i) => i),
      path
    ) : [],
    type,
    min: json.minItems,
    max: json.maxItems,
    unique: json.uniqueItems,
    contains,
    minContains: json.minContains,
    maxContains: json.maxContains,
    additionalType
  });
  array.containsEvaluates = context.draft === "2020-12";
  return array;
}
function convertNumber(json, Type, path) {
  if (json.multipleOf !== void 0 && !(typeof json.multipleOf === "number" && json.multipleOf > 0)) {
    throw new Error(`Unsupported JSON Schema at ${path}: "multipleOf" must be a number greater than 0`);
  }
  const isDraft04 = context.draft === "draft-04";
  ["exclusiveMinimum", "exclusiveMaximum"].forEach((keyword) => {
    const expected = isDraft04 ? "boolean" : "number";
    const actual = typeof json[keyword];
    if (json[keyword] !== void 0 && actual !== expected) {
      throw new Error(`Unsupported JSON Schema at ${path}: "${keyword}" must be a ${expected} in ${context.draft}`);
    }
  });
  if (isDraft04) {
    return new Type({
      min: json.exclusiveMinimum === true ? void 0 : json.minimum,
      max: json.exclusiveMaximum === true ? void 0 : json.maximum,
      exclusiveMin: json.exclusiveMinimum === true ? json.minimum : void 0,
      exclusiveMax: json.exclusiveMaximum === true ? json.maximum : void 0,
      multipleOf: json.multipleOf,
      multipleOfPrecision: context.multipleOfPrecision
    });
  }
  return new Type({
    min: json.minimum,
    max: json.maximum,
    exclusiveMin: json.exclusiveMinimum,
    exclusiveMax: json.exclusiveMaximum,
    multipleOf: json.multipleOf,
    multipleOfPrecision: context.multipleOfPrecision
  });
}
function convertTypeName(typeName, json, path) {
  switch (typeName) {
    case "object":
      return convertObject(json, path);
    case "array":
      return convertArray(json, path);
    case "string":
      return new import_types.StringType({
        min: json.minLength,
        max: json.maxLength,
        pattern: json.pattern === void 0 ? void 0 : new RegExp(json.pattern, "u"),
        allowEmpty: false,
        countCodePoints: true,
        ...formatOf(json, path)
      });
    case "number":
      return convertNumber(json, import_types.FloatType, path);
    case "integer":
      return convertNumber(json, import_types.IntegerType, path);
    case "boolean":
      return new import_types.BooleanType();
    default:
      return new import_types.ValuesType({ values: [null], isNullable: true });
  }
}
function convertUntyped(json, path) {
  const jsonTypes = [...new Set(Object.keys(json).map((keyword) => TYPED_KEYWORDS[keyword]))].filter(Boolean);
  return jsonTypes.map(
    (jsonType) => new import_types.WhenType({
      jsonType,
      type: asInner(convertTypeName(jsonType, json, path))
    })
  );
}
function addUnevaluated(parts, json, path) {
  if (json.unevaluatedProperties === void 0 && json.unevaluatedItems === void 0) {
    return;
  }
  const siblings = [...parts];
  if (json.unevaluatedProperties !== void 0) {
    const type = convert(json.unevaluatedProperties, `${path}.unevaluatedProperties`);
    parts.push(new import_unevaluated.UnevaluatedType({ kind: "properties", siblings, type }));
  }
  if (json.unevaluatedItems !== void 0) {
    const type = convert(json.unevaluatedItems, `${path}.unevaluatedItems`);
    parts.push(new import_unevaluated.UnevaluatedType({ kind: "items", siblings, type }));
  }
}
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function referencedSchemas(item) {
  const schemas = [];
  let schema = item;
  while (isObject(schema) && !schemas.includes(schema)) {
    schemas.push(schema);
    if (typeof schema.$ref !== "string" || schema.properties !== void 0) {
      break;
    }
    schema = context.index.resolve(schema);
  }
  return schemas;
}
function tagValuesOf(schema, tag) {
  const property = isObject(schema) && isObject(schema.properties) ? schema.properties[tag] : void 0;
  if (!isObject(property)) {
    return void 0;
  }
  if ("const" in property) {
    return [property.const];
  }
  return Array.isArray(property.enum) ? property.enum : void 0;
}
function schemaNameOf(item) {
  if (!isObject(item) || typeof item.$ref !== "string") {
    return void 0;
  }
  const hash = item.$ref.indexOf("#");
  const pointer = hash === -1 ? "" : item.$ref.slice(hash + 1);
  if (!pointer.startsWith("/")) {
    return void 0;
  }
  try {
    const token = decodeURIComponent(pointer.slice(pointer.lastIndexOf("/") + 1));
    return token.replace(/~1/g, "/").replace(/~0/g, "~") || void 0;
  } catch (e) {
    return void 0;
  }
}
function discriminatorOf(json, path) {
  const { discriminator } = json;
  const at = `Unsupported JSON Schema at ${path}: "discriminator"`;
  if (!isObject(discriminator) || typeof discriminator.propertyName !== "string") {
    throw new Error(`${at} requires "propertyName"`);
  }
  const tag = discriminator.propertyName;
  if (discriminator.mapping !== void 0 && !isObject(discriminator.mapping)) {
    throw new Error(`${at}: "mapping" must be an object of references or schema names by value`);
  }
  const branches = json.oneOf.map((item) => ({ schemas: referencedSchemas(item), name: schemaNameOf(item) }));
  const mapping = /* @__PURE__ */ new Map();
  let exact = true;
  const add = (value, i) => {
    if (typeof value !== "string" || mapping.has(value)) {
      throw new Error(`${at}: the values of "${tag}" must be unique strings`);
    }
    mapping.set(value, i);
  };
  Object.entries(discriminator.mapping || {}).forEach(([value, target]) => {
    if (typeof target !== "string") {
      throw new Error(`${at}: "mapping"."${value}" must be a reference or a schema name`);
    }
    const isName = !target.includes("#") && !target.includes("/");
    const node = isName ? void 0 : context.index.resolve(json, target);
    const i = branches.findIndex(({ schemas, name }) => isName ? name === target : schemas.includes(node));
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
    if (values !== void 0) {
      values.forEach((value) => add(value, i));
    } else if (![...mapping.values()].includes(i)) {
      if (name === void 0) {
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
function implicitDiscriminatorOf(json) {
  if (json.oneOf.length < 2) {
    return void 0;
  }
  const schemas = json.oneOf.map((item) => {
    const chain = referencedSchemas(item);
    return chain[chain.length - 1];
  });
  const first = schemas[0];
  const candidates = isObject(first) && isObject(first.properties) ? Object.keys(first.properties) : [];
  for (let c = 0; c < candidates.length; c += 1) {
    const tag = candidates[c];
    const mapping = /* @__PURE__ */ new Map();
    const isTag = schemas.every((schema, i) => {
      const values = tagValuesOf(schema, tag);
      return values !== void 0 && values.length > 0 && values.every((value) => typeof value === "string" && !mapping.has(value) && mapping.set(value, i));
    });
    if (isTag) {
      return { tag, mapping, exact: true, auto: true };
    }
  }
  return void 0;
}
function convertCustom(node, json, path) {
  return customKeywordsOf(json).flatMap((keyword) => {
    const definition = context.custom.get(keyword);
    const part = customPartOf(node, json, keyword);
    if (definition.macro) {
      const type = convert(part, `${path}.${keyword}`);
      if (definition.types === void 0) {
        return [type];
      }
      return definition.types.map((jsonType) => new import_types.WhenType({ jsonType, type: asInner(type) }));
    }
    const value = json[keyword];
    let { message } = definition;
    if (typeof message === "function" && message.length < 2) {
      message = message(value);
    } else if (typeof message === "function") {
      const text = message;
      message = (data) => text(value, data);
    } else if (message === void 0) {
      message = `must pass the "${keyword}" keyword`;
    }
    [part, message].filter((fn) => typeof fn === "function").forEach((fn) => {
      fn.validatorKeyword = keyword;
    });
    return [
      new import_keyword.KeywordType({
        keyword,
        check: part,
        message,
        jsonTypes: definition.types,
        isMandatory: false,
        isNullable: true
      })
    ];
  });
}
let convertNode;
convert = (json, path, isMandatory = true) => {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    return convertNode(json, path, isMandatory);
  }
  const { scope, draft } = context;
  context.scope = enterNode(scope, json);
  context.draft = context.index.draftOf(json) || draft;
  try {
    return convertNode(json, path, isMandatory);
  } finally {
    context.scope = scope;
    context.draft = draft;
  }
};
const merged = /* @__PURE__ */ new WeakMap();
function mergedNode(node, path) {
  if (merged.has(node)) return merged.get(node);
  const keyword = node.$merge !== void 0 ? "$merge" : "$patch";
  const spec = node[keyword];
  if (!spec || typeof spec !== "object" || spec.source === void 0 || spec.with === void 0) {
    throw new Error(`Unsupported JSON Schema at ${path}: ${keyword} is { source, with }`);
  }
  const { index } = context;
  let source = spec.source;
  if (source && typeof source === "object" && typeof source.$ref === "string") {
    source = index.resolve(node, source.$ref);
    if (source === void 0) {
      throw new Error(
        `Unsupported JSON Schema at ${path}: the source of ${keyword} (${spec.source.$ref}) is not there`
      );
    }
  }
  if (source && typeof source === "object" && (source.$merge !== void 0 || source.$patch !== void 0)) {
    source = mergedNode(source, path);
  }
  const what = `${keyword} at ${path}`;
  let made;
  try {
    made = keyword === "$merge" ? (0, import_merge_patch.mergePatch)(source, spec.with) : (0, import_merge_patch.applyPatch)(source, spec.with, what);
  } catch (err) {
    throw new Error(`Unsupported JSON Schema at ${path}: ${err.message}`);
  }
  if (made && typeof made === "object" && !Array.isArray(made)) {
    delete made.$id;
    delete made.id;
    index.visit(made, index.bases.get(node) ?? index.bases.get(index.root));
  }
  merged.set(node, made);
  return made;
}
convertNode = (node, path, isMandatory) => {
  if (node === true) {
    return new import_types.AnyType({ isMandatory, isNullable: true });
  }
  if (node === false) {
    return new import_types.NeverType({ isMandatory, isNullable: false });
  }
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    throw new Error(`Unsupported JSON Schema at ${path}: expected an object or a boolean`);
  }
  if (node.$merge !== void 0 || node.$patch !== void 0) {
    return convertNode(mergedNode(node, path), path, isMandatory);
  }
  const json = viewOf(node);
  let refKeywords = NO_KEYWORDS;
  if (!(0, import_json_schema_refs.isLegacy)(context.draft)) {
    refKeywords = refKeywordsOf(json);
  } else if (json.$ref !== void 0) {
    refKeywords = ["$ref"];
  }
  if (refKeywords.length > 0) {
    const refs = refKeywords.map((keyword) => {
      if (typeof json[keyword] !== "string") {
        throw new Error(`Unsupported JSON Schema at ${path}: "${keyword}" must be a string`);
      }
      if (keyword === "$recursiveRef" && json.$recursiveRef !== "#") {
        throw new Error(`Unsupported JSON Schema at ${path}: "$recursiveRef" must be "#"`);
      }
      const ref = new import_types.RefType({
        ref: json[keyword],
        isMandatory,
        isNullable: true
      });
      context.pending.push({
        ref,
        json: node,
        keyword,
        path,
        scope: context.scope,
        composite: context.composite
      });
      return ref;
    });
    const rest = (0, import_json_schema_refs.isLegacy)(context.draft) ? void 0 : besideRef(json);
    if (rest === void 0 && refs.length === 1) {
      return refs[0];
    }
    const { unevaluatedProperties, unevaluatedItems, ...others } = rest || {};
    const parts = [...refs];
    if (rest !== void 0 && besideRef(others) !== void 0) {
      parts.push(convertNode(others, path, true));
    }
    addUnevaluated(parts, json, path);
    const type2 = new import_types.AllOfType({ types: parts.map(asInner) });
    type2.isMandatory = isMandatory;
    type2.isNullable = acceptsNull(node);
    return type2;
  }
  checkKeywords(json, path);
  const typeNames = getTypeNames(json);
  const nonNullNames = typeNames.filter((typeName) => typeName !== "null");
  const namesToConvert = nonNullNames.length > 0 ? nonNullNames : typeNames;
  const constraints = [];
  if (namesToConvert.length === 0) {
    constraints.push(...convertUntyped(json, path));
  } else {
    constraints.push(
      combine(
        namesToConvert.map((typeName) => convertTypeName(typeName, json, path)),
        import_types.AnyOfType
      )
    );
  }
  const hasStringKeyword = () => Object.keys(json).some((keyword) => TYPED_KEYWORDS[keyword] === "string");
  if (namesToConvert.length === 0 && !hasStringKeyword() && formatOf(json, path).format !== void 0) {
    constraints.push(
      new import_types.WhenType({
        jsonType: "string",
        type: asInner(new import_types.StringType(formatOf(json, path)))
      })
    );
  }
  if (json.enum) {
    constraints.push(new import_types.ValuesType({ values: json.enum }));
  }
  if ("const" in json) {
    constraints.push(new import_types.ValuesType({ values: [json.const] }));
  }
  if (json.anyOf) {
    constraints.push(
      combine(
        inComposite(() => json.anyOf.map((item, i) => convert(item, `${path}.anyOf[${i}]`))),
        import_types.AnyOfType
      )
    );
  }
  if (json.oneOf) {
    if (!Array.isArray(json.oneOf) || json.oneOf.length === 0) {
      throw new Error(`Unsupported JSON Schema at ${path}: "oneOf" must be a non-empty array`);
    }
    const types = inComposite(() => json.oneOf.map((item, i) => asInner(convert(item, `${path}.oneOf[${i}]`))));
    const discriminator = json.discriminator === void 0 ? implicitDiscriminatorOf(json) : discriminatorOf(json, path);
    constraints.push(new import_types.OneOfType({ types, discriminator }));
  } else if (json.discriminator !== void 0) {
    throw new Error(`Unsupported JSON Schema at ${path}: "discriminator" requires "oneOf"`);
  }
  if (json.not !== void 0) {
    constraints.push(new import_types.NotType({ type: asInner(inComposite(() => convert(json.not, `${path}.not`))) }));
  }
  if (json.allOf) {
    json.allOf.forEach((item, i) => constraints.push(convert(item, `${path}.allOf[${i}]`)));
  }
  const keepsIf = json.then !== void 0 || json.else !== void 0 || !(0, import_json_schema_refs.isLegacy)(context.draft);
  if (json.if !== void 0 && keepsIf) {
    const branch = (keyword) => json[keyword] === void 0 ? void 0 : asInner(convert(json[keyword], `${path}.${keyword}`));
    constraints.push(
      new import_types.ConditionalType({
        ifType: asInner(inComposite(() => convert(json.if, `${path}.if`))),
        thenType: branch("then"),
        elseType: branch("else")
      })
    );
  }
  constraints.push(...convertCustom(node, json, path));
  addUnevaluated(constraints, json, path);
  const type = combine(constraints, import_types.AllOfType);
  type.isMandatory = isMandatory;
  type.isNullable = acceptsNull(node);
  if (context.coerceTypes) {
    const coerceTypes = json.nullable === true && typeNames.length > 0 && !typeNames.includes("null") ? [...typeNames, "null"] : typeNames;
    const coerceTo = coerceTypes.filter(
      (typeName) => import_coerce.COERCIBLE.includes(typeName) || typeName === "array" && context.coerceTypes === "array"
    );
    if (coerceTo.length > 0) {
      type.coerceSpec = { types: coerceTypes, to: coerceTo, array: context.coerceTypes === "array" };
    }
  }
  return type;
};
function resolveReferences() {
  while (context.pending.length > 0) {
    const { ref, json, keyword, path, scope, composite } = context.pending.shift();
    const target = resolveTarget(json, keyword, scope);
    if (target === void 0) {
      const error = new Error(
        `Unsupported JSON Schema "${keyword}": "${json[keyword]}" at ${path}: only references within the schema or to documents in the "schemas" option are supported`
      );
      error.missingSchema = context.index.missingDocument(json, keyword === "$recursiveRef" ? "#" : json[keyword]);
      throw error;
    }
    const targetScope = enterNode(scope, target);
    if (!context.targets.has(target)) {
      context.targets.set(target, /* @__PURE__ */ new Map());
    }
    const byScope = context.targets.get(target);
    const key = context.useDefaults && composite > 0 ? `${targetScope.key}
(composite)` : targetScope.key;
    if (!byScope.has(key)) {
      context.scope = targetScope;
      context.composite = composite;
      byScope.set(key, convert(target, json[keyword]));
      context.composite = 0;
    }
    ref.target = byScope.get(key);
  }
}
function fromJsonSchema(json, options = {}) {
  const strict = strictOf(options);
  const { annotations, custom } = keywordsOf(options);
  const useDefaults = useDefaultsOf(options);
  const coerceTypes = coerceTypesOf(options);
  const multipleOfPrecision = multipleOfPrecisionOf(options);
  const formats = formatsOf(options.formats);
  const removeAdditional = removeAdditionalOf(options);
  const index = new import_json_schema_refs.RefIndex(json, options.schemas, draftOf(options));
  const emptyScope = newScope("", /* @__PURE__ */ new Map());
  context = {
    draft: index.draft,
    index,
    // Target node to the type converted for it, by the key of the scope it was converted in.
    targets: /* @__PURE__ */ new Map(),
    pending: [],
    // Scopes by key, so the same anchors give the same scope.
    scopes: /* @__PURE__ */ new Map([["", emptyScope]]),
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
    views: /* @__PURE__ */ new Map(),
    // What the keywords of your own give for each node, by keyword: the schema of a macro, or the check.
    customParts: /* @__PURE__ */ new Map(),
    // Options "useDefaults" and "removeAdditional", and how many "anyOf", "oneOf", "not" or "if" the node being
    // converted is inside (see collectDefaults()).
    useDefaults,
    removeAdditional,
    composite: 0,
    // Option "coerceTypes" (see coerce.js).
    coerceTypes,
    // Option "multipleOfPrecision" (see FloatType.isMultiple()).
    multipleOfPrecision
  };
  try {
    const type = convert(json, "#");
    const rootScope = enterNode(emptyScope, json);
    context.targets.set(json, /* @__PURE__ */ new Map([[rootScope.key, type]]));
    resolveReferences();
    const spec = coerceTypes ? (0, import_coerce.coerceSpecOf)(type) : void 0;
    return spec ? new import_coerce.CoerceType({ type, spec }) : type;
  } finally {
    context = void 0;
  }
}
function compileJsonSchema(json, options = {}) {
  return (0, import_compile.compileType)(fromJsonSchema(json, options), options);
}
async function loadJsonSchemas(json, options = {}) {
  if (typeof options.loadSchema !== "function") {
    throw new Error('Unsupported JSON Schema option "loadSchema": expected an async function (uri) => schema');
  }
  const schemas = Object.fromEntries((0, import_json_schema_refs.documentsOf)(options.schemas).map(({ uri, schema }) => [uri, schema]));
  const loaded = /* @__PURE__ */ new Set();
  for (; ; ) {
    try {
      fromJsonSchema(json, { ...options, schemas });
      return schemas;
    } catch (e) {
      const uri = e.missingSchema;
      if (uri === void 0 || loaded.has(uri)) {
        throw e;
      }
      loaded.add(uri);
      schemas[uri] = await options.loadSchema(uri);
    }
  }
}
async function compileJsonSchemaAsync(json, options = {}) {
  const schemas = await loadJsonSchemas(json, options);
  return compileJsonSchema(json, { ...options, schemas });
}

},
"@xufa/schema/lib/merge-patch.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var merge_patch_exports = {};
__export(merge_patch_exports, {
  applyPatch: () => applyPatch,
  mergePatch: () => mergePatch
});
module.exports = __toCommonJS(merge_patch_exports);
const isPlain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const clone = (value) => value === void 0 ? void 0 : JSON.parse(JSON.stringify(value));
function mergePatch(target, patch) {
  if (!isPlain(patch)) return clone(patch);
  const out = isPlain(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else out[key] = mergePatch(out[key], value);
  }
  return out;
}
function locate(document, pointer, what) {
  if (pointer === "") return { parent: null, key: null };
  if (!pointer.startsWith("/")) throw new Error(`${what}: ${pointer} is not a JSON Pointer`);
  const keys = pointer.slice(1).split("/").map((key) => key.replace(/~1/g, "/").replace(/~0/g, "~"));
  let parent = document;
  for (const key of keys.slice(0, -1)) {
    parent = parent === null || typeof parent !== "object" ? void 0 : parent[key];
    if (parent === void 0) throw new Error(`${what}: no ${pointer}`);
  }
  return { parent, key: keys[keys.length - 1] };
}
function getAt(document, pointer, what) {
  if (pointer === "") return document;
  const { parent, key } = locate(document, pointer, what);
  if (parent === null || typeof parent !== "object" || !(key in parent)) throw new Error(`${what}: no ${pointer}`);
  return parent[key];
}
function applyPatch(document, operations, what) {
  if (!Array.isArray(operations)) throw new Error(`${what}: "with" is a list of operations (JSON Patch)`);
  let doc = clone(document);
  const put = (pointer, value, replace) => {
    if (pointer === "") {
      doc = value;
      return;
    }
    const { parent, key } = locate(doc, pointer, what);
    if (Array.isArray(parent)) {
      const index = key === "-" ? parent.length : Number(key);
      if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new Error(`${what}: no ${pointer}`);
      if (replace) parent[index] = value;
      else parent.splice(index, 0, value);
    } else if (parent !== null && typeof parent === "object") {
      if (replace && !(key in parent)) throw new Error(`${what}: no ${pointer} to replace`);
      parent[key] = value;
    } else throw new Error(`${what}: no ${pointer}`);
  };
  const take = (pointer) => {
    const { parent, key } = locate(doc, pointer, what);
    const value = getAt(doc, pointer, what);
    if (Array.isArray(parent)) parent.splice(Number(key), 1);
    else delete parent[key];
    return value;
  };
  for (const operation of operations) {
    const { op, path, from, value } = operation || {};
    if (typeof path !== "string") throw new Error(`${what}: an operation without a path`);
    if (op === "add") put(path, clone(value), false);
    else if (op === "remove") take(path);
    else if (op === "replace") put(path, clone(value), true);
    else if (op === "move") put(path, take(from), false);
    else if (op === "copy") put(path, clone(getAt(doc, from, what)), false);
    else if (op === "test") {
      if (JSON.stringify(getAt(doc, path, what)) !== JSON.stringify(value)) {
        throw new Error(`${what}: the test of ${path} failed`);
      }
    } else throw new Error(`${what}: ${op} is not an operation of JSON Patch`);
  }
  return doc;
}

},
"@xufa/schema/lib/schema.js": function (module, exports, require) {
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var schema_exports = {};
__export(schema_exports, {
  Schema: () => Schema
});
module.exports = __toCommonJS(schema_exports);
var import_types = require("./types/index.js");
var import_validate_type = require("./types/validate-type.js");
var import_defaults = require("./defaults.js");
var import_coerce = require("./coerce.js");
var compileModule = __toESM(require("./compile.js"));
function ownValue(obj, key) {
  const value = obj[key];
  if (value === void 0 || obj.__proto__ === Object.prototype && !(key in Object.prototype)) {
    return value;
  }
  return Object.prototype.hasOwnProperty.call(obj, key) ? value : void 0;
}
class Schema {
  constructor(schema = {}, options = {}) {
    this.schema = schema;
    this.options = options;
    this.isOpen = options.isOpen === void 0 ? true : options.isOpen;
    this.isMandatory = options.isMandatory === void 0 ? true : options.isMandatory;
    this.isNullable = options.isNullable === void 0 ? false : options.isNullable;
    this.additionalType = (0, import_types.toType)(options.additionalType, "Schema additionalType");
    this.patternTypes = (options.patternTypes || []).map((item, i) => ({
      ...item,
      type: (0, import_types.toType)(item.type, `Schema patternTypes[${i}].type`)
    }));
    this.minProperties = options.minProperties;
    this.maxProperties = options.maxProperties;
    this.defaults = options.defaults || [];
    this.removeAdditional = options.removeAdditional;
    this.dependencies = (options.dependencies || []).map(
      (item, i) => item.type === void 0 ? item : { ...item, type: (0, import_types.toType)(item.type, `Schema dependencies[${i}].type`) }
    );
    this.propertyNameType = (0, import_types.toType)(options.propertyNameType, "Schema propertyNameType");
    this.visitObjs();
    this.keys = Object.keys(this.schema);
    this.keySet = new Set(this.keys);
  }
  visitObjs() {
    let options;
    const nestedOptions = () => {
      if (options === void 0) {
        options = {
          ...this.options,
          patternTypes: void 0,
          dependencies: void 0,
          propertyNameType: void 0,
          defaults: void 0,
          removeAdditional: void 0
        };
      }
      return options;
    };
    const keys = Object.keys(this.schema);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const value = this.schema[key];
      if (!(value instanceof Schema)) {
        if (!(value instanceof import_types.ValidateType)) {
          this.schema[key] = new Schema(value, nestedOptions());
        } else if (value instanceof import_types.ObjType && !(value.schema instanceof import_types.ValidateType && !(value.schema instanceof Schema))) {
          this.schema[key] = new Schema(
            value.shape instanceof Schema ? value.shape.schema : value.shape,
            nestedOptions()
          );
        }
      }
    }
  }
  // Fast boolean check equivalent to validate(obj).length === 0 that builds no messages.
  isValid(obj) {
    if (obj === void 0) {
      return !this.isMandatory;
    }
    if (obj === null) {
      return this.isNullable;
    }
    if (typeof obj !== "object" || Array.isArray(obj)) {
      return false;
    }
    if (this.defaults.length > 0) {
      (0, import_defaults.assignDefaults)(obj, this.defaults);
    }
    const { keys } = this;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (!this.schema[key].isValid((0, import_coerce.readCoerced)(obj, key, this.schema[key], ownValue(obj, key)))) {
        return false;
      }
    }
    const objKeys = Object.keys(obj);
    const { patternTypes, propertyNameType, removeAdditional } = this;
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
            if (!patternTypes[j].type.isValid((0, import_coerce.readCoerced)(obj, key, patternTypes[j].type, obj[key]))) {
              return false;
            }
          }
        }
        if (!this.isDeclared(key) && !matched) {
          if (this.removes(obj, key)) {
            delete obj[key];
          } else if (!this.isOpen || this.additionalType && !this.additionalType.isValid((0, import_coerce.readCoerced)(obj, key, this.additionalType, obj[key]))) {
            return false;
          }
        }
      }
    }
    return this.dependencies.every(
      ({ key, required, type }) => ownValue(obj, key) === void 0 || (required ? required.every((property) => ownValue(obj, property) !== void 0) : type.isValid(obj))
    );
  }
  validate(obj, fieldName = void 0) {
    return this.isValid(obj) ? [] : this.errors(obj, fieldName);
  }
  // Whether a number of keys satisfies minProperties and maxProperties.
  hasPropertyCount(count) {
    return !(this.minProperties !== void 0 && count < this.minProperties || this.maxProperties !== void 0 && count > this.maxProperties);
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
    return this.removeAdditional === "delete" || this.removeAdditional === "failing" && !this.additionalType.isValid(obj[key]);
  }
  // Compiles the schema into generated code, several times faster than validate(): see compileType() in compile.js
  // for the options. The compiled function does not see changes made to the schema afterwards.
  compile(options = {}) {
    return compileModule.compileType(this, options);
  }
  // Error messages of a value already known to be invalid.
  errors(obj, fieldName = void 0) {
    const name = fieldName || "Value";
    const { keys: schemaKeys } = this;
    const errors = [];
    if (obj === void 0) {
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
    if (typeof obj !== "object" || Array.isArray(obj)) {
      errors.push(`${name} must be an object`);
      return errors;
    }
    if (this.defaults.length > 0) {
      (0, import_defaults.assignDefaults)(obj, this.defaults);
    }
    for (let i = 0; i < schemaKeys.length; i += 1) {
      const key = schemaKeys[i];
      const type = this.schema[key];
      const value = (0, import_coerce.readCoerced)(obj, key, type, ownValue(obj, key));
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
          const value = (0, import_coerce.readCoerced)(obj, key, type, obj[key]);
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
          const value = (0, import_coerce.readCoerced)(obj, key, this.additionalType, obj[key]);
          if (!this.additionalType.isValid(value)) {
            errors.push(this.additionalType.errors(value, keyName));
          }
        }
      }
    }
    const count = objKeys.length;
    if (this.minProperties !== void 0 && count < this.minProperties) {
      errors.push(`${name} must have at least ${this.minProperties} properties`);
    }
    if (this.maxProperties !== void 0 && count > this.maxProperties) {
      errors.push(`${name} must have at most ${this.maxProperties} properties`);
    }
    this.dependencies.forEach(({ key, required, type }) => {
      if (ownValue(obj, key) === void 0) {
        return;
      }
      const keyName = fieldName ? `${fieldName}.${key}` : key;
      if (required) {
        required.filter((property) => ownValue(obj, property) === void 0).forEach((property) => {
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
(0, import_validate_type.provide)({ Schema });

},
"@xufa/schema/lib/standalone-helpers.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var standalone_helpers_exports = {};
__export(standalone_helpers_exports, {
  HELPER_SOURCES: () => HELPER_SOURCES
});
module.exports = __toCommonJS(standalone_helpers_exports);
const HELPER_SOURCES = {
  codePointLength: {
    calls: [],
    source: [
      "function codePointLength(value) {",
      "  let count = 0;",
      "  for (let i = 0; i < value.length; i += 1) {",
      "    const code = value.charCodeAt(i);",
      "    if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {",
      "      const next = value.charCodeAt(i + 1);",
      "      if (next >= 0xdc00 && next <= 0xdfff) {",
      "        i += 1;",
      "      }",
      "    }",
      "    count += 1;",
      "  }",
      "  return count;",
      "}"
    ].join("\n")
  },
  deepEqual: {
    calls: [],
    source: [
      "function deepEqual(a, b) {",
      "  if (a === b) return true;",
      "  if (Number.isNaN(a) && Number.isNaN(b)) return true;",
      "  if (a && b && typeof a === 'object' && typeof b === 'object') {",
      "    if (a.constructor !== b.constructor) return false;",
      "    if (Array.isArray(a)) {",
      "      const l = a.length;",
      "      if (l !== b.length) return false;",
      "      for (let i = 0; i < l; i += 1) {",
      "        if (!deepEqual(a[i], b[i])) return false;",
      "      }",
      "      return true;",
      "    }",
      "    if (a instanceof Map && b instanceof Map) {",
      "      if (a.size !== b.size) return false;",
      "      const keys = [...a.keys()];",
      "      for (let i = 0; i < keys.length; i += 1) {",
      "        const key = keys[i];",
      "        if (!b.has(key)) return false;",
      "      }",
      "      for (let i = 0; i < keys.length; i += 1) {",
      "        const key = keys[i];",
      "        if (!deepEqual(a.get(key), b.get(key))) return false;",
      "      }",
      "      return true;",
      "    }",
      "    if (a instanceof Set && b instanceof Set) {",
      "      if (a.size !== b.size) return false;",
      "      const keys = [...a.keys()];",
      "      for (let i = 0; i < keys.length; i += 1) {",
      "        const key = keys[i];",
      "        if (!b.has(key)) return false;",
      "      }",
      "      return true;",
      "    }",
      "    if (ArrayBuffer.isView(a)) {",
      "      const l = a.length;",
      "      if (l !== b.length) return false;",
      "      for (let i = 0; i < l; i += 1) {",
      "        if (a[i] !== b[i]) return false;",
      "      }",
      "      return true;",
      "    }",
      "    if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;",
      "    if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();",
      "    if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();",
      "    const keys = Object.keys(a);",
      "    if (keys.length !== Object.keys(b).length) return false;",
      "    for (let i = 0; i < keys.length; i += 1) {",
      "      const key = keys[i];",
      "      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;",
      "      if (!deepEqual(a[key], b[key])) return false;",
      "    }",
      "    return true;",
      "  }",
      "  return false;",
      "}"
    ].join("\n")
  },
  hasDuplicates: {
    calls: ["deepEqual"],
    source: [
      "function hasDuplicates(value) {",
      "  if (value.some((item) => item !== null && typeof item === 'object')) {",
      "    return value.some((item, i) => value.findIndex((other) => deepEqual(item, other)) !== i);",
      "  }",
      "  const seen = new Set();",
      "  for (let i = 0; i < value.length; i += 1) {",
      "    if (i in value && seen.has(value[i])) {",
      "      return true;",
      "    }",
      "    seen.add(value[i]);",
      "  }",
      "  return false;",
      "}"
    ].join("\n")
  },
  pathName: {
    calls: [],
    source: [
      "function pathName(path) {",
      "  let name;",
      "  for (let i = 0; i < path.length; i += 1) {",
      "    const segment = path[i];",
      "    if (typeof segment === 'number') {",
      "      name = `${name === undefined ? 'Value' : name}[${segment}]`;",
      "    } else if (segment !== null && typeof segment === 'object') {",
      "      return `Key ${name ? `${name}.${segment.key}` : segment.key}`;",
      "    } else {",
      "      name = name ? `${name}.${segment}` : segment;",
      "    }",
      "  }",
      "  return name === undefined ? 'Value' : name;",
      "}"
    ].join("\n")
  },
  errorObject: {
    calls: [],
    source: [
      "function errorObject(path, keyword, params, message) {",
      "  const last = path[path.length - 1];",
      "  const isPropertyName = last !== null && typeof last === 'object';",
      "  const keys = isPropertyName ? path.slice(0, -1).concat(last.key) : path.slice();",
      "  let pointer = '';",
      "  for (let i = 0; i < keys.length; i += 1) {",
      "    const key = `${keys[i]}`;",
      "    // Escaped only when it has one of the two characters to escape.",
      "    pointer += key.includes('~') || key.includes('/') ? `/${key.replace(/~/g, '~0').replace(/\\//g, '~1')}` : `/${key}`;",
      "  }",
      "  const error = { path: keys, pointer, keyword, params, message };",
      "  if (isPropertyName) {",
      "    error.propertyName = true;",
      "  }",
      "  return error;",
      "}"
    ].join("\n")
  },
  isRfc1123Hostname: {
    calls: [],
    source: [
      "function isRfc1123Hostname(value) {",
      "  return (",
      "    value.length <= 253 &&",
      "    value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))",
      "  );",
      "}"
    ].join("\n")
  },
  compareDate: {
    calls: [],
    source: [
      "function compareDate(d1, d2) {",
      "  if (!(d1 && d2)) {",
      "    return undefined;",
      "  }",
      "  if (d1 > d2) {",
      "    return 1;",
      "  }",
      "  return d1 < d2 ? -1 : 0;",
      "}"
    ].join("\n")
  },
  compareTime: {
    calls: [],
    source: [
      "function compareTime(t1, t2) {",
      "  if (!(t1 && t2)) {",
      "    return undefined;",
      "  }",
      "  const ms1 = new Date(`2020-01-01T${t1}`).valueOf();",
      "  const ms2 = new Date(`2020-01-01T${t2}`).valueOf();",
      "  return ms1 && ms2 ? ms1 - ms2 : undefined;",
      "}"
    ].join("\n")
  },
  compareDateTime: {
    calls: [],
    source: [
      "function compareDateTime(dt1, dt2) {",
      "  if (!(dt1 && dt2)) {",
      "    return undefined;",
      "  }",
      "  const ms1 = new Date(dt1).valueOf();",
      "  const ms2 = new Date(dt2).valueOf();",
      "  return ms1 && ms2 ? ms1 - ms2 : undefined;",
      "}"
    ].join("\n")
  },
  isDate: {
    calls: [],
    source: [
      "function isDate(value) {",
      "  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(value);",
      "  if (!match) {",
      "    return false;",
      "  }",
      "  const year = Number(match[1]);",
      "  const month = Number(match[2]);",
      "  const day = Number(match[3]);",
      "  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);",
      "  const days = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];",
      "  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];",
      "}"
    ].join("\n")
  },
  isTime: {
    calls: [],
    source: [
      "function isTime(value) {",
      "  const match = /^(\\d{2}):(\\d{2}):(\\d{2})(?:\\.\\d+)?(?:([zZ])|([+-])(\\d{2}):(\\d{2}))$/.exec(value);",
      "  if (!match) {",
      "    return false;",
      "  }",
      "  const hour = Number(match[1]);",
      "  const minute = Number(match[2]);",
      "  const second = Number(match[3]);",
      "  if (hour > 23 || minute > 59 || second > 60) {",
      "    return false;",
      "  }",
      "  let offset = 0;",
      "  if (!match[4]) {",
      "    const offsetHour = Number(match[6]);",
      "    const offsetMinute = Number(match[7]);",
      "    if (offsetHour > 23 || offsetMinute > 59) {",
      "      return false;",
      "    }",
      "    offset = (match[5] === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute);",
      "  }",
      "  return second < 60 || (hour * 60 + minute - offset + 1440) % 1440 === 23 * 60 + 59;",
      "}"
    ].join("\n")
  },
  isDateTime: {
    calls: ["isDate", "isTime"],
    source: [
      "function isDateTime(value) {",
      "  const match = /^(.{10})[tT](.+)$/.exec(value);",
      "  return match !== null && isDate(match[1]) && isTime(match[2]);",
      "}"
    ].join("\n")
  },
  isDuration: {
    calls: [],
    source: [
      "function isDuration(value) {",
      "  return /^P(?:(?:\\d+Y(?:\\d+M(?:\\d+D)?)?|\\d+M(?:\\d+D)?|\\d+D)(?:T(?:\\d+H(?:\\d+M(?:\\d+S)?)?|\\d+M(?:\\d+S)?|\\d+S))?|T(?:\\d+H(?:\\d+M(?:\\d+S)?)?|\\d+M(?:\\d+S)?|\\d+S)|\\d+W)$/.test(",
      "    value",
      "  );",
      "}"
    ].join("\n")
  },
  isIpv4: {
    calls: [],
    source: [
      "function isIpv4(value) {",
      "  return /^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)$/.test(value);",
      "}"
    ].join("\n")
  },
  isIpv6: {
    calls: ["isIpv4"],
    source: [
      "function isIpv6(value) {",
      "  if (!/^[0-9A-Fa-f:.]+$/.test(value)) {",
      "    return false;",
      "  }",
      "  const halves = value.split('::');",
      "  if (halves.length > 2) {",
      "    return false;",
      "  }",
      "  const groups = halves.map((half) => (half === '' ? [] : half.split(':')));",
      "  const all = groups[groups.length - 1];",
      "  let count = 0;",
      "  if (all.length > 0 && all[all.length - 1].includes('.')) {",
      "    if (!isIpv4(all.pop())) {",
      "      return false;",
      "    }",
      "    count = 2;",
      "  }",
      "  const hextets = [].concat(...groups);",
      "  if (!hextets.every((group) => /^[0-9A-Fa-f]{1,4}$/.test(group))) {",
      "    return false;",
      "  }",
      "  count += hextets.length;",
      "  return halves.length === 2 ? count < 8 : count === 8;",
      "}"
    ].join("\n")
  },
  punycodeAdapt: {
    calls: [],
    source: [
      "function punycodeAdapt(delta, points, isFirst) {",
      "  let result = Math.floor(delta / (isFirst ? 700 : 2));",
      "  result += Math.floor(result / points);",
      "  let k = 0;",
      "  while (result > 455) {",
      "    result = Math.floor(result / 35);",
      "    k += 36;",
      "  }",
      "  return k + Math.floor((36 * result) / (result + 38));",
      "}"
    ].join("\n")
  },
  punycodeDecode: {
    calls: ["punycodeAdapt"],
    source: [
      "function punycodeDecode(input) {",
      "  const output = [];",
      "  const delimiter = input.lastIndexOf('-');",
      "  for (let j = 0; j < Math.max(delimiter, 0); j += 1) {",
      "    if (input.charCodeAt(j) >= 0x80) {",
      "      return undefined;",
      "    }",
      "    output.push(input.charCodeAt(j));",
      "  }",
      "  let n = 128;",
      "  let bias = 72;",
      "  let i = 0;",
      "  for (let index = delimiter < 0 ? 0 : delimiter + 1; index < input.length;) {",
      "    const old = i;",
      "    let weight = 1;",
      "    for (let k = 36; ; k += 36) {",
      "      if (index >= input.length) {",
      "        return undefined;",
      "      }",
      "      const code = input.charCodeAt(index);",
      "      index += 1;",
      "      let digit = 36;",
      "      if (code >= 48 && code <= 57) {",
      "        digit = code - 22;",
      "      } else if (code >= 65 && code <= 90) {",
      "        digit = code - 65;",
      "      } else if (code >= 97 && code <= 122) {",
      "        digit = code - 97;",
      "      }",
      "      if (digit >= 36 || digit > Math.floor((0x7fffffff - i) / weight)) {",
      "        return undefined;",
      "      }",
      "      i += digit * weight;",
      "      let t = k - bias;",
      "      if (k <= bias) {",
      "        t = 1;",
      "      } else if (k >= bias + 26) {",
      "        t = 26;",
      "      }",
      "      if (digit < t) {",
      "        break;",
      "      }",
      "      weight *= 36 - t;",
      "    }",
      "    bias = punycodeAdapt(i - old, output.length + 1, old === 0);",
      "    n += Math.floor(i / (output.length + 1));",
      "    i %= output.length + 1;",
      "    if (n > 0x10ffff) {",
      "      return undefined;",
      "    }",
      "    output.splice(i, 0, n);",
      "    i += 1;",
      "  }",
      "  return String.fromCodePoint(...output);",
      "}"
    ].join("\n")
  },
  punycodeEncode: {
    calls: ["punycodeAdapt"],
    source: [
      "function punycodeEncode(input) {",
      "  const points = Array.from(input, (char) => char.codePointAt(0));",
      "  const digit = (d) => String.fromCharCode(d < 26 ? 97 + d : 22 + d);",
      "  let output = points",
      "    .filter((point) => point < 128)",
      "    .map((point) => String.fromCharCode(point))",
      "    .join('');",
      "  const basic = output.length;",
      "  let handled = basic;",
      "  if (basic > 0) {",
      "    output += '-';",
      "  }",
      "  let n = 128;",
      "  let delta = 0;",
      "  let bias = 72;",
      "  while (handled < points.length) {",
      "    // The smallest code point not handled yet.",
      "    let m = 0x10ffff;",
      "    for (let i = 0; i < points.length; i += 1) {",
      "      if (points[i] >= n && points[i] < m) {",
      "        m = points[i];",
      "      }",
      "    }",
      "    delta += (m - n) * (handled + 1);",
      "    n = m;",
      "    for (let i = 0; i < points.length; i += 1) {",
      "      if (points[i] < n) {",
      "        delta += 1;",
      "      }",
      "      if (points[i] === n) {",
      "        let q = delta;",
      "        for (let k = 36; ; k += 36) {",
      "          let t = k - bias;",
      "          if (k <= bias) {",
      "            t = 1;",
      "          } else if (k >= bias + 26) {",
      "            t = 26;",
      "          }",
      "          if (q < t) {",
      "            break;",
      "          }",
      "          output += digit(t + ((q - t) % (36 - t)));",
      "          q = Math.floor((q - t) / (36 - t));",
      "        }",
      "        output += digit(q);",
      "        bias = punycodeAdapt(delta, handled + 1, handled === basic);",
      "        delta = 0;",
      "        handled += 1;",
      "      }",
      "    }",
      "    delta += 1;",
      "    n += 1;",
      "  }",
      "  return output;",
      "}"
    ].join("\n")
  },
  bidiClass: {
    calls: [],
    source: [
      "function bidiClass(char) {",
      "  if (/[\\u0600-\\u0605\\u0660-\\u0669\\u066B\\u066C\\u06DD\\u0890\\u0891\\u08E2]/u.test(char)) {",
      "    return 'AN';",
      "  }",
      "  if (/[0-9\\u06F0-\\u06F9\\u00B2\\u00B3\\u00B9\\u2070-\\u2079\\u2080-\\u2089\\uFF10-\\uFF19]/u.test(char)) {",
      "    return 'EN';",
      "  }",
      "  if (/[\\p{Mn}\\p{Me}]/u.test(char)) {",
      "    return 'NSM';",
      "  }",
      "  if (/[\\p{Script=Arabic}\\p{Script=Syriac}\\p{Script=Thaana}]/u.test(char)) {",
      "    return 'AL';",
      "  }",
      "  if (/[\\p{Script=Hebrew}\\p{Script=Nko}\\p{Script=Samaritan}\\p{Script=Mandaic}\\u200F]/u.test(char)) {",
      "    return 'R';",
      "  }",
      "  if (/[+-]/.test(char)) {",
      "    return 'ES';",
      "  }",
      "  if (/[,./:\\u00A0]/.test(char)) {",
      "    return 'CS';",
      "  }",
      "  if (/[#$%\\u00A2-\\u00A5\\u00B0\\u00B1]/u.test(char)) {",
      "    return 'ET';",
      "  }",
      "  return /[\\p{L}\\p{Mc}]/u.test(char) ? 'L' : 'ON';",
      "}"
    ].join("\n")
  },
  hasValidBidi: {
    calls: ["bidiClass"],
    source: [
      "function hasValidBidi(label) {",
      "  const classes = Array.from(label, bidiClass);",
      "  const first = classes[0];",
      "  const last = classes.filter((type) => type !== 'NSM').pop();",
      "  if (first === 'R' || first === 'AL') {",
      "    return (",
      "      classes.every((type) => ['R', 'AL', 'AN', 'EN', 'ES', 'CS', 'ET', 'ON', 'NSM'].includes(type)) &&",
      "      ['R', 'AL', 'EN', 'AN'].includes(last) &&",
      "      !(classes.includes('EN') && classes.includes('AN'))",
      "    );",
      "  }",
      "  if (first === 'L') {",
      "    return (",
      "      classes.every((type) => ['L', 'EN', 'ES', 'CS', 'ET', 'ON', 'NSM'].includes(type)) && ['L', 'EN'].includes(last)",
      "    );",
      "  }",
      "  return false;",
      "}"
    ].join("\n")
  },
  isULabel: {
    calls: [],
    source: [
      "function isULabel(label) {",
      "  const chars = Array.from(label);",
      "  if (label.length === 0 || label.normalize('NFC') !== label || /^\\p{M}/u.test(label)) {",
      "    return false;",
      "  }",
      "  if (label.startsWith('-') || label.endsWith('-') || label.slice(2, 4) === '--') {",
      "    return false;",
      "  }",
      "  const virama =",
      "    /[\\u094D\\u09CD\\u0A4D\\u0ACD\\u0B4D\\u0BCD\\u0C4D\\u0CCD\\u0D3B\\u0D3C\\u0D4D\\u0DCA\\u0E3A\\u0F84\\u1039\\u103A\\u1714\\u1734\\u17D2\\u1A60\\u1B44\\u1BAA\\u1BAB\\u1BF2\\u1BF3\\u2D7F\\uA806\\uA8C4\\uA953\\uA9C0\\uAAF6\\uABED]/u;",
      "  const joining = /[\\p{Script=Arabic}\\p{Script=Syriac}\\p{Script=Nko}\\p{Script=Mongolian}]/u;",
      "  return chars.every((char, i) => {",
      "    const before = chars[i - 1];",
      "    const after = chars[i + 1];",
      "    switch (char) {",
      "      case '\\u00DF':",
      "      case '\\u03C2':",
      "      case '\\u06FD':",
      "      case '\\u06FE':",
      "      case '\\u0F0B':",
      "      case '\\u3007':",
      "        return true;",
      "      case '\\u00B7':",
      "        return before === 'l' && after === 'l';",
      "      case '\\u0375':",
      "        return after !== undefined && /\\p{Script=Greek}/u.test(after);",
      "      case '\\u05F3':",
      "      case '\\u05F4':",
      "        return before !== undefined && /\\p{Script=Hebrew}/u.test(before);",
      "      case '\\u30FB':",
      "        return chars.some(",
      "          (other) => /[\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Han}]/u.test(other) && other !== '\\u30FB'",
      "        );",
      "      case '\\u200D':",
      "        return before !== undefined && virama.test(before);",
      "      case '\\u200C': {",
      "        if (before !== undefined && virama.test(before)) {",
      "          return true;",
      "        }",
      "        // Joining letters on both sides, marks between them skipped.",
      "        const left = chars",
      "          .slice(0, i)",
      "          .reverse()",
      "          .find((other) => !/\\p{Mn}/u.test(other));",
      "        const right = chars.slice(i + 1).find((other) => !/\\p{Mn}/u.test(other));",
      "        return left !== undefined && right !== undefined && joining.test(left) && joining.test(right);",
      "      }",
      "      default:",
      "        break;",
      "    }",
      "    if (/[\\u0660-\\u0669]/u.test(char)) {",
      "      return !chars.some((other) => /[\\u06F0-\\u06F9]/u.test(other));",
      "    }",
      "    if (/[\\u06F0-\\u06F9]/u.test(char)) {",
      "      return !chars.some((other) => /[\\u0660-\\u0669]/u.test(other));",
      "    }",
      "    // The code points RFC 5892 lists as DISALLOWED, marks among them.",
      "    // eslint-disable-next-line no-misleading-character-class -- each one is a code point on its own",
      "    if (/[\\u0640\\u07FA\\u302E\\u302F\\u3031-\\u3035\\u303B]/u.test(char)) {",
      "      return false;",
      "    }",
      "    return /[\\p{Ll}\\p{Lo}\\p{Lm}\\p{Mn}\\p{Mc}\\p{Nd}-]/u.test(char) && char.normalize('NFKC').toLowerCase() === char;",
      "  });",
      "}"
    ].join("\n")
  },
  hasValidLabels: {
    calls: ["punycodeDecode", "punycodeEncode", "bidiClass", "hasValidBidi", "isULabel"],
    source: [
      "function hasValidLabels(value, isIdn) {",
      '  // A name of letter-digit-hyphen labels needs no mapping and has no right-to-left label: without "--" in the third and',
      '  // fourth positions of a label (RFC 5891), which only a punycode label ("xn--") may have and the full check reads, it',
      "  // only has to be at most 253 characters long.",
      "  if (",
      "    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(value) &&",
      "    !/(?:^|\\.)[A-Za-z0-9-]{2}--/.test(value)",
      "  ) {",
      "    return value.length <= 253;",
      "  }",
      "  const mapped = isIdn",
      "    ? value",
      "        .normalize('NFKC')",
      "        .replace(/[\\u3002\\uFF0E\\uFF61]/gu, '.')",
      "        // Code points the mapping removes (soft hyphen, zero width space, variation selectors...).",
      "        // eslint-disable-next-line no-misleading-character-class -- each one is a code point on its own",
      "        .replace(/[\\u00AD\\u200B\\u2060\\uFEFF\\u180B-\\u180D\\uFE00-\\uFE0F]/gu, '')",
      "        .toLowerCase()",
      "    : value;",
      "  if (!isIdn && !/^[\\x21-\\x7E]*$/.test(mapped)) {",
      "    return false;",
      "  }",
      "  const labels = mapped.split('.');",
      "  const unicode = [];",
      "  const ascii = [];",
      "  const valid = labels.every((label) => {",
      "    if (/^xn--/i.test(label)) {",
      "      const decoded = punycodeDecode(label.slice(4).toLowerCase());",
      "      if (",
      "        decoded === undefined ||",
      "        Array.from(decoded).every((char) => char.charCodeAt(0) < 0x80) ||",
      "        punycodeEncode(decoded) !== label.slice(4).toLowerCase() ||",
      "        !isULabel(decoded)",
      "      ) {",
      "        return false;",
      "      }",
      "      unicode.push(decoded);",
      "      ascii.push(label);",
      "      return label.length <= 63;",
      "    }",
      "    if (Array.from(label).every((char) => char.charCodeAt(0) < 0x80)) {",
      "      unicode.push(label);",
      "      ascii.push(label);",
      "      return (",
      "        /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label) &&",
      "        !(label.slice(2, 4) === '--' && !/^xn--/i.test(label))",
      "      );",
      "    }",
      "    if (!isIdn || !isULabel(label)) {",
      "      return false;",
      "    }",
      "    unicode.push(label);",
      "    ascii.push(`xn--${punycodeEncode(label)}`);",
      "    return ascii[ascii.length - 1].length <= 63;",
      "  });",
      "  if (!valid || ascii.join('.').length > 253) {",
      "    return false;",
      "  }",
      "  // With a right-to-left label, every label follows the Bidi rule.",
      "  const isRtl = unicode.some((label) => Array.from(label).some((char) => ['R', 'AL', 'AN'].includes(bidiClass(char))));",
      "  return !isRtl || unicode.every(hasValidBidi);",
      "}"
    ].join("\n")
  },
  isHostname: {
    calls: ["hasValidLabels"],
    source: ["function isHostname(value) {", "  return hasValidLabels(value, false);", "}"].join("\n")
  },
  isIdnHostname: {
    calls: ["hasValidLabels"],
    source: ["function isIdnHostname(value) {", "  return hasValidLabels(value, true);", "}"].join("\n")
  },
  isEmailWith: {
    calls: ["isIpv4", "isIpv6"],
    source: [
      "function isEmailWith(value, isIdn, isHost) {",
      "  const at = value.lastIndexOf('@');",
      "  if (at <= 0 || at === value.length - 1) {",
      "    return false;",
      "  }",
      "  const local = value.slice(0, at);",
      "  const domain = value.slice(at + 1);",
      "  // Literals, which are compiled once (a RegExp made here would be compiled on every call).",
      "  const dotAtom = isIdn",
      "    ? /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~\\u0080-\\u{10FFFF}-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~\\u0080-\\u{10FFFF}-]+)*$/u",
      "    : /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;",
      `  // A quoted local part: printable ASCII but '"' and '\\', which are escaped, and in idn-email other characters too.`,
      "  const quoted = isIdn",
      '    ? /^"(?:[\\x20\\x21\\x23-\\x5B\\x5D-\\x7E\\u0080-\\u{10FFFF}]|\\\\[\\x20-\\x7E])*"$/u',
      '    : /^"(?:[\\x20\\x21\\x23-\\x5B\\x5D-\\x7E]|\\\\[\\x20-\\x7E])*"$/;',
      "  if (!dotAtom.test(local) && !quoted.test(local)) {",
      "    return false;",
      "  }",
      "  const literal = domain.charCodeAt(0) === 0x5b ? /^\\[(?:IPv6:(.+)|(.+))\\]$/i.exec(domain) : null;",
      "  if (literal) {",
      "    return literal[1] !== undefined ? isIpv6(literal[1]) : isIpv4(literal[2]);",
      "  }",
      "  return isHost(domain);",
      "}"
    ].join("\n")
  },
  isEmail: {
    calls: ["isHostname", "isEmailWith"],
    source: ["function isEmail(value) {", "  return isEmailWith(value, false, isHostname);", "}"].join("\n")
  },
  isIdnEmail: {
    calls: ["isIdnHostname", "isEmailWith"],
    source: ["function isIdnEmail(value) {", "  return isEmailWith(value, true, isIdnHostname);", "}"].join("\n")
  },
  isRegex: {
    calls: [],
    source: [
      "function isRegex(value) {",
      "  try {",
      "    RegExp(value, 'u');",
      "    return true;",
      "  } catch (e) {",
      "    return false;",
      "  }",
      "}"
    ].join("\n")
  }
};

},
"@xufa/schema/lib/standalone.js": function (module, exports, require) {
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var standalone_exports = {};
__export(standalone_exports, {
  standaloneCode: () => standaloneCode,
  standaloneJsonSchema: () => standaloneJsonSchema,
  standaloneModule: () => standaloneModule
});
module.exports = __toCommonJS(standalone_exports);
var import_compile = require("./compile.js");
var import_json_schema = require("./json-schema.js");
var import_deep_equal = require("./deep-equal.js");
var import_code_point_length = require("./types/code-point-length.js");
var import_has_duplicates = require("./types/has-duplicates.js");
var import_validate_type = require("./types/validate-type.js");
var import_standalone_helpers = require("./standalone-helpers.js");
var import_formats = require("./formats.js");
var import_error_objects = require("./error-objects.js");
var import_package = __toESM(require("../package.json"));
const { version } = import_package.default;
const HELPERS = new Map([
  [import_code_point_length.codePointLength, "codePointLength"],
  [import_deep_equal.deepEqual, "deepEqual"],
  [import_has_duplicates.hasDuplicates, "hasDuplicates"],
  [import_error_objects.pathName, "pathName"],
  [import_error_objects.errorObject, "errorObject"],
  ...Object.entries(import_formats.FORMAT_FUNCTIONS).map(([name, fn]) => [fn, name])
]);
const RESERVED = new Set(
  "break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var void while with yield let static implements interface package private protected public await arguments eval undefined NaN Infinity module exports require".split(" ")
);
function valueSource(value) {
  if (value === void 0) {
    return "undefined";
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) {
      return "NaN";
    }
    if (!Number.isFinite(value)) {
      return value > 0 ? "Infinity" : "-Infinity";
    }
    return Object.is(value, -0) ? "-0" : String(value);
  }
  if (typeof value === "bigint") {
    return `${value}n`;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${Array.from(value, (item, i) => i in value ? valueSource(item) : "").join(", ")}]`;
  }
  if ((0, import_validate_type.isPlainObject)(value)) {
    const entries = Object.entries(value).map(([key, item]) => `[${JSON.stringify(key)}]: ${valueSource(item)}`);
    return `{ ${entries.join(", ")} }`;
  }
  throw new Error(
    `Standalone code cannot contain the value ${String(value)}: only primitives, arrays and plain objects`
  );
}
function constantSource(value, helpers) {
  if (typeof value === "function") {
    const name = HELPERS.get(value);
    if (name === void 0 && value.validatorKeyword !== void 0) {
      throw new Error(
        `Standalone code cannot contain the functions of the keyword "${value.validatorKeyword}": define it as a macro, or compile the schema with compileJsonSchema() instead`
      );
    }
    if (name === void 0) {
      throw new Error(`Standalone code cannot contain the function ${value.name || "(anonymous)"}`);
    }
    const add = (helper) => {
      helpers.add(helper);
      import_standalone_helpers.HELPER_SOURCES[helper].calls.forEach(add);
    };
    add(name);
    return name;
  }
  if (value instanceof RegExp) {
    return `new RegExp(${JSON.stringify(value.source)}, ${JSON.stringify(value.flags)})`;
  }
  if (value instanceof Set) {
    return `new Set([${Array.from(value, valueSource).join(", ")}])`;
  }
  return valueSource(value);
}
function validatorSource(type, options, helpers) {
  const { mode, source, constants, nodes } = (0, import_compile.generateSource)((0, import_validate_type.toType)(type, "Standalone type"), options);
  if (nodes.length > 0) {
    const names = [...new Set(nodes.map((node) => node.constructor.name))].join(", ");
    throw new Error(
      `Standalone code cannot contain types of your own (${names}): their validate() runs when validating; compile them with compile() instead`
    );
  }
  const code = `const c = [${constants.map((value) => constantSource(value, helpers)).join(", ")}];
`;
  const factory = `(function () {
${code}${source}
})()`;
  if (mode !== "first") {
    return factory;
  }
  return `(function () {
const first = ${factory};
return function validate(value) {
const error = first(value);
return error === undefined ? [] : [error];
};
})()`;
}
function moduleSource(entries, options) {
  const format = options.format === void 0 ? "commonjs" : options.format;
  if (format !== "commonjs" && format !== "esm") {
    throw new Error(`Unsupported standalone option "format": "${format}" is not "commonjs" or "esm"`);
  }
  const helpers = /* @__PURE__ */ new Set();
  const validators = entries.map(([name, type]) => {
    if (name !== void 0 && (!/^[A-Za-z_$][\w$]*$/.test(name) || RESERVED.has(name) || name === "c")) {
      throw new Error(`Standalone validator name "${name}" is not a valid JavaScript name`);
    }
    return [name, validatorSource(type, options, helpers)];
  });
  const clash = validators.find(([name]) => helpers.has(name));
  if (clash) {
    throw new Error(`Standalone validator name "${clash[0]}" is the name of a helper of the generated code`);
  }
  let code = `// Generated by @xufa/schema ${version}: do not edit, generate it again instead.
`;
  if (format === "commonjs") {
    code += "'use strict';\n";
  }
  code += [...helpers].map((helper) => `${import_standalone_helpers.HELPER_SOURCES[helper].source}
`).join("");
  validators.forEach(([name, source]) => {
    code += `const ${name === void 0 ? "validate" : name} = ${source};
`;
  });
  const names = validators.map(([name]) => name).filter((name) => name !== void 0);
  if (names.length === 0) {
    code += format === "commonjs" ? "module.exports = validate;\nmodule.exports.default = validate;\n" : "export default validate;\n";
  } else {
    code += format === "commonjs" ? `module.exports = { ${names.join(", ")} };
` : `export { ${names.join(", ")} };
`;
  }
  return code;
}
function standaloneCode(type, options = {}) {
  return moduleSource([[void 0, type]], options);
}
function standaloneModule(validators, options = {}) {
  if (!(0, import_validate_type.isPlainObject)(validators) || Object.keys(validators).length === 0) {
    throw new Error("standaloneModule() expects an object of types by the names to export them with");
  }
  return moduleSource(Object.entries(validators), options);
}
function standaloneJsonSchema(json, options = {}) {
  return standaloneCode((0, import_json_schema.fromJsonSchema)(json, options), options);
}

},
"@xufa/schema/lib/types/all-of.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var all_of_exports = {};
__export(all_of_exports, {
  AllOf: () => AllOf,
  AllOfType: () => AllOfType,
  allOf: () => allOf,
  oallOf: () => oallOf
});
module.exports = __toCommonJS(all_of_exports);
var import_validate_type = require("./validate-type.js");
class AllOfType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.types = (0, import_validate_type.toTypes)(options.types, "AllOf types") || [];
  }
  // The errors of every type the value fails. The field name goes to them as received: undefined for the value
  // itself, so a Schema names its keys as it does on its own.
  validate(value, fieldName = void 0) {
    const result = super.validate(value, fieldName || "Value");
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      const errors = this.types.filter((type) => !type.isValid(value)).map((type) => type.errors(value, fieldName));
      if (errors.length <= 1) {
        return errors[0];
      }
      return errors.flat(Infinity);
    }
    return void 0;
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
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
  if (types !== void 0 && types !== null && !Array.isArray(types) && typeof types === "object") {
    return new AllOfType(types);
  }
  return new AllOfType({ types, isMandatory, isNullable });
}
function oallOf(types, isMandatory = false, isNullable = false) {
  if (types !== void 0 && types !== null && !Array.isArray(types) && typeof types === "object") {
    return new AllOfType({ isMandatory: false, ...types });
  }
  return new AllOfType({ types, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/any-of.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var any_of_exports = {};
__export(any_of_exports, {
  AnyOf: () => AnyOf,
  AnyOfType: () => AnyOfType,
  anyOf: () => anyOf,
  oanyOf: () => oanyOf
});
module.exports = __toCommonJS(any_of_exports);
var import_validate_type = require("./validate-type.js");
class AnyOfType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.types = (0, import_validate_type.toTypes)(options.types, "AnyOf types");
  }
  // The field name goes to the alternatives as received (see AllOfType.validate()).
  validate(value, fieldName = void 0) {
    const result = super.validate(value, fieldName || "Value");
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      if (this.isValid(value)) {
        return void 0;
      }
      return this.types.map((type) => type.errors(value, fieldName));
    }
    return void 0;
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
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
  if (types !== void 0 && types !== null && !Array.isArray(types) && typeof types === "object") {
    return new AnyOfType(types);
  }
  return new AnyOfType({ types, isMandatory, isNullable });
}
function oanyOf(types, isMandatory = false, isNullable = false) {
  if (types !== void 0 && types !== null && !Array.isArray(types) && typeof types === "object") {
    return new AnyOfType({ isMandatory: false, ...types });
  }
  return new AnyOfType({ types, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/any.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var any_exports = {};
__export(any_exports, {
  Any: () => Any,
  AnyType: () => AnyType,
  any: () => any,
  oany: () => oany
});
module.exports = __toCommonJS(any_exports);
var import_validate_type = require("./validate-type.js");
class AnyType extends import_validate_type.ValidateType {
  isValid(value) {
    return this.checkPresence(value) ?? true;
  }
}
function Any(options) {
  return new AnyType(options);
}
function any(isMandatory = true, isNullable = false) {
  if (isMandatory !== void 0 && isMandatory !== null && typeof isMandatory === "object") {
    return new AnyType(isMandatory);
  }
  return new AnyType({ isMandatory, isNullable });
}
function oany(isMandatory = false, isNullable = false) {
  if (isMandatory !== void 0 && isMandatory !== null && typeof isMandatory === "object") {
    return new AnyType({ isMandatory: false, ...isMandatory });
  }
  return new AnyType({ isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/array-of.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var array_of_exports = {};
__export(array_of_exports, {
  ArrayOf: () => ArrayOf,
  ArrayOfType: () => ArrayOfType,
  arrOf: () => arrOf,
  oarrOf: () => oarrOf
});
module.exports = __toCommonJS(array_of_exports);
var import_has_duplicates = require("./has-duplicates.js");
var import_defaults = require("../defaults.js");
var import_coerce = require("../coerce.js");
var import_validate_type = require("./validate-type.js");
class ArrayOfType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.type = Array.isArray(options.type) ? (0, import_validate_type.toTypes)(options.type, "ArrayOf type") : (0, import_validate_type.toType)(options.type, "ArrayOf type");
    this.min = options.min;
    this.max = options.max;
    this.defaults = options.defaults || [];
    this.unique = options.unique;
    this.contains = (0, import_validate_type.toType)(options.contains, "ArrayOf contains");
    this.minContains = options.minContains;
    this.maxContains = options.maxContains;
    this.additionalType = (0, import_validate_type.toType)(options.additionalType, "ArrayOf additionalType");
  }
  // Number of elements matching contains, counted only as far as the limits need.
  countMatches(value) {
    const min = this.minContains === void 0 ? 1 : this.minContains;
    const stop = this.maxContains === void 0 ? min : this.maxContains + 1;
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
    const min = this.minContains === void 0 ? 1 : this.minContains;
    return count >= min && (this.maxContains === void 0 || count <= this.maxContains);
  }
  // Error of the elements matching contains, or undefined.
  containsError(value, fieldName) {
    const min = this.minContains === void 0 ? 1 : this.minContains;
    const max = this.maxContains;
    const count = this.countMatches(value);
    if (count < min) {
      return min === 1 ? `${fieldName} must contain at least one matching element` : `${fieldName} must contain at least ${min} matching elements`;
    }
    if (max !== void 0 && count > max) {
      return max === 1 ? `${fieldName} must contain at most one matching element` : `${fieldName} must contain at most ${max} matching elements`;
    }
    return void 0;
  }
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      if (!Array.isArray(value)) {
        return `${fieldName} must be an array`;
      }
      if (this.defaults.length > 0) {
        (0, import_defaults.assignDefaults)(value, this.defaults);
      }
      if (this.min !== void 0 && value.length < this.min) {
        return `${fieldName} must have at least ${this.min} elements`;
      }
      if (this.max !== void 0 && value.length > this.max) {
        return `${fieldName} must have at most ${this.max} elements`;
      }
      if (this.unique && (0, import_has_duplicates.hasDuplicates)(value)) {
        return `${fieldName} must not have duplicate elements`;
      }
      const containsError = this.contains && this.containsError(value, fieldName);
      if (containsError) {
        return containsError;
      }
      if (this.type) {
        const errors = [];
        const check = (type, i) => {
          const item = (0, import_coerce.readCoerced)(value, i, type, value[i]);
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
    return void 0;
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    if (Array.isArray(value) && this.defaults.length > 0) {
      (0, import_defaults.assignDefaults)(value, this.defaults);
    }
    if (!Array.isArray(value) || this.min !== void 0 && value.length < this.min || this.max !== void 0 && value.length > this.max || this.unique && (0, import_has_duplicates.hasDuplicates)(value) || this.contains && !this.hasMatches(value)) {
      return false;
    }
    if (Array.isArray(this.type)) {
      for (let i = 0; i < this.type.length; i += 1) {
        if (!this.type[i].isValid((0, import_coerce.readCoerced)(value, i, this.type[i], value[i]))) {
          return false;
        }
      }
      if (this.additionalType) {
        for (let i = this.type.length; i < value.length; i += 1) {
          if (!this.additionalType.isValid((0, import_coerce.readCoerced)(value, i, this.additionalType, value[i]))) {
            return false;
          }
        }
      }
    } else if (this.type) {
      for (let i = 0; i < value.length; i += 1) {
        if (!this.type.isValid((0, import_coerce.readCoerced)(value, i, this.type, value[i]))) {
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
  "type",
  "min",
  "max",
  "unique",
  "contains",
  "minContains",
  "maxContains",
  "additionalType",
  "isMandatory",
  "isNullable"
];
function isOptions(value) {
  if (!(0, import_validate_type.isPlainObject)(value)) {
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

},
"@xufa/schema/lib/types/boolean.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var boolean_exports = {};
__export(boolean_exports, {
  Boolean: () => Boolean,
  BooleanType: () => BooleanType,
  bool: () => bool,
  obool: () => obool
});
module.exports = __toCommonJS(boolean_exports);
var import_validate_type = require("./validate-type.js");
class BooleanType extends import_validate_type.ValidateType {
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null && typeof value !== "boolean") {
      return `${fieldName} must be a boolean`;
    }
    return void 0;
  }
  isValid(value) {
    return this.checkPresence(value) ?? typeof value === "boolean";
  }
}
function Boolean(options) {
  return new BooleanType(options);
}
function bool(isMandatory = true, isNullable = false) {
  if (isMandatory !== void 0 && isMandatory !== null && typeof isMandatory === "object") {
    return new BooleanType(isMandatory);
  }
  return new BooleanType({ isMandatory, isNullable });
}
function obool(isMandatory = false, isNullable = false) {
  if (isMandatory !== void 0 && isMandatory !== null && typeof isMandatory === "object") {
    return new BooleanType({ isMandatory: false, ...isMandatory });
  }
  return new BooleanType({ isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/code-point-length.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var code_point_length_exports = {};
__export(code_point_length_exports, {
  codePointLength: () => codePointLength,
  hasFewerCodePoints: () => hasFewerCodePoints,
  hasMoreCodePoints: () => hasMoreCodePoints
});
module.exports = __toCommonJS(code_point_length_exports);
function codePointLength(value) {
  let count = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 55296 && code <= 56319 && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1);
      if (next >= 56320 && next <= 57343) {
        i += 1;
      }
    }
    count += 1;
  }
  return count;
}
function hasFewerCodePoints(value, min) {
  return value.length < min || value.length < 2 * min && codePointLength(value) < min;
}
function hasMoreCodePoints(value, max) {
  return value.length > 2 * max || value.length > max && codePointLength(value) > max;
}

},
"@xufa/schema/lib/types/conditional.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var conditional_exports = {};
__export(conditional_exports, {
  Conditional: () => Conditional,
  ConditionalType: () => ConditionalType
});
module.exports = __toCommonJS(conditional_exports);
var import_validate_type = require("./validate-type.js");
class ConditionalType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.ifType = (0, import_validate_type.toType)(options.ifType, "Conditional ifType");
    this.thenType = (0, import_validate_type.toType)(options.thenType, "Conditional thenType");
    this.elseType = (0, import_validate_type.toType)(options.elseType, "Conditional elseType");
  }
  branch(value) {
    return this.ifType.isValid(value) ? this.thenType : this.elseType;
  }
  // The field name goes to the branch as received (see AllOfType.validate()).
  validate(value, fieldName = void 0) {
    const result = super.validate(value, fieldName || "Value");
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      const branch = this.branch(value);
      if (branch && !branch.isValid(value)) {
        return branch.errors(value, fieldName);
      }
    }
    return void 0;
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    const branch = this.branch(value);
    return !branch || branch.isValid(value);
  }
}
function Conditional(options) {
  return new ConditionalType(options);
}

},
"@xufa/schema/lib/types/enum.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var enum_exports = {};
__export(enum_exports, {
  Enum: () => Enum,
  EnumType: () => EnumType,
  enumt: () => enumt,
  oenum: () => oenumt,
  oenumt: () => oenumt
});
module.exports = __toCommonJS(enum_exports);
var import_string = require("./string.js");
class EnumType extends import_string.StringType {
  constructor(options = {}) {
    super(options);
    this.options = options.options;
  }
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      if (!this.options.includes(value)) {
        return `${fieldName} must be one of: ${this.options.join(", ")}`;
      }
    }
    return void 0;
  }
  isValid(value) {
    return super.isValid(value) && (value === void 0 || value === null || this.options.includes(value));
  }
}
function Enum(options) {
  return new EnumType(options);
}
function enumt(options, isMandatory = true, isNullable = false) {
  if (options !== void 0 && options !== null && !Array.isArray(options) && typeof options === "object") {
    return new EnumType(options);
  }
  return new EnumType({ options, isMandatory, isNullable });
}
function oenumt(options, isMandatory = false, isNullable = false) {
  if (options !== void 0 && options !== null && !Array.isArray(options) && typeof options === "object") {
    return new EnumType({ isMandatory: false, ...options });
  }
  return new EnumType({ options, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/float.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var float_exports = {};
__export(float_exports, {
  Float: () => Float,
  FloatType: () => FloatType,
  float: () => float,
  num: () => float,
  ofloat: () => ofloat,
  onum: () => ofloat
});
module.exports = __toCommonJS(float_exports);
var import_validate_type = require("./validate-type.js");
class FloatType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.min = options.min;
    this.max = options.max;
    this.exclusiveMin = options.exclusiveMin;
    this.exclusiveMax = options.exclusiveMax;
    this.multipleOf = options.multipleOf;
    this.multipleOfPrecision = options.multipleOfPrecision;
  }
  isMultiple(value) {
    const division = value / this.multipleOf;
    if (this.multipleOfPrecision === void 0) {
      return Number.isInteger(division);
    }
    return !(Math.abs(Math.round(division) - division) > Number(`1e-${this.multipleOfPrecision}`));
  }
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return `${fieldName} must be a number`;
      }
      if (this.min !== void 0 && value < this.min) {
        return `${fieldName} must be at least ${this.min}`;
      }
      if (this.max !== void 0 && value > this.max) {
        return `${fieldName} must be at most ${this.max}`;
      }
      if (this.exclusiveMin !== void 0 && value <= this.exclusiveMin) {
        return `${fieldName} must be greater than ${this.exclusiveMin}`;
      }
      if (this.exclusiveMax !== void 0 && value >= this.exclusiveMax) {
        return `${fieldName} must be less than ${this.exclusiveMax}`;
      }
      if (this.multipleOf !== void 0 && !this.isMultiple(value)) {
        return `${fieldName} must be a multiple of ${this.multipleOf}`;
      }
    }
    return void 0;
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    return typeof value === "number" && Number.isFinite(value) && (this.min === void 0 || value >= this.min) && (this.max === void 0 || value <= this.max) && (this.exclusiveMin === void 0 || value > this.exclusiveMin) && (this.exclusiveMax === void 0 || value < this.exclusiveMax) && (this.multipleOf === void 0 || this.isMultiple(value));
  }
}
function Float(options) {
  return new FloatType(options);
}
function float(min, max, isMandatory = true, isNullable = false) {
  if (min !== void 0 && min !== null && typeof min === "object") {
    return new FloatType(min);
  }
  return new FloatType({ min, max, isMandatory, isNullable });
}
function ofloat(min, max, isMandatory = false, isNullable = false) {
  if (min !== void 0 && min !== null && typeof min === "object") {
    return new FloatType({ isMandatory: false, ...min });
  }
  return new FloatType({ min, max, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/has-duplicates.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var has_duplicates_exports = {};
__export(has_duplicates_exports, {
  hasDuplicates: () => hasDuplicates
});
module.exports = __toCommonJS(has_duplicates_exports);
var import_deep_equal = require("../deep-equal.js");
function hasDuplicates(value) {
  if (value.some((item) => item !== null && typeof item === "object")) {
    return value.some((item, i) => value.findIndex((other) => (0, import_deep_equal.deepEqual)(item, other)) !== i);
  }
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < value.length; i += 1) {
    if (i in value && seen.has(value[i])) {
      return true;
    }
    seen.add(value[i]);
  }
  return false;
}

},
"@xufa/schema/lib/types/index.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget && __copyProps(secondTarget, mod, "default"));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var types_exports = {};
module.exports = __toCommonJS(types_exports);
__reExport(types_exports, require("./all-of.js"), module.exports);
__reExport(types_exports, require("./any.js"), module.exports);
__reExport(types_exports, require("./any-of.js"), module.exports);
__reExport(types_exports, require("./array-of.js"), module.exports);
__reExport(types_exports, require("./boolean.js"), module.exports);
__reExport(types_exports, require("./conditional.js"), module.exports);
__reExport(types_exports, require("./enum.js"), module.exports);
__reExport(types_exports, require("./float.js"), module.exports);
__reExport(types_exports, require("./integer.js"), module.exports);
__reExport(types_exports, require("./keyword.js"), module.exports);
__reExport(types_exports, require("./never.js"), module.exports);
__reExport(types_exports, require("./not.js"), module.exports);
__reExport(types_exports, require("./obj.js"), module.exports);
__reExport(types_exports, require("./one-of.js"), module.exports);
__reExport(types_exports, require("./ref.js"), module.exports);
__reExport(types_exports, require("./string.js"), module.exports);
__reExport(types_exports, require("./validate-type.js"), module.exports);
__reExport(types_exports, require("./values.js"), module.exports);
__reExport(types_exports, require("./when.js"), module.exports);

},
"@xufa/schema/lib/types/integer.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var integer_exports = {};
__export(integer_exports, {
  Integer: () => Integer,
  IntegerType: () => IntegerType,
  int: () => int,
  oint: () => oint
});
module.exports = __toCommonJS(integer_exports);
var import_float = require("./float.js");
class IntegerType extends import_float.FloatType {
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      if (!Number.isInteger(value)) {
        return `${fieldName} must be an integer`;
      }
    }
    return void 0;
  }
  isValid(value) {
    return super.isValid(value) && (value === void 0 || value === null || Number.isInteger(value));
  }
}
function Integer(options) {
  return new IntegerType(options);
}
function int(min, max, isMandatory = true, isNullable = false) {
  if (min !== void 0 && min !== null && typeof min === "object") {
    return new IntegerType(min);
  }
  return new IntegerType({ min, max, isMandatory, isNullable });
}
function oint(min, max, isMandatory = false, isNullable = false) {
  if (min !== void 0 && min !== null && typeof min === "object") {
    return new IntegerType({ isMandatory: false, ...min });
  }
  return new IntegerType({ min, max, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/keyword.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var keyword_exports = {};
__export(keyword_exports, {
  KEYWORD_TYPE_TESTS: () => KEYWORD_TYPE_TESTS,
  KeywordType: () => KeywordType
});
module.exports = __toCommonJS(keyword_exports);
var import_validate_type = require("./validate-type.js");
const KEYWORD_TYPE_TESTS = {
  string: (value) => typeof value === "string",
  number: (value) => typeof value === "number",
  integer: (value) => Number.isInteger(value),
  boolean: (value) => typeof value === "boolean",
  object: (value) => typeof value === "object" && !Array.isArray(value),
  array: (value) => Array.isArray(value),
  null: (value) => value === null
};
class KeywordType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    if (typeof options.check !== "function" && !(options.check instanceof RegExp)) {
      throw new Error("KeywordType check must be a function or a regular expression");
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
    return typeof this.message === "function" ? this.message(value) : this.message;
  }
  validate(value, fieldName = void 0) {
    const name = fieldName || "Value";
    const result = super.validate(value, name);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null && this.applies(value) && !this.passes(value)) {
      return `${name} ${this.messageOf(value)}`;
    }
    return void 0;
  }
  isValid(value) {
    return this.checkPresence(value) ?? (!this.applies(value) || this.passes(value));
  }
}

},
"@xufa/schema/lib/types/never.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var never_exports = {};
__export(never_exports, {
  Never: () => Never,
  NeverType: () => NeverType,
  never: () => never
});
module.exports = __toCommonJS(never_exports);
var import_validate_type = require("./validate-type.js");
class NeverType extends import_validate_type.ValidateType {
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      return `${fieldName} is not allowed`;
    }
    return void 0;
  }
  isValid(value) {
    return this.checkPresence(value) ?? false;
  }
}
function Never(options) {
  return new NeverType(options);
}
function never(isMandatory = false, isNullable = false) {
  if (isMandatory !== void 0 && isMandatory !== null && typeof isMandatory === "object") {
    return new NeverType({ isMandatory: false, ...isMandatory });
  }
  return new NeverType({ isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/not.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var not_exports = {};
__export(not_exports, {
  Not: () => Not,
  NotType: () => NotType,
  not: () => not,
  onot: () => onot
});
module.exports = __toCommonJS(not_exports);
var import_validate_type = require("./validate-type.js");
class NotType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.type = (0, import_validate_type.toType)(options.type, "Not type");
  }
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null && this.type.isValid(value)) {
      return `${fieldName} must not match the excluded schema`;
    }
    return void 0;
  }
  isValid(value) {
    return this.checkPresence(value) ?? !this.type.isValid(value);
  }
}
function Not(options) {
  return new NotType(options);
}
function not(type, isMandatory = true, isNullable = false) {
  if (type !== void 0 && type !== null && !(type instanceof import_validate_type.ValidateType) && typeof type === "object") {
    return new NotType(type);
  }
  return new NotType({ type, isMandatory, isNullable });
}
function onot(type, isMandatory = false, isNullable = false) {
  if (type !== void 0 && type !== null && !(type instanceof import_validate_type.ValidateType) && typeof type === "object") {
    return new NotType({ isMandatory: false, ...type });
  }
  return new NotType({ type, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/obj.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var obj_exports = {};
__export(obj_exports, {
  Obj: () => Obj,
  ObjType: () => ObjType,
  obj: () => obj,
  oobj: () => oobj
});
module.exports = __toCommonJS(obj_exports);
var import_validate_type = require("./validate-type.js");
class ObjType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.shape = options.schema;
    this.schema = (0, import_validate_type.toType)(options.schema, "Obj schema");
  }
  // The field name goes to the schema as received (see AllOfType.validate()).
  validate(value, fieldName = void 0) {
    const name = fieldName || "Value";
    const result = super.validate(value, name);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      if (typeof value !== "object" || Array.isArray(value)) {
        return `${name} must be an object`;
      }
      if (this.schema) return this.schema.validate(value, fieldName);
    }
    return void 0;
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    return !this.schema || this.schema.isValid(value);
  }
}
function Obj(options) {
  return new ObjType(options);
}
const OPTION_KEYS = ["schema", "isMandatory", "isNullable"];
const isOptions = (value) => value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof import_validate_type.ValidateType) && (Object.keys(value).length === 0 || Object.keys(value).some((key) => OPTION_KEYS.includes(key)));
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

},
"@xufa/schema/lib/types/one-of.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var one_of_exports = {};
__export(one_of_exports, {
  EVERY_TYPE: () => EVERY_TYPE,
  NO_TYPE: () => NO_TYPE,
  OneOf: () => OneOf,
  OneOfType: () => OneOfType,
  oneOf: () => oneOf,
  ooneOf: () => ooneOf
});
module.exports = __toCommonJS(one_of_exports);
var import_validate_type = require("./validate-type.js");
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const NO_TYPE = -1;
const EVERY_TYPE = -2;
class OneOfType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.types = (0, import_validate_type.toTypes)(options.types, "OneOf types") || [];
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
    const tagValue = Object.prototype.hasOwnProperty.call(value, tag) ? value[tag] : void 0;
    if (typeof tagValue === "string" && mapping.has(tagValue)) {
      return mapping.get(tagValue);
    }
    return auto ? EVERY_TYPE : NO_TYPE;
  }
  // The error about the tag of an object whose tag names no type, after the name of the tag.
  tagError(value) {
    const { tag, mapping } = this.discriminator;
    const tagValue = Object.prototype.hasOwnProperty.call(value, tag) ? value[tag] : void 0;
    if (tagValue === void 0) {
      return " is mandatory";
    }
    if (typeof tagValue !== "string") {
      return " must be a string";
    }
    const values = [...mapping.keys()];
    return values.length === 1 ? ` must be equal to ${values[0]}` : ` must be one of: ${values.join(", ")}`;
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
  validate(value, fieldName = void 0) {
    const name = fieldName || "Value";
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
    if (value !== void 0 && value !== null) {
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
    return void 0;
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
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
  if (types !== void 0 && types !== null && !Array.isArray(types) && typeof types === "object") {
    return new OneOfType(types);
  }
  return new OneOfType({ types, isMandatory, isNullable });
}
function ooneOf(types, isMandatory = false, isNullable = false) {
  if (types !== void 0 && types !== null && !Array.isArray(types) && typeof types === "object") {
    return new OneOfType({ isMandatory: false, ...types });
  }
  return new OneOfType({ types, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/ref.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var ref_exports = {};
__export(ref_exports, {
  Ref: () => Ref,
  RefType: () => RefType
});
module.exports = __toCommonJS(ref_exports);
var import_validate_type = require("./validate-type.js");
class RefType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.ref = options.ref;
    this.target = (0, import_validate_type.toType)(options.target, "Ref target");
  }
  getTarget() {
    if (!this.target) {
      throw new Error(`Reference "${this.ref}" is not resolved`);
    }
    return this.target;
  }
  validate(value, fieldName) {
    if (value === void 0) {
      return super.validate(value, fieldName);
    }
    return this.getTarget().validate(value, fieldName);
  }
  errors(value, fieldName) {
    if (value === void 0) {
      return super.validate(value, fieldName);
    }
    return this.getTarget().errors(value, fieldName);
  }
  isValid(value) {
    if (value === void 0) {
      return !this.isMandatory;
    }
    return this.getTarget().isValid(value);
  }
}
function Ref(options) {
  return new RefType(options);
}

},
"@xufa/schema/lib/types/string.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var string_exports = {};
__export(string_exports, {
  FORMAT_LIMITS: () => FORMAT_LIMITS,
  String: () => String,
  StringType: () => StringType,
  ostr: () => ostr,
  str: () => str
});
module.exports = __toCommonJS(string_exports);
var import_code_point_length = require("./code-point-length.js");
var import_validate_type = require("./validate-type.js");
var import_formats = require("../formats.js");
const FORMAT_LIMITS = {
  formatMinimum: { fails: (result) => result < 0, text: "at least", comparison: ">=" },
  formatMaximum: { fails: (result) => result > 0, text: "at most", comparison: "<=" },
  formatExclusiveMinimum: { fails: (result) => result <= 0, text: "greater than", comparison: ">" },
  formatExclusiveMaximum: { fails: (result) => result >= 0, text: "less than", comparison: "<" }
};
class StringType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.min = options.min;
    this.max = options.max;
    this.pattern = options.pattern;
    this.allowEmpty = options.allowEmpty;
    this.countCodePoints = options.countCodePoints;
    this.format = options.format;
    this.formatCheck = options.formatCheck;
    if (this.format !== void 0 && this.formatCheck === void 0) {
      if (!Object.prototype.hasOwnProperty.call(import_formats.FORMATS, this.format)) {
        throw new Error(`Unknown String format "${this.format}": use one of ${Object.keys(import_formats.FORMATS).join(", ")}`);
      }
      this.formatCheck = import_formats.FORMATS[this.format];
    }
    this.formatLimits = options.formatLimits || [];
  }
  // The first limit of the format the value does not satisfy, or undefined.
  failedLimit(value) {
    return this.formatLimits.find(({ keyword, limit, compare }) => FORMAT_LIMITS[keyword].fails(compare(value, limit)));
  }
  hasFormat(value) {
    return this.formatCheck === void 0 || (0, import_formats.matchesFormat)(this.formatCheck, value);
  }
  isTooShort(value) {
    return this.countCodePoints ? (0, import_code_point_length.hasFewerCodePoints)(value, this.min) : value.length < this.min;
  }
  isTooLong(value) {
    return this.countCodePoints ? (0, import_code_point_length.hasMoreCodePoints)(value, this.max) : value.length > this.max;
  }
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null) {
      if (typeof value !== "string") {
        return `${fieldName} must be a string`;
      }
      const skipMin = value.length === 0 && (this.allowEmpty ?? !this.isMandatory);
      if (this.min !== void 0 && !skipMin && this.isTooShort(value)) {
        return `${fieldName} must be at least ${this.min} characters long`;
      }
      if (this.max !== void 0 && this.isTooLong(value)) {
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
    return void 0;
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    if (typeof value !== "string") {
      return false;
    }
    const skipMin = value.length === 0 && (this.allowEmpty ?? !this.isMandatory);
    return (this.min === void 0 || skipMin || !this.isTooShort(value)) && (this.max === void 0 || !this.isTooLong(value)) && (!this.pattern || this.pattern.test(value)) && this.hasFormat(value) && this.failedLimit(value) === void 0;
  }
}
function String(options) {
  return new StringType(options);
}
function str(min, max, isMandatory = true, isNullable = false) {
  if (min !== void 0 && min !== null && typeof min === "object") {
    return new StringType(min);
  }
  return new StringType({ min, max, isMandatory, isNullable });
}
function ostr(min, max, isMandatory = false, isNullable = false) {
  if (min !== void 0 && min !== null && typeof min === "object") {
    return new StringType({ isMandatory: false, ...min });
  }
  return new StringType({ min, max, isMandatory, isNullable });
}

},
"@xufa/schema/lib/types/validate-type.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var validate_type_exports = {};
__export(validate_type_exports, {
  ValidateType: () => ValidateType,
  hasErrors: () => hasErrors,
  isPlainObject: () => isPlainObject,
  provide: () => provide,
  toErrors: () => toErrors,
  toType: () => toType,
  toTypes: () => toTypes
});
module.exports = __toCommonJS(validate_type_exports);
const late = { compileType: null, Schema: null };
function provide(parts) {
  Object.assign(late, parts);
}
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
    this.isMandatory = options.isMandatory !== void 0 ? options.isMandatory : true;
    this.isNullable = options.isNullable !== void 0 ? options.isNullable : false;
  }
  validate(value, fieldName = "Value") {
    if (this.isMandatory && value === void 0) {
      return `${fieldName} is mandatory`;
    }
    if (!this.isNullable && value === null) {
      return `${fieldName} cannot be null`;
    }
    return void 0;
  }
  // Fast boolean check equivalent to !hasErrors(this.validate(value)) that builds no messages.
  // Built-in types override it; custom subclasses that only override validate() fall back to it.
  isValid(value) {
    return !hasErrors(this.validate(value));
  }
  // Error messages of a value already known to be invalid; containers call it on their failing children
  // so types whose validate() starts with an isValid() fast path can skip it. The field name goes to validate() as
  // received, which names the value "Value" when there is none.
  errors(value, fieldName = void 0) {
    return this.validate(value, fieldName);
  }
  // Compiles the type into generated code, several times faster than validate(): see compileType() in compile.js for
  // the options. The compiled function does not see changes made to the type afterwards.
  compile(options = {}) {
    return late.compileType(this, options);
  }
  // Presence part of isValid: a boolean when undefined/null decide the result, undefined otherwise.
  checkPresence(value) {
    if (value === void 0) {
      return !this.isMandatory;
    }
    if (value === null) {
      return this.isNullable;
    }
    return void 0;
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
function toErrors(result) {
  if (Array.isArray(result)) {
    return Array.from(new Set(result.flat(Infinity)));
  }
  return result ? [result] : [];
}
function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function toType(value, name) {
  if (value === void 0 || value instanceof ValidateType) {
    return value;
  }
  if (isPlainObject(value)) {
    return new late.Schema(value);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be a type or an object of types`);
  }
  return value;
}
function toTypes(values, name) {
  if (values === void 0) {
    return values;
  }
  if (!Array.isArray(values)) {
    throw new TypeError(`${name} must be an array of types`);
  }
  return values.map((value, i) => toType(value, `${name}[${i}]`));
}

},
"@xufa/schema/lib/types/values.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var values_exports = {};
__export(values_exports, {
  Const: () => Const,
  Values: () => Values,
  ValuesType: () => ValuesType
});
module.exports = __toCommonJS(values_exports);
var import_deep_equal = require("../deep-equal.js");
var import_validate_type = require("./validate-type.js");
function formatValue(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}
class ValuesType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    this.values = options.values || [];
  }
  validate(value, fieldName = "Value") {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null && !this.values.some((item) => (0, import_deep_equal.deepEqual)(item, value))) {
      if (this.values.length === 1) {
        return `${fieldName} must be equal to ${formatValue(this.values[0])}`;
      }
      return `${fieldName} must be one of: ${this.values.map(formatValue).join(", ")}`;
    }
    return void 0;
  }
  isValid(value) {
    return this.checkPresence(value) ?? this.values.some((item) => (0, import_deep_equal.deepEqual)(item, value));
  }
}
function Values(options) {
  return new ValuesType(options);
}
function Const(value, options = {}) {
  return new ValuesType({ ...options, values: [value] });
}

},
"@xufa/schema/lib/types/when.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var when_exports = {};
__export(when_exports, {
  When: () => When,
  WhenType: () => WhenType,
  isJsonType: () => isJsonType
});
module.exports = __toCommonJS(when_exports);
var import_validate_type = require("./validate-type.js");
const JSON_TYPES = ["object", "array", "string", "number"];
function isJsonType(value, jsonType) {
  switch (jsonType) {
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    default:
      return typeof value === "number";
  }
}
class WhenType extends import_validate_type.ValidateType {
  constructor(options = {}) {
    super(options);
    if (!JSON_TYPES.includes(options.jsonType)) {
      throw new Error(`WhenType jsonType must be one of: ${JSON_TYPES.join(", ")}`);
    }
    this.jsonType = options.jsonType;
    this.type = (0, import_validate_type.toType)(options.type, "When type");
  }
  validate(value, fieldName) {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== void 0 && value !== null && isJsonType(value, this.jsonType)) {
      return this.type.validate(value, fieldName);
    }
    return void 0;
  }
  errors(value, fieldName) {
    return this.validate(value, fieldName);
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    return !isJsonType(value, this.jsonType) || this.type.isValid(value);
  }
}
function When(options) {
  return new WhenType(options);
}

},
"@xufa/schema/lib/unevaluated.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var unevaluated_exports = {};
__export(unevaluated_exports, {
  JSON_TYPES: () => JSON_TYPES,
  UnevaluatedType: () => UnevaluatedType,
  staticEvaluatedBy: () => staticEvaluatedBy,
  staticEvaluatedByAll: () => staticEvaluatedByAll
});
module.exports = __toCommonJS(unevaluated_exports);
var import_schema = require("./schema.js");
var import_closed_schema = require("./closed-schema.js");
var import_types = require("./types/index.js");
var import_one_of = require("./types/one-of.js");
const ALL = true;
const JSON_TYPES = { properties: "object", items: "array" };
function merge(target, result) {
  if (result === ALL || target === ALL) {
    return ALL;
  }
  result.forEach((item) => target.add(item));
  return target;
}
let evaluated;
const evaluatedByAll = (kind, types, value, seen) => types.reduce((result, item) => merge(result, evaluated(kind, item, value, seen)), /* @__PURE__ */ new Set());
function schemaKeys(type, value, seen) {
  if (type.evaluatesAllKeys || !type.isOpen || type.additionalType) {
    return ALL;
  }
  const declared = type.propertyKeys ? new Set(type.propertyKeys) : type.keySet;
  let keys = /* @__PURE__ */ new Set();
  Object.keys(value).forEach((key) => {
    if (declared.has(key) || type.patternTypes.some(({ pattern }) => pattern.test(key))) {
      keys.add(key);
    }
  });
  type.dependencies.forEach((dependency) => {
    const isPresent = Object.prototype.hasOwnProperty.call(value, dependency.key);
    if (dependency.type && isPresent && dependency.type.isValid(value)) {
      keys = merge(keys, evaluated("properties", dependency.type, value, seen));
    }
  });
  return keys;
}
function arrayItems(type, value) {
  if (type.type && !Array.isArray(type.type) || type.additionalType) {
    return ALL;
  }
  const items = /* @__PURE__ */ new Set();
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
class UnevaluatedType extends import_types.ValidateType {
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
    const elements = this.kind === "properties" ? Object.keys(value) : value.map((item, i) => i);
    return elements.filter((element) => !done.has(element));
  }
  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== void 0) {
      return presence;
    }
    if (!(0, import_types.isJsonType)(value, this.jsonType)) {
      return true;
    }
    return this.unevaluated(value).every((element) => this.type.isValid(value[element]));
  }
  // Keys are named like the keys of a Schema, and a key no schema allows like its "additionalProperties": false.
  errors(value, fieldName) {
    const presence = super.validate(value, fieldName || "Value");
    if (presence !== void 0) {
      return presence;
    }
    if (!(0, import_types.isJsonType)(value, this.jsonType)) {
      return [];
    }
    return this.unevaluated(value).filter((element) => !this.type.isValid(value[element])).map((element) => {
      if (this.kind === "items") {
        return this.type.errors(value[element], `${fieldName || "Value"}[${element}]`);
      }
      const keyName = fieldName ? `${fieldName}.${element}` : element;
      return this.type instanceof import_types.NeverType ? `Unexpected key: ${keyName}` : this.type.errors(value[element], keyName);
    });
  }
  validate(value, fieldName) {
    return this.isValid(value) ? void 0 : this.errors(value, fieldName);
  }
}
evaluated = (kind, type, value, seen = []) => {
  switch (type.constructor) {
    case import_schema.Schema:
    case import_closed_schema.ClosedSchema:
      return kind === "properties" ? schemaKeys(type, value, seen) : /* @__PURE__ */ new Set();
    case import_types.ArrayOfType:
      return kind === "items" ? arrayItems(type, value) : /* @__PURE__ */ new Set();
    case import_types.AllOfType:
      return evaluatedByAll(kind, type.types, value, seen);
    case import_types.AnyOfType:
      return evaluatedByAll(
        kind,
        type.types.filter((item) => item.isValid(value)),
        value,
        seen
      );
    case import_types.OneOfType: {
      const picked = type.pick(value);
      if (picked !== import_one_of.EVERY_TYPE) {
        const isPicked = picked !== import_one_of.NO_TYPE && type.types[picked].isValid(value);
        return isPicked ? evaluated(kind, type.types[picked], value, seen) : /* @__PURE__ */ new Set();
      }
      const valid = type.types.filter((item) => item.isValid(value));
      return valid.length === 1 ? evaluated(kind, valid[0], value, seen) : /* @__PURE__ */ new Set();
    }
    case import_types.ConditionalType: {
      if (type.ifType.isValid(value)) {
        const result = evaluated(kind, type.ifType, value, seen);
        return type.thenType && type.thenType.isValid(value) ? merge(result, evaluated(kind, type.thenType, value, seen)) : result;
      }
      return type.elseType && type.elseType.isValid(value) ? evaluated(kind, type.elseType, value, seen) : /* @__PURE__ */ new Set();
    }
    case import_types.RefType:
      if (seen.some(([ref, seenValue]) => ref === type && seenValue === value)) {
        return /* @__PURE__ */ new Set();
      }
      return evaluated(kind, type.getTarget(), value, [...seen, [type, value]]);
    case import_types.WhenType:
      return (0, import_types.isJsonType)(value, type.jsonType) ? evaluated(kind, type.type, value, seen) : /* @__PURE__ */ new Set();
    case UnevaluatedType:
      if (type.kind === kind && type.isValid(value)) {
        return ALL;
      }
      return evaluatedByAll(kind, type.siblings, value, seen);
    default:
      return /* @__PURE__ */ new Set();
  }
};
const NONE = { all: false, keys: [], patterns: [], prefix: 0 };
const EVERYTHING = { ...NONE, all: true };
function union(a, b) {
  if (a === void 0 || b === void 0) {
    return void 0;
  }
  return {
    all: a.all || b.all,
    keys: [...a.keys, ...b.keys],
    patterns: [...a.patterns, ...b.patterns],
    prefix: Math.max(a.prefix, b.prefix)
  };
}
const isNone = (result) => result !== void 0 && !result.all && result.keys.length === 0 && result.patterns.length === 0 && result.prefix === 0;
let staticOf;
const staticOfAll = (kind, types, seen) => types.reduce((result, item) => union(result, staticOf(kind, item, seen)), NONE);
const staticOfAlternatives = (kind, types, seen) => types.every((item) => item === void 0 || isNone(staticOf(kind, item, seen))) ? NONE : void 0;
staticOf = (kind, type, seen = []) => {
  switch (type.constructor) {
    case import_schema.Schema:
    case import_closed_schema.ClosedSchema:
      if (kind !== "properties") {
        return NONE;
      }
      if (type.evaluatesAllKeys || !type.isOpen || type.additionalType) {
        return EVERYTHING;
      }
      if (type.dependencies.some((dependency) => dependency.type && !isNone(staticOf(kind, dependency.type, seen)))) {
        return void 0;
      }
      return {
        ...NONE,
        keys: type.propertyKeys || type.keys,
        patterns: type.patternTypes.map(({ pattern }) => pattern)
      };
    case import_types.ArrayOfType:
      if (kind !== "items") {
        return NONE;
      }
      if (type.type && !Array.isArray(type.type) || type.additionalType) {
        return EVERYTHING;
      }
      if (type.contains && type.containsEvaluates) {
        return void 0;
      }
      return { ...NONE, prefix: Array.isArray(type.type) ? type.type.length : 0 };
    case import_types.AllOfType:
      return staticOfAll(kind, type.types, seen);
    case import_types.AnyOfType:
    case import_types.OneOfType:
      return staticOfAlternatives(kind, type.types, seen);
    case import_types.ConditionalType:
      return staticOfAlternatives(kind, [type.ifType, type.thenType, type.elseType], seen);
    case import_types.RefType:
      return seen.includes(type) ? void 0 : staticOf(kind, type.getTarget(), [...seen, type]);
    case import_types.WhenType:
      return type.jsonType === JSON_TYPES[kind] ? staticOf(kind, type.type, seen) : NONE;
    case UnevaluatedType:
      return type.kind === kind ? EVERYTHING : staticOfAll(kind, type.siblings, seen);
    default:
      return NONE;
  }
};
const withKeySet = (result) => result && { ...result, keys: new Set(result.keys) };
function staticEvaluatedByAll(kind, types) {
  return withKeySet(staticOfAll(kind, types, []));
}
function staticEvaluatedBy(kind, type) {
  return withKeySet(staticOf(kind, type, []));
}

},
"@xufa/schema/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/schema","version":"0.1.0"};
},
"@xufa/serializer/index.js": function (module, exports, require) {
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var serializer_exports = {};
__export(serializer_exports, {
  build: () => build,
  default: () => serializer_default,
  "module.exports": () => build,
  validLargeArrayMechanisms: () => LARGE_ARRAY_MECHANISMS
});
module.exports = __toCommonJS(serializer_exports);
var import_resolver = require("./lib/resolver.js");
var import_merge = require("./lib/merge.js");
var import_match = require("./lib/match.js");
var import_runtime = require("./lib/runtime.js");
var import_meta = require("./lib/meta.js");
var writer = __toESM(require("./lib/writer.js"));
const { bytesOf } = writer;
const ROUNDING = /* @__PURE__ */ new Set(["floor", "ceil", "round", "trunc"]);
const LARGE_ARRAY_MECHANISMS = /* @__PURE__ */ new Set(["default", "json-stringify"]);
const OUTPUTS = /* @__PURE__ */ new Set(["auto", "string", "bytes"]);
const OBJECT_KEYWORDS = [
  "properties",
  "required",
  "additionalProperties",
  "patternProperties",
  "maxProperties",
  "minProperties",
  "dependencies"
];
const ARRAY_KEYWORDS = ["items", "additionalItems", "maxItems", "minItems", "uniqueItems", "contains", "prefixItems"];
const STRING_KEYWORDS = ["maxLength", "minLength", "pattern"];
const NUMBER_KEYWORDS = ["multipleOf", "maximum", "exclusiveMaximum", "minimum", "exclusiveMinimum"];
let rootCounter = 0;
function inferType(schema) {
  for (const keyword of OBJECT_KEYWORDS) if (keyword in schema) return "object";
  for (const keyword of ARRAY_KEYWORDS) if (keyword in schema) return "array";
  for (const keyword of STRING_KEYWORDS) if (keyword in schema) return "string";
  for (const keyword of NUMBER_KEYWORDS) if (keyword in schema) return "number";
  return schema.type;
}
const quote = (value) => JSON.stringify(value);
const literal = (text) => JSON.stringify(text);
function parseLargeArraySize(value) {
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  } else if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  } else if (typeof value === "bigint") {
    return Number(value);
  }
  throw new Error(`Unsupported large array size. Expected integer-like, got ${typeof value} with value ${value}`);
}
class Builder {
  constructor(schema, options) {
    this.options = options;
    this.resolver = new import_resolver.RefResolver();
    this.matcher = (0, import_match.createMatcher)(this.resolver, { coerceTypes: Boolean(options.ajv && options.ajv.coerceTypes) });
    this.rootId = schema && typeof schema === "object" && typeof schema.$id === "string" && schema.$id[0] !== "#" ? schema.$id : `__xufa_root_${rootCounter++}`;
    this.uid = 0;
    this.functions = [];
    this.functionNames = /* @__PURE__ */ new Map();
    this.validators = [];
    this.patterns = [];
    this.mergedCache = /* @__PURE__ */ new Map();
    this.origins = /* @__PURE__ */ new WeakMap();
    this.stack = /* @__PURE__ */ new Set();
    this.largeArrayMechanism = options.largeArrayMechanism || "default";
    this.largeArraySize = options.largeArraySize === void 0 ? 2e4 : parseLargeArraySize(options.largeArraySize);
    this.bytes = options.output === "bytes";
    this.literals = [];
  }
  name(prefix) {
    const id = this.uid;
    this.uid += 1;
    return `${prefix}${id}`;
  }
  // The code is written for one of two outputs. 'string': the JSON is joined with + in a variable `json` (fastest for
  // small values). 'bytes': it is written as UTF-8 to the buffer of lib/writer.js and read once at the end (fastest
  // for large ones: no tree of strings for V8 to flatten). The helpers below write a statement for either.
  // The name of the constant holding the bytes of a literal, for the 'bytes' output.
  bytesOf(text) {
    let index = this.literals.indexOf(text);
    if (index === -1) {
      index = this.literals.length;
      this.literals.push(text);
    }
    return `B${index}`;
  }
  // Writes text known when compiling.
  lit(text) {
    if (!this.bytes) return `json += ${literal(text)};
`;
    if (text.length === 1 && text.charCodeAt(0) < 128) return `wc(${text.charCodeAt(0)});
`;
    return `wb(${this.bytesOf(text)});
`;
  }
  // Writes one of two texts known when compiling; `whenFalse` may hold code run when the condition is false.
  litChoice(condition, whenTrue, whenFalse, sideEffect = "") {
    const pick = (text) => this.bytes ? this.bytesOf(text) : literal(text);
    const falseValue = sideEffect ? `(${sideEffect}, ${pick(whenFalse)})` : pick(whenFalse);
    const value = `${condition} ? ${pick(whenTrue)} : ${falseValue}`;
    return this.bytes ? `wb(${value});
` : `json += ${value};
`;
  }
  // Writes the JSON text an expression gives (a string, or undefined written as "undefined").
  raw(expression) {
    return this.bytes ? `wr('' + ${expression});
` : `json += ${expression};
`;
  }
  // Writes a value with a function of the generated code (for references): it returns its JSON or writes it.
  callFunction(name, input) {
    return this.bytes ? `${name}(${input});
` : `json += ${name}(${input});
`;
  }
  // How a location is named in error messages: its JSON pointer, after the id of its schema when not the root one.
  refOf(loc) {
    return loc.base === this.rootId ? loc.pointer : `${loc.base}${loc.pointer}`;
  }
  child(loc, key) {
    const schema = loc.schema[key];
    let { base } = loc;
    if (schema && typeof schema === "object" && typeof schema.$id === "string" && schema.$id[0] !== "#") {
      base = (0, import_resolver.resolveURI)(base, schema.$id);
    }
    return { schema, base, pointer: `${loc.pointer}/${key}` };
  }
  resolve(loc) {
    let current = loc;
    const seen = /* @__PURE__ */ new Set();
    while (current.schema && typeof current.schema === "object" && current.schema.$ref !== void 0) {
      const { $ref } = current.schema;
      const target = this.resolver.resolve($ref, current.base);
      if (target === null) {
        const missing = this.resolver.missingDocument($ref, current.base);
        if (missing !== null) {
          throw new Error(`Cannot resolve ref "${$ref}". Schema with id "${missing}" is not found.`);
        }
        throw new Error(`Cannot find reference "${$ref}"`);
      }
      if (seen.has(target.schema)) throw new Error(`Circular reference "${$ref}"`);
      seen.add(target.schema);
      current = target;
    }
    return current;
  }
  // A copy of a schema whose references are absolute, so that it can be merged with schemas of other documents.
  origin(schema) {
    return this.origins.get(schema) || schema;
  }
  absolute(schema, base) {
    if (schema === null || typeof schema !== "object") return schema;
    if (Array.isArray(schema)) return schema.map((item) => this.absolute(item, base));
    let current = base;
    if (typeof schema.$id === "string" && schema.$id[0] !== "#") current = (0, import_resolver.resolveURI)(base, schema.$id);
    const out = {};
    for (const key of Object.keys(schema)) {
      const value = schema[key];
      if (key === "$ref" && typeof value === "string") {
        const hash = value.indexOf("#");
        const uri = hash === -1 ? value : value.slice(0, hash);
        out.$ref = (uri === "" ? current : (0, import_resolver.resolveURI)(current, uri)) + (hash === -1 ? "" : value.slice(hash));
      } else if (key === "enum" || key === "const" || key === "default" || key === "examples") {
        out[key] = value;
      } else {
        out[key] = this.absolute(value, current);
      }
    }
    this.origins.set(out, this.origin(schema));
    return out;
  }
  // The merge of schemas (resolved and made absolute), cached by the schema objects merged.
  merge(locs) {
    let cache = this.mergedCache;
    for (const loc of locs) {
      const key = loc.key || this.origin(loc.schema);
      if (!cache.has(key)) cache.set(key, /* @__PURE__ */ new Map());
      cache = cache.get(key);
    }
    if (cache.has("merged")) return cache.get("merged");
    const parts = locs.map((loc) => {
      const resolved = this.resolve(loc);
      const copy = this.absolute(resolved.schema, resolved.base);
      if (copy && typeof copy === "object") delete copy.$id;
      return copy;
    });
    const merged = (0, import_merge.mergeSchemas)(parts);
    if (merged && typeof merged === "object") this.origins.set(merged, merged);
    cache.set("merged", merged);
    return merged;
  }
  validator(loc) {
    this.validators.push(this.matcher(loc.schema, loc.base));
    return `v[${this.validators.length - 1}]`;
  }
  // Whether the value of a schema can be written inline: no references, combinations, objects or arrays inside.
  isSimple(schema) {
    if (schema === null || typeof schema !== "object") return true;
    if (schema.$ref || schema.allOf || schema.anyOf || schema.oneOf || schema.if) return false;
    const type = schema.type === void 0 ? inferType(schema) : schema.type;
    const types = Array.isArray(type) ? type : [type];
    return !types.includes("object") && !types.includes("array");
  }
  buildValue(loc, input) {
    const { schema } = loc;
    if (schema === void 0 || typeof schema === "boolean") return this.raw(`JSON.stringify(${input})`);
    if (schema.$ref !== void 0) return this.buildRef(loc, input);
    const origin = this.origin(schema);
    if (this.stack.has(origin)) return this.callFunction(this.functionFor(loc), input);
    this.stack.add(origin);
    try {
      return this.buildBody(loc, input);
    } finally {
      this.stack.delete(origin);
    }
  }
  buildBody(loc, input) {
    const { schema } = loc;
    if (schema.allOf) return this.buildAllOf(loc, input);
    if (schema.anyOf || schema.oneOf) return this.buildOneOf(loc, input);
    if (schema.if !== void 0 && schema.then !== void 0) return this.buildIfThenElse(loc, input);
    const type = schema.type === void 0 ? inferType(schema) : schema.type;
    const nullable = schema.nullable === true;
    let code = nullable ? `if (${input} === null) ${this.lit("null")}else {
` : "";
    if (schema.const !== void 0) code += this.buildConst(schema, type, input);
    else if (Array.isArray(type)) code += this.buildMultiType(loc, type, input);
    else code += this.buildSingleType(loc, type, input);
    if (nullable) code += "}\n";
    return code;
  }
  buildRef(loc, input) {
    const target = this.resolve(loc);
    if (this.isSimple(target.schema)) return this.buildValue(target, input);
    return this.callFunction(this.functionFor(target), input);
  }
  functionFor(loc) {
    const origin = this.origin(loc.schema);
    const existing = this.functionNames.get(origin);
    if (existing) return existing;
    const name = this.name("f");
    this.functionNames.set(origin, name);
    const wasBuilding = this.stack.has(origin);
    this.stack.add(origin);
    let body;
    try {
      body = this.buildBody(loc, "input");
    } finally {
      if (!wasBuilding) this.stack.delete(origin);
    }
    this.functions.push(
      this.bytes ? `// ${this.refOf(loc)}
function ${name}(input) {
${body}}
` : `// ${this.refOf(loc)}
function ${name}(input) {
let json = '';
${body}return json;
}
`
    );
    return name;
  }
  buildAllOf(loc, input) {
    const { allOf, ...rest } = loc.schema;
    const locs = [{ schema: rest, base: loc.base, pointer: loc.pointer, key: this.origin(loc.schema) }];
    allOf.forEach((schema, i) => locs.push(this.child(this.child(loc, "allOf"), i)));
    const merged = this.merge(locs);
    return this.buildValue({ schema: merged, base: loc.base, pointer: loc.pointer }, input);
  }
  buildOneOf(loc, input) {
    const keyword = loc.schema.anyOf ? "anyOf" : "oneOf";
    const { [keyword]: branches, ...rest } = loc.schema;
    const restLoc = { schema: rest, base: loc.base, pointer: loc.pointer, key: this.origin(loc.schema) };
    const branchesLoc = this.child(loc, keyword);
    let code = "";
    branches.forEach((branch, i) => {
      const branchLoc = this.child(branchesLoc, i);
      const check = this.validator(this.resolve(branchLoc));
      const merged = this.merge([restLoc, branchLoc]);
      const body = this.buildValue({ schema: merged, base: loc.base, pointer: branchLoc.pointer }, input);
      code += `${i === 0 ? "if" : "else if"} (${check}(${input})) {
${body}}
`;
    });
    code += `else throw new TypeError(${literal(`The value of '${this.refOf(loc)}' does not match schema definition.`)});
`;
    return code;
  }
  buildIfThenElse(loc, input) {
    const { if: ifSchema, then: thenSchema, else: elseSchema, ...rest } = loc.schema;
    const restLoc = { schema: rest, base: loc.base, pointer: loc.pointer, key: this.origin(loc.schema) };
    const check = this.validator(this.resolve(this.child(loc, "if")));
    const thenMerged = this.merge([restLoc, this.child(loc, "then")]);
    const thenCode = this.buildValue({ schema: thenMerged, base: loc.base, pointer: loc.pointer }, input);
    let elseCode;
    if (elseSchema === void 0) {
      elseCode = this.buildValue(restLoc, input);
    } else {
      const elseMerged = this.merge([restLoc, this.child(loc, "else")]);
      elseCode = this.buildValue({ schema: elseMerged, base: loc.base, pointer: loc.pointer }, input);
    }
    return `if (${check}(${input})) {
${thenCode}} else {
${elseCode}}
`;
  }
  buildConst(schema, type, input) {
    const value = this.lit(JSON.stringify(schema.const));
    if (Array.isArray(type) && type.includes("null")) return `if (${input} === null) ${this.lit("null")}else ${value}`;
    return value;
  }
  buildMultiType(loc, types, input) {
    const sorted = [...types].sort((type) => type === "null" ? -1 : 1);
    let code = "";
    sorted.forEach((type, i) => {
      const keyword = i === 0 ? "if" : "else if";
      const body = this.buildSingleType({ ...loc, schema: { ...loc.schema, type } }, type, input);
      let condition;
      switch (type) {
        case "null":
          condition = `${input} === null`;
          break;
        case "string":
          condition = `typeof ${input} === 'string' || ${input} === null || ${input} instanceof Date || ${input} instanceof RegExp || (typeof ${input} === 'object' && typeof ${input}.toString === 'function' && ${input}.toString !== Object.prototype.toString)`;
          break;
        case "array":
          condition = `Array.isArray(${input})`;
          break;
        case "integer":
          condition = `Number.isInteger(${input}) || ${input} === null`;
          break;
        default:
          condition = `typeof ${input} === ${quote(type)} || ${input} === null`;
      }
      code += `${keyword} (${condition}) {
${body}}
`;
    });
    code += `else throw new TypeError(${literal(`The value of '${this.refOf(loc)}' does not match schema definition.`)});
`;
    return code;
  }
  buildSingleType(loc, type, input) {
    const { schema } = loc;
    switch (type) {
      case "null":
        return this.lit("null");
      case "string":
        switch (schema.format) {
          case "date-time":
            return this.raw(`asDateTime(${input})`);
          case "date":
            return this.raw(`asDate(${input})`);
          case "time":
            return this.raw(`asTime(${input})`);
          case "unsafe":
            return this.raw(`asUnsafeString(${input})`);
          default:
            return this.bytes ? `if (typeof ${input} === 'string') ws(${input});
else wr(asStringValue(${input}));
` : `json += typeof ${input} === 'string' ? asString(${input}) : asStringValue(${input});
`;
        }
      case "integer":
        return this.bytes ? `wi(${input});
` : `json += asInteger(${input});
`;
      case "number":
        return this.bytes ? `wn(${input});
` : `json += asNumber(${input});
`;
      case "boolean":
        return this.litChoice(input, "true", "false");
      case "object":
        return this.buildObject(loc, input);
      case "array":
        return this.buildArray(loc, input);
      case void 0:
        return this.raw(`JSON.stringify(${input})`);
      default:
        throw new Error(`${type} unsupported`);
    }
  }
  buildObject(loc, input) {
    const obj = this.name("o");
    const empty = loc.schema.nullable === true ? "null" : "{}";
    return `const ${obj} = ${input} && typeof ${input}.toJSON === 'function' ? ${input}.toJSON() : ${input};
if (${obj} === null) ${this.lit(empty)}else {
${this.buildInnerObject(loc, obj)}}
`;
  }
  buildInnerObject(loc, obj) {
    const { schema } = loc;
    const properties = schema.properties || {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    const keys = Object.keys(properties).sort((a, b) => {
      const ra = required.includes(a);
      const rb = required.includes(b);
      return ra === rb ? 0 : ra ? -1 : 1;
    });
    let code = "";
    for (const key of required) {
      if (!keys.includes(key)) {
        code += `if (${obj}[${quote(key)}] === undefined) throw new Error(${literal(`"${key}" is required!`)});
`;
      }
    }
    const hasExtra = Boolean(schema.patternProperties || schema.additionalProperties);
    const propertiesLoc = keys.length > 0 ? this.child(loc, "properties") : null;
    const firstRequired = keys.length > 0 && required.includes(keys[0]);
    if (keys.length === 1 && !hasExtra && !firstRequired) {
      const [key] = keys;
      const propertyLoc = this.child(propertiesLoc, key);
      const resolved = propertyLoc.schema && propertyLoc.schema.$ref ? this.resolve(propertyLoc) : propertyLoc;
      const defaultValue = resolved.schema && typeof resolved.schema === "object" ? resolved.schema.default : void 0;
      const value = this.name("v");
      const open = `{${quote(key)}:`;
      const valueCode = this.buildValue(propertyLoc, value);
      const single = this.bytes ? null : /^json \+= ([^\n]+);\n$/.exec(valueCode);
      const written = single ? `json += ${literal(open)} + (${single[1]}) + '}';
` : `${this.lit(open)}${valueCode}${this.lit("}")}`;
      const missing = this.lit(defaultValue === void 0 ? "{}" : `{${quote(key)}:${JSON.stringify(defaultValue)}}`);
      return `${code}const ${value} = ${obj}[${quote(key)}];
if (${value} !== undefined) {
${written}}
else ${missing}`;
    }
    const flag = this.name("c");
    if (!firstRequired) code += `let ${flag} = false;
`;
    keys.forEach((key, i) => {
      const propertyLoc = this.child(propertiesLoc, key);
      const resolved = propertyLoc.schema && propertyLoc.schema.$ref ? this.resolve(propertyLoc) : propertyLoc;
      const defaultValue = resolved.schema && typeof resolved.schema === "object" ? resolved.schema.default : void 0;
      const value = this.name("v");
      const keyJson = `${quote(key)}:`;
      const before = (suffix = "") => firstRequired ? this.lit((i === 0 ? "{" : ",") + keyJson + suffix) : this.litChoice(flag, `,${keyJson}${suffix}`, `{${keyJson}${suffix}`, `${flag} = true`);
      const valueCode = this.buildValue(propertyLoc, value);
      const written = this.bytes ? before() + valueCode : appendAfter(before(), valueCode);
      code += `const ${value} = ${obj}[${quote(key)}];
if (${value} !== undefined) {
${written}}
`;
      if (defaultValue !== void 0) {
        code += `else {
${before(JSON.stringify(defaultValue))}}
`;
      } else if (required.includes(key)) {
        code += `else throw new Error(${literal(`"${key}" is required!`)});
`;
      }
    });
    if (hasExtra) {
      const comma = firstRequired ? this.lit(",") : this.litChoice(flag, ",", "{", `${flag} = true`);
      code += this.buildExtraProperties(loc, obj, keys, comma);
    }
    code += firstRequired ? this.lit("}") : this.litChoice(flag, "}", "{}");
    return code;
  }
  buildExtraProperties(loc, obj, keys, comma) {
    const { schema } = loc;
    let known = "false";
    if (keys.length > 0 && keys.length <= 8) {
      known = keys.map((key) => `key === ${quote(key)}`).join(" || ");
    } else if (keys.length > 8) {
      this.patterns.push(new Set(keys));
      known = `p[${this.patterns.length - 1}].has(key)`;
    }
    const writeKey = this.bytes ? "ws(key);\nwc(58);\n" : "json += asString(key) + ':';\n";
    let code = `for (const key of Object.keys(${obj})) {
if (${known}) continue;
const value = ${obj}[key];
if (value === undefined || typeof value === 'function' || typeof value === 'symbol') continue;
`;
    if (schema.patternProperties) {
      const patternsLoc = this.child(loc, "patternProperties");
      for (const pattern of Object.keys(schema.patternProperties)) {
        this.patterns.push(new RegExp(pattern));
        const regex = `p[${this.patterns.length - 1}]`;
        code += `if (${regex}.test(key)) {
${comma}${writeKey}${this.buildValue(this.child(patternsLoc, pattern), "value")}continue;
}
`;
      }
    }
    const additional = schema.additionalProperties;
    if (additional === true) {
      code += `${comma}${writeKey}${this.raw("JSON.stringify(value)")}`;
    } else if (additional !== void 0 && additional !== false) {
      code += `${comma}${writeKey}${this.buildValue(this.child(loc, "additionalProperties"), "value")}`;
    }
    return `${code}}
`;
  }
  buildArray(loc, input) {
    const { schema } = loc;
    const arr = this.name("a");
    const length = this.name("n");
    const empty = schema.nullable === true ? "null" : "[]";
    const tuple = Array.isArray(schema.prefixItems) ? schema.prefixItems : Array.isArray(schema.items) ? schema.items : null;
    const additional = Array.isArray(schema.prefixItems) ? schema.items : schema.additionalItems;
    const mismatch = literal(`The value of '${this.refOf(loc)}' does not match schema definition.`);
    let code = `const ${arr} = ${input};
if (${arr} === null) ${this.lit(empty)}else if (!Array.isArray(${arr})) throw new TypeError(${mismatch});
else {
const ${length} = ${arr}.length;
`;
    let close = "}\n";
    if (tuple && !additional) {
      code += `if (${length} > ${tuple.length}) throw new Error(${literal(`Item at ${tuple.length} does not match schema definition.`)});
`;
    }
    if (this.largeArrayMechanism === "json-stringify") {
      code += `if (${length} >= ${this.largeArraySize}) ${this.raw(`JSON.stringify(${arr})`)}else {
`;
      close += "}\n";
    }
    code += this.lit("[");
    if (tuple) {
      const tupleLoc = this.child(loc, Array.isArray(schema.prefixItems) ? "prefixItems" : "items");
      const flag = this.name("c");
      code += `let ${flag} = false;
`;
      tuple.forEach((item, i) => {
        let itemLoc = this.child(tupleLoc, i);
        if (itemLoc.schema && itemLoc.schema.$ref) itemLoc = this.resolve(itemLoc);
        const value = this.name("v");
        const condition = typeCondition(itemLoc.schema && itemLoc.schema.type, value);
        code += `if (${i} < ${length}) {
const ${value} = ${arr}[${i}];
if (${condition}) {
if (${flag}) ${this.lit(",")}else ${flag} = true;
${this.buildValue(itemLoc, value)}}
else throw new Error(${literal(`Item at ${i} does not match schema definition.`)});
}
`;
      });
      if (additional) {
        const index = this.name("i");
        code += `for (let ${index} = ${tuple.length}; ${index} < ${length}; ${index} += 1) {
if (${flag}) ${this.lit(",")}else ${flag} = true;
${this.raw(`JSON.stringify(${arr}[${index}])`)}}
`;
      }
    } else {
      const itemsLoc = this.child(loc, "items");
      if (itemsLoc.schema === void 0) itemsLoc.schema = {};
      const index = this.name("i");
      const value = this.name("v");
      code += `for (let ${index} = 0; ${index} < ${length}; ${index} += 1) {
if (${index} !== 0) ${this.lit(",")}const ${value} = ${arr}[${index}];
${this.buildValue(itemsLoc, value)}}
`;
    }
    code += this.lit("]");
    return code + close;
  }
  compile(schema) {
    const rootLoc = { schema, base: this.rootId, pointer: "#" };
    const body = this.buildValue(rootLoc, "input");
    let source = "'use strict';\nconst { asString, asStringValue, asUnsafeString, asInteger, asNumber, asDateTime, asDate, asTime } = rt;\n";
    if (this.bytes) {
      source += "const { begin, end, endBuffer, abort, writeBytes: wb, writeByte: wc, writeRaw: wr, writeString: ws } = w;\nconst { writeInteger: wi, writeNumber: wn } = rt;\n" + this.literals.map((text, i) => `const B${i} = lits[${i}]; // ${JSON.stringify(text)}
`).join("") + `${this.functions.join("\n")}
function write(input) {
${body}}
function serialize(input) {
const start = begin();
try {
write(input);
} catch (error) {
abort(start);
throw error;
}
return end(start);
}
serialize.toBuffer = function toBuffer(input) {
const start = begin();
try {
write(input);
} catch (error) {
abort(start);
throw error;
}
return endBuffer(start);
};
return serialize;
`;
      return source;
    }
    const direct = body.match(/^json \+= (f\d+)\(input\);\n$/);
    source += `${this.functions.join("\n")}
`;
    source += direct ? `return ${direct[1]};
` : `return function serialize(input) {
let json = '';
${body}return json;
};
`;
    return source;
  }
}
function build(schema, options = {}) {
  if (options.rounding !== void 0 && !ROUNDING.has(options.rounding)) {
    throw new Error(`Unsupported integer rounding method ${options.rounding}`);
  }
  if (options.largeArrayMechanism !== void 0 && !LARGE_ARRAY_MECHANISMS.has(options.largeArrayMechanism)) {
    throw new Error(`Unsupported large array mechanism ${options.largeArrayMechanism}`);
  }
  if (options.output !== void 0 && !OUTPUTS.has(options.output)) {
    throw new Error(`Unsupported output ${options.output}`);
  }
  (0, import_meta.validateSchema)(schema);
  const compileFor = (output2) => {
    const builder2 = new Builder(schema, { ...options, output: output2 });
    builder2.resolver.addSchema(schema, builder2.rootId);
    if (options.schema) {
      for (const key of Object.keys(options.schema)) {
        const external = options.schema[key];
        const id = typeof external.$id === "string" && external.$id[0] !== "#" ? external.$id : key;
        if (!builder2.resolver.hasSchema(id)) {
          (0, import_meta.validateSchema)(external, key);
          builder2.resolver.addSchema(external, key);
        }
      }
    }
    return { builder: builder2, source: builder2.compile(schema) };
  };
  const output = options.output || "auto";
  let compiled = compileFor(output === "bytes" ? "bytes" : "string");
  if (output === "auto" && (compiled.builder.functions.length > 0 || compiled.source.includes("for ("))) {
    compiled = compileFor("bytes");
  }
  const { builder, source } = compiled;
  if (options.mode === "debug") return { code: source };
  const literals = builder.literals.map(bytesOf);
  const factory = new Function("rt", "v", "p", "w", "lits", source);
  return factory((0, import_runtime.createRuntime)(options), builder.validators, builder.patterns, writer, literals);
}
function appendAfter(first, code) {
  const a = /^json \+= ([^\n]+);\n$/.exec(first);
  const b = /^json \+= ([^\n]+);\n$/.exec(code);
  if (a !== null && b !== null) return `json += (${a[1]}) + (${b[1]});
`;
  return first + code;
}
function typeCondition(type, value) {
  switch (type) {
    case "null":
      return `${value} === null`;
    case "string":
      return `typeof ${value} === 'string' || ${value} === null || ${value} instanceof Date || ${value} instanceof RegExp || (typeof ${value} === 'object' && typeof ${value}.toString === 'function' && ${value}.toString !== Object.prototype.toString)`;
    case "integer":
      return `Number.isInteger(${value})`;
    case "number":
      return `Number.isFinite(${value})`;
    case "boolean":
      return `typeof ${value} === 'boolean'`;
    case "object":
      return `${value} && typeof ${value} === 'object' && ${value}.constructor === Object`;
    case "array":
      return `Array.isArray(${value})`;
    default:
      if (Array.isArray(type)) return `(${type.map((t) => typeCondition(t, value)).join(" || ")})`;
      return "true";
  }
}
var serializer_default = build;
build.build = build;
build.default = build;
build.validLargeArrayMechanisms = LARGE_ARRAY_MECHANISMS;

},
"@xufa/serializer/lib/deep-equal.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var deep_equal_exports = {};
__export(deep_equal_exports, {
  deepEqual: () => deepEqual
});
module.exports = __toCommonJS(deep_equal_exports);
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return a !== a && b !== b;
  }
  if (a.constructor !== b.constructor) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (a instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp) return a.source === b.source && a.flags === b.flags;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !deepEqual(a[key], b[key])) return false;
  }
  return true;
}

},
"@xufa/serializer/lib/match.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var match_exports = {};
__export(match_exports, {
  createMatcher: () => createMatcher
});
module.exports = __toCommonJS(match_exports);
var import_deep_equal = require("./deep-equal.js");
const FORMATS = {
  "date-time": /^\d{4}-\d\d-\d\d[tT ]\d\d:\d\d:\d\d(?:\.\d+)?(?:[zZ]|[+-]\d\d(?::?\d\d)?)$/,
  date: /^\d{4}-\d\d-\d\d$/,
  time: /^\d\d:\d\d:\d\d(?:\.\d+)?(?:[zZ]|[+-]\d\d(?::?\d\d)?)?$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
  ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/,
  uri: /^[a-z][a-z0-9+.-]*:[^\s]*$/i
};
const ALWAYS = () => true;
const NEVER = () => false;
const NUMERIC = /^\s*-?\d+(\.\d+)?([eE][+-]?\d+)?\s*$/;
const isTyped = (v, types) => types.includes(typeof v);
function coercedTypeCheck(type) {
  switch (type) {
    case "string":
      return (v) => isTyped(v, ["string", "number", "boolean"]) || v !== null && typeof v === "object" && typeof v.toJSON === "function";
    case "number":
      return (v) => typeof v === "number" && Number.isFinite(v) || typeof v === "boolean" || v === null || typeof v === "string" && NUMERIC.test(v);
    case "integer":
      return (v) => Number.isInteger(v) || typeof v === "boolean" || v === null || typeof v === "string" && NUMERIC.test(v) && Number.isInteger(Number(v));
    case "boolean":
      return (v) => typeof v === "boolean" || v === "true" || v === "false" || v === 1 || v === 0 || v === null;
    case "null":
      return (v) => v === null || v === "" || v === 0 || v === false;
    default:
      return typeCheck(type);
  }
}
function typeCheck(type) {
  switch (type) {
    case "null":
      return (v) => v === null;
    case "boolean":
      return (v) => typeof v === "boolean";
    case "integer":
      return (v) => Number.isInteger(v);
    case "number":
      return (v) => typeof v === "number" && Number.isFinite(v);
    case "string":
      return (v) => typeof v === "string" || v !== null && typeof v === "object" && typeof v.toJSON === "function";
    case "array":
      return (v) => Array.isArray(v);
    case "object":
      return (v) => v !== null && typeof v === "object" && !Array.isArray(v);
    default:
      return NEVER;
  }
}
const length = (str) => [...str].length;
function createMatcher(resolver, options = {}) {
  const cache = /* @__PURE__ */ new Map();
  const checkType = options.coerceTypes ? coercedTypeCheck : typeCheck;
  function compile(schema, base) {
    if (schema === true || schema === void 0) return ALWAYS;
    if (schema === false) return NEVER;
    if (cache.has(schema)) return cache.get(schema);
    let compiled = null;
    const lazy = (value) => compiled(value);
    cache.set(schema, lazy);
    const checks = [];
    const schemaBase = resolver.baseOf(schema, base);
    if (schema.$ref !== void 0) {
      const target = resolver.resolve(schema.$ref, schemaBase);
      if (target === null) throw new Error(`Cannot find reference "${schema.$ref}"`);
      checks.push(compile(target.schema, target.base));
    }
    if (schema.type !== void 0) {
      const types = (Array.isArray(schema.type) ? schema.type : [schema.type]).map(checkType);
      if (schema.nullable === true) types.push(typeCheck("null"));
      checks.push(types.length === 1 ? types[0] : (v) => types.some((check) => check(v)));
    }
    if (schema.const !== void 0) {
      const expected = schema.const;
      checks.push((v) => (0, import_deep_equal.deepEqual)(v, expected) || schema.nullable === true && v === null);
    }
    if (Array.isArray(schema.enum)) {
      const values = schema.enum;
      checks.push((v) => values.some((e) => (0, import_deep_equal.deepEqual)(v, e)) || schema.nullable === true && v === null);
    }
    addStringChecks(schema, checks);
    addNumberChecks(schema, checks);
    addObjectChecks(schema, checks, schemaBase);
    addArrayChecks(schema, checks, schemaBase);
    for (const keyword of ["allOf", "anyOf", "oneOf"]) {
      if (!Array.isArray(schema[keyword])) continue;
      const subs = schema[keyword].map((sub) => compile(sub, schemaBase));
      if (keyword === "allOf") checks.push((v) => subs.every((check) => check(v)));
      else if (keyword === "anyOf") checks.push((v) => subs.some((check) => check(v)));
      else checks.push((v) => subs.filter((check) => check(v)).length === 1);
    }
    if (schema.not !== void 0) {
      const not = compile(schema.not, schemaBase);
      checks.push((v) => !not(v));
    }
    if (schema.if !== void 0) {
      const test = compile(schema.if, schemaBase);
      const then = compile(schema.then, schemaBase);
      const otherwise = compile(schema.else, schemaBase);
      checks.push((v) => test(v) ? then(v) : otherwise(v));
    }
    compiled = checks.length === 0 ? ALWAYS : checks.length === 1 ? checks[0] : (v) => checks.every((c) => c(v));
    cache.set(schema, compiled);
    return compiled;
  }
  function addStringChecks(schema, checks) {
    const isString = (v) => typeof v === "string";
    if (schema.minLength !== void 0) checks.push((v) => !isString(v) || length(v) >= schema.minLength);
    if (schema.maxLength !== void 0) checks.push((v) => !isString(v) || length(v) <= schema.maxLength);
    if (schema.pattern !== void 0) {
      const regex = new RegExp(schema.pattern, "u");
      checks.push((v) => !isString(v) || regex.test(v));
    }
    if (schema.format !== void 0 && FORMATS[schema.format]) {
      const regex = FORMATS[schema.format];
      checks.push((v) => !isString(v) || regex.test(v));
    }
  }
  function addNumberChecks(schema, checks) {
    const isNumber = (v) => typeof v === "number";
    const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf } = schema;
    if (minimum !== void 0) checks.push((v) => !isNumber(v) || v >= minimum);
    if (maximum !== void 0) checks.push((v) => !isNumber(v) || v <= maximum);
    if (typeof exclusiveMinimum === "number") checks.push((v) => !isNumber(v) || v > exclusiveMinimum);
    if (typeof exclusiveMaximum === "number") checks.push((v) => !isNumber(v) || v < exclusiveMaximum);
    if (multipleOf !== void 0) {
      checks.push((v) => !isNumber(v) || Math.abs(v / multipleOf - Math.round(v / multipleOf)) < 1e-9);
    }
  }
  function addObjectChecks(schema, checks, base) {
    const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
    if (Array.isArray(schema.required) && schema.required.length > 0) {
      const required = schema.required;
      checks.push((v) => !isObject(v) || required.every((key) => v[key] !== void 0));
    }
    const properties = schema.properties ? Object.keys(schema.properties) : [];
    const propertyChecks = properties.map((key) => [key, compile(schema.properties[key], base)]);
    const patterns = schema.patternProperties ? Object.keys(schema.patternProperties).map((p) => [
      new RegExp(p, "u"),
      compile(schema.patternProperties[p], base)
    ]) : [];
    const additional = schema.additionalProperties;
    if (propertyChecks.length > 0) {
      checks.push((v) => {
        if (!isObject(v)) return true;
        for (const [key, check] of propertyChecks) if (v[key] !== void 0 && !check(v[key])) return false;
        return true;
      });
    }
    if (patterns.length > 0 || additional !== void 0 && additional !== true) {
      const additionalCheck = compile(additional, base);
      const known = new Set(properties);
      checks.push((v) => {
        if (!isObject(v)) return true;
        for (const key of Object.keys(v)) {
          if (v[key] === void 0) continue;
          let matched = known.has(key);
          for (const [regex, check] of patterns) {
            if (regex.test(key)) {
              matched = true;
              if (!check(v[key])) return false;
            }
          }
          if (!matched && additional !== void 0 && !additionalCheck(v[key])) return false;
        }
        return true;
      });
    }
    if (schema.minProperties !== void 0) {
      checks.push((v) => !isObject(v) || Object.keys(v).length >= schema.minProperties);
    }
    if (schema.maxProperties !== void 0) {
      checks.push((v) => !isObject(v) || Object.keys(v).length <= schema.maxProperties);
    }
    if (schema.dependentRequired || schema.dependencies) {
      const deps = { ...schema.dependencies, ...schema.dependentRequired };
      const entries = Object.keys(deps).map((key) => [key, deps[key]]);
      const schemaDeps = entries.filter(([, value]) => !Array.isArray(value)).map(([key, value]) => [key, compile(value, base)]);
      checks.push((v) => {
        if (!isObject(v)) return true;
        for (const [key, value] of entries) {
          if (v[key] === void 0) continue;
          if (Array.isArray(value) && !value.every((k) => v[k] !== void 0)) return false;
        }
        for (const [key, check] of schemaDeps) if (v[key] !== void 0 && !check(v)) return false;
        return true;
      });
    }
  }
  function addArrayChecks(schema, checks, base) {
    const { items, prefixItems, additionalItems, minItems, maxItems, uniqueItems, contains } = schema;
    if (minItems !== void 0) checks.push((v) => !Array.isArray(v) || v.length >= minItems);
    if (maxItems !== void 0) checks.push((v) => !Array.isArray(v) || v.length <= maxItems);
    const tuple = Array.isArray(prefixItems) ? prefixItems : Array.isArray(items) ? items : null;
    if (tuple) {
      const tupleChecks = tuple.map((s) => compile(s, base));
      const rest = Array.isArray(prefixItems) ? items : additionalItems;
      const restCheck = compile(rest, base);
      checks.push((v) => {
        if (!Array.isArray(v)) return true;
        for (let i = 0; i < v.length; i += 1) {
          if (i < tupleChecks.length ? !tupleChecks[i](v[i]) : !restCheck(v[i])) return false;
        }
        return true;
      });
    } else if (items !== void 0) {
      const itemCheck = compile(items, base);
      checks.push((v) => !Array.isArray(v) || v.every((item) => itemCheck(item)));
    }
    if (contains !== void 0) {
      const containsCheck = compile(contains, base);
      checks.push((v) => !Array.isArray(v) || v.some((item) => containsCheck(item)));
    }
    if (uniqueItems === true) {
      checks.push((v) => {
        if (!Array.isArray(v)) return true;
        for (let i = 0; i < v.length; i += 1)
          for (let j = i + 1; j < v.length; j += 1) if ((0, import_deep_equal.deepEqual)(v[i], v[j])) return false;
        return true;
      });
    }
  }
  return compile;
}

},
"@xufa/serializer/lib/merge.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var merge_exports = {};
__export(merge_exports, {
  MergeError: () => MergeError,
  mergeSchemas: () => mergeAll
});
module.exports = __toCommonJS(merge_exports);
var import_deep_equal = require("./deep-equal.js");
class MergeError extends Error {
  constructor(keyword, values) {
    super(`Failed to merge "${keyword}" keyword schemas.`);
    this.keyword = keyword;
    this.values = values;
    this.schemas = values;
  }
}
function intersection(arrays) {
  let out = arrays[0];
  for (let i = 1; i < arrays.length; i += 1) out = out.filter((value) => arrays[i].some((v) => (0, import_deep_equal.deepEqual)(v, value)));
  return out;
}
function union(arrays) {
  const out = [];
  for (const array of arrays) for (const value of array) if (!out.some((v) => (0, import_deep_equal.deepEqual)(v, value))) out.push(value);
  return out;
}
function allEqual(keyword, values, merged) {
  for (let i = 1; i < values.length; i += 1) {
    if (!(0, import_deep_equal.deepEqual)(values[i], values[0])) throw new MergeError(keyword, values);
  }
  merged[keyword] = values[0];
}
const resolvers = {
  $id: () => {
  },
  type(keyword, values, merged) {
    const arrays = values.map((value) => Array.isArray(value) ? value : [value]);
    const types = intersection(arrays);
    if (types.length === 0) throw new MergeError(keyword, arrays);
    merged[keyword] = types.length === 1 ? types[0] : types;
  },
  enum(keyword, values, merged) {
    const common = intersection(values);
    if (common.length === 0) throw new MergeError(keyword, values);
    merged[keyword] = common;
  },
  minLength: maxNumber,
  maxLength: minNumber,
  minimum: maxNumber,
  maximum: minNumber,
  exclusiveMinimum: maxNumber,
  exclusiveMaximum: minNumber,
  minItems: maxNumber,
  maxItems: minNumber,
  minProperties: maxNumber,
  maxProperties: minNumber,
  multipleOf(keyword, values, merged) {
    const gcd = (a, b) => !b ? a : gcd(b, a % b);
    let scale = 1;
    for (const value of values) while (value * scale % 1 !== 0) scale *= 10;
    let multiple = values[0] * scale;
    for (const value of values) multiple = multiple * value * scale / gcd(multiple, value * scale);
    merged[keyword] = multiple / scale;
  },
  const: allEqual,
  default: allEqual,
  format: allEqual,
  required(keyword, values, merged) {
    merged[keyword] = union(values);
  },
  allOf(keyword, values, merged) {
    merged[keyword] = union(values);
  },
  properties(keyword, values, merged, schemas, options) {
    const found = {};
    for (const schema of schemas) {
      for (const name of Object.keys(schema.properties || {})) {
        if (found[name] !== void 0) continue;
        found[name] = [schema.properties[name]];
        for (const other of schemas) {
          if (other === schema) continue;
          const propertySchema = schemaForProperty(other, name);
          if (propertySchema !== void 0) found[name].push(propertySchema);
        }
      }
    }
    const out = {};
    for (const name of Object.keys(found)) out[name] = mergeAll(found[name], options);
    merged[keyword] = out;
  },
  patternProperties: mergeObjects,
  definitions: mergeObjects,
  $defs: mergeObjects,
  dependentSchemas: mergeObjects,
  additionalProperties: mergeSubschemas,
  not: mergeSubschemas,
  propertyNames: mergeSubschemas,
  contains: mergeSubschemas,
  items(keyword, values, merged, schemas, options) {
    const tupleLength = Math.max(0, ...values.map((v) => Array.isArray(v) ? v.length : 0));
    if (tupleLength === 0) {
      merged[keyword] = mergeAll(values, options);
      return;
    }
    const items = [];
    for (let i = 0; i < tupleLength; i += 1) {
      const atIndex = [];
      for (const schema of schemas) {
        const itemSchema = schemaForItem(schema, i);
        if (itemSchema !== void 0) atIndex.push(itemSchema);
      }
      items[i] = mergeAll(atIndex, options);
    }
    merged[keyword] = items;
  },
  additionalItems(keyword, values, merged, schemas, options) {
    if (!schemas.some((schema) => Array.isArray(schema.items))) {
      merged[keyword] = mergeAll(values, options);
      return;
    }
    const additional = [];
    for (const schema of schemas) {
      let value = schema.additionalItems;
      if (value === void 0 && !Array.isArray(schema.items)) value = schema.items;
      if (value !== void 0) additional.push(value);
    }
    merged[keyword] = mergeAll(additional, options);
  },
  nullable(keyword, values, merged) {
    merged[keyword] = values.every((value) => value !== false);
  },
  uniqueItems(keyword, values, merged) {
    merged[keyword] = values.some((value) => value === true);
  },
  oneOf: mergeOneOf,
  anyOf: mergeOneOf,
  if(keyword, values, merged, schemas, options) {
    for (const schema of schemas) {
      if (schema.if === void 0) continue;
      const sub = { if: schema.if, then: schema.then, else: schema.else };
      if (merged.if === void 0) {
        merged.if = sub.if;
        if (sub.then !== void 0) merged.then = sub.then;
        if (sub.else !== void 0) merged.else = sub.else;
        continue;
      }
      if (merged.then !== void 0) merged.then = mergeAll([merged.then, sub], options);
      if (merged.else !== void 0) merged.else = mergeAll([merged.else, sub], options);
    }
  },
  then: () => {
  },
  else: () => {
  },
  dependencies: mergeDependencies,
  dependentRequired: mergeDependencies
};
function minNumber(keyword, values, merged) {
  merged[keyword] = Math.min(...values);
}
function maxNumber(keyword, values, merged) {
  merged[keyword] = Math.max(...values);
}
function mergeSubschemas(keyword, values, merged, schemas, options) {
  merged[keyword] = mergeAll(values, options);
}
function mergeObjects(keyword, values, merged, schemas, options) {
  const grouped = {};
  for (const value of values) {
    for (const name of Object.keys(value)) (grouped[name] = grouped[name] || []).push(value[name]);
  }
  const out = {};
  for (const name of Object.keys(grouped)) out[name] = mergeAll(grouped[name], options);
  merged[keyword] = out;
}
function mergeDependencies(keyword, values, merged) {
  const out = {};
  for (const dependencies of values) {
    for (const name of Object.keys(dependencies)) {
      out[name] = out[name] || [];
      for (const dependency of dependencies[name]) if (!out[name].includes(dependency)) out[name].push(dependency);
    }
  }
  merged[keyword] = out;
}
function mergeOneOf(keyword, values, merged, schemas, options) {
  if (values.length === 1) {
    merged[keyword] = values[0];
    return;
  }
  let product = [[]];
  for (const array of values) product = product.flatMap((combination) => array.map((item) => [...combination, item]));
  const out = [];
  for (const combination of product) {
    try {
      const schema = mergeAll(combination, options);
      if (schema !== void 0) out.push(schema);
    } catch (err) {
      if (!(err instanceof MergeError)) throw err;
    }
  }
  merged[keyword] = out;
}
function schemaForItem(schema, index) {
  const { items, additionalItems } = schema;
  if (Array.isArray(items)) return index < items.length ? items[index] : additionalItems;
  return items !== void 0 ? items : additionalItems;
}
function schemaForProperty(schema, name) {
  if (schema.properties && schema.properties[name] !== void 0) return schema.properties[name];
  for (const pattern of Object.keys(schema.patternProperties || {})) {
    if (new RegExp(pattern).test(name)) return schema.patternProperties[pattern];
  }
  return schema.additionalProperties;
}
function defaultResolver(keyword, values, merged) {
  if (values.length === 1 || values.every((value) => (0, import_deep_equal.deepEqual)(value, values[0]))) merged[keyword] = values[0];
}
function mergeAll(schemas, options = {}) {
  if (schemas.length === 0) return {};
  if (schemas.length === 1) return schemas[0];
  const keywords = {};
  let allTrue = true;
  for (const schema of schemas) {
    if (schema === false) return false;
    if (schema === true) continue;
    allTrue = false;
    for (const keyword of Object.keys(schema)) (keywords[keyword] = keywords[keyword] || []).push(schema[keyword]);
  }
  if (allTrue) return true;
  const merged = {};
  const relevant = schemas.filter((schema) => schema !== true);
  for (const keyword of Object.keys(keywords)) {
    const resolver = resolvers[keyword] || defaultResolver;
    resolver(keyword, keywords[keyword], merged, relevant, options);
  }
  return merged;
}

},
"@xufa/serializer/lib/meta.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var meta_exports = {};
__export(meta_exports, {
  validateSchema: () => validateSchema
});
module.exports = __toCommonJS(meta_exports);
const SIMPLE_TYPES = /* @__PURE__ */ new Set(["array", "boolean", "integer", "null", "number", "object", "string"]);
class SchemaError extends Error {
}
function fail(path, message) {
  throw new SchemaError(`data${path} ${message}`);
}
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isSchema = (value) => typeof value === "boolean" || isObject(value);
function isRegex(source) {
  try {
    new RegExp(source, "u");
    return true;
  } catch {
    return false;
  }
}
function nonNegativeInteger(value, path) {
  if (typeof value !== "number" || !Number.isInteger(value)) fail(path, "must be integer");
  if (value < 0) fail(path, "must be >= 0");
}
function number(value, path) {
  if (typeof value !== "number") fail(path, "must be number");
}
function schema(value, path) {
  if (!isSchema(value)) fail(path, "must be object,boolean");
  if (typeof value === "boolean") return;
  const s = value;
  if (s.$id !== void 0 && typeof s.$id !== "string") fail(`${path}/$id`, "must be string");
  if (s.$schema !== void 0 && typeof s.$schema !== "string") fail(`${path}/$schema`, "must be string");
  if (s.$ref !== void 0 && typeof s.$ref !== "string") fail(`${path}/$ref`, "must be string");
  if (s.$comment !== void 0 && typeof s.$comment !== "string") fail(`${path}/$comment`, "must be string");
  if (s.title !== void 0 && typeof s.title !== "string") fail(`${path}/title`, "must be string");
  if (s.description !== void 0 && typeof s.description !== "string") fail(`${path}/description`, "must be string");
  if (s.readOnly !== void 0 && typeof s.readOnly !== "boolean") fail(`${path}/readOnly`, "must be boolean");
  if (s.examples !== void 0 && !Array.isArray(s.examples)) fail(`${path}/examples`, "must be array");
  if (s.multipleOf !== void 0) {
    number(s.multipleOf, `${path}/multipleOf`);
    if (s.multipleOf <= 0) fail(`${path}/multipleOf`, "must be > 0");
  }
  for (const key of ["maximum", "exclusiveMaximum", "minimum", "exclusiveMinimum"]) {
    if (s[key] !== void 0 && typeof s[key] !== "boolean") number(s[key], `${path}/${key}`);
  }
  if (s.maxLength !== void 0) nonNegativeInteger(s.maxLength, `${path}/maxLength`);
  if (s.minLength !== void 0) nonNegativeInteger(s.minLength, `${path}/minLength`);
  if (s.pattern !== void 0) {
    if (typeof s.pattern !== "string") fail(`${path}/pattern`, "must be string");
    if (!isRegex(s.pattern)) fail(`${path}/pattern`, 'must match format "regex"');
  }
  if (s.additionalItems !== void 0) schema(s.additionalItems, `${path}/additionalItems`);
  if (s.items !== void 0) {
    if (Array.isArray(s.items)) {
      if (s.items.length === 0) fail(`${path}/items`, "must NOT have fewer than 1 items");
      s.items.forEach((item, i) => schema(item, `${path}/items/${i}`));
    } else {
      schema(s.items, `${path}/items`);
    }
  }
  if (s.maxItems !== void 0) nonNegativeInteger(s.maxItems, `${path}/maxItems`);
  if (s.minItems !== void 0) nonNegativeInteger(s.minItems, `${path}/minItems`);
  if (s.uniqueItems !== void 0 && typeof s.uniqueItems !== "boolean") fail(`${path}/uniqueItems`, "must be boolean");
  if (s.contains !== void 0) schema(s.contains, `${path}/contains`);
  if (s.maxProperties !== void 0) nonNegativeInteger(s.maxProperties, `${path}/maxProperties`);
  if (s.minProperties !== void 0) nonNegativeInteger(s.minProperties, `${path}/minProperties`);
  if (s.required !== void 0) {
    if (!Array.isArray(s.required)) fail(`${path}/required`, "must be array");
    s.required.forEach((item, i) => {
      if (typeof item !== "string") fail(`${path}/required/${i}`, "must be string");
    });
  }
  if (s.additionalProperties !== void 0) schema(s.additionalProperties, `${path}/additionalProperties`);
  schemaMap(s.definitions, `${path}/definitions`);
  schemaMap(s.properties, `${path}/properties`);
  if (s.patternProperties !== void 0) {
    if (!isObject(s.patternProperties)) fail(`${path}/patternProperties`, "must be object");
    for (const key of Object.keys(s.patternProperties)) {
      if (!isRegex(key)) fail(`${path}/patternProperties`, 'must match format "regex"');
    }
    schemaMap(s.patternProperties, `${path}/patternProperties`);
  }
  if (s.dependencies !== void 0) {
    if (!isObject(s.dependencies)) fail(`${path}/dependencies`, "must be object");
    for (const key of Object.keys(s.dependencies)) {
      const dep = s.dependencies[key];
      if (!Array.isArray(dep)) schema(dep, `${path}/dependencies/${key}`);
    }
  }
  if (s.propertyNames !== void 0) schema(s.propertyNames, `${path}/propertyNames`);
  if (s.enum !== void 0 && !Array.isArray(s.enum)) fail(`${path}/enum`, "must be array");
  if (s.type !== void 0) {
    if (Array.isArray(s.type)) {
      s.type.forEach((type, i) => {
        if (!SIMPLE_TYPES.has(type)) fail(`${path}/type/${i}`, "must be equal to one of the allowed values");
      });
    } else if (!SIMPLE_TYPES.has(s.type)) {
      fail(`${path}/type`, "must be equal to one of the allowed values");
    }
  }
  if (s.format !== void 0 && typeof s.format !== "string") fail(`${path}/format`, "must be string");
  if (s.if !== void 0) schema(s.if, `${path}/if`);
  if (s.then !== void 0) schema(s.then, `${path}/then`);
  if (s.else !== void 0) schema(s.else, `${path}/else`);
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    if (s[key] === void 0) continue;
    if (!Array.isArray(s[key])) fail(`${path}/${key}`, "must be array");
    if (s[key].length === 0) fail(`${path}/${key}`, "must NOT have fewer than 1 items");
    s[key].forEach((item, i) => schema(item, `${path}/${key}/${i}`));
  }
  if (s.not !== void 0) schema(s.not, `${path}/not`);
}
function schemaMap(map, path) {
  if (map === void 0) return;
  if (!isObject(map)) fail(path, "must be object");
  for (const key of Object.keys(map)) schema(map[key], `${path}/${key}`);
}
function validateSchema(value, name) {
  try {
    schema(value, "");
  } catch (err) {
    if (!(err instanceof SchemaError)) throw err;
    throw new Error(`${name ? `"${name}" ` : ""}schema is invalid: ${err.message}`);
  }
}

},
"@xufa/serializer/lib/resolver.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var resolver_exports = {};
__export(resolver_exports, {
  RefResolver: () => RefResolver,
  resolveURI: () => resolveURI
});
module.exports = __toCommonJS(resolver_exports);
var import_deep_equal = require("./deep-equal.js");
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
function stripHash(uri) {
  return uri.endsWith("#") ? uri.slice(0, -1) : uri;
}
function resolveURI(base, ref) {
  if (ref === "") return base;
  if (SCHEME.test(ref)) return stripHash(ref);
  if (base && SCHEME.test(base)) {
    try {
      return stripHash(new URL(ref, base).href);
    } catch {
      return ref;
    }
  }
  return ref;
}
function unescapePointerSegment(segment) {
  let out = segment.replace(/~1/g, "/").replace(/~0/g, "~");
  if (out.includes("%")) {
    try {
      out = decodeURIComponent(out);
    } catch {
    }
  }
  return out;
}
class RefResolver {
  constructor() {
    this.docs = /* @__PURE__ */ new Map();
    this.anchors = /* @__PURE__ */ new Map();
    this.bases = /* @__PURE__ */ new Map();
  }
  hasSchema(uri) {
    return this.docs.has(stripHash(uri));
  }
  getSchema(uri) {
    return this.docs.get(stripHash(uri));
  }
  addSchema(schema, key) {
    let id = key;
    if (schema && typeof schema === "object" && typeof schema.$id === "string" && schema.$id[0] !== "#") {
      id = resolveURI(key && SCHEME.test(key) ? key : "", schema.$id);
    }
    id = stripHash(id);
    if (!this.docs.has(id)) this.docs.set(id, schema);
    if (key !== void 0 && stripHash(key) !== id && !this.docs.has(stripHash(key)))
      this.docs.set(stripHash(key), schema);
    this.walk(schema, id, true);
    return id;
  }
  walk(schema, base, isRoot) {
    if (schema === null || typeof schema !== "object") return;
    if (Array.isArray(schema)) {
      for (const item of schema) this.walk(item, base, false);
      return;
    }
    let current = base;
    if (typeof schema.$id === "string") {
      if (schema.$id[0] === "#") {
        const key = `${base}${schema.$id}`;
        const existing = this.anchors.get(key);
        if (existing && existing.schema !== schema && !(0, import_deep_equal.deepEqual)(existing.schema, schema)) {
          throw new Error(`There is already another anchor "${schema.$id}" in schema "${base}".`);
        }
        this.anchors.set(key, { schema, base });
      } else if (!isRoot) {
        current = resolveURI(base, schema.$id);
        const existing = this.docs.get(current);
        if (existing !== void 0 && existing !== schema && !(0, import_deep_equal.deepEqual)(existing, schema)) {
          throw new Error(`There is already another schema with id "${current}".`);
        }
        if (existing === void 0) this.docs.set(current, schema);
      }
    }
    if (typeof schema.$anchor === "string") this.anchors.set(`${current}#${schema.$anchor}`, { schema, base: current });
    if (!this.bases.has(schema)) this.bases.set(schema, current);
    for (const key of Object.keys(schema)) {
      if (key === "enum" || key === "const" || key === "default" || key === "examples") continue;
      const value = schema[key];
      if (value !== null && typeof value === "object") this.walk(value, current, false);
    }
  }
  baseOf(schema, fallback) {
    return this.bases.get(schema) || fallback;
  }
  // The id of the document a reference points to when no such document is known, else null.
  missingDocument(ref, base) {
    const hash = ref.indexOf("#");
    const uriPart = hash === -1 ? ref : ref.slice(0, hash);
    const uri = uriPart === "" ? base : resolveURI(base, uriPart);
    return this.docs.has(uri) ? null : uri;
  }
  // { schema, base, pointer } of a reference, or null.
  resolve(ref, base) {
    const hash = ref.indexOf("#");
    const uriPart = hash === -1 ? ref : ref.slice(0, hash);
    const fragment = hash === -1 ? "" : ref.slice(hash + 1);
    const uri = uriPart === "" ? base : resolveURI(base, uriPart);
    if (fragment !== "" && fragment[0] !== "/") {
      const anchor = this.anchors.get(`${uri}#${fragment}`);
      return anchor ? { schema: anchor.schema, base: anchor.base, pointer: `#${fragment}` } : null;
    }
    const doc = this.docs.get(uri);
    if (doc === void 0) return null;
    if (fragment === "") return { schema: doc, base: uri, pointer: "#" };
    let schema = doc;
    let current = uri;
    const segments = fragment.slice(1).split("/").map(unescapePointerSegment);
    for (const segment of segments) {
      if (schema === null || typeof schema !== "object" || !(segment in schema)) return null;
      schema = schema[segment];
      if (schema && typeof schema === "object" && typeof schema.$id === "string" && schema.$id[0] !== "#") {
        current = resolveURI(current, schema.$id);
      }
    }
    return { schema, base: current, pointer: `#${fragment}` };
  }
}

},
"@xufa/serializer/lib/runtime.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var runtime_exports = {};
__export(runtime_exports, {
  asBoolean: () => asBoolean,
  asDate: () => asDate,
  asDateTime: () => asDateTime,
  asNumber: () => asNumber,
  asString: () => asString,
  asTime: () => asTime,
  createRuntime: () => createRuntime
});
module.exports = __toCommonJS(runtime_exports);
var import_writer = require("./writer.js");
const NEEDS_ESCAPE = /[\x00-\x1f"\\\ud800-\udfff]/;
function asString(str) {
  const len = str.length;
  if (len === 0) return '""';
  if (len < 42) {
    let result = "";
    let last = -1;
    for (let i = 0; i < len; i += 1) {
      const point = str.charCodeAt(i);
      if (point === 34 || point === 92) {
        if (last === -1) last = 0;
        result += str.slice(last, i) + "\\";
        last = i;
      } else if (point < 32 || point >= 55296 && point <= 57343) {
        return JSON.stringify(str);
      }
    }
    return last === -1 ? '"' + str + '"' : '"' + result + str.slice(last) + '"';
  }
  if (len < 5e3 && !NEEDS_ESCAPE.test(str)) return '"' + str + '"';
  return JSON.stringify(str);
}
function asStringValue(value) {
  if (typeof value === "string") return asString(value);
  if (value === null) return '""';
  if (value instanceof Date) return `"${value.toISOString()}"`;
  if (value instanceof RegExp) return asString(value.source);
  return asString(value.toString());
}
function asUnsafeString(str) {
  return `"${str}"`;
}
function createAsInteger(rounding) {
  let round = Math.trunc;
  if (rounding === "floor") round = Math.floor;
  else if (rounding === "ceil") round = Math.ceil;
  else if (rounding === "round") round = Math.round;
  return function asInteger(value) {
    if (Number.isInteger(value)) return `${value}`;
    if (typeof value === "bigint") return value.toString();
    const integer = round(value);
    if (integer === Infinity || integer === -Infinity || Number.isNaN(integer)) {
      throw new Error(`The value "${value}" cannot be converted to an integer.`);
    }
    return `${integer}`;
  };
}
function asNumber(value) {
  if (typeof value === "number") {
    if (Number.isFinite(value)) return `${value}`;
    if (Number.isNaN(value)) throw new Error(`The value "${value}" cannot be converted to a number.`);
    return "null";
  }
  const num = Number(value);
  if (Number.isNaN(num)) throw new Error(`The value "${value}" cannot be converted to a number.`);
  if (num === Infinity || num === -Infinity) return "null";
  return `${num}`;
}
function asBoolean(value) {
  return value ? "true" : "false";
}
function localDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 6e4).toISOString();
}
function asDateTime(date) {
  if (date === null) return '""';
  if (date instanceof Date) return `"${date.toISOString()}"`;
  if (typeof date === "string") return `"${date}"`;
  throw new Error(`The value "${date}" cannot be converted to a date-time.`);
}
function asDate(date) {
  if (date === null) return '""';
  if (date instanceof Date) return `"${localDate(date).slice(0, 10)}"`;
  if (typeof date === "string") return `"${date}"`;
  throw new Error(`The value "${date}" cannot be converted to a date.`);
}
function asTime(date) {
  if (date === null) return '""';
  if (date instanceof Date) return `"${localDate(date).slice(11, 19)}"`;
  if (typeof date === "string") return `"${date}"`;
  throw new Error(`The value "${date}" cannot be converted to a time.`);
}
function asAny(value) {
  return `${JSON.stringify(value)}`;
}
function createRuntime(options = {}) {
  const asInteger = createAsInteger(options.rounding);
  return {
    asString,
    asStringValue,
    asUnsafeString,
    asInteger,
    // The writers of numbers of the 'bytes' output: the text of asInteger and asNumber, without making it for the
    // numbers that are written as they are.
    writeInteger(value) {
      (0, import_writer.writeNumberText)(Number.isInteger(value) ? "" + value : asInteger(value));
    },
    writeNumber(value) {
      (0, import_writer.writeNumberText)(typeof value === "number" && Number.isFinite(value) ? "" + value : asNumber(value));
    },
    asNumber,
    asBoolean,
    asDateTime,
    asDate,
    asTime,
    asAny
  };
}

},
"@xufa/serializer/lib/writer.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var writer_exports = {};
__export(writer_exports, {
  abort: () => abort,
  begin: () => begin,
  bytesOf: () => bytesOf,
  end: () => end,
  endBuffer: () => endBuffer,
  writeByte: () => writeByte,
  writeBytes: () => writeBytes,
  writeNumberText: () => writeNumberText,
  writeRaw: () => writeRaw,
  writeString: () => writeString
});
module.exports = __toCommonJS(writer_exports);
const INITIAL_SIZE = 64 * 1024;
const KEEP_SIZE = 1024 * 1024;
const LONG_STRING = 64;
const NEEDS_ESCAPE = /[\x00-\x1f"\\\ud800-\udfff]/;
const HEX = "0123456789abcdef";
let buf = Buffer.allocUnsafeSlow(INITIAL_SIZE);
let pos = 0;
function grow(needed) {
  const next = Buffer.allocUnsafeSlow(Math.max(buf.length * 2, pos + needed));
  buf.copy(next, 0, 0, pos);
  buf = next;
}
function begin() {
  return pos;
}
function end(start) {
  const text = buf.utf8Slice(start, pos);
  pos = start;
  if (start === 0 && buf.length > KEEP_SIZE) buf = Buffer.allocUnsafeSlow(INITIAL_SIZE);
  return text;
}
function endBuffer(start) {
  const out = Buffer.allocUnsafe(pos - start);
  buf.copy(out, 0, start, pos);
  pos = start;
  if (start === 0 && buf.length > KEEP_SIZE) buf = Buffer.allocUnsafeSlow(INITIAL_SIZE);
  return out;
}
function abort(start) {
  pos = start;
}
function writeBytes(bytes) {
  const n = bytes.length;
  if (pos + n > buf.length) grow(n);
  for (let i = 0; i < n; i += 1) buf[pos + i] = bytes[i];
  pos += n;
}
function writeByte(byte) {
  if (pos === buf.length) grow(1);
  buf[pos] = byte;
  pos += 1;
}
function writeRaw(text) {
  const n = text.length;
  if (n < LONG_STRING) {
    if (pos + n * 3 > buf.length) grow(n * 3);
    let p = pos;
    for (let i = 0; i < n; i += 1) {
      const c = text.charCodeAt(i);
      if (c >= 128) {
        pos += buf.utf8Write(text, pos, buf.length - pos);
        return;
      }
      buf[p] = c;
      p += 1;
    }
    pos = p;
    return;
  }
  if (pos + n * 3 > buf.length) grow(n * 3);
  pos += buf.utf8Write(text, pos, buf.length - pos);
}
function writeNumberText(text) {
  const n = text.length;
  if (pos + n > buf.length) grow(n);
  for (let i = 0; i < n; i += 1) buf[pos + i] = text.charCodeAt(i);
  pos += n;
}
function writeEscapedUnit(p, c) {
  buf[p] = 92;
  switch (c) {
    case 34:
      buf[p + 1] = 34;
      return p + 2;
    case 92:
      buf[p + 1] = 92;
      return p + 2;
    case 8:
      buf[p + 1] = 98;
      return p + 2;
    case 12:
      buf[p + 1] = 102;
      return p + 2;
    case 10:
      buf[p + 1] = 110;
      return p + 2;
    case 13:
      buf[p + 1] = 114;
      return p + 2;
    case 9:
      buf[p + 1] = 116;
      return p + 2;
    default:
      buf[p + 1] = 117;
      buf[p + 2] = HEX.charCodeAt(c >> 12);
      buf[p + 3] = HEX.charCodeAt(c >> 8 & 15);
      buf[p + 4] = HEX.charCodeAt(c >> 4 & 15);
      buf[p + 5] = HEX.charCodeAt(c & 15);
      return p + 6;
  }
}
function writeString(text) {
  const n = text.length;
  if (n > LONG_STRING) {
    writeLongString(text);
    return;
  }
  if (pos + n * 6 + 2 > buf.length) grow(n * 6 + 2);
  let p = pos;
  buf[p] = 34;
  p += 1;
  for (let i = 0; i < n; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 128) {
      if (c >= 32 && c !== 34 && c !== 92) {
        buf[p] = c;
        p += 1;
      } else {
        p = writeEscapedUnit(p, c);
      }
    } else if (c < 2048) {
      buf[p] = 192 | c >> 6;
      buf[p + 1] = 128 | c & 63;
      p += 2;
    } else if (c < 55296 || c > 57343) {
      buf[p] = 224 | c >> 12;
      buf[p + 1] = 128 | c >> 6 & 63;
      buf[p + 2] = 128 | c & 63;
      p += 3;
    } else {
      const next = i + 1 < n ? text.charCodeAt(i + 1) : 0;
      if (c <= 56319 && next >= 56320 && next <= 57343) {
        const point = 65536 + (c - 55296 << 10) + (next - 56320);
        buf[p] = 240 | point >> 18;
        buf[p + 1] = 128 | point >> 12 & 63;
        buf[p + 2] = 128 | point >> 6 & 63;
        buf[p + 3] = 128 | point & 63;
        p += 4;
        i += 1;
      } else {
        p = writeEscapedUnit(p, c);
      }
    }
  }
  buf[p] = 34;
  pos = p + 1;
}
function writeLongString(text) {
  if (NEEDS_ESCAPE.test(text)) {
    writeRaw(JSON.stringify(text));
    return;
  }
  const n = text.length;
  if (pos + n * 3 + 2 > buf.length) grow(n * 3 + 2);
  buf[pos] = 34;
  pos += 1;
  pos += buf.utf8Write(text, pos, buf.length - pos);
  buf[pos] = 34;
  pos += 1;
}
function bytesOf(text) {
  return new Uint8Array(Buffer.from(text, "utf8"));
}

},
"@xufa/serializer/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/serializer","version":"0.1.0"};
},
"@xufa/template/index.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var template_exports = {};
__export(template_exports, {
  FILTERS: () => import_filters.FILTERS,
  SafeString: () => import_filters.SafeString,
  TemplateEngine: () => TemplateEngine,
  TemplateError: () => import_errors.TemplateError,
  compile: () => compile,
  escapeHtml: () => import_filters.escapeHtml,
  fill: () => fill,
  plugin: () => import_plugin.templatePlugin,
  render: () => render
});
module.exports = __toCommonJS(template_exports);
var import_expression = require("@xufa/expression");
var import_compiler = require("./lib/compiler.js");
var import_errors = require("./lib/errors.js");
var import_filters = require("./lib/filters.js");
var import_plugin = require("./lib/plugin.js");
const NO_ESCAPE = (text) => text;
class SourceCache {
  constructor(max) {
    this.max = max;
    this.sources = /* @__PURE__ */ new Map();
    this.size = 0;
  }
  get(source, key) {
    const keyed = this.sources.get(source);
    return keyed === void 0 ? void 0 : keyed.get(key);
  }
  set(source, key, compiled) {
    if (this.max <= 0) return;
    let keyed = this.sources.get(source);
    if (keyed === void 0) {
      keyed = /* @__PURE__ */ new Map();
      this.sources.set(source, keyed);
    }
    if (!keyed.has(key)) this.size += 1;
    keyed.set(key, compiled);
    while (this.size > this.max && this.sources.size > 1) {
      const [oldest, entries] = this.sources.entries().next().value;
      this.sources.delete(oldest);
      this.size -= entries.size;
    }
  }
  clear() {
    this.sources.clear();
    this.size = 0;
  }
}
class TemplateEngine {
  // `filters`: over the default ones; `globals` and `builtins`: those of the expressions (see @xufa/expression);
  // `escape`: true (HTML, the default), false, or a function of the text; `strict`: names not given and members of
  // null are errors (by default they are nothing); `partials`: sources by name; `maxDepth`: of partials in partials
  // (32); `cacheSize`: of templates kept (500); `inline`: false keeps paths ({{ user.name }}) as closures, not read in a
  // function made for the template (that is, with code generation off).
  constructor(options = {}) {
    this.options = options;
    this.inline = options.inline !== false && !options.strict;
    this.filters = { ...import_filters.FILTERS, ...options.filters };
    this.partials = new Map(Object.entries(options.partials || {}));
    this.loadPartial = options.loadPartial || null;
    this.maxDepth = options.maxDepth === void 0 ? 32 : options.maxDepth;
    this.cacheSize = options.cacheSize === void 0 ? 500 : options.cacheSize;
    const { escape = true } = options;
    if (escape === true) this.escapeFn = import_filters.escapeHtml;
    else if (escape === false) this.escapeFn = NO_ESCAPE;
    else if (typeof escape === "function") this.escapeFn = escape;
    else throw new TypeError("escape is true, false or a function");
    this.makeExpressions();
  }
  makeExpressions() {
    const { globals, builtins, strict } = this.options;
    this.expressions = new import_expression.Engine({
      globals,
      builtins,
      filters: this.filters,
      lenient: !strict,
      strict: Boolean(strict),
      cacheSize: 2e3
    });
    this.cache = new SourceCache(this.cacheSize);
    this.partialCache = /* @__PURE__ */ new Map();
    this.loadedCache = new SourceCache(this.cacheSize);
  }
  // A filter more (or another): templates compiled before are compiled again.
  filter(name, fn) {
    if (typeof fn !== "function") throw new TypeError("A filter is a function");
    this.filters[name] = fn;
    this.makeExpressions();
    return this;
  }
  // A partial: its source, by name ({{> name}}).
  partial(name, source) {
    if (typeof source !== "string") throw new TypeError("A partial is the source of a template");
    this.partials.set(name, source);
    this.partialCache.clear();
    return this;
  }
  partialOf(name, escape) {
    const mode = escape === this.escapeFn ? "e" : "r";
    const key = `${mode}:${name}`;
    let compiled = this.partialCache.get(key);
    if (compiled) return compiled;
    const registered = this.partials.get(name);
    if (registered !== void 0) {
      compiled = new import_compiler.TemplateCompiler(this, registered, { name, escape }).compile();
      this.partialCache.set(key, compiled);
      return compiled;
    }
    if (!this.loadPartial) return null;
    const source = this.loadPartial(name);
    if (source === void 0 || source === null) return null;
    compiled = this.loadedCache.get(source, key);
    if (!compiled) {
      compiled = new import_compiler.TemplateCompiler(this, source, { name, escape }).compile();
      this.loadedCache.set(source, key, compiled);
    }
    return compiled;
  }
  // The function of a template: render(context) gives its text. `options.name` names it in errors; `options.escape`
  // false writes values as they are.
  compile(source, options = {}) {
    if (typeof source !== "string") throw new TypeError("A template is a string");
    const escape = options.escape === false ? NO_ESCAPE : this.escapeFn;
    const key = `${escape === this.escapeFn ? "e" : "r"}:${options.name || ""}`;
    let compiled = this.cache.get(source, key);
    if (!compiled) {
      compiled = new import_compiler.TemplateCompiler(this, source, { name: options.name, escape }).compile();
      this.cache.set(source, key, compiled);
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
    if (typeof value === "string") {
      if (!value.includes("{{")) return value;
      const compiled = this.compile(value, { escape: false });
      return compiled.value ? compiled.value(context) : compiled(context);
    }
    if (Array.isArray(value)) return value.map((item) => this.fill(item, context));
    if (value !== null && typeof value === "object") {
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) return value;
      const result = {};
      Object.keys(value).forEach((key) => {
        const filled = this.fill(value[key], context);
        if (key === "__proto__") {
          Object.defineProperty(result, key, { value: filled, enumerable: true, writable: true, configurable: true });
        } else result[key] = filled;
      });
      return result;
    }
    return value;
  }
}
const engine = new TemplateEngine();
const compile = (source, options) => engine.compile(source, options);
const render = (source, context, options) => engine.render(source, context, options);
const fill = (value, context) => engine.fill(value, context);

},
"@xufa/template/lib/compiler.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var compiler_exports = {};
__export(compiler_exports, {
  TemplateCompiler: () => TemplateCompiler,
  stringify: () => stringify
});
module.exports = __toCommonJS(compiler_exports);
var import_expression = require("@xufa/expression");
var import_scanner = require("./scanner.js");
var import_errors = require("./errors.js");
var import_filters = require("./filters.js");
const NAME = /^[A-Za-z_$][\w$]*$/;
const PATH = /^[A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*|\s*\[\s*\d+\s*\])*$/;
const SIMPLE_PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const PATH_PART = /[A-Za-z_$][\w$]*|\[\s*(\d+)\s*\]/g;
const NOT_PATHS = /* @__PURE__ */ new Set(["true", "false", "null", "undefined"]);
const BLOCKS = /* @__PURE__ */ Symbol("xufa.template.blocks");
const EXTENDS = /^extends\s+(['"])([\w./-]+)\1\s*$/;
const EXTENDS_VALUE = /^extends\s+(?!['"])(\S.*)$/;
const BLOCK_NAME = /^[\w-]+$/;
const INLINE_AFTER = 16;
const { hasOwnProperty } = Object.prototype;
const isPlainObject = (value) => {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};
function stringify(value) {
  if (typeof value === "string") return value;
  if (value === null || value === void 0) return "";
  if (value instanceof import_filters.SafeString) return value.value;
  if (Array.isArray(value) || isPlainObject(value)) return JSON.stringify(value);
  return String(value);
}
function entriesOf(value) {
  if (value === null || value === void 0 || value === false) return [];
  if (Array.isArray(value)) return value.map((item, i) => [i, item]);
  if (value instanceof Map) return [...value];
  if (typeof value === "string" || typeof value[Symbol.iterator] === "function")
    return [...value].map((item, i) => [i, item]);
  if (typeof value === "object") return Object.entries(value);
  return [];
}
const BLOCK = /\bblock\b/;
const LOOP = /\bloop\b/;
function mayRead(nodes, name) {
  return nodes.some((node) => {
    switch (node.type) {
      case "text":
        return false;
      case "output":
        return name.test(node.source);
      case "if":
        return node.branches.some((branch) => name.test(branch.source) || mayRead(branch.nodes, name)) || Boolean(node.otherwise && mayRead(node.otherwise, name));
      case "each":
      case "with":
        return name.test(node.source) || mayRead(node.nodes, name) || Boolean(node.otherwise && mayRead(node.otherwise, name));
      default:
        return true;
    }
  });
}
function child(context, names) {
  const scope = Object.create(context);
  const keys = Object.keys(names);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (key === "__proto__") {
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
  error(message, position, code = "XUFA_TEMPLATE_ERR_SYNTAX", cause) {
    return new import_errors.TemplateError(message, { code, source: this.source, position, name: this.name, cause });
  }
  // An expression of a tag at `offset` of the template: its function; its errors as errors of the template, there.
  expression(text, offset) {
    let fn;
    try {
      fn = this.engine.expressions.compile(text);
    } catch (err) {
      if (err instanceof import_expression.ExpressionError) {
        const message = err.message.replace(/ \(line \d+, column \d+\)$/, "");
        throw this.error(
          message,
          offset + (err.position || 0),
          err.code === "XUFA_EXPR_ERR_FORBIDDEN" ? err.code : void 0
        );
      }
      throw err;
    }
    const compiler = this;
    return (context) => {
      try {
        return fn(context);
      } catch (err) {
        if (err instanceof import_expression.ExpressionError) {
          const message = err.message.replace(/ \(line \d+, column \d+\)$/, "");
          throw compiler.error(message, offset + (err.position || 0), "XUFA_TEMPLATE_ERR_RUNTIME", err);
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
    if (SIMPLE_PATH.test(text)) keys = text.split(".");
    else {
      if (!PATH.test(text)) return null;
      keys = [];
      PATH_PART.lastIndex = 0;
      for (let match = PATH_PART.exec(text); match !== null; match = PATH_PART.exec(text)) {
        keys.push(match[1] === void 0 ? match[0] : Number(match[1]));
      }
    }
    if (NOT_PATHS.has(keys[0]) || keys.some((key) => typeof key === "string" && import_expression.FORBIDDEN.has(key))) return null;
    return keys;
  }
  // What writes a value: escaped (escaped true) or as it is.
  converter(escaped) {
    const escape = escaped ? this.escape : null;
    if (!escape) return stringify;
    const html = escape === import_filters.escapeHtml;
    return (result) => {
      if (typeof result === "string") return escape(result);
      if (typeof result === "number" || typeof result === "boolean")
        return html ? String(result) : escape(String(result));
      return result instanceof import_filters.SafeString ? result.value : escape(stringify(result));
    };
  }
  // The value of a name of the context, or of the globals of the expressions (as expressions read names).
  reader() {
    const { globals } = this.engine.expressions;
    return (context, name) => {
      const value = context[name];
      if (value !== void 0 || name in context) return value;
      return hasOwnProperty.call(globals, name) ? globals[name] : void 0;
    };
  }
  // A list of nodes as one function of JavaScript: its texts, and its paths read inline (as members of null are
  // nothing in templates), joined with +; the other nodes are called (V). Nothing of the template is code there: texts
  // and names are JSON literals, and paths were checked. Null when functions cannot be made (code generation off).
  inlined(nodes, items) {
    if (!nodes.some((node) => node.type === "output" && this.pathOf(node.source))) return null;
    const parts = [];
    const values = [];
    const key = (part) => typeof part === "number" ? String(part) : JSON.stringify(part);
    nodes.forEach((node, i) => {
      if (node.type === "text") parts.push(JSON.stringify(node.text));
      else if (node.type === "output" && this.pathOf(node.source)) {
        const [first, ...rest] = this.pathOf(node.source);
        let read = `id(ctx, ${JSON.stringify(first)})`;
        if (rest.length) {
          read = `(t = ${read}) == null ? undefined : `;
          rest.forEach((part, j) => {
            read += j === rest.length - 1 ? `t[${key(part)}]` : `(t = t[${key(part)}]) == null ? undefined : `;
          });
        }
        parts.push(`${node.escape ? "o" : "s"}(${read})`);
      } else {
        values.push(items[i]);
        parts.push(`V[${values.length - 1}](ctx, depth)`);
      }
    });
    try {
      const make = new Function(
        "V",
        "o",
        "s",
        "id",
        `return function inlined(ctx, depth) { let t; return ${parts.join(" + ")}; };`
      );
      return make(values, this.converter(true), this.converter(false), this.reader());
    } catch {
      return null;
    }
  }
  checkName(name, position) {
    if (!NAME.test(name) || import_expression.FORBIDDEN.has(name)) throw this.error(`${name} cannot be a name`, position);
  }
  // The tree: { nodes } of the template, and whether it is one expression alone (its value: fill()).
  build() {
    const parts = (0, import_scanner.scan)(this.source, this.name);
    const root = { type: "root", nodes: [] };
    const stack = [root];
    const top = () => stack[stack.length - 1];
    this.parent = null;
    this.blocks = /* @__PURE__ */ new Map();
    let tags = 0;
    parts.forEach((part) => {
      const block = top();
      const target = block.otherwise || block.current || block.nodes;
      if (part.kind !== "comment" && !(part.kind === "text" && !part.text.trim())) tags += 1;
      switch (part.kind) {
        case "text":
          target.push({ type: "text", text: part.text });
          break;
        case "comment":
          break;
        case "output":
        case "raw":
          if (!part.body) throw this.error("Empty tag", part.position);
          if (part.kind === "output" && (EXTENDS.test(part.body) || EXTENDS_VALUE.test(part.body))) {
            if (tags !== 1) throw this.error("{{extends 'name'}} is the first tag of a template", part.position);
            const literal = EXTENDS.exec(part.body);
            if (literal) [, , this.parent] = literal;
            else {
              const [, source] = EXTENDS_VALUE.exec(part.body);
              this.parent = { value: this.expression(source, part.start + part.body.indexOf(source)), source };
            }
            break;
          }
          target.push({
            type: "output",
            value: this.expression(part.body, part.start),
            source: part.body,
            escape: part.kind === "output"
          });
          break;
        case "#":
          stack.push(this.open(part, target));
          break;
        case "else":
          this.otherwise(part, block);
          break;
        case "/": {
          const name = part.body.slice(1).trim();
          if (block.type === "root") throw this.error(`{{/${name}}} closes no block`, part.position);
          const closes = block.type === "block" ? name === "block" || name === `block ${block.name}` : name === block.type;
          if (!closes) throw this.error(`{{/${name}}} closes {{#${block.type}}}`, part.position);
          stack.pop();
          break;
        }
        case ">":
          target.push(this.partial(part));
          break;
        default:
      }
    });
    if (stack.length > 1) {
      const open = top();
      throw this.error(`{{#${open.type}}} is not closed`, open.position);
    }
    const single = parts.length === 1 && (parts[0].kind === "output" || parts[0].kind === "raw") ? root.nodes[0] : null;
    return { nodes: root.nodes, single };
  }
  open(part, target) {
    const body = part.body.slice(1);
    const match = /^\s*([a-z]+)\b/.exec(body);
    if (!match) throw this.error("Expected a block: {{#if}}, {{#each}} or {{#with}}", part.position);
    const keyword = match[1];
    const offset = part.start + 1 + match[0].length;
    const rest = body.slice(match[0].length);
    const restOffset = offset + (rest.length - rest.trimStart().length);
    const expression = rest.trim();
    if (!expression) throw this.error(`{{#${keyword}}} needs an expression`, part.position);
    if (keyword === "block") {
      if (!BLOCK_NAME.test(expression)) throw this.error(`${expression} cannot be the name of a block`, part.position);
      if (this.blocks.has(expression)) throw this.error(`Two blocks named ${expression}`, part.position);
      const node = { type: "block", name: expression, position: part.position, nodes: [], otherwise: null };
      this.blocks.set(expression, node);
      target.push(node);
      return node;
    }
    if (keyword === "if") {
      const node = { type: "if", position: part.position, branches: [], otherwise: null };
      node.branches.push({ test: this.expression(expression, restOffset), source: expression, nodes: [] });
      node.current = node.branches[0].nodes;
      target.push(node);
      return node;
    }
    if (keyword === "each" || keyword === "with") {
      const names = /\s+as\s+([A-Za-z_$][\w$]*)(?:\s*,\s*([A-Za-z_$][\w$]*))?\s*$/.exec(expression);
      if (keyword === "with" && (!names || names[2]))
        throw this.error("{{#with value as name}} needs one name", part.position);
      const source = names ? expression.slice(0, names.index) : expression;
      const item = names ? names[1] : "item";
      const key = names ? names[2] || null : null;
      this.checkName(item, part.position);
      if (key) this.checkName(key, part.position);
      const node = {
        type: keyword,
        position: part.position,
        value: this.expression(source, restOffset),
        source,
        item,
        key,
        nodes: [],
        otherwise: null
      };
      target.push(node);
      return node;
    }
    throw this.error(`Unknown block {{#${keyword}}} (if, each, with, block)`, part.position);
  }
  otherwise(part, block) {
    const match = /^else(?:\s+if\s+([\s\S]+))?$/.exec(part.body);
    if (!match) throw this.error("Expected {{else}} or {{else if condition}}", part.position);
    if (block.type === "if") {
      if (block.otherwise) throw this.error("{{else}} after {{else}}", part.position);
      if (match[1]) {
        const offset = part.start + part.body.indexOf(match[1]);
        const branch = { test: this.expression(match[1], offset), source: match[1], nodes: [] };
        block.branches.push(branch);
        block.current = branch.nodes;
      } else block.otherwise = [];
      return;
    }
    if (block.type === "each" && !match[1] && !block.otherwise) {
      block.otherwise = [];
      return;
    }
    throw this.error("{{else}} out of {{#if}} or {{#each}}", part.position);
  }
  // The closure of the contents of a block (made once), and whether they may read `block` (block.super): those that
  // do not are rendered on the context as it is, with no block of their own.
  contentOf(node) {
    if (!node.content) {
      node.content = this.render(node.nodes);
      node.content.readsBlock = mayRead(node.nodes, BLOCK);
    }
    return node.content;
  }
  partial(part) {
    const match = /^>\s*([\w./-]+)\s*([\s\S]*)$/.exec(part.body);
    if (!match) throw this.error("Expected {{> name}} or {{> name context}}", part.position);
    const [, name, rest] = match;
    const value = rest ? this.expression(rest, part.start + part.body.indexOf(rest, 1 + name.length)) : null;
    return { type: "partial", name, value, position: part.position };
  }
  // The closure of a list of nodes: it gives their text. Texts are joined with +, which V8 makes cheap (ropes, flattened
  // once); an array joined at the end costs more than the rest of a short template.
  render(nodes) {
    const items = nodes.map((node) => this.renderNode(node));
    const closures = this.joined(items);
    if (!this.engine.inline || !nodes.some((node) => node.type === "output")) return closures;
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
        return () => "";
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
          let text = "";
          for (let i = 0; i < items.length; i += 1) text += items[i](context, depth);
          return text;
        };
    }
  }
  renderNode(node) {
    switch (node.type) {
      case "text": {
        const { text } = node;
        return () => text;
      }
      case "output": {
        const { value } = node;
        const convert = this.converter(node.escape);
        return (context) => convert(value(context));
      }
      case "if": {
        const branches = node.branches.map((branch) => ({ test: branch.test, body: this.render(branch.nodes) }));
        const otherwise = node.otherwise ? this.render(node.otherwise) : null;
        return (context, depth) => {
          for (let i = 0; i < branches.length; i += 1) {
            if (branches[i].test(context)) return branches[i].body(context, depth);
          }
          return otherwise ? otherwise(context, depth) : "";
        };
      }
      case "each": {
        const body = this.render(node.nodes);
        const otherwise = node.otherwise ? this.render(node.otherwise) : null;
        const { value, item, key } = node;
        const readsLoop = mayRead(node.nodes, LOOP);
        return (context, depth) => {
          const list = value(context);
          const isList = Array.isArray(list);
          const entries = isList ? list : entriesOf(list);
          const { length } = entries;
          if (length === 0) return otherwise ? otherwise(context, depth) : "";
          let text = "";
          const scope = Object.create(context);
          const loop = readsLoop ? { index: 0, number: 1, first: true, last: false, length, key: null } : null;
          if (loop) scope.loop = loop;
          for (let i = 0; i < length; i += 1) {
            const entryKey = isList ? i : entries[i][0];
            if (loop) {
              loop.index = i;
              loop.number = i + 1;
              loop.first = i === 0;
              loop.last = i === length - 1;
              loop.key = entryKey;
            }
            scope[item] = isList ? entries[i] : entries[i][1];
            if (key) scope[key] = entryKey;
            text += body(scope, depth);
          }
          return text;
        };
      }
      case "with": {
        const body = this.render(node.nodes);
        const { value, item } = node;
        return (context, depth) => body(child(context, { [item]: value(context) }), depth);
      }
      case "block": {
        const own = this.contentOf(node);
        const { name } = node;
        return (context, depth) => {
          const given = context[BLOCKS] && context[BLOCKS][name];
          if (!given && !own.readsBlock) return own(context, depth);
          const chain = given ? given.includes(own) ? given : [...given, own] : [own];
          if (!chain[0].readsBlock) return chain[0](context, depth);
          const at = (index) => {
            const block = {
              get super() {
                return new import_filters.SafeString(index + 1 < chain.length ? at(index + 1) : "");
              }
            };
            return chain[index](child(context, { block }), depth);
          };
          return at(0);
        };
      }
      case "partial": {
        const { engine } = this;
        const { name, value, position } = node;
        const compiler = this;
        return (context, depth) => {
          if (depth >= engine.maxDepth) {
            throw compiler.error(
              `Partials deeper than ${engine.maxDepth} (${name})`,
              position,
              "XUFA_TEMPLATE_ERR_PARTIAL"
            );
          }
          const partial = engine.partialOf(name, compiler.escape);
          if (!partial) throw compiler.error(`Unknown partial ${name}`, position, "XUFA_TEMPLATE_ERR_PARTIAL");
          let scope = context;
          if (value) {
            const given = value(context);
            scope = given && typeof given === "object" ? child(context, given) : context;
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
    const hot = { renders: 0 };
    this.hot = hot;
    const inner = this.parent ? this.extending() : this.render(nodes);
    const text = (context, depth) => {
      hot.renders += 1;
      return inner(context, depth);
    };
    const render = (context) => text(context === null || context === void 0 ? {} : context, 0);
    render.text = text;
    if (single) render.value = (context) => single.value(context === null || context === void 0 ? {} : context);
    Object.defineProperty(render, "source", { value: this.source });
    let streamer = null;
    render.stream = (context, options = {}) => {
      if (!streamer) streamer = this.parent ? streamWhole(inner) : this.streamNodes(nodes);
      hot.renders += 1;
      return chunksOf(streamer, context === null || context === void 0 ? {} : context, options.chunkSize || CHUNK);
    };
    return render;
  }
  // A template that extends another: the one it extends (found as partials are, by its name), rendered with the blocks
  // of this one after those of the templates that extend this one (the nearest first).
  extending() {
    const { engine, parent } = this;
    const compiler = this;
    const own = [...this.blocks.values()].map((node) => [node.name, this.contentOf(node)]);
    return (context, depth) => {
      const name = typeof parent === "string" ? parent : parent.value(context);
      if (typeof name !== "string" || name === "") {
        throw compiler.error(
          `{{extends ${parent.source}}} gives no name of a template (${typeof name})`,
          0,
          "XUFA_TEMPLATE_ERR_PARTIAL"
        );
      }
      if (depth >= engine.maxDepth) {
        throw compiler.error(`Templates deeper than ${engine.maxDepth} (${name})`, 0, "XUFA_TEMPLATE_ERR_PARTIAL");
      }
      const base = engine.partialOf(name, compiler.escape);
      if (!base) throw compiler.error(`Unknown template ${name} to extend`, 0, "XUFA_TEMPLATE_ERR_PARTIAL");
      const blocks = { ...context[BLOCKS] };
      for (const [name2, content] of own) blocks[name2] = blocks[name2] ? [...blocks[name2], content] : [content];
      const scope = Object.create(context);
      scope[BLOCKS] = blocks;
      return base.text(scope, depth + 1);
    };
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
    if (node.type === "if") {
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
    if (node.type === "each") {
      const otherwise = node.otherwise ? this.streamNodes(node.otherwise) : null;
      const { value, item, key } = node;
      if (!hasEach(node.nodes)) {
        const text2 = this.render(node.nodes);
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
            chunk += text2(scope, depth);
            if (chunk.length >= chunkSize) {
              state.text = "";
              yield chunk;
              chunk = "";
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
        state.text = "";
        yield chunk;
      }
    };
  }
}
function hasEach(nodes) {
  return nodes.some(
    (node) => node.type === "each" || node.type === "if" && (node.branches.some((branch) => hasEach(branch.nodes)) || hasEach(node.otherwise || [])) || node.type === "with" && hasEach(node.nodes)
  );
}
const CHUNK = 65536;
function streamWhole(text) {
  return function* streamText(context, depth, state) {
    state.text += text(context, depth);
    while (state.text.length >= state.chunkSize) {
      yield state.text.slice(0, state.chunkSize);
      state.text = state.text.slice(state.chunkSize);
    }
  };
}
function* chunksOf(streamer, context, chunkSize) {
  const state = { text: "", chunkSize };
  yield* streamer(context, 0, state);
  if (state.text) yield state.text;
}

},
"@xufa/template/lib/errors.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var errors_exports = {};
__export(errors_exports, {
  TemplateError: () => TemplateError
});
module.exports = __toCommonJS(errors_exports);
var import_expression = require("@xufa/expression");
class TemplateError extends Error {
  constructor(message, { code = "XUFA_TEMPLATE_ERR_SYNTAX", source, position, name, cause } = {}) {
    const at = source !== void 0 && position !== void 0 ? (0, import_expression.locate)(source, position) : null;
    const where = [name, at && `line ${at.line}, column ${at.column}`].filter(Boolean).join(", ");
    super(where ? `${message} (${where})` : message, cause ? { cause } : void 0);
    this.name = "TemplateError";
    this.code = code;
    if (name) this.template = name;
    if (at) {
      this.position = position;
      this.line = at.line;
      this.column = at.column;
    }
  }
}

},
"@xufa/template/lib/filters.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var filters_exports = {};
__export(filters_exports, {
  FILTERS: () => FILTERS,
  SafeString: () => SafeString,
  escapeHtml: () => escapeHtml
});
module.exports = __toCommonJS(filters_exports);
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
function escapeHtml(value) {
  const text2 = String(value);
  const first = text2.search(UNSAFE);
  if (first === -1) return text2;
  let result = "";
  let last = 0;
  for (let i = first; i < text2.length; i += 1) {
    let entity;
    switch (text2.charCodeAt(i)) {
      case 38:
        entity = "&amp;";
        break;
      case 60:
        entity = "&lt;";
        break;
      case 62:
        entity = "&gt;";
        break;
      case 34:
        entity = "&quot;";
        break;
      case 39:
        entity = "&#39;";
        break;
      case 96:
        entity = "&#96;";
        break;
      default:
        continue;
    }
    if (last !== i) result += text2.slice(last, i);
    result += entity;
    last = i + 1;
  }
  return last === text2.length ? result : result + text2.slice(last);
}
const isEmpty = (value) => value === null || value === void 0 || value === "";
const text = (value) => value === null || value === void 0 ? "" : String(value);
const listOf = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [...value];
  if (value && typeof value[Symbol.iterator] === "function") return [...value];
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
  default: (value, fallback = "") => isEmpty(value) ? fallback : value,
  json: (value, indent) => JSON.stringify(value, null, indent),
  join: (value, separator = ", ") => listOf(value).join(separator),
  length: (value) => {
    if (value === null || value === void 0) return 0;
    if (typeof value === "string" || Array.isArray(value)) return value.length;
    if (value instanceof Map || value instanceof Set) return value.size;
    if (typeof value[Symbol.iterator] === "function") return listOf(value).length;
    return typeof value === "object" ? Object.keys(value).length : 0;
  },
  first: (value) => listOf(value)[0],
  last: (value) => {
    const list = listOf(value);
    return list[list.length - 1];
  },
  reverse: (value) => typeof value === "string" ? [...value].reverse().join("") : [...listOf(value)].reverse(),
  slice: (value, start, end) => typeof value === "string" ? value.slice(start, end) : listOf(value).slice(start, end),
  keys: (value) => value && typeof value === "object" ? Object.keys(value) : [],
  values: (value) => value && typeof value === "object" ? Object.values(value) : [],
  truncate: (value, length = 80, end = "\u2026") => {
    const string = text(value);
    return string.length > length ? string.slice(0, Math.max(0, length - end.length)) + end : string;
  },
  replace: (value, search, replacement = "") => text(value).split(String(search)).join(String(replacement)),
  round: (value, digits = 0) => {
    const factor = 10 ** digits;
    return Math.round(Number(value) * factor) / factor;
  },
  fixed: (value, digits = 0) => Number(value).toFixed(digits),
  number: (value, locale, options) => new Intl.NumberFormat(locale, options).format(value),
  date: (value, locale, options) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(locale, options).format(date);
  },
  urlencode: (value) => encodeURIComponent(text(value)),
  escape: (value) => new SafeString(escapeHtml(text(value))),
  safe: (value) => new SafeString(text(value))
};

},
"@xufa/template/lib/plugin.js": function (module, exports, require) {
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var plugin_exports = {};
__export(plugin_exports, {
  templatePlugin: () => templatePlugin
});
module.exports = __toCommonJS(plugin_exports);
var import_node_fs = __toESM(require("node:fs"));
var import_promises = __toESM(require("node:fs/promises"));
var import_node_path = __toESM(require("node:path"));
var import_node_diagnostics_channel = __toESM(require("node:diagnostics_channel"));
var import_node_crypto = require("node:crypto");
var import_node_stream = require("node:stream");
var import_errors = require("./errors.js");
var import_filters = require("./filters.js");
var indexModule = __toESM(require("../index.js"));
const RENDERS = import_node_diagnostics_channel.default.channel("xufa:template:render");
const MAX_NAMES = 1e3;
const LAZY_NAMES = /* @__PURE__ */ new Set(["csrfToken", "messages"]);
function copyNames(target, source) {
  if (!source) return target;
  for (const key of Object.keys(source)) {
    if (LAZY_NAMES.has(key) || key === "__proto__") {
      const { get, value } = Object.getOwnPropertyDescriptor(source, key);
      Object.defineProperty(
        target,
        key,
        get ? { get, enumerable: true, configurable: true } : { value, enumerable: true, writable: true, configurable: true }
      );
    } else target[key] = source[key];
  }
  return target;
}
const withNames = (context, names) => copyNames(copyNames({}, context), names);
function templatePlugin(app, options, done) {
  const { TemplateEngine } = indexModule;
  const {
    root = "views",
    extension = ".html",
    layout = null,
    defaultContext = {},
    cache = process.env.NODE_ENV === "production",
    propertyName = "view",
    stream = false,
    context = [],
    builtins = true,
    chunkSize = 65536,
    engine: given,
    ...engineOptions
  } = options;
  const bases = [].concat(root).map((folder) => import_node_path.default.resolve(folder));
  const files = /* @__PURE__ */ new Map();
  const sources = /* @__PURE__ */ new Map();
  const findFiles = (name) => {
    if (typeof name !== "string" || name === "" || name.includes("\0") || import_node_path.default.isAbsolute(name)) return [];
    const candidates = [];
    for (const base of bases) {
      const file = import_node_path.default.resolve(base, import_node_path.default.extname(name) ? name : `${name}${extension}`);
      const relative = import_node_path.default.relative(base, file);
      if (relative === "" || relative.startsWith("..") || import_node_path.default.isAbsolute(relative)) return [];
      candidates.push(file);
    }
    return candidates;
  };
  const candidatesByName = /* @__PURE__ */ new Map();
  const filesOf = (name) => {
    if (typeof name !== "string") return findFiles(name);
    let candidates = candidatesByName.get(name);
    if (candidates === void 0) {
      candidates = findFiles(name);
      if (candidatesByName.size >= MAX_NAMES) candidatesByName.clear();
      candidatesByName.set(name, candidates);
    }
    return candidates;
  };
  const remember = (name, source) => {
    if (cache && typeof name === "string") {
      if (sources.size >= MAX_NAMES) sources.clear();
      sources.set(name, source);
    }
    return source;
  };
  const notFound = (name, cause) => {
    const where = bases.length === 1 ? root : bases.join(", ");
    const err = new import_errors.TemplateError(`No view ${name} in ${where}`, { code: "XUFA_TEMPLATE_ERR_NOT_FOUND", cause });
    err.statusCode = 500;
    return err;
  };
  async function read(name) {
    if (cache) {
      const known = sources.get(name);
      if (known !== void 0) return known;
    }
    const candidates = filesOf(name);
    if (!candidates.length) throw notFound(name);
    let last;
    for (const file of candidates) {
      if (cache && files.has(file)) return remember(name, files.get(file));
      try {
        const source = await import_promises.default.readFile(file, "utf8");
        if (cache) files.set(file, source);
        return remember(name, source);
      } catch (err) {
        last = err;
      }
    }
    throw notFound(name, last);
  }
  function readPartial(name) {
    if (cache) {
      const known = sources.get(name);
      if (known !== void 0) return known;
    }
    for (const file of filesOf(name)) {
      if (cache && files.has(file)) return remember(name, files.get(file));
      try {
        const source = import_node_fs.default.readFileSync(file, "utf8");
        if (cache) files.set(file, source);
        return remember(name, source);
      } catch {
      }
    }
    return void 0;
  }
  const processors = [].concat(context);
  for (const fn of processors) {
    if (typeof fn !== "function") {
      done(new import_errors.TemplateError("context of the templates is a function of (request, reply), or a list of them"));
      return;
    }
  }
  const helpers = /* @__PURE__ */ new WeakMap();
  function helpersOf(server) {
    let made = helpers.get(server);
    if (!made) {
      made = {
        url: typeof server.reverse === "function" ? (name, ...params) => server.reverse(name, params) : void 0,
        staticUrl: typeof server.staticUrl === "function" ? (file) => server.staticUrl(file) : void 0
      };
      helpers.set(server, made);
    }
    return made;
  }
  function builtinsOf(request) {
    const server = request.server;
    const session = request.session;
    const { url } = request;
    const at = url.indexOf("?");
    const values = {
      request: { path: at === -1 ? url : url.slice(0, at), url, query: request.query, method: request.method }
    };
    const { url: reverse, staticUrl } = helpersOf(server);
    if (reverse) values.url = reverse;
    if (staticUrl) values.staticUrl = staticUrl;
    if (session && typeof session.csrfToken === "function") {
      Object.defineProperty(values, "csrfToken", { enumerable: true, get: () => session.csrfToken() });
    }
    if (session && typeof session.messages === "function") {
      let read2 = null;
      Object.defineProperty(values, "messages", {
        enumerable: true,
        get: () => {
          if (read2 === null) read2 = session.messages();
          return read2;
        }
      });
    }
    return values;
  }
  async function contextOf(reply) {
    const request = reply.request;
    if (!request) return reply.locals;
    const values = builtins ? builtinsOf(request) : {};
    for (const fn of processors) Object.assign(values, await fn(request, reply));
    return Object.assign(values, reply.locals);
  }
  const engine = given || new TemplateEngine({ ...engineOptions, loadPartial: readPartial });
  if (given && !given.loadPartial) given.loadPartial = readPartial;
  async function prepare(name, data, callOptions = {}, locals, reply = null) {
    const context2 = copyNames(copyNames({ ...defaultContext }, locals), data);
    if (reply && RENDERS.hasSubscribers) RENDERS.publish({ request: reply.request, reply, name, context: context2 });
    const page = engine.compile(await read(name), { name });
    const outer = callOptions.layout === void 0 ? layout : callOptions.layout;
    const frame = outer ? engine.compile(await read(outer), { name: outer }) : null;
    return { page, frame, context: context2 };
  }
  async function render(name, data, callOptions, locals, reply) {
    const { page, frame, context: context2 } = await prepare(name, data, callOptions, locals, reply);
    if (!frame) return page(context2);
    return frame(withNames(context2, { body: new import_filters.SafeString(page(context2)) }));
  }
  function* chunks({ page, frame, context: context2 }) {
    if (!frame) {
      yield* page.stream(context2, { chunkSize });
      return;
    }
    const marker = `\0xufa-body-${(0, import_node_crypto.randomUUID)()}\0`;
    const outer = frame(withNames(context2, { body: new import_filters.SafeString(marker) }));
    const at = outer.indexOf(marker);
    if (at === -1 || outer.indexOf(marker, at + 1) !== -1) {
      yield frame(withNames(context2, { body: new import_filters.SafeString(page(context2)) }));
      return;
    }
    yield outer.slice(0, at);
    yield* page.stream(context2, { chunkSize });
    yield outer.slice(at + marker.length);
  }
  app.decorate(propertyName, (name, data, callOptions) => render(name, data, callOptions));
  app.decorate("viewContext", (fn) => {
    if (typeof fn !== "function") throw new import_errors.TemplateError("viewContext(fn): fn is a function of (request, reply)");
    processors.push(fn);
  });
  const hasByName = /* @__PURE__ */ new Map();
  app.decorate(`has${propertyName.charAt(0).toUpperCase()}${propertyName.slice(1)}`, (name) => {
    if (cache && typeof name === "string") {
      const known = hasByName.get(name);
      if (known !== void 0) return known;
    }
    const found = filesOf(name).some((file) => cache && files.has(file) || import_node_fs.default.existsSync(file));
    if (cache && typeof name === "string") {
      if (hasByName.size >= MAX_NAMES) hasByName.clear();
      hasByName.set(name, found);
    }
    return found;
  });
  if (!app.hasReplyDecorator("locals")) app.decorateReply("locals", null);
  app.decorateReply(`${propertyName}Async`, async function viewAsync(name, data, callOptions) {
    return render(name, data, callOptions, await contextOf(this), this);
  });
  app.decorateReply(propertyName, function view(name, data, callOptions = {}) {
    const streamed = callOptions.stream === void 0 ? stream : callOptions.stream;
    const sent = contextOf(this).then(
      (locals) => streamed ? prepare(name, data, callOptions, locals, this).then(
        (view2) => import_node_stream.Readable.from(chunks(view2), { objectMode: false })
      ) : render(name, data, callOptions, locals, this)
    );
    sent.then(
      (body) => {
        if (!this.hasHeader("content-type")) this.type("text/html; charset=utf-8");
        this.send(body);
      },
      (err) => this.send(err)
    );
    return this;
  });
  done();
}
templatePlugin[/* @__PURE__ */ Symbol.for("skip-override")] = true;
templatePlugin[/* @__PURE__ */ Symbol.for("fastify.display-name")] = "@xufa/template";

},
"@xufa/template/lib/scanner.js": function (module, exports, require) {
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var scanner_exports = {};
__export(scanner_exports, {
  scan: () => scan
});
module.exports = __toCommonJS(scanner_exports);
var import_errors = require("./errors.js");
function endOf(source, i, close, name, tag = i) {
  let depth = 0;
  let j = i;
  while (j < source.length) {
    const char = source[j];
    if (char === '"' || char === "'") {
      j = skipString(source, j, name);
      continue;
    }
    if (char === "`") {
      j = skipTemplate(source, j, name);
      continue;
    }
    if (depth === 0 && (source.startsWith(close, j) || source.startsWith(`~${close}`, j))) return j;
    if (char === "{") depth += 1;
    else if (char === "}") depth = Math.max(0, depth - 1);
    j += 1;
  }
  throw new import_errors.TemplateError(`Unclosed tag (expected ${close})`, { source, position: tag, name });
}
function skipString(source, i, name) {
  const quote = source[i];
  let j = i + 1;
  while (j < source.length && source[j] !== quote) {
    if (source[j] === "\\") j += 1;
    else if (source[j] === "\n") break;
    j += 1;
  }
  if (source[j] !== quote) throw new import_errors.TemplateError("Unterminated string", { source, position: i, name });
  return j + 1;
}
function skipTemplate(source, i, name) {
  let j = i + 1;
  while (j < source.length && source[j] !== "`") {
    if (source[j] === "\\") j += 2;
    else if (source[j] === "$" && source[j + 1] === "{") {
      j = endOf(source, j + 2, "}", name) + 1;
    } else j += 1;
  }
  if (source[j] !== "`") throw new import_errors.TemplateError("Unterminated template literal", { source, position: i, name });
  return j + 1;
}
function scan(source, name) {
  const parts = [];
  let text = "";
  let i = 0;
  let trimNext = false;
  const pushText = () => {
    if (text) parts.push({ kind: "text", text });
    text = "";
  };
  while (i < source.length) {
    const open = source.indexOf("{{", i);
    if (open === -1) {
      text += source.slice(i);
      break;
    }
    if (open > 0 && source[open - 1] === "\\") {
      text += `${source.slice(i, open - 1)}{{`;
      i = open + 2;
      continue;
    }
    text += source.slice(i, open);
    if (trimNext) {
      text = text.replace(/^\s+/, "");
      trimNext = false;
    }
    let j = open + 2;
    const raw = source[j] === "{";
    if (raw) j += 1;
    if (source[j] === "~") {
      text = text.replace(/\s+$/, "");
      j += 1;
    }
    pushText();
    let kind;
    let body;
    let end;
    if (!raw && source.startsWith("!--", j)) {
      end = source.indexOf("--", j + 3);
      while (end !== -1 && !/^--~?}}/.test(source.slice(end, end + 5))) end = source.indexOf("--", end + 1);
      if (end === -1) throw new import_errors.TemplateError("Unclosed comment", { source, position: open, name });
      kind = "comment";
      body = "";
      end += 2;
    } else if (!raw && source[j] === "!") {
      end = source.indexOf("}}", j);
      if (end === -1) throw new import_errors.TemplateError("Unclosed comment", { source, position: open, name });
      if (source[end - 1] === "~") end -= 1;
      kind = "comment";
      body = "";
    } else {
      end = endOf(source, j, raw ? "}}}" : "}}", name, open);
      body = source.slice(j, end);
      kind = raw ? "raw" : "output";
      const marker = body.trimStart()[0];
      if (!raw && (marker === "#" || marker === "/" || marker === ">")) kind = marker;
      if (!raw && /^\s*else\b/.test(body)) kind = "else";
    }
    const start = j + (body.length - body.trimStart().length);
    parts.push({ kind, body: body.trim(), start, position: open });
    if (source[end] === "~") {
      trimNext = true;
      end += 1;
    }
    i = end + (raw ? 3 : 2);
  }
  if (trimNext) text = text.replace(/^\s+/, "");
  pushText();
  return parts;
}

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
"node:diagnostics_channel": function (module, exports, require) {

var channel = function () { return { hasSubscribers: false, publish: function () {}, subscribe: function () {}, unsubscribe: function () {} }; };
module.exports = { channel: channel, subscribe: function () {}, unsubscribe: function () {}, hasSubscribers: function () { return false; } };
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
"node:module": function (module, exports, require) {

module.exports = {
  createRequire: function (from) {
    return function (request) { return required(resolve(from, request)); };
  },
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
  var mains = {"@xufa/schema":"@xufa/schema/index.js","@xufa/expression":"@xufa/expression/index.js","@xufa/template":"@xufa/template/index.js","@xufa/yaml":"@xufa/yaml/index.js","@xufa/marshal":"@xufa/marshal/index.js","@xufa/router":"@xufa/router/index.js","@xufa/serializer":"@xufa/serializer/index.js"};
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
  // What require() gives: of an ES module, its 'module.exports' export when it has one.
  function required(id) {
    var value = load(id);
    return value && value.__esModule && Object.prototype.hasOwnProperty.call(value, 'module.exports')
      ? value['module.exports']
      : value;
  }
  function main(name) {
    return required(mains[name]);
  }
  root.xufa = {
    schema: main('@xufa/schema'),
    expression: main('@xufa/expression'),
    template: main('@xufa/template'),
    yaml: main('@xufa/yaml'),
    marshal: main('@xufa/marshal'),
    router: main('@xufa/router'),
    serializer: main('@xufa/serializer'),
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
