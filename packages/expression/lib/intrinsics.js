// The intrinsics of programs: what destructuring and for...in are lowered to by the parser (see patterns.js), run the
// same by the closures and by the function of JavaScript. Each takes the node it is of (for its errors) first.
import { FORBIDDEN } from './forbidden.js';

const RUNTIME = 'XUFA_EXPR_ERR_RUNTIME';

function intrinsicsOf(compiler) {
  return {
    // A value destructured as an object: not null nor undefined.
    destructurable(node, value) {
      if (value === null || value === undefined) {
        throw compiler.error(`Cannot destructure ${compiler.text(node)}, which is null or undefined`, node, RUNTIME);
      }
      return value;
    },

    // A value destructured as an array: its items (an array as it is; the values of other iterables: strings, maps,
    // sets).
    arrayOf(node, value) {
      if (Array.isArray(value)) return value;
      if (value === null || value === undefined || typeof Object(value)[Symbol.iterator] !== 'function') {
        throw compiler.error(`${compiler.text(node)} is not iterable`, node, RUNTIME);
      }
      return [...value];
    },

    arrayRest(node, array, from) {
      return array.slice(from);
    },

    // The own enumerable properties of an object but some keys (those that cannot be reached left out too).
    objectRest(node, source, keys) {
      const excluded = new Set(keys.map((key) => (typeof key === 'symbol' ? key : String(key))));
      const result = {};
      for (const key of Object.keys(source)) {
        if (excluded.has(key) || FORBIDDEN.has(key)) continue;
        result[key] = source[key];
      }
      return result;
    },

    // An export of a module imported (one it has: else an error, as JavaScript gives when it links them).
    importBinding(node, namespace, name) {
      if (
        namespace === null ||
        typeof namespace !== 'object' ||
        !Object.prototype.hasOwnProperty.call(namespace, name)
      ) {
        throw compiler.error(`The module does not export ${name}`, node, 'XUFA_EXPR_ERR_RUNTIME');
      }
      return namespace[name];
    },

    // What a module exports: its object, frozen (no prototype: only its names).
    moduleExports(node, object) {
      return Object.freeze(Object.assign(Object.create(null), object));
    },

    // The keys for...in goes through: enumerable, own and inherited (none of null and undefined).
    forInKeys(node, value) {
      const keys = [];
      if (value === null || value === undefined) return keys;
      for (const key in Object(value)) keys.push(key); // eslint-disable-line guard-for-in
      return keys;
    },
  };
}

const INTRINSICS = new Set([
  'destructurable',
  'arrayOf',
  'arrayRest',
  'objectRest',
  'forInKeys',
  'importBinding',
  'moduleExports',
]);

// The first argument of a tag: the texts of its template (an array of them, frozen, with raw: as they are written).
function templateStrings(node) {
  return Object.freeze(Object.defineProperty([...node.cooked], 'raw', { value: Object.freeze([...node.raw]) }));
}

export { intrinsicsOf, INTRINSICS, templateStrings };
