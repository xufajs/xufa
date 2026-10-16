/**
@import AstPath from "../../common/ast-path.js"
*/

function shouldAddParenthesesToChainExpression(path) {
  const { key, parent } = path;

  return (
    (key === 'expression' && parent.type === 'TSNonNullExpression') ||
    (key === 'object' && parent.type === 'MemberExpression' && !parent.optional) ||
    (key === 'callee' && parent.type === 'CallExpression' && !parent.optional) ||
    (key === 'callee' && parent.type === 'NewExpression') ||
    (key === 'tag' && parent.type === 'TaggedTemplateExpression')
  );
}

/**
@param {AstPath} path
@returns {boolean}
*/
function shouldAddParenthesesToChainElement(path) {
  return path.node.type === 'ChainExpression' && shouldAddParenthesesToChainExpression(path);
}

export { shouldAddParenthesesToChainElement };
