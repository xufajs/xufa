// Rewrites a node:test suite as a vyntra one:
//   test('x', async (t) => { t.plan(2); t.assert.strictEqual(a, b) })  ->  test('x', async () => { expect.assertions(2); expect(a).toBe(b) })
// Tests with subtests (t.test) become describe blocks. What can not be rewritten is left with a "TODO(vyntra)" comment.
const acorn = require('acorn');

const PARSE_OPTIONS = {
  ecmaVersion: 'latest',
  allowHashBang: true,
  allowAwaitOutsideFunction: true,
  allowReturnOutsideFunction: true,
  allowImportExportEverywhere: true,
};

function parse(src) {
  try {
    return acorn.parse(src, { ...PARSE_OPTIONS, sourceType: 'script' });
  } catch {
    return acorn.parse(src, { ...PARSE_OPTIONS, sourceType: 'module' });
  }
}

// Text edits over the source; an edit replacing a range drops the edits inside it (their text is part of it).
class Editor {
  constructor(src) {
    this.src = src;
    this.edits = [];
  }

  replace(start, end, text) {
    this.edits = this.edits.filter((e) => !(e.start >= start && e.end <= end));
    this.edits.push({ start, end, text });
  }

  text(start, end) {
    const inner = this.edits
      .filter((e) => e.start >= start && e.end <= end)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    let out = '';
    let pos = start;
    for (const e of inner) {
      if (e.start < pos) continue;
      out += this.src.slice(pos, e.start) + e.text;
      pos = e.end;
    }
    return out + this.src.slice(pos, end);
  }

  output() {
    return this.text(0, this.src.length);
  }
}

const SKIP_KEYS = new Set(['type', 'start', 'end', 'loc', 'range', 'raw']);

function forEachChild(node, fn) {
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item.type === 'string') fn(item, key);
    } else if (value && typeof value.type === 'string') {
      fn(value, key);
    }
  }
}

const isFunction = (node) => node && (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression');

// The names a file gives to node:test and node:assert.
function findImports(ast) {
  const names = { test: new Map(), defaults: new Set(), assert: new Set(), nodes: [] };
  const NODE_TEST = new Set(['node:test', 'test']);
  const NODE_ASSERT = new Set(['node:assert', 'assert', 'node:assert/strict', 'assert/strict']);
  const visit = (node) => {
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        const init = decl.init;
        if (!init || init.type !== 'CallExpression' || init.callee.name !== 'require') continue;
        const source = init.arguments[0] && init.arguments[0].value;
        if (NODE_TEST.has(source) && source !== 'test') {
          if (decl.id.type === 'ObjectPattern') {
            for (const prop of decl.id.properties) names.test.set(prop.value.name, prop.key.name);
          } else {
            names.defaults.add(decl.id.name);
          }
          names.nodes.push(node);
        } else if (NODE_ASSERT.has(source)) {
          if (decl.id.type === 'Identifier') names.assert.add(decl.id.name);
          else if (decl.id.type === 'ObjectPattern') names.assert.add(null);
          names.nodes.push({ assert: true, node });
        }
      }
    } else if (node.type === 'ImportDeclaration') {
      const source = node.source.value;
      if (source === 'node:test') {
        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier') names.test.set(spec.local.name, spec.imported.name);
          else names.defaults.add(spec.local.name);
        }
        names.nodes.push(node);
      } else if (NODE_ASSERT.has(source)) {
        for (const spec of node.specifiers) if (spec.type !== 'ImportSpecifier') names.assert.add(spec.local.name);
        names.nodes.push({ assert: true, node });
      }
    }
  };
  for (const node of ast.body) visit(node);
  // const test = t.test: where t is node:test, or a parameter of a helper given node:test.
  const aliases = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        const init = decl.init;
        if (
          init &&
          init.type === 'MemberExpression' &&
          !init.computed &&
          init.object.type === 'Identifier' &&
          ['test', 'describe', 'it', 'suite'].includes(init.property.name) &&
          decl.id.type === 'Identifier' &&
          (names.defaults.has(init.object.name) || decl.id.name === init.property.name)
        ) {
          names.test.set(decl.id.name, init.property.name);
          if (node.declarations.length === 1) names.nodes.push(node);
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      const value = node[key];
      if (Array.isArray(value)) value.forEach(aliases);
      else if (value && typeof value.type === 'string') aliases(value);
    }
  };
  aliases(ast);
  return names;
}

// Offsets of the identifier `name` in code, other than as a property (`x.name`) or an object key.
function references(code, name) {
  const out = [];
  let previous = null;
  try {
    for (const token of acorn.tokenizer(code, { ...PARSE_OPTIONS, sourceType: 'module' })) {
      if (token.type.label === 'name' && token.value === name && !(previous && previous.type.label === '.')) {
        const next = code.slice(token.end).match(/^\s*(\S)/);
        if (!(next && next[1] === ':' && previous && (previous.type.label === '{' || previous.type.label === ','))) {
          out.push(token.start);
        }
      }
      previous = token;
    }
  } catch {
    return out;
  }
  return out;
}

const HOOKS = { before: 'beforeAll', after: 'afterAll', beforeEach: 'beforeEach', afterEach: 'afterEach' };

function convert(src, file = '') {
  const ast = parse(src);
  const editor = new Editor(src);
  const imports = findImports(ast);
  const todos = [];
  const text = (node) => editor.text(node.start, node.end);
  const todo = (node, why) => {
    todos.push(why);
    editor.replace(node.start, node.start, `/* TODO(vyntra): ${why} */ `);
  };

  // What a call is: a test or suite of node:test, a hook, or a subtest of a context.
  const testKind = (call, ctxNames) => {
    const { callee } = call;
    if (callee.type === 'Identifier') {
      const imported = imports.test.get(callee.name);
      if (imported === 'test' || imported === 'it') return { kind: 'test', name: imported, modifier: null };
      if (imported === 'describe' || imported === 'suite') return { kind: 'suite', name: 'describe', modifier: null };
      if (HOOKS[imported]) return { kind: 'hook', name: HOOKS[imported] };
      if (imports.defaults.has(callee.name)) return { kind: 'test', name: 'test', modifier: null };
      return null;
    }
    if (callee.type !== 'MemberExpression' || callee.computed) return null;
    const obj = callee.object;
    const prop = callee.property.name;
    if (obj.type === 'Identifier') {
      const imported = imports.test.get(obj.name);
      // test.before(), test.after()...: hooks of the file.
      if ((imported === 'test' || imported === 'it') && HOOKS[prop]) return { kind: 'hook', name: HOOKS[prop] };
      if (
        (imported === 'test' || imported === 'it' || imported === 'describe' || imported === 'suite') &&
        ['skip', 'only', 'todo'].includes(prop)
      ) {
        const isSuite = imported === 'describe' || imported === 'suite';
        return { kind: isSuite ? 'suite' : 'test', name: isSuite ? 'describe' : imported, modifier: prop };
      }
      // The context of an enclosing test comes first: it may have the name of the node:test import.
      if (ctxNames.has(obj.name)) {
        return prop === 'test' ? { kind: 'test', name: 'test', modifier: null, sub: true } : null;
      }
      if (imports.defaults.has(obj.name)) {
        if (prop === 'test' || prop === 'it') return { kind: 'test', name: 'test', modifier: null };
        if (prop === 'describe' || prop === 'suite') return { kind: 'suite', name: 'describe', modifier: null };
        if (HOOKS[prop]) return { kind: 'hook', name: HOOKS[prop] };
      }
    }
    return null;
  };

  // First pass: the test functions, the name of their context parameter and whether they have subtests.
  const testFunctions = new Map(); // function node -> { ctx, done, subtests, names }
  const ctxNames = new Set();
  const NO_NAMES = new Set();
  const collect = (node, current) => {
    if (node.type === 'CallExpression') {
      // The context names in scope: the ones of the enclosing tests.
      const kind = testKind(node, current ? current.names : NO_NAMES);
      // Inside a test, test() of node:test makes a subtest too.
      if (kind && kind.kind !== 'hook' && current) current.subtests = true;
      // t.plan() of the test being collected.
      const { callee } = node;
      if (
        current &&
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property.name === 'plan' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === current.ctx
      ) {
        current.hasPlan = true;
      }
      if (kind) {
        const fn = node.arguments.find(isFunction);
        if (fn) {
          const ctxParam = fn.params[0] && fn.params[0].type === 'Identifier' ? fn.params[0].name : null;
          const doneParam = fn.params[1] && fn.params[1].type === 'Identifier' ? fn.params[1].name : null;
          const names = new Set(current ? current.names : NO_NAMES);
          if (ctxParam) names.add(ctxParam);
          const info = { ctx: ctxParam, done: doneParam, subtests: false, kind: kind.kind, names };
          if (ctxParam) ctxNames.add(ctxParam);
          testFunctions.set(fn, info);
          forEachChild(node, (child) => {
            if (child === fn) collect(fn.body, info);
            else collect(child, current);
          });
          return;
        }
      }
    }
    forEachChild(node, (child) => collect(child, current));
  };
  collect(ast, null);

  const isAssertCallee = (callee, scope) => {
    // t.assert.x(...), t.assert(...), assert.x(...), assert(...)
    if (callee.type === 'Identifier') return imports.assert.has(callee.name) ? 'ok' : null;
    if (callee.type !== 'MemberExpression' || callee.computed) return null;
    const { object, property } = callee;
    if (object.type === 'Identifier' && imports.assert.has(object.name)) return property.name;
    if (
      object.type === 'MemberExpression' &&
      !object.computed &&
      object.property.name === 'assert' &&
      object.object.type === 'Identifier' &&
      (scope.ctxNames.has(object.object.name) || ctxNames.has(object.object.name))
    ) {
      return property.name;
    }
    if (
      property.name === 'assert' &&
      object.type === 'Identifier' &&
      (scope.ctxNames.has(object.name) || ctxNames.has(object.name))
    )
      return 'ok';
    // t.assert.assert.fail (seen in some suites)
    if (
      object.type === 'MemberExpression' &&
      object.property.name === 'assert' &&
      object.object.type === 'MemberExpression' &&
      object.object.property.name === 'assert'
    ) {
      return property.name;
    }
    return null;
  };

  const errorExpectation = (node) => {
    if (!node) return '';
    if (node.type === 'Literal' && node.regex) {
      // node:assert matches String(error) ("Error: message"); toThrow matches the message: an anchored name goes.
      const { pattern, flags } = node.regex;
      const stripped = pattern.replace(/^\^\w*Error(?: \\\[[\w\\]+\\\])?: /, '^');
      return stripped === pattern ? text(node) : `/${stripped}/${flags}`;
    }
    if (node.type === 'Literal' && typeof node.value === 'string') return null; // a message, not an expectation
    if (['Identifier', 'MemberExpression', 'NewExpression', 'CallExpression'].includes(node.type)) return text(node);
    if (node.type === 'ObjectExpression') {
      const props = node.properties.map((prop) => {
        if (prop.type !== 'Property') return text(prop);
        const value =
          prop.value.type === 'Literal' && prop.value.regex
            ? `expect.stringMatching(${text(prop.value)})`
            : text(prop.value);
        return `${prop.computed ? `[${text(prop.key)}]` : text(prop.key)}: ${value}`;
      });
      return `expect.objectContaining({ ${props.join(', ')} })`;
    }
    return undefined; // not convertible
  };

  const convertAssert = (method, call) => {
    const args = call.arguments;
    const a = args[0] ? text(args[0]) : '';
    const b = args[1] ? text(args[1]) : '';
    switch (method) {
      case 'ok':
      case 'assert':
        if (args[0] && args[0].type === 'UnaryExpression' && args[0].operator === '!') {
          return `expect(${text(args[0].argument)}).toBeFalsy()`;
        }
        return `expect(${a}).toBeTruthy()`;
      case 'equal':
      case 'strictEqual':
        return `expect(${a}).toBe(${b})`;
      case 'notEqual':
      case 'notStrictEqual':
        return `expect(${a}).not.toBe(${b})`;
      case 'deepEqual':
      case 'deepStrictEqual':
        return `expect(${a}).toEqual(${b})`;
      case 'notDeepEqual':
      case 'notDeepStrictEqual':
        return `expect(${a}).not.toEqual(${b})`;
      case 'partialDeepStrictEqual':
        return `expect(${a}).toMatchObject(${b})`;
      case 'fail':
        return `expect.fail(${a})`;
      case 'ifError':
        return `expect(${a}).toBeFalsy()`;
      case 'match':
        return `expect(${a}).toMatch(${b})`;
      case 'doesNotMatch':
        return `expect(${a}).not.toMatch(${b})`;
      case 'throws': {
        // A validation function: the error must make it return true.
        if (args[1] && isFunction(args[1])) {
          return `expect((() => { try { (${a})() } catch (error) { return (${b})(error) } return false })()).toBe(true)`;
        }
        const exp = errorExpectation(args[1]);
        if (exp === undefined) return null;
        return `expect(${a}).toThrow(${exp || ''})`;
      }
      case 'doesNotThrow':
        return `expect(${a}).not.toThrow()`;
      case 'rejects': {
        if (args[1] && isFunction(args[1])) {
          const target = isFunction(args[0]) ? `(${a})()` : a;
          return `expect(${target}).rejects.toSatisfy(${b})`;
        }
        const exp = errorExpectation(args[1]);
        if (exp === undefined) return null;
        const target = isFunction(args[0]) ? `(${a})()` : a;
        return `expect(${target}).rejects.toThrow(${exp || ''})`;
      }
      case 'doesNotReject': {
        const target = isFunction(args[0]) ? `(${a})()` : a;
        return `expect(${target}).resolves.not.toThrow()`;
      }
      default:
        return null;
    }
  };

  // Second pass, children first, so that the text of a node includes the edits made inside it.
  const visit = (node, scope) => {
    let childScope = scope;
    const info = testFunctions.get(node);
    if (info) {
      const names = new Set(scope.ctxNames);
      if (info.ctx) names.add(info.ctx);
      childScope = { ctxNames: names, test: info, suite: info.subtests || info.kind === 'suite' };
    }
    forEachChild(node, (child) => visit(child, childScope));
    transform(node, scope);
  };

  const transform = (node, scope) => {
    if (node.type === 'CallExpression') {
      const kind = testKind(node, scope.ctxNames);
      if (kind) {
        convertTestCall(node, kind, scope);
        return;
      }
      const method = isAssertCallee(node.callee, scope);
      if (method) {
        const replacement = convertAssert(method, node);
        if (replacement !== null) editor.replace(node.start, node.end, replacement);
        else todo(node, `assert.${method}`);
        return;
      }
      convertContextCall(node, scope);
      convertMockCall(node);
      return;
    }
    // t.assert.fail as a value: .catch(t.assert.fail)
    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.property.name === 'fail' &&
      node.object.type === 'MemberExpression' &&
      node.object.property &&
      node.object.property.name === 'assert' &&
      node.object.object.type === 'Identifier' &&
      (scope.ctxNames.has(node.object.object.name) || ctxNames.has(node.object.object.name))
    ) {
      editor.replace(node.start, node.end, 'expect.fail');
      return;
    }
    if (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.object.type === 'Identifier' &&
      scope.ctxNames.has(node.object.name)
    ) {
      const prop = node.property.name;
      if (prop === 'name' || prop === 'fullName')
        editor.replace(node.start, node.end, 'expect.getState().currentTestName');
    }
    if (node.type === 'ExpressionStatement' && convertListenCallback(node)) return;
    if (node.type === 'ExpressionStatement') {
      // Statements emptied by their call (t.plan in a describe, t.diagnostic) are removed whole.
      const rendered = text(node.expression).trim();
      if (rendered === '' || rendered === 'await') editor.replace(node.start, node.end, '');
    }
    // Tests are only registered in a describe: awaiting them is pointless.
    if (node.type === 'AwaitExpression' && node.argument.type === 'CallExpression' && scope.suite) {
      const kind = testKind(node.argument, scope.ctxNames);
      if (kind && kind.kind !== 'hook') editor.replace(node.start, node.end, text(node.argument));
    }
  };

  // server.listen(options, (err) => { test(...) }): tests registered once listening, in an asynchronous describe.
  const convertListenCallback = (node) => {
    const call = node.expression;
    if (call.type !== 'CallExpression' || call.callee.type !== 'MemberExpression' || call.callee.computed) return false;
    if (call.callee.property.name !== 'listen' || call.arguments.length === 0) return false;
    const fn = call.arguments[call.arguments.length - 1];
    if (!isFunction(fn) || fn.body.type !== 'BlockStatement') return false;
    if (!fn.body.body.some((stmt) => statementKind(stmt, ctxNames) === 'test')) return false;
    const errName = fn.params[0] && fn.params[0].type === 'Identifier' ? fn.params[0].name : 'listenError';
    const args = call.arguments.slice(0, -1).map(text).join(', ');
    // Listening in a beforeAll (the tests registered before, which may add routes, run first), then the code of
    // the callback in order with its tests.
    // The second parameter of the callback is the address listened on.
    const addressName = fn.params[1] && fn.params[1].type === 'Identifier' ? fn.params[1].name : null;
    const assign = addressName ? `${addressName} = ` : '';
    const listen = `try {\n${assign}await ${text(call.callee)}(${args})\n} catch (error) {\n${errName} = error\n}`;
    const body = sequence(fn.body.body, ctxNames, [listen]);
    const declarations = `let ${errName} = null\n${addressName ? `let ${addressName}\n` : ''}`;
    editor.replace(node.start, node.end, `describe('listening', () => {\n${declarations}${body}})`);
    return true;
  };

  const convertContextCall = (node, scope) => {
    const { callee } = node;
    if (callee.type !== 'MemberExpression' || callee.computed) return;
    const { object } = callee;
    const prop = callee.property.name;
    if (object.type === 'Identifier' && scope.ctxNames.has(object.name)) {
      const args = node.arguments.map(text).join(', ');
      switch (prop) {
        case 'plan':
          if (scope.suite) editor.replace(node.start, node.end, '');
          else editor.replace(node.start, node.end, `expect.assertions(${text(node.arguments[0])})`);
          return;
        case 'after':
          editor.replace(node.start, node.end, scope.suite ? `afterAll(${args})` : `onTestFinished(${args})`);
          return;
        case 'before':
          editor.replace(node.start, node.end, scope.suite ? `beforeAll(${args})` : `(${args})()`);
          return;
        case 'beforeEach':
        case 'afterEach':
          editor.replace(node.start, node.end, `${prop}(${args})`);
          return;
        case 'diagnostic':
          editor.replace(node.start, node.end, '');
          return;
        case 'fail':
          editor.replace(node.start, node.end, `expect.fail(${args})`);
          return;
        default:
          return;
      }
    }
    // t.mock.fn(), t.mock.method(), t.mock.timers.*
    if (
      object.type === 'MemberExpression' &&
      !object.computed &&
      object.property.name === 'mock' &&
      object.object.type === 'Identifier' &&
      (scope.ctxNames.has(object.object.name) || imports.test.get(object.object.name))
    ) {
      convertMock(node, prop);
    }
    if (object.type === 'Identifier' && imports.test.get(object.name) === 'mock') convertMock(node, prop);
    if (
      object.type === 'MemberExpression' &&
      object.property.name === 'timers' &&
      object.object.type === 'MemberExpression' &&
      object.object.property.name === 'mock'
    ) {
      convertTimers(node, prop);
    }
    if (
      object.type === 'MemberExpression' &&
      object.property.name === 'timers' &&
      object.object.type === 'Identifier' &&
      imports.test.get(object.object.name) === 'mock'
    ) {
      convertTimers(node, prop);
    }
  };

  const convertMock = (node, prop) => {
    const args = node.arguments;
    if (prop === 'fn') editor.replace(node.start, node.end, `vi.fn(${args.length ? text(args[0]) : ''})`);
    else if (prop === 'method') {
      const spy = `vi.spyOn(${text(args[0])}, ${text(args[1])})`;
      editor.replace(node.start, node.end, args[2] ? `${spy}.mockImplementation(${text(args[2])})` : spy);
    } else if (prop === 'restoreAll' || prop === 'reset') editor.replace(node.start, node.end, 'vi.restoreAllMocks()');
  };

  const convertTimers = (node, prop) => {
    const args = node.arguments.map(text).join(', ');
    if (prop === 'enable') editor.replace(node.start, node.end, 'vi.useFakeTimers()');
    else if (prop === 'tick') editor.replace(node.start, node.end, `vi.advanceTimersByTime(${args})`);
    else if (prop === 'reset') editor.replace(node.start, node.end, 'vi.useRealTimers()');
    else if (prop === 'runAll') editor.replace(node.start, node.end, 'vi.runAllTimers()');
    else if (prop === 'setTime') editor.replace(node.start, node.end, `vi.setSystemTime(${args})`);
  };

  // fn.mock.callCount() -> fn.mock.calls.length
  const convertMockCall = (node) => {
    const { callee } = node;
    if (
      callee.type === 'MemberExpression' &&
      !callee.computed &&
      callee.property.name === 'callCount' &&
      callee.object.type === 'MemberExpression' &&
      callee.object.property.name === 'mock'
    ) {
      editor.replace(node.start, node.end, `${text(callee.object)}.calls.length`);
    }
  };

  const convertTestCall = (node, kind, scope) => {
    if (kind.kind === 'hook') {
      const fn = node.arguments.find(isFunction);
      if (fn) rewriteParams(fn, testFunctions.get(fn));
      // Hooks of the file registered while a test runs: cleanups of the test.
      if (scope.test && !scope.suite) {
        if (kind.name === 'afterAll' || kind.name === 'afterEach') {
          editor.replace(node.callee.start, node.callee.end, 'onTestFinished');
        } else {
          editor.replace(node.start, node.end, `(${node.arguments.map(text).join(', ')})()`);
        }
        return;
      }
      editor.replace(node.callee.start, node.callee.end, kind.name);
      return;
    }
    const args = node.arguments;
    const fn = args.find(isFunction);
    const options = args.length > 1 && args[1].type === 'ObjectExpression' ? args[1] : null;
    const info = fn ? testFunctions.get(fn) : null;
    let name = kind.kind === 'suite' || (info && info.subtests) ? 'describe' : kind.name;
    let modifier = kind.modifier ? `.${kind.modifier}` : '';
    let timeout = '';
    let skipExpr = null;
    if (options) {
      for (const prop of options.properties) {
        if (prop.type !== 'Property') continue;
        const key = prop.key.name || prop.key.value;
        const value = prop.value;
        const truthyLiteral = value.type === 'Literal' && value.value;
        if (key === 'skip') {
          if (truthyLiteral) modifier = '.skip';
          else if (value.type !== 'Literal') {
            // node:test reads a computed skip when the test is registered, which may be after awaits of the parent
            // (hoisted into beforeAll here): decided inside the test, when those have run. A done test has no context.
            if (
              scope.test &&
              kind.kind !== 'suite' &&
              info &&
              !info.subtests &&
              !info.done &&
              fn &&
              fn.body.type === 'BlockStatement'
            ) {
              skipExpr = text(value);
            } else modifier = `.skipIf(${text(value)})`;
          }
        } else if (key === 'only' && truthyLiteral) modifier = '.only';
        else if (key === 'todo' && truthyLiteral) modifier = '.todo';
        else if (key === 'timeout') timeout = text(value);
      }
    }
    if (!fn) {
      name = name === 'describe' ? 'describe' : 'test';
      editor.replace(node.start, node.end, `${name}.todo(${args[0] ? text(args[0]) : "''"})`);
      return;
    }
    let body;
    if (name === 'describe') {
      body = describeFunction(fn, info);
    } else {
      rewriteParams(fn, info, skipExpr);
      body = text(fn);
    }
    const parts = [text(args[0]), body];
    if (timeout && name !== 'describe') parts.push(timeout);
    editor.replace(node.start, node.end, `${name}${modifier}(${parts.join(', ')})`);
  };

  // A test function without its context parameter; `ctx` when the context is still used for something else.
  const rewriteParams = (fn, info, skipExpr = null) => {
    if (!info) return;
    const bodyText = editor.text(fn.body.start, fn.body.end);
    const refs = info.ctx ? references(bodyText, info.ctx) : [];
    const params = [];
    if (info.done) {
      params.push(info.done);
      // Tests with a done callback get no context: references to it (assertNoWarning(t), fn.bind(t)) are null.
      const bare = refs.filter((ref) => bodyText[ref + info.ctx.length] !== '.');
      if (bare.length) {
        let replaced = '';
        let pos = 0;
        for (const ref of bare) {
          replaced += `${bodyText.slice(pos, ref)}null`;
          pos = ref + info.ctx.length;
        }
        editor.replace(fn.body.start, fn.body.end, replaced + bodyText.slice(pos));
      }
      if (bare.length < refs.length) todos.push('context used along with done');
    } else if (refs.length || skipExpr) {
      params.push('ctx');
      if (info.ctx !== 'ctx') {
        let renamed = '';
        let pos = 0;
        for (const ref of refs) {
          renamed += `${bodyText.slice(pos, ref)}ctx`;
          pos = ref + info.ctx.length;
        }
        editor.replace(fn.body.start, fn.body.end, renamed + bodyText.slice(pos));
      }
    }
    // A synchronous test with a plan: node:test waits for the planned assertions, which promises may make later.
    let isAsync = fn.async;
    if (!isAsync && !info.done && info.hasPlan && info.kind === 'test' && fn.body.type === 'BlockStatement') {
      isAsync = true;
      const current = editor.text(fn.body.start, fn.body.end);
      editor.replace(
        fn.body.start,
        fn.body.end,
        `${current.slice(0, -1)}\n  // The assertions of resolved promises run before the test ends.\n  await new Promise((resolve) => setImmediate(resolve))\n}`
      );
    }
    if (skipExpr) {
      const current = editor.text(fn.body.start, fn.body.end);
      editor.replace(
        fn.body.start,
        fn.body.end,
        `{
  if (${skipExpr}) ctx.skip(${skipExpr})${current.slice(1)}`
      );
    }
    const head =
      fn.type === 'ArrowFunctionExpression'
        ? `${isAsync ? 'async ' : ''}(${params.join(', ')}) => `
        : `${isAsync ? 'async ' : ''}function ${fn.id ? fn.id.name : ''}(${params.join(', ')}) `;
    editor.replace(fn.start, fn.body.start, head);
  };

  // Whether a statement awaits something itself (not in a function inside it).
  const containsAwait = (node) => {
    let found = false;
    const walk = (current) => {
      if (found || !current || typeof current.type !== 'string') return;
      if (current.type === 'AwaitExpression' || (current.type === 'ForOfStatement' && current.await)) {
        found = true;
        return;
      }
      if (/Function/.test(current.type)) return;
      forEachChild(current, walk);
    };
    walk(node);
    return found;
  };

  const declaredNames = (pattern, out = []) => {
    if (!pattern) return out;
    if (pattern.type === 'Identifier') out.push(pattern.name);
    else if (pattern.type === 'ObjectPattern') {
      for (const prop of pattern.properties)
        declaredNames(prop.type === 'RestElement' ? prop.argument : prop.value, out);
    } else if (pattern.type === 'ArrayPattern') {
      for (const element of pattern.elements) declaredNames(element, out);
    } else if (pattern.type === 'RestElement') declaredNames(pattern.argument, out);
    else if (pattern.type === 'AssignmentPattern') declaredNames(pattern.left, out);
    return out;
  };

  // What a statement of a test with subtests is: a subtest, something kept as it is (hooks, plan, functions), or
  // code to run.
  // Whether a statement registers tests (an if or a loop around test() calls).
  const registersTests = (node, names) => {
    let found = false;
    const walk = (current) => {
      if (found || !current || typeof current.type !== 'string' || /Function/.test(current.type)) return;
      if (current.type === 'CallExpression') {
        const kind = testKind(current, names);
        if (kind && kind.kind !== 'hook') {
          found = true;
          return;
        }
      }
      forEachChild(current, walk);
    };
    walk(node);
    return found;
  };

  const statementKind = (stmt, names) => {
    if (stmt.type === 'FunctionDeclaration' || stmt.type === 'EmptyStatement') return 'keep';
    if (stmt.type !== 'ExpressionStatement') return registersTests(stmt, names) ? 'test' : 'code';
    let expr = stmt.expression;
    if (expr.type === 'AwaitExpression') expr = expr.argument;
    if (expr.type !== 'CallExpression') return 'code';
    const kind = testKind(expr, names);
    if (kind) return kind.kind === 'hook' ? 'keep' : 'test';
    const { callee } = expr;
    if (
      callee.type === 'MemberExpression' &&
      !callee.computed &&
      callee.object.type === 'Identifier' &&
      names.has(callee.object.name) &&
      ['after', 'before', 'beforeEach', 'afterEach', 'plan', 'diagnostic'].includes(callee.property.name)
    ) {
      return 'keep';
    }
    return 'code';
  };

  // A test with subtests becomes a describe, whose body runs while collecting, before any test. node:test runs it in
  // order with the subtests: the code from its first await runs in a beforeAll (its variables declared in the
  // describe), code between subtests in a test of its own before the next one, and code after the last in an
  // afterAll.
  const describeFunction = (fn, info) => {
    if (fn.body.type !== 'BlockStatement') return `() => { ${editor.text(fn.body.start, fn.body.end)} }`;
    const names = info ? info.names : new Set(ctxNames);
    const body = sequence(fn.body.body, names, []);
    if (info && info.ctx && references(body, info.ctx).length) todos.push('context used in a describe');
    return `() => {\n${body}}`;
  };

  // The statements of a describe body, in the order node:test runs them. `initial` is code to run before them,
  // in the first beforeAll.
  const sequence = (statements, names, initial) => {
    const hoisted = [];
    let out = '';
    let deferred = initial.slice();
    let deferring = initial.length > 0;
    let seenTest = false;
    const flush = (beforeTest) => {
      if (deferred.length === 0) return;
      const body = deferred.join('\n');
      if (!seenTest) out += `beforeAll(async () => {\n${body}\n})\n`;
      else if (beforeTest) out += `test('(setup)', async () => {\n${body}\n})\n`;
      else out += `afterAll(async () => {\n${body}\n})\n`;
      deferred = [];
    };
    for (const stmt of statements) {
      const kind = statementKind(stmt, names);
      const stmtText = text(stmt);
      if (kind === 'keep') {
        out += `${stmtText}\n`;
      } else if (kind === 'test') {
        flush(true);
        out += `${stmtText}\n`;
        seenTest = true;
      } else if (!deferring && !seenTest && !containsAwait(stmt)) {
        out += `${stmtText}\n`;
      } else {
        deferring = true;
        if (stmt.type === 'VariableDeclaration') {
          for (const decl of stmt.declarations) {
            hoisted.push(...declaredNames(decl.id));
            if (!decl.init) continue;
            const assignment = `${text(decl.id)} = ${text(decl.init)}`;
            // A leading semicolon: the code converted may have none at the end of its lines (no ASI before '(' or '[').
            if (decl.id.type === 'ObjectPattern') deferred.push(`;(${assignment});`);
            else if (decl.id.type === 'ArrayPattern') deferred.push(`;${assignment};`);
            else deferred.push(`${assignment};`);
          }
        } else {
          deferred.push(/^[([`]/.test(stmtText) ? `;${stmtText}` : stmtText);
        }
      }
    }
    flush(false);
    const declarations = hoisted.length ? `let ${[...new Set(hoisted)].join(', ')};\n` : '';
    return declarations + out;
  };

  visit(ast, { ctxNames: new Set(), test: null, suite: false });

  // The requires of node:test go; the ones of node:assert too when nothing uses them any longer.
  for (const entry of imports.nodes) {
    const node = entry.assert ? entry.node : entry;
    if (entry.assert) {
      const rest = editor.text(0, node.start) + editor.text(node.end, src.length);
      const stillUsed = [...imports.assert].some((name) => name && new RegExp(`\\b${name}\\b`).test(rest));
      if (stillUsed || imports.assert.has(null)) continue;
    }
    editor.replace(node.start, node.end, '');
  }

  let out = editor.output();
  out = out.replace(/^\s*process\.removeAllListeners\('warning'\);?\s*$/m, '');
  return { code: out, todos, file };
}

module.exports = { convert, parse, Editor };
