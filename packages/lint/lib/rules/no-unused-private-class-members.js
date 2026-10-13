// Private fields and methods of a class that are never read: a member is used by any mention of it but its
// definition and a write that reads nothing (`this.#x = 1`, `this.#x += 1;` as a statement, `this.#x++;`, a target of
// for-in/of or of destructuring). Any mention of an accessor uses it. Reported on the member, at its name.

/** Whether the mention of a private member `member` (its MemberExpression) only writes it. */
function isWriteOnly(member) {
  const { parent } = member;
  switch (parent.type) {
    case 'AssignmentExpression':
      // A compound assignment also reads, unless its value is discarded.
      return parent.left === member && (parent.operator === '=' || parent.parent.type === 'ExpressionStatement');
    case 'ForInStatement':
    case 'ForOfStatement':
    case 'AssignmentPattern':
      return parent.left === member;
    case 'UpdateExpression':
      return parent.parent.type === 'ExpressionStatement';
    case 'Property':
      // ({ x: this.#x } = foo), but not ({ [this.#x]: x } = foo).
      return parent.parent.type === 'ObjectPattern' && parent.value === member;
    case 'RestElement':
    case 'ArrayPattern':
      return true;
    default:
      return false;
  }
}

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow unused private class members',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-unused-private-class-members',
  },
  schema: [],
  messages: {
    unusedPrivateClassMember: "'{{classMemberName}}' is defined but never used.",
  },
};

export function create(context) {
  // For each class being visited, the innermost first: its private members by name.
  const classes = [];

  return {
    ClassBody(node) {
      const members = new Map();
      classes.unshift(members);
      for (const member of node.body) {
        if (member.type !== 'PropertyDefinition' && member.type !== 'MethodDefinition') continue;
        if (member.key.type !== 'PrivateIdentifier') continue;
        const isAccessor = member.type === 'MethodDefinition' && (member.kind === 'get' || member.kind === 'set');
        members.set(member.key.name, { node: member, isAccessor, isUsed: false });
      }
    },

    PrivateIdentifier(node) {
      const { name, parent } = node;
      // The member of the innermost class that has one of this name. It is not deleted once used, so that a
      // later mention does not use a member of the same name of an outer class.
      const member = classes.find((members) => members.has(name))?.get(name);
      if (!member || member.isUsed) return;
      if (parent.type === 'PropertyDefinition' || parent.type === 'MethodDefinition') return;
      if (member.isAccessor || !isWriteOnly(parent)) member.isUsed = true;
    },

    'ClassBody:exit'() {
      for (const [name, { node, isUsed }] of classes.shift()) {
        if (isUsed) continue;
        context.report({
          node,
          loc: node.key.loc,
          messageId: 'unusedPrivateClassMember',
          data: { classMemberName: `#${name}` },
        });
      }
    },
  };
}
