// The JavaScript examples of the docs (tools/docs/pages/*.page.html), from CommonJS to ES modules: their code blocks
// and the code of their <!--run-before--> and <!--run-setup--> comments.
//
//   const { a, b: c } = require('m');    import { a, b as c } from 'm';
//   const x = require('m');              import x from 'm' (a default export, a CommonJS module, a builtin, a file of
//                                        the example: './config.js') or import * as x from 'm' (names only)
//   module.exports = { a, b };           export { a, b };
//   module.exports = value;              export default value;
//   'use strict';                        taken out
//   __dirname, __filename                import.meta.dirname, import.meta.filename
//
// What it cannot rewrite (a require() inside an expression) it reports, to be written by hand.
// node tools/esm/docs-examples.mjs [--dry] [files.md...]   (the pages of the site, or those Markdown files)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire, isBuiltin } from 'node:module';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PAGES = path.join(ROOT, 'tools/docs/pages');
const dry = process.argv.includes('--dry');

// Whether `const x = require(specifier)` is a default import (else a namespace one).
const defaults = new Map();
async function isDefault(specifier) {
  if (specifier.startsWith('.') || isBuiltin(specifier)) return true;
  if (!defaults.has(specifier)) {
    const scoped = /^@xufa\/([^/]+)/.exec(specifier);
    const from = scoped
      ? path.join(ROOT, 'packages', scoped[1], 'index.js')
      : path.join(ROOT, 'packages/xufa/index.js');
    let value = true; // a package that is not here: CommonJS (module.exports is its default export)
    try {
      const file = createRequire(from).resolve(specifier);
      const namespace = await import(pathToFileURL(file).href);
      value = 'default' in namespace;
    } catch {
      // not installed in this repository
    }
    defaults.set(specifier, value);
  }
  return defaults.get(specifier);
}

// A file of the example ('./config'): with its extension, as ES modules need.
const withExtension = (specifier) =>
  specifier.startsWith('.') && !path.extname(specifier) ? `${specifier}.js` : specifier;

// Where a statement starts (a lookbehind: statements one after another on a line are all found).
const START = String.raw`(?<=^\s*|[;{]\s*|\n[ \t]*)`;

async function convert(code) {
  let out = code;
  out = out.replace(/(^|\n)[ \t]*'use strict';[ \t]*\n(\s*\n)?/g, '$1');
  // const { a, b: c } = require('m');
  out = out.replace(
    new RegExp(`${START}const \\{([^}]*)\\} = require\\('([^']+)'\\);`, 'g'),
    (all, list, specifier) => {
      const names = list
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.replace(/^([\w$]+)\s*:\s*([\w$]+)$/, '$1 as $2'));
      return `import { ${names.join(', ')} } from '${withExtension(specifier)}';`;
    }
  );
  // const x = require('m');
  const singles = [...out.matchAll(new RegExp(`${START}const ([\\w$]+) = require\\('([^']+)'\\);`, 'g'))];
  for (const [all, name, specifier] of singles) {
    const form = (await isDefault(specifier)) ? name : `* as ${name}`;
    out = out.replace(all, `import ${form} from '${withExtension(specifier)}';`);
  }
  // module.exports = { a, b };  /  module.exports = value
  out = out.replace(/(^|\n)([ \t]*)module\.exports = \{ ([\w$, ]+) \};/g, '$1$2export { $3 };');
  out = out.replace(/(^|\n)([ \t]*)module\.exports = /g, '$1$2export default ');
  out = out.replace(/\b__dirname\b/g, 'import.meta.dirname').replace(/\b__filename\b/g, 'import.meta.filename');
  return out;
}

const left = [];
let changed = 0;
// The pages of the site, or the Markdown files given (READMEs: their js blocks).
const markdown = process.argv.slice(2).filter((arg) => arg.endsWith('.md'));
const files = markdown.length
  ? markdown.map((file) => path.resolve(file))
  : fs
      .readdirSync(PAGES)
      .filter((name) => name.endsWith('.page.html'))
      .map((name) => path.join(PAGES, name));
for (const full of files) {
  const file = path.relative(ROOT, full);
  const text = fs.readFileSync(full, 'utf8');
  let out = '';
  let cursor = 0;
  const pattern = full.endsWith('.md')
    ? /(```(?:js|javascript|mjs)\r?\n)([\s\S]*?)(```)/g
    : /(<pre[^>]*><code class="language-js[^"]*">)([\s\S]*?)(<\/code><\/pre>)|(<!--run-(?:before|setup):)([\s\S]*?)(-->)/g;
  for (const match of text.matchAll(pattern)) {
    const [whole, open, code, close, commentOpen, commentCode, commentClose] = match;
    const converted = await convert(code ?? commentCode);
    out +=
      text.slice(cursor, match.index) +
      (open ? `${open}${converted}${close}` : `${commentOpen}${converted}${commentClose}`);
    cursor = match.index + whole.length;
    for (const line of converted.split('\n')) {
      if (/\brequire\(|module\.exports/.test(line)) {
        left.push(`${file}:${text.slice(0, match.index).split('\n').length}: ${line.trim()}`);
      }
    }
  }
  out += text.slice(cursor);
  if (out !== text) {
    changed += 1;
    if (!dry) fs.writeFileSync(full, out);
  }
}
console.log(`docs-examples: ${changed} files${dry ? ' would change' : ' changed'}`);
if (left.length) console.log(`left to write by hand:\n${left.join('\n')}`);
