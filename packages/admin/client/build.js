// Builds the page of the admin: client/src (React) bundled with @xufa/bundle into lib/client/dist (admin.js and admin.css,
// with their brotli and gzip copies). The bundle is what is published: the admin needs no dependencies to run.
//
//   node client/build.js           writes lib/client/dist
//   node client/build.js --check   fails when lib/client/dist is not the build of client/src
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { bundle } from '@xufa/bundle';

const SRC = path.join(import.meta.dirname, 'src');
const OUT = path.join(import.meta.dirname, '..', 'lib', 'client', 'dist');

async function build() {
  const result = bundle(path.join(SRC, 'main.jsx'), {
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    minify: true,
  });
  const notices = licenses(result);
  const files = {};
  for (const [name, content] of [
    ['admin.js', result.js + notices],
    ['admin.css', result.css],
  ]) {
    const text = Buffer.from(content);
    files[name] = text;
    files[`${name}.gz`] = sameOnEverySystem(zlib.gzipSync(text, { level: 9 }));
    files[`${name}.br`] = zlib.brotliCompressSync(text, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: text.length },
    });
  }
  return files;
}

// A gzip file with "unknown" as the system that made it (byte 9 of its header: zlib writes 10 on Windows, 3 on
// Linux), so that the build is the same on every system and --check passes on all of them. Readers ignore it.
function sameOnEverySystem(gzip) {
  gzip[9] = 255;
  return gzip;
}

// The licenses of the packages in the bundle whose code has none to keep (React Flow, zustand, d3...), after those
// the bundle keeps: each package's LICENSE file, read from its folder.
function licenses(result) {
  const folders = new Map();
  for (const input of result.inputs) {
    // The package is what follows the last node_modules.
    const match = /^(.*node_modules\/)((?:@[^/]+\/)?[^/]+)/.exec(input.split(path.sep).join('/'));
    if (match) folders.set(match[2], path.resolve(match[1] + match[2]));
  }
  let text = '';
  for (const [name, folder] of [...folders].sort(([a], [b]) => a.localeCompare(b))) {
    if (result.js.includes(`\n${name}/`)) continue;
    const file = fs.readdirSync(folder).find((entry) => /^licen[cs]e/i.test(entry));
    if (!file) throw new Error(`admin: ${name} has no license file to bundle`);
    const license = fs.readFileSync(path.join(folder, file), 'utf8').trim().replace(/\*\//g, '* /');
    text += `\n${name}:\n  (*\n${license.replace(/^/gm, '   * ').replace(/ +$/gm, '')}\n   *)\n`;
  }
  return text ? `/*! The licenses of the packages in the bundle that have none above.\n${text}*/\n` : '';
}

async function main() {
  const check = process.argv.includes('--check');
  const files = await build();
  if (check) {
    const stale = Object.keys(files).filter((name) => {
      const file = path.join(OUT, name);
      return !fs.existsSync(file) || !fs.readFileSync(file).equals(files[name]);
    });
    if (stale.length) {
      console.error(`admin: lib/client/dist is not the build of client/src (${stale.join(', ')}): npm run build`);
      process.exit(1);
    }
    console.log('admin: lib/client/dist is up to date');
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), content);
  const size = (name) => `${(files[name].length / 1024).toFixed(1)} KB`;
  console.log(
    `admin: admin.js ${size('admin.js')} (${size('admin.js.br')} br), admin.css ${size('admin.css')} (${size('admin.css.br')} br)`
  );
}

if (process.argv[1] === import.meta.filename) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { build, OUT };
