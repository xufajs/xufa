// The JSON-Schema-Test-Suite (json-schema-org, pinned to a commit in package.json): every test of draft-04, draft-06,
// draft-07, 2019-09 and 2020-12, compiled (compileJsonSchema) and as standalone code (standaloneJsonSchema, run where
// code generation is forbidden), and the optional tests of "format" (formats: true) of draft-07, 2019-09 and 2020-12.
// A test group is a test here; a failure lists the tests of the group schiva gets wrong.
//
// The documents the tests reference are the remotes of the suite (served at http://localhost:1234/ by its runner) and
// the meta-schemas of the draft, which ajv's packages ship.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { compileJsonSchema, standaloneJsonSchema } = require('../src');

const SUITE = path.dirname(require.resolve('json-schema-test-suite/package.json'));

// Each draft: its folder in the suite, the draft option (the schemas of draft-04 and draft-06 have no $schema), and
// its meta-schemas.
const DRAFTS = {
  draft4: { option: 'draft-04', meta: ['ajv-draft-04/dist/refs/json-schema-draft-04.json'] },
  draft6: { option: 'draft-06', meta: ['ajv/dist/refs/json-schema-draft-06.json'] },
  draft7: { meta: ['ajv/dist/refs/json-schema-draft-07.json'], formats: true },
  'draft2019-09': { meta: 'ajv/dist/refs/json-schema-2019-09', formats: true },
  'draft2020-12': { meta: 'ajv/dist/refs/json-schema-2020-12', formats: true },
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function metaSchemas(draft) {
  const { meta } = DRAFTS[draft];
  const files = Array.isArray(meta)
    ? meta.map((file) => require.resolve(file))
    : walk(path.dirname(require.resolve(`${meta}/schema.json`))).filter((file) => file.endsWith('.json'));
  return files.map(readJson);
}

// The remotes of the suite for a draft (not those of the folders of other drafts), and its meta-schemas by their $id.
function remotesOf(draft) {
  const dir = path.join(SUITE, 'remotes');
  const others = ['draft3', 'draft4', 'draft6', 'draft-next', 'v1', ...Object.keys(DRAFTS)].filter((d) => d !== draft);
  const skip = new RegExp(`^(${others.join('|')})/`);
  const remotes = {};
  for (const file of walk(dir)) {
    const name = path.relative(dir, file).split(path.sep).join('/');
    if (name.endsWith('.json') && !skip.test(name)) remotes[`http://localhost:1234/${name}`] = readJson(file);
  }
  for (const schema of metaSchemas(draft)) remotes[(schema.$id || schema.id).replace(/#$/, '')] = schema;
  return remotes;
}

// The groups of the tests of a draft (or of its optional format tests), by file.
function filesOf(draft, folder = '') {
  const dir = path.join(SUITE, 'tests', draft, folder);
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ file, groups: readJson(path.join(dir, file)) }));
}

// Standalone code run where code generation from strings throws (the data made there too, so objects compare as they
// do when the data and the validator share one).
const sandbox = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
const parseInSandbox = vm.runInContext('JSON.parse', sandbox);
function loadStandalone(code) {
  const module = { exports: {} };
  vm.runInContext(`(function (module, exports) {\n${code}\n})`, sandbox)(module, module.exports);
  return (data) => module.exports(data === undefined ? undefined : parseInSandbox(JSON.stringify(data)));
}

// The descriptions of the tests of a group that a validator gets wrong (or 'compile: <error>').
function wrongOf(group, compile) {
  let fn;
  try {
    fn = compile(group.schema);
  } catch (err) {
    return [`compile: ${err.message}`];
  }
  return group.tests
    .filter((test) => {
      try {
        return (fn(test.data).length === 0) !== test.valid;
      } catch {
        return true;
      }
    })
    .map((test) => test.description);
}

const MODES = {
  compiled: (schema, options) => compileJsonSchema(clone(schema), options),
  standalone: (schema, options) => loadStandalone(standaloneJsonSchema(clone(schema), options)),
};

for (const [draft, { option, formats }] of Object.entries(DRAFTS)) {
  const remotes = remotesOf(draft);
  const options = (extra = {}) => ({ schemas: clone(remotes), draft: option, ...extra });

  for (const [mode, compile] of Object.entries(MODES)) {
    describe(`JSON-Schema-Test-Suite ${draft} (${mode})`, () => {
      for (const { file, groups } of filesOf(draft)) {
        describe(file, () => {
          groups.forEach((group, i) => {
            it(`${i + 1}. ${group.description}`, () => {
              expect(wrongOf(group, (schema) => compile(schema, options()))).toEqual([]);
            });
          });
        });
      }
    });
  }

  // The optional tests of format: unknown formats are annotations there (strict mode would throw on them).
  if (formats) {
    describe(`JSON-Schema-Test-Suite ${draft} (optional format, formats: true)`, () => {
      for (const { file, groups } of filesOf(draft, 'optional/format')) {
        describe(file, () => {
          groups.forEach((group, i) => {
            it(`${i + 1}. ${group.description}`, () => {
              const compile = (schema) => MODES.compiled(schema, options({ formats: true, strict: false }));
              expect(wrongOf(group, compile)).toEqual([]);
            });
          });
        });
      }
    });
  }
}

describe('JSON-Schema-Test-Suite: the counts of the README', () => {
  const count = (draft, folder) =>
    filesOf(draft, folder).reduce((n, { groups }) => n + groups.reduce((m, group) => m + group.tests.length, 0), 0);
  it('has the number of tests the README says', () => {
    expect({
      draft4: count('draft4'),
      draft6: count('draft6'),
      draft7: count('draft7'),
      '2019-09': count('draft2019-09'),
      '2020-12': count('draft2020-12'),
      formats7: count('draft7', 'optional/format'),
      formats2019: count('draft2019-09', 'optional/format'),
      formats2020: count('draft2020-12', 'optional/format'),
    }).toEqual({
      draft4: 618,
      draft6: 841,
      draft7: 929,
      '2019-09': 1261,
      '2020-12': 1301,
      formats7: 793,
      formats2019: 874,
      formats2020: 874,
    });
  });
});
