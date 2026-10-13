// The formatter as one file (lib/prettier/dist/format.mjs), built by @xufa/bundle from lib/prettier/format.js and the
// modules it imports: loading one file is much faster than loading some 300 (a command on a few files is mostly
// that). The source is lib/prettier; the bundle is what @xufa/lint loads.
//
//   node scripts/build-format.mjs          writes lib/prettier/dist/format.mjs
//   node scripts/build-format.mjs --check  fails when it is not the build of lib/prettier
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@xufa/bundle';

const ROOT = path.join(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'lib/prettier/dist/format.mjs');
const BANNER =
  '// @xufa/lint: lib/prettier as one file (scripts/build-format.mjs, by @xufa/bundle): do not edit. NOTICE.md has the licenses.';

const { js } = bundle(path.join(ROOT, 'lib/prettier/format.js'), {
  platform: 'node',
  format: 'esm',
  treeShaking: true,
  legalComments: 'none',
  // (No module of it changes what it exports: values, which are read as fast as constants.)
  liveBindings: false,
  banner: BANNER,
});

if (process.argv.includes('--check')) {
  if (!fs.existsSync(OUT) || fs.readFileSync(OUT, 'utf8') !== js) {
    console.error('lib/prettier/dist/format.mjs is not the build of lib/prettier: node scripts/build-format.mjs');
    process.exit(1);
  }
  console.log('lib/prettier/dist/format.mjs is up to date');
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, js);
  console.log(`lib/prettier/dist/format.mjs: ${(js.length / 1024).toFixed(0)} KB`);
}
