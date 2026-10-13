// The two ways programs run (the closures, and the function of JavaScript made of them) against each other, with
// random programs of fixed seeds: the same values, the same errors. And against JavaScript: when it runs them too,
// the same values. Longer runs, with other seeds: node test/fuzz/run.js.
import { Engine } from '../index.js';
import { check } from './fuzz/programs.js';

const options = { statements: true, maxSteps: 200_000, maxLength: 100_000 };
const engines = {
  closures: new Engine({ ...options, inline: false }),
  generated: new Engine({ ...options, inlineAfter: 0 }),
};
const SEEDS = 400;

describe('random programs', () => {
  test(`${SEEDS} programs give the same on the closures and on one function, and as JavaScript`, async () => {
    const differences = [];
    let compared = 0;
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const result = await check(seed, engines);
      if (result.js && !result.js.error) compared += 1;
      if (result.differs || result.unlikeJs) differences.push(result);
    }
    expect(differences.map(({ seed, closures, generated, js }) => ({ seed, closures, generated, js }))).toEqual([]);
    // (Most run as JavaScript too: the programs are valid and read no name before its declaration; a quarter fail.)
    expect(compared).toBeGreaterThan(SEEDS * 0.6);
  });

  test(`${SEEDS} programs that use names before their declarations: with tdz, an error where JavaScript has its own`, async () => {
    const tdz = {
      closures: new Engine({ ...options, inline: false, tdz: true }),
      generated: new Engine({ ...options, inlineAfter: 0, tdz: true }),
      tdz: true,
    };
    const differences = [];
    let unset = 0;
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const result = await check(seed, tdz);
      if (result.closures.error?.includes('is used before its declaration')) unset += 1;
      if (result.differs || result.unlikeJs) differences.push(result);
    }
    expect(differences.map(({ seed, closures, generated, js }) => ({ seed, closures, generated, js }))).toEqual([]);
    expect(unset).toBeGreaterThan(SEEDS * 0.3);
  });
});
