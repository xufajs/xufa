/* eslint-disable no-console */
// Conformance of @xufa/schema and ajv with the JSON-Schema-Test-Suite of draft-04 and draft-06 (the other drafts are
// measured by isolated.js, with every validator): the tests each one passes. Writes results/schema/legacy.json, which
// the pages of the benchmarks read.
//
//   node schema/legacy.js
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const AjvDraft04 = require('ajv-draft-04');
const draft06MetaSchema = require('ajv/dist/refs/json-schema-draft-06.json');
const { compileJsonSchema } = require('@xufa/schema');
const { evaluate, loadGroups, loadRemotes } = require('./lib/suite');

const RESULTS = require('./lib/results');
const clone = (x) => JSON.parse(JSON.stringify(x));

function conformance(draft, option) {
  const remotes = loadRemotes(draft);
  const groups = loadGroups(draft);
  const ours = {
    name: '@xufa/schema',
    compile: (schema) => {
      const fn = compileJsonSchema(clone(schema), { schemas: clone(remotes), draft: option });
      return (data) => fn(data).length === 0;
    },
  };
  const ajv = {
    name: 'ajv',
    compile: (schema) => {
      const instance = draft === 'draft4' ? new AjvDraft04({ strict: false }) : new Ajv({ strict: false });
      if (draft === 'draft6') instance.addMetaSchema(draft06MetaSchema);
      Object.entries(remotes)
        .filter(([uri]) => !uri.startsWith('http://json-schema.org/') && !uri.startsWith('https://json-schema.org/'))
        .forEach(([uri, remote]) => instance.addSchema(clone(remote), uri));
      return instance.compile(clone(schema));
    },
  };
  const total = groups.reduce((n, g) => n + g.tests.length, 0);
  return { total, ours: evaluate(ours, groups, remotes).testsOk, ajv: evaluate(ajv, groups, remotes).testsOk };
}

const out = { draft4: conformance('draft4', 'draft-04'), draft6: conformance('draft6', 'draft-06') };
fs.mkdirSync(RESULTS, { recursive: true });
fs.writeFileSync(path.join(RESULTS, 'legacy.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(out);
