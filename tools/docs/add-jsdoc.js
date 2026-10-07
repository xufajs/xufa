// Adds doc comments to top-level declarations of a package's index.d.ts that have none: { name: comment } from a
// file of comments (tools/docs/jsdoc/<package>.json). Declarations with a doc comment already are left as they are.
//
//   node tools/docs/add-jsdoc.js pg
const fs = require('node:fs');
const path = require('node:path');

const name = process.argv[2];
const file = path.join(__dirname, '../../packages', name, 'index.d.ts');
const comments = JSON.parse(fs.readFileSync(path.join(__dirname, 'jsdoc', `${name}.json`), 'utf8'));
const lines = fs.readFileSync(file, 'utf8').split('\n');
const added = [];
for (const [declaration, comment] of Object.entries(comments)) {
  const pattern = new RegExp(
    `^(\\s*)(export\\s+)?(declare\\s+)?(abstract\\s+)?(class|interface|type|function|const|let|namespace|enum)\\s+${declaration}\\b`
  );
  const index = lines.findIndex((line) => pattern.test(line));
  if (index < 0) throw new Error(`${name}: no declaration ${declaration}`);
  const before = lines[index - 1] || '';
  if (/\*\/\s*$/.test(before)) continue; // documented already
  const indent = pattern.exec(lines[index])[1];
  const words = comment.split(' ');
  const wrapped = [];
  let current = '';
  for (const word of words) {
    if (current && `${indent} * ${current} ${word}`.length > 120) {
      wrapped.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  wrapped.push(current);
  const block =
    wrapped.length === 1 && `${indent}/** ${wrapped[0]} */`.length <= 120
      ? [`${indent}/** ${wrapped[0]} */`]
      : [`${indent}/**`, ...wrapped.map((line) => `${indent} * ${line}`), `${indent} */`];
  lines.splice(index, 0, ...block);
  added.push(declaration);
}
fs.writeFileSync(file, lines.join('\n'));
console.log(`${name}: ${added.length} doc comments added`);
