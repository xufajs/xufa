'use strict';

// The parser of @xufa/lint (lib/parser.js) alone: the time to parse the files of `node bench/lint.js --tests` and the
// cases of the rules' tests (as a script and as a module), and whether its trees are those it made before: --save
// keeps a hash of each tree (keys sorted, loc included) in the system's temporary folder, --check compares with them.
// For changes of the parser that must not change its trees.
//
//   node bench/lint-parse.js [--save | --check] [--rounds 5]

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { corpus } = require('./lint');
const { cases } = require('./lint-cases');

const LINT = path.join(__dirname, '../packages/lint');
const HASHES = path.join(os.tmpdir(), 'xufa-bench-lint-parse.json');

const argument = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};

// A tree as text: keys sorted, loc too (it may be made when read), parents left out.
const canonical = (tree) =>
  JSON.stringify(tree, function sorted(key, value) {
    if (key === 'parent') return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const keys = Object.keys(value);
    if ('loc' in value && !keys.includes('loc')) keys.push('loc');
    return Object.fromEntries(keys.sort().map((name) => [name, value[name]]));
  });

async function main() {
  const { parse } = require(path.join(LINT, 'lib/parser.js'));
  const texts = (await corpus(true)).map((file) => [
    path.relative(path.join(__dirname, '..'), file),
    fs.readFileSync(file, 'utf8'),
    { sourceType: file.endsWith('.cjs') ? 'commonjs' : 'module', jsx: file.endsWith('.jsx'), filePath: file },
  ]);
  for (const [i, item] of cases().entries()) {
    texts.push([`case ${i} (script)`, item.code, { sourceType: 'script', jsx: true }]);
    texts.push([`case ${i} (module)`, item.code, { sourceType: 'module', jsx: true }]);
  }
  const hashOf = ([, text, options]) => {
    try {
      return crypto
        .createHash('sha1')
        .update(canonical(parse(text, options)))
        .digest('hex');
    } catch (error) {
      return `error: ${error.message}`;
    }
  };
  if (process.argv.includes('--save') || process.argv.includes('--check')) {
    const hashes = Object.fromEntries(texts.map((item) => [item[0], hashOf(item)]));
    if (process.argv.includes('--save')) {
      fs.writeFileSync(HASHES, JSON.stringify(hashes));
      console.log(`${texts.length} trees kept (${HASHES})`);
      return;
    }
    const kept = JSON.parse(fs.readFileSync(HASHES, 'utf8'));
    const differ = Object.keys(hashes).filter((name) => name in kept && hashes[name] !== kept[name]);
    console.log(`${texts.length} trees; ${differ.length} not as kept${differ.length ? ':' : ''}`);
    for (const name of differ.slice(0, 10)) console.log(`  ${name}`);
    if (differ.length) process.exitCode = 1;
    return;
  }
  const rounds = Number(argument('rounds', 5));
  const pass = () => {
    const start = performance.now();
    for (const [, text, options] of texts) {
      try {
        parse(text, options);
      } catch {
        // (as before)
      }
    }
    return performance.now() - start;
  };
  const times = Array.from({ length: rounds }, pass);
  const warm = times.slice(1).sort((a, b) => a - b);
  console.log(
    `${texts.length} texts: ${times[0].toFixed(0)} ms cold, ${warm[Math.floor(warm.length / 2)].toFixed(0)} ms warm`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
