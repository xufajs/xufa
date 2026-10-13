// Variables declared more than once in the same scope: by several declarations, by /* global */ comments, or (with
// builtinGlobals, the default) as a configured built-in global. Every declaration after the first is reported; when
// it is of another kind than the first, the message says what the first one was.

import { getNameLocationInGlobalDirectiveComment } from './utils/ast.js';

export const meta = {
  type: 'suggestion',
  defaultOptions: [{ builtinGlobals: true }],
  docs: {
    description: 'Disallow variable redeclaration',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-redeclare',
  },
  messages: {
    redeclared: "'{{id}}' is already defined.",
    redeclaredAsBuiltin: "'{{id}}' is already defined as a built-in global variable.",
    redeclaredBySyntax: "'{{id}}' is already defined by a variable declaration.",
  },
  schema: [
    {
      type: 'object',
      properties: { builtinGlobals: { type: 'boolean' } },
      additionalProperties: false,
    },
  ],
};

export function create(context) {
  const [{ builtinGlobals }] = context.options;
  const { sourceCode } = context;

  const checkVariable = (variable) => {
    const { name, identifiers } = variable;
    const comments = variable.eslintExplicitGlobalComments || [];
    const setting = variable.eslintImplicitGlobalSetting;
    const builtin = builtinGlobals && (setting === 'readonly' || setting === 'writable');
    if (builtin + identifiers.length + comments.length < 2) return;

    // The first declaration is the built-in global, else the first identifier, else the first comment.
    const firstType = builtin ? 'builtin' : identifiers.length ? 'syntax' : 'comment';
    const otherMessageId = firstType === 'builtin' ? 'redeclaredAsBuiltin' : 'redeclaredBySyntax';
    const data = { id: name };
    const report = (type, node, loc) =>
      context.report({ node, loc, messageId: type === firstType ? 'redeclared' : otherMessageId, data });

    identifiers.forEach((id, index) => {
      if (builtin || index) report('syntax', id, id.loc);
    });
    comments.forEach((comment, index) => {
      if (builtin || identifiers.length || index) {
        report('comment', comment, getNameLocationInGlobalDirectiveComment(sourceCode, comment, name));
      }
    });
  };

  const checkScope = (scope) => scope.variables.forEach(checkVariable);

  // In ES5 some nodes, like blocks, have no scope of their own: getScope returns an outer one.
  const checkBlock = (node) => {
    const scope = sourceCode.getScope(node);
    if (scope.block === node) checkScope(scope);
  };

  return {
    Program(node) {
      const scope = sourceCode.getScope(node);
      checkScope(scope);
      // Node.js and ES modules have a special scope under the global one, with the Program as block too.
      const [child] = scope.childScopes;
      if (scope.type === 'global' && child && scope.block === child.block) checkScope(child);
    },
    FunctionDeclaration: checkBlock,
    FunctionExpression: checkBlock,
    ArrowFunctionExpression: checkBlock,
    StaticBlock: checkBlock,
    BlockStatement: checkBlock,
    ForStatement: checkBlock,
    ForInStatement: checkBlock,
    ForOfStatement: checkBlock,
    SwitchStatement: checkBlock,
  };
}
