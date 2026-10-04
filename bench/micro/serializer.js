// @xufa/serializer against fast-json-stringify and JSON.stringify. Each serializer and case runs in a process of its
// own. node bench/micro/serializer.js [iterations] [rounds]
const { execFileSync } = require('node:child_process');

const item = (i) => ({
  id: i,
  name: `Item number ${i}`,
  price: Math.round(i * 137.17) / 100,
  available: i % 3 !== 0,
  tags: ['alpha', 'beta', `tag-${i % 7}`],
  owner: { id: i % 10, name: `Owner "${i % 10}"` },
});

const itemSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    price: { type: 'number' },
    available: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
    owner: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } },
  },
};

const cases = {
  'hello world': {
    schema: { type: 'object', properties: { hello: { type: 'string' } } },
    data: { hello: 'world' },
  },
  'object, 6 props': { schema: itemSchema, data: item(7) },
  'array of 100 objects': {
    schema: { type: 'object', properties: { total: { type: 'integer' }, items: { type: 'array', items: itemSchema } } },
    data: { total: 100, items: Array.from({ length: 100 }, (_, i) => item(i)) },
  },
  'required + nullable + date': {
    schema: {
      type: 'object',
      required: ['id', 'createdAt'],
      properties: {
        id: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        deletedAt: { type: ['string', 'null'] },
        score: { type: 'number', nullable: true },
      },
    },
    data: { id: 'abc', createdAt: new Date(0), deletedAt: null, score: null },
  },
  'long string with escapes': {
    schema: { type: 'object', properties: { text: { type: 'string' } } },
    data: { text: `${'Lorem ipsum "dolor" sit amet, \\ consectetur adipiscing elit. '.repeat(40)}\n` },
  },
  anyOf: {
    schema: {
      type: 'object',
      properties: {
        value: { anyOf: [{ type: 'string' }, { type: 'object', properties: { n: { type: 'integer' } } }] },
      },
    },
    data: { value: { n: 3, extra: true } },
  },
  'recursive $ref tree': {
    schema: {
      definitions: {
        node: {
          type: 'object',
          properties: { id: { type: 'integer' }, children: { type: 'array', items: { $ref: '#/definitions/node' } } },
        },
      },
      $ref: '#/definitions/node',
    },
    data: {
      id: 1,
      children: [
        { id: 2, children: [{ id: 3, children: [] }] },
        { id: 4, children: [] },
      ],
    },
  },
};

const serializers = {
  'JSON.stringify': () => (data) => JSON.stringify(data),
  'fast-json-stringify': (schema) => require('fast-json-stringify')(schema),
  '@xufa/serializer': (schema) => require('@xufa/serializer')(schema),
};

function child(serializerName, caseName, iterations) {
  const { schema, data } = cases[caseName];
  const serialize = serializers[serializerName](schema);
  let length = 0;
  // Measured as a response uses it: its byte length (which makes V8 flatten a string joined with +).
  const run = (n) => {
    for (let i = 0; i < n; i += 1) length += Buffer.byteLength(serialize(data));
  };
  run(Math.min(100000, iterations));
  const start = process.hrtime.bigint();
  run(iterations);
  const ops = (iterations / Number(process.hrtime.bigint() - start)) * 1e9;
  process.stdout.write(`${ops} ${length}`);
}

function main() {
  const iterations = Number(process.argv[2]) || 1000000;
  const rounds = Number(process.argv[3]) || 3;
  const names = Object.keys(serializers);
  const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${(n / 1e3).toFixed(1)}K`);
  process.stdout.write(
    `| Case | ${names.map((n) => `${n} ops/s`).join(' | ')} | xufa vs fjs | xufa vs JSON.stringify |\n`
  );
  process.stdout.write(`| --- | ${names.map(() => '---:').join(' | ')} | ---: | ---: |\n`);
  for (const caseName of Object.keys(cases)) {
    const ops = {};
    const n = caseName.startsWith('array') || caseName.startsWith('long') ? Math.ceil(iterations / 20) : iterations;
    for (let round = 0; round < rounds; round += 1) {
      for (const name of names) {
        const out = String(execFileSync(process.execPath, [__filename, '--child', name, caseName, String(n)]));
        ops[name] = Math.max(ops[name] || 0, Number(out.split(' ')[0]));
      }
    }
    process.stdout.write(
      `| ${caseName} | ${names.map((name) => fmt(ops[name])).join(' | ')} | ` +
        `${(ops['@xufa/serializer'] / ops['fast-json-stringify']).toFixed(2)}x | ` +
        `${(ops['@xufa/serializer'] / ops['JSON.stringify']).toFixed(2)}x |\n`
    );
  }
}

if (process.argv[2] === '--child') child(process.argv[3], process.argv[4], Number(process.argv[5]));
else main();
