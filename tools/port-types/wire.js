#!/usr/bin/env node
// Points the package.json of a package of xufa to its declarations, and adds the script testing them.
// node tools/port-types/wire.js <package directory name> <test:types command> [declaration files...]
const fs = require('node:fs');
const path = require('node:path');

const [dir, command, ...declarations] = process.argv.slice(2);
const file = path.join(__dirname, '..', '..', 'packages', dir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
const files = declarations.length > 0 ? declarations : ['index.d.ts'];

pkg.types = `./${files[0]}`;
// "types" first (TypeScript reads the conditions in order), the other conditions kept.
const main = pkg.exports['.'];
const conditions = typeof main === 'string' ? { default: main } : { ...main };
delete conditions.types;
pkg.exports['.'] = { types: `./${files[0]}`, ...conditions };
for (const name of files) if (!pkg.files.includes(name)) pkg.files.push(name);
pkg.scripts['test:types'] = command;

// "types" right after "main", as npm shows it.
const ordered = {};
for (const [key, value] of Object.entries(pkg)) {
  if (key === 'types') continue;
  ordered[key] = value;
  if (key === 'main') ordered.types = pkg.types;
}
fs.writeFileSync(file, `${JSON.stringify(ordered, null, 2)}\n`);
process.stdout.write(`${dir}: types ${pkg.types}, test:types "${command}"\n`);
