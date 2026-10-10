#!/usr/bin/env node
// Ports the test suite of fastify to xufa: converts node:test to vyntra, then renames what fastify calls its own.
// node port-fastify.js <fastify test dir> <output dir> [file filter regexp]
const fs = require('node:fs');
const path = require('node:path');
const { convert } = require('./convert');

// Directories of fastify tests that test what xufa does not have (TypeScript types, bundlers, build scripts).
const SKIPPED_DIRS = new Set(['types', 'bundler', 'build', 'scripts']);

// fastify modules of lib/ and what they are in xufa.
const LIB_MODULES = {
  'logger-factory': 'logger',
  'logger-pino': 'logger',
  'log-controller': 'logger',
  'req-id-gen-factory': 'req-id',
  'initial-config-validation': 'config',
  'error-status': 'error-handler',
};

const RENAMES = [
  [/FST_ERR_/g, 'XUFA_ERR_'],
  [/AVV_ERR_/g, 'BOOT_ERR_'],
  [/AVVIO_ERRORS_MAP/g, 'BOOT_ERRORS_MAP'],
  [/FSTWRN/g, 'XUFAWRN'],
  [/FSTSEC/g, 'XUFASEC'],
  [/FSTDEP/g, 'XUFADEP'],
  [/'FastifyError'/g, "'XufaError'"],
  [/"FastifyError"/g, '"XufaError"'],
  [/'FastifyWarning'/g, "'XufaWarning'"],
  [/'FastifySecurity'/g, "'XufaSecurity'"],
  [/\bkAvvioBoot\b/g, 'kBoot'],
  [/\bkRouteByFastify\b/g, 'kRouteByXufa'],
  [/'fastify\.request\.handler'/g, "'xufa.request.handler'"],
  [/'fastify\.initialization'/g, "'xufa.initialization'"],
  [/tracing:fastify\./g, 'tracing:xufa.'],
  [/Fastify instance is already listening/g, 'Xufa instance is already listening'],
  [/Fastify has already been closed/g, 'Xufa has already been closed'],
  [/'Fastify is already started'/g, "'Xufa is already started'"],
  [/when fastify instance is already started/g, 'when xufa instance is already started'],
  [/Not found handler already set for Fastify instance/g, 'Not found handler already set for Xufa instance'],
  [/this is likely a fastify bug/g, 'this is likely a xufa bug'],
  [/fastify-plugin: /g, 'xufa-plugin: '],
  [/\bFastifyError\b/g, 'XufaError'],
  // The root of the chain of plugin names.
  [/'fastify -> /g, "'xufa -> "],
  [/(pluginName\)\.toBe\()'fastify'\)/g, "$1'xufa')"],
  // Messages xufa words differently.
  [
    /visit fastify\.dev\/docs\/latest\/Reference\/Middleware\/ for more info\./g,
    'see the documentation of xufa for more info.',
  ],
  [/expected '%s' fastify version/g, "expected '%s' xufa version"],
  // References that can not be resolved, as @xufa/schema (not ajv) reports them.
  [
    /due to error can't resolve reference #notExist from id #/g,
    'due to error Unsupported JSON Schema \\"$ref\\": \\"#notExist\\" at #.properties.name: only references within the schema or to documents in the \\"schemas\\" option are supported',
  ],
  [
    /due to error can't resolve reference encapsulation#\/properties\/id from id #/g,
    'due to error Unsupported JSON Schema \\"$ref\\": \\"encapsulation#/properties/id\\" at #.properties.id: only references within the schema or to documents in the \\"schemas\\" option are supported',
  ],
  // The logger is @xufa/logger, and the default compilers are modules of xufa.
  [/require\.resolve\((['"])pino\1\)/g, "require.resolve('@xufa/logger')"],
  [/@fastify\$\{sep\}ajv-compiler/g, 'lib${sep}validator-compiler'],
  [/@fastify\$\{sep\}fast-json-stringify-compiler/g, 'lib${sep}serializer-compiler'],
  // The named export of the framework.
  [/\{ fastify \} = require\(/g, '{ xufa: fastify } = require('],
];

// Tests of what xufa does not do: plugins and keywords of ajv (xufa validates with @xufa/schema), and the files of the
// documentation and the types of fastify.
const SKIPPED_TESTS = {
  'schema-examples.test.js': ['Example - ajv config', 'should return custom error messages with ajv-errors'],
  'schema-special-usage.test.js': [
    'Ajv plugins array parameter',
    'Should handle root $merge keywords in header',
    'Should handle root $patch keywords in header',
    'Should handle $merge keywords in body',
    'Should handle $patch keywords in body',
    'Supports async AJV validation',
    'async validation result must not replace the request body (value collision)',
    'async validation result must not be treated as an error (error collision)',
    'Check all the async AJV validation paths',
    'Check mixed sync and async AJV validations',
    'Check if hooks and attachValidation work with AJV validations',
  ],
  'internals/errors.test.js': [
    'Ensure that all errors are in Errors.md TOC',
    'Ensure that non-existing errors are not in Errors.md TOC',
    'Ensure that all errors are in Errors.md documented',
    'Ensure that non-existing errors are not in Errors.md documented',
    'Ensure that all errors are in errors.d.ts',
    'Ensure that non-existing errors are not in errors.d.ts',
  ],
};

function rewriteRequires(code) {
  let out = code;
  // The framework itself: the package requires itself by name.
  out = out.replace(/require\((['"])(?:\.\.?\/)+(?:fastify(?:\.js)?)?\1\)/g, "require('@xufa/http')");
  out = out.replace(/require\((['"])\.\.\/(?:\.\.\/)*\1\)/g, "require('@xufa/http')");
  out = out.replace(/require\((['"])fastify\1\)/g, "require('@xufa/http')");
  out = out.replace(/require\((['"])fastify-plugin\1\)/g, "require('@xufa/http').plugin");
  out = out.replace(/require\((['"])pino\1\)/g, "require('@xufa/logger')");
  out = out.replace(/require\((['"])pino\/lib\/symbols\1\)/g, "require('@xufa/logger').symbols");
  out = out.replace(/require\((['"])@fastify\/error\1\)/g, "require('@xufa/errors')");
  out = out.replace(/require\((['"])process-warning\1\)/g, "require('@xufa/http/lib/warnings')");
  out = out.replace(/require\((['"])secure-json-parse\1\)/g, "require('@xufa/http/lib/secure-json')");
  // Modules stubbed by proxyquire: the requires to stub are in lib/xufa.js.
  out = out.replace(/proxyquire\((['"])((?:\.\.\/)+)fastify(?:\.js)?\1/g, "proxyquire('$2lib/xufa'");
  // The package stubbed in modules of lib/: they are required by lib/xufa.js, as './name'.
  out = out.replace(
    /proxyquire\((['"])((?:\.\.\/)*\.\.)\/?\1, \{(\s*)(['"])\.\/lib\/([\w-]+)(?:\.js)?\4/g,
    "proxyquire('$2/lib/xufa', {$3'./$5'"
  );
  // ES modules.
  out = out.replace(/from (['"])(?:\.\.?\/)+fastify(?:\.js)?\1/g, "from '@xufa/http'");
  out = out.replace(/import\((['"])(?:\.\.?\/)+fastify(?:\.js)?\1\)/g, "import('@xufa/http')");
  // The shared helpers were given node:test (t), which is gone: they use the globals of vyntra.
  out = out.replace(/(payloadMethod\([^,()]+), t\b/g, '$1, {}');
  // Modules of lib/ with other names.
  out = out.replace(/require\((['"])((?:\.\.\/)+lib\/)([\w-]+?)(\.js)?\1\)/g, (match, quote, dir, name) => {
    const target = LIB_MODULES[name] || name;
    return `require('${dir}${target}')`;
  });
  return out;
}

// Changes of single files, where node:test and vyntra work differently.
function fixFile(relPath, code) {
  let out = code;
  const file = relPath.replace(/\\/g, '/');
  // The certificates are needed while collecting (describe bodies create the servers), not before the tests.
  out = out.replace(
    /^beforeAll\(buildCertificate\)$/m,
    '// Certificates are needed while collecting.\nbuildCertificate()'
  );
  if (file === 'helper.js' || file === 'input-validation.js') {
    // assertNoWarning() runs in a test; the other t.after() of the helpers are hooks of the file.
    out = out.replace(/(assertNoWarning = function \(t\) \{[\s\S]*?)t\.after\(/, '$1onTestFinished(');
    out = out.replace(/\bt\.after\(/g, 'afterAll(');
    // node:test counted the assertions of the error handler outside of the tests; expect() counts them in.
    out = out.replace(
      "expect(request instanceof fastify[symbols.kRequest].parent).toBeTruthy()\n      expect(typeof request).toBe('object')",
      "require('node:assert').ok(request instanceof fastify[symbols.kRequest].parent)\n      require('node:assert').strictEqual(typeof request, 'object')"
    );
  }
  // Tests registered after an await (the addresses of localhost) are collected in an asynchronous describe.
  out = out.replace(/^setup\(\)$/m, "describe('server', async () => {\n  await setup()\n})");
  // A test file importing another one: its tests are collected in an asynchronous describe.
  if (file === 'esm/index.test.js') {
    out = out.replace(
      /import\('\.\/named-exports\.mjs'\)[\s\S]*$/,
      "describe('esm', async () => {\n  await import('./named-exports.mjs')\n})\n"
    );
  }
  if (file === 'esm/named-exports.mjs')
    out = out.replace("import { fastify } from '@xufa/http'", "import { xufa as fastify } from '@xufa/http'");
  // node:test runs each file in a process; vyntra runs files one after the other in a worker: the subscriptions
  // to diagnostics channels of a test must not stay for the next files.
  if (out.includes('diagnostics.subscribe(')) {
    out = out.replace(/diagnostics\.subscribe\(/g, 'subscribeForTest(');
    out = out.replace(
      /^(const diagnostics = require\('node:diagnostics_channel'\);?)$/m,
      '$1\n\nconst subscriptions = []\nfunction subscribeForTest (name, fn) {\n  subscriptions.push([name, fn])\n  diagnostics.subscribe(name, fn)\n}\nafterEach(() => {\n  for (const [name, fn] of subscriptions.splice(0)) diagnostics.unsubscribe(name, fn)\n})'
    );
  }
  // The range of versions a plugin needs is of xufa versions; the root plugin is xufa.
  if (/^plugin\.\d\.test\.js$/.test(file)) {
    out = out.replace(/(plugin-meta'\)\] = \{[^}]*?)\bfastify: /g, '$1xufa: ');
    out = out.replace(/hasPlugin\('fastify'\)/g, "hasPlugin('xufa')");
  }
  for (const name of SKIPPED_TESTS[file] || []) {
    const quoted = `'${name.replace(/'/g, "\\'")}'`;
    out = out.split(`test(${quoted}`).join(`// Not applicable to xufa (see port-fastify.js)\ntest.skip(${quoted}`);
  }
  return out;
}

// require('@xufa/http') from the tests, as a path to the package: under test/ (a package.json of its own, for
// CommonJS) Node does not find the package by its name.
function packageRoot(dir) {
  for (let at = dir; ; at = path.dirname(at)) {
    const file = path.join(at, 'package.json');
    if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).name === '@xufa/http') return at;
    if (path.dirname(at) === at) return null;
  }
}

function requireByPath(code, target) {
  const root = packageRoot(path.dirname(path.resolve(target)));
  if (!root) return code;
  const rel =
    path
      .relative(path.dirname(path.resolve(target)), root)
      .split(path.sep)
      .join('/') || '.';
  return code.replace(
    /require\((['"])@xufa\/http(\/[^'"]+)?\1\)/g,
    (all, quote, sub = '') => `require('${rel}${sub}')`
  );
}

function port(input, output, filter) {
  let todos = 0;
  const walk = (dir, rel) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const relPath = path.join(rel, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name) && entry.name !== 'node_modules') walk(abs, relPath);
        continue;
      }
      if (filter && !filter.test(relPath.replace(/\\/g, '/'))) continue;
      const target = path.join(output, relPath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (!/\.(c|m)?js$/.test(entry.name)) {
        fs.copyFileSync(abs, target);
        continue;
      }
      let code = fs.readFileSync(abs, 'utf8');
      if (/node:test|t\.assert/.test(code)) {
        try {
          const result = convert(code, relPath);
          code = result.code;
          if (result.todos.length) {
            todos += result.todos.length;
            process.stdout.write(`${relPath}: ${[...new Set(result.todos)].join('; ')}\n`);
          }
        } catch (err) {
          process.stdout.write(`${relPath}: FAILED ${err.message}\n`);
        }
      }
      code = rewriteRequires(code);
      for (const [pattern, replacement] of RENAMES) code = code.replace(pattern, replacement);
      code = fixFile(relPath, code);
      code = requireByPath(code, target);
      fs.writeFileSync(target, code);
    }
  };
  walk(input, '');
  process.stdout.write(`${todos} TODOs\n`);
}

const [input, output, filter] = process.argv.slice(2);
port(input, output, filter ? new RegExp(filter) : null);
