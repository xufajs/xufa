// let, const, using, function and class declarations directly in a case clause, whose scope is the whole switch.
// Suggested: wrap the clause's statements in braces.

/** Whether the statement declares a lexically scoped binding. */
function isLexicalDeclaration(node) {
  if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') return true;
  return node.type === 'VariableDeclaration' && node.kind !== 'var';
}

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Disallow lexical declarations in case clauses',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-case-declarations',
  },
  hasSuggestions: true,
  schema: [],
  messages: {
    addBrackets: 'Add {} brackets around the case block.',
    unexpected: 'Unexpected lexical declaration in case block.',
  },
};

export function create(context) {
  return {
    SwitchCase(node) {
      const { consequent } = node;
      for (const statement of consequent) {
        if (!isLexicalDeclaration(statement)) continue;
        context.report({
          node: statement,
          messageId: 'unexpected',
          suggest: [
            {
              messageId: 'addBrackets',
              fix: (fixer) => [
                fixer.insertTextBefore(consequent[0], '{ '),
                fixer.insertTextAfter(consequent.at(-1), ' }'),
              ],
            },
          ],
        });
      }
    },
  };
}
