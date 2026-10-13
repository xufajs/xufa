// @xufa/bundle: modules as one script for browsers (bundle), one module as CommonJS (transform), and smaller
// JavaScript and CSS (minifyJs, minifyCss). Syntax is TypeScript's: it is the one dependency, the project's.
export { bundle } from './lib/bundle.js';
export { transform } from './lib/transform.js';
export { minifyJs, minifyCss } from './lib/minify.js';
export { resolve } from './lib/resolve.js';
