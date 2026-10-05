'use strict';

// YAML as @fastify/swagger uses the package yaml (parse and stringify), with @xufa/yaml (js-yaml). Parsed with the
// core schema of YAML 1.2 and merge keys: dates of OpenAPI documents (examples, format: date) stay strings, as yaml
// leaves them; js-yaml's default schema would make them Dates.
const yaml = require('@xufa/yaml');

const SCHEMA = yaml.CORE_SCHEMA.extend({ implicit: [yaml.types.merge] });

function parse(text) {
  return yaml.load(text, { schema: SCHEMA });
}

// Written as yaml writes it: in full (no references &a / *a for objects used twice), lines not folded, and double
// quotes where a string needs them.
function stringify(value) {
  return yaml.dump(value, { schema: SCHEMA, noRefs: true, lineWidth: -1, quotingType: '"' });
}

module.exports = { parse, stringify };
