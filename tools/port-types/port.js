#!/usr/bin/env node
// Ports the TypeScript declarations (and their type tests) of the packages xufa replaces: the files of the installed
// upstream packages are copied with what they call themselves renamed to what xufa calls it, and their imports of
// other upstream packages pointed to the xufa ones. Changes the renames can not make are in the `patch` functions.
//
// node tools/port-types/port.js [package name filter]
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const STORE = path.join(ROOT, 'node_modules', '.pnpm');

// The directory of an installed upstream package (the highest version in the store), or of a checkout of its
// repository next to this one (`dir`: as the tests of the framework are ported from ../fastify).
function upstream(name, dir) {
  if (dir) return path.join(ROOT, dir);
  const prefix = `${name.replace('/', '+')}@`;
  const dirs = fs
    .readdirSync(STORE)
    .filter((dir) => dir.startsWith(prefix) && /^\d/.test(dir.slice(prefix.length)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (dirs.length === 0) throw new Error(`${name} is not installed: add it to the devDependencies of the root`);
  return path.join(STORE, dirs[dirs.length - 1], 'node_modules', name);
}

const HEADER = (name, file) =>
  `// Ported from ${name} (${file}, MIT License) by tools/port-types/port.js: do not edit, change the tool.\n`;

const PACKAGES = require('./packages');

function port(filter) {
  for (const pkg of PACKAGES) {
    if (filter && !pkg.target.includes(filter)) continue;
    const source = upstream(pkg.upstream, pkg.dir);
    const files = typeof pkg.files === 'function' ? pkg.files(source) : pkg.files;
    for (const file of files) {
      let code = fs.readFileSync(path.join(source, file.from), 'utf8');
      // Links keep their text: they point to the documentation of the upstream package.
      const links = [];
      code = code.replace(/https?:\/\/[^\s)'"`<>]+/g, (link) => `@@LINK${links.push(link) - 1}@@`);
      for (const [pattern, replacement] of [...(file.renames || []), ...(pkg.renames || [])]) {
        code = code.replace(pattern, replacement);
      }
      code = code.replace(/@@LINK(\d+)@@/g, (_, index) => links[Number(index)]);
      if (file.patch) code = file.patch(code, file.from);
      const target = path.join(ROOT, 'packages', pkg.target, file.to);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, HEADER(pkg.upstream, file.from) + code);
      process.stdout.write(`${pkg.upstream}/${file.from} -> packages/${pkg.target}/${file.to}\n`);
    }
  }
}

port(process.argv[2]);
