import fs from 'node:fs';
import path from 'node:path';
import { KEYS, getKeys } from '../../lib/ast/visitor-keys.js';
import { parse } from '../../lib/parser.js';

const SKIP = new Set(['parent', 'loc', 'range', 'tokens', 'comments', 'leadingComments', 'trailingComments']);
const isNode = (value) => value !== null && typeof value === 'object' && typeof value.type === 'string';

// The keys of a node whose values are nodes or arrays of nodes.
function childKeys(node) {
  return Object.keys(node).filter((key) => {
    if (SKIP.has(key)) return false;
    const value = node[key];
    return isNode(value) || (Array.isArray(value) && value.some(isNode));
  });
}

function* nodes(node) {
  yield node;
  for (const key of KEYS[node.type] ?? getKeys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) yield* nodes(child);
    } else if (isNode(value)) {
      yield* nodes(value);
    }
  }
}

describe('visitor keys', () => {
  it('have every type of ESTree and JSX the parser makes', () => {
    for (const type of ['Program', 'Identifier', 'ImportExpression', 'ChainExpression', 'StaticBlock', 'JSXElement']) {
      expect(Array.isArray(KEYS[type])).toBe(true);
    }
    expect(Object.isFrozen(KEYS)).toBe(true);
    expect(Object.isFrozen(KEYS.Program)).toBe(true);
  });

  it('name every child of every node of the parser, in order', () => {
    const dir = path.join(import.meta.dirname, '../../lib');
    const files = fs.readdirSync(dir).filter((file) => file.endsWith('.js'));
    for (const file of files) {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      const ast = parse(text, { sourceType: 'module' });
      for (const node of nodes(ast)) {
        for (const key of childKeys(node)) expect(KEYS[node.type]).toContain(key);
      }
    }
    const jsx = parse('const a = <A b="c" {...d}><e.f />{g}<></></A>;', { sourceType: 'module', jsx: true });
    for (const node of nodes(jsx)) {
      for (const key of childKeys(node)) expect(KEYS[node.type]).toContain(key);
    }
  });

  it('getKeys: the keys of an unknown node, without parent, comments and private ones', () => {
    const node = { type: 'Unknown', parent: {}, leadingComments: [], trailingComments: [], _cache: 1, a: 1, b: {} };
    expect(getKeys(node)).toEqual(['type', 'a', 'b']);
  });
});
