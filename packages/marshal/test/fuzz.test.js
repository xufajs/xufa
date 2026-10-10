// Random values: parse(stringify(v)) and clone(v) are what structuredClone gives (for the values both can hold).
import { isDeepStrictEqual } from 'node:util';
import { stringify, parse, clone } from '../index.js';

// A small seeded generator, so a failure can be run again.
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function valueOf(rand, depth, pool) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const leaf = () =>
    pick([
      () => undefined,
      () => null,
      () => rand() < 0.5,
      () => Math.floor(rand() * 2000) - 1000,
      () => rand() * 1e6,
      () => pick([NaN, Infinity, -Infinity, -0, 0, Number.MAX_VALUE, Number.MIN_VALUE]),
      () => pick(['', 'a', 'héllo', '\u0000', '😀', '@@ref:0', '__proto__', 'x'.repeat(50), '¤', '¤R0', '¤Array']),
      () => BigInt(Math.floor(rand() * 1e9)) * (rand() < 0.5 ? -1n : 1n) * 10n ** 20n,
      () => new Date(Math.floor(rand() * 4e12)),
      () => pick([/a/g, /[\u0000-\u001f]+/imsu, /^(?:x|y)*$/y]),
      // (Uint8Array: structuredClone makes Buffers Uint8Arrays; marshal keeps them Buffers, tested apart.)
      () => new Uint8Array([...Array(Math.floor(rand() * 8))].map(() => Math.floor(rand() * 256))),
      () => new Float64Array([rand(), -rand()]),
    ])();
  if (depth > 4 || rand() < 0.35) return leaf();
  if (pool.length && rand() < 0.15) return pick(pool); // a shared reference, or a cycle
  const size = Math.floor(rand() * 5);
  const kind = pick(['array', 'object', 'map', 'set']);
  let container;
  if (kind === 'array') container = [];
  else if (kind === 'object') container = {};
  else if (kind === 'map') container = new Map();
  else container = new Set();
  pool.push(container);
  for (let i = 0; i < size; i += 1) {
    const item = valueOf(rand, depth + 1, pool);
    if (kind === 'array') {
      if (rand() < 0.1) container.length += 1; // a hole
      else container.push(item);
    } else if (kind === 'object') {
      // '__proto__' as an own field (as JSON.parse makes it), not a change of prototype.
      const key = pick(['a', 'b', '__proto__', 'constructor', String(i), 'k k', '@']);
      Object.defineProperty(container, key, { value: item, enumerable: true, writable: true, configurable: true });
    }
    else if (kind === 'map') container.set(rand() < 0.3 ? valueOf(rand, depth + 1, pool) : i, item);
    else container.add(item);
  }
  return container;
}

describe('random values', () => {
  it('2000 values: parse(stringify(v)) and clone(v) equal structuredClone(v)', () => {
    for (let seed = 1; seed <= 2000; seed += 1) {
      const value = valueOf(random(seed), 0, []);
      const expected = structuredClone(value);
      const back = parse(stringify(value));
      if (!isDeepStrictEqual(back, expected)) throw new Error(`seed ${seed}: stringify/parse differs`);
      if (!isDeepStrictEqual(clone(value), expected)) throw new Error(`seed ${seed}: clone differs`);
    }
  });
});
