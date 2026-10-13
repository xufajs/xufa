const fs = require('node:fs');
const { fileURLToPath } = require('node:url');
const state = require('./state');

// vitest's in-source tests: tests written in the source file itself, in an `if (import.meta.vitest)` block, run
// when the file is one of includeSource. import.meta.vitest is rewritten to ask @xufa/test, which gives the test API to
// the module that is the test file being run, and undefined to the others: a source file another test imports does
// not add its own tests to that one.

const KEY = Symbol.for('xufa-test.importMetaVitest');
// (Without quotes: written in a string too, as it is when a string holds the words, it keeps the string whole.)
const NAME = '__xufaTestImportMetaVitest';
const REPLACEMENT = `globalThis.${NAME}?.(import.meta.url)`;

function rewriteImportMetaVitest(source) {
  return source.includes('import.meta.vitest') ? source.replace(/\bimport\.meta\.vitest\b/g, REPLACEMENT) : source;
}

function realPath(file) {
  try {
    return fs.realpathSync.native(file);
  } catch {
    return file;
  }
}

// api: what `import.meta.vitest` is in the test file (describe, it, expect, vi...).
function installImportMetaVitest(api) {
  const real = new Map();
  const realOf = (file) => {
    if (!real.has(file)) {
      real.set(file, realPath(file));
    }
    return real.get(file);
  };
  const vitest = (url) => {
    const running = state.file?.path;
    if (!running || !url?.startsWith('file:')) {
      return undefined;
    }
    const file = fileURLToPath(url.replace(/[?#].*$/, ''));
    return file === running || realOf(file) === realOf(running) ? api : undefined;
  };
  for (const key of [KEY, NAME]) {
    Object.defineProperty(globalThis, key, { value: vitest, writable: true, configurable: true });
  }
}

module.exports = { rewriteImportMetaVitest, installImportMetaVitest };
