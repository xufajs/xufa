// Converts type tests of tsd (expectType, expectError...) and of tstyche (expect(x).type.toBe<T>()...) to those of
// @xufa/test: expectTypeOf, assertType and // @ts-expect-error, which `xufa-test --typecheck` checks with tsc.
//
//   node tools/type-tests/convert.mjs <files or folders...>
//
// tstyche's files (*.tst.ts) are renamed *.test-d.ts, as @xufa/test finds them. After converting, run the type tests
// and then `node tools/type-tests/fix-directives.mjs <package>`: an expected error that falls on another line of a
// statement of several lines than the first needs its // @ts-expect-error moved to that line.
//
//   tsd                          @xufa/test
//   expectType<T>(v)             expectTypeOf(v).toEqualTypeOf<T>()
//   expectNotType<T>(v)          expectTypeOf(v).not.toEqualTypeOf<T>()
//   expectAssignable<T>(v)       assertType<T>(v)                       (v typed in the context of T, as tsd does)
//   expectNotAssignable<T>(v)    // @ts-expect-error  assertType<T>(v)
//   expectError(e)               // @ts-expect-error  e;
//
//   tstyche                                  @xufa/test
//   expect(v).type.toBe<T>()                 expectTypeOf(v).toEqualTypeOf<T>()       (expect<V>(): expectTypeOf<V>())
//   .type.toBeAssignableTo<T>()              .toMatchTypeOf<T>()
//   expect<V>().type.toBeAssignableFrom(v)   assertType<V>(v)       (from a type: expectTypeOf<U>().toMatchTypeOf<V>())
//   .type.toHaveProperty('k')                .toHaveProperty('k')
//   expect(f).type.toBeCallableWith(a)       f(a);
//   expect(e).type.toRaiseError()            // @ts-expect-error  e;
//   .type.not.<any of them>                  .not (expectTypeOf), or // @ts-expect-error above the statement
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const TSD = new Set(['expectType', 'expectNotType', 'expectAssignable', 'expectNotAssignable', 'expectError']);

function filesOf(targets) {
  const files = [];
  const walk = (target) => {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(target)) if (name !== 'node_modules') walk(path.join(target, name));
    } else if (/\.(test-d|tst)\.[cm]?ts$/.test(target)) {
      files.push(target);
    }
  };
  targets.forEach(walk);
  return files;
}

// The source of a node as written (its comments before it left out).
const textOf = (source, node) => source.text.slice(node.getStart(source), node.end);
const typeArg = (source, call) => (call.typeArguments?.length ? textOf(source, call.typeArguments[0]) : null);

// A tstyche assertion: expect(...)/expect<T>() . type [. not] . matcher(...): its parts, or null.
function tstycheParts(source, call) {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  const matcher = call.expression.name.text;
  let target = call.expression.expression;
  let not = false;
  if (ts.isPropertyAccessExpression(target) && target.name.text === 'not') {
    not = true;
    target = target.expression;
  }
  if (!ts.isPropertyAccessExpression(target) || target.name.text !== 'type') return null;
  const subject = target.expression;
  if (!ts.isCallExpression(subject) || !ts.isIdentifier(subject.expression) || subject.expression.text !== 'expect') {
    return null;
  }
  return {
    matcher,
    not,
    subjectType: typeArg(source, subject),
    subject: subject.arguments.length ? textOf(source, subject.arguments[0]) : null,
    type: typeArg(source, call),
    args: call.arguments.map((arg) => textOf(source, arg)),
  };
}

// The statement that replaces an assertion: { code, expectError } (expectError: // @ts-expect-error above it).
function convertTstyche(parts) {
  const { matcher, not, subjectType, subject, type, args } = parts;
  const of = subjectType ? `expectTypeOf<${subjectType}>()` : `expectTypeOf(${subject})`;
  const expected = type ? `<${type}>()` : `(${args[0] ?? ''})`;
  const negate = not ? '.not' : '';
  switch (matcher) {
    case 'toBe':
      return { code: `${of}${negate}.toEqualTypeOf${expected}` };
    case 'toBeAssignableTo':
      return { code: `${of}${negate}.toMatchTypeOf${expected}` };
    case 'toHaveProperty':
      return { code: `${of}${negate}.toHaveProperty(${args.join(', ')})` };
    case 'toBeAssignableFrom': {
      const into = subjectType ?? `typeof ${subject}`;
      if (type) return { code: `expectTypeOf<${type}>()${negate}.toMatchTypeOf<${into}>()` };
      return { code: `assertType<${into}>(${args[0]})`, expectError: not };
    }
    case 'toBeCallableWith':
      return { code: `(${subject})(${args.join(', ')})`, expectError: not };
    case 'toRaiseError':
      return { code: subject, expectError: !not };
    default:
      throw new Error(`tstyche matcher not converted: ${matcher}`);
  }
}

function convertTsd(name, source, call) {
  const type = typeArg(source, call);
  const value = call.arguments.length ? textOf(source, call.arguments[0]) : '';
  switch (name) {
    case 'expectType':
      return { code: `expectTypeOf(${value}).toEqualTypeOf<${type}>()` };
    case 'expectNotType':
      return { code: `expectTypeOf(${value}).not.toEqualTypeOf<${type}>()` };
    case 'expectAssignable':
      return { code: `assertType<${type}>(${value})` };
    case 'expectNotAssignable':
      return { code: `assertType<${type}>(${value})`, expectError: true };
    case 'expectError':
      return { code: value, expectError: true };
    default:
      throw new Error(name);
  }
}

// The assertion a call is, converted: { code, expectError }, or null.
function convertCall(source, call) {
  if (ts.isIdentifier(call.expression) && TSD.has(call.expression.text)) {
    return convertTsd(call.expression.text, source, call);
  }
  const parts = tstycheParts(source, call);
  return parts ? convertTstyche(parts) : null;
}

// Converts a file (again, too: what is converted is left as it is). Gives { file, assertions }, or null when there was
// nothing of tsd or tstyche in it.
function convertFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const edits = [];
  const used = new Set();
  const tstycheNames = [];
  let oldImport = null;
  let ownImport = null;
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      const from = node.moduleSpecifier.text;
      if (from === 'tsd' || from === 'tstyche') {
        oldImport = node;
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            if (['describe', 'test', 'it'].includes(element.name.text)) tstycheNames.push(element.name.text);
          }
        }
        return;
      }
      if (from === '@xufa/test') ownImport = node;
    }
    if (ts.isCallExpression(node)) {
      const converted = convertCall(source, node);
      if (converted) {
        if (/expectTypeOf/.test(converted.code)) used.add('expectTypeOf');
        if (/assertType</.test(converted.code)) used.add('assertType');
        // As a statement: replaced with its ;, and its // @ts-expect-error above it. Inside an expression (a
        // callback's body): the call alone; an expected error there is above the line the call starts on.
        const statement = ts.isExpressionStatement(node.parent) && node.parent.expression === node;
        edits.push({ node: statement ? node.parent : node, statement, ...converted });
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const renamed = file.endsWith('.tst.ts');
  if (!oldImport && edits.length === 0 && !renamed) return null;
  // The names the file takes from @xufa/test: those it took, and those the converted assertions use.
  const names = new Set([...used, ...tstycheNames]);
  const bindings = ownImport?.importClause?.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) bindings.elements.forEach((element) => names.add(element.name.text));
  const importLine = names.size ? `import { ${[...names].sort().join(', ')} } from '@xufa/test';` : '';
  const replacements = edits
    .map((edit) => {
      const start = edit.node.getStart(source);
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const indent = text.slice(lineStart, start).match(/^\s*/)[0];
      if (edit.statement) {
        // (Code that starts with ( [ or ` after a line without a semicolon would go on that line: a ; before it.)
        const code = /^[([`]/.test(edit.code) ? `;${edit.code}` : edit.code;
        return {
          start,
          end: edit.node.end,
          text: edit.expectError ? `// @ts-expect-error\n${indent}${code};` : `${code};`,
        };
      }
      if (!edit.expectError) return { start, end: edit.node.end, text: edit.code };
      // (An expected error inside an expression: the directive on a line of its own above the line of the call.)
      return [
        { start: lineStart, end: lineStart, text: `${indent}// @ts-expect-error\n` },
        { start, end: edit.node.end, text: edit.code },
      ];
    })
    .flat();
  if (ownImport) replacements.push({ start: ownImport.getStart(source), end: ownImport.end, text: importLine });
  if (oldImport) {
    replacements.push({ start: oldImport.getStart(source), end: oldImport.end, text: ownImport ? '' : importLine });
  } else if (!ownImport && importLine) {
    replacements.push({ start: 0, end: 0, text: `${importLine}\n` });
  }
  let out = text;
  for (const edit of replacements.sort((a, b) => b.start - a.start || b.end - a.end)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  const target = file.replace(/\.tst\.ts$/, '.test-d.ts');
  fs.writeFileSync(target, out);
  if (target !== file) fs.rmSync(file);
  return { file: target, assertions: edits.length };
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('usage: node tools/type-tests/convert.mjs <files or folders...>');
  process.exit(2);
}
let total = 0;
for (const file of filesOf(targets)) {
  const result = convertFile(file);
  if (!result) continue;
  total += result.assertions;
  console.log(`${path.relative(process.cwd(), result.file)}: ${result.assertions}`);
}
console.log(`${total} assertions converted`);
