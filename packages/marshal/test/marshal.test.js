import { marshal, unmarshal, stringify, parse, clone, Registry, ENCODE, DECODE, MarshalError } from '../index.js';

const roundTrip = (value, options) => parse(stringify(value, options), options);

class Point {
  constructor(x, y) {
    if (x === undefined) throw new Error('the constructor of Point must not be called by unmarshal');
    this.x = x;
    this.y = y;
  }

  norm() {
    return Math.hypot(this.x, this.y);
  }
}

class Point3 extends Point {
  constructor(x, y, z) {
    super(x, y);
    this.z = z;
  }
}

// State in a private field: written by encode, made again by decode.
class Money {
  #cents;

  constructor(cents, currency) {
    this.#cents = cents;
    this.currency = currency;
  }

  get cents() {
    return this.#cents;
  }

  static [ENCODE](money) {
    return [money.#cents, money.currency];
  }

  static [DECODE]([cents, currency]) {
    return new Money(cents, currency);
  }
}

class NotFound extends Error {
  constructor(what) {
    super(`${what} not found`);
    this.name = 'NotFound';
    this.what = what;
  }
}

const registry = new Registry().register(Point, Point3, Money, NotFound);
const opts = { registry };

describe('values JSON cannot say', () => {
  it('primitives: undefined, NaN, the infinities, -0, BigInt, global symbols', () => {
    for (const value of [undefined, NaN, Infinity, -Infinity, 0, 42, -1.5, '', 'text', true, false, null, 10n, -(2n ** 70n)]) {
      expect(Object.is(roundTrip(value), value)).toBe(true);
    }
    expect(Object.is(roundTrip(-0), -0)).toBe(true);
    expect(roundTrip(Symbol.for('app'))).toBe(Symbol.for('app'));
    expect(() => stringify(Symbol('local'))).toThrow(MarshalError);
  });

  it('arrays keep holes and undefined', () => {
    const back = roundTrip([1, , undefined, NaN]); // eslint-disable-line no-sparse-arrays
    expect(back.length).toBe(4);
    expect(1 in back).toBe(false);
    expect(2 in back).toBe(true);
    expect(back[2]).toBeUndefined();
    expect(back[3]).toBeNaN();
  });

  it('Date (and invalid ones), RegExp with flags, Map, Set', () => {
    const value = {
      date: new Date('2026-10-05T10:00:00.123Z'),
      invalid: new Date('nope'),
      regexp: /ab+c/gimsuy,
      map: new Map([
        [{ id: 1 }, 'object key'],
        [NaN, new Set([1, 'two', undefined])],
      ]),
    };
    const back = roundTrip(value);
    expect(back.date).toEqual(value.date);
    expect(Number.isNaN(back.invalid.getTime())).toBe(true);
    expect(back.regexp.source).toBe('ab+c');
    expect(back.regexp.flags).toBe('gimsuy');
    expect([...back.map.keys()][0]).toEqual({ id: 1 });
    expect(back.map.get(NaN)).toEqual(new Set([1, 'two', undefined]));
  });

  it('bytes: Buffer, every typed array, ArrayBuffer, DataView', () => {
    const value = {
      buffer: Buffer.from('héllo'),
      u8: new Uint8Array([0, 255]),
      clamped: new Uint8ClampedArray([1, 2]),
      i16: new Int16Array([-2, 3]),
      f64: new Float64Array([0.1, -Infinity]),
      big: new BigInt64Array([-(2n ** 63n)]),
      slice: new Uint32Array(new Uint32Array([1, 2, 3, 4]).buffer, 4, 2),
      raw: new Uint8Array([9, 8]).buffer,
      view: new DataView(new Uint8Array([7, 6, 5]).buffer, 1),
    };
    const back = roundTrip(value);
    expect(Buffer.isBuffer(back.buffer)).toBe(true);
    expect(back.buffer.toString()).toBe('héllo');
    for (const key of ['u8', 'clamped', 'i16', 'f64', 'big', 'slice']) {
      expect(back[key].constructor).toBe(value[key].constructor);
      expect([...back[key]]).toEqual([...value[key]]);
    }
    expect(back.slice.length).toBe(2);
    expect(new Uint8Array(back.raw)).toEqual(new Uint8Array([9, 8]));
    expect([back.view.getUint8(0), back.view.byteLength]).toEqual([6, 2]);
  });

  it('errors: class, message, stack, cause, fields, AggregateError', () => {
    const inner = new RangeError('inner');
    const error = Object.assign(new TypeError('outer', { cause: inner }), { code: 'E_OUTER', status: 400 });
    const back = roundTrip(error);
    expect(back).toBeInstanceOf(TypeError);
    expect(back.message).toBe('outer');
    expect(back.stack).toBe(error.stack);
    expect(back.code).toBe('E_OUTER');
    expect(back.cause).toBeInstanceOf(RangeError);
    expect(Object.keys(back)).toEqual(['code', 'status']); // message, stack, cause are not enumerable, as in errors
    const aggregate = roundTrip(new AggregateError([new Error('a'), 'b'], 'many'));
    expect(aggregate).toBeInstanceOf(AggregateError);
    expect(aggregate.errors[0].message).toBe('a');
    expect(roundTrip(new Error('x'), { stack: false }).stack).toBeUndefined();
    // A custom error of no registered class: an Error, with its name.
    class Custom extends Error {}
    const custom = Object.assign(new Custom('c'), { name: 'Custom' });
    expect(roundTrip(custom).name).toBe('Custom');
  });

  it('URL, URLSearchParams, boxed primitives, objects without prototype', () => {
    const value = {
      url: new URL('https://a.b/c?d=1#e'),
      params: new URLSearchParams('a=1&a=2'),
      number: Object(5),
      string: Object('s'),
      bare: Object.assign(Object.create(null), { a: 1 }),
    };
    const back = roundTrip(value);
    expect(back.url.href).toBe('https://a.b/c?d=1#e');
    expect(back.params.getAll('a')).toEqual(['1', '2']);
    expect(back.number).toBeInstanceOf(Number);
    expect(back.string.valueOf()).toBe('s');
    expect(Object.getPrototypeOf(back.bare)).toBe(null);
    expect(back.bare.a).toBe(1);
  });
});

describe('the graph', () => {
  it('an object referenced twice is one object again, and cycles stay', () => {
    const shared = { n: 1 };
    const root = { a: shared, b: [shared], map: new Map([['k', shared]]) };
    root.self = root;
    shared.parent = root;
    const back = roundTrip(root);
    expect(back.a).toBe(back.b[0]);
    expect(back.map.get('k')).toBe(back.a);
    expect(back.self).toBe(back);
    expect(back.a.parent).toBe(back);
  });

  it('strings are written once', () => {
    const long = 'x'.repeat(1000);
    expect(stringify([long, long, long]).length).toBeLessThan(1100);
    expect(roundTrip({ a: long, b: [long], c: '¤'.repeat(100), d: '¤'.repeat(100) })).toEqual({
      a: long,
      b: [long],
      c: '¤'.repeat(100),
      d: '¤'.repeat(100),
    });
  });

  it('the format: JSON, with what JSON cannot say as marked strings and tagged arrays', () => {
    const shared = { n: 2 };
    expect(stringify({ a: shared, b: shared, at: new Date(0), tags: ['x', 'y'] })).toBe(
      '{"a":{"n":2},"b":"¤R1","at":"¤D0","tags":["x","y"]}'
    );
    expect(stringify(new Point(1, 2), opts)).toBe('{"@":"Point","x":1,"y":2}');
    expect(stringify([new Map([[1, undefined]]), -0, NaN, 2n])).toBe('[["¤Map",1,"¤u"],"¤z","¤N","¤B2"]');
  });

  it('data that looks like the format is data', () => {
    const values = [
      '¤',
      '¤D0',
      '¤R0',
      ['¤Map', 1],
      ['¤u'],
      { '@': 'Point', x: 1 },
      { '@': 1 },
      [{ '@': 'Point' }],
      Object.assign(new Point(1, 2), { '@': 'other' }),
      // Arrays whose first item is written as a marked string.
      [new Date(0), 1],
      [undefined, 1],
      [-0],
      [10n],
      [, 1], // eslint-disable-line no-sparse-arrays
    ];
    for (const value of values) {
      const back = roundTrip(value, opts);
      expect(back).toEqual(value);
      expect(Object.getPrototypeOf(back)).toBe(Object.getPrototypeOf(value));
    }
    const twice = { a: 1 };
    const back = roundTrip([twice, [twice, 2]]);
    expect(back[1][0]).toBe(back[0]);
  });

  it('arrays of instances of one class with the same fields are tables', () => {
    const points = [new Point(1, 2), new Point(3, 4)];
    expect(stringify(points, opts)).toBe('["¤Table","Point",["x","y"],1,2,3,4]');
    const back = roundTrip(points, opts);
    expect(back).toEqual(points);
    expect(back.every((point) => point instanceof Point)).toBe(true);
    expect(back[1].norm()).toBe(5);
    // Values that are no objects but Dates; a Date twice, long strings twice, constants.
    const at = new Date(7);
    const long = 'l'.repeat(80);
    const rows = [Object.assign(new Point(at, long), { z: undefined }), Object.assign(new Point(at, long), { z: NaN })];
    const rowsBack = roundTrip(rows, opts);
    expect(stringify(rows, opts).startsWith('["¤Table"')).toBe(true);
    expect(rowsBack).toEqual(rows);
    expect(rowsBack[1].x).toBe(rowsBack[0].x);
    // The table and what refers to it after.
    const both = roundTrip({ list: points, first: points[0], again: points }, opts);
    expect(both.first).toBe(both.list[0]);
    expect(both.again).toBe(both.list);
  });

  it('tables of plain objects, and rows whose values are objects (even the rows)', () => {
    const rows = [
      { id: 1, at: new Date(1), tags: ['a'] },
      { id: 2, at: new Date(2), tags: ['b'] },
    ];
    expect(stringify(rows)).toBe('["¤Table",null,["id","at","tags"],1,"¤D1",["a"],2,"¤D2",["b"]]');
    expect(roundTrip(rows)).toEqual(rows);
    // A row that refers to a later row, to itself and to the array.
    const list = [{ name: 'a' }, { name: 'b' }];
    list[0].next = list[1];
    list[1].next = list[0];
    list[0].list = list;
    list[1].list = list;
    const back = roundTrip(list);
    expect(back[0].next).toBe(back[1]);
    expect(back[1].next).toBe(back[0]);
    expect(back[0].list).toBe(back);
    // Instances whose fields are objects, shared between rows.
    const shared = { n: 1 };
    const points = roundTrip([new Point(shared, 1), new Point(shared, 2)], opts);
    expect(points[1].x).toBe(points[0].x);
    expect(points[0]).toBeInstanceOf(Point);
  });

  it('arrays that cannot be tables are written as arrays', () => {
    const p = new Point(1, 2);
    const cases = [
      [p, new Point(3, 4), p], // an instance twice
      [new Point(1, 2), Object.assign(new Point(3, 4), { z: 1 })], // other fields
      [new Point(1, 2), new Point3(1, 2, 3)], // another class
      [new Point(1, 2), null],
    ];
    for (const value of cases) {
      expect(stringify(value, opts).startsWith('["¤Table"')).toBe(false);
      const back = roundTrip(value, opts);
      expect(back).toEqual(value);
    }
    const twice = roundTrip([p, new Point(3, 4), p], opts);
    expect(twice[2]).toBe(twice[0]);
    // An instance written before the array: a reference in it.
    const before = roundTrip({ p, list: [p, new Point(3, 4)] }, opts);
    expect(before.list[0]).toBe(before.p);
    // Tables with setters on the prototype: fields defined, no setter runs.
    const calls = [];
    class Guarded {
      set role(value) {
        calls.push(value);
      }
    }
    const local = { registry: new Registry().register(Guarded) };
    const guarded = parse('["¤Table","Guarded",["role"],"a","b"]', local);
    expect(guarded.map((item) => Object.getOwnPropertyDescriptor(item, 'role').value)).toEqual(['a', 'b']);
    expect(calls).toEqual([]);
  });

  it('neither stringify() nor unmarshal() change what they are given', () => {
    const value = { at: new Date(5), list: ['¤x', { y: undefined }], n: 1n };
    const before = structuredClone(value);
    const text = stringify(value);
    expect(value).toEqual(before);
    const data = JSON.parse(text);
    const copy = JSON.parse(text);
    unmarshal(data);
    expect(data).toEqual(copy);
  });
});

describe('classes', () => {
  it('registered classes come back as themselves, without calling their constructor', () => {
    const value = { p: new Point(3, 4), q: new Point3(1, 2, 2) };
    const back = roundTrip(value, opts);
    expect(back.p).toBeInstanceOf(Point);
    expect(back.p.norm()).toBe(5);
    expect(back.q).toBeInstanceOf(Point3);
    expect(back.q.z).toBe(2);
  });

  it('encode and decode: state in private fields; registered error classes', () => {
    const back = roundTrip({ price: new Money(1999, 'EUR'), error: new NotFound('book') }, opts);
    expect(back.price).toBeInstanceOf(Money);
    expect([back.price.cents, back.price.currency]).toEqual([1999, 'EUR']);
    expect(back.error).toBeInstanceOf(NotFound);
    expect([back.error.message, back.error.what, back.error.name]).toEqual(['book not found', 'book', 'NotFound']);
  });

  it('classes not registered: their fields (unknown: object), or an error (unknown: error)', () => {
    class Loose {
      constructor() {
        this.a = 1;
      }
    }
    expect(roundTrip(new Loose())).toEqual({ a: 1 });
    expect(() => stringify(new Loose(), { unknown: 'error' })).toThrow(/Loose is not a registered class/);
    // Written with a registry, read without it.
    const text = stringify(new Point(1, 2), opts);
    expect(parse(text)).toEqual({ x: 1, y: 2 });
    expect(() => parse(text, { unknown: 'error' })).toThrow(/Point is not a registered class/);
  });

  it('a field that is a function: an error, or left out (functions: skip)', () => {
    const value = { a: 1, f() {}, list: [() => 1] };
    expect(() => stringify(value)).toThrow(/function/);
    const back = roundTrip(value, { functions: 'skip' });
    expect(back).toEqual({ a: 1, list: [undefined] });
    expect(() => stringify(Promise.resolve())).toThrow(/registered class/);
  });

  it('registering: names must be unique, encode and decode go together', () => {
    const local = new Registry();
    class A {}
    const Other = class A {};
    local.register(A);
    expect(() => local.register(Other)).toThrow(/Another class is registered as A/);
    local.register(Other, { name: 'other.A' });
    expect(() => local.register(class B {}, { encode: () => 1 })).toThrow(/go together/);
  });
});

describe('input from outside', () => {
  it('the problems of the serializer of Agentic do not happen here', () => {
    // 1. A string that looks like a reference is a string.
    expect(roundTrip({ a: '@@ref:0' }).a).toBe('@@ref:0');
    // 2. RegExp keeps source and flags.
    expect(roundTrip(/ab+c/gi).test('ABBC')).toBe(true);
    // 3. Constructors are not called (Point throws when called without arguments).
    expect(roundTrip(new Point(1, 1), opts)).toBeInstanceOf(Point);
    // 4. "__proto__" in the input is a field, not the prototype.
    const polluted = parse('{"__proto__":{"polluted":2}}');
    expect(Object.getPrototypeOf(polluted)).toBe(Object.prototype);
    expect(polluted.polluted).toBeUndefined();
    expect(Object.hasOwn(polluted, '__proto__')).toBe(true);
    expect({}.polluted).toBeUndefined();
    // 5. No global is looked up by a name of the input.
    expect(() => parse('["¤TypedArray","Function","cmV0dXJuIDQy"]')).toThrow(/Not a typed array: Function/);
    expect(() => parse('["¤Function","return 42"]')).toThrow(/Not a tag/);
    expect(() => parse('["¤Error","Function","m","¤u",{},"¤h","¤h"]')).not.toThrow();
    expect(parse('["¤Error","Function","m","¤u",{},"¤h","¤h"]')).toBeInstanceOf(Error);
    expect(parse('{"@":"Function","x":1}')).toEqual({ x: 1 });
    // 6. BigInt, errors and undefined survive.
    expect(roundTrip({ n: 10n }).n).toBe(10n);
    expect(roundTrip(Object.assign(new Error('boom'), { code: 'E1' })).message).toBe('boom');
    expect(roundTrip([undefined])[0]).toBeUndefined();
  });

  it('malformed input is a MarshalError, never something else', () => {
    const bad = [
      'nope',
      '"¤Q"',
      '"¤Qx"',
      '"¤h"',
      '["¤Nope"]',
      '{"a":"¤R1"}',
      '{"a":"¤R-1"}',
      '"¤Dx"',
      '"¤B1e5"',
      '["¤Map",1]',
      '["¤RegExp","(","g"]',
      '["¤URL","not a url"]',
      '["¤TypedArray","Uint32Array","AAA="]',
      '["¤Boxed",null]',
      '["¤Object",5]',
      '["¤Null",[]]',
      '["¤Error","Error","m","¤u",5,"¤h","¤h"]',
      '{"@":1}',
      '["¤@Point"]',
      '["¤Table","Point",[],1]',
      '["¤Table","Point",["x",1],1,2]',
      '["¤Table","Point",["x","y"],1,2,3]',
      '["¤Table","Money",["x"],1]',
      '["¤Table",null,["x"],"¤R9"]',
      '["¤Table",5,["x"],1]',
    ];
    for (const text of bad) {
      let error;
      try {
        parse(text, opts);
      } catch (err) {
        error = err;
      }
      expect([text, error]).toEqual([text, expect.any(MarshalError)]);
    }
    // An invalid date is a date.
    expect(Number.isNaN(parse('"¤D"').getTime())).toBe(true);
  });

  it('limits: depth and size', () => {
    let deep = [];
    for (let i = 0; i < 1500; i += 1) deep = [deep];
    expect(() => stringify(deep)).toThrow(expect.objectContaining({ code: 'XUFA_MARSHAL_ERR_DEPTH' }));
    expect(stringify(deep, { maxDepth: 2000 }).length).toBeGreaterThan(1500);
    for (let i = 0; i < 100000; i += 1) deep = [deep];
    expect(() => stringify(deep, { maxDepth: Infinity })).toThrow(expect.objectContaining({ code: 'XUFA_MARSHAL_ERR_DEPTH' }));
    expect(() => parse(`${'['.repeat(1500)}${']'.repeat(1500)}`)).toThrow(
      expect.objectContaining({ code: 'XUFA_MARSHAL_ERR_DEPTH' })
    );
    expect(() => unmarshal([1, 2, 3], { maxNodes: 2 })).toThrow(expect.objectContaining({ code: 'XUFA_MARSHAL_ERR_SIZE' }));
  });

  it('fields are defined, not assigned, when the prototype has setters (no code of the class runs)', () => {
    const calls = [];
    class Guarded {
      set role(value) {
        calls.push(value);
      }
    }
    const local = { registry: new Registry().register(Guarded) };
    const back = parse('{"@":"Guarded","role":"admin"}', local);
    expect(back).toBeInstanceOf(Guarded);
    expect(Object.getOwnPropertyDescriptor(back, 'role').value).toBe('admin');
    expect(calls).toEqual([]);
  });

  it('a cycle through an instance made by decode() is refused, not looped', () => {
    expect(() => parse('["¤@Money","¤R0",1]', opts)).toThrow(expect.objectContaining({ code: 'XUFA_MARSHAL_ERR_CYCLE' }));
  });

  it('marshal() gives plain JSON data', () => {
    const data = marshal({ d: new Date(0), n: 1n, p: new Point(1, 2) }, opts);
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    expect(unmarshal(data, opts).p).toBeInstanceOf(Point);
  });
});

describe('clone()', () => {
  it('copies deeply, keeping classes (registered or not), references and cycles', () => {
    class Unregistered {
      constructor() {
        this.list = [1, { a: 2 }];
      }

      sum() {
        return this.list[0] + this.list[1].a;
      }
    }
    const shared = { n: 1 };
    const value = { u: new Unregistered(), a: shared, b: shared, p: new Point(3, 4), m: new Money(5, 'USD'), fn: Math.max };
    value.self = value;
    const copy = clone(value, opts);
    expect(copy).not.toBe(value);
    expect(copy.u).toBeInstanceOf(Unregistered);
    expect(copy.u.sum()).toBe(3);
    expect(copy.u.list).not.toBe(value.u.list);
    expect(copy.a).toBe(copy.b);
    expect(copy.self).toBe(copy);
    expect(copy.p.norm()).toBe(5);
    expect(copy.m.cents).toBe(5); // private state, through encode/decode
    expect(copy.fn).toBe(Math.max);
  });

  it('copies the built-ins as structuredClone does', () => {
    const value = {
      d: new Date(1),
      r: /x/g,
      map: new Map([[1, { a: 1 }]]),
      set: new Set([[1]]),
      buf: Buffer.from('a'),
      f32: new Float32Array([1.5]),
      e: Object.assign(new RangeError('r', { cause: 1 }), { code: 'C' }),
      big: 1n,
      holes: [1, , 3], // eslint-disable-line no-sparse-arrays
    };
    const copy = clone(value);
    expect(copy).toEqual(value);
    expect(copy.map.get(1)).not.toBe(value.map.get(1));
    expect(copy.buf).not.toBe(value.buf);
    expect(copy.e).toBeInstanceOf(RangeError);
    expect([copy.e.message, copy.e.cause, copy.e.code]).toEqual(['r', 1, 'C']);
    expect(1 in copy.holes).toBe(false);
  });
});
