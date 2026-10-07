// $merge and $patch (as ajv-merge-patch): a schema made from a source and a JSON Merge Patch (RFC 7386) or a JSON
// Patch (RFC 6902) when the schema is compiled; its source inline or by a $ref (a schema of the option schemas, the
// document, a JSON Pointer); and standalone code of them.
const vm = require('node:vm');
const { compileJsonSchema, standaloneJsonSchema } = require('..');
const { mergePatch, applyPatch } = require('../lib/merge-patch');

const obj = {
  $id: 'obj.json#',
  type: 'object',
  properties: { p: { type: 'string' } },
  additionalProperties: false,
};

describe('$merge', () => {
  it('a source by its $ref, merged with more properties (the README of ajv-merge-patch)', () => {
    const validate = compileJsonSchema(
      { $merge: { source: { $ref: 'obj.json#' }, with: { properties: { q: { type: 'number' } } } } },
      { schemas: [obj] }
    );
    expect(validate({ p: 'abc', q: 1 })).toEqual([]);
    expect(validate({ p: 'foo', q: 'bar' })).toEqual(['q must be a number']);
    expect(validate({ p: 'a', r: 1 })).toEqual(['Unexpected key: r']);
  });

  it('an inline source; null removes a key; arrays are replaced; a pointer in the document', () => {
    const validate = compileJsonSchema({
      definitions: { base: { type: 'object', properties: { a: { type: 'integer' }, b: { type: 'string' } }, required: ['a', 'b'] } },
      $merge: { source: { $ref: '#/definitions/base' }, with: { properties: { b: null }, required: ['a'] } },
    });
    expect(validate({ a: 1 })).toEqual([]);
    expect(validate({ a: 1, b: 2 })).toEqual([]); // b is not checked any more
    expect(validate({})).toEqual(['a is mandatory']);
  });

  it('a source made by $merge too, and $merge inside a schema', () => {
    const validate = compileJsonSchema(
      {
        type: 'object',
        properties: {
          item: {
            $merge: {
              source: { $merge: { source: { $ref: 'obj.json#' }, with: { required: ['p'] } } },
              with: { properties: { n: { type: 'integer' } } },
            },
          },
        },
      },
      { schemas: [obj] }
    );
    expect(validate({ item: { p: 'x', n: 1 } })).toEqual([]);
    expect(validate({ item: { n: 1 } })).toEqual(['item.p is mandatory']);
  });
});

describe('$patch', () => {
  it('JSON Patch operations on the source: add (and - of arrays), replace, remove, copy, move, test', () => {
    const validate = compileJsonSchema(
      {
        $patch: {
          source: { $ref: 'obj.json#' },
          with: [
            { op: 'test', path: '/additionalProperties', value: false },
            { op: 'add', path: '/properties/q', value: { type: 'number' } },
            { op: 'add', path: '/required', value: ['p'] },
            { op: 'add', path: '/required/-', value: 'q' },
            { op: 'replace', path: '/properties/p', value: { type: 'string', minLength: 2 } },
            { op: 'copy', from: '/properties/q', path: '/properties/r' },
            { op: 'move', from: '/properties/r', path: '/properties/s' },
            { op: 'remove', path: '/additionalProperties' },
          ],
        },
      },
      { schemas: [obj] }
    );
    expect(validate({ p: 'ab', q: 1, s: 2, extra: true })).toEqual([]);
    expect(validate({ p: 'a' })).toEqual(['p must be at least 2 characters long', 'q is mandatory']);
    expect(validate({ p: 'ab', q: 1, s: 'x' })).toEqual(['s must be a number']);
  });

  it('a test that fails, an operation unknown, a path not there: errors that say where', () => {
    const compile = (operations) => () =>
      compileJsonSchema({ $patch: { source: { $ref: 'obj.json#' }, with: operations } }, { schemas: [obj] });
    expect(compile([{ op: 'test', path: '/type', value: 'array' }])).toThrow(/the test of \/type failed/);
    expect(compile([{ op: 'append', path: '/x', value: 1 }])).toThrow(/append is not an operation of JSON Patch/);
    expect(compile([{ op: 'replace', path: '/nope', value: 1 }])).toThrow(/no \/nope to replace/);
    expect(compile({ op: 'add' })).toThrow(/"with" is a list of operations/);
  });
});

describe('$merge and $patch: errors and standalone code', () => {
  it('a source that is not there, and a $merge without source or with', () => {
    expect(() => compileJsonSchema({ $merge: { source: { $ref: 'missing.json#' }, with: {} } })).toThrow(
      'the source of $merge (missing.json#) is not there'
    );
    expect(() => compileJsonSchema({ $merge: { with: {} } })).toThrow('$merge is { source, with }');
  });

  it('standalone code of a merged schema validates as the compiled one', () => {
    const schema = { $merge: { source: { $ref: 'obj.json#' }, with: { required: ['p'] } } };
    const code = standaloneJsonSchema(schema, { schemas: [obj] });
    const module = { exports: {} };
    vm.runInNewContext(`(function (module, exports) {\n${code}\n})`, {})(module, module.exports);
    for (const value of [{ p: 'a' }, {}, { p: 1 }, { p: 'a', x: 1 }]) {
      expect(JSON.stringify(module.exports(value))).toBe(JSON.stringify(compileJsonSchema(schema, { schemas: [obj] })(value)));
    }
  });

  it('mergePatch and applyPatch by themselves (RFC 7386 and RFC 6902)', () => {
    expect(mergePatch({ a: 'b', c: { d: 'e', f: 'g' } }, { a: 'z', c: { f: null } })).toEqual({ a: 'z', c: { d: 'e' } });
    expect(mergePatch({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
    const source = { a: [1, 2] };
    expect(applyPatch(source, [{ op: 'add', path: '/a/1', value: 9 }], 'x')).toEqual({ a: [1, 9, 2] });
    expect(source).toEqual({ a: [1, 2] }); // the source is not changed
  });
});
