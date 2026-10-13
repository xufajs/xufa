// The expressions of a book: formulas of cells (=price * 1.2), scripts of returns, conditions and templates, compiled
// once by @xufa/expression (safe: they read their context and compute, nothing else); the bodies of Method tables as
// its programs (statements, variables, loops; as safe, with a limit of steps). The books of the engine this
// one follows are taken as they are: a trailing semicolon is dropped, `this` (the result a spreadsheet builds) is the
// name $this, and members of null or undefined are undefined (lenient), as there.
import { Engine } from '@xufa/expression';
import { Fun } from './helpers.js';
import { RulesError } from './values.js';
import { FUNCTIONS } from './openl/functions.js';

// error(message) ends a rule with an error of that message, error(code, message) with its code too (as OpenL Tablets'
// error(), the same in both dialects): tests expect them with _error_ and _error_.code.
const error = (...args) => FUNCTIONS.error(args, []);

// The functions of OpenL Tablets (length, sum, round, contains, dateDif...) are globals of every expression too: the
// names of a book come first, and those of JavaScript's globals (Date, isNaN) keep their meaning.
const OPENL = Object.fromEntries(
  Object.entries(FUNCTIONS)
    .filter(([name]) => !['Date', 'isNaN', 'error', 'toString'].includes(name))
    .map(([name, fn]) => [name, (...args) => fn(args, [])])
);

const engine = new Engine({ globals: { ...OPENL, Fun, error }, lenient: true, cacheSize: 5000 });
const programs = new Engine({ globals: { ...OPENL, Fun, error }, lenient: true, cacheSize: 1000, statements: true });
// (Of books with tdz: a let or const used before its declaration runs is an error, as in JavaScript. Made when used.)
let checked = null;
const programsOf = (tdz) => {
  if (!tdz) return programs;
  checked ??= new Engine({ globals: { ...OPENL, Fun, error }, lenient: true, cacheSize: 1000, statements: true, tdz });
  return checked;
};

// `this` out of strings and templates -> $this.
function rewriteThis(source) {
  if (!source.includes('this')) return source;
  let result = '';
  let quote = null;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      result += char;
      if (char === '\\') {
        result += source[i + 1] ?? '';
        i += 1;
      } else if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === '`') {
      quote = char;
      result += char;
    } else if (
      source.startsWith('this', i) &&
      !/[\w$.]/.test(source[i - 1] ?? '') &&
      !/[\w$]/.test(source[i + 4] ?? '')
    ) {
      result += '$this';
      i += 3;
    } else {
      result += char;
    }
  }
  return result;
}

const clean = (source) =>
  rewriteThis(
    String(source)
      .trim()
      .replace(/;+\s*$/, '')
  );

// (context) => value of a source; where says where it is (Table X, Sheet!B4) in the errors.
function compileExpression(source, where) {
  try {
    const run = engine.compile(clean(source));
    return (context) => run(context);
  } catch (err) {
    throw new RulesError(`${where}: ${err.message}`, 'XUFA_RULES_ERR_EXPRESSION');
  }
}

// What a source reads (for the checks of a book): the names it does not define itself (those of its arrow functions
// are its own), the calls of names with how many arguments (null with a spread), and the members of names (Fun.mean).
function namesOf(source) {
  const names = [];
  const calls = [];
  const members = [];
  const walk = (node, scope) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, scope);
      return;
    }
    switch (node.type) {
      case 'Identifier':
        if (!scope.has(node.name)) names.push(node.name);
        return;
      case 'ArrowFunctionExpression':
        walk(node.body, new Set([...scope, ...node.params]));
        return;
      case 'MemberExpression':
        walk(node.object, scope);
        if (node.computed) walk(node.property, scope);
        else if (node.object.type === 'Identifier' && !scope.has(node.object.name))
          members.push({ object: node.object.name, property: node.property });
        return;
      case 'CallExpression':
        if (node.callee.type === 'Identifier' && !scope.has(node.callee.name)) {
          calls.push({
            name: node.callee.name,
            count: node.arguments.some((arg) => arg.type === 'SpreadElement') ? null : node.arguments.length,
            texts: node.arguments.map((arg) => (arg.type === 'Literal' ? arg.value : undefined)),
          });
        }
        walk(node.callee, scope);
        walk(node.arguments, scope);
        return;
      case 'Property':
        if (node.computed) walk(node.key, scope);
        walk(node.value, scope);
        return;
      default:
        for (const [key, value] of Object.entries(node))
          if (key !== 'type' && typeof value === 'object') walk(value, scope);
    }
  };
  walk(engine.parse(clean(source)), new Set());
  return { names, calls, members };
}

// Whether a source is an expression of JavaScript (of @xufa/expression).
function isExpression(source) {
  try {
    engine.parse(clean(source));
    return true;
  } catch {
    return false;
  }
}

// Whether a source is a program of JavaScript (statements of @xufa/expression).
function isProgram(source) {
  try {
    programs.parse(rewriteThis(String(source)));
    return true;
  } catch {
    return false;
  }
}

const evaluateLiteral = (source, where) => compileExpression(source, where)(Object.create(null));

// Templates of texts: "Hello {{ user.name }}" and blocks repeated for the items of a list, {{#items}}...{{/#}} (an item
// is the context of its block, with _parent_ and _current_). A template of one {{ }} alone gives its value as it is.
function compileTemplate(text, where) {
  const program = { type: 'program', blocks: [], parent: null };
  let block = program;
  const pattern = /{{([\s\S]*?)}}/g;
  let last = 0;
  let match = pattern.exec(text);
  while (match) {
    if (match.index > last) block.blocks.push({ type: 'text', text: text.slice(last, match.index) });
    const inner = match[1].trim();
    if (inner.startsWith('/#')) {
      block = block.parent || program;
    } else if (inner.startsWith('#')) {
      const loop = { type: 'each', run: compileExpression(inner.slice(1), where), blocks: [], parent: block };
      block.blocks.push(loop);
      block = loop;
    } else {
      block.blocks.push({ type: 'value', run: compileExpression(inner, where) });
    }
    last = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (last < text.length) block.blocks.push({ type: 'text', text: text.slice(last) });
  const render = (node, context) => {
    if (node.type === 'text') return node.text;
    if (node.type === 'value') {
      const value = node.run(context);
      return value === null || value === undefined ? '' : value;
    }
    if (node.type === 'each') {
      const items = node.run(context);
      if (!Array.isArray(items)) return '';
      return items
        .map((item) => {
          const itemContext = Object.assign(Object.create(context), item, { _parent_: context, _current_: item });
          return node.blocks.map((child) => render(child, itemContext)).join('');
        })
        .join('');
    }
    const values = node.blocks.map((child) => render(child, context));
    return values.length === 1 ? values[0] : values.join('');
  };
  return (context) => render(program, context);
}

// (context) => value of a program (the body of a Method: statements of JavaScript); its value is that of its return,
// or of its last expression statement, as in the engine this one follows. modules: what its imports take (the
// resolver of its book: the tables of other books); tdz: a let or const used before its declaration is an error.
function compileProgram(source, where, { modules, tdz = false } = {}) {
  try {
    const run = programsOf(tdz).compile(rewriteThis(String(source)), { modules });
    return (context) => run(context);
  } catch (err) {
    throw new RulesError(`${where}: ${err.message}`, 'XUFA_RULES_ERR_EXPRESSION');
  }
}

export {
  compileExpression,
  compileProgram,
  compileTemplate,
  evaluateLiteral,
  rewriteThis,
  namesOf,
  isExpression,
  isProgram,
  engine,
  programs,
};
