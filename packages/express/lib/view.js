// A view of app.render(): a name looked up in the views folders (with the extension of the default engine when it has
// none, or as <name>/index.<ext>), rendered by the engine of its extension (app.engine(), or the module of that name's
// __express, required from the app's folder).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const fromApp = createRequire(path.join(process.cwd(), 'index.js'));
const fromHere = createRequire(import.meta.url);

function requireEngine(name) {
  try {
    return fromApp(name);
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    return fromHere(name);
  }
}

function tryStat(file) {
  try {
    return fs.statSync(file);
  } catch {
    return undefined;
  }
}

export class View {
  constructor(name, options = {}) {
    this.defaultEngine = options.defaultEngine;
    this.ext = path.extname(name);
    this.name = name;
    this.root = options.root;
    if (!this.ext && !this.defaultEngine)
      throw new Error('No default engine was specified and no extension was provided.');
    let fileName = name;
    if (!this.ext) {
      this.ext = this.defaultEngine[0] !== '.' ? `.${this.defaultEngine}` : this.defaultEngine;
      fileName += this.ext;
    }
    if (!options.engines[this.ext]) {
      const mod = this.ext.slice(1);
      const fn = requireEngine(mod).__express;
      if (typeof fn !== 'function') throw new Error(`Module "${mod}" does not provide a view engine.`);
      options.engines[this.ext] = fn;
    }
    this.engine = options.engines[this.ext];
    this.path = this.lookup(fileName);
  }

  lookup(name) {
    let found;
    const roots = [].concat(this.root);
    for (let i = 0; i < roots.length && !found; i += 1) {
      const location = path.resolve(roots[i], name);
      found = this.resolve(path.dirname(location), path.basename(location));
    }
    return found;
  }

  // The engine's callback is called in a later turn when the engine calls it at once.
  render(options, callback) {
    let sync = true;
    this.engine(this.path, options, function onRender(...args) {
      if (!sync) {
        callback.apply(this, args);
        return;
      }
      process.nextTick(() => callback.apply(this, args));
    });
    sync = false;
  }

  resolve(dir, file) {
    const { ext } = this;
    let candidate = path.join(dir, file);
    let stat = tryStat(candidate);
    if (stat && stat.isFile()) return candidate;
    candidate = path.join(dir, path.basename(file, ext), `index${ext}`);
    stat = tryStat(candidate);
    if (stat && stat.isFile()) return candidate;
    return undefined;
  }
}
