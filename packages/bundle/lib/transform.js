// One module made CommonJS by TypeScript's transpileModule (ES modules, JSX, TypeScript), with the values of `define`
// put in and the branches they decide left out (if, ?:, && and ||), as esbuild does for process.env.NODE_ENV. It
// says what the module requires (and whether by import or by require()), and keeps its legal comments.
import path from 'node:path';
import { createRequire } from 'node:module';
import { analyze } from './scope.js';

let typescript = null;
// TypeScript: the project's, else the one installed with @xufa/bundle.
function ts() {
  if (!typescript) {
    for (const from of [path.join(process.cwd(), 'package.json'), import.meta.filename]) {
      try {
        typescript = createRequire(from)('typescript');
        break;
      } catch {
        // the next one
      }
    }
    if (!typescript)
      throw new Error('@xufa/bundle transforms modules with TypeScript: npm install --save-dev typescript');
  }
  return typescript;
}

// Comments to keep: /*! ... */, and those with @license or @preserve.
const LEGAL = /\/\*(?:![\s\S]*?|\*?[^*][\s\S]*?@(?:license|preserve)[\s\S]*?)\*\//g;
const legalOf = (source) => (source.includes('/*') ? (source.match(LEGAL) ?? []) : []);

// The text of a.b.c (identifiers, this, import.meta), or null.
function dotted(t, node) {
  if (t.isIdentifier(node)) return node.text;
  if (node.kind === t.SyntaxKind.ThisKeyword) return 'this';
  if (t.isMetaProperty(node)) return `${t.tokenToString(node.keywordToken)}.${node.name.text}`;
  if (t.isPropertyAccessExpression(node) && t.isIdentifier(node.name)) {
    const left = dotted(t, node.expression);
    return left === null ? null : `${left}.${node.name.text}`;
  }
  return null;
}

// A literal as its value: { value } or null.
function literal(t, node) {
  while (t.isParenthesizedExpression(node)) node = node.expression;
  switch (node.kind) {
    case t.SyntaxKind.StringLiteral:
    case t.SyntaxKind.NoSubstitutionTemplateLiteral:
      return { value: node.text };
    case t.SyntaxKind.NumericLiteral:
      return { value: Number(node.text) };
    case t.SyntaxKind.TrueKeyword:
      return { value: true };
    case t.SyntaxKind.FalseKeyword:
      return { value: false };
    case t.SyntaxKind.NullKeyword:
      return { value: null };
    default:
      if (t.isPrefixUnaryExpression(node) && node.operator === t.SyntaxKind.ExclamationToken) {
        const inner = literal(t, node.operand);
        return inner && { value: !inner.value };
      }
      return null;
  }
}

function nodeOf(t, factory, value) {
  if (typeof value === 'string') return factory.createStringLiteral(value);
  if (typeof value === 'number') return factory.createNumericLiteral(value);
  if (value === true) return factory.createTrue();
  if (value === false) return factory.createFalse();
  return factory.createNull();
}

// define: { 'process.env.NODE_ENV': '"production"' }, values as JSON (or an identifier).
function definitions(define) {
  const map = new Map();
  for (const [key, text] of Object.entries(define ?? {})) {
    let value;
    try {
      value = { value: JSON.parse(text) };
    } catch {
      value = { identifier: text };
    }
    map.set(key, value);
  }
  return map;
}

const COMPARE = new Set(['===', '!==', '==', '!=']);

function before(t, defined, imports) {
  return (context) => {
    const { factory } = context;
    const visit = (node) => {
      // An assignment to a defined name is left alone (process.env.NODE_ENV = 'x').
      if (defined.size && (t.isPropertyAccessExpression(node) || t.isIdentifier(node) || t.isMetaProperty(node))) {
        const parent = node.parent;
        const name = dotted(t, node);
        const target =
          parent &&
          ((t.isBinaryExpression(parent) &&
            parent.left === node &&
            parent.operatorToken.kind === t.SyntaxKind.EqualsToken) ||
            (t.isPropertyAccessExpression(parent) && parent.name === node) ||
            t.isVariableDeclaration(parent) ||
            t.isPropertyAssignment(parent) ||
            t.isParameter(parent) ||
            t.isFunctionDeclaration(parent));
        if (name !== null && defined.has(name) && !target) {
          const found = defined.get(name);
          return found.identifier ? factory.createIdentifier(found.identifier) : nodeOf(t, factory, found.value);
        }
      }
      // import.meta (what define does not give) is an empty object in CommonJS, as esbuild makes it.
      if (t.isMetaProperty(node) && node.keywordToken === t.SyntaxKind.ImportKeyword) {
        return factory.createParenthesizedExpression(factory.createObjectLiteralExpression([]));
      }
      if (t.isImportDeclaration(node) || t.isExportDeclaration(node)) {
        if (node.moduleSpecifier && t.isStringLiteral(node.moduleSpecifier)) imports.add(node.moduleSpecifier.text);
      } else if (
        t.isCallExpression(node) &&
        node.expression.kind === t.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        t.isStringLiteralLike(node.arguments[0])
      ) {
        imports.add(node.arguments[0].text);
      }
      const visited = t.visitEachChild(node, visit, context);
      return fold(t, factory, visited);
    };
    return (file) => t.visitNode(file, visit);
  };
}

// A node whose outcome the literals decide: the part that runs.
function fold(t, factory, node) {
  if (t.isBinaryExpression(node)) {
    const operator = t.tokenToString(node.operatorToken.kind);
    const left = literal(t, node.left);
    if (COMPARE.has(operator)) {
      const right = literal(t, node.right);
      if (left && right) {
        // eslint-disable-next-line eqeqeq -- as the code says
        const equal = operator.length === 3 ? left.value === right.value : left.value == right.value;
        return equal === operator.startsWith('=') ? factory.createTrue() : factory.createFalse();
      }
    } else if (left && (operator === '&&' || operator === '||')) {
      return Boolean(left.value) === (operator === '&&') ? node.right : node.left;
    }
  } else if (t.isConditionalExpression(node)) {
    const condition = literal(t, node.condition);
    if (condition) return condition.value ? node.whenTrue : node.whenFalse;
  } else if (t.isIfStatement(node)) {
    const condition = literal(t, node.expression);
    if (condition) {
      if (condition.value) return node.thenStatement;
      return node.elseStatement ?? factory.createBlock([]);
    }
  } else if (t.isPrefixUnaryExpression(node) && node.operator === t.SyntaxKind.ExclamationToken) {
    const operand = literal(t, node.operand);
    if (operand) return operand.value ? factory.createFalse() : factory.createTrue();
  } else if (t.isParenthesizedExpression(node) && literal(t, node.expression)) {
    return node.expression;
  }
  return node;
}

// The requires of the module as it is emitted (those of its imports too): require('x'), with a string.
function after(t, requires) {
  return () => (file) => {
    const visit = (node) => {
      if (
        t.isCallExpression(node) &&
        t.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length === 1 &&
        t.isStringLiteralLike(node.arguments[0])
      ) {
        requires.add(node.arguments[0].text);
      }
      t.forEachChild(node, visit);
    };
    visit(file);
    return file;
  };
}

// A "use strict" directive at the start (after comments).
const STRICT = /^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*(['"])use strict\1/;

// The name TypeScript is given: .ts, .tsx and .jsx as they are, the rest as .js (.mjs and .mts would stay ES modules).
// The name TypeScript is given: .ts, .tsx and .jsx as they are, the rest .js (.mjs and .mts would stay ES modules).
const KINDS = { '.ts': '.ts', '.mts': '.ts', '.cts': '.ts', '.tsx': '.tsx', '.jsx': '.jsx' };

// How TypeScript parses a file, by its extension.
function scriptKind(t, file) {
  const kind = KINDS[path.extname(file)];
  if (kind === '.tsx') return t.ScriptKind.TSX;
  if (kind === '.jsx') return t.ScriptKind.JSX;
  return kind === '.ts' ? t.ScriptKind.TS : t.ScriptKind.JS;
}

// The names CommonJS gives each module (the parameters of its function): an ES module that declares one of them at its
// top level has it renamed (require -> require$1), as esbuild does.
const WRAPPER = ['require', 'module', 'exports'];
const DECLARES_WRAPPER = /\b(?:const|let|var|function|class|import)\b[^;]*?\b(?:require|module|exports)\b/;

function renameWrapperNames(t, source, file) {
  if (!DECLARES_WRAPPER.test(source)) return source;
  const parsed = t.createSourceFile(
    file,
    source,
    { languageVersion: t.ScriptTarget.Latest, jsDocParsingMode: t.JSDocParsingMode.ParseNone },
    true,
    scriptKind(t, file)
  );
  const isModule = parsed.statements.some(
    (statement) =>
      t.isImportDeclaration(statement) ||
      t.isExportDeclaration(statement) ||
      t.isExportAssignment(statement) ||
      statement.modifiers?.some((modifier) => modifier.kind === t.SyntaxKind.ExportKeyword)
  );
  if (!isModule) return source;
  const { root } = analyze(t, parsed);
  const edits = [];
  for (const name of WRAPPER) {
    const binding = root.bindings.get(name);
    if (!binding) continue;
    let fresh = `${name}$1`;
    for (let n = 2; root.bindings.has(fresh) || source.includes(fresh); n++) fresh = `${name}$${n}`;
    for (const node of [...binding.declarations, ...binding.references]) {
      const parent = node.parent;
      // { require } and import { require }: the property, or what is imported, keeps its name.
      if (t.isShorthandPropertyAssignment(parent) && parent.name === node) {
        edits.push([node.getStart(parsed), node.end, `${name}: ${fresh}`]);
      } else if (t.isImportSpecifier(parent) && !parent.propertyName) {
        edits.push([node.getStart(parsed), node.end, `${name} as ${fresh}`]);
      } else if (t.isBindingElement(parent) && !parent.propertyName && t.isObjectBindingPattern(parent.parent)) {
        edits.push([node.getStart(parsed), node.end, `${name}: ${fresh}`]);
      } else if (t.isExportSpecifier(parent) && !parent.propertyName) {
        edits.push([node.getStart(parsed), node.end, `${fresh} as ${name}`]);
      } else {
        edits.push([node.getStart(parsed), node.end, fresh]);
      }
    }
  }
  edits.sort((a, b) => b[0] - a[0]);
  let out = source;
  for (const [start, end, text] of edits) out = out.slice(0, start) + text + out.slice(end);
  return out;
}

/**
 * A module as CommonJS: { code, imports, requires, legal }. `imports` are the specifiers it imports (import, export
 * from, import()), `requires` all it requires once emitted (its imports, and require() of CommonJS); `legal` its
 * legal comments.
 *
 * Options: `file` (its name: .jsx and .tsx have JSX, .ts TypeScript), `jsx` ('automatic', the default, or
 * 'classic'), `jsxImportSource` ('react'), `define`, `helpers` ('inline', the default: TypeScript's helpers of
 * modules in each module; 'external': they are the bundle's), `target` ('es2022').
 */
function transform(source, options = {}) {
  const t = ts();
  const {
    file = 'module.js',
    jsx = 'automatic',
    jsxImportSource,
    define,
    helpers = 'inline',
    target = 'es2022',
  } = options;
  const imports = new Set();
  const requires = new Set();
  const extension = path.extname(file);
  const fileName = file.slice(0, file.length - extension.length) + (KINDS[extension] ?? '.js');
  source = renameWrapperNames(t, source, file);
  const result = t.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      module: t.ModuleKind.CommonJS,
      target: /^esnext$/i.test(target)
        ? t.ScriptTarget.ESNext
        : (t.ScriptTarget[target.toUpperCase()] ?? t.ScriptTarget.ES2022),
      jsx: jsx === 'classic' ? t.JsxEmit.React : t.JsxEmit.ReactJSX,
      ...(jsxImportSource ? { jsxImportSource } : {}),
      esModuleInterop: true,
      noEmitHelpers: helpers === 'external',
      allowJs: true,
      removeComments: false,
      newLine: t.NewLineKind.LineFeed,
    },
    transformers: { before: [before(t, definitions(define), imports)], after: [after(t, requires)] },
  });
  const errors = (result.diagnostics ?? []).filter((d) => d.category === t.DiagnosticCategory.Error);
  if (errors.length) {
    const d = errors[0];
    const where = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : null;
    throw new SyntaxError(
      `${file}${where ? `:${where.line + 1}:${where.character + 1}` : ''}: ${t.flattenDiagnosticMessageText(d.messageText, '\n')}`
    );
  }
  // TypeScript makes every module strict: CommonJS stays as it was written.
  let code = result.outputText;
  const strict = '"use strict";\n';
  if (
    code.startsWith(strict) &&
    !code.includes('Object.defineProperty(exports, "__esModule"') &&
    !STRICT.test(source)
  ) {
    code = code.slice(strict.length);
  }
  return { code, imports: [...imports], requires: [...requires], legal: legalOf(source) };
}

export { transform, ts, scriptKind };
