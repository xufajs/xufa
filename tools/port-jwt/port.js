// Ports the test suites of jsonwebtoken (mocha, chai, sinon), jws (tape) and jwa (tap, with the vectors of RFC 7515)
// to @xufa/jwt (vyntra). The files are copied to packages/jwt/test/<package> with their requires rewritten (the
// package itself, and the small packages the tests use: test/shims), mocha's before/after/context/specify renamed,
// and the keys of jws and jwa made by openssl as their Makefiles make them (once: they are kept). The tests
// themselves are not changed.
//
// node tools/port-jwt/port.js <node-jsonwebtoken> [<node-jws> <node-jwa>]  (checkouts of their repositories)
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const [jsonwebtoken, jws, jwa] = process.argv.slice(2);
if (!jsonwebtoken) {
  console.error('Usage: node tools/port-jwt/port.js <node-jsonwebtoken> [<node-jws> <node-jwa>]');
  process.exit(1);
}
const TESTS = path.join(__dirname, '../../packages/jwt/test');

// The requires, by what they name (quoted either way): what they become. `up` reaches packages/jwt from the file.
function rewriteRequires(text, rules) {
  let out = text;
  for (const [name, replacement] of rules) {
    const quoted = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    out = out.replace(new RegExp(`require\\((['"])${quoted}\\1\\)`, 'g'), replacement);
  }
  return out;
}

function mochaToVyntra(text) {
  return text
    .replace(/(^|[^\w.])before\(/g, '$1beforeAll(')
    .replace(/(^|[^\w.])after\(/g, '$1afterAll(')
    .replace(/(^|[^\w.])context\(/g, '$1describe(')
    .replace(/(^|[^\w.])specify\(/g, '$1it(');
}

// Copies a folder of tests: .js files rewritten by `transform(text, relative)`, renamed by `rename`; the rest as it is.
function copyTests(from, to, transform, rename = (name) => name) {
  fs.mkdirSync(to, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    if (entry.isDirectory()) {
      count += copyTests(
        source,
        path.join(to, entry.name),
        (text, rel) => transform(text, `${entry.name}/${rel}`),
        rename
      );
    } else if (entry.name.endsWith('.js')) {
      // LF, as the repositories keep it (a checkout on Windows may have made it CRLF).
      const text = fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n');
      fs.writeFileSync(path.join(to, rename(entry.name)), transform(text, entry.name));
      count += 1;
    } else if (/\.(txt|json)$/.test(entry.name)) {
      // Text as the repositories keep it (LF): a checkout on Windows may have made it CRLF, and tests sign it.
      fs.writeFileSync(path.join(to, entry.name), fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n'));
    } else if (!/\.pem$|^keys$/.test(entry.name)) {
      fs.copyFileSync(source, path.join(to, entry.name));
    }
  }
  return count;
}

// The keys of a Makefile (lines `@openssl ... > file`), made in `dir` when they are not there.
function makeKeys(makefile, dir) {
  const lines = fs
    .readFileSync(makefile, 'utf8')
    .split('\n')
    .map((line) => line.trim().replace(/^@/, ''))
    .filter((line) => line.startsWith('openssl ') || line.startsWith('echo '));
  for (const line of lines) {
    const [command, output] = line.split(' > ');
    const target = output ? path.join(dir, output.trim().replace(/^test\//, '')) : null;
    if (target && fs.existsSync(target)) continue;
    const args = command
      .split(/\s+/)
      .slice(1)
      .map((arg) => (arg.startsWith('test/') ? path.join(dir, arg.slice(5)) : arg))
      .map((arg) => (arg.startsWith('file:test/') ? `file:${path.join(dir, arg.slice(10))}` : arg));
    if (command.startsWith('echo ')) {
      fs.writeFileSync(target, `${args.join(' ')}\n`);
      continue;
    }
    // -out test/x.pem writes the file itself.
    const outIndex = args.indexOf('-out');
    if (outIndex !== -1 && fs.existsSync(args[outIndex + 1])) continue;
    const result = spawnSync('openssl', args, { encoding: 'buffer' });
    if (result.status !== 0) throw new Error(`openssl ${args.join(' ')} failed: ${result.stderr}`);
    if (target) fs.writeFileSync(target, result.stdout);
  }
}

// Where @xufa/jwt is meant to differ from jsonwebtoken, the tests that assert jsonwebtoken's behaviour are changed:
// file => [pattern, replacement, how many times it must match]. A pattern that no longer matches stops the port, so a
// change upstream is looked at rather than lost.
const nonFinite = (claim) => [
  // exp, nbf and iat of Infinity or NaN are refused when signing (upstream: "TODO ... should fail validation").
  [
    new RegExp(
      `\\n *// TODO an ${claim} of [-\\w]+ should fail validation\\n *it\\('should set null "${claim}"[\\s\\S]*?\\n    \\}\\);\\n`,
      'g'
    ),
    '\n',
    3,
  ],
  [
    `describe('\`jwt.sign\` "${claim}" claim validation', function () {\n    [\n`,
    (m) => `${m}      -Infinity,\n      Infinity,\n      NaN,\n`,
    1,
  ],
];
const DEVIATIONS = {
  'claim-exp.test.js': nonFinite('exp'),
  'claim-nbf.test.js': nonFinite('nbf'),
  'claim-iat.test.js': [
    [/\n *\/\/ TODO an iat of [-\w]+ should fail validation\n *\{[\s\S]*?\n *\},/g, '', 3],
    [
      `describe('\`jwt.sign\` "iat" claim validation', function () {\n    [\n`,
      (m) => `${m}      -Infinity,\n      Infinity,\n      NaN,\n`,
      1,
    ],
  ],
};

function deviate(text, name) {
  let out = text;
  for (const [pattern, replacement, times] of DEVIATIONS[name] || []) {
    const count = typeof pattern === 'string' ? out.split(pattern).length - 1 : (out.match(pattern) || []).length;
    if (count !== times) throw new Error(`${name}: a deviation matched ${count} times, not ${times}: ${pattern}`);
    out = out.replace(pattern, replacement);
  }
  return out;
}

// jsonwebtoken: mocha with chai and sinon (devDependencies of @xufa/jwt).
const jsonwebtokenFiles = copyTests(
  path.join(jsonwebtoken, 'test'),
  path.join(TESTS, 'jsonwebtoken'),
  (text, name) =>
    deviate(
      mochaToVyntra(
        rewriteRequires(text, [
          ['../index', "require('../..')"],
          ['../', "require('../..')"],
          ['../.', "require('../..')"],
          ['../lib/JsonWebTokenError', "require('../../lib/errors').JsonWebTokenError"],
          ['../lib/validateAsymmetricKey', "require('../../lib/keys').validateAsymmetricKey"],
          ['../lib/psSupported', 'true'],
          ['../lib/rsaPssKeyDetailsSupported', 'true'],
          ['../lib/asymmetricKeyDetailsSupported', 'true'],
          ['jws', "require('../../lib/jws')"],
          ['ms', "require('../../lib/ms')"],
          ['atob', 'globalThis.atob'],
        ])
      ),
      name
    ),
  (name) => name.replace(/\.tests\.js$/, '.test.js')
);
// Its keys are files of the repository, copied with the rest: .pem files are copied here.
for (const name of fs.readdirSync(path.join(jsonwebtoken, 'test')).filter((file) => file.endsWith('.pem'))) {
  fs.copyFileSync(path.join(jsonwebtoken, 'test', name), path.join(TESTS, 'jsonwebtoken', name));
}
console.log(`jsonwebtoken: ${jsonwebtokenFiles} files`);

const SHARED = (up) => [
  ['tape', `require('${up}shims/tape')`],
  ['tap', `require('${up}shims/tape')`],
  ['safe-buffer', `require('${up}shims/helpers').safeBuffer`],
  ['semver', `require('${up}shims/helpers').semver`],
  ['base64url', `require('${up}shims/helpers').base64url`],
  ['jwk-to-pem', `require('${up}shims/helpers').jwkToPem`],
];

if (jws) {
  const to = path.join(TESTS, 'jws');
  const count = copyTests(path.join(jws, 'test'), to, (text) =>
    rewriteRequires(text, [['..', "require('../../lib/jws')"], ...SHARED('../')])
  );
  makeKeys(path.join(jws, 'Makefile'), to);
  console.log(`jws: ${count} files`);
}

if (jwa) {
  const to = path.join(TESTS, 'jwa');
  const count = copyTests(
    path.join(jwa, 'test'),
    to,
    (text, relative) =>
      relative.includes('/')
        ? rewriteRequires(text, [['../../', "require('../../../lib/jwa')"], ...SHARED('../../')])
        : rewriteRequires(text, [['..', "require('../../lib/jwa')"], ...SHARED('../')]),
    // The tests of the vectors are test.js in each folder (A.1/test.js): vyntra runs *.test.js.
    (name) => (name === 'test.js' ? 'vectors.test.js' : name)
  );
  makeKeys(path.join(jwa, 'Makefile'), to);
  console.log(`jwa: ${count} files`);
}
