// What rules and SourceCode ask of tokens: whether one is a comment or a given punctuator, and whether a node is in
// parentheses of its own.

const isPunctuator = (token, value) => token.type === 'Punctuator' && token.value === value;
const isCommentToken = (token) => token.type === 'Block' || token.type === 'Line' || token.type === 'Shebang';
const isOpeningParenToken = (token) => isPunctuator(token, '(');
const isClosingParenToken = (token) => isPunctuator(token, ')');

// The parenthesis the syntax around a node puts before it: of a call's or new's only argument, of the test of an
// if, while or do-while, of a switch's discriminant, a with's object, import()'s source.
function syntaxParenBefore(node, sourceCode) {
  const { parent } = node;
  if (!parent) return null;
  switch (parent.type) {
    case 'CallExpression':
    case 'NewExpression':
      if (parent.arguments.length === 1 && parent.arguments[0] === node) {
        return sourceCode.getTokenAfter(
          parent.typeArguments || parent.typeParameters || parent.callee,
          isOpeningParenToken
        );
      }
      return null;
    case 'DoWhileStatement':
      return parent.test === node ? sourceCode.getTokenAfter(parent.body, isOpeningParenToken) : null;
    case 'IfStatement':
    case 'WhileStatement':
      return parent.test === node ? sourceCode.getFirstToken(parent, 1) : null;
    case 'ImportExpression':
      return parent.source === node ? sourceCode.getFirstToken(parent, 1) : null;
    case 'SwitchStatement':
      return parent.discriminant === node ? sourceCode.getFirstToken(parent, 1) : null;
    case 'WithStatement':
      return parent.object === node ? sourceCode.getFirstToken(parent, 1) : null;
    default:
      return null;
  }
}

/**
 * Whether a node is in parentheses of its own, `times` deep (1 when not given): isParenthesized(node, sourceCode),
 * isParenthesized(2, node, sourceCode). Those the syntax around it needs (`if (a)`, `f(a)`) do not count.
 */
function isParenthesized(timesOrNode, nodeOrSourceCode, optionalSourceCode) {
  let times;
  let node;
  let sourceCode;
  if (typeof timesOrNode === 'number') {
    times = timesOrNode | 0;
    node = nodeOrSourceCode;
    sourceCode = optionalSourceCode;
    if (!(times >= 1)) throw new TypeError("'times' should be a positive integer.");
  } else {
    times = 1;
    node = timesOrNode;
    sourceCode = nodeOrSourceCode;
  }
  if (node == null || node.parent == null || (node.parent.type === 'CatchClause' && node.parent.param === node))
    return false;
  let before = node;
  let after = node;
  do {
    before = sourceCode.getTokenBefore(before);
    after = sourceCode.getTokenAfter(after);
  } while (
    before != null &&
    after != null &&
    isOpeningParenToken(before) &&
    isClosingParenToken(after) &&
    before !== syntaxParenBefore(node, sourceCode) &&
    --times > 0
  );
  return times === 0;
}

export { isCommentToken, isOpeningParenToken, isClosingParenToken, isParenthesized };
