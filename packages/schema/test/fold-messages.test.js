// The option foldMessages: the parts of messages known when compiling are written as one literal in the generated
// code ("lines.sku must be a string"), instead of joined when an error is made. The same errors, in every mode, from
// JSON Schemas, from the builder of types and as standalone code; only the code is different.
const vm = require('node:vm');
const { compileJsonSchema, standaloneJsonSchema, Schema, String, Integer, ArrayOf } = require('..');

const order = {
  type: 'object',
  properties: {
    id: { type: 'integer', minimum: 1 },
    customer: {
      type: 'object',
      properties: { email: { type: 'string', format: 'email' }, name: { type: 'string', minLength: 1 } },
      required: ['email', 'name'],
      additionalProperties: false,
    },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: { sku: { type: 'string' }, qty: { type: 'integer', minimum: 1 } },
        required: ['sku', 'qty'],
      },
    },
    tags: { type: 'object', propertyNames: { pattern: '^[a-z]+$' } },
    kind: { type: 'string', enum: ['retail', 'wholesale'] },
  },
  required: ['id', 'customer', 'lines'],
};

const invalid = [
  {},
  { id: 0, customer: { email: 'nope', extra: 1 }, lines: [{ sku: 1 }, { qty: 0 }], tags: { Bad: 1 }, kind: 'other' },
  { id: 'x', customer: null, lines: 'none' },
  42,
];

const MODES = [{}, { allErrors: false }, { errors: 'objects' }, { errors: 'objects', allErrors: false }];

describe('foldMessages', () => {
  it('JSON Schemas: the same errors in every mode', () => {
    for (const options of MODES) {
      const plain = compileJsonSchema(order, options);
      const folded = compileJsonSchema(order, { ...options, foldMessages: true });
      for (const data of invalid) expect(folded(data)).toEqual(plain(data));
    }
    expect(compileJsonSchema(order, { foldMessages: true })(invalid[1])).toContain('customer.name is mandatory');
  });

  it('the builder of types: the same errors', () => {
    const schema = new Schema({
      title: String({ minLength: 1 }),
      pages: Integer({ min: 1 }),
      chapters: ArrayOf(new Schema({ name: String(), page: Integer() })),
    });
    const value = { title: '', pages: 0, chapters: [{ name: 1 }, {}] };
    for (const options of MODES) {
      expect(schema.compile({ ...options, foldMessages: true })(value)).toEqual(schema.compile(options)(value));
    }
  });

  it('standalone code: the messages written as one literal, and the same errors', () => {
    const plain = standaloneJsonSchema(order);
    const folded = standaloneJsonSchema(order, { foldMessages: true });
    expect(folded).toContain('"customer.email is mandatory"');
    expect(plain).not.toContain('"customer.email is mandatory"');
    const load = (code) => {
      const module = { exports: {} };
      vm.runInNewContext(`(function (module, exports) {\n${code}\n})`, {})(module, module.exports);
      return module.exports;
    };
    for (const data of invalid) {
      expect(JSON.stringify(load(folded)(data))).toBe(JSON.stringify(load(plain)(data)));
    }
  });

  it('is true or false; with errors: false it changes nothing', () => {
    expect(() => compileJsonSchema(order, { foldMessages: 'yes' })).toThrow(
      'Unsupported option "foldMessages": "yes" is not true or false'
    );
    const check = compileJsonSchema(order, { errors: false, foldMessages: true });
    expect(invalid.map((data) => check(data))).toEqual([false, false, false, false]);
  });
});
