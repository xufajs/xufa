// The scopes of a JavaScript file (parsed by TypeScript, with parents) and the bindings of each: where every name is
// declared and where it is used. For the renaming of minifyJs, and for a linter's rules of names.
//
// var and function declarations belong to their function (those in nested blocks too), let, const and class to their
// block; parameters and the name of a function expression to the function. A scope with a direct eval() or a with
// statement, and those around it, are "unsafe": what code could reach there by name is not known.

class Scope {
  constructor(parent, node, kind) {
    this.parent = parent;
    this.node = node;
    this.kind = kind; // 'global', 'function' or 'block'
    this.bindings = new Map();
    this.children = [];
    this.unsafe = false;
    // Bindings declared around this scope and used inside it.
    this.crossing = new Set();
    if (parent) parent.children.push(this);
  }

  declare(name, node) {
    let binding = this.bindings.get(name);
    if (!binding) {
      binding = { name, scope: this, declarations: [], references: [] };
      this.bindings.set(name, binding);
    }
    binding.declarations.push(node);
    return binding;
  }

  lookup(name) {
    for (let scope = this; scope; scope = scope.parent) {
      const binding = scope.bindings.get(name);
      if (binding) return binding;
    }
    return null;
  }
}

// Whether an identifier is a name of something (a binding, or one used): not a property, a label or a key.
function isName(t, node) {
  const parent = node.parent;
  if (!parent) return true;
  switch (parent.kind) {
    case t.SyntaxKind.PropertyAccessExpression:
      return parent.expression === node;
    case t.SyntaxKind.PropertyAssignment:
    case t.SyntaxKind.MethodDeclaration:
    case t.SyntaxKind.PropertyDeclaration:
    case t.SyntaxKind.GetAccessor:
    case t.SyntaxKind.SetAccessor:
    case t.SyntaxKind.EnumMember:
      return parent.name !== node;
    case t.SyntaxKind.BindingElement:
      return parent.propertyName !== node;
    case t.SyntaxKind.LabeledStatement:
    case t.SyntaxKind.BreakStatement:
    case t.SyntaxKind.ContinueStatement:
      return parent.label !== node;
    case t.SyntaxKind.MetaProperty:
    case t.SyntaxKind.ImportSpecifier:
    case t.SyntaxKind.ExportSpecifier:
    case t.SyntaxKind.NamespaceExport:
    case t.SyntaxKind.JsxAttribute:
    case t.SyntaxKind.QualifiedName:
      return false;
    default:
      return true;
  }
}

const isFunction = (t, node) =>
  t.isFunctionDeclaration(node) ||
  t.isFunctionExpression(node) ||
  t.isArrowFunction(node) ||
  t.isMethodDeclaration(node) ||
  t.isConstructorDeclaration(node) ||
  t.isGetAccessorDeclaration(node) ||
  t.isSetAccessorDeclaration(node) ||
  t.isClassStaticBlockDeclaration(node);

/**
 * The scopes of `source` (a ts.SourceFile made with setParentNodes): { root, scopes, references, globals }.
 * `references` are [identifier, binding or null]; `globals` the names used that nothing declares.
 */
function analyze(t, source) {
  const root = new Scope(null, source, 'global');
  const scopes = [root];
  const declared = new Set();
  const hoisted = [];
  const uses = [];

  const functionOf = (scope) => {
    while (scope.kind === 'block') scope = scope.parent;
    return scope;
  };
  const open = (parent, node, kind) => {
    const scope = new Scope(parent, node, kind);
    scopes.push(scope);
    return scope;
  };
  const declarePattern = (scope, name) => {
    if (t.isIdentifier(name)) {
      scope.declare(name.text, name);
      declared.add(name);
    } else if (name) {
      for (const element of name.elements) if (!t.isOmittedExpression(element)) declarePattern(scope, element.name);
    }
  };
  const markUnsafe = (scope) => {
    for (; scope; scope = scope.parent) scope.unsafe = true;
  };

  const visit = (node, scope) => {
    if (isFunction(t, node)) {
      if (t.isFunctionDeclaration(node) && node.name) {
        // In its function, wherever it is written (as sloppy code has it: names used outside its block still find it).
        const binding = functionOf(scope).declare(node.name.text, node.name);
        // The blocks it is written in have its name too: none of theirs may take it.
        hoisted.push([binding, scope]);
        declared.add(node.name);
      }
      const inner = open(scope, node, 'function');
      if (t.isFunctionExpression(node) && node.name) {
        inner.declare(node.name.text, node.name);
        declared.add(node.name);
      }
      if (node.name && !t.isIdentifier(node.name)) visit(node.name, scope); // a computed key
      for (const parameter of node.parameters ?? []) declarePattern(inner, parameter.name);
      for (const parameter of node.parameters ?? []) visit(parameter, inner);
      if (node.body) {
        if (t.isBlock(node.body)) node.body.statements.forEach((statement) => visit(statement, inner));
        else visit(node.body, inner);
      }
      return;
    }
    if (t.isClassDeclaration(node) || t.isClassExpression(node)) {
      let inner = scope;
      if (node.name) {
        if (t.isClassDeclaration(node)) scope.declare(node.name.text, node.name);
        else (inner = open(scope, node, 'block')).declare(node.name.text, node.name);
        declared.add(node.name);
      }
      t.forEachChild(node, (child) => visit(child, inner));
      return;
    }
    if (t.isVariableDeclarationList(node)) {
      const lexical = node.flags & (t.NodeFlags.Let | t.NodeFlags.Const | t.NodeFlags.Using);
      const target = lexical ? scope : functionOf(scope);
      for (const declaration of node.declarations) declarePattern(target, declaration.name);
    } else if (t.isCatchClause(node)) {
      const inner = open(scope, node, 'block');
      if (node.variableDeclaration) declarePattern(inner, node.variableDeclaration.name);
      t.forEachChild(node, (child) => visit(child, inner));
      return;
    } else if (
      (t.isBlock(node) && !isFunction(t, node.parent) && !t.isCatchClause(node.parent)) ||
      t.isForStatement(node) ||
      t.isForInStatement(node) ||
      t.isForOfStatement(node) ||
      t.isCaseBlock(node)
    ) {
      const inner = open(scope, node, 'block');
      t.forEachChild(node, (child) => visit(child, inner));
      return;
    } else if (t.isImportDeclaration(node)) {
      // The names an import makes, in the scope of the module.
      const clause = node.importClause;
      const names = [];
      if (clause?.name) names.push(clause.name);
      if (clause?.namedBindings) {
        if (t.isNamespaceImport(clause.namedBindings)) names.push(clause.namedBindings.name);
        else names.push(...clause.namedBindings.elements.map((element) => element.name));
      }
      for (const name of names) {
        scope.declare(name.text, name);
        declared.add(name);
      }
      return;
    } else if (t.isExportSpecifier(node) && !node.parent.parent.moduleSpecifier) {
      // export { a as b }: a is used.
      uses.push([node.propertyName ?? node.name, scope]);
      return;
    } else if (t.isWithStatement(node)) {
      markUnsafe(scope);
    } else if (t.isCallExpression(node) && t.isIdentifier(node.expression) && node.expression.text === 'eval') {
      markUnsafe(scope);
    } else if (t.isIdentifier(node)) {
      if (!declared.has(node) && isName(t, node)) uses.push([node, scope]);
      return;
    }
    t.forEachChild(node, (child) => visit(child, scope));
  };
  source.statements.forEach((statement) => visit(statement, root));

  for (const [binding, scope] of hoisted) {
    for (let inner = scope; inner !== binding.scope; inner = inner.parent) inner.crossing.add(binding);
  }
  const references = [];
  const globals = new Set();
  for (const [node, scope] of uses) {
    const binding = scope.lookup(node.text);
    references.push([node, binding]);
    if (!binding) {
      globals.add(node.text);
      continue;
    }
    binding.references.push(node);
    for (let inner = scope; inner !== binding.scope; inner = inner.parent) inner.crossing.add(binding);
  }
  return { root, scopes, references, globals };
}

export { analyze, Scope };
