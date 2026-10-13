// Variables that are declared but never read: reads that only update the variable itself (`a++`, `a = a + 1`), calls
// of a function from inside itself and writes do not count. Options leave out globals, parameters, caught errors,
// rest siblings, `using` declarations, classes with a static block, and names matching ignore patterns (which can be
// reported when used anyway). Each problem suggests removing the declaration; nothing is fixed automatically.

import {
  isFunction,
  isLoop,
  isInLoop,
  getUpperFunction,
  isLogicalAssignmentOperator,
  isSemicolonToken,
  isOpeningBraceToken,
  getNameLocationInGlobalDirectiveComment,
} from './utils/ast.js';

const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;
const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

// How each kind of variable is named in the messages about its ignore pattern.
const DESCRIPTIONS = {
  'array-destructure': 'elements of array destructuring',
  'catch-clause': 'caught errors',
  parameter: 'args',
  variable: 'vars',
};

/** Whether `inner` lies within `outer`. */
const isInside = (inner, outer) => inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];

/** Whether the variable is declared in an `export` declaration. */
function isExported(variable) {
  const def = variable.defs[0];
  if (!def) return false;
  if (def.node.type === 'VariableDeclarator') return def.node.parent.parent.type.startsWith('Export');
  return def.type !== 'Parameter' && def.node.parent.type.startsWith('Export');
}

/** Whether the variable is declared with `using` or `await using`. */
function usesExplicitResourceManagement(variable) {
  const [def] = variable.defs;
  return def?.type === 'Variable' && (def.parent.kind === 'using' || def.parent.kind === 'await using');
}

/** Whether the node is a property of an object pattern ending with a rest element. */
const hasRestSibling = (node) =>
  node.type === 'Property' &&
  node.parent.type === 'ObjectPattern' &&
  REST_PROPERTY_TYPE.test(node.parent.properties.at(-1).type);

/** Whether a definition or a reference of the variable is a sibling of a rest property. */
const hasRestSpreadSibling = (variable) =>
  variable.defs.some((def) => hasRestSibling(def.name.parent)) ||
  variable.references.some((ref) => hasRestSibling(ref.identifier.parent));

/** The functions the variable names: function declarations and function expressions in its initialisers. */
function getFunctionDefinitions(variable) {
  const nodes = [];
  for (const { type, node } of variable.defs) {
    if (type === 'FunctionName') nodes.push(node);
    const init = type === 'Variable' && node.init;
    if (init && (init.type === 'FunctionExpression' || init.type === 'ArrowFunctionExpression')) nodes.push(init);
  }
  return nodes;
}

/** Whether the reference is made from within one of the given function nodes. */
function isSelfReference(ref, nodes) {
  for (let scope = ref.from; scope; scope = scope.upper) {
    if (nodes.includes(scope.block)) return true;
  }
  return false;
}

/** Whether the value of the expression is discarded (an expression statement, or a non-last sequence element). */
function isUnusedExpression(node) {
  const { parent } = node;
  if (parent.type === 'ExpressionStatement') return true;
  if (parent.type !== 'SequenceExpression') return false;
  return parent.expressions.at(-1) !== node || isUnusedExpression(parent);
}

// The right side of the assignment the reference is the left side of, when the assignment is a statement made in
// the scope of the variable and outside loops; the previous right side while the reference is inside it.
function getRhsNode(ref, prevRhsNode) {
  const id = ref.identifier;
  const { parent } = id;
  if (prevRhsNode && isInside(id, prevRhsNode)) return prevRhsNode;
  if (parent.type !== 'AssignmentExpression' || !isUnusedExpression(parent) || id !== parent.left) return null;
  const canBeUsedLater = ref.from.variableScope !== ref.resolved.scope.variableScope || isInLoop(id);
  return canBeUsedLater ? null : parent.right;
}

// Whether the function within the right side `rhsNode` ends up stored somewhere (assigned, passed as an argument,
// or bound to a property of such an object), so that it can be called later. Statements are taken as storing.
function isStorableFunction(funcNode, rhsNode) {
  let node = funcNode;
  for (let { parent } = funcNode; parent && isInside(parent, rhsNode); node = parent, parent = parent.parent) {
    switch (parent.type) {
      case 'SequenceExpression':
        if (parent.expressions.at(-1) !== node) return false;
        break;
      case 'CallExpression':
      case 'NewExpression':
        return parent.callee !== node;
      case 'AssignmentExpression':
      case 'TaggedTemplateExpression':
      case 'YieldExpression':
        return true;
      default:
        if (STATEMENT_TYPE.test(parent.type)) return true;
    }
  }
  return false;
}

/** Whether the identifier is inside a function of the right side that can be called later. */
function isInsideOfStorableFunction(id, rhsNode) {
  const funcNode = getUpperFunction(id);
  return funcNode && isInside(funcNode, rhsNode) && isStorableFunction(funcNode, rhsNode);
}

// Whether the reference reads the variable only to update it: `a += 1`, `a++`, or `a = a + 1`.
function isReadForItself(ref, rhsNode) {
  if (!ref.isRead()) return false;
  const id = ref.identifier;
  const { parent } = id;
  if (parent.type === 'AssignmentExpression') {
    if (parent.left === id && isUnusedExpression(parent) && !isLogicalAssignmentOperator(parent.operator)) return true;
  } else if (parent.type === 'UpdateExpression' && isUnusedExpression(parent)) {
    return true;
  }
  return Boolean(rhsNode) && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode);
}

/** Whether the reference is the target of a for-in/of loop whose body starts with a return. */
function isForInOfRef(ref) {
  let target = ref.identifier.parent;
  if (target.type === 'VariableDeclarator') target = target.parent.parent;
  if (target.type !== 'ForInStatement' && target.type !== 'ForOfStatement') return false;
  const statement = target.body.type === 'BlockStatement' ? target.body.body[0] : target.body;
  return statement?.type === 'ReturnStatement';
}

/** Whether the variable is read for something other than updating itself or calling itself from inside. */
function isUsedVariable(variable) {
  if (variable.eslintUsed) return true;
  let functionNodes;
  let rhsNode = null;
  return variable.references.some((ref) => {
    if (isForInOfRef(ref)) return true;
    const forItself = isReadForItself(ref, rhsNode);
    rhsNode = getRhsNode(ref, rhsNode);
    if (!ref.isRead() || forItself) return false;
    functionNodes ??= getFunctionDefinitions(variable);
    return !functionNodes.length || !isSelfReference(ref, functionNodes);
  });
}

/** Whether no parameter after this one is referenced or marked as used. */
function isAfterLastUsedArg(sourceCode, variable) {
  const params = sourceCode.getDeclaredVariables(variable.defs[0].node);
  for (let i = params.indexOf(variable) + 1; i < params.length; i++) {
    if (params[i].references.length > 0 || params[i].eslintUsed) return false;
  }
  return true;
}

/** Whether the class has a `static {}` block. */
const hasStaticBlock = (classNode) => classNode.body.body.some((member) => member.type === 'StaticBlock');

/** Whether the setter's parameter is the definition's. */
const isSetterParameter = (def) =>
  (def.node.parent.type === 'Property' || def.node.parent.type === 'MethodDefinition') &&
  def.node.parent.kind === 'set';

// The suggestion removes the declaration of the variable, along with the comma or the pattern around it. The helpers
// below take `fx`, holding the `sourceCode` and the `fixer`, and return null where it is not safe to remove.

const tokenBefore = (fx, node, skip) => fx.sourceCode.getTokenBefore(node, skip);
const tokenAfter = (fx, node) => fx.sourceCode.getTokenAfter(node);

/** Removes the node with the token after it (its comma). */
const removeWithNext = (fx, node) => fx.fixer.removeRange([node.range[0], tokenAfter(fx, node).range[1]]);

/** Removes the node with the token before it (its comma). */
const removeWithPrevious = (fx, node) => fx.fixer.removeRange([tokenBefore(fx, node).range[0], node.range[1]]);

/** Removes an item of a list opened by `open`: the first one with the comma after it, others with the one before. */
function removeListItem(fx, node, open) {
  const before = tokenBefore(fx, node);
  if (before.value === open && tokenAfter(fx, node).value === ',') return removeWithNext(fx, node);
  return fx.fixer.removeRange([before.range[0], node.range[1]]);
}

/** Whether the array pattern has a single element (holes aside). */
function hasSingleElement(node) {
  let count = 0;
  for (const element of node.elements) if (element !== null) count++;
  return count === 1;
}

// Removes a declaration, unless a string after it could become a directive or the token before it leaves the ASI
// unclear.
function removeDeclaration(fx, declaration) {
  const next = tokenAfter(fx, declaration);
  const prev = tokenBefore(fx, declaration);
  if (next && (next.type === 'String' || (prev && !isSemicolonToken(prev) && !isOpeningBraceToken(prev)))) return null;
  return fx.fixer.removeRange(declaration.range);
}

/** Removes one declarator of several: with the comma before it, or the first with the comma after it. */
const removeDeclarator = (fx, declarator) =>
  tokenBefore(fx, declarator).value === ',' ? removeWithPrevious(fx, declarator) : removeWithNext(fx, declarator);

/** Removes the declarator of an unused identifier (`var a;`), or `;` remains as the body of an if, a loop or a with. */
function fixDeclarator(fx, declarator) {
  const declaration = declarator.parent;
  if (declaration.declarations.length > 1) return removeDeclarator(fx, declarator);
  const holder = declaration.parent;
  if (isLoop(holder) && holder.body !== declaration) return null;
  if (
    holder.type === 'IfStatement' ||
    isLoop(holder) ||
    (holder.type === 'WithStatement' && holder.body === declaration)
  ) {
    return fx.fixer.replaceText(declaration, ';');
  }
  return removeDeclaration(fx, declaration);
}

/** Removes a pattern left empty: its declarator, its property (`{ a: [b] }`) or its parameter. */
function fixVariables(fx, node) {
  const { parent } = node;
  if (parent.type === 'VariableDeclarator') {
    if (isLoop(parent.parent.parent)) return null;
    if (parent.parent.declarations.length === 1) return removeDeclaration(fx, parent.parent);
    return removeDeclarator(fx, parent);
  }
  if (tokenBefore(fx, node).value === ':' && parent.parent.type === 'ObjectPattern') {
    return fixObjectWithValueSeparator(fx, node);
  }
  return fixFunctionParameters(fx, node);
}

/** Removes a parameter of a function. */
function fixFunctionParameters(fx, node) {
  if (!isFunction(node.parent)) return null;
  if (node.parent.params.length === 1) return fx.fixer.removeRange(node.range);
  return removeListItem(fx, node, '(');
}

/** Removes a pattern left empty that is an array element, or else as fixVariables does. */
function fixSoleArrayOrVariables(fx, pattern) {
  return pattern.parent.type === 'ArrayPattern' ? fixNestedArrayVariable(fx, pattern) : fixVariables(fx, pattern);
}

/** Removes a pattern left empty: the rest element it is the argument of, or else as fixSoleArrayOrVariables does. */
function fixSolePattern(fx, pattern) {
  if (pattern.parent.type === 'RestElement') return fixRestInPattern(fx, pattern.parent);
  return fixSoleArrayOrVariables(fx, pattern);
}

/** Removes the value pattern of a property (`{ a: { b } }`), the whole property when it is left empty. */
function fixNestedObjectVariable(fx, node) {
  const property = node.parent;
  const pattern = property.parent;
  if (pattern.parent.parent.type === 'ObjectPattern' && pattern.properties.length === 1) {
    return fixNestedObjectVariable(fx, pattern);
  }
  if (pattern.type !== 'ObjectPattern') return null;
  if (pattern.properties.length === 1) return fixVariables(fx, pattern);
  return removeListItem(fx, property, '{');
}

/** Removes an element of an array pattern, the whole pattern when it is left empty. */
function fixNestedArrayVariable(fx, node) {
  const pattern = node.parent;
  const single = hasSingleElement(pattern);
  if (pattern.parent.type === 'ArrayPattern' && single) return fixNestedArrayVariable(fx, pattern);
  if (single) {
    if (tokenBefore(fx, pattern).value === ':') return fixVariables(fx, pattern);
    if (pattern.parent.type === 'RestElement') return fixRestInPattern(fx, pattern.parent);
    return fixVariables(fx, pattern);
  }
  if (tokenBefore(fx, node).value === ',' && tokenAfter(fx, node).value === ']') return removeWithPrevious(fx, node);
  return fx.fixer.removeRange(node.range);
}

/** Removes the value pattern of a property (`{ a: { b } }` or `{ a: [b] }`). */
function fixObjectWithValueSeparator(fx, node) {
  const pattern = node.parent.parent;
  if (pattern.parent.type === 'ArrayPattern' && pattern.properties.length === 1) {
    return fixNestedArrayVariable(fx, pattern);
  }
  return fixNestedObjectVariable(fx, node);
}

/** Removes a rest element (`...[a]`) of a parameter list or an array pattern. */
function fixRestInPattern(fx, node) {
  const { parent } = node;
  if (isFunction(parent)) {
    return parent.params.length === 1 ? fx.fixer.removeRange(node.range) : removeWithPrevious(fx, node);
  }
  if (parent.type !== 'ArrayPattern') return null;
  return hasSingleElement(parent) ? fixSoleArrayOrVariables(fx, parent) : removeWithPrevious(fx, node);
}

/** Removes a rest element binding the identifier; undefined where it is none of these. */
function fixRestElement(fx, rest) {
  const pattern = rest.parent;
  if (pattern.type === 'ObjectPattern') {
    return pattern.properties.length === 1 ? fixVariables(fx, pattern) : removeWithPrevious(fx, rest);
  }
  if (pattern.type === 'ArrayPattern' || isFunction(pattern)) return fixRestInPattern(fx, rest);
  return undefined;
}

/** Removes an identifier with a default value (`a = b`); undefined where it is none of these. */
function fixAssignmentPattern(fx, assignment) {
  const holder = assignment.parent;
  if (holder.type === 'ArrayPattern') return fixNestedArrayVariable(fx, assignment);
  if (holder.parent.type === 'ObjectPattern') {
    if (holder.parent.properties.length === 1) return fixSoleArrayOrVariables(fx, holder.parent);
    return removeListItem(fx, holder, '{');
  }
  return isFunction(holder) ? fixFunctionParameters(fx, assignment) : undefined;
}

/** Removes the specifier of an import, the whole import or its specifier list when nothing else is left. */
function fixImport(fx, id, specifier) {
  const declaration = specifier.parent;
  const { specifiers } = declaration;
  const hasDefault = specifiers[0].type === 'ImportDefaultSpecifier';
  switch (specifier.type) {
    case 'ImportDefaultSpecifier':
      if (specifiers.length === 1) return fx.fixer.removeRange([specifier.range[0], declaration.source.range[0]]);
      return fx.fixer.removeRange([id.range[0], tokenAfter(fx, id).range[1]]);
    case 'ImportNamespaceSpecifier':
      if (hasDefault) return removeWithPrevious(fx, specifier);
      return fx.fixer.removeRange([specifier.range[0], declaration.source.range[0]]);
    default:
      if (specifiers.length !== (hasDefault ? 2 : 1)) return removeListItem(fx, specifier, '{');
      if (!hasDefault) return fx.fixer.removeRange(declaration.range);
      // `import a, { b } from 'm'` becomes `import a from 'm'`.
      return fx.fixer.removeRange([tokenBefore(fx, specifier, 1).range[0], tokenAfter(fx, id).range[1]]);
  }
}

/** Removes an identifier from a list of parameters, elements or properties, or the parameter of an arrow. */
function fixInList(fx, id) {
  const before = tokenBefore(fx, id);
  if (before?.value === ',') return fx.fixer.removeRange([before.range[0], id.range[1]]);
  const after = tokenAfter(fx, id);
  if (after.value === ',' && (before.value === '(' || before.value === '{')) {
    return fx.fixer.removeRange([id.range[0], after.range[1]]);
  }
  const { parent } = id;
  if (parent.type === 'ArrowFunctionExpression' && parent.params.length === 1 && after?.value !== ')') {
    return fx.fixer.replaceText(id, '()');
  }
  return fx.fixer.removeRange(id.range);
}

/** The suggested fix removing the declaration of the variable, or null. */
function fixUnusedVariable(fx, variable) {
  const id = variable.identifiers[0];
  // Writes elsewhere would be left behind.
  if (variable.references.some((ref) => ref.isWrite() && ref.identifier.range[0] !== id.range[0])) return null;

  const { parent } = id;
  if (parent.type === 'VariableDeclarator') return fixDeclarator(fx, parent);

  const grandparent = parent.parent;
  if (grandparent.type === 'ObjectPattern') {
    if (grandparent.properties.length === 1) return fixSolePattern(fx, grandparent);
    // `{ a: b }`
    if (tokenBefore(fx, id).value === ':') return removeListItem(fx, parent, '{');
  }

  switch (parent.type) {
    case 'ArrayPattern':
      if (hasSingleElement(parent)) return fixSolePattern(fx, parent);
      if (tokenBefore(fx, id).value === ',' && tokenAfter(fx, id).value === ',') return fx.fixer.removeRange(id.range);
      break;
    case 'RestElement':
    case 'AssignmentPattern': {
      // null is a result: no fix; undefined is none, for a pattern these helpers do not handle.
      const fix = parent.type === 'RestElement' ? fixRestElement(fx, parent) : fixAssignmentPattern(fx, parent);
      if (fix !== undefined) return fix;
      break;
    }
    case 'FunctionDeclaration':
      if (parent.id === id) return fx.fixer.removeRange(parent.range);
      break;
    case 'ImportDefaultSpecifier':
    case 'ImportSpecifier':
    case 'ImportNamespaceSpecifier':
      return fixImport(fx, id, parent);
    case 'CatchClause':
      return null;
    case 'ClassDeclaration':
      return fx.fixer.removeRange(parent.range);
  }
  return fixInList(fx, id);
}

/** The options with their defaults, the ignore patterns compiled and keyed by kind of variable. */
function parseOptions(option) {
  const config = {
    vars: 'all',
    args: 'after-used',
    ignoreRestSiblings: false,
    caughtErrors: 'all',
    ignoreClassWithStaticInitBlock: false,
    ignoreUsingDeclarations: false,
    reportUsedIgnorePattern: false,
    patterns: {},
  };
  if (typeof option === 'string') {
    config.vars = option;
    return config;
  }
  if (!option) return config;
  for (const key of Object.keys(config)) {
    if (key !== 'patterns') config[key] = option[key] || config[key];
  }
  const sources = {
    'array-destructure': option.destructuredArrayIgnorePattern,
    'catch-clause': option.caughtErrorsIgnorePattern,
    parameter: option.argsIgnorePattern,
    variable: option.varsIgnorePattern,
  };
  for (const kind in sources) {
    if (sources[kind]) config.patterns[kind] = new RegExp(sources[kind], 'u');
  }
  return config;
}

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow unused variables',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-unused-vars',
  },
  hasSuggestions: true,
  schema: [
    {
      oneOf: [
        { enum: ['all', 'local'] },
        {
          type: 'object',
          properties: {
            vars: { enum: ['all', 'local'] },
            varsIgnorePattern: { type: 'string' },
            args: { enum: ['all', 'after-used', 'none'] },
            ignoreRestSiblings: { type: 'boolean' },
            argsIgnorePattern: { type: 'string' },
            caughtErrors: { enum: ['all', 'none'] },
            caughtErrorsIgnorePattern: { type: 'string' },
            destructuredArrayIgnorePattern: { type: 'string' },
            ignoreClassWithStaticInitBlock: { type: 'boolean' },
            ignoreUsingDeclarations: { type: 'boolean' },
            reportUsedIgnorePattern: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      ],
    },
  ],
  messages: {
    unusedVar: "'{{varName}}' is {{action}} but never used{{additional}}.",
    usedIgnoredVar: "'{{varName}}' is marked as ignored but is used{{additional}}.",
    removeVar: "Remove unused variable '{{varName}}'.",
  },
};

export function create(context) {
  const { sourceCode } = context;
  const config = parseOptions(context.options[0]);
  const { patterns } = config;
  const arrayPattern = patterns['array-destructure'];

  // The kind of variable whose ignore pattern the messages mention: an element of an array pattern only when
  // destructuredArrayIgnorePattern is set (even though varsIgnorePattern applies to it as well).
  function kindOf(def) {
    if (arrayPattern && def.name.parent.type === 'ArrayPattern') return 'array-destructure';
    if (def.type === 'CatchClause') return 'catch-clause';
    return def.type === 'Parameter' ? 'parameter' : 'variable';
  }

  // Whether the name of the definition matches the ignore pattern of `kind`; the variable is then reported when
  // used, with reportUsedIgnorePattern.
  function isIgnored(variable, def, kind) {
    const pattern = patterns[kind];
    if (!pattern?.test(def.name.name)) return false;
    if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
      context.report({
        node: def.name,
        messageId: 'usedIgnoredVar',
        data: { varName: variable.name, additional: `. Used ${DESCRIPTIONS[kind]} must not match ${pattern}` },
      });
    }
    return true;
  }

  /** Whether the parameter is left out by the args options. */
  function isSkippedParameter(variable, def) {
    if (isSetterParameter(def) || config.args === 'none') return true;
    if (isIgnored(variable, def, 'parameter')) return true;
    return config.args === 'after-used' && isFunction(def.name.parent) && !isAfterLastUsedArg(sourceCode, variable);
  }

  /** Whether the options leave out the variable defined by `def`. */
  function isSkippedDefinition(variable, def) {
    if (
      arrayPattern &&
      (def.name.parent.type === 'ArrayPattern' ||
        variable.references.some((ref) => ref.identifier.parent.type === 'ArrayPattern')) &&
      isIgnored(variable, def, 'array-destructure')
    ) {
      return true;
    }
    if (def.type === 'ClassName' && config.ignoreClassWithStaticInitBlock && hasStaticBlock(def.node)) return true;
    if (def.type === 'CatchClause') return config.caughtErrors === 'none' || isIgnored(variable, def, 'catch-clause');
    if (def.type === 'Parameter') return isSkippedParameter(variable, def);
    return isIgnored(variable, def, 'variable');
  }

  /** Whether the variable of the scope is unused and to be reported. */
  function isUnused(scope, variable) {
    // The name of a class within its own scope, and the implicit `arguments`.
    if (scope.type === 'class' && scope.block.id === variable.identifiers[0]) return false;
    if (!config.reportUsedIgnorePattern && variable.eslintUsed) return false;
    if (scope.type === 'function' && variable.name === 'arguments' && variable.identifiers.length === 0) return false;
    const def = variable.defs[0];
    if (def && isSkippedDefinition(variable, def)) return false;
    return (
      !isUsedVariable(variable) &&
      !isExported(variable) &&
      !(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
      !(config.ignoreRestSiblings && hasRestSpreadSibling(variable))
    );
  }

  /** Collects the unused variables of the scope and its descendants, in order. */
  function collectUnusedVariables(scope, unusedVars) {
    // Function expression names are left out.
    if ((scope.type !== 'global' || config.vars === 'all') && !scope.functionExpressionScope) {
      for (const variable of scope.variables) {
        if (isUnused(scope, variable)) unusedVars.push(variable);
      }
    }
    for (const child of scope.childScopes) collectUnusedVariables(child, unusedVars);
    return unusedVars;
  }

  /** The end of the unusedVar message naming the ignore pattern of the definition's kind, if any. */
  function getAdditional(def) {
    const kind = def && kindOf(def);
    const pattern = kind && patterns[kind];
    return pattern ? `. Allowed unused ${DESCRIPTIONS[kind]} must match ${pattern}` : '';
  }

  // Reports at the last write in the variable's own function scope (or its first declaration), suggesting the
  // removal of the declaration. A variable declared only in `/* global */` comments is reported at the first one.
  function report(programNode, variable) {
    const def = variable.defs[0];
    if (!def) {
      const comment = variable.eslintExplicitGlobalComments?.[0];
      if (!comment) return;
      context.report({
        node: programNode,
        loc: getNameLocationInGlobalDirectiveComment(sourceCode, comment, variable.name),
        messageId: 'unusedVar',
        data: { varName: variable.name, action: 'defined', additional: getAdditional(def) },
      });
      return;
    }
    const { references } = variable;
    const { variableScope } = variable.scope;
    let lastWrite;
    let assigned = false;
    for (let i = references.length - 1; i >= 0 && !lastWrite; i--) {
      if (!references[i].isWrite()) continue;
      assigned = true;
      if (references[i].from.variableScope === variableScope) lastWrite = references[i];
    }
    const node = lastWrite ? lastWrite.identifier : variable.identifiers[0];
    context.report({
      node,
      messageId: 'unusedVar',
      data: {
        varName: variable.name,
        action: assigned ? 'assigned a value' : 'defined',
        additional: getAdditional(def),
      },
      suggest: [
        {
          messageId: 'removeVar',
          data: { varName: variable.name },
          fix: (fixer) => fixUnusedVariable({ sourceCode, fixer }, variable),
        },
      ],
    });
  }

  return {
    'Program:exit'(programNode) {
      for (const variable of collectUnusedVariables(sourceCode.getScope(programNode), [])) {
        report(programNode, variable);
      }
    },
  };
}
