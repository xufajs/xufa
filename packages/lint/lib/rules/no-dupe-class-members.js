// Class members declared twice with the same static name: a getter or setter may pair with its counterpart, but not
// with another of its kind or a method/field. Static and instance members are separate; constructors are ignored.

import { getStaticPropertyName } from './utils/ast.js';

export const meta = {
  type: 'problem',
  dialects: ['javascript', 'typescript'],
  language: 'javascript',
  docs: {
    description: 'Disallow duplicate class members',
    recommended: true,
    url: 'https://eslint.org/docs/latest/rules/no-dupe-class-members',
  },
  schema: [],
  messages: {
    unexpected: "Duplicate name '{{name}}'.",
  },
};

export function create(context) {
  // One map per open class body: `static` flag + name -> { init, get, set } already declared.
  const stack = [];

  const getState = (name, isStatic) => {
    const states = stack.at(-1);
    const key = isStatic ? `s${name}` : `i${name}`;
    let state = states.get(key);
    if (!state) {
      state = { init: false, get: false, set: false };
      states.set(key, state);
    }
    return state;
  };

  const checkMember = (node) => {
    if (node.value?.type === 'TSEmptyBodyFunctionExpression') return;
    const kind = node.type === 'MethodDefinition' ? node.kind : 'field';
    if (kind === 'constructor') return;
    const name = getStaticPropertyName(node);
    if (name === null) return;

    const state = getState(name, node.static);
    let isDuplicate;
    if (kind === 'get') {
      isDuplicate = state.init || state.get;
      state.get = true;
    } else if (kind === 'set') {
      isDuplicate = state.init || state.set;
      state.set = true;
    } else {
      isDuplicate = state.init || state.get || state.set;
      state.init = true;
    }
    if (isDuplicate) context.report({ loc: node.key.loc, messageId: 'unexpected', data: { name } });
  };

  return {
    ClassBody() {
      stack.push(new Map());
    },
    'ClassBody:exit'() {
      stack.pop();
    },
    MethodDefinition: checkMember,
    PropertyDefinition: checkMember,
  };
}
