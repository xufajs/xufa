# @xufa/serializer

JSON serializers compiled from JSON Schema, with the output of
[fast-json-stringify](https://github.com/fastify/fast-json-stringify), and no dependencies. It writes the responses
of [xufa](../xufa), and works on its own.

```js
const build = require('@xufa/serializer');

const stringify = build({
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
  },
});

stringify({ id: 1, name: 'Ada', tags: ['a'], password: 'x' }); // '{"id":1,"name":"Ada","tags":["a"]}'
```

Only the properties of the schema are written (no data leaks), each value as its type: `"7"` for an integer is
written `7`, a `Date` for a string its ISO text.

## Same as fast-json-stringify

The schemas (`$ref`, `$defs`/`definitions`, external schemas in `options.schema`, `allOf`, `anyOf`, `oneOf`,
`if`/`then`/`else`, `nullable`, `const`, `enum`, `additionalProperties`, `patternProperties`, `required`, defaults,
the formats `date-time`, `date`, `time` and `unsafe`, `toJSON()`) and the options `rounding`, `largeArraySize`,
`largeArrayMechanism`, `ajv.coerceTypes` and `mode: 'debug'` (which gives `{ code }`). It passes fast-json-stringify's
test suite.

The branches of `anyOf`, `oneOf` and `if` are chosen by predicates compiled from their schemas, not by ajv.

## What is different

### Two outputs

A serializer joins the JSON with `+` (a string), or writes it as UTF-8 bytes to a buffer it shares with the other
serializers and reads it back at the end. Joined strings are a tree of pieces that V8 copies into one string before
it can be written to a socket; for large values that copy costs about as much as making the JSON. Bytes have no such
copy, but reading them back costs more than a small string. So:

- `output: 'auto'` (the default) writes bytes when the size is unknown (arrays, maps, recursion), strings otherwise;
- `output: 'string'` or `output: 'bytes'` choose.

Serializers that write bytes also have `toBuffer(value)`, which gives the bytes in a Buffer of their own (xufa sends
it as it is):

```js
const list = build({ type: 'array', items: { type: 'object', properties: { id: { type: 'integer' } } } });
list.toBuffer([{ id: 1 }]); // <Buffer 5b 7b 22 69 64 22 3a 31 7d 5d>
```

### Not supported

- `mode: 'standalone'` and `restore()`.
- An ajv instance: `options.ajv` only gives `coerceTypes`.

## Benchmark

`node bench/micro/serializer.js` (from the root of the repository) compares it with fast-json-stringify and
`JSON.stringify`, as a response uses them: with `Buffer.byteLength()` of what they return.

## TypeScript

fast-json-stringify's declarations, with `output` and `toBuffer`.

## License

MIT. The declarations are ported from fast-json-stringify (MIT).
