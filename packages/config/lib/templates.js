// Templates in the texts of a configuration: {{ expression }}, of @xufa/expression (a safe part of JavaScript: no
// assignments, nothing of the process), with `env` (the variables of the environment) and `config` (the other keys,
// templates of theirs resolved first; a cycle is an error). A text that is only one template is the value of its
// expression (a number, an object...); in a text with more, each is written as text (null and undefined as '').
// A template whose value is undefined, alone, makes its key missing (its default, or an error if required).
//
//   port: '{{ env.PORT ?? 3000 }}'
//   url: 'postgres://{{ env.DB_USER }}@{{ config.database.host }}/app'
import { Engine } from '@xufa/expression';
import { ConfigError } from './errors.js';

const TEMPLATE = /\{\{([\s\S]*?)\}\}/g;
const WHOLE = /^\{\{([\s\S]*?)\}\}$/;
// strict: a name that is not env, config nor a global (a typo: evn.PORT) is an error; lenient: members of what is
// missing are undefined (env.NOPE.x).
const engine = new Engine({ lenient: true, strict: true });

const hasTemplate = (value) => typeof value === 'string' && value.includes('{{');

// The tree with its templates resolved (a new tree; the one given is not changed). `literal`: values that are not
// templates (a Map of paths, 'a.b', to the value given there by a source that has no templates).
// `verbatim`: paths ('auth.mails') whose texts are not templates of the configuration (they are templates of
// something else: emails, pages), nor anything below them.
function resolveTemplates(tree, env, literal = new Map(), verbatim = []) {
  const done = new Map(); // path -> value
  const resolving = [];
  const errors = [];

  const raw = (path) => {
    let node = tree;
    for (const key of path) {
      if (node === null || typeof node !== 'object' || !Object.hasOwn(node, key)) return undefined;
      node = node[key];
    }
    return node;
  };

  // A view of the tree for expressions: its texts resolved when they are read.
  const child = (path, key) => {
    const at = [...path, key];
    const value = raw(at);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) return view(at);
    return valueAt(at);
  };
  const view = (path) =>
    new Proxy(
      {},
      {
        get: (target, key) => (typeof key === 'string' ? child(path, key) : undefined),
        has: (target, key) => typeof key === 'string' && raw([...path, key]) !== undefined,
        ownKeys: () => {
          const node = raw(path);
          return node && typeof node === 'object' ? Object.keys(node) : [];
        },
        getOwnPropertyDescriptor: (target, key) => {
          const node = raw(path);
          if (!node || typeof node !== 'object' || typeof key !== 'string' || !Object.hasOwn(node, key))
            return undefined;
          return { value: child(path, key), enumerable: true, configurable: true, writable: false };
        },
      }
    );
  const context = { env, config: view([]) };

  function render(text, path) {
    const name = path.join('.');
    const run = (source) => {
      try {
        return engine.evaluate(source.trim(), context);
      } catch (err) {
        if (err instanceof ConfigError) throw err;
        throw new ConfigError(`${name}: the template {{${source}}}: ${err.message}`);
      }
    };
    const whole = WHOLE.exec(text);
    if (whole && !whole[1].includes('}}')) return run(whole[1]);
    return text.replace(TEMPLATE, (all, source) => {
      const value = run(source);
      if (value === null || value === undefined) return '';
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    });
  }

  const isVerbatim = (path) => {
    const key = path.join('.');
    return verbatim.some((prefix) => key === prefix || key.startsWith(`${prefix}.`));
  };
  const isLiteral = (path, value) =>
    (literal.size > 0 && literal.get(path.join('.')) === value) || (verbatim.length > 0 && isVerbatim(path));

  function valueAt(path) {
    const key = path.join('.');
    if (done.has(key)) return done.get(key);
    const value = raw(path);
    if (isLiteral(path, value)) return value;
    if (Array.isArray(value)) {
      const out = value.map((item, i) => (hasTemplate(item) ? valueAt([...path, String(i)]) : item));
      done.set(key, out);
      return out;
    }
    if (!hasTemplate(value)) return value;
    if (resolving.includes(key)) {
      throw new ConfigError(
        `The templates refer to each other: ${[...resolving.slice(resolving.indexOf(key)), key].join(' -> ')}`
      );
    }
    resolving.push(key);
    try {
      const out = render(value, path);
      done.set(key, out);
      return out;
    } finally {
      resolving.pop();
    }
  }

  function walk(node, path) {
    if (Array.isArray(node)) return node.map((item, i) => walk(item, [...path, String(i)]));
    if (node !== null && typeof node === 'object') {
      const out = {};
      for (const key of Object.keys(node)) {
        const value = walk(node[key], [...path, key]);
        if (value !== undefined) out[key] = value;
      }
      return out;
    }
    if (!hasTemplate(node) || isLiteral(path, node)) return node;
    try {
      return valueAt(path);
    } catch (err) {
      errors.push({ path: path.join('.'), message: err.message.replace(`${path.join('.')}: `, '') });
      return undefined;
    }
  }

  const out = walk(tree, []);
  if (errors.length) throw new ConfigError('The templates of the configuration have errors', errors);
  return out;
}

export { resolveTemplates, hasTemplate };
