// Modules as one ES module, by scope hoisting: the code of every module in one scope, in the order ES modules run
// (each after what it imports), its top-level names renamed where they would clash, and each import a reference to
// the binding it imports (through re-exports), so engines read imports as they read their own variables.
//
// - export statements become their declarations (export default x: a const of it); import statements go.
// - import * as ns: ns.name is the binding; ns alone, an object of getters made when first used.
// - import(): a promise of that object (the module is in the bundle, run with the others).
// - CommonJS modules: functions run on first use (a require() of them), as in a bundle of CommonJS.
// - Modules of Node.js and external ones: imports of the bundle (CommonJS gets them from createRequire()).
//
// A top-level name keeps its name when no other module declares that name anywhere (and it is no global); else it
// gets name$1, name$2... (names that are nowhere in the code).

import path from 'node:path';
import { analyze } from './scope.js';

const RESERVED = new Set(['arguments', 'eval', 'undefined', 'NaN', 'Infinity']);

/**
 * One ES module of the graph (from bundle()'s discovery): `modules` Map(key -> { file, kind, source, dependencies,
 * pruned }), `entry` its key. Gives the code.
 */
function hoist(t, modules, entry, { banner = '', kept = null } = {}) {
  const parsed = new Map(); // key -> { source, text, root, references, isModule }
  const order = [];
  const seen = new Set();
  const cjs = [];
  const externals = new Map(); // request -> { index, default: bool, namespace: bool }

  const sourceOf = (key) => {
    if (parsed.has(key)) return parsed.get(key);
    const module = modules.get(key);
    const text = module.pruned ?? module.source;
    const source = t.createSourceFile(
      module.file ?? key,
      text,
      { languageVersion: t.ScriptTarget.Latest, jsDocParsingMode: t.JSDocParsingMode.ParseNone },
      true,
      t.ScriptKind.JS
    );
    // (From what it was: tree shaking may have left nothing of it. moduleInfo() is null for CommonJS.)
    const isModule =
      module.info !== undefined
        ? module.info !== null
        : source.statements.some(
            (node) =>
              t.isImportDeclaration(node) ||
              t.isExportDeclaration(node) ||
              t.isExportAssignment(node) ||
              node.modifiers?.some((modifier) => modifier.kind === t.SyntaxKind.ExportKeyword)
          );
    const { root, references, globals } = analyze(t, source);
    const info = { key, source, text, root, references, globals, isModule, module };
    parsed.set(key, info);
    return info;
  };

  const isExternal = (key) => key.startsWith('external:');
  const requestOf = (key) => key.slice('external:'.length);

  // The order ES modules run in: what a module imports first (in the order it imports it), then itself.
  const visit = (key) => {
    if (seen.has(key) || (kept && !isExternal(key) && !kept.has(key))) return;
    seen.add(key);
    if (isExternal(key)) return;
    const module = modules.get(key);
    if (module.kind === 'shim' || module.kind === 'json' || module.kind === 'css') {
      order.push(key);
      return;
    }
    const info = sourceOf(key);
    if (!info.isModule) {
      cjs.push(key);
      for (const target of module.dependencies.values()) visit(target);
      return;
    }
    for (const statement of info.source.statements) {
      const specifier =
        (t.isImportDeclaration(statement) || t.isExportDeclaration(statement)) && statement.moduleSpecifier?.text;
      if (specifier) visit(module.dependencies.get(specifier));
    }
    order.push(key);
  };
  visit(entry);
  // Modules only import() reaches: after the others.
  for (let index = 0; index < order.length; index++) {
    const module = modules.get(order[index]);
    for (const target of module.dependencies.values()) visit(target);
  }

  // Names: every identifier of the code, and what each module declares in any of its scopes.
  const everywhere = new Set();
  const declaredIn = new Map(); // name -> Set(key)
  for (const info of parsed.values()) {
    const collect = (node) => {
      if (t.isIdentifier(node)) everywhere.add(node.text);
      t.forEachChild(node, collect);
    };
    collect(info.source);
    for (const global of info.globals) everywhere.add(global);
    const declare = (scope) => {
      for (const [name, binding] of scope.bindings) {
        if (binding.declarations.every((node) => isImported(t, node))) continue;
        if (!declaredIn.has(name)) declaredIn.set(name, new Set());
        declaredIn.get(name).add(info.key);
      }
      scope.children.forEach(declare);
    };
    declare(info.root);
  }
  const globals = new Set([...parsed.values()].flatMap((info) => [...info.globals]));
  let counter = 0;
  const fresh = (base) => {
    let name;
    do name = `${base}$${++counter}`;
    while (everywhere.has(name) || RESERVED.has(name));
    everywhere.add(name);
    return name;
  };
  const taken = new Set();
  // The name of a top-level binding of a module.
  const finalNames = new Map(); // key -> Map(local -> name)
  const nameFor = (key, local) => {
    const own = declaredIn.get(local);
    const clash = (own && [...own].some((other) => other !== key)) || globals.has(local) || taken.has(local);
    const name = clash ? fresh(local) : local;
    taken.add(name);
    return name;
  };

  // Exports of each module: name -> { local } | { generated } | { from: key, name } | { namespace: key }; stars: [key].
  const exportsOf = new Map();
  const defaultName = new Map();
  for (const key of order) {
    const module = modules.get(key);
    if (module.kind !== 'js') continue;
    const info = parsed.get(key);
    if (!info.isModule) continue;
    const names = new Map();
    for (const binding of info.root.bindings.values()) {
      if (binding.declarations.every((node) => isImported(t, node))) continue;
      names.set(binding.name, nameFor(key, binding.name));
    }
    finalNames.set(key, names);
    const map = new Map();
    const stars = [];
    for (const statement of info.source.statements) {
      const dependency = (node) => module.dependencies.get(node.moduleSpecifier.text);
      if (t.isExportDeclaration(statement)) {
        if (statement.isTypeOnly) continue;
        if (!statement.exportClause) {
          stars.push(dependency(statement));
        } else if (t.isNamespaceExport(statement.exportClause)) {
          map.set(statement.exportClause.name.text, { namespace: dependency(statement) });
        } else {
          for (const element of statement.exportClause.elements) {
            const local = (element.propertyName ?? element.name).text;
            map.set(
              element.name.text,
              statement.moduleSpecifier ? { from: dependency(statement), name: local } : { local }
            );
          }
        }
      } else if (t.isExportAssignment(statement)) {
        if (t.isIdentifier(statement.expression) && info.root.bindings.has(statement.expression.text)) {
          map.set('default', { local: statement.expression.text });
        } else {
          const name = fresh('__default');
          defaultName.set(key, name);
          map.set('default', { generated: name });
        }
      } else if (statement.modifiers?.some((modifier) => modifier.kind === t.SyntaxKind.ExportKeyword)) {
        const isDefault = statement.modifiers.some((modifier) => modifier.kind === t.SyntaxKind.DefaultKeyword);
        if (t.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            for (const name of boundNames(t, declaration.name)) map.set(name, { local: name });
          }
        } else if (statement.name) {
          map.set(isDefault ? 'default' : statement.name.text, { local: statement.name.text });
        } else {
          const name = fresh('__default');
          defaultName.set(key, name);
          map.set('default', { generated: name });
        }
      }
    }
    exportsOf.set(key, { map, stars });
  }

  // What an import of `name` from module `key` is: an expression (a name, or a member of a CommonJS module).
  const namespaces = new Map(); // key -> name of its function
  const namespaceOf = (key) => {
    if (!namespaces.has(key)) namespaces.set(key, fresh('__namespace'));
    return `${namespaces.get(key)}()`;
  };
  const cjsName = new Map();
  for (const key of cjs) cjsName.set(key, fresh('__commonjs'));
  const externalOf = (key) => {
    const request = requestOf(key);
    if (!externals.has(request)) externals.set(request, { name: fresh('__external') });
    return externals.get(request);
  };
  const resolveExport = (key, name, seenStars = new Set()) => {
    if (isExternal(key)) {
      const external = externalOf(key);
      if (name === 'default') {
        external.default = true;
        return `${external.name}_default`;
      }
      external.namespace = true;
      return `${external.name}.${name}`;
    }
    if (cjsName.has(key)) {
      return name === 'default' ? `${cjsName.get(key)}()` : `${cjsName.get(key)}().${name}`;
    }
    const module = modules.get(key);
    if (module.kind === 'json') return name === 'default' ? jsonName(key) : `${jsonName(key)}.${name}`;
    const exported = exportsOf.get(key);
    if (!exported) throw new Error(`${module.file}: not an ES module, imported as one`);
    const entry = exported.map.get(name);
    if (entry) {
      if (entry.local) {
        const from = importsOf(key).get(entry.local);
        if (!from) return finalNames.get(key).get(entry.local);
        if (from.namespace) return namespaceObjectExpression(from.namespace);
        return resolveExport(from.target, from.name, seenStars);
      }
      if (entry.generated) return entry.generated;
      if (entry.namespace) return namespaceOf(entry.namespace);
      return resolveExport(entry.from, entry.name, seenStars);
    }
    if (name !== 'default') {
      for (const star of exported.stars) {
        if (seenStars.has(star)) continue;
        seenStars.add(star);
        const found = tryResolve(star, name, seenStars);
        if (found) return found;
      }
    }
    throw new Error(`${module.file}: no export ${name}`);
  };
  const tryResolve = (key, name, seenStars) => {
    try {
      return resolveExport(key, name, seenStars);
    } catch {
      return null;
    }
  };
  // All the names a module exports (its own and those of export *).
  const exportedNames = (key, seenStars = new Set()) => {
    if (seenStars.has(key)) return [];
    seenStars.add(key);
    const exported = exportsOf.get(key);
    if (!exported) return [];
    const names = new Set(exported.map.keys());
    for (const star of exported.stars) {
      for (const name of exportedNames(star, seenStars)) if (name !== 'default') names.add(name);
    }
    return [...names];
  };
  // What each module imports: local -> { target, name } | { namespace: target }.
  const importsCache = new Map();
  const importsOf = (key) => {
    if (importsCache.has(key)) return importsCache.get(key);
    const map = new Map();
    const module = modules.get(key);
    for (const statement of parsed.get(key).source.statements) {
      if (!t.isImportDeclaration(statement)) continue;
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) continue;
      const target = module.dependencies.get(statement.moduleSpecifier.text);
      if (clause.name) map.set(clause.name.text, { target, name: 'default' });
      if (clause.namedBindings) {
        if (t.isNamespaceImport(clause.namedBindings)) map.set(clause.namedBindings.name.text, { namespace: target });
        else {
          for (const element of clause.namedBindings.elements) {
            if (!element.isTypeOnly)
              map.set(element.name.text, { target, name: (element.propertyName ?? element.name).text });
          }
        }
      }
    }
    importsCache.set(key, map);
    return map;
  };
  const jsonNames = new Map();
  const jsonName = (key) => {
    if (!jsonNames.has(key)) jsonNames.set(key, fresh('__json'));
    return jsonNames.get(key);
  };

  // The code of each ES module, rewritten.
  const parts = [];
  for (const key of order) {
    const module = modules.get(key);
    if (module.kind === 'json') {
      parts.push(`const ${jsonName(key)} = ${module.source.trim()};`);
      continue;
    }
    if (module.kind !== 'js') continue;
    const info = parsed.get(key);
    if (!info.isModule) continue;
    parts.push(
      `// ${module.file ? path.basename(path.dirname(module.file)) + '/' + path.basename(module.file) : key}\n${rewrite(info)}`
    );
  }

  function rewrite(info) {
    const { source, text, key } = info;
    const module = modules.get(key);
    const names = finalNames.get(key);
    const edits = [];
    const replace = (start, end, value) => edits.push([start, end, value]);
    // What each imported local is.
    const imported = new Map(); // local -> { expression } | { namespace: key }
    for (const [local, from] of importsOf(key)) {
      // (Resolved where it is used: tree shaking leaves imports of names nothing uses any more.)
      imported.set(
        local,
        from.namespace
          ? from
          : {
              get expression() {
                return resolveExport(from.target, from.name);
              },
            }
      );
    }
    for (const statement of source.statements) {
      if (t.isImportDeclaration(statement)) replace(statement.getStart(source), statement.end, '');
    }
    // Statements of export.
    for (const statement of source.statements) {
      if (t.isExportDeclaration(statement)) {
        replace(statement.getStart(source), statement.end, '');
      } else if (t.isExportAssignment(statement)) {
        const name = defaultName.get(key);
        if (name) replace(statement.getStart(source), statement.expression.getStart(source), `const ${name} = `);
        else replace(statement.getStart(source), statement.end, '');
      } else if (statement.modifiers?.some((modifier) => modifier.kind === t.SyntaxKind.ExportKeyword)) {
        for (const modifier of statement.modifiers) {
          if (modifier.kind === t.SyntaxKind.ExportKeyword || modifier.kind === t.SyntaxKind.DefaultKeyword) {
            replace(modifier.getStart(source), t.skipTrivia(text, modifier.end), '');
          }
        }
        if (!statement.name && (t.isFunctionDeclaration(statement) || t.isClassDeclaration(statement))) {
          // export default function () {}: a name of its own.
          const keyword = statement
            .getChildren(source)
            .find((child) => child.kind === t.SyntaxKind.FunctionKeyword || child.kind === t.SyntaxKind.ClassKeyword);
          const after = statement.asteriskToken ?? keyword;
          replace(after.end, after.end, ` ${defaultName.get(key)}`);
        }
      }
    }
    // Names: renamed top-level bindings, and imports.
    const rename = (node, value) => {
      const parent = node.parent;
      if (t.isShorthandPropertyAssignment(parent) && parent.name === node) {
        replace(node.getStart(source), node.end, `${node.text}: ${value}`);
      } else if (
        t.isBindingElement(parent) &&
        !parent.propertyName &&
        parent.name === node &&
        t.isObjectBindingPattern(parent.parent)
      ) {
        replace(node.getStart(source), node.end, `${node.text}: ${value}`);
      } else {
        replace(node.getStart(source), node.end, value);
      }
    };
    for (const [node, binding] of info.references) {
      if (!binding || binding.scope !== info.root) continue;
      if (t.isExportSpecifier(node.parent) || isInExportOrImport(t, node)) continue;
      const local = binding.name;
      const from = imported.get(local);
      if (from) {
        if (from.namespace) {
          // ns.name: the binding; ns: the object.
          const parent = node.parent;
          if (t.isPropertyAccessExpression(parent) && parent.expression === node && t.isIdentifier(parent.name)) {
            const resolved = tryResolveNamespaceMember(from.namespace, parent.name.text);
            if (resolved) {
              replace(parent.getStart(source), parent.end, resolved);
              continue;
            }
          }
          rename(node, namespaceObjectExpression(from.namespace));
        } else {
          rename(node, from.expression);
        }
        continue;
      }
      const name = names.get(local);
      if (name && name !== local) rename(node, name);
    }
    for (const binding of info.root.bindings.values()) {
      const name = names.get(binding.name);
      if (!name || name === binding.name || imported.has(binding.name)) continue;
      for (const declaration of binding.declarations) {
        if (isInExportOrImport(t, declaration)) continue;
        rename(declaration, name);
      }
    }
    // import(): the object of the module, as a promise.
    const visitDynamic = (node) => {
      if (
        t.isCallExpression(node) &&
        node.expression.kind === t.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        t.isStringLiteralLike(node.arguments[0])
      ) {
        const target = module.dependencies.get(node.arguments[0].text);
        if (target && !isExternal(target)) {
          replace(node.getStart(source), node.end, `Promise.resolve(${namespaceObjectExpression(target)})`);
          return;
        }
      }
      t.forEachChild(node, visitDynamic);
    };
    visitDynamic(source);
    return applyEdits(text, edits);
  }

  function tryResolveNamespaceMember(key, name) {
    if (cjsName.has(key) || isExternal(key)) return null;
    return tryResolve(key, name, new Set());
  }
  function namespaceObjectExpression(key) {
    if (cjsName.has(key)) return `${cjsName.get(key)}()`;
    if (isExternal(key)) {
      const external = externalOf(key);
      external.namespace = true;
      return external.name;
    }
    return namespaceOf(key);
  }

  // CommonJS modules: functions run on first use.
  const cjsParts = cjs.map((key) => {
    const module = modules.get(key);
    const info = parsed.get(key);
    const map = {};
    for (const [request, target] of module.dependencies) {
      if (isExternal(target)) map[request] = `__hostRequire(${JSON.stringify(requestOf(target))})`;
      else if (cjsName.has(target)) map[request] = `${cjsName.get(target)}()`;
      else if (modules.get(target).kind === 'json') map[request] = jsonName(target);
      else map[request] = namespaceObjectExpression(target);
    }
    const cases = Object.entries(map)
      .map(([request, expression]) => `      case ${JSON.stringify(request)}: return ${expression};`)
      .join('\n');
    const name = cjsName.get(key);
    return `let ${name}_module;
function ${name}() {
  if (!${name}_module) {
    const module = (${name}_module = { exports: {} });
    const require = (request) => {
      switch (request) {
${cases}
      default: return __hostRequire(request);
      }
    };
    (function (module, exports, require, __filename, __dirname) {
${info.text}
    }).call(module.exports, module, module.exports, require, __filename, __dirname);
  }
  return ${name}_module.exports;
}`;
  });

  // Objects of namespaces, made when first used.
  const namespaceParts = [];
  const made = new Set();
  const makeNamespaces = () => {
    for (const [key, name] of namespaces) {
      if (made.has(key)) continue;
      made.add(key);
      const getters = exportedNames(key)
        .sort()
        .map((exported) => `    get ${JSON.stringify(exported)}() { return ${resolveExport(key, exported)}; },`)
        .join('\n');
      namespaceParts.push(`let ${name}_object;
function ${name}() {
  return (${name}_object ??= Object.freeze({
    __proto__: null,
    [Symbol.toStringTag]: 'Module',
${getters}
  }));
}`);
    }
  };
  // (Making them may name more.)
  let before;
  do {
    before = namespaces.size;
    makeNamespaces();
  } while (namespaces.size !== before);

  // The exports of the entry.
  const entryExports = exportedNames(entry).map((name) => {
    const value = resolveExport(entry, name);
    if (/^[\w$]+$/.test(value)) return value === name ? name : `${value} as ${name === 'default' ? 'default' : name}`;
    return null;
  });
  const exportLines = [];
  const computed = [];
  exportedNames(entry).forEach((name, index) => {
    if (entryExports[index]) exportLines.push(entryExports[index]);
    else {
      const local = fresh(`__export_${name}`);
      computed.push(`const ${local} = ${resolveExport(entry, name)};`);
      exportLines.push(`${local} as ${name}`);
    }
  });

  const head = [];
  if (banner) head.push(banner);
  for (const [request, external] of externals) {
    if (external.namespace) head.push(`import * as ${external.name} from ${JSON.stringify(request)};`);
    if (external.default) head.push(`import ${external.name}_default from ${JSON.stringify(request)};`);
  }
  if (cjs.length) {
    head.push(
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      'const __hostRequire = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      "const __dirname = __fileURLToPath(new URL('.', import.meta.url));"
    );
  }
  return `${[...head, ...cjsParts, ...namespaceParts, ...parts, ...computed, `export { ${exportLines.join(', ')} };`].join('\n\n')}\n`;
}

function isInExportOrImport(t, node) {
  for (let current = node.parent; current; current = current.parent) {
    if (t.isImportDeclaration(current) || t.isExportDeclaration(current)) return true;
    if (t.isSourceFile(current)) return false;
  }
  return false;
}

// A name an import statement makes.
function isImported(t, node) {
  const parent = node.parent;
  return t.isImportSpecifier(parent) || t.isImportClause(parent) || t.isNamespaceImport(parent);
}

function boundNames(t, name) {
  if (t.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => (t.isOmittedExpression(element) ? [] : boundNames(t, element.name)));
}

function applyEdits(text, edits) {
  edits.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const parts = [];
  let at = 0;
  for (const [start, end, value] of edits) {
    if (start < at) continue; // (inside one made already)
    parts.push(text.slice(at, start), value);
    at = end;
  }
  parts.push(text.slice(at));
  return parts.join('');
}

export { hoist };
