// @xufa/marshal: values as JSON that keeps classes, references, cycles and the types JSON does not have.
const { marshal, unmarshal, stringify, parse } = require('./lib/marshal');
const { clone } = require('./lib/clone');
const { Registry, registry, ENCODE, DECODE } = require('./lib/registry');
const { MarshalError } = require('./lib/errors');

module.exports = { marshal, unmarshal, stringify, parse, clone, Registry, registry, ENCODE, DECODE, MarshalError };
