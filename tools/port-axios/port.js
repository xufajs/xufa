// Ports axios's unit tests (MIT) to packages/client/test/axios/upstream: they check @xufa/client/axios (its own
// implementation of axios's API) as they check axios. As axios runs them (vitest, Node), with tests/setup/server.js:
// - vitest is @xufa/test (describe, it, expect, vi); axios's index.js is @xufa/client/axios;
// - what they import of axios's own modules (lib/core/AxiosError.js, lib/helpers/buildURL.js, lib/utils.js...) is
//   test/axios/support/internals.js, by name (`import X from '.../AxiosError.js'` -> `import { AxiosError as X }`);
// - their libraries: form-data and multer are @xufa/http's, express is @xufa/express, body-parser its parsers;
//   formidable, get-stream, dev-null, formdata-node, stream-throttle, selfsigned and abortcontroller-polyfill are
//   test/axios/support's;
// - skipped, with the reason (SKIPPED): tests of axios's internal helpers that @xufa/client/axios does not have, and
//   tests of browsers.
//
// node tools/port-axios/port.js <axios>  (a checkout of github.com/axios/axios at v1.14.0)
import fs from 'node:fs';
import path from 'node:path';

const [source] = process.argv.slice(2);
if (!source) {
  console.error('Usage: node tools/port-axios/port.js <axios>');
  process.exit(1);
}
const CLIENT = path.join(import.meta.dirname, '../../packages/client');
const TESTS = path.join(CLIENT, 'test/axios');
const UPSTREAM = path.join(TESTS, 'upstream');
const SUPPORT = path.join(TESTS, 'support');
const UNIT = path.join(source, 'tests/unit');

// Packages of the tests: to @xufa's, or to a file of support.
const PACKAGES = {
  vitest: '@xufa/test',
  'form-data': '@xufa/http/form-data',
  multer: '@xufa/http/multer',
  express: '@xufa/express',
};
const SUPPORTED = {
  formidable: 'formidable.js',
  'get-stream': 'get-stream.js',
  'dev-null': 'dev-null.js',
  'formdata-node': 'formdata-node.js',
  'stream-throttle': 'stream-throttle.js',
  selfsigned: 'selfsigned.js',
  'body-parser': 'body-parser.js',
  'abortcontroller-polyfill/dist/cjs-ponyfill.js': 'abortcontroller-polyfill.js',
};

// The name in support/internals.js of a module of axios's lib (its default export).
const INTERNALS = {
  'lib/utils.js': 'utils',
  'lib/platform/index.js': 'platform',
  'lib/defaults/index.js': 'defaults',
  'lib/adapters/adapters.js': 'adapters',
  'lib/core/Axios.js': 'Axios',
  'lib/core/AxiosError.js': 'AxiosError',
  'lib/core/AxiosHeaders.js': 'AxiosHeaders',
  'lib/core/mergeConfig.js': 'mergeConfig',
  'lib/core/transformData.js': 'transformData',
  'lib/core/buildFullPath.js': 'buildFullPath',
  'lib/cancel/CanceledError.js': 'CanceledError',
  'lib/cancel/isCancel.js': 'isCancel',
  'lib/helpers/validator.js': 'validator',
  'lib/helpers/spread.js': 'spread',
  'lib/helpers/parseHeaders.js': 'parseHeaders',
  'lib/helpers/isAxiosError.js': 'isAxiosError',
  'lib/helpers/isAbsoluteURL.js': 'isAbsoluteURL',
  'lib/helpers/formDataToJSON.js': 'formDataToJSON',
  'lib/helpers/combineURLs.js': 'combineURLs',
  'lib/helpers/buildURL.js': 'buildURL',
  'lib/helpers/toFormData.js': 'toFormData',
  'lib/helpers/parseProtocol.js': 'parseProtocol',
  'lib/helpers/fromDataURI.js': 'fromDataURI',
  'lib/helpers/estimateDataURLDecodedBytes.js': 'estimateDataURLDecodedBytes',
  'lib/helpers/composeSignals.js': 'composeSignals',
  // (Named exports: the same names.)
  'lib/adapters/http.js': null,
  'lib/adapters/fetch.js': null,
};

// Files and tests skipped: [file, title or null for the whole file, reason, condition (skipped when true) or none].
const INTERNAL = "a helper of axios's lib/utils.js that @xufa/client/axios does not have (not part of axios's API)";
const SKIPPED = [
  ['helpers/bind.test.js', null, "axios's own bind() helper: @xufa/client/axios binds with Function.prototype.bind"],
  ['utils/endsWith.test.js', null, INTERNAL],
  ['utils/extend.test.js', null, INTERNAL],
  ['utils/kindOfTest.test.js', null, INTERNAL],
  ['utils/toArray.test.js', null, INTERNAL],
  ['utils/trim.test.js', null, INTERNAL],
  ['utils.test.js', "describe('utils::isReactNativeBlob'", INTERNAL],
  ['utils.test.js', "describe('utils::isReactNative'", INTERNAL],
  ['utils.test.js', "it('should handle large Buffer in isEmptyObject without RangeError'", INTERNAL],
  [
    'regression.test.js',
    "describe('client-side mode'",
    "axios's platform switched to a browser's (hasBrowserEnv, origin): @xufa/client/axios is of Node only",
  ],
  [
    'adapters/http.test.js',
    "it('should wrap interceptor errors and keep stack'",
    'it counts the frames of its caller in a stack of 10 (Error.stackTraceLimit), which ends in the frames of the test runner: under @xufa/test they are cut elsewhere, and axios 1.14.0 fails it as well',
  ],
  [
    'adapters/http.test.js',
    "describe('SpecCompliant FormData'",
    "Node's global agent keeps alive a socket to the server of the test before, which that test closed: on Windows the request on it fails (write ECONNABORTED), with axios 1.14.0 as well (alone, or with an agent without keep-alive, it passes)",
    "process.platform === 'win32'",
  ],
];

const linkTo = (from, file) => {
  const link = path.relative(path.dirname(from), file).replace(/\\/g, '/');
  return link.startsWith('.') ? link : `./${link}`;
};

function filesOf(dir, test) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesOf(file, test));
    else if (test(file)) out.push(file);
  }
  return out;
}

const skipped = [];

function port(code, relative, target) {
  code = code.replace(/\r\n/g, '\n');
  const internals = linkTo(target, path.join(SUPPORT, 'internals.js'));
  code = code.replace(/^import ([^;]+?) from '([^']+)';$/gm, (whole, what, from) => {
    if (from.startsWith('.')) {
      const resolved = path
        .relative(source, path.resolve(path.dirname(path.join(UNIT, relative)), from))
        .replace(/\\/g, '/');
      if (resolved === 'index.js') return `import ${what} from '${linkTo(target, path.join(CLIENT, 'axios.js'))}';`;
      if (resolved === 'tests/setup/server.js')
        return `import ${what} from '${linkTo(target, path.join(UPSTREAM, 'setup/server.js'))}';`;
      if (resolved in INTERNALS) {
        const name = INTERNALS[resolved];
        if (name === null) return `import ${what} from '${internals}';`;
        return `import { ${name === what ? name : `${name} as ${what}`} } from '${internals}';`;
      }
      throw new Error(`port-axios: ${relative} imports ${from} (${resolved}), which has no mapping`);
    }
    if (from in PACKAGES) return `import ${what} from '${PACKAGES[from]}';`;
    if (from in SUPPORTED) return `import ${what} from '${linkTo(target, path.join(SUPPORT, SUPPORTED[from]))}';`;
    return whole;
  });
  // The files of the tests next to them (axios reads them from the folder it runs in).
  code = code.replace("path.join(process.cwd(), 'tests/unit/adapters')", 'import.meta.dirname');
  code = code.replace("path.resolve(__dirname, '../../../tests/unit/adapters/')", '__dirname');
  for (const [file, title, reason, condition] of SKIPPED) {
    if (file !== relative || title === null) continue;
    if (!code.includes(title)) throw new Error(`port-axios: ${title} is not in ${relative}`);
    code = code.replace(title, title.replace(/^(it|describe)\(/, condition ? `$1.skipIf(${condition})(` : '$1.skip('));
    skipped.push({
      file,
      test: title.replace(/^(it|describe)\('|'$/g, ''),
      reason,
      ...(condition && { when: condition }),
    });
  }
  return `// Ported from axios's tests/${relative.startsWith('setup/') ? '' : 'unit/'}${relative} (MIT License) by tools/port-axios/port.js: do not edit, change the tool.\n${code}`;
}

fs.rmSync(UPSTREAM, { recursive: true, force: true });
let count = 0;
for (const file of filesOf(UNIT, (name) => name.endsWith('.test.js'))) {
  const relative = path.relative(UNIT, file).replace(/\\/g, '/');
  const whole = SKIPPED.find(([name, title]) => name === relative && title === null);
  if (whole) {
    skipped.push({ file: relative, test: null, reason: whole[2] });
    continue;
  }
  const target = path.join(UPSTREAM, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, port(fs.readFileSync(file, 'utf8'), relative, target));
  count += 1;
}
for (const name of ['axios.png', 'cert.pem', 'key.pem']) {
  fs.copyFileSync(path.join(UNIT, 'adapters', name), path.join(UPSTREAM, 'adapters', name));
}
// The server of the tests: the file of setup, its imports as the tests'.
const server = path.join(UPSTREAM, 'setup/server.js');
fs.mkdirSync(path.dirname(server), { recursive: true });
const setup = path.join(source, 'tests/setup/server.js');
fs.writeFileSync(server, port(fs.readFileSync(setup, 'utf8'), 'setup/server.js', server));
fs.writeFileSync(path.join(UPSTREAM, 'skipped.json'), `${JSON.stringify(skipped, null, 2)}\n`);
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(TESTS, 'LICENSE.axios'));
console.log(
  `port-axios: ${count} test files of axios in ${path.relative(process.cwd(), UPSTREAM)}, ${skipped.length} skipped`
);
