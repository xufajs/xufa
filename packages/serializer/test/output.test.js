// The two outputs of the generated code (see Builder#lit() in index.js): strings joined with +, and bytes written to
// the buffer of lib/writer.js. These tests are of @xufa/serializer, not ported from fast-json-stringify.
import build from '../index.js';

const itemSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    price: { type: 'number' },
    available: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
  },
};
const listSchema = { type: 'array', items: itemSchema };

const strings = [
  '',
  'plain',
  'quote " and backslash \\',
  'controls \n\t\r\b\f\x00\x1f',
  'latin éñ, euro €, han 中',
  'emoji 😀',
  'lone \ud83d and \ude00 surrogates',
  'line separators   ',
  'long '.repeat(40),
  `long with escapes "${'x'.repeat(80)}"\n`,
];

describe('outputs', () => {
  for (const output of ['string', 'bytes', 'auto']) {
    test(`${output}: writes what JSON.stringify writes`, () => {
      const serialize = build(listSchema, { output });
      const items = strings.map((name, id) => ({ id, name, price: id / 3, available: id % 2 === 0, tags: [name] }));
      expect(serialize(items)).toBe(JSON.stringify(items));
    });

    test(`${output}: writes optional properties, nulls and empty arrays`, () => {
      const serialize = build(listSchema, { output });
      const items = [{}, { id: 1 }, { tags: [] }, { tags: null, name: 'x' }];
      expect(JSON.parse(serialize(items))).toEqual([{}, { id: 1 }, { tags: [] }, { name: 'x', tags: [] }]);
    });
  }

  test('auto picks strings for values of a known size and bytes for the others', () => {
    const small = build(itemSchema.properties.tags.items, { mode: 'debug' }).code;
    const object = build({ type: 'object', properties: { a: { type: 'string' } } }, { mode: 'debug' }).code;
    const list = build(listSchema, { mode: 'debug' }).code;
    expect(small).toContain('let json');
    expect(object).toContain('let json');
    expect(list).toContain('begin()');
  });

  test('throws on an unknown output', () => {
    expect(() => build(listSchema, { output: 'buffer' })).toThrow('Unsupported output buffer');
  });
});

describe('bytes output', () => {
  test('a serializer called while another one writes (by toJSON) writes its own JSON', () => {
    const inner = build(listSchema, { output: 'bytes' });
    const outer = build(
      { type: 'object', properties: { label: { type: 'string' }, nested: { type: 'string' }, tail: { type: 'string' } } },
      { output: 'bytes' }
    );
    // The value of "nested" is made by the other serializer while this one writes.
    const nested = {
      toString() {
        return inner([{ id: 7, name: 'inner' }]);
      },
    };
    const json = outer({ label: 'before', nested, tail: 'after' });
    expect(JSON.parse(json)).toEqual({ label: 'before', nested: '[{"id":7,"name":"inner"}]', tail: 'after' });
  });

  test('a serializer that throws leaves the buffer as it was', () => {
    const serialize = build(listSchema, { output: 'bytes' });
    expect(() => serialize([{ id: 1, tags: 'not an array' }])).toThrow('does not match schema definition');
    expect(serialize([{ id: 2 }])).toBe('[{"id":2}]');
  });

  test('writes values larger than the buffer it starts with', () => {
    const serialize = build(listSchema, { output: 'bytes' });
    const items = Array.from({ length: 3000 }, (_, id) => ({ id, name: `item ${id} €`, tags: ['a'.repeat(30)] }));
    expect(serialize(items)).toBe(JSON.stringify(items));
    // And small ones after it.
    expect(serialize([{ id: 1 }])).toBe('[{"id":1}]');
  });

  test('writes numbers as asNumber and asInteger do', () => {
    const serialize = build(
      { type: 'array', items: { type: 'object', properties: { n: { type: 'number' }, i: { type: 'integer' } } } },
      { output: 'bytes' }
    );
    expect(serialize([{ n: 1.5, i: 2.7 }, { n: '3', i: '4' }, { n: Infinity, i: 10n }])).toBe(
      '[{"n":1.5,"i":2},{"n":3,"i":4},{"n":null,"i":10}]'
    );
    expect(() => serialize([{ n: 'x' }])).toThrow('cannot be converted to a number');
  });
});

describe('toBuffer', () => {
  test('gives the UTF-8 bytes of the JSON, in a buffer of their own', () => {
    const serialize = build({ type: 'array', items: { type: 'string' } }, { output: 'bytes' });
    const first = serialize.toBuffer(['€', 'a']);
    const second = serialize.toBuffer(['b']);
    expect(Buffer.isBuffer(first)).toBe(true);
    expect(first.toString()).toBe('["€","a"]');
    expect(second.toString()).toBe('["b"]');
  });

  test('is only given by serializers that write bytes', () => {
    expect(build({ type: 'object', properties: { a: { type: 'string' } } }).toBuffer).toBe(undefined);
    expect(typeof build({ type: 'array', items: { type: 'string' } }).toBuffer).toBe('function');
  });
});
