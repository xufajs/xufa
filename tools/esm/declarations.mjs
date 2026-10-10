// The TypeScript declarations of the packages that are ES modules. Many are CommonJS declarations (export =), ported
// from upstream (fastify, avvio, find-my-way, pino, ws, sequelize: tools/port-types), and describe both what import
// gives (the default export, and the names of the namespace) and what require() gives. TypeScript reads a .d.ts by
// the "type" of its package, so in a package of ES modules they become:
//
//   index.d.ts with export =            index.d.cts (package.json: "types", "exports", "files" follow)
//   a folder of declarations (types/)   a package.json { "type": "commonjs" } in it
//   import ... from './x' (an ES module declaration)   './x.js' ('./x.cjs' for one renamed)
//
// node tools/esm/declarations.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';

const PACKAGES = path.resolve(import.meta.dirname, '../../packages');
const dry = process.argv.includes('--dry');
// Folders of CommonJS declarations ported as they are.
const COMMONJS_FOLDERS = ['http/types', 'sequelize/types'];

const write = (file, text) => {
  if (!dry) fs.writeFileSync(file, text);
};

function declarationsOf(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'test'].includes(entry.name)) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return declarationsOf(full);
    return entry.name.endsWith('.d.ts') ? [full] : [];
  });
}

for (const folder of COMMONJS_FOLDERS) {
  const file = path.join(PACKAGES, folder, 'package.json');
  if (!fs.existsSync(file)) {
    console.log(`${folder}/package.json: commonjs`);
    write(file, '{\n  "type": "commonjs"\n}\n');
  }
}

for (const name of fs.readdirSync(PACKAGES)) {
  const pkgFile = path.join(PACKAGES, name, 'package.json');
  if (!fs.existsSync(pkgFile)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  if (pkg.type !== 'module') continue;
  const inCommonjsFolder = (file) =>
    COMMONJS_FOLDERS.some((folder) => file.startsWith(path.join(PACKAGES, folder) + path.sep));
  const all = declarationsOf(path.join(PACKAGES, name));
  // export = : a CommonJS declaration, .d.cts (again after tools/port-types wrote a .d.ts).
  const renamed = new Set();
  let pkgText = fs.readFileSync(pkgFile, 'utf8');
  for (const file of all.filter((one) => !inCommonjsFolder(one))) {
    if (!/^export = /m.test(fs.readFileSync(file, 'utf8'))) continue;
    const rel = path.relative(path.join(PACKAGES, name), file).split(path.sep).join('/');
    const relCts = rel.replace(/\.d\.ts$/, '.d.cts');
    console.log(`${name}/${rel} -> ${relCts}`);
    if (!dry) fs.renameSync(file, file.replace(/\.d\.ts$/, '.d.cts'));
    renamed.add(file);
    pkgText = pkgText.split(`"./${rel}"`).join(`"./${relCts}"`).split(`"${rel}"`).join(`"${relCts}"`);
  }
  write(pkgFile, pkgText);
  const isCts = (file) => fs.existsSync(`${file}.d.cts`) || renamed.has(`${file}.d.ts`);
  // Relative imports: with their extension in ES module declarations; '.cjs' to a .d.cts in any (a CommonJS
  // declaration does not find one without it).
  for (const file of all) {
    if (renamed.has(file)) continue;
    const commonjs = inCommonjsFolder(file);
    const text = fs.readFileSync(file, 'utf8');
    const fixed = text.replace(/(from |import\()'(\.\.?\/[^']*)'/g, (whole, keyword, specifier) => {
      if (/\.(c|m)?js$/.test(specifier)) return whole;
      const target = path.resolve(path.dirname(file), specifier);
      if (isCts(target)) return `${keyword}'${specifier}.cjs'`;
      if (commonjs) return whole;
      if (fs.existsSync(`${target}.d.ts`)) return `${keyword}'${specifier}.js'`;
      if (fs.existsSync(path.join(target, 'index.d.ts'))) return `${keyword}'${specifier}/index.js'`;
      return whole;
    });
    if (fixed !== text) {
      console.log(`${path.relative(PACKAGES, file)}: imports with extensions`);
      write(file, fixed);
    }
  }
}
