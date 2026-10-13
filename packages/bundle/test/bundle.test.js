// @xufa/bundle: resolution (exports, conditions, browser), transform() (ES modules, JSX, define and the branches it
// decides, import.meta, the names of CommonJS), minifyJs() (what must stay as it is, and names made short), tree
// shaking, stylesheets in the order modules run, and legal comments.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { bundle, transform, minifyJs, minifyCss, resolve } from '../index.js';

// A folder of files: { 'a/b.js': text }.
function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-bundle-'));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, typeof text === 'string' ? text : JSON.stringify(text));
  }
  return dir;
}

// The global a bundle makes, run in a context of its own.
function run(js, name = 'out', globals = {}) {
  const context = vm.createContext({ console, ...globals });
  vm.runInContext(js, context);
  return context[name];
}

describe('resolve()', () => {
  const dir = project({
    'node_modules/dual/package.json': {
      name: 'dual',
      exports: {
        '.': { browser: './browser.js', import: './esm.js', require: './cjs.js' },
        './feature/*': './features/*.js',
        './package.json': './package.json',
      },
    },
    'node_modules/dual/browser.js': '',
    'node_modules/dual/esm.js': '',
    'node_modules/dual/cjs.js': '',
    'node_modules/dual/features/x.js': '',
    'node_modules/old/package.json': { name: 'old', main: 'main.js', module: 'module.js', browser: { './main.js': './web.js', fs: false } },
    'node_modules/old/main.js': '',
    'node_modules/old/module.js': '',
    'node_modules/old/web.js': '',
    'node_modules/@scope/pkg/package.json': { name: '@scope/pkg' },
    'node_modules/@scope/pkg/index.js': '',
    'src/a.ts': '',
    'src/dir/index.jsx': '',
    'src/entry.js': '',
  });
  const from = path.join(dir, 'src', 'entry.js');
  const rel = (file) => file && path.relative(dir, file).split(path.sep).join('/');

  it('packages by "exports" and their conditions, patterns, and "browser", "module" and "main" without them', () => {
    expect(rel(resolve('dual', from))).toBe('node_modules/dual/browser.js');
    expect(rel(resolve('dual', from, { browser: false }))).toBe('node_modules/dual/esm.js');
    expect(rel(resolve('dual', from, { browser: false, kind: 'require' }))).toBe('node_modules/dual/cjs.js');
    expect(rel(resolve('dual/feature/x', from))).toBe('node_modules/dual/features/x.js');
    expect(() => resolve('dual/hidden.js', from)).toThrow(/not exported/);
    expect(rel(resolve('old', from, { browser: false }))).toBe('node_modules/old/module.js');
    expect(rel(resolve('old', from))).toBe('node_modules/old/module.js');
    expect(rel(resolve('@scope/pkg', from))).toBe('node_modules/@scope/pkg/index.js');
    expect(resolve('nowhere', from)).toBe(null);
  });

  it('files: extensions, index files, .js written for .ts; "browser" of a package maps its files and modules', () => {
    expect(rel(resolve('./a.js', from))).toBe('src/a.ts');
    expect(rel(resolve('./dir', from))).toBe('src/dir/index.jsx');
    const inOld = path.join(dir, 'node_modules/old/module.js');
    expect(rel(resolve('./main.js', inOld))).toBe('node_modules/old/web.js');
    expect(resolve('fs', inOld)).toBe(false);
  });
});

describe('transform()', () => {
  const evaluate = (code, modules = {}) => {
    const module = { exports: {} };
    const require = (name) => modules[name];
    new Function('module', 'exports', 'require', code)(module, module.exports, require);
    return module.exports;
  };

  it('ES modules as CommonJS: imports of CommonJS (default, named, *), exports, export *, import()', () => {
    const { code, imports, requires } = transform(
      "import a, { b } from 'cjs'; import * as all from 'cjs'; export * from 'more'; export const sum = a.x + b + all.b; export default 7;",
      { helpers: 'inline' }
    );
    expect(imports.sort()).toEqual(['cjs', 'more']);
    expect(requires.sort()).toEqual(['cjs', 'more']);
    const out = evaluate(code, { cjs: { x: 1, b: 2 }, more: { extra: true } });
    expect([out.sum, out.default, out.extra, out.__esModule]).toEqual([5, 7, true, true]);
  });

  it('JSX (automatic, or classic) and TypeScript', () => {
    expect(transform('export const a = <b c="d">e</b>;', { file: 'x.jsx' }).code).toContain('(0, jsx_runtime_1.jsx)("b"');
    expect(transform('export const a = <b />;', { file: 'x.jsx', jsx: 'classic' }).code).toContain('React.createElement("b"');
    const ts = transform('export const n: number = 1 as number; export enum E { A }', { file: 'x.ts' }).code;
    expect(evaluate(ts).n).toBe(1);
    expect(evaluate(ts).E.A).toBe(0);
  });

  it('define, and the branches its values decide left out: if, ?:, && and ||', () => {
    const { code, requires } = transform(
      [
        "if (process.env.NODE_ENV === 'production') { module.exports = require('./prod.js'); }",
        "else { module.exports = require('./dev.js'); }",
        "module.exports.mode = process.env.NODE_ENV !== 'production' ? 'dev' : 'prod';",
        "module.exports.debug = process.env.NODE_ENV === 'development' && require('./debug.js');",
        "process.env.NODE_ENV = 'kept';",
      ].join('\n'),
      { define: { 'process.env.NODE_ENV': '"production"' } }
    );
    expect(requires).toEqual(['./prod.js']);
    expect(code).toContain("process.env.NODE_ENV = 'kept'");
    expect(evaluate(code.replace("process.env.NODE_ENV = 'kept';", ''), { './prod.js': {} })).toEqual({ mode: 'prod', debug: false });
  });

  it('CommonJS stays as written (not made strict); import.meta is an empty object; require, module and exports of an ES module are renamed', () => {
    expect(transform('x = 1; module.exports = this;').code.startsWith('"use strict"')).toBe(false);
    expect(transform("'use strict'; module.exports = 1;").code).toContain("'use strict'");
    // (Written in two parts: @xufa/test gives test files an import.meta.env of its own.)
    expect(transform('export const env = import.' + 'meta.env;').code).toContain('({}).env');
    const { code } = transform(
      "import { createRequire } from 'node:module'; const require = createRequire('/x'); const module = { require }; export { module };"
    );
    const out = evaluate(code, { 'node:module': { createRequire: () => 'made' } });
    expect(out.module).toEqual({ require: 'made' });
  });

  it('a syntax error says where it is', () => {
    expect(() => transform('export const = 1;', { file: 'bad.js' })).toThrow(/bad\.js:1:14/);
  });

  it('keeps the legal comments: /*! ... */ and @license', () => {
    const { legal } = transform('/*! keep me */\n/** @license MIT */\n/* not this */\nmodule.exports = 1;');
    expect(legal).toEqual(['/*! keep me */', '/** @license MIT */']);
  });
});

describe('minifyJs() and minifyCss()', () => {
  const same = (code, globals = {}) => {
    const run1 = vm.runInContext(code, vm.createContext({ ...globals }));
    const minified = minifyJs(code);
    const run2 = vm.runInContext(minified, vm.createContext({ ...globals }));
    expect(run2).toEqual(run1);
    return minified;
  };

  it('what depends on line breaks, spaces and holes stays as it was', () => {
    expect(minifyJs('a = b\n(c)')).toBe('a=b(c)');
    expect(minifyJs('if (a);\nelse b()')).toBe('if(a);else b()');
    expect(minifyJs('x = 1 .toString(); y = a - -b; z = a + +b; w = /re/ / 2')).toBe(
      'x=1 .toString();y=a- -b;z=a+ +b;w=/re/ /2'
    );
    expect(minifyJs('let x = [1, , ]; f(a, b, );')).toBe('let x=[1,,];f(a,b)');
    expect(minifyJs('t = true; u = true.toString()')).toBe('t=!0;u=true.toString()');
    same('(function () { var a = 1\nvar b = a\n++b\nreturn [a, b] })()');
    same('(function () { function f() { return\n1 } return f() })()');
    same('(function () { class A { x = 1\n y = 2\n get z() { return this.x + this.y } } return new A().z })()');
    same('`a${1 + 2}b${`c${3}`}`');
  });

  it('local names made short, as their scopes allow: shadowing, closures, shorthand properties, patterns', () => {
    const code = `(function () {
      var total = 0;
      function add(value) { total += value; return total; }
      const make = (count) => { const out = []; for (let index = 0; index < count; index++) out.push(add(index)); return out; };
      const { first, second = 2, ...rest } = { first: 1, other: 3 };
      const point = { first, second, rest };
      try { throw new Error('x') } catch ({ message }) { point.message = message }
      label: for (const item of [1, 2]) { if (item) continue label; }
      return [make(4), point, typeof undefinedGlobal];
    })()`;
    const minified = same(code);
    expect(minified).not.toContain('total');
    expect(minified).toContain('first:');
    expect(minified).toContain('label');
    expect(minified.length).toBeLessThan(code.replace(/\s+/g, ' ').length * 0.75);
  });

  it('nothing is renamed where eval or with could reach it', () => {
    const code = '(function () { var secret = 1; return eval("secret + 1") })()';
    expect(same(code)).toContain('secret');
  });

  it('CSS: comments and white space out; strings, /*! */ and what spaces mean kept', () => {
    expect(minifyCss('/* x */\na  >  b ,\nc  {\n  color: red ;\n  content: " a ; } ";\n}\n/*! keep */\n.d :hover { margin: 0 auto; }')).toBe(
      'a>b,c{color:red;content:" a ; } "}/*! keep */ .d :hover{margin:0 auto}'
    );
  });
});

describe('bundle()', () => {
  it('a script of the modules and their packages, with the stylesheets in the order the modules run', () => {
    const dir = project({
      'src/main.jsx': "import './base.css';\nimport { label } from './label.js';\nimport cls from 'classish';\nexport const out = [label, cls('a', 'b')];\nimport './last.css';",
      'src/label.js': "import './label.css';\nexport const label = 'L';",
      'src/base.css': '.base { color: red }',
      'src/label.css': '@import "./shared.css";\n.label { color: blue }',
      'src/shared.css': '.shared { margin: 0 }',
      'src/last.css': '.last { padding: 0 }',
      'node_modules/classish/package.json': { name: 'classish', main: 'index.js' },
      'node_modules/classish/index.js': "/*! classish | MIT */\nmodule.exports = function () { return Array.prototype.join.call(arguments, ' '); };",
    });
    const result = bundle(path.join(dir, 'src/main.jsx'), { globalName: 'out' });
    expect(run(result.js).out).toEqual(['L', 'a b']);
    expect(result.css.replace(/\s+/g, ' ')).toMatch(/\.base.*\.shared.*\.label.*\.last/);
    expect(result.js).toContain('/*! Bundled license information:\n\nclassish/index.js:\n  (*! classish | MIT *)');
    expect(result.inputs.map((file) => path.basename(file))).toContain('index.js');
    const minified = bundle(path.join(dir, 'src/main.jsx'), { globalName: 'out', minify: true });
    expect(run(minified.js).out).toEqual(['L', 'a b']);
    expect(minified.css).toBe('.base{color:red}.shared{margin:0}.label{color:blue}.last{padding:0}\n');
  });

  it('tree shaking: what nothing uses is left out, side effects are kept, and packages with "sideEffects": false are not bundled unused', () => {
    const dir = project({
      'src/main.js': "import { used } from './lib.js';\nimport { nothing } from 'free';\nimport 'effects';\nexport const out = used();",
      'src/lib.js': [
        "import { helper } from './helper.js';",
        'export function used() { return helper() + 1; }',
        'export function unused() { return "UNUSED-FUNCTION"; }',
        'export const table = { big: "UNUSED-TABLE" };',
        'globalThis.ran = (globalThis.ran ?? 0) + 1;',
      ].join('\n'),
      'src/helper.js': 'export const helper = () => 41;\nexport const other = () => "UNUSED-OTHER";',
      'node_modules/free/package.json': { name: 'free', sideEffects: false, module: 'index.js' },
      'node_modules/free/index.js': 'export const nothing = 1;\nconsole.log("FREE-RAN");',
      'node_modules/effects/package.json': { name: 'effects', main: 'index.js' },
      'node_modules/effects/index.js': 'globalThis.effects = true;',
    });
    const result = bundle(path.join(dir, 'src/main.js'), { globalName: 'out' });
    const context = vm.createContext({ console });
    vm.runInContext(result.js, context);
    expect([context.out.out, context.ran, context.effects]).toEqual([42, 1, true]);
    for (const gone of ['UNUSED-FUNCTION', 'UNUSED-TABLE', 'UNUSED-OTHER', 'FREE-RAN']) expect(result.js).not.toContain(gone);
    const whole = bundle(path.join(dir, 'src/main.js'), { globalName: 'out', treeShaking: false });
    expect(whole.js).toContain('UNUSED-FUNCTION');
  });

  it('modules of Node.js by shims, or an error that says so; "browser": false modules are empty', () => {
    const dir = project({
      'src/main.js': "const util = require('node:util'); module.exports = util.name;",
      'src/node.js': "require('node:fs');",
    });
    const shimmed = bundle(path.join(dir, 'src/main.js'), { globalName: 'out', shims: { 'node:util': "module.exports = { name: 'shim' };" } });
    expect(run(shimmed.js)).toBe('shim');
    expect(() => bundle(path.join(dir, 'src/node.js'))).toThrow(/cannot find node:fs \(a module of Node\.js: give it in shims\)/);
  });
});

describe('bundle() for Node.js', () => {
  const files = {
    'src/main.js': "import { a } from './a.js';\nimport { b, setB } from './b.js';\nimport { readFileSync } from 'node:fs';\nsetB(3);\nexport const out = [a, b, typeof readFileSync];",
    'src/a.js': "export { b as a } from './b.js';",
    'src/b.js': 'export let b = 1;\nexport function setB(value) { b = value; }',
  };
  // A module of CommonJS, run as Node.js runs one.
  const load = (js) => {
    const module = { exports: {} };
    new Function('module', 'exports', 'require', js)(module, module.exports, createRequire(import.meta.url));
    return module.exports;
  };

  it('platform "node": a module of CommonJS, Node.js modules by its require(); liveBindings: false reads values', () => {
    const dir = project(files);
    const live = bundle(path.join(dir, 'src/main.js'), { platform: 'node' });
    expect(live.js).toMatch(/^module\.exports = \(function \(__hostRequire\)/);
    expect(load(live.js).out).toEqual([3, 3, 'function']);
    // (Re-exports are values: what b was when a re-exported it.)
    const values = bundle(path.join(dir, 'src/main.js'), { platform: 'node', liveBindings: false });
    expect(load(values.js).out).toEqual([1, 3, 'function']);
    expect(values.js).toContain('__reexport(exports, "a", ');
  });

  it('format "esm": one ES module, its modules in one scope (names that clash renamed), imports read as variables', async () => {
    const dir = project({
      'src/main.js': [
        "import { x as ax, shorthand, ns, Counter } from './a.js';",
        "import * as b from './b.js';",
        "import named, { x as bx } from './b.js';",
        "import anonymous from './anonymous.js';",
        "import cjs, { name } from './cjs.cjs';",
        "import data from './data.json' with { type: 'json' };",
        "import path from 'node:path';",
        'const x = 0;',
        'export const out = [x, ax, bx, b.x, shorthand, named(), anonymous(), cjs.name, name, data.value, path.sep.length];',
        "export const keys = Object.keys(ns);",
        'export const counter = new Counter().count;',
        "export const lazy = () => import('./lazy.js').then((module) => module.value);",
        "export { default as answer } from './b.js';",
        "export * from './star.js';",
      ].join('\n'),
      'src/a.js': "const x = 1;\nexport { x };\nexport const shorthand = { x }.x + 10;\nexport * as ns from './b.js';\nexport class Counter { count = x; }",
      'src/b.js': "export const x = 2;\nexport default function () { return 'named'; }\nexport const unused = 'left out';",
      'src/anonymous.js': "export default (() => 'anonymous');",
      'src/cjs.cjs': "exports.name = 'commonjs';",
      'src/data.json': { value: 'json' },
      'src/lazy.js': "export const value = 'lazy';",
      'src/star.js': "export const starred = 'star';\nexport default 'not re-exported';",
    });
    const result = bundle(path.join(dir, 'src/main.js'), { platform: 'node', format: 'esm' });
    expect(result.js).not.toMatch(/^\s*(import|export) .* from '\.\//m);
    expect(result.js).toMatch(/\bconst x\$\d+ = 1;/);
    const out = path.join(dir, 'out.mjs');
    fs.writeFileSync(out, result.js);
    const module = await import(pathToFileURL(out).href);
    expect(module.out).toEqual([0, 1, 2, 2, 11, 'named', 'anonymous', 'commonjs', 'commonjs', 'json', 1]);
    expect(module.keys).toEqual(['default', 'unused', 'x']); // (sorted, as namespaces are)
    expect(module.counter).toBe(1);
    expect(await module.lazy()).toBe('lazy');
    expect(module.answer()).toBe('named');
    expect(module.starred).toBe('star');
    expect(Object.keys(module).sort()).toEqual(['answer', 'counter', 'keys', 'lazy', 'out', 'starred']);
  });
});
