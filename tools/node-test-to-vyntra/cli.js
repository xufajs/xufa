#!/usr/bin/env node
// node-test-to-vyntra <input file or dir> <output dir> [--prettier]
// Converts every .js/.mjs/.cjs file and prints the TODOs left in each.
const fs = require('node:fs');
const path = require('node:path');
const { convert } = require('./convert');

function files(input) {
  const stat = fs.statSync(input);
  if (stat.isFile()) return [{ abs: input, rel: path.basename(input) }];
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(abs);
      } else if (/\.(c|m)?js$/.test(entry.name)) {
        out.push({ abs, rel: path.relative(input, abs) });
      }
    }
  };
  walk(input);
  return out;
}

function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    process.stderr.write('usage: node-test-to-vyntra <input> <output dir>\n');
    process.exit(1);
  }
  let total = 0;
  for (const { abs, rel } of files(input)) {
    const src = fs.readFileSync(abs, 'utf8');
    const target = path.join(output, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!/node:test|require\('test'\)|t\.assert/.test(src)) {
      fs.writeFileSync(target, src);
      continue;
    }
    try {
      const { code, todos } = convert(src, rel);
      fs.writeFileSync(target, code);
      total += todos.length;
      if (todos.length) process.stdout.write(`${rel}: ${todos.length} TODO (${[...new Set(todos)].join('; ')})\n`);
    } catch (err) {
      process.stdout.write(`${rel}: FAILED ${err.message}\n`);
      fs.writeFileSync(target, src);
    }
  }
  process.stdout.write(`${total} TODOs\n`);
}

main();
