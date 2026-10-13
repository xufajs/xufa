// Constant tests of `if`s and conditional expressions, and with checkLoops ("allExceptWhileTrue" by default, which
// skips `while (true)`) of loops. A loop is not reported if a `yield` runs in its function between its test and its
// end, as the generator can be left there; the loops are reported when left.

import { isConstant } from './utils/ast.js';

export const meta = {
  type: 'problem',
  defaultOptions: [{ checkLoops: 'allExceptWhileTrue' }],
  docs: {
    description: 'Disallow constant expressions in conditions',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-constant-condition',
  },
  schema: [
    {
      type: 'object',
      properties: {
        checkLoops: { enum: ['all', 'allExceptWhileTrue', 'none', true, false] },
      },
      additionalProperties: false,
    },
  ],
  messages: {
    unexpected: 'Unexpected constant condition.',
  },
};

export function create(context) {
  const { sourceCode } = context;
  const [{ checkLoops: option }] = context.options;
  const checkLoops = option === true || option === 'all' || option === 'allExceptWhileTrue';
  const allowWhileTrue = option === 'allExceptWhileTrue';

  // The loops with a constant test of the current function (not yet left nor cleared by a yield), and those of
  // the functions around it.
  let loops = new Set();
  const outerLoops = [];

  const isConstantTest = (node) => node.test && isConstant(sourceCode.getScope(node), node.test, true);

  function reportIfConstant(node) {
    if (isConstantTest(node)) context.report({ node: node.test, messageId: 'unexpected' });
  }

  function trackLoop(node) {
    if (isConstantTest(node)) loops.add(node);
  }

  function reportLoop(node) {
    if (loops.delete(node)) context.report({ node: node.test, messageId: 'unexpected' });
  }

  function enterFunction() {
    outerLoops.push(loops);
    loops = new Set();
  }

  function exitFunction() {
    loops = outerLoops.pop();
  }

  // ESLint tracks a for loop again on entering its test, so a yield in its init does not untrack it (but does the
  // others): done here, for each for loop around the yield, in its function, whose init holds it.
  function onYield(node) {
    loops.clear();
    for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
      if (parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression') return;
      if (parent.type === 'ForStatement' && parent.init === child) trackLoop(parent);
    }
  }

  const conditions = { ConditionalExpression: reportIfConstant, IfStatement: reportIfConstant };
  if (!checkLoops) return conditions;
  return {
    ...conditions,
    FunctionDeclaration: enterFunction,
    'FunctionDeclaration:exit': exitFunction,
    FunctionExpression: enterFunction,
    'FunctionExpression:exit': exitFunction,
    WhileStatement(node) {
      if (allowWhileTrue && node.test.type === 'Literal' && node.test.value === true) return;
      trackLoop(node);
    },
    'WhileStatement:exit': reportLoop,
    DoWhileStatement: trackLoop,
    'DoWhileStatement:exit': reportLoop,
    ForStatement: trackLoop,
    'ForStatement:exit': reportLoop,
    YieldExpression: onYield,
  };
}
