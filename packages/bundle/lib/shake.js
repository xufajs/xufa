// Tree shaking of ES modules: the top-level statements of each module that nothing used needs are left out, and
// modules nothing uses that have no side effects ("sideEffects": false in their package, or only declarations) are
// not bundled.
//
// A statement is kept when it has side effects (anything but declarations of functions, classes and values made
// without running code: literals, functions, objects and arrays of those, /* @__PURE__ */ calls...), or when it
// declares what a kept statement uses or what importers use of the module's exports. What modules use of each other
// grows until nothing changes.
import path from 'node:path';
import { analyze } from './scope.js';
import { packageOf } from './resolve.js';
import { scriptKind } from './transform.js';

// Globals that reading cannot throw or run code.
const KNOWN_GLOBALS = new Set(
  (
    'Object Array Symbol Math JSON Number String Boolean Map Set WeakMap WeakSet WeakRef Promise Date RegExp Error ' +
    'TypeError RangeError SyntaxError undefined NaN Infinity globalThis Reflect Proxy Intl BigInt Uint8Array ' +
    'ArrayBuffer DataView Float32Array Float64Array Int32Array Uint32Array Uint16Array Int16Array Int8Array'
  ).split(' ')
);

const ALL = 'all';

function isPureCall(t, source, node) {
  const text = source.text;
  for (let pos = node.pos; pos < node.getStart(source); pos++) {
    if (text.startsWith('__PURE__', pos) || text.startsWith('@__PURE__', pos)) return true;
  }
  return false;
}

// Whether evaluating the expression runs no code of anyone (and cannot throw).
function pure(t, source, node, bound) {
  if (!node) return true;
  const k = t.SyntaxKind;
  switch (node.kind) {
    case k.StringLiteral:
    case k.NumericLiteral:
    case k.BigIntLiteral:
    case k.NoSubstitutionTemplateLiteral:
    case k.RegularExpressionLiteral:
    case k.TrueKeyword:
    case k.FalseKeyword:
    case k.NullKeyword:
    case k.ArrowFunction:
    case k.FunctionExpression:
    case k.ThisKeyword:
      return true;
    case k.Identifier:
      return bound(node) || KNOWN_GLOBALS.has(node.text);
    case k.ParenthesizedExpression:
    case k.AsExpression:
    case k.SatisfiesExpression:
    case k.NonNullExpression:
      return pure(t, source, node.expression, bound);
    case k.VoidExpression:
    case k.TypeOfExpression:
      return pure(t, source, node.expression, bound);
    case k.PrefixUnaryExpression:
      return (node.operator === k.ExclamationToken || node.operator === k.MinusToken) && literalish(t, node.operand);
    case k.ConditionalExpression:
      return [node.condition, node.whenTrue, node.whenFalse].every((part) => pure(t, source, part, bound));
    case k.BinaryExpression: {
      const operator = node.operatorToken.kind;
      const logical = [k.AmpersandAmpersandToken, k.BarBarToken, k.QuestionQuestionToken, k.CommaToken];
      const compare = [k.EqualsEqualsEqualsToken, k.ExclamationEqualsEqualsToken];
      return (
        (logical.includes(operator) || compare.includes(operator)) &&
        pure(t, source, node.left, bound) &&
        pure(t, source, node.right, bound)
      );
    }
    case k.ArrayLiteralExpression:
      return node.elements.every((element) => !t.isSpreadElement(element) && pure(t, source, element, bound));
    case k.ObjectLiteralExpression:
      return node.properties.every((property) => {
        if (t.isSpreadAssignment(property)) return false;
        if (
          property.name &&
          t.isComputedPropertyName(property.name) &&
          !pure(t, source, property.name.expression, bound)
        ) {
          return false;
        }
        if (t.isPropertyAssignment(property)) return pure(t, source, property.initializer, bound);
        if (t.isShorthandPropertyAssignment(property)) return pure(t, source, property.name, bound);
        return true; // methods, getters, setters
      });
    case k.PropertyAccessExpression:
      // Of a module's own binding (an import, a namespace): no getters there.
      return t.isIdentifier(node.expression) && bound(node.expression);
    case k.ClassExpression:
      return pureClass(t, source, node, bound);
    case k.CallExpression:
    case k.NewExpression:
      return (
        isPureCall(t, source, node) && (node.arguments ?? []).every((argument) => pure(t, source, argument, bound))
      );
    case k.TemplateExpression:
      return false;
    default:
      return false;
  }
}

const literalish = (t, node) =>
  node.kind === t.SyntaxKind.NumericLiteral ||
  node.kind === t.SyntaxKind.StringLiteral ||
  node.kind === t.SyntaxKind.BigIntLiteral;

function pureClass(t, source, node, bound) {
  if (t.canHaveDecorators(node) && t.getDecorators(node)?.length) return false;
  const heritage = node.heritageClauses?.flatMap((clause) => clause.types.map((type) => type.expression)) ?? [];
  if (!heritage.every((expression) => pure(t, source, expression, bound))) return false;
  return node.members.every((member) => {
    if (t.isClassStaticBlockDeclaration(member)) return false;
    if (t.canHaveDecorators(member) && t.getDecorators(member)?.length) return false;
    if (member.name && t.isComputedPropertyName(member.name) && !pure(t, source, member.name.expression, bound)) {
      return false;
    }
    const isStatic = member.modifiers?.some((modifier) => modifier.kind === t.SyntaxKind.StaticKeyword);
    return !(t.isPropertyDeclaration(member) && isStatic && !pure(t, source, member.initializer, bound));
  });
}

const hasModifier = (t, node, kind) => node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;

/**
 * What tree shaking needs of an ES module (null for one that is not: no import and no export): its statements (what
 * each declares and uses at the top level, and whether it is pure), its imports, its exports and its export *.
 */
function moduleInfo(t, file, text) {
  const source = t.createSourceFile(
    file,
    text,
    { languageVersion: t.ScriptTarget.Latest, jsDocParsingMode: t.JSDocParsingMode.ParseNone },
    true,
    scriptKind(t, file)
  );
  const isModule = source.statements.some(
    (statement) =>
      t.isImportDeclaration(statement) ||
      t.isExportDeclaration(statement) ||
      t.isExportAssignment(statement) ||
      hasModifier(t, statement, t.SyntaxKind.ExportKeyword)
  );
  if (!isModule) return null;
  const { root, references } = analyze(t, source);
  const topLevel = (binding) => binding?.scope === root;
  const resolved = new Map(references);
  // Whether a name read at the top level is the module's (not a global).
  const bound = (identifier) => Boolean(resolved.get(identifier));
  // Statement of each node: walk up to the top.
  const statementOf = (node) => {
    while (node.parent !== source) node = node.parent;
    return node;
  };
  const statements = source.statements.map((node) => ({ node, declares: new Set(), uses: new Set(), pure: true }));
  const byNode = new Map(statements.map((statement) => [statement.node, statement]));
  for (const binding of root.bindings.values()) {
    for (const declaration of binding.declarations) byNode.get(statementOf(declaration)).declares.add(binding.name);
  }
  for (const [node, binding] of references) {
    if (topLevel(binding)) byNode.get(statementOf(node)).uses.add(binding.name);
  }

  const imports = new Map(); // local -> { specifier, imported } ('*' for a namespace)
  const exports = new Map(); // exported -> { local } or { specifier, imported }
  const stars = [];
  const isBound = bound;
  // The directives at the start ('use strict').
  let prologue = 0;
  while (
    prologue < statements.length &&
    t.isExpressionStatement(statements[prologue].node) &&
    t.isStringLiteral(statements[prologue].node.expression)
  ) {
    statements[prologue].keep = true;
    prologue += 1;
  }
  for (const statement of statements) {
    const node = statement.node;
    if (t.isImportDeclaration(node)) {
      const specifier = node.moduleSpecifier.text;
      statement.specifier = specifier;
      const clause = node.importClause;
      if (clause?.name) imports.set(clause.name.text, { specifier, imported: 'default' });
      if (clause?.namedBindings) {
        if (t.isNamespaceImport(clause.namedBindings)) {
          imports.set(clause.namedBindings.name.text, { specifier, imported: '*' });
        } else {
          for (const element of clause.namedBindings.elements) {
            imports.set(element.name.text, { specifier, imported: (element.propertyName ?? element.name).text });
          }
        }
      }
    } else if (t.isExportDeclaration(node)) {
      if (node.isTypeOnly) continue;
      const specifier = node.moduleSpecifier?.text;
      statement.specifier = specifier;
      if (!node.exportClause) stars.push(specifier);
      else if (t.isNamespaceExport(node.exportClause)) {
        exports.set(node.exportClause.name.text, { specifier, imported: '*' });
      } else {
        for (const element of node.exportClause.elements) {
          const local = (element.propertyName ?? element.name).text;
          exports.set(element.name.text, specifier ? { specifier, imported: local } : { local });
        }
      }
    } else if (t.isExportAssignment(node)) {
      statement.pure = pure(t, source, node.expression, isBound);
      if (t.isIdentifier(node.expression) && topLevel(root.lookup(node.expression.text))) {
        // (The statement exports it: kept with it.)
        exports.set('default', { local: node.expression.text, statement });
      } else {
        statement.declares.add('*default*');
        exports.set('default', { local: '*default*' });
      }
    } else if (t.isFunctionDeclaration(node) || t.isClassDeclaration(node)) {
      if (t.isClassDeclaration(node)) statement.pure = pureClass(t, source, node, isBound);
      if (hasModifier(t, node, t.SyntaxKind.ExportKeyword)) {
        const isDefault = hasModifier(t, node, t.SyntaxKind.DefaultKeyword);
        const local = node.name?.text ?? '*default*';
        if (!node.name) statement.declares.add('*default*');
        exports.set(isDefault ? 'default' : local, { local });
      }
    } else if (t.isVariableStatement(node)) {
      statement.pure = node.declarationList.declarations.every((declaration) =>
        pure(t, source, declaration.initializer, isBound)
      );
      // Destructuring runs code (getters, iterators).
      if (node.declarationList.declarations.some((declaration) => !t.isIdentifier(declaration.name))) {
        statement.pure = false;
      }
      if (hasModifier(t, node, t.SyntaxKind.ExportKeyword)) {
        for (const name of statement.declares) exports.set(name, { local: name });
      }
    } else if (t.isEmptyStatement(node)) {
      statement.pure = true;
    } else if (statement.keep) {
      statement.pure = true;
    } else {
      statement.pure = false;
    }
  }
  return { source, text, statements, imports, exports, stars };
}

// Whether the package of a file says the file has no side effects.
function sideEffectFree(file) {
  const found = packageOf(file);
  const flag = found?.pkg.sideEffects;
  if (flag === false) return true;
  if (Array.isArray(flag)) {
    const relative = path.relative(found.dir, file).split(path.sep).join('/');
    return !flag.some((pattern) => globMatch(pattern.replace(/^\.\//, ''), relative));
  }
  return false;
}

function globMatch(pattern, file) {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/?/g, '')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(//g, '.*');
  return new RegExp(pattern.includes('/') ? `^${regex}$` : `(^|/)${regex}$`).test(file);
}

/**
 * Tree shaking of a graph. `modules`: Map(file -> { info (moduleInfo or null), dependencies: Map(specifier -> file
 * or null), css }), `entry` its first file. Gives Map(file -> pruned source, or null for kept as is) of the modules
 * to bundle; those not in it are left out.
 */
function shake(t, modules, entry) {
  const state = new Map(); // file -> { used: Set | ALL, included }
  const effects = new Map();
  const hasEffects = (file) => {
    if (!effects.has(file)) {
      const module = modules.get(file);
      effects.set(
        file,
        !sideEffectFree(file) &&
          (module.css || !module.info || module.info.statements.some((statement) => !statement.pure && !statement.keep))
      );
    }
    return effects.get(file);
  };
  const queue = [];
  const mark = (file, names) => {
    if (!file) return;
    let entry = state.get(file);
    if (!entry) {
      entry = { used: new Set(), included: false };
      state.set(file, entry);
    }
    let changed = false;
    if (names === ALL) {
      if (entry.used !== ALL) {
        entry.used = ALL;
        changed = true;
      }
    } else if (entry.used !== ALL) {
      for (const name of names) {
        if (!entry.used.has(name)) {
          entry.used.add(name);
          changed = true;
        }
      }
    }
    // Included when something of it is used, or for its side effects.
    const include = entry.used === ALL || entry.used.size > 0 || hasEffects(file);
    if (include && !entry.included) {
      entry.included = true;
      changed = true;
    }
    if (changed && entry.included) queue.push(file);
  };

  const live = new Map(); // file -> { statements: Set, imports: Set(local) }
  const walk = (file) => {
    const module = modules.get(file);
    const { used } = state.get(file);
    const dependency = (specifier) => module.dependencies.get(specifier) ?? null;
    if (!module.info) {
      for (const target of module.dependencies.values()) mark(target, ALL);
      return;
    }
    const { info } = module;
    const kept = new Set();
    const importsUsed = new Set();
    const declaredBy = new Map();
    for (const statement of info.statements) {
      for (const name of statement.declares) {
        if (!declaredBy.has(name)) declaredBy.set(name, []);
        declaredBy.get(name).push(statement);
      }
    }
    const work = [];
    const keep = (statement) => {
      if (!kept.has(statement)) {
        kept.add(statement);
        work.push(statement);
      }
    };
    const need = (name) => {
      const imported = info.imports.get(name);
      if (imported) {
        if (!importsUsed.has(name)) {
          importsUsed.add(name);
          mark(dependency(imported.specifier), imported.imported === '*' ? ALL : [imported.imported]);
        }
        return;
      }
      (declaredBy.get(name) ?? []).forEach(keep);
    };
    for (const statement of info.statements) {
      if (!statement.pure || statement.keep) keep(statement);
    }
    const exported = used === ALL ? [...info.exports.keys()] : [...used];
    const forStars = [];
    for (const name of exported) {
      const target = info.exports.get(name);
      if (!target) {
        if (name !== 'default') forStars.push(name);
        continue;
      }
      if (target.statement) keep(target.statement);
      if (target.local !== undefined) need(target.local);
      else mark(dependency(target.specifier), target.imported === '*' ? ALL : [target.imported]);
    }
    for (const specifier of info.stars) mark(dependency(specifier), used === ALL ? ALL : forStars);
    while (work.length) {
      const statement = work.pop();
      for (const name of statement.uses) need(name);
    }
    // Side-effect imports, and dependencies of the module that are not imports (require(), import()).
    const importSpecifiers = new Set(
      info.statements.filter((statement) => statement.specifier !== undefined).map((statement) => statement.specifier)
    );
    for (const statement of info.statements) {
      if (t.isImportDeclaration(statement.node) && !statement.node.importClause)
        mark(dependency(statement.specifier), []);
    }
    for (const [specifier, target] of module.dependencies) {
      if (!importSpecifiers.has(specifier)) mark(target, ALL);
    }
    for (const specifier of info.stars) mark(dependency(specifier), []);
    live.set(file, { statements: kept, imports: importsUsed });
  };

  mark(entry, ALL);
  while (queue.length) walk(queue.shift());

  const result = new Map();
  for (const [file, { included }] of state) {
    if (!included) continue;
    const module = modules.get(file);
    result.set(file, module.info ? prune(t, module, live.get(file), state.get(file).used, state, hasEffects) : null);
  }
  return result;
}

// The source of a module without what tree shaking left out.
function prune(t, module, { statements: kept, imports: importsUsed }, used, state, hasEffects) {
  const { info } = module;
  const { source, text } = info;
  const edits = [];
  const included = (specifier) => {
    const file = module.dependencies.get(specifier);
    return Boolean(file && state.get(file)?.included && hasEffects(file));
  };
  const replace = (node, replacement) => edits.push([node.getStart(source), node.end, replacement]);
  const effectImport = (specifier) => (included(specifier) ? `import ${JSON.stringify(specifier)};` : '');
  for (const statement of info.statements) {
    const { node } = statement;
    if (t.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (!clause) continue;
      const locals = [];
      if (clause.name) locals.push(clause.name.text);
      if (clause.namedBindings) {
        if (t.isNamespaceImport(clause.namedBindings)) locals.push(clause.namedBindings.name.text);
        else locals.push(...clause.namedBindings.elements.map((element) => element.name.text));
      }
      if (!locals.some((local) => importsUsed.has(local))) replace(node, effectImport(statement.specifier));
    } else if (t.isExportDeclaration(node)) {
      if (!node.exportClause || t.isNamespaceExport(node.exportClause)) {
        if (node.exportClause && used !== ALL && !used.has(node.exportClause.name.text)) {
          replace(node, effectImport(statement.specifier));
        }
        continue;
      }
      const elements = node.exportClause.elements.filter((element) => used === ALL || used.has(element.name.text));
      if (elements.length === node.exportClause.elements.length) continue;
      if (!elements.length) {
        replace(node, statement.specifier ? effectImport(statement.specifier) : '');
        continue;
      }
      const list = elements.map((element) => element.getText(source)).join(', ');
      replace(node, `export { ${list} }${statement.specifier ? ` from ${JSON.stringify(statement.specifier)}` : ''};`);
    } else if (!kept.has(statement)) {
      replace(node, '');
    }
  }
  if (!edits.length) return text;
  edits.sort((a, b) => b[0] - a[0]);
  let out = text;
  for (const [start, end, replacement] of edits) out = out.slice(0, start) + replacement + out.slice(end);
  return out;
}

export { shake, moduleInfo, sideEffectFree };
