// Ports dotenv's tests (BSD-2-Clause) to packages/config/test/dotenv/upstream: they check @xufa/config/dotenv (its own
// implementation of dotenv's API) as they check dotenv. Its test files (tap, sinon, decache) and tests/ fixtures, made
// tests of @xufa/test:
// - require('../lib/main') is @xufa/config/dotenv, '../config' its preload; tap, sinon and lib/*-options are
//   test/dotenv/support's; decache(file) is a delete of require.cache;
// - the paths tests/... they read from the working folder are those of the fixtures (tests/ next to the files), and
//   files with assertions at their top level are one test;
// - the message of a missing file is fs's (on Windows it names the path resolved);
// - skipped, with the reason: the tests of dotenv's random tips (ads of dotenvx): xufa's log line has none.
//
// node tools/port-dotenv/port.js <dotenv>  (a checkout of github.com/motdotla/dotenv at a tag)
import fs from 'node:fs';
import path from 'node:path';

const [dotenv] = process.argv.slice(2);
if (!dotenv) {
  console.error('Usage: node tools/port-dotenv/port.js <dotenv>');
  process.exit(1);
}
const TESTS = path.join(import.meta.dirname, '../../packages/config/test/dotenv');
const UPSTREAM = path.join(TESTS, 'upstream');

const REQUIRES = {
  '../lib/main': '../../../dotenv.js',
  tap: '../support/tap.js',
  sinon: '../support/sinon.js',
  '../lib/env-options': '../support/env-options.js',
  '../lib/cli-options': '../support/cli-options.js',
};
const SKIPPED = {
  'displays random tips from the tips array': "xufa's log line has no tips (dotenv's are ads of dotenvx)",
};

function port(source, name) {
  let code = source.replace(/\r\n/g, '\n');
  code = code.replace(/require\('([^']+)'\)/g, (whole, id) => (REQUIRES[id] ? `require('${REQUIRES[id]}')` : whole));
  code = code.replace(/^const decache = require\('decache'\)\n/m, '');
  code = code.replace(
    /decache\('\.\.\/lib\/env-options\.js'\)/g,
    "delete require.cache[require.resolve('../support/env-options.js')]"
  );
  // (The fixtures are in tests/ next to the files; the preload is @xufa/config's.)
  code = code.replace("path.resolve(__dirname, '.env')", "path.resolve(__dirname, 'tests', '.env')");
  code = code.replace("cwd: path.resolve(__dirname, '..')", 'cwd: __dirname');
  code = code.replaceAll("'./config'", "path.join(__dirname, '../../../dotenv-config.js')");
  // (The error of a missing file is fs's, whose message names the path as the system resolves it: on Windows, not as
  // written. dotenv gives the same there.)
  code = code.replaceAll(
    `"ENOENT: no such file or directory, open 'file:///tests/.env'"`,
    "(() => { try { fs.readFileSync('file:///tests/.env') } catch (e) { return e.message } })()"
  );
  for (const [title, reason] of Object.entries(SKIPPED)) {
    code = code.replaceAll(`t.test('${title}`, `// Skipped: ${reason}.\nt.skip('${title}`);
  }
  // (Paths of tests/ in strings, to the fixtures from the working folder: 'tests/.env', 'Cannot parse tests/.env.vault'.
  // Those of the preload, run in the folder of the tests, stay.)
  code = code.replace(/'[^'\n]*'/g, (literal) =>
    /(^'|\s)tests\//.test(literal) && !/[`$]/.test(literal)
      ? `\`${literal.slice(1, -1).replace(/(^|\s)tests\//g, '$1${FIXTURES}/')}\``
      : literal
  );
  // (Assertions at the top level: the file is one test.)
  if (!/^t\.(test|skip)\(/m.test(code)) code = `it('${name}', () => {\n${code}});\n`;
  const header =
    `// Ported from dotenv's tests/${name} (BSD-2-Clause License) by tools/port-dotenv/port.js: do not edit, change the tool.\n` +
    "const FIXTURES = require('path').relative(process.cwd(), require('path').join(__dirname, 'tests'));\n";
  return header + code;
}

fs.rmSync(UPSTREAM, { recursive: true, force: true });
fs.mkdirSync(path.join(UPSTREAM, 'tests'), { recursive: true });
const testDir = path.join(dotenv, 'tests');
let count = 0;
for (const entry of fs.readdirSync(testDir, { withFileTypes: true })) {
  const file = path.join(testDir, entry.name);
  if (entry.isFile() && entry.name.startsWith('.env')) {
    fs.copyFileSync(file, path.join(UPSTREAM, 'tests', entry.name));
  } else if (entry.isFile() && entry.name.endsWith('.js')) {
    fs.writeFileSync(
      path.join(UPSTREAM, entry.name.replace(/\.js$/, '.test.js')),
      port(fs.readFileSync(file, 'utf8'), entry.name)
    );
    count += 1;
  }
}
fs.copyFileSync(path.join(dotenv, 'LICENSE'), path.join(TESTS, 'LICENSE.dotenv'));
console.log(`port-dotenv: ${count} files of dotenv's tests in ${path.relative(process.cwd(), UPSTREAM)}`);
