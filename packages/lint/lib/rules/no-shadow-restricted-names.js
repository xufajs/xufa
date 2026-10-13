// Declarations (variables, functions, parameters, catch params, imports, classes) named undefined, NaN, Infinity,
// arguments or eval, plus globalThis with reportGlobalThis. A `var undefined` never initialized nor written is fine.

const RESTRICTED = new Set(['undefined', 'NaN', 'Infinity', 'arguments', 'eval']);
const RESTRICTED_WITH_GLOBAL_THIS = new Set([...RESTRICTED, 'globalThis']);

/** Whether the variable is an `undefined` that always keeps the global's value. */
function safelyShadowsUndefined(variable) {
  return (
    variable.name === 'undefined' &&
    variable.references.every((ref) => !ref.isWrite()) &&
    variable.defs.every((def) => def.node.type === 'VariableDeclarator' && def.node.init === null)
  );
}

export const meta = {
  type: 'suggestion',
  defaultOptions: [{ reportGlobalThis: false }],
  docs: {
    description: 'Disallow identifiers from shadowing restricted names',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-shadow-restricted-names',
  },
  schema: [
    {
      type: 'object',
      properties: { reportGlobalThis: { type: 'boolean' } },
      additionalProperties: false,
    },
  ],
  messages: {
    shadowingRestrictedName: "Shadowing of global property '{{name}}'.",
  },
};

export function create(context) {
  const [{ reportGlobalThis }] = context.options;
  const restricted = reportGlobalThis ? RESTRICTED_WITH_GLOBAL_THIS : RESTRICTED;
  const { sourceCode } = context;
  // A name can be declared by two nodes (a class declaration and its body scope): report it once.
  const reported = new Set();

  const check = (node) => {
    for (const variable of sourceCode.getDeclaredVariables(node)) {
      if (!variable.defs.length || !restricted.has(variable.name) || safelyShadowsUndefined(variable)) continue;
      for (const { name } of variable.defs) {
        if (reported.has(name)) continue;
        reported.add(name);
        context.report({ node: name, messageId: 'shadowingRestrictedName', data: { name: variable.name } });
      }
    }
  };

  return {
    VariableDeclaration: check,
    FunctionDeclaration: check,
    FunctionExpression: check,
    ArrowFunctionExpression: check,
    CatchClause: check,
    ImportDeclaration: check,
    ClassDeclaration: check,
    ClassExpression: check,
  };
}
