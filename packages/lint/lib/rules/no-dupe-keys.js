// Duplicate keys in object literals: a property whose static name was already defined in the same object, where a
// getter and a setter of the same name do not clash with each other. The `__proto__: value` prototype setter is not
// a key. The object is reported at the location of the duplicate key.

import { getStaticPropertyName } from './utils/ast.js';

export const meta = {
  type: 'problem',
  docs: {
    description: 'Disallow duplicate keys in object literals',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-dupe-keys',
  },
  schema: [],
  messages: {
    unexpected: "Duplicate key '{{name}}'.",
  },
};

export function create(context) {
  // The object being visited: its node, the upper one, and per key name whether a value/getter and a value/setter
  // were defined.
  let info = null;

  return {
    ObjectExpression(node) {
      info = { upper: info, node, keys: new Map() };
    },

    'ObjectExpression:exit'() {
      info = info.upper;
    },

    Property(node) {
      if (node.parent.type !== 'ObjectExpression') return;
      const name = getStaticPropertyName(node);
      if (name === null) return;
      const { kind } = node;
      // Duplicate prototype setters are syntax errors, so they are left alone.
      if (name === '__proto__' && kind === 'init' && !node.computed && !node.shorthand && !node.method) return;

      let entry = info.keys.get(name);
      if (!entry) info.keys.set(name, (entry = { get: false, set: false }));
      const get = kind !== 'set';
      const set = kind !== 'get';
      if ((get && entry.get) || (set && entry.set)) {
        context.report({ node: info.node, loc: node.key.loc, messageId: 'unexpected', data: { name } });
      }
      entry.get ||= get;
      entry.set ||= set;
    },
  };
}
