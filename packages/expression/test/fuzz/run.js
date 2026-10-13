// Long runs of the fuzz: random programs on the closures, on one function, and as JavaScript, from a seed on.
//   node test/fuzz/run.js [--from 1] [--count 10000] [--random] [--tdz]
// --random: from a random seed (printed); --tdz: engines with tdz, and programs that use names before their
// declarations. What differs is printed with its seed and program, to run again with programOf(seed). Exits with 1
// when something differs.
import { Engine } from '../../index.js';
import { check } from './programs.js';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : Number(args[at + 1]);
};
const from = args.includes('--random') ? Math.floor(Math.random() * 2 ** 31) : option('from', 1);
const count = option('count', 10_000);

const tdz = args.includes('--tdz');
const options = { statements: true, maxSteps: 200_000, maxLength: 100_000, tdz };
const engines = {
  closures: new Engine({ ...options, inline: false }),
  generated: new Engine({ ...options, inlineAfter: 0 }),
  tdz,
};

const started = Date.now();
let differs = 0;
let unlikeJs = 0;
let errors = 0;
let compared = 0;
for (let seed = from; seed < from + count; seed += 1) {
  const result = await check(seed, engines);
  if (result.closures.error) errors += 1;
  if (result.js && !result.js.error) compared += 1;
  if (result.differs || result.unlikeJs) {
    if (result.differs) differs += 1;
    else unlikeJs += 1;
    console.log(`\n${result.differs ? 'THE ENGINES DIFFER' : 'UNLIKE JAVASCRIPT'}, seed ${seed}:\n${result.source}`);
    console.log('  closures: ', JSON.stringify(result.closures));
    console.log('  generated:', JSON.stringify(result.generated));
    if (result.js) console.log('  js:       ', JSON.stringify(result.js));
  }
  if ((seed - from + 1) % 1000 === 0) process.stderr.write(`${seed - from + 1} programs\r`);
}
const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(
  `\nseeds ${from}..${from + count - 1}: ${count} programs in ${seconds}s, ${errors} threw (the same on both),` +
    ` ${compared} compared with JavaScript; ${differs} differ between the engines, ${unlikeJs} unlike JavaScript`
);
process.exitCode = differs || unlikeJs ? 1 : 0;
