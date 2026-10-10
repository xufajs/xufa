// Preloaded (node --import) by the examples of the docs: '@xufa/<name>/...' and 'xufa/...' resolve to the packages of
// this repository, as an app that installed them would get them; by import and by require.
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGES = path.join(import.meta.dirname, '../../../packages');

registerHooks({
  resolve(specifier, context, nextResolve) {
    const scoped = /^@xufa\/([^/]+)(\/.*)?$/.exec(specifier);
    const name = scoped ? scoped[1] : specifier === 'xufa' || specifier.startsWith('xufa/') ? 'xufa' : null;
    if (!name) return nextResolve(specifier, context);
    // From the folder of the package itself: its name refers to it (and its exports apply).
    return nextResolve(specifier, { ...context, parentURL: pathToFileURL(path.join(PACKAGES, name, 'index.js')).href });
  },
});
