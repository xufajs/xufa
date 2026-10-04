// The default serializer compiler: @xufa/serializer with the shared schemas, one compiler per set of schemas and
// options (what @fastify/fast-json-stringify-compiler gives fastify).
const build = require('@xufa/serializer');

function SerializerSelector() {
  return function buildSerializerFactory(externalSchemas, serializerOpts) {
    const options = { ...serializerOpts, schema: externalSchemas };
    return function responseSchemaCompiler({ schema }) {
      return build(schema, options);
    };
  };
}

module.exports = { SerializerSelector };
