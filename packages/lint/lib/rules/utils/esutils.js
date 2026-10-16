// What ast-utils.js (ported from ESLint) used of esutils 2.0.3 (BSD-2-Clause, see NOTICE.md): the statement a
// statement ends with, when it ends with another statement.

function trailingStatement(node) {
  switch (node.type) {
    case 'IfStatement':
      if (node.alternate != null) {
        return node.alternate;
      }
      return node.consequent;
    case 'LabeledStatement':
    case 'ForStatement':
    case 'ForInStatement':
    case 'WhileStatement':
    case 'WithStatement':
      return node.body;
  }
  return null;
}

export default { ast: { trailingStatement } };
