// The analysis of code paths during the walk of a tree: wrapped around the steps of the walk (enterNode, leaveNode,
// emit), it updates the state of the current code path before and after each node (state.js) and emits what rules
// listen to, in ESLint's order:
//   onCodePathStart(codePath, node), onCodePathEnd(codePath, node),
//   onCodePathSegmentStart(segment, node), onCodePathSegmentEnd(segment, node),
//   onUnreachableCodePathSegmentStart(segment, node), onUnreachableCodePathSegmentEnd(segment, node),
//   onCodePathSegmentLoop(fromSegment, toSegment, node).

import { CodePath, IdGenerator } from './code-path.js';
import { CodePathSegment } from './segment.js';
import { BREAKABLE_TYPE } from '../util/text.js';

const isLogicalOperator = (operator) => operator === '&&' || operator === '||' || operator === '??';
const isLogicalAssignmentOperator = (operator) => operator === '&&=' || operator === '||=' || operator === '??=';
const isPropertyDefinitionValue = (node) => node.parent?.type === 'PropertyDefinition' && node.parent.value === node;
const labelOf = (node) => (node.parent.type === 'LabeledStatement' ? node.parent.label.name : null);
// The value of a test that is a literal (while (true)...).
const constantTest = (node) => (node.type === 'Literal' ? Boolean(node.value) : undefined);

// Whether a node's value is the test of a choice around it (so its true and false paths are that choice's).
function isForkingByTrueOrFalse(node) {
  const { parent } = node;
  switch (parent.type) {
    case 'ConditionalExpression':
    case 'IfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'ForStatement':
      return parent.test === node;
    case 'LogicalExpression':
      return isLogicalOperator(parent.operator);
    case 'AssignmentExpression':
      return isLogicalAssignmentOperator(parent.operator);
    default:
      return false;
  }
}

// Whether an identifier reads a variable (it may throw: a path to a catch).
function isIdentifierReference(node) {
  const { parent } = node;
  switch (parent.type) {
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
    case 'ArrayPattern':
    case 'RestElement':
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
    case 'CatchClause':
      return false;
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
    case 'ClassDeclaration':
    case 'ClassExpression':
    case 'VariableDeclarator':
      return parent.id !== node;
    case 'Property':
    case 'PropertyDefinition':
    case 'MethodDefinition':
      return parent.key !== node || parent.computed || parent.shorthand;
    case 'AssignmentPattern':
      return parent.key !== node;
    default:
      return true;
  }
}

const segmentEnd = (segment) => (segment.reachable ? 'onCodePathSegmentEnd' : 'onUnreachableCodePathSegmentEnd');
const segmentStart = (segment) => (segment.reachable ? 'onCodePathSegmentStart' : 'onUnreachableCodePathSegmentStart');

// The current segments become the head ones: the ends of those left, then the starts of those entered.
function forwardCurrentToHead(analyzer, node) {
  const state = CodePath.getState(analyzer.codePath);
  const current = state.currentSegments;
  const head = state.headSegments;
  const end = Math.max(current.length, head.length);
  for (let i = 0; i < end; ++i) {
    if (current[i] !== head[i] && current[i]) analyzer.emit(segmentEnd(current[i]), [current[i], node]);
  }
  state.currentSegments = head;
  for (let i = 0; i < end; ++i) {
    if (current[i] !== head[i] && head[i]) {
      CodePathSegment.markUsed(head[i]);
      analyzer.emit(segmentStart(head[i]), [head[i], node]);
    }
  }
}

function leaveFromCurrentSegment(analyzer, node) {
  const state = CodePath.getState(analyzer.codePath);
  for (const segment of state.currentSegments) analyzer.emit(segmentEnd(segment), [segment, node]);
  state.currentSegments = [];
}

// Before entering a node: what its place in its parent starts (the right side of &&, a branch, a loop's part...).
function preprocess(analyzer, node) {
  const state = CodePath.getState(analyzer.codePath);
  const { parent } = node;
  switch (parent.type) {
    case 'CallExpression':
      if (parent.optional === true && parent.arguments.length >= 1 && parent.arguments[0] === node)
        state.makeOptionalRight();
      break;
    case 'MemberExpression':
      if (parent.optional === true && parent.property === node) state.makeOptionalRight();
      break;
    case 'LogicalExpression':
      if (parent.right === node && isLogicalOperator(parent.operator)) state.makeLogicalRight();
      break;
    case 'AssignmentExpression':
      if (parent.right === node && isLogicalAssignmentOperator(parent.operator)) state.makeLogicalRight();
      break;
    case 'ConditionalExpression':
    case 'IfStatement':
      if (parent.consequent === node) state.makeIfConsequent();
      else if (parent.alternate === node) state.makeIfAlternate();
      break;
    case 'SwitchCase':
      if (parent.consequent[0] === node) state.makeSwitchCaseBody(false, !parent.test);
      break;
    case 'TryStatement':
      if (parent.handler === node) state.makeCatchBlock();
      else if (parent.finalizer === node) state.makeFinallyBlock();
      break;
    case 'WhileStatement':
      if (parent.test === node) state.makeWhileTest(constantTest(node));
      else state.makeWhileBody();
      break;
    case 'DoWhileStatement':
      if (parent.body === node) state.makeDoWhileBody();
      else state.makeDoWhileTest(constantTest(node));
      break;
    case 'ForStatement':
      if (parent.test === node) state.makeForTest(constantTest(node));
      else if (parent.update === node) state.makeForUpdate();
      else if (parent.body === node) state.makeForBody();
      break;
    case 'ForInStatement':
    case 'ForOfStatement':
      if (parent.left === node) state.makeForInOfLeft();
      else if (parent.right === node) state.makeForInOfRight();
      else state.makeForInOfBody();
      break;
    case 'AssignmentPattern':
      // A default: taken or not.
      if (parent.right === node) {
        state.pushForkContext();
        state.forkBypassPath();
        state.forkPath();
      }
      break;
    default:
  }
}

// A code path that starts at a node, in the one it is in.
function startCodePath(analyzer, node, origin) {
  const upper = analyzer.codePath;
  if (upper) forwardCurrentToHead(analyzer, node);
  const codePath = new CodePath({ id: analyzer.idGenerator.next(), origin, upper, onLooped: analyzer.onLooped });
  analyzer.codePath = codePath;
  analyzer.emit('onCodePathStart', [codePath, node]);
}

// Entering a node: a new code path, or a construct's context.
function processCodePathToEnter(analyzer, node) {
  if (isPropertyDefinitionValue(node)) startCodePath(analyzer, node, 'class-field-initializer');
  switch (node.type) {
    case 'Program':
      startCodePath(analyzer, node, 'program');
      break;
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      startCodePath(analyzer, node, 'function');
      break;
    case 'StaticBlock':
      startCodePath(analyzer, node, 'class-static-block');
      break;
    default:
      enterConstruct(CodePath.getState(analyzer.codePath), node);
  }
  forwardCurrentToHead(analyzer, node);
}

// Entering a node of a construct of a code path: its context.
function enterConstruct(state, node) {
  switch (node.type) {
    case 'ChainExpression':
      state.pushChainContext();
      break;
    case 'CallExpression':
    case 'MemberExpression':
      if (node.optional === true) state.makeOptionalNode();
      break;
    case 'LogicalExpression':
      if (isLogicalOperator(node.operator)) state.pushChoiceContext(node.operator, isForkingByTrueOrFalse(node));
      break;
    case 'AssignmentExpression':
      if (isLogicalAssignmentOperator(node.operator)) {
        state.pushChoiceContext(node.operator.slice(0, -1), isForkingByTrueOrFalse(node));
      }
      break;
    case 'ConditionalExpression':
    case 'IfStatement':
      state.pushChoiceContext('test', false);
      break;
    case 'SwitchStatement':
      state.pushSwitchContext(
        node.cases.some((switchCase) => Boolean(switchCase.test)),
        labelOf(node)
      );
      break;
    case 'TryStatement':
      state.pushTryContext(Boolean(node.finalizer));
      break;
    case 'SwitchCase':
      if (node.parent.discriminant !== node && node.parent.cases[0] !== node) state.forkPath();
      break;
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
      state.pushLoopContext(node.type, labelOf(node));
      break;
    case 'LabeledStatement':
      if (!BREAKABLE_TYPE.test(node.body.type)) state.pushBreakContext(false, node.label.name);
      break;
    default:
  }
}

// Leaving a node: its construct's context closed; return, throw, break, continue; what may throw in a try.
function processCodePathToExit(analyzer, node) {
  const state = CodePath.getState(analyzer.codePath);
  let dontForward = false;
  switch (node.type) {
    case 'ChainExpression':
      state.popChainContext();
      break;
    case 'IfStatement':
    case 'ConditionalExpression':
      state.popChoiceContext();
      break;
    case 'LogicalExpression':
      if (isLogicalOperator(node.operator)) state.popChoiceContext();
      break;
    case 'AssignmentExpression':
      if (isLogicalAssignmentOperator(node.operator)) state.popChoiceContext();
      break;
    case 'SwitchStatement':
      state.popSwitchContext();
      break;
    case 'SwitchCase':
      if (node.consequent.length === 0) state.makeSwitchCaseBody(true, !node.test);
      if (state.forkContext.reachable) dontForward = true;
      break;
    case 'TryStatement':
      state.popTryContext();
      break;
    case 'BreakStatement':
      forwardCurrentToHead(analyzer, node);
      state.makeBreak(node.label && node.label.name);
      dontForward = true;
      break;
    case 'ContinueStatement':
      forwardCurrentToHead(analyzer, node);
      state.makeContinue(node.label && node.label.name);
      dontForward = true;
      break;
    case 'ReturnStatement':
      forwardCurrentToHead(analyzer, node);
      state.makeReturn();
      dontForward = true;
      break;
    case 'ThrowStatement':
      forwardCurrentToHead(analyzer, node);
      state.makeThrow();
      dontForward = true;
      break;
    case 'Identifier':
      if (isIdentifierReference(node)) {
        state.makeFirstThrowablePathInTryBlock();
        dontForward = true;
      }
      break;
    case 'CallExpression':
    case 'ImportExpression':
    case 'MemberExpression':
    case 'NewExpression':
    case 'YieldExpression':
      state.makeFirstThrowablePathInTryBlock();
      break;
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
      state.popLoopContext();
      break;
    case 'AssignmentPattern':
      state.popForkContext();
      break;
    case 'LabeledStatement':
      if (!BREAKABLE_TYPE.test(node.body.type)) state.popBreakContext();
      break;
    default:
  }
  if (!dontForward) forwardCurrentToHead(analyzer, node);
}

// After leaving a node: the end of its code path; the right side of an optional call without arguments.
function postprocess(analyzer, node) {
  const endCodePath = () => {
    const { codePath } = analyzer;
    CodePath.getState(codePath).makeFinal();
    leaveFromCurrentSegment(analyzer, node);
    analyzer.emit('onCodePathEnd', [codePath, node]);
    analyzer.codePath = codePath.upper;
  };
  switch (node.type) {
    case 'Program':
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
    case 'StaticBlock':
      endCodePath();
      break;
    case 'CallExpression':
      if (node.optional === true && node.arguments.length === 0)
        CodePath.getState(analyzer.codePath).makeOptionalRight();
      break;
    default:
  }
  if (isPropertyDefinitionValue(node)) endCodePath();
}

class CodePathAnalyzer {
  /** Around the steps of a walk: { enterNode(node), leaveNode(node), emit(name, args) }. */
  constructor(eventGenerator) {
    this.original = eventGenerator;
    this.emit = eventGenerator.emit;
    this.codePath = null;
    this.idGenerator = new IdGenerator('s');
    this.currentNode = null;
    this.onLooped = this.onLooped.bind(this);
  }

  enterNode(node) {
    this.currentNode = node;
    if (node.parent) preprocess(this, node);
    processCodePathToEnter(this, node);
    this.original.enterNode(node);
    this.currentNode = null;
  }

  leaveNode(node) {
    this.currentNode = node;
    processCodePathToExit(this, node);
    this.original.leaveNode(node);
    postprocess(this, node);
    this.currentNode = null;
  }

  onLooped(fromSegment, toSegment) {
    if (fromSegment.reachable && toSegment.reachable)
      this.emit('onCodePathSegmentLoop', [fromSegment, toSegment, this.currentNode]);
  }
}

export { CodePathAnalyzer };
