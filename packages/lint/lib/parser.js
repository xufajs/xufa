// JavaScript (and JSX) parsed by TypeScript's parser into ESTree, as espree gives it to ESLint: the same nodes and
// properties, ranges and locations, tokens and comments. The rules (ported from ESLint), eslint-scope and the code
// path analysis read this tree.

import ts, { keepSourceFile } from '#typescript';

const K = ts.SyntaxKind;

// Words espree's tokens call Keyword (the rest of the words are Identifier).
const KEYWORDS = new Set(
  (
    'break case catch class const continue debugger default delete do else export extends finally for function if ' +
    'import in instanceof new return super switch this throw try typeof var void while with static yield let'
  ).split(' ')
);

const NAME_KEYWORDS = new Set(['static', 'let', 'yield']);

// The errors of TypeScript that are not errors in sloppy scripts (octal numbers and escapes).
const SLOPPY_ONLY = new Set([1121, 1487, 1488, 1489]);

class ParseError extends SyntaxError {
  constructor(message, index, line, column) {
    super(message);
    this.index = index;
    this.lineNumber = line;
    this.column = column;
  }
}

// Line feed, carriage return, and the line and paragraph separators.
const isLineBreak = (code) => code === 10 || code === 13 || code === 0x2028 || code === 0x2029;

// A node or a token. Its loc (lines and columns) is made when first read, as most never are, from its range and the
// line starts of its file, then kept. (Made so and given its properties, it is faster to make than an object literal.)
class Located {
  #locate;

  constructor(type, start, end, locate) {
    this.type = type;
    this.range = [start, end];
    this.#locate = locate;
  }

  get loc() {
    const loc = { start: this.#locate(this.range[0]), end: this.#locate(this.range[1]) };
    Object.defineProperty(this, 'loc', { value: loc, writable: true, enumerable: true, configurable: true });
    return loc;
  }

  set loc(value) {
    Object.defineProperty(this, 'loc', { value, writable: true, enumerable: true, configurable: true });
  }
}

// Offsets to { line, column }: line from 1, column from 0.
function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    if (char === 10 || char === 0x2028 || char === 0x2029) starts.push(i + 1);
    else if (char === 13) {
      if (text.charCodeAt(i + 1) === 10) i += 1;
      starts.push(i + 1);
    }
  }
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return { line: low + 1, column: offset - starts[low] };
  };
}

// The value of a numeric literal as written (legacy octal 010 too).
function numberOf(raw) {
  const clean = raw.replace(/_/g, '');
  if (/^0[0-7]+$/.test(clean)) return parseInt(clean, 8);
  if (/^0[oO]/.test(clean)) return parseInt(clean.slice(2), 8);
  if (/^0[bB]/.test(clean)) return parseInt(clean.slice(2), 2);
  return Number(clean);
}

function regexValue(pattern, flags) {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

const ASSIGNMENT_OPERATORS = new Set(
  ['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '&&=', '||=', '??='].map(
    (operator) => operator
  )
);

// The parents of the nodes of a TypeScript tree, and what its tokens need of it (Converter.scanTokens): the ends of
// its identifiers, the starts of its regular expressions and of the parts of its templates after a ${...}, and
// whether it has JSX.
function prepare(source) {
  const hints = { identifierEnds: new Set(), regexStarts: new Set(), templateStarts: new Set(), jsx: false };
  const stack = [source];
  while (stack.length) {
    const node = stack.pop();
    ts.forEachChild(node, (child) => {
      child.parent = node;
      stack.push(child);
      switch (child.kind) {
        case K.Identifier:
          hints.identifierEnds.add(child.end);
          break;
        case K.RegularExpressionLiteral:
          hints.regexStarts.add(child.end - child.text.length);
          break;
        case K.TemplateMiddle:
        case K.TemplateTail:
          hints.templateStarts.add(ts.skipTrivia(source.text, child.pos));
          break;
        case K.JsxElement:
        case K.JsxSelfClosingElement:
        case K.JsxFragment:
          hints.jsx = true;
          break;
        default:
      }
    });
  }
  return hints;
}

/**
 * Parses `text`: an ESTree Program with tokens and comments. Options: sourceType ('module', 'script' or
 * 'commonjs'), jsx (true for .jsx), filePath.
 */
function parse(text, options = {}) {
  const { sourceType = 'module', jsx = false, filePath = jsx ? 'file.jsx' : 'file.js' } = options;
  const source = ts.createSourceFile(
    filePath,
    text,
    { languageVersion: ts.ScriptTarget.Latest, jsDocParsingMode: ts.JSDocParsingMode.ParseNone },
    // (Parents are set below: TypeScript's way of setting them takes longer.)
    false,
    jsx ? ts.ScriptKind.JSX : ts.ScriptKind.JS
  );
  const hints = prepare(source);
  // For the formatter of the same text (xufa-check).
  keepSourceFile(source, text);
  const locate = lineIndex(text);
  // Scripts may have what strict code may not: legacy octal numbers (010, 08) and escapes ('\1', '\8').
  const diagnostics =
    sourceType === 'module'
      ? source.parseDiagnostics
      : source.parseDiagnostics.filter((diagnostic) => !SLOPPY_ONLY.has(diagnostic.code));
  if (diagnostics.length) {
    const first = diagnostics[0];
    const where = locate(first.start);
    throw new ParseError(
      ts.flattenDiagnosticMessageText(first.messageText, '\n'),
      first.start,
      where.line,
      where.column + 1
    );
  }
  if (sourceType !== 'module') {
    // A script has no import or export (espree's error).
    const statement = source.statements.find(
      (node) =>
        node.kind === K.ImportDeclaration ||
        node.kind === K.ExportDeclaration ||
        node.kind === K.ExportAssignment ||
        node.modifiers?.some((modifier) => modifier.kind === K.ExportKeyword)
    );
    if (statement) {
      const start = statement.getStart(source);
      const where = locate(start);
      throw new ParseError(
        "'import' and 'export' may appear only with 'sourceType: module'",
        start,
        where.line,
        where.column + 1
      );
    }
  }
  const converter = new Converter(source, text, locate, hints);
  const program = converter.program(sourceType);
  return program;
}

class Converter {
  constructor(source, text, locate, hints) {
    this.source = source;
    this.text = text;
    this.locate = locate;
    this.hints = hints;
  }

  // A node of ESTree over [start, end).
  make(type, start, end, props) {
    return Object.assign(new Located(type, start, end, this.locate), props);
  }

  start(node) {
    return node.getStart(this.source);
  }

  from(type, node, props) {
    return this.make(type, this.start(node), node.end, props);
  }

  // Where the first token after `position` starts (white space and comments skipped).
  skip(position) {
    return ts.skipTrivia(this.text, position);
  }

  // The token of a kind among the children of a node.
  token(node, kind) {
    return node.getChildren(this.source).find((child) => child.kind === kind);
  }

  program(sourceType) {
    const body = this.statements(this.source.statements, true);
    const tokens = this.hints.jsx ? this.tokens() : this.scanTokens();
    const comments = this.comments(tokens);
    const start = tokens.length ? tokens[0].range[0] : 0;
    // (To the end of its last token.)
    const end = tokens.length ? tokens[tokens.length - 1].range[1] : this.text.length;
    const program = this.make('Program', start, end, { body, sourceType });
    program.comments = comments;
    program.tokens = tokens;
    return program;
  }

  statements(list, prologue) {
    const out = [];
    let directives = prologue;
    for (const statement of list) {
      const node = this.statement(statement);
      if (directives && t_isDirective(statement)) {
        node.directive = this.text.slice(this.start(statement.expression) + 1, statement.expression.end - 1);
      } else {
        directives = false;
      }
      out.push(node);
    }
    return out;
  }

  statement(node) {
    switch (node.kind) {
      case K.VariableStatement:
        return this.exported(node, () => this.variables(node.declarationList, this.afterModifiers(node), node.end));
      case K.FunctionDeclaration:
        return this.exported(node, () => this.func(node, 'FunctionDeclaration', this.afterModifiers(node, true)));
      case K.ClassDeclaration:
        return this.exported(node, () => this.klass(node, 'ClassDeclaration', this.afterModifiers(node, true)));
      case K.ExpressionStatement:
        return this.from('ExpressionStatement', node, { expression: this.expression(node.expression) });
      case K.Block:
        return this.block(node);
      case K.EmptyStatement:
        return this.from('EmptyStatement', node, {});
      case K.IfStatement:
        return this.from('IfStatement', node, {
          test: this.expression(node.expression),
          consequent: this.statement(node.thenStatement),
          alternate: node.elseStatement ? this.statement(node.elseStatement) : null,
        });
      case K.ForStatement:
        return this.from('ForStatement', node, {
          init: node.initializer ? this.forInit(node.initializer) : null,
          test: node.condition ? this.expression(node.condition) : null,
          update: node.incrementor ? this.expression(node.incrementor) : null,
          body: this.statement(node.statement),
        });
      case K.ForInStatement:
        return this.from('ForInStatement', node, {
          left: this.forLeft(node.initializer),
          right: this.expression(node.expression),
          body: this.statement(node.statement),
        });
      case K.ForOfStatement:
        return this.from('ForOfStatement', node, {
          await: Boolean(node.awaitModifier),
          left: this.forLeft(node.initializer),
          right: this.expression(node.expression),
          body: this.statement(node.statement),
        });
      case K.WhileStatement:
        return this.from('WhileStatement', node, {
          test: this.expression(node.expression),
          body: this.statement(node.statement),
        });
      case K.DoStatement:
        return this.from('DoWhileStatement', node, {
          body: this.statement(node.statement),
          test: this.expression(node.expression),
        });
      case K.ReturnStatement:
        return this.from('ReturnStatement', node, {
          argument: node.expression ? this.expression(node.expression) : null,
        });
      case K.BreakStatement:
        return this.from('BreakStatement', node, { label: node.label ? this.identifier(node.label) : null });
      case K.ContinueStatement:
        return this.from('ContinueStatement', node, { label: node.label ? this.identifier(node.label) : null });
      case K.ThrowStatement:
        return this.from('ThrowStatement', node, { argument: this.expression(node.expression) });
      case K.TryStatement:
        return this.from('TryStatement', node, {
          block: this.block(node.tryBlock),
          handler: node.catchClause
            ? this.from('CatchClause', node.catchClause, {
                param: node.catchClause.variableDeclaration
                  ? this.pattern(node.catchClause.variableDeclaration.name)
                  : null,
                body: this.block(node.catchClause.block),
              })
            : null,
          finalizer: node.finallyBlock ? this.block(node.finallyBlock) : null,
        });
      case K.SwitchStatement:
        return this.from('SwitchStatement', node, {
          discriminant: this.expression(node.expression),
          cases: node.caseBlock.clauses.map((clause) =>
            this.from('SwitchCase', clause, {
              test: clause.kind === K.CaseClause ? this.expression(clause.expression) : null,
              consequent: this.statements(clause.statements, false),
            })
          ),
        });
      case K.LabeledStatement:
        return this.from('LabeledStatement', node, {
          label: this.identifier(node.label),
          body: this.statement(node.statement),
        });
      case K.WithStatement:
        return this.from('WithStatement', node, {
          object: this.expression(node.expression),
          body: this.statement(node.statement),
        });
      case K.DebuggerStatement:
        return this.from('DebuggerStatement', node, {});
      case K.ImportDeclaration:
        return this.importDeclaration(node);
      case K.ExportDeclaration:
        return this.exportDeclaration(node);
      case K.ExportAssignment:
        return this.from('ExportDefaultDeclaration', node, { declaration: this.expression(node.expression) });
      default:
        throw this.unsupported(node);
    }
  }

  unsupported(node) {
    const where = this.locate(this.start(node));
    return new ParseError(
      `Unsupported syntax: ${ts.SyntaxKind[node.kind]}`,
      this.start(node),
      where.line,
      where.column + 1
    );
  }

  // Where a declaration starts after its export and default (and, unless keepAsync, keeps async).
  afterModifiers(node, keepAsync) {
    const modifiers = (node.modifiers ?? []).filter(
      (modifier) => modifier.kind === K.ExportKeyword || modifier.kind === K.DefaultKeyword
    );
    if (!modifiers.length) return this.start(node);
    const last = modifiers[modifiers.length - 1];
    const next = this.skip(last.end);
    return keepAsync ? next : next;
  }

  // export const ..., export function ..., export default function / class.
  exported(node, make) {
    const modifiers = node.modifiers ?? [];
    const isExport = modifiers.some((modifier) => modifier.kind === K.ExportKeyword);
    const declaration = make();
    if (!isExport) return declaration;
    const isDefault = modifiers.some((modifier) => modifier.kind === K.DefaultKeyword);
    if (isDefault) return this.from('ExportDefaultDeclaration', node, { declaration });
    return this.from('ExportNamedDeclaration', node, {
      declaration,
      specifiers: [],
      source: null,
      attributes: [],
    });
  }

  block(node, prologue = false) {
    return this.from('BlockStatement', node, { body: this.statements(node.statements, prologue) });
  }

  kindOf(list) {
    const flags = list.flags & ts.NodeFlags.BlockScoped;
    if (flags === ts.NodeFlags.AwaitUsing) return 'await using';
    if (flags === ts.NodeFlags.Using) return 'using';
    if (flags === ts.NodeFlags.Const) return 'const';
    if (flags === ts.NodeFlags.Let) return 'let';
    return 'var';
  }

  variables(list, start, end) {
    return this.make('VariableDeclaration', start, end, {
      declarations: list.declarations.map((declaration) =>
        this.from('VariableDeclarator', declaration, {
          id: this.pattern(declaration.name),
          init: declaration.initializer ? this.expression(declaration.initializer) : null,
        })
      ),
      kind: this.kindOf(list),
    });
  }

  forInit(node) {
    if (node.kind === K.VariableDeclarationList) return this.variables(node, this.start(node), node.end);
    return this.expression(node);
  }

  forLeft(node) {
    if (node.kind === K.VariableDeclarationList) return this.variables(node, this.start(node), node.end);
    return this.toPattern(node);
  }

  importDeclaration(node) {
    const specifiers = [];
    const clause = node.importClause;
    if (clause?.name) {
      specifiers.push(this.from('ImportDefaultSpecifier', clause.name, { local: this.identifier(clause.name) }));
    }
    if (clause?.namedBindings) {
      if (clause.namedBindings.kind === K.NamespaceImport) {
        specifiers.push(
          this.from('ImportNamespaceSpecifier', clause.namedBindings, {
            local: this.identifier(clause.namedBindings.name),
          })
        );
      } else {
        for (const element of clause.namedBindings.elements) {
          specifiers.push(
            this.from('ImportSpecifier', element, {
              imported: this.moduleName(element.propertyName ?? element.name),
              local: this.identifier(element.name),
            })
          );
        }
      }
    }
    return this.from('ImportDeclaration', node, {
      specifiers,
      source: this.literal(node.moduleSpecifier),
      attributes: this.attributes(node.attributes),
    });
  }

  attributes(attributes) {
    return (attributes?.elements ?? []).map((element) =>
      this.from('ImportAttribute', element, {
        key: element.name.kind === K.StringLiteral ? this.literal(element.name) : this.identifier(element.name),
        value: this.literal(element.value),
      })
    );
  }

  moduleName(node) {
    return node.kind === K.StringLiteral ? this.literal(node) : this.identifier(node);
  }

  exportDeclaration(node) {
    const source = node.moduleSpecifier ? this.literal(node.moduleSpecifier) : null;
    const attributes = this.attributes(node.attributes);
    if (!node.exportClause) return this.from('ExportAllDeclaration', node, { exported: null, source, attributes });
    if (node.exportClause.kind === K.NamespaceExport) {
      return this.from('ExportAllDeclaration', node, {
        exported: this.moduleName(node.exportClause.name),
        source,
        attributes,
      });
    }
    return this.from('ExportNamedDeclaration', node, {
      declaration: null,
      specifiers: node.exportClause.elements.map((element) =>
        this.from('ExportSpecifier', element, {
          local: this.moduleName(element.propertyName ?? element.name),
          exported: this.moduleName(element.name),
        })
      ),
      source,
      attributes,
    });
  }

  // Functions: declarations, expressions, arrows, and the values of methods (which start at their parameters).
  func(node, type, start = this.start(node), props = {}) {
    const isAsync = (node.modifiers ?? []).some((modifier) => modifier.kind === K.AsyncKeyword);
    const body = node.body;
    const expression = type === 'ArrowFunctionExpression' && body.kind !== K.Block;
    return this.make(type, start, node.end, {
      id: node.name && type !== 'ArrowFunctionExpression' && !props.method ? this.identifier(node.name) : null,
      expression,
      generator: Boolean(node.asteriskToken),
      async: isAsync,
      params: node.parameters.map((parameter) => this.parameter(parameter)),
      body: expression ? this.expression(body) : this.block(body, true),
    });
  }

  parameter(node) {
    let pattern = this.pattern(node.name);
    if (node.initializer) {
      pattern = this.make('AssignmentPattern', this.start(node.name), node.end, {
        left: pattern,
        right: this.expression(node.initializer),
      });
    }
    if (node.dotDotDotToken) {
      pattern = this.make('RestElement', this.start(node), node.end, { argument: pattern });
    }
    return pattern;
  }

  // The value of a method: a function from its parameters' parenthesis.
  methodValue(node) {
    const open = this.token(node, K.OpenParenToken);
    const value = this.func(node, 'FunctionExpression', this.start(open), { method: true });
    value.id = null;
    return value;
  }

  klass(node, type, start = this.start(node)) {
    const heritage = node.heritageClauses?.find((clause) => clause.token === K.ExtendsKeyword);
    const body = [];
    for (const member of node.members) {
      const converted = this.member(member);
      if (converted) body.push(converted);
    }
    const open = this.token(node, K.OpenBraceToken);
    return this.make(type, start, node.end, {
      id: node.name ? this.identifier(node.name) : null,
      superClass: heritage ? this.expression(heritage.types[0].expression) : null,
      body: this.make('ClassBody', this.start(open), node.end, { body }),
    });
  }

  isStatic(node) {
    return (node.modifiers ?? []).some((modifier) => modifier.kind === K.StaticKeyword);
  }

  key(name) {
    if (name.kind === K.ComputedPropertyName) return { key: this.expression(name.expression), computed: true };
    return { key: this.propertyKey(name), computed: false };
  }

  propertyKey(name) {
    switch (name.kind) {
      case K.Identifier:
        return this.identifier(name);
      case K.PrivateIdentifier:
        return this.from('PrivateIdentifier', name, { name: name.text.slice(1) });
      default:
        return this.literal(name);
    }
  }

  member(node) {
    switch (node.kind) {
      case K.SemicolonClassElement:
        return null;
      case K.Constructor: {
        const keyword =
          node.getChildren(this.source).find((child) => child.kind === K.ConstructorKeyword) ??
          node.getChildren(this.source).find((child) => child.kind === K.StringLiteral);
        const key =
          keyword.kind === K.StringLiteral
            ? this.literal(keyword)
            : this.make('Identifier', this.start(keyword), keyword.end, { name: 'constructor' });
        // static constructor() is a method named constructor.
        const isStatic = this.isStatic(node);
        return this.from('MethodDefinition', node, {
          static: isStatic,
          computed: false,
          key,
          kind: isStatic ? 'method' : 'constructor',
          value: this.methodValue(node),
        });
      }
      case K.MethodDeclaration:
      case K.GetAccessor:
      case K.SetAccessor:
        return this.from('MethodDefinition', node, {
          static: this.isStatic(node),
          ...this.key(node.name),
          kind: node.kind === K.GetAccessor ? 'get' : node.kind === K.SetAccessor ? 'set' : 'method',
          value: this.methodValue(node),
        });
      case K.PropertyDeclaration:
        return this.from('PropertyDefinition', node, {
          static: this.isStatic(node),
          ...this.key(node.name),
          value: node.initializer ? this.expression(node.initializer) : null,
        });
      case K.ClassStaticBlockDeclaration:
        return this.from('StaticBlock', node, { body: this.statements(node.body.statements, false) });
      default:
        throw this.unsupported(node);
    }
  }

  identifier(node) {
    return this.from('Identifier', node, { name: node.text });
  }

  literal(node) {
    const raw = this.text.slice(this.start(node), node.end);
    switch (node.kind) {
      case K.StringLiteral:
        // (A token of TypeScript's children, the name of 'constructor'() in a class, has no text: its value is between
        // its quotes.)
        return this.from('Literal', node, { value: node.text ?? raw.slice(1, -1), raw });
      case K.NumericLiteral:
        return this.from('Literal', node, { value: numberOf(raw), raw });
      case K.BigIntLiteral: {
        const digits = raw.slice(0, -1).replace(/_/g, '');
        return this.from('Literal', node, { value: BigInt(digits), raw, bigint: BigInt(digits).toString() });
      }
      case K.RegularExpressionLiteral: {
        const slash = raw.lastIndexOf('/');
        const pattern = raw.slice(1, slash);
        const flags = raw.slice(slash + 1);
        return this.from('Literal', node, { value: regexValue(pattern, flags), raw, regex: { pattern, flags } });
      }
      case K.TrueKeyword:
        return this.from('Literal', node, { value: true, raw });
      case K.FalseKeyword:
        return this.from('Literal', node, { value: false, raw });
      case K.NullKeyword:
        return this.from('Literal', node, { value: null, raw });
      default:
        throw this.unsupported(node);
    }
  }

  // Template literals: their quasis cover their delimiters, as espree's do.
  template(node) {
    if (node.kind === K.NoSubstitutionTemplateLiteral) {
      return this.from('TemplateLiteral', node, {
        quasis: [this.quasi(node, true)],
        expressions: [],
      });
    }
    const quasis = [this.quasi(node.head, node.templateSpans.length === 0)];
    const expressions = [];
    node.templateSpans.forEach((span) => {
      expressions.push(this.expression(span.expression));
      quasis.push(this.quasi(span.literal, span.literal.kind === K.TemplateTail));
    });
    return this.from('TemplateLiteral', node, { quasis, expressions });
  }

  quasi(node, tail) {
    const text = this.text.slice(this.start(node), node.end);
    const open = 1;
    const close = tail ? 1 : 2;
    const raw = text.slice(open, text.length - close).replace(/\r\n?/g, '\n');
    const cooked = node.templateFlags & ts.TokenFlags.ContainsInvalidEscape ? null : node.text;
    return this.from('TemplateElement', node, { value: { raw, cooked }, tail });
  }

  // An optional chain's top: a ChainExpression around it.
  chained(node, converted) {
    if (!(node.flags & ts.NodeFlags.OptionalChain)) return converted;
    const parent = node.parent;
    const inChain =
      parent &&
      parent.flags & ts.NodeFlags.OptionalChain &&
      (parent.expression === node || (parent.kind === K.NonNullExpression && parent.expression === node));
    if (inChain) return converted;
    return this.make('ChainExpression', converted.range[0], converted.range[1], { expression: converted });
  }

  expression(node) {
    switch (node.kind) {
      case K.Identifier:
        if (node.text === 'undefined' || node.escapedText !== undefined) return this.identifier(node);
        return this.identifier(node);
      case K.StringLiteral:
      case K.NumericLiteral:
      case K.BigIntLiteral:
      case K.RegularExpressionLiteral:
      case K.TrueKeyword:
      case K.FalseKeyword:
      case K.NullKeyword:
        return this.literal(node);
      case K.NoSubstitutionTemplateLiteral:
      case K.TemplateExpression:
        return this.template(node);
      case K.TaggedTemplateExpression:
        return this.from('TaggedTemplateExpression', node, {
          tag: this.expression(node.tag),
          quasi: this.template(node.template),
        });
      case K.ThisKeyword:
        return this.from('ThisExpression', node, {});
      case K.SuperKeyword:
        return this.from('Super', node, {});
      case K.ParenthesizedExpression:
        return this.expression(node.expression);
      case K.ArrayLiteralExpression:
        return this.from('ArrayExpression', node, {
          elements: node.elements.map((element) =>
            element.kind === K.OmittedExpression ? null : this.expression(element)
          ),
        });
      case K.ObjectLiteralExpression:
        return this.from('ObjectExpression', node, {
          properties: node.properties.map((property) => this.property(property)),
        });
      case K.SpreadElement:
      case K.SpreadAssignment:
        return this.from('SpreadElement', node, { argument: this.expression(node.expression) });
      case K.FunctionExpression:
        return this.func(node, 'FunctionExpression');
      case K.ArrowFunction:
        return this.func(node, 'ArrowFunctionExpression');
      case K.ClassExpression:
        return this.klass(node, 'ClassExpression');
      case K.PrefixUnaryExpression: {
        const operator = ts.tokenToString(node.operator);
        if (operator === '++' || operator === '--') {
          return this.from('UpdateExpression', node, {
            operator,
            prefix: true,
            argument: this.expression(node.operand),
          });
        }
        return this.from('UnaryExpression', node, { operator, prefix: true, argument: this.expression(node.operand) });
      }
      case K.PostfixUnaryExpression:
        return this.from('UpdateExpression', node, {
          operator: ts.tokenToString(node.operator),
          prefix: false,
          argument: this.expression(node.operand),
        });
      case K.TypeOfExpression:
        return this.from('UnaryExpression', node, {
          operator: 'typeof',
          prefix: true,
          argument: this.expression(node.expression),
        });
      case K.VoidExpression:
        return this.from('UnaryExpression', node, {
          operator: 'void',
          prefix: true,
          argument: this.expression(node.expression),
        });
      case K.DeleteExpression:
        return this.from('UnaryExpression', node, {
          operator: 'delete',
          prefix: true,
          argument: this.expression(node.expression),
        });
      case K.AwaitExpression:
        return this.from('AwaitExpression', node, { argument: this.expression(node.expression) });
      case K.YieldExpression:
        return this.from('YieldExpression', node, {
          delegate: Boolean(node.asteriskToken),
          argument: node.expression ? this.expression(node.expression) : null,
        });
      case K.BinaryExpression:
        return this.binary(node);
      case K.ConditionalExpression:
        return this.from('ConditionalExpression', node, {
          test: this.expression(node.condition),
          consequent: this.expression(node.whenTrue),
          alternate: this.expression(node.whenFalse),
        });
      case K.CallExpression: {
        if (node.expression.kind === K.ImportKeyword) {
          return this.from('ImportExpression', node, {
            source: this.expression(node.arguments[0]),
            options: node.arguments[1] ? this.expression(node.arguments[1]) : null,
          });
        }
        return this.chained(
          node,
          this.from('CallExpression', node, {
            callee: this.expression(node.expression),
            arguments: node.arguments.map((argument) => this.expression(argument)),
            optional: Boolean(node.questionDotToken),
          })
        );
      }
      case K.NewExpression:
        return this.from('NewExpression', node, {
          callee: this.expression(node.expression),
          arguments: (node.arguments ?? []).map((argument) => this.expression(argument)),
        });
      case K.PropertyAccessExpression:
        return this.chained(
          node,
          this.from('MemberExpression', node, {
            object: this.expression(node.expression),
            property: this.propertyKey(node.name),
            computed: false,
            optional: Boolean(node.questionDotToken),
          })
        );
      case K.ElementAccessExpression:
        return this.chained(
          node,
          this.from('MemberExpression', node, {
            object: this.expression(node.expression),
            property: this.expression(node.argumentExpression),
            computed: true,
            optional: Boolean(node.questionDotToken),
          })
        );
      case K.MetaProperty:
        return this.from('MetaProperty', node, {
          meta: this.make(
            'Identifier',
            this.start(node),
            this.start(node) + ts.tokenToString(node.keywordToken).length,
            {
              name: ts.tokenToString(node.keywordToken),
            }
          ),
          property: this.identifier(node.name),
        });
      case K.PrivateIdentifier:
        return this.from('PrivateIdentifier', node, { name: node.text.slice(1) });
      case K.JsxElement:
      case K.JsxSelfClosingElement:
      case K.JsxFragment:
        return this.jsx(node);
      default:
        throw this.unsupported(node);
    }
  }

  binary(node) {
    const operator = ts.tokenToString(node.operatorToken.kind);
    if (operator === ',') {
      const expressions = [];
      const collect = (part) => {
        if (part.kind === K.BinaryExpression && part.operatorToken.kind === K.CommaToken) {
          collect(part.left);
          collect(part.right);
        } else {
          expressions.push(this.expression(part));
        }
      };
      collect(node);
      return this.from('SequenceExpression', node, { expressions });
    }
    if (ASSIGNMENT_OPERATORS.has(operator)) {
      return this.from('AssignmentExpression', node, {
        operator,
        left: operator === '=' ? this.toPattern(node.left) : this.expression(node.left),
        right: this.expression(node.right),
      });
    }
    const type = operator === '&&' || operator === '||' || operator === '??' ? 'LogicalExpression' : 'BinaryExpression';
    return this.from(type, node, {
      operator,
      left: this.expression(node.left),
      right: this.expression(node.right),
    });
  }

  property(node) {
    switch (node.kind) {
      case K.PropertyAssignment:
        return this.from('Property', node, {
          method: false,
          shorthand: false,
          ...this.key(node.name),
          value: this.expression(node.initializer),
          kind: 'init',
        });
      case K.ShorthandPropertyAssignment:
        return this.from('Property', node, {
          method: false,
          shorthand: true,
          computed: false,
          key: this.identifier(node.name),
          value: this.identifier(node.name),
          kind: 'init',
        });
      case K.MethodDeclaration:
      case K.GetAccessor:
      case K.SetAccessor:
        return this.from('Property', node, {
          method: node.kind === K.MethodDeclaration,
          shorthand: false,
          ...this.key(node.name),
          value: this.methodValue(node),
          kind: node.kind === K.GetAccessor ? 'get' : node.kind === K.SetAccessor ? 'set' : 'init',
        });
      case K.SpreadAssignment:
        return this.from('SpreadElement', node, { argument: this.expression(node.expression) });
      default:
        throw this.unsupported(node);
    }
  }

  // Binding patterns: of declarations, parameters and catch.
  pattern(node) {
    switch (node.kind) {
      case K.Identifier:
        return this.identifier(node);
      case K.ObjectBindingPattern:
        return this.from('ObjectPattern', node, {
          properties: node.elements.map((element) => {
            if (element.dotDotDotToken) {
              return this.from('RestElement', element, { argument: this.pattern(element.name) });
            }
            const value = this.withDefault(this.pattern(element.name), element.initializer, this.start(element.name));
            if (!element.propertyName) {
              return this.from('Property', element, {
                method: false,
                shorthand: true,
                computed: false,
                key: this.identifier(element.name),
                value,
                kind: 'init',
              });
            }
            return this.from('Property', element, {
              method: false,
              shorthand: false,
              ...this.key(element.propertyName),
              value,
              kind: 'init',
            });
          }),
        });
      case K.ArrayBindingPattern:
        return this.from('ArrayPattern', node, {
          elements: node.elements.map((element) => {
            if (element.kind === K.OmittedExpression) return null;
            if (element.dotDotDotToken) {
              return this.from('RestElement', element, { argument: this.pattern(element.name) });
            }
            return this.withDefault(this.pattern(element.name), element.initializer, this.start(element.name));
          }),
        });
      default:
        throw this.unsupported(node);
    }
  }

  withDefault(left, initializer, start) {
    if (!initializer) return left;
    const right = this.expression(initializer);
    return this.make('AssignmentPattern', start, initializer.end, { left, right });
  }

  // Expressions that are targets of assignments (= and for in / of) as patterns.
  toPattern(node) {
    switch (node.kind) {
      case K.ParenthesizedExpression:
        return this.toPattern(node.expression);
      case K.ObjectLiteralExpression:
        return this.from('ObjectPattern', node, {
          properties: node.properties.map((property) => {
            switch (property.kind) {
              case K.SpreadAssignment:
                return this.from('RestElement', property, { argument: this.toPattern(property.expression) });
              case K.ShorthandPropertyAssignment: {
                const key = this.identifier(property.name);
                const value = property.objectAssignmentInitializer
                  ? this.make('AssignmentPattern', this.start(property.name), property.end, {
                      left: this.identifier(property.name),
                      right: this.expression(property.objectAssignmentInitializer),
                    })
                  : this.identifier(property.name);
                return this.from('Property', property, {
                  method: false,
                  shorthand: true,
                  computed: false,
                  key,
                  value,
                  kind: 'init',
                });
              }
              case K.PropertyAssignment:
                return this.from('Property', property, {
                  method: false,
                  shorthand: false,
                  ...this.key(property.name),
                  value: this.toPattern(property.initializer),
                  kind: 'init',
                });
              default:
                return this.property(property);
            }
          }),
        });
      case K.ArrayLiteralExpression:
        return this.from('ArrayPattern', node, {
          elements: node.elements.map((element) => {
            if (element.kind === K.OmittedExpression) return null;
            if (element.kind === K.SpreadElement) {
              return this.from('RestElement', element, { argument: this.toPattern(element.expression) });
            }
            return this.toPattern(element);
          }),
        });
      case K.BinaryExpression:
        if (node.operatorToken.kind === K.EqualsToken) {
          return this.from('AssignmentPattern', node, {
            left: this.toPattern(node.left),
            right: this.expression(node.right),
          });
        }
        return this.expression(node);
      default:
        return this.expression(node);
    }
  }

  // JSX.
  jsx(node) {
    switch (node.kind) {
      case K.JsxElement:
        return this.from('JSXElement', node, {
          openingElement: this.jsxOpening(node.openingElement, false),
          children: this.jsxChildren(node.children),
          closingElement: this.from('JSXClosingElement', node.closingElement, {
            name: this.jsxName(node.closingElement.tagName),
          }),
        });
      case K.JsxSelfClosingElement:
        return this.from('JSXElement', node, {
          openingElement: this.jsxOpening(node, true),
          children: [],
          closingElement: null,
        });
      case K.JsxFragment:
        return this.from('JSXFragment', node, {
          openingFragment: this.from('JSXOpeningFragment', node.openingFragment, {
            attributes: [],
            selfClosing: false,
          }),
          children: this.jsxChildren(node.children),
          closingFragment: this.from('JSXClosingFragment', node.closingFragment, {}),
        });
      default:
        throw this.unsupported(node);
    }
  }

  jsxOpening(node, selfClosing) {
    return this.from('JSXOpeningElement', node, {
      name: this.jsxName(node.tagName),
      attributes: node.attributes.properties.map((attribute) => {
        if (attribute.kind === K.JsxSpreadAttribute) {
          return this.from('JSXSpreadAttribute', attribute, { argument: this.expression(attribute.expression) });
        }
        return this.from('JSXAttribute', attribute, {
          name: this.jsxName(attribute.name),
          value: attribute.initializer ? this.jsxValue(attribute.initializer) : null,
        });
      }),
      selfClosing,
    });
  }

  jsxValue(node) {
    if (node.kind === K.StringLiteral) {
      const raw = this.text.slice(this.start(node), node.end);
      return this.from('Literal', node, { value: decodeEntities(raw.slice(1, -1)), raw });
    }
    if (node.kind === K.JsxExpression) return this.jsxExpression(node);
    return this.jsx(node);
  }

  jsxExpression(node) {
    if (node.dotDotDotToken) {
      return this.from('JSXSpreadChild', node, { expression: this.expression(node.expression) });
    }
    const expression = node.expression
      ? this.expression(node.expression)
      : this.make('JSXEmptyExpression', this.start(node) + 1, node.end - 1, {});
    return this.from('JSXExpressionContainer', node, { expression });
  }

  jsxChildren(children) {
    return children.map((child) => {
      if (child.kind === K.JsxText) {
        const raw = this.text.slice(child.pos, child.end);
        return this.make('JSXText', child.pos, child.end, { value: decodeEntities(raw), raw });
      }
      if (child.kind === K.JsxExpression) return this.jsxExpression(child);
      return this.jsx(child);
    });
  }

  jsxName(node) {
    switch (node.kind) {
      case K.Identifier:
        return this.from('JSXIdentifier', node, { name: node.text });
      case K.ThisKeyword:
        return this.from('JSXIdentifier', node, { name: 'this' });
      case K.PropertyAccessExpression:
        return this.from('JSXMemberExpression', node, {
          object: this.jsxName(node.expression),
          property: this.from('JSXIdentifier', node.name, { name: node.name.text }),
        });
      case K.JsxNamespacedName:
        return this.from('JSXNamespacedName', node, {
          namespace: this.from('JSXIdentifier', node.namespace, { name: node.namespace.text }),
          name: this.from('JSXIdentifier', node.name, { name: node.name.text }),
        });
      default:
        throw this.unsupported(node);
    }
  }

  // The tokens, as espree makes them, by one scan of the text, which the tree tells where a / starts a regular
  // expression, a } goes on with a template, and a word is a name (Converter.tokenFor's types). Not for JSX: tokens().
  scanTokens() {
    const { text } = this;
    const { identifierEnds, regexStarts, templateStarts } = this.hints;
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
    const out = [];
    for (let kind = scanner.scan(); kind !== K.EndOfFileToken; kind = scanner.scan()) {
      const start = scanner.getTokenStart();
      if ((kind === K.SlashToken || kind === K.SlashEqualsToken) && regexStarts.has(start)) {
        kind = scanner.reScanSlashToken();
      } else if (kind === K.CloseBraceToken && templateStarts.has(start)) {
        kind = scanner.reScanTemplateToken(false);
      } else if (kind === K.GreaterThanToken) {
        // (TypeScript's scanner gives > alone, for its type arguments: >>, >= and >>> are one token.)
        kind = scanner.reScanGreaterToken();
      }
      const end = scanner.getTokenEnd();
      const value = text.slice(start, end);
      if (kind === K.Identifier || (kind >= K.FirstKeyword && kind <= K.LastKeyword)) {
        if (identifierEnds.has(end)) {
          // An identifier of the tree: a name, \u escapes decoded; static, let and yield are Keyword.
          const name = value.includes('\\') ? scanner.getTokenValue() : value;
          out.push(this.tokenOf(NAME_KEYWORDS.has(name) ? 'Keyword' : 'Identifier', name, start, end));
        } else if (kind === K.TrueKeyword || kind === K.FalseKeyword) {
          out.push(this.tokenOf('Boolean', value, start, end));
        } else if (kind === K.NullKeyword) {
          out.push(this.tokenOf('Null', value, start, end));
        } else {
          out.push(this.tokenOf(KEYWORDS.has(value) ? 'Keyword' : 'Identifier', value, start, end));
        }
        continue;
      }
      switch (kind) {
        case K.PrivateIdentifier:
          out.push(this.tokenOf('PrivateIdentifier', value.slice(1), start, end));
          break;
        case K.StringLiteral:
          out.push(this.tokenOf('String', value, start, end));
          break;
        case K.NumericLiteral:
        case K.BigIntLiteral:
          out.push(this.tokenOf('Numeric', value, start, end));
          break;
        case K.RegularExpressionLiteral: {
          const slash = value.lastIndexOf('/');
          out.push(
            this.tokenOf('RegularExpression', value, start, end, {
              regex: { flags: value.slice(slash + 1), pattern: value.slice(1, slash) },
            })
          );
          break;
        }
        case K.NoSubstitutionTemplateLiteral:
        case K.TemplateHead:
        case K.TemplateMiddle:
        case K.TemplateTail:
          out.push(this.tokenOf('Template', value, start, end));
          break;
        default:
          out.push(this.tokenOf('Punctuator', value, start, end));
      }
    }
    return out;
  }

  // The tokens, as espree makes them (of the tree: JSX's need it).
  tokens() {
    const out = [];
    const visit = (node) => {
      if (node.kind === K.JsxText) {
        if (node.end > node.pos) {
          const raw = this.text.slice(node.pos, node.end);
          out.push(this.tokenOf('JSXText', raw, node.pos, node.end));
        }
        return;
      }
      const children = node.getChildren(this.source);
      if (children.length === 0 || isTokenNode(node)) {
        if (node.kind === K.EndOfFileToken) return;
        const start = this.start(node);
        if (start >= node.end) return;
        const value = this.text.slice(start, node.end);
        out.push(this.tokenFor(node, value, start, node.end));
        return;
      }
      for (const child of children) {
        if (child.kind >= K.FirstJSDocNode && child.kind <= K.LastJSDocNode) continue;
        visit(child);
      }
    };
    visit(this.source);
    return out;
  }

  tokenOf(type, value, start, end, extra) {
    const token = new Located(type, start, end, this.locate);
    token.value = value;
    return extra ? Object.assign(token, extra) : token;
  }

  tokenFor(node, value, start, end) {
    switch (node.kind) {
      case K.Identifier: {
        if (inJsxName(node)) return this.tokenOf('JSXIdentifier', value, start, end);
        // Names are Identifier, keywords as property names too, but static, let and yield (a.static is Keyword); its
        // value is the name, \u escapes decoded.
        const name = value.includes('\\') && node.text !== undefined ? node.text : value;
        return this.tokenOf(NAME_KEYWORDS.has(name) ? 'Keyword' : 'Identifier', name, start, end);
      }
      case K.PrivateIdentifier:
        return this.tokenOf('PrivateIdentifier', value.slice(1), start, end);
      case K.StringLiteral:
        return this.tokenOf(inJsx(node) ? 'JSXText' : 'String', value, start, end);
      case K.NumericLiteral:
      case K.BigIntLiteral:
        return this.tokenOf('Numeric', value, start, end);
      case K.RegularExpressionLiteral: {
        const slash = value.lastIndexOf('/');
        return this.tokenOf('RegularExpression', value, start, end, {
          regex: { flags: value.slice(slash + 1), pattern: value.slice(1, slash) },
        });
      }
      case K.NoSubstitutionTemplateLiteral:
      case K.TemplateHead:
      case K.TemplateMiddle:
      case K.TemplateTail:
        return this.tokenOf('Template', value, start, end);
      case K.TrueKeyword:
      case K.FalseKeyword:
        return this.tokenOf('Boolean', value, start, end);
      case K.NullKeyword:
        return this.tokenOf('Null', value, start, end);
      case K.JsxText:
        return this.tokenOf('JSXText', value, start, end);
      default:
        if (/^[A-Za-z]/.test(value)) {
          if (inJsxName(node)) return this.tokenOf('JSXIdentifier', value, start, end);
          return this.tokenOf(KEYWORDS.has(value) ? 'Keyword' : 'Identifier', value, start, end);
        }
        return this.tokenOf('Punctuator', value, start, end);
    }
  }

  // The comments, from the trivia between the tokens (and the shebang).
  comments(tokens) {
    const out = [];
    const text = this.text;
    const add = (start, end, multiline) => {
      const value = multiline ? text.slice(start + 2, end - 2) : text.slice(start + 2, end);
      out.push(this.tokenOf(multiline ? 'Block' : 'Line', value, start, end));
    };
    let position = 0;
    const shebang = /^#!.*/.exec(text);
    if (shebang) {
      out.push(this.tokenOf('Hashbang', shebang[0].slice(2), 0, shebang[0].length));
      position = shebang[0].length;
    }
    // The gaps between the tokens are white space and comments: each / in one starts a comment (// to the end of the
    // line, /* to */). The next / is found going forward once through the text, not in a copy of each gap.
    let slash = text.indexOf('/', position);
    const gap = (start, end) => {
      while (slash !== -1 && slash < start) slash = text.indexOf('/', slash + 1);
      while (slash !== -1 && slash < end) {
        const next = slash + 1 < end ? text.charCodeAt(slash + 1) : 0;
        let close = slash + 1;
        if (next === 47) {
          close = slash + 2;
          while (close < end && !isLineBreak(text.charCodeAt(close))) close++;
          add(slash, close, false);
        } else if (next === 42) {
          const found = text.indexOf('*/', slash + 2);
          close = found < 0 || found + 2 > end ? end : found + 2;
          add(slash, close, true);
        }
        slash = text.indexOf('/', close);
      }
    };
    for (const token of tokens) {
      if (token.range[0] > position) gap(position, token.range[0]);
      position = token.range[1];
    }
    if (text.length > position) gap(position, text.length);
    return out;
  }
}

function isTokenNode(node) {
  return (
    node.kind === K.Identifier ||
    node.kind === K.PrivateIdentifier ||
    node.kind === K.StringLiteral ||
    node.kind === K.NumericLiteral ||
    node.kind === K.BigIntLiteral ||
    node.kind === K.RegularExpressionLiteral ||
    node.kind === K.NoSubstitutionTemplateLiteral ||
    node.kind === K.TemplateHead ||
    node.kind === K.TemplateMiddle ||
    node.kind === K.TemplateTail
  );
}

function inJsx(node) {
  const parent = node.parent;
  return Boolean(parent && parent.kind === K.JsxAttribute);
}

// An identifier of a JSX tag or attribute name.
function inJsxName(node) {
  let current = node;
  let parent = node.parent;
  while (parent && (parent.kind === K.PropertyAccessExpression || parent.kind === K.JsxNamespacedName)) {
    if (parent.kind === K.PropertyAccessExpression && !isJsxTag(parent)) break;
    current = parent;
    parent = parent.parent;
  }
  if (!parent) return false;
  if (parent.kind === K.JsxAttribute) return parent.name === current;
  if (
    parent.kind === K.JsxOpeningElement ||
    parent.kind === K.JsxSelfClosingElement ||
    parent.kind === K.JsxClosingElement
  ) {
    return parent.tagName === current;
  }
  return false;
}

function isJsxTag(node) {
  let current = node;
  while (current.parent && current.parent.kind === K.PropertyAccessExpression) current = current.parent;
  const parent = current.parent;
  return (
    Boolean(parent) &&
    (parent.kind === K.JsxOpeningElement ||
      parent.kind === K.JsxSelfClosingElement ||
      parent.kind === K.JsxClosingElement) &&
    parent.tagName === current
  );
}

function t_isDirective(statement) {
  return statement.kind === K.ExpressionStatement && statement.expression.kind === K.StringLiteral;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: String.fromCharCode(0xa0) };

// The HTML entities of JSX text, decoded (named ones of the most used, and numeric ones).
function decodeEntities(text) {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return String.fromCodePoint(code);
    }
    return ENTITIES[entity] ?? all;
  });
}

// Tokens of a piece of code, which need not parse (`!`, `foo(`): espree's tokenize(), with the comments as
// `tokens.comments`. A / starts a regular expression where an expression may start; an invalid piece throws.
// The errors of TypeScript's scanner that make a piece of code not tokens, as espree's tokenize() fails on it:
// unterminated strings, templates, regular expressions and comments, and characters that are no token.
const TOKEN_ERRORS = new Set([1002, 1160, 1161, 1010, 1127]);

function tokenize(text) {
  let error = null;
  // For each template being read, the braces open in its current ${...}.
  const braces = [];
  const onError = (message, length) => {
    if (!error && TOKEN_ERRORS.has(message.code)) error = { code: message.code, message: message.message, length };
  };
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text, onError);
  const tokens = [];
  const comments = [];
  const locate = lineIndex(text);
  const make = (type, value, start, end, extra) => ({
    type,
    value,
    ...extra,
    range: [start, end],
    loc: { start: locate(start), end: locate(end) },
  });
  const regexAllowed = () => {
    const last = tokens[tokens.length - 1];
    if (!last) return true;
    if (last.type === 'Punctuator') return ![')', ']', '}'].includes(last.value);
    return last.type === 'Keyword' && !['this', 'super'].includes(last.value);
  };
  for (;;) {
    let kind = scanner.scan();
    if (kind === K.EndOfFileToken) break;
    if ((kind === K.SlashToken || kind === K.SlashEqualsToken) && regexAllowed()) kind = scanner.reScanSlashToken();
    // (TypeScript's scanner gives > alone, for its type arguments: >>, >= and >>> are one token.)
    if (kind === K.GreaterThanToken) kind = scanner.reScanGreaterToken();
    // Braces inside a template's ${...}: the one that closes it goes on with the template.
    if (kind === K.OpenBraceToken && braces.length) braces[braces.length - 1] += 1;
    if (kind === K.CloseBraceToken && braces.length) {
      if (braces[braces.length - 1] === 0) kind = scanner.reScanTemplateToken(false);
      else braces[braces.length - 1] -= 1;
    }
    if (kind === K.TemplateHead) braces.push(0);
    if (kind === K.TemplateTail) braces.pop();
    // As espree: a template that is only its first character at the end (` or the } of a ${}) is no error: the `
    // is left out, the } is one.
    if (
      error?.code === 1160 &&
      scanner.getTokenEnd() === text.length &&
      scanner.getTokenEnd() - scanner.getTokenStart() === 1
    ) {
      error = null;
      if (text[scanner.getTokenStart()] === '`') break;
      kind = K.CloseBraceToken;
    }
    if (error) throw new ParseError(error.message, scanner.getTokenStart(), 1, scanner.getTokenStart() + 1);
    const start = scanner.getTokenStart();
    const end = scanner.getTokenEnd();
    const value = text.slice(start, end);
    if (kind === K.WhitespaceTrivia || kind === K.NewLineTrivia) continue;
    if (kind === K.SingleLineCommentTrivia) {
      comments.push(make('Line', value.slice(2), start, end));
      continue;
    }
    if (kind === K.MultiLineCommentTrivia) {
      comments.push(make('Block', value.slice(2, -2), start, end));
      continue;
    }
    if (kind === K.ShebangTrivia) {
      comments.push(make('Hashbang', value.slice(2), start, end));
      continue;
    }
    if (kind === K.Unknown || kind === K.AtToken)
      throw new ParseError(`Unexpected character '${value}'`, start, 1, start + 1);
    let type;
    if (kind === K.Identifier) type = NAME_KEYWORDS.has(value) ? 'Keyword' : 'Identifier';
    else if (kind === K.PrivateIdentifier) type = 'PrivateIdentifier';
    else if (kind === K.StringLiteral) type = 'String';
    else if (kind === K.NumericLiteral || kind === K.BigIntLiteral) type = 'Numeric';
    else if (kind === K.RegularExpressionLiteral) {
      const slash = value.lastIndexOf('/');
      tokens.push(
        make('RegularExpression', value, start, end, {
          regex: { flags: value.slice(slash + 1), pattern: value.slice(1, slash) },
        })
      );
      continue;
    } else if (
      kind === K.NoSubstitutionTemplateLiteral ||
      kind === K.TemplateHead ||
      kind === K.TemplateMiddle ||
      kind === K.TemplateTail
    ) {
      type = 'Template';
    } else if (kind === K.TrueKeyword || kind === K.FalseKeyword) type = 'Boolean';
    else if (kind === K.NullKeyword) type = 'Null';
    else if (/^[A-Za-z]/.test(value)) type = KEYWORDS.has(value) ? 'Keyword' : 'Identifier';
    else type = 'Punctuator';
    tokens.push(make(type, kind === K.PrivateIdentifier ? value.slice(1) : value, start, end));
  }
  tokens.comments = comments;
  return tokens;
}

// The parser of a config's languageOptions, where ESLint has espree: parse(text, parserOptions), the options as espree
// takes them (sourceType, ecmaFeatures.jsx, and the path of the file).
const defaultParser = {
  parse: (text, options = {}) =>
    parse(text, {
      sourceType: options.sourceType,
      jsx: Boolean(options.ecmaFeatures?.jsx),
      filePath: options.filePath,
    }),
};

export { parse, tokenize, ParseError, defaultParser };
