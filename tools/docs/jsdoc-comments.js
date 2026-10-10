// Turns the line comments (//) right above a declaration of the TypeScript declarations of the packages into doc
// comments (/** */), which editors show and the pages of reference (lib/reference.js) print. Comments followed by a
// blank line (the headers of files, notes of sections), directives (///, eslint-, @ts-) and the files a tool makes ("do
// not edit" in their first lines) are left as they are.
//
//   node tools/docs/jsdoc-comments.js            # every packages/*/index.d.ts
//   node tools/docs/jsdoc-comments.js --check    # writes nothing; fails when a file would change
import fs from 'node:fs';
import path from 'node:path';
import { declarationsOf } from './lib/declarations.js';

const PACKAGES = path.join(import.meta.dirname, '../../packages');

function convert(text) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const match = /^(\s*)\/\/(?!\/)\s?(.*)$/.exec(lines[i]);
    if (!match) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    // A run of line comments with the same indentation.
    const indent = match[1];
    const run = [];
    let j = i;
    while (j < lines.length) {
      const line = /^(\s*)\/\/(?!\/)\s?(.*)$/.exec(lines[j]);
      if (!line || line[1] !== indent) break;
      run.push(line[2]);
      j += 1;
    }
    const next = lines[j];
    const declares = next !== undefined && next.trim() !== '' && !next.trim().startsWith('}') && !/^\s*\/\*/.test(next);
    // Not directives (eslint-, @ts-, prettier-ignore), nor comments with */ in them.
    const directive = run.some((comment) => /^(eslint|@ts-|prettier-ignore|istanbul|c8 )/.test(comment.trim()));
    if (!declares || directive || run.some((comment) => comment.includes('*/'))) {
      out.push(...lines.slice(i, j));
    } else if (run.length === 1) {
      out.push(`${indent}/** ${run[0]} */`);
    } else {
      out.push(
        `${indent}/**`,
        ...run.map((comment) => (comment ? `${indent} * ${comment}` : `${indent} *`)),
        `${indent} */`
      );
    }
    i = j;
  }
  return out.join('\n');
}

function main() {
  const check = process.argv.includes('--check');
  const changed = [];
  for (const name of fs.readdirSync(PACKAGES)) {
    const file = declarationsOf(path.join(PACKAGES, name));
    if (!file) continue;
    const text = fs.readFileSync(file, 'utf8');
    // Declarations made by a tool (ported ones) are changed in the tool, not here.
    if (/do not edit/.test(text.split('\n').slice(0, 3).join('\n'))) continue;
    const result = convert(text);
    if (result === text) continue;
    changed.push(name);
    if (!check) fs.writeFileSync(file, result);
  }
  if (check && changed.length) {
    console.log(`jsdoc: line comments above declarations in ${changed.join(', ')} (node tools/docs/jsdoc-comments.js)`);
    process.exitCode = 1;
  } else console.log(changed.length ? `jsdoc: ${changed.join(', ')}` : 'jsdoc: nothing to change');
}

if (process.argv[1] === import.meta.filename) main();

export { convert };
