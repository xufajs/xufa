// Ways out of the sandbox, tried on programs as closures and as one function of JavaScript: none may give a function
// that makes code (Function, eval), the process, the global object or a module of Node, pollute a prototype, or change
// what the engine guards. Each is refused, or runs to a harmless value.
import { Engine, ExpressionError } from '../index.js';

const ATTACKS = {
  'constructor by name': '[].map.constructor("return process")()',
  'constructor computed': '[]["con" + "structor"]',
  'constructor by a key object': 'const k = { toString: () => "constructor" }; [][k]',
  'constructor by a key that changes':
    'let n = 0; const k = { toString: () => (n++ ? "constructor" : "x") }; [].map[k]',
  'constructor by an array key': 'const k = ["constructor"]; [][k]',
  'constructor by char codes': '""[String.fromCharCode(99,111,110,115,116,114,117,99,116,111,114)]',
  '__proto__ read': '({}).__proto__',
  '__proto__ computed': '({})["__" + "proto__"]',
  'pollution by assignment': 'const o = {}; o["__proto__"].polluted = 1',
  'pollution by a literal key': 'const o = { ["__proto__"]: { polluted: 1 } }; o.polluted',
  'pollution by JSON.parse': 'JSON.parse(\'{"__proto__": {"polluted": 1}}\'); ({}).polluted',
  'prototype of a function': '(() => 1).prototype',
  arguments: 'function f() { return arguments } f()',
  caller: 'function f() { return f.caller } f()',
  this: 'this',
  globalThis: 'globalThis',
  process: 'process',
  require: 'require("fs")',
  'import()': 'import("fs")',
  eval: 'eval("1")',
  'Function global': 'Function("return 1")',
  'new Function': 'new Function("return 1")',
  'new of a value': 'const F = [].map; new F()',
  Reflect: 'Reflect.getPrototypeOf({})',
  Symbol: 'Symbol.iterator',
  'Object.getPrototypeOf': 'Object.getPrototypeOf({})',
  'Object.values of a function': 'Object.values(() => 1)',
  'Math changed': 'Math.max = () => 1',
  'Math changed by delete': 'delete Math.max',
  'JSON changed': 'JSON.parse = null',
  'Date constructor': 'new Date().constructor',
  'Map prototype of its iterator': 'new Map().entries().__proto__',
  'constructor of a caught error': 'try { null.x } catch (e) { e.constructor }',
  'Function of a caught error': 'try { null.x } catch (e) { e["constructor"]["constructor"]("return process")() }',
  'Error.prepareStackTrace': 'Error.prepareStackTrace = (e, s) => s',
  'Error.captureStackTrace': 'const o = {}; Error.captureStackTrace(o); o',
  'getter of a literal': '({ get x() { return 1 } }).x',
  class: 'class A {}',
  with: 'with ({}) {}',
  'apply of apply': '[].map.apply.apply',
  'constructor of bind': '(() => 1).bind.constructor',
  'Function.prototype': 'Function.prototype.call.call',
  'constructor of a regular expression': '/a/.constructor',
  'write to a Date': 'const d = new Date(); d.x = 1',
  'write to a Map': 'const m = new Map(); m.x = 1',
  'write to a function': 'const f = () => 1; f.x = 1',
  'write to what a global reaches': 'const o = Object; o.keys = 1',
  'this of a reviver': 'JSON.parse("{\\"a\\":1}", function (k, v) { return v })',
  'names of the generated code':
    'let v1 = 1; let st = 0; let MX = 1; let ctx = 1; WR = 1; LIM = 1; K = 1; B = 1; v1 + st',
  'quotes in keys': 'o["\\"]; process.exit(); //"] = 1',
  // (Of destructuring, for...in, labels, tags and the library of programs.)
  'constructor destructured': 'const { constructor } = o',
  'constructor destructured computed': 'const { ["con" + "structor"]: c } = o; c',
  'constructor of a parameter pattern': 'const f = ({ constructor: c }) => c; f([])',
  'constructor of an array pattern': 'const [{ constructor: c }] = [[]]; c',
  'constructor of for...in keys': 'let out; for (const k in { constructor: 1 }) out = ({})[k]; out',
  'rest of an object with __proto__': 'const { ...r } = JSON.parse(\'{"__proto__": {"polluted": 1}}\'); r.polluted',
  'Object.assign of __proto__': 'Object.assign({}, JSON.parse(\'{"__proto__": {"polluted": 1}}\'))',
  'Object.assign to a guarded object': 'Object.assign(Math, { polluted: 1 })',
  'Object.assign to a prototype': 'Object.assign(Object.entries({}).__proto__, { polluted: 1 })',
  'Object.freeze of a global': 'Object.freeze(JSON)',
  'tag with Function': 'const tag = (s) => s.constructor; tag`x`',
  'raw of a tag changed': 'const tag = (s) => { s.raw.push(1); return s }; tag`x`',
  'instanceof of a value made': 'const T = { [Symbol.hasInstance]: () => true }; 1 instanceof T',
  'label shadowing a helper': 'IN: for (;;) { break IN } TS: { break TS } 1',
  'names starting with #': 'let #d1 = 1',
  'new Array of a billion': 'new Array(1e9).fill(0)',
  // (Of classes, this and super.)
  'prototype of a class': 'class A {} A.prototype',
  'constructor of an instance': 'class A {} new A().constructor',
  'constructor by super': 'class A { m() { return super.constructor } } new A().m()',
  'constructor by super of a static': 'class A { static m() { return super.constructor } } A.m()',
  'Function of a static this': 'class A { static m() { return this } } A.m()["con" + "structor"]',
  'extends Object': 'class A extends Object {} new A()',
  'extends Function': 'class A extends Function {} new A("return process")()',
  'extends a function of the context': 'class A extends o.f {} new A()',
  'this of a function': 'function f() { return this } f()',
  'this of a method on Math': 'const o = { m() { this.max = 1 } }; [1].forEach(o.m, Math)',
  'getter that pollutes': 'const o = { get x() { return ({}).__proto__ } }; o.x',
  'method named __proto__': 'class A { ["__proto__"]() {} }',
  'field named constructor': 'class A { ["constructor"] = 1 } new A()',
  'super of Error to its constructor': 'class E extends Error { m() { return super.constructor } } new E().m()',
  'new this of a host class': 'class A { static make() { return new this() } } A.make.call(Math)',
  // (Of async and await: what an async function is made of, what promises reach.)
  'constructor of an async function': '(async () => 1).constructor("return process")',
  'constructor of a promise': '(async () => 1)().constructor',
  'then of a promise to its constructor': 'Promise.resolve(1).then["constructor"]',
  'await of the process': 'await process',
  'await of import()': 'await import("fs")',
  'species of a promise': 'const p = Promise.resolve(1); p.constructor = function () {}; await p.then(() => 2)',
  'thenable that pollutes': 'await { then(resolve) { resolve(({}).__proto__) } }',
  'Promise changed': 'Promise.resolve = () => 1',
  'new Promise to its constructor': 'new Promise((resolve) => resolve(1)).constructor',
  'executor that escapes': 'await new Promise((resolve) => resolve([].map.constructor))',
  // (Of generators and for await.)
  'constructor of a generator function': '(function* () {}).constructor("return process")',
  'constructor of a generator': '(function* () {})().constructor',
  'constructor of an async generator': '(async function* () {})()["constructor"]',
  'next of a generator to Function': 'const g = (function* () {})(); g.next["constructor"]',
  'yield of the process': 'function* g() { yield process } g().next().value',
  'for await of a host object': 'for await (const x of Math) {}',
  'generator that pollutes': 'function* g() { yield ({}).__proto__ } [...g()]',
  // (Of modules.)
  'module of the file system': 'import fs from "fs"; fs',
  'module that reaches Function': 'import { f } from "bad"; f',
  'module that pollutes': 'import { p } from "pollute"; p.polluted = 1',
  'constructor of a namespace': 'import * as m from "math"; m.constructor',
  'namespace changed': 'import * as m from "math"; m.pi = 1',
  'exports of the host changed': 'import * as h from "host"; h.rate = Function',
  'dynamic import': 'import("math")',
  // (Of private names.)
  'private of a host object': 'class A { #x = 1; static read(o) { return o.#x } } A.read(Math)',
  'private written to a host object': 'class A { #x = 1; static write(o) { o.#x = Function } } A.write(Math)',
  'private name of the constructor': 'class A { #constructor() {} }',
  'private method to its constructor': 'class A { #m() {} get() { return this.#m.constructor } } new A().get()',
  'private outside its class': 'Math.#x',
  'hidden names by private names':
    'class A { #d1 = 1; #p1 = 2; #this = 3; m() { return [this.#d1, this.#p1, this.#this] } } new A().m()',
};

// Whether a value (or what was done) escaped.
function escaped(value) {
  if (Object.prototype.polluted !== undefined) return 'Object.prototype polluted';
  if (value === globalThis || value === process) return 'the global object or the process';
  if (typeof value === 'function' && /^function (Function|eval|require)\b|process/.test(String(value))) {
    return `a function that makes code: ${String(value).slice(0, 40)}`;
  }
  if (Math.max(1, 2) !== 2 || typeof JSON.parse !== 'function') return 'a global changed';
  return null;
}

for (const [mode, options] of [
  ['closures', { inline: false }],
  ['one function', { inlineAfter: 0 }],
]) {
  describe(`ways out of programs (${mode})`, () => {
    // (Modules: of sources, and of an object the host gives.)
    const host = { rate: 7, list: [1] };
    const sources = {
      bad: 'export const f = [].map.constructor',
      pollute: 'export const p = ({}).__proto__',
      math: 'export const pi = 3.14',
    };
    const engine = new Engine({
      statements: true,
      maxSteps: 100_000,
      modules: (name) => (name === 'host' ? host : sources[name]),
      ...options,
    });

    test.each(Object.entries(ATTACKS))('%s', async (name, source) => {
      let value;
      try {
        // (Async programs: what their promise gives.)
        value = await engine.evaluate(source, { o: {} });
      } catch (err) {
        // (Refused by the engine, or an error of JavaScript itself: nothing escaped either way.)
        expect(err instanceof ExpressionError || err instanceof Error || typeof err !== 'object').toBe(true);
        value = undefined;
      }
      expect(escaped(value)).toBe(null);
    });
  });
}
