// The default imports the codemod made of require() destructurings, as named imports where the module has those names:
//
//   import __errors1 from './errors.js';            ->   import { A, B as C } from './errors.js';
//   const { A, B: C } = __errors1;
//
// Each module is imported to check its names (Node names the exports of CommonJS modules by reading them), and only
// the files where all of them are named exports change. Usage: node tools/esm/named-imports.mjs <dir|file>...
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const IMPORT = /^import (__[A-Za-z0-9_]+) from '([^']+)';\r?\n/gm;

function filesOf(target) {
  if (fs.statSync(target).isFile()) return [target];
  return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) return filesOf(full);
    return /\.m?js$/.test(entry.name) ? [full] : [];
  });
}

async function exportsOf(specifier, file) {
  const resolved = createRequire(path.resolve(file)).resolve(specifier);
  const namespace = await import(pathToFileURL(resolved).href);
  return new Set(Object.keys(namespace));
}

let changed = 0;
for (const file of process.argv.slice(2).flatMap(filesOf)) {
  let source = fs.readFileSync(file, 'utf8');
  const before = source;
  for (const [line, local, specifier] of [...source.matchAll(IMPORT)]) {
    const uses = source.match(new RegExp(`\\b${local}\\b`, 'g')).length;
    const destructuring = new RegExp(`^const \\{([^}]*)\\} = ${local};\\r?\\n`, 'm').exec(source);
    // The import and one destructuring, nothing else.
    if (!destructuring || uses !== 2) {
      if (process.env.DEBUG) console.log(file, local, 'uses', uses, 'destructuring', Boolean(destructuring));
      continue;
    }
    const bindings = destructuring[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [name, alias] = item.split(':').map((part) => part.trim());
        return { name, alias };
      });
    if (
      bindings.some(
        ({ name, alias }) => !/^[A-Za-z_$][\w$]*$/.test(name) || (alias && !/^[A-Za-z_$][\w$]*$/.test(alias))
      )
    ) {
      continue;
    }
    let names;
    try {
      names = await exportsOf(specifier, file);
    } catch (error) {
      if (process.env.DEBUG) console.log(file, specifier, error.message);
      continue;
    }
    if (!bindings.every(({ name }) => names.has(name))) {
      console.log(`${path.relative(process.cwd(), file)}: kept ${specifier} (not every name is exported)`);
      continue;
    }
    const list = bindings.map(({ name, alias }) => (alias && alias !== name ? `${name} as ${alias}` : name));
    const single = `import { ${list.join(', ')} } from '${specifier}';\n`;
    const named =
      single.length <= 121
        ? single
        : `import {\n${list.map((item) => `  ${item},\n`).join('')}} from '${specifier}';\n`;
    source = source.replace(destructuring[0], '').replace(line, named);
  }
  if (source !== before) {
    fs.writeFileSync(file, source);
    changed += 1;
  }
}
console.log(`named-imports: ${changed} files`);
