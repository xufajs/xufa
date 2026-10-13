// Scope analysis: one walk of the tree that opens a scope where a block of code starts one, defines the names that
// declarations, parameters, imports, functions and classes bind, and makes a reference of every identifier that reads
// or writes a variable, closing each scope (resolving its references) when its block ends. What it makes, and in what
// order, is what eslint-scope makes, as ESLint runs it: rules depend on both.

import { KEYS, getKeys, isNode } from '../ast/visitor-keys.js';
import { Variable, Definition, ParameterDefinition, Reference } from './variable.js';

// Calls `visit` on each child of a node, in the order of its keys.
function eachChild(node, visit) {
  for (const key of KEYS[node.type] ?? getKeys(node)) {
    const child = node[key];
    if (!child) continue;
    if (Array.isArray(child)) {
      for (const item of child) if (isNode(item)) visit(item);
    } else if (isNode(child)) {
      visit(child);
    }
  }
}

const PATTERNS = new Set([
  'Identifier',
  'ObjectPattern',
  'ArrayPattern',
  'SpreadElement',
  'RestElement',
  'AssignmentPattern',
]);
const NO_ASSIGNMENTS = Object.freeze([]);

// The names a pattern binds, each given to `found(identifier, { topLevel, rest, assignments })` (assignments: the
// defaults it is inside), and the expressions inside the pattern that are evaluated (rightHandNodes: defaults,
// computed keys, the objects of member expressions), in eslint-scope's order.
class PatternWalker {
  constructor(root, found) {
    this.root = root;
    this.found = found;
    this.assignments = [];
    this.restElements = [];
    this.rightHandNodes = [];
    this.walk = this.walk.bind(this);
  }

  walk(node) {
    if (node == null) return;
    switch (node.type) {
      case 'Identifier': {
        const rest = this.restElements.at(-1);
        this.found(node, {
          topLevel: node === this.root,
          rest: rest !== undefined && rest.argument === node,
          assignments: this.assignments,
        });
        return;
      }
      case 'Property':
        if (node.computed) this.rightHandNodes.push(node.key);
        this.walk(node.value);
        return;
      case 'ArrayPattern':
      case 'ArrayExpression':
        for (const element of node.elements) this.walk(element);
        return;
      case 'AssignmentPattern':
      case 'AssignmentExpression':
        this.assignments.push(node);
        this.walk(node.left);
        this.rightHandNodes.push(node.right);
        this.assignments.pop();
        return;
      case 'RestElement':
        this.restElements.push(node);
        this.walk(node.argument);
        this.restElements.pop();
        return;
      case 'MemberExpression':
        if (node.computed) this.rightHandNodes.push(node.property);
        this.rightHandNodes.push(node.object);
        return;
      case 'SpreadElement':
        this.walk(node.argument);
        return;
      case 'CallExpression':
        for (const argument of node.arguments) this.rightHandNodes.push(argument);
        this.walk(node.callee);
        return;
      default:
        eachChild(node, this.walk);
    }
  }
}

class Analyzer {
  constructor(manager) {
    this.manager = manager;
    // Inside the value of a class's method: its functions are methods (strict).
    this.isInnerMethodDefinition = false;
    this.visit = this.visit.bind(this);
  }

  get scope() {
    return this.manager.__currentScope;
  }

  // Closes the scopes of a node (a named function expression has two) as its walk ends.
  close(node) {
    while (this.scope && node === this.scope.block) this.manager.__currentScope = this.scope.__close(this.manager);
  }

  // Walks a pattern: `found` for each name it binds; with `rightHand`, then the expressions inside it.
  visitPattern(pattern, rightHand, found) {
    if (pattern == null) return;
    if (pattern.type === 'Identifier') {
      found(pattern, { topLevel: true, rest: false, assignments: NO_ASSIGNMENTS });
      return;
    }
    const walker = new PatternWalker(pattern, found);
    walker.walk(pattern);
    if (rightHand) for (const node of walker.rightHandNodes) this.visit(node);
  }

  // The writes of a name of a pattern by the defaults it is inside (`{ a = 1 }`, `[a = 1]`).
  referencingDefaultValue(pattern, assignments, maybeImplicitGlobal, init) {
    const scope = this.scope;
    for (const assignment of assignments) {
      scope.__referencing(
        pattern,
        Reference.WRITE,
        assignment.right,
        maybeImplicitGlobal,
        pattern !== assignment.left,
        init
      );
    }
  }

  // What an assignment outside strict code may make: a global, when nothing declares the name.
  implicitGlobal(pattern, node) {
    return this.scope.isStrict ? null : { pattern, node };
  }

  visit(node) {
    if (node == null) return;
    switch (node.type) {
      case 'Program':
        return this.visitProgram(node);
      case 'Identifier':
        return this.scope.__referencing(node);
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        return this.visitFunction(node);
      case 'ClassDeclaration':
      case 'ClassExpression':
        return this.visitClass(node);
      case 'VariableDeclaration':
        return this.visitVariableDeclaration(node);
      case 'AssignmentExpression':
        return this.visitAssignment(node);
      case 'UpdateExpression':
        if (PATTERNS.has(node.argument.type)) this.scope.__referencing(node.argument, Reference.RW, null);
        else eachChild(node, this.visit);
        return;
      case 'MemberExpression':
        this.visit(node.object);
        if (node.computed) this.visit(node.property);
        return;
      case 'Property':
      case 'MethodDefinition':
        return this.visitProperty(node);
      case 'PropertyDefinition':
        if (node.computed) this.visit(node.key);
        if (node.value) {
          this.manager.__nestScope('class-field-initializer', node.value, true);
          this.visit(node.value);
          this.close(node.value);
        }
        return;
      case 'StaticBlock':
        this.manager.__nestScope('class-static-block', node, true);
        eachChild(node, this.visit);
        return this.close(node);
      case 'BlockStatement':
        if (this.manager.__isES6()) this.manager.__nestScope('block', node);
        eachChild(node, this.visit);
        return this.close(node);
      case 'ForStatement':
        if (node.init?.type === 'VariableDeclaration' && node.init.kind !== 'var')
          this.manager.__nestScope('for', node);
        eachChild(node, this.visit);
        return this.close(node);
      case 'ForInStatement':
      case 'ForOfStatement':
        return this.visitForIn(node);
      case 'CatchClause':
        return this.visitCatch(node);
      case 'SwitchStatement':
        this.visit(node.discriminant);
        if (this.manager.__isES6()) this.manager.__nestScope('switch', node);
        for (const switchCase of node.cases) this.visit(switchCase);
        return this.close(node);
      case 'WithStatement':
        this.visit(node.object);
        this.manager.__nestScope('with', node);
        this.visit(node.body);
        return this.close(node);
      case 'CallExpression':
        if (!this.manager.__ignoreEval() && node.callee.type === 'Identifier' && node.callee.name === 'eval') {
          this.scope.variableScope.__detectEval();
        }
        eachChild(node, this.visit);
        return;
      case 'ThisExpression':
        return this.scope.variableScope.__detectThis();
      case 'LabeledStatement':
        return this.visit(node.body);
      case 'ImportDeclaration':
        return this.visitImport(node);
      case 'ExportAllDeclaration':
      case 'ExportDefaultDeclaration':
      case 'ExportNamedDeclaration':
        if (node.source) return;
        if (node.declaration) return this.visit(node.declaration);
        eachChild(node, this.visit);
        return;
      case 'ExportSpecifier':
        return this.visit(node.local);
      // Names that are not references: labels, private names, import.meta, JSX names (as ESLint runs it).
      case 'BreakStatement':
      case 'ContinueStatement':
      case 'PrivateIdentifier':
      case 'MetaProperty':
      case 'JSXIdentifier':
        return;
      case 'JSXMemberExpression':
        return this.visit(node.object);
      case 'JSXOpeningElement':
        for (const attribute of node.attributes) this.visit(attribute);
        return;
      case 'JSXAttribute':
        return this.visit(node.value);
      case 'JSXExpressionContainer':
        return this.visit(node.expression);
      case 'JSXNamespacedName':
        this.visit(node.namespace);
        return this.visit(node.name);
      default:
        eachChild(node, this.visit);
    }
  }

  visitProgram(node) {
    const manager = this.manager;
    manager.__nestGlobalScope(node);
    if (manager.isGlobalReturn()) {
      this.scope.isStrict = false;
      manager.__nestFunctionScope(node, false);
    }
    if (manager.__isES6() && manager.isModule()) manager.__nestScope('module', node);
    if (manager.isStrictModeSupported() && manager.isImpliedStrict()) this.scope.isStrict = true;
    eachChild(node, this.visit);
    this.close(node);
  }

  visitFunction(node) {
    if (node.type === 'FunctionDeclaration') {
      this.scope.__define(node.id, new Definition(Variable.FunctionName, node.id, node, null, null, null));
    }
    if (node.type === 'FunctionExpression' && node.id) {
      // The name of a function expression is in a scope of its own, around the function's.
      const scope = this.manager.__nestScope('function-expression-name', node);
      scope.__define(node.id, new Definition(Variable.FunctionName, node.id, node, null, null, null));
      scope.functionExpressionScope = true;
    }
    this.manager.__nestFunctionScope(node, this.isInnerMethodDefinition);
    node.params.forEach((param, index) => {
      this.visitPattern(param, true, (pattern, info) => {
        this.scope.__define(pattern, new ParameterDefinition(pattern, node, index, info.rest));
        this.referencingDefaultValue(pattern, info.assignments, null, true);
      });
    });
    if (node.body) {
      // A function's block is its scope: no block scope of its own.
      if (node.body.type === 'BlockStatement') eachChild(node.body, this.visit);
      else this.visit(node.body);
    }
    this.close(node);
  }

  visitClass(node) {
    if (node.type === 'ClassDeclaration') {
      this.scope.__define(node.id, new Definition(Variable.ClassName, node.id, node, null, null, null));
    }
    this.manager.__nestScope('class', node);
    // The name of the class inside it (eslint-scope leaves parent, index and kind undefined here).
    if (node.id) this.scope.__define(node.id, new Definition(Variable.ClassName, node.id, node));
    this.visit(node.superClass);
    this.visit(node.body);
    this.close(node);
  }

  visitProperty(node) {
    if (node.computed) this.visit(node.key);
    if (node.type !== 'MethodDefinition') return this.visit(node.value);
    const previous = this.isInnerMethodDefinition;
    this.isInnerMethodDefinition = true;
    this.visit(node.value);
    this.isInnerMethodDefinition = previous;
  }

  visitVariableDeclaration(node) {
    const target = node.kind === 'var' ? this.scope.variableScope : this.scope;
    node.declarations.forEach((declarator, index) => {
      const { init } = declarator;
      this.visitPattern(declarator.id, true, (pattern, info) => {
        target.__define(pattern, new Definition(Variable.Variable, pattern, declarator, node, index, node.kind));
        this.referencingDefaultValue(pattern, info.assignments, null, true);
        if (init) this.scope.__referencing(pattern, Reference.WRITE, init, null, !info.topLevel, true);
      });
      if (init) this.visit(init);
    });
  }

  visitAssignment(node) {
    if (!PATTERNS.has(node.left.type)) {
      this.visit(node.left);
    } else if (node.operator === '=') {
      this.visitPattern(node.left, true, (pattern, info) => {
        const maybeImplicitGlobal = this.implicitGlobal(pattern, node);
        this.referencingDefaultValue(pattern, info.assignments, maybeImplicitGlobal, false);
        this.scope.__referencing(pattern, Reference.WRITE, node.right, maybeImplicitGlobal, !info.topLevel, false);
      });
    } else {
      this.scope.__referencing(node.left, Reference.RW, node.right);
    }
    this.visit(node.right);
  }

  visitForIn(node) {
    const { left } = node;
    if (left.type === 'VariableDeclaration' && left.kind !== 'var') this.manager.__nestScope('for', node);
    if (left.type === 'VariableDeclaration') {
      this.visit(left);
      this.visitPattern(left.declarations[0].id, false, (pattern) => {
        this.scope.__referencing(pattern, Reference.WRITE, node.right, null, true, true);
      });
    } else {
      this.visitPattern(left, true, (pattern, info) => {
        const maybeImplicitGlobal = this.implicitGlobal(pattern, node);
        this.referencingDefaultValue(pattern, info.assignments, maybeImplicitGlobal, false);
        this.scope.__referencing(pattern, Reference.WRITE, node.right, maybeImplicitGlobal, true, false);
      });
    }
    this.visit(node.right);
    this.visit(node.body);
    this.close(node);
  }

  visitCatch(node) {
    this.manager.__nestScope('catch', node);
    this.visitPattern(node.param, true, (pattern, info) => {
      this.scope.__define(pattern, new Definition(Variable.CatchClause, pattern, node, null, null, null));
      this.referencingDefaultValue(pattern, info.assignments, null, true);
    });
    this.visit(node.body);
    this.close(node);
  }

  visitImport(node) {
    if (!(this.manager.__isES6() && this.manager.isModule())) {
      throw new Error('ImportDeclaration should appear when the mode is ES6 and in the module context.');
    }
    for (const specifier of node.specifiers) {
      const local = specifier.local;
      if (!local) continue;
      this.visitPattern(local, false, (pattern) => {
        this.scope.__define(pattern, new Definition(Variable.ImportBinding, pattern, specifier, node, null, null));
      });
    }
  }
}

export { Analyzer };
