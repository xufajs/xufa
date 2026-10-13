// Where an import goes, as Node.js and bundlers for browsers find it: relative files (with their extensions and
// index files), and packages from node_modules by their "exports" (with conditions), "browser", "module" and "main".
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';

const EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.json', '.css'];
const BUILTINS = new Set(builtinModules);

const isFile = (file) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

const isBuiltin = (request) => request.startsWith('node:') || BUILTINS.has(request.split('/')[0]);

// A file as written, with an extension, or the index of the folder.
function asFile(file) {
  if (isFile(file)) return file;
  for (const extension of EXTENSIONS) if (isFile(file + extension)) return file + extension;
  // TypeScript's style: ./a.js written for ./a.ts.
  const typescript = /\.([cm]?)js$/.exec(file);
  if (typescript) {
    for (const extension of [`.${typescript[1]}ts`, `.${typescript[1]}tsx`]) {
      const candidate = file.slice(0, -typescript[0].length) + extension;
      if (isFile(candidate)) return candidate;
    }
  }
  for (const extension of EXTENSIONS) {
    const index = path.join(file, `index${extension}`);
    if (isFile(index)) return index;
  }
  return null;
}

// The target of an "exports" (or "imports") entry for these conditions.
function target(entry, conditions) {
  if (typeof entry === 'string') return entry;
  if (Array.isArray(entry)) {
    for (const item of entry) {
      const found = target(item, conditions);
      if (found) return found;
    }
    return null;
  }
  if (entry && typeof entry === 'object') {
    for (const [key, value] of Object.entries(entry)) {
      if (key === 'default' || conditions.includes(key)) {
        const found = target(value, conditions);
        if (found) return found;
      }
    }
  }
  return null;
}

// A subpath of a package ('.', './client') in its "exports": exact, or by a pattern with *.
function exported(exports, subpath, conditions) {
  const map =
    typeof exports === 'string' || Array.isArray(exports) || !Object.keys(exports).some((key) => key.startsWith('.'))
      ? { '.': exports }
      : exports;
  if (Object.hasOwn(map, subpath)) return target(map[subpath], conditions);
  let best = null;
  for (const key of Object.keys(map)) {
    const star = key.indexOf('*');
    if (star < 0) continue;
    const before = key.slice(0, star);
    const after = key.slice(star + 1);
    if (subpath.startsWith(before) && subpath.endsWith(after) && subpath.length >= key.length - 1) {
      if (!best || before.length > best.before.length) best = { key, before, after };
    }
  }
  if (!best) return null;
  const middle = subpath.slice(best.before.length, subpath.length - best.after.length);
  const found = target(map[best.key], conditions);
  return found && found.replaceAll('*', middle);
}

const manifests = new Map();
function manifest(dir) {
  if (!manifests.has(dir)) {
    const file = path.join(dir, 'package.json');
    manifests.set(dir, isFile(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
  }
  return manifests.get(dir);
}

// The package.json above a file: { dir, pkg }.
function packageOf(file) {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    const pkg = manifest(dir);
    if (pkg) return { dir, pkg };
    if (path.dirname(dir) === dir) return null;
  }
}

// The "browser" field of a package as a map: { './lib/node.js': './lib/browser.js' or false }.
function browserMap(dir, pkg) {
  if (!pkg.browser || typeof pkg.browser !== 'object') return null;
  const map = new Map();
  for (const [from, to] of Object.entries(pkg.browser)) {
    const key = from.startsWith('.') ? asFile(path.join(dir, from)) || path.join(dir, from) : from;
    map.set(key, to === false ? false : to.startsWith('.') ? asFile(path.join(dir, to)) : to);
  }
  return map;
}

// A file after the "browser" field of its package: the same, another, or false (an empty module).
function mapped(file, browser) {
  if (!browser) return file;
  const found = packageOf(file);
  const map = found && browserMap(found.dir, found.pkg);
  return map && map.has(file) ? map.get(file) : file;
}

// The entry of a package folder without "exports".
function mainOf(dir, pkg, browser) {
  const fields = browser ? ['browser', 'module', 'main'] : ['module', 'main'];
  for (const field of fields) {
    const value = pkg[field];
    if (typeof value === 'string') {
      const file = asFile(path.join(dir, value));
      if (file) return file;
    }
  }
  return asFile(path.join(dir, 'index'));
}

/**
 * Resolves `request` imported from the file `from`. `kind` is 'import' or 'require' (its condition); `browser`
 * adds the "browser" condition and field. Gives the path, false (a module left empty by "browser"), or null.
 */
function resolve(request, from, { kind = 'import', browser = true, conditions = [] } = {}) {
  const all = [...conditions, browser ? 'browser' : 'node', kind, ...(kind === 'import' ? ['module'] : [])];
  const dir = path.dirname(from);
  if (request.startsWith('./') || request.startsWith('../') || request === '.' || request === '..') {
    const file = asFile(path.resolve(dir, request));
    return file && mapped(file, browser);
  }
  if (path.isAbsolute(request)) return asFile(request);
  // A bare import the package of the importer maps in "browser" ("fs": false).
  if (browser) {
    const own = packageOf(from);
    const map = own && browserMap(own.dir, own.pkg);
    if (map?.has(request)) {
      const to = map.get(request);
      if (to === false) return false;
      if (typeof to === 'string' && to !== request)
        return path.isAbsolute(to) ? to : resolve(to, from, { kind, browser });
    }
  }
  if (request.startsWith('#')) {
    const own = packageOf(from);
    const found = own?.pkg.imports && exported(own.pkg.imports, request, all);
    return found ? resolve(found.startsWith('.') ? path.join(own.dir, found) : found, from, { kind, browser }) : null;
  }
  const parts = request.split('/');
  const name = request.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  const subpath = `.${request.slice(name.length)}`;
  for (let up = dir; ; up = path.dirname(up)) {
    const candidate = path.join(up, 'node_modules', name);
    const pkg = manifest(candidate);
    if (pkg || fs.existsSync(candidate)) {
      const real = fs.realpathSync(candidate);
      const own = manifest(real) || {};
      if (own.exports !== undefined) {
        const found = exported(own.exports, subpath, all);
        if (!found) throw new Error(`${request}: not exported by ${name} (from ${from})`);
        const file = asFile(path.join(real, found));
        return file && mapped(file, browser);
      }
      const file = subpath === '.' ? mainOf(real, own, browser) : asFile(path.join(real, subpath));
      return file && mapped(file, browser);
    }
    if (path.dirname(up) === up) return null;
  }
}

export { resolve, isBuiltin, packageOf };
