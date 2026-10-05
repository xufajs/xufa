const { serialize, deserialize, ObjectId, Binary, Timestamp, Int32, Double, MinKey, MaxKey } = require('..');

describe('bson', () => {
  it('round-trips the types of JavaScript', () => {
    const id = new ObjectId();
    const doc = {
      string: 'héllo',
      int: 42,
      negative: -7,
      double: 1.5,
      big: 2 ** 40,
      long: 2n ** 62n,
      true: true,
      false: false,
      null: null,
      date: new Date('2024-05-06T07:08:09.010Z'),
      id,
      regex: /ab+c/gi,
      buffer: Buffer.from([1, 2, 3]),
      nested: { a: [1, 'two', { three: 3 }], empty: {} },
      array: [],
    };
    const result = deserialize(serialize(doc));
    expect(result.string).toBe('héllo');
    expect(result.int).toBe(42);
    expect(result.negative).toBe(-7);
    expect(result.double).toBe(1.5);
    expect(result.big).toBe(2 ** 40);
    expect(result.long).toBe(2n ** 62n);
    expect(result.true).toBe(true);
    expect(result.false).toBe(false);
    expect(result.null).toBeNull();
    expect(result.date.toISOString()).toBe('2024-05-06T07:08:09.010Z');
    expect(result.id.equals(id)).toBe(true);
    expect(result.regex.source).toBe('ab+c');
    expect(result.regex.flags).toBe('i');
    expect([...result.buffer]).toEqual([1, 2, 3]);
    expect(result.nested).toEqual({ a: [1, 'two', { three: 3 }], empty: {} });
    expect(result.array).toEqual([]);
  });

  it('skips undefined in documents and writes it as null in arrays', () => {
    expect(deserialize(serialize({ a: undefined, b: [undefined] }))).toEqual({ b: [null] });
  });

  it('encodes the special types', () => {
    const result = deserialize(
      serialize({
        binary: new Binary(Buffer.from('abc'), 4),
        ts: new Timestamp(1, 2),
        int: new Int32(5),
        double: new Double(5),
        min: new MinKey(),
        max: new MaxKey(),
      })
    );
    expect(result.binary).toBeInstanceOf(Binary);
    expect(result.binary.subType).toBe(4);
    expect(result.binary.buffer.toString()).toBe('abc');
    expect(result.ts).toEqual(new Timestamp(1, 2));
    expect(result.int).toBe(5);
    expect(result.double).toBe(5);
    expect(result.min).toBeInstanceOf(MinKey);
    expect(result.max).toBeInstanceOf(MaxKey);
  });

  it('writes the bytes of the specification', () => {
    // {"hello": "world"}, the example of bsonspec.org.
    expect(serialize({ hello: 'world' }).toString('hex')).toBe('160000000268656c6c6f0006000000776f726c640000');
  });

  it('makes ObjectIds', () => {
    const a = new ObjectId();
    const b = new ObjectId();
    expect(a.equals(b)).toBe(false);
    expect(ObjectId.isValid(a.toHexString())).toBe(true);
    expect(new ObjectId(a.toHexString()).equals(a)).toBe(true);
    expect(a.equals(a.toHexString())).toBe(true);
    expect(JSON.stringify({ a })).toBe(`{"a":"${a}"}`);
    expect(Math.abs(a.getTimestamp().getTime() - Date.now())).toBeLessThan(2000);
    expect(() => new ObjectId('nope')).toThrow('Invalid ObjectId');
  });

  it('rejects invalid documents', () => {
    expect(() => deserialize(Buffer.from([5, 0, 0, 0, 1]))).toThrow('Invalid BSON');
    expect(() => serialize({ 'a\u0000b': 1 })).toThrow('null characters');
  });

  it('decodes keys of every kind, cached or not', () => {
    const keys = ['a', 'ab', 'ba', 'clé', '日本', 'k'.repeat(100), ''];
    for (let i = 0; i < 3000; i += 1) keys.push(`key${i}`);
    const doc = Object.fromEntries(keys.map((key, i) => [key, i]));
    // Twice: the second time the keys come from the cache.
    expect(deserialize(serialize(doc))).toEqual(doc);
    expect(deserialize(serialize(doc))).toEqual(doc);
    expect(Object.keys(deserialize(serialize({ ab: 1, ba: 2 })))).toEqual(['ab', 'ba']);
  });

  it('decodes numbers and dates at their limits', () => {
    const values = {
      maxSafe: BigInt(Number.MAX_SAFE_INTEGER),
      minSafe: BigInt(Number.MIN_SAFE_INTEGER),
      big: 2n ** 53n,
      negativeBig: -(2n ** 53n),
      minusOne: -1n,
      maxInt64: 2n ** 63n - 1n,
      minInt64: -(2n ** 63n),
    };
    const result = deserialize(serialize(values));
    expect(result.maxSafe).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.minSafe).toBe(Number.MIN_SAFE_INTEGER);
    expect(result.big).toBe(2n ** 53n);
    expect(result.negativeBig).toBe(-(2n ** 53n));
    expect(result.minusOne).toBe(-1);
    expect(result.maxInt64).toBe(2n ** 63n - 1n);
    expect(result.minInt64).toBe(-(2n ** 63n));
    const dates = [new Date(0), new Date(-1), new Date('1815-12-10T00:00:00Z'), new Date(8.64e15), new Date(-8.64e15)];
    expect(deserialize(serialize({ dates })).dates.map((date) => date.getTime())).toEqual(
      dates.map((date) => date.getTime())
    );
    const doubles = deserialize(serialize({ a: NaN, b: -0, c: Infinity, d: 5e-324, e: 0.1 + 0.2, f: -2147483649 }));
    expect(doubles.a).toBeNaN();
    expect(Object.is(doubles.b, -0)).toBe(true);
    expect(doubles.c).toBe(Infinity);
    expect(doubles.d).toBe(5e-324);
    expect(doubles.e).toBe(0.1 + 0.2);
    expect(doubles.f).toBe(-2147483649);
    expect(deserialize(serialize({ min: -2147483648, max: 2147483647 }))).toEqual({
      min: -2147483648,
      max: 2147483647,
    });
  });

  it('decodes strings of every length', () => {
    const strings = ['', 'a', 'x'.repeat(48), 'x'.repeat(49), 'é'.repeat(30), `${'a'.repeat(47)}é`, '👍'.repeat(100)];
    expect(deserialize(serialize({ strings })).strings).toEqual(strings);
  });

  it('rejects documents whose sizes do not match', () => {
    const bytes = serialize({ a: 'hello' });
    const broken = Buffer.from(bytes);
    broken.writeInt32LE(100, 7); // the size of the string
    expect(() => deserialize(broken)).toThrow('Invalid BSON');
    const unterminated = Buffer.from([8, 0, 0, 0, 0x0a, 0x61, 0x62, 0]);
    expect(() => deserialize(unterminated)).toThrow('Invalid BSON');
  });

  it('encodes numbers at the limits of their types', () => {
    const values = [0, -1, 2147483647, -2147483648, 2147483648, -2147483649, 0.5, -0, 2 ** 53, -(2 ** 53)];
    const encoded = serialize({ values });
    expect(Object.is(deserialize(encoded).values[7], -0)).toBe(true);
    expect(deserialize(encoded).values).toEqual(values);
    // int32 (0x10) for 2147483647, double (0x01) for 2147483648.
    expect(serialize({ a: 2147483647 })[4]).toBe(0x10);
    expect(serialize({ a: 2147483648 })[4]).toBe(0x01);
  });

  it('encodes strings and keys of every kind', () => {
    const doc = {
      ascii: 'a'.repeat(48),
      long: 'b'.repeat(5000),
      clé: 'é',
      日本: '日本語',
      mixed: `${'a'.repeat(47)}é`,
    };
    expect(deserialize(serialize(doc))).toEqual(doc);
    expect(() => serialize({ 'clé\u0000': 1 })).toThrow('null characters');
    expect(() => serialize({ ['k'.repeat(60) + '\u0000']: 1 })).toThrow('null characters');
    expect(deserialize(serialize({ s: 'a\u0000b' })).s).toBe('a\u0000b');
  });

  it('encodes documents larger than the shared buffer, and after them small ones', () => {
    const big = { data: 'x'.repeat(3 * 1024 * 1024), list: Array.from({ length: 200 }, (_, i) => ({ i })) };
    expect(deserialize(serialize(big))).toEqual(big);
    expect(deserialize(serialize({ a: 1 }))).toEqual({ a: 1 });
  });

  it('encodes documents whose getters encode documents', () => {
    const doc = {
      a: 1,
      get inner() {
        return serialize({ b: 2 });
      },
    };
    const result = deserialize(serialize(doc));
    expect(result.a).toBe(1);
    expect(deserialize(result.inner)).toEqual({ b: 2 });
  });

  it('leaves room before the document when asked', () => {
    const encoded = serialize({ a: 1 }, 5);
    expect(encoded.length).toBe(5 + serialize({ a: 1 }).length);
    expect(deserialize(encoded, 5)).toEqual({ a: 1 });
  });

  it('keeps the bytes of ObjectIds through every way of making them', () => {
    for (const hex of [
      '000000000000000000000000',
      'ffffffffffffffffffffffff',
      '0102030405060708090a0b0c',
      '65a1b2c3d4e5f60718293a4b',
    ]) {
      const id = new ObjectId(hex);
      expect(id.toHexString()).toBe(hex);
      expect(id.buffer.toString('hex')).toBe(hex);
      expect(new ObjectId(id.buffer).toHexString()).toBe(hex);
      expect(new ObjectId(id).equals(id)).toBe(true);
      expect(new ObjectId(hex.toUpperCase()).toHexString()).toBe(hex);
      const decoded = deserialize(serialize({ id })).id;
      expect(decoded).toBeInstanceOf(ObjectId);
      expect(decoded.toHexString()).toBe(hex);
      expect(decoded.equals(id)).toBe(true);
      expect(serialize({ id }).subarray(8, 20).toString('hex')).toBe(hex);
    }
    expect(new ObjectId('ffffffff0000000000000000').getTimestamp().getTime()).toBe(0xffffffff * 1000);
  });

  it('generates distinct ObjectIds in order', () => {
    const ids = Array.from({ length: 1000 }, () => new ObjectId());
    expect(new Set(ids.map((id) => id.toHexString())).size).toBe(1000);
    const seconds = Math.floor(Date.now() / 1000);
    expect(Math.abs(ids[0].getTimestamp().getTime() / 1000 - seconds)).toBeLessThan(2);
    // The same 5 bytes of the process in every id.
    expect(new Set(ids.map((id) => id.toHexString().slice(8, 18))).size).toBe(1);
    expect(ObjectId.generate()).toHaveLength(12);
  });

  it('reads the id of a cursor from the bytes of a reply', () => {
    const { cursorIdOf } = require('..');
    const reply = (cursor) => serialize({ cursor, ok: 1 });
    expect(cursorIdOf(reply({ nextBatch: [{ a: 'x', b: [1, 2] }], id: 2n ** 60n, ns: 'db.c' }), 0)).toBe(2n ** 60n);
    expect(cursorIdOf(reply({ id: 0n, ns: 'db.c', firstBatch: [] }), 0)).toBe(0n);
    expect(cursorIdOf(reply({ ns: 'db.c', firstBatch: [], id: 5 }), 0)).toBe(5n);
    expect(cursorIdOf(serialize({ ok: 1, n: 3 }), 0)).toBeNull();
    // At an offset, and with fields of every kind before the cursor.
    const other = serialize({ s: 'x', d: new Date(), r: /a/i, o: { id: 9n }, cursor: { id: 7n } }, 3);
    expect(cursorIdOf(other, 3)).toBe(7n);
  });

  it('decodes documents of shapes seen before, and of shapes that change', () => {
    const docs = [
      { a: 1, b: 'x', c: { d: 1 } },
      { a: 2, b: 'y', c: { d: 2 } },
      { a: 3, b: 'z', c: { e: 3 } },
      { a: 4, c: { d: 4 }, b: 'w' },
      { a: 5 },
      { a: 6, b: 'v', c: { d: 6 }, extra: [{ x: 1 }, { y: 2 }, { x: 3 }] },
      {},
      { b: 1, a: 2 },
    ];
    // Many times, so the shapes are compiled and followed.
    for (let round = 0; round < 3; round += 1) {
      const decoded = deserialize(serialize({ docs })).docs;
      expect(decoded).toEqual(docs);
      decoded.forEach((doc, i) => expect(Object.keys(doc)).toEqual(Object.keys(docs[i])));
    }
  });

  it('keeps __proto__ keys as properties', () => {
    const encoded = serialize(JSON.parse('{"a": 1, "__proto__": {"polluted": true}}'));
    for (let round = 0; round < 3; round += 1) {
      const doc = deserialize(encoded);
      expect(Object.getPrototypeOf(doc)).toBe(Object.prototype);
      expect(Object.keys(doc)).toEqual(['a', '__proto__']);
      expect(doc.polluted).toBeUndefined();
      expect({}.polluted).toBeUndefined();
    }
  });

  it('decodes documents of more shapes than it keeps', () => {
    const docs = Array.from({ length: 30000 }, (_, i) => ({ [`key${i}`]: i, same: true }));
    const decoded = deserialize(serialize({ docs })).docs;
    expect(decoded).toHaveLength(30000);
    expect(decoded[29999]).toEqual({ key29999: 29999, same: true });
    expect(deserialize(serialize({ a: 1, b: 2 }))).toEqual({ a: 1, b: 2 });
  });

  it('recovers after a document that fails to decode', () => {
    const broken = Buffer.from(serialize({ a: { b: { c: 'x' } } }));
    broken.writeInt32LE(99, broken.length - 8);
    expect(() => deserialize(broken)).toThrow('Invalid BSON');
    expect(deserialize(serialize({ a: { b: { c: 'x' } } }))).toEqual({ a: { b: { c: 'x' } } });
  });

  it('does not encode the enumerable properties of a polluted Object.prototype', () => {
    // eslint-disable-next-line no-extend-native
    Object.prototype.injected = '$where';
    try {
      expect(deserialize(serialize({ a: 1, nested: { b: 2 } }))).toEqual({ a: 1, nested: { b: 2 } });
    } finally {
      delete Object.prototype.injected;
    }
  });
});

describe('Decimal128', () => {
  const { Decimal128 } = require('..');
  // [text, bytes (hex), the text of the standard]: the same as the official bson gives.
  const VECTORS = [
    ['0', '00000000000000000000000000004030', '0'],
    ['-0', '000000000000000000000000000040b0', '-0'],
    ['1', '01000000000000000000000000004030', '1'],
    ['-1', '010000000000000000000000000040b0', '-1'],
    ['0.1', '01000000000000000000000000003e30', '0.1'],
    ['12.50', 'e2040000000000000000000000003c30', '12.50'],
    ['-0.0001', '010000000000000000000000000038b0', '-0.0001'],
    ['1E+3', '01000000000000000000000000004630', '1E+3'],
    ['1.23E-7', '7b000000000000000000000000002e30', '1.23E-7'],
    ['9999999999999999999999999999999999', 'ffffffff638e8d37c087adbe09ed4130', '9999999999999999999999999999999999'],
    ['1234567890.123456789', '1581e97df41022110000000000002e30', '1234567890.123456789'],
    ['Infinity', '00000000000000000000000000000078', 'Infinity'],
    ['-Infinity', '000000000000000000000000000000f8', '-Infinity'],
    ['NaN', '0000000000000000000000000000007c', 'NaN'],
    ['0E-6176', '00000000000000000000000000000000', '0E-6176'],
    ['1E+6144', '000000000a5bc138938d44c64d31fe5f', '1.000000000000000000000000000000000E+6144'],
    ['100', '64000000000000000000000000004030', '100'],
    ['2.675', '730a0000000000000000000000003a30', '2.675'],
  ];

  it('converts texts to bytes and back, as the standard says', () => {
    for (const [text, hex, standard] of VECTORS) {
      const decimal = Decimal128.fromString(text);
      expect([text, decimal.bytes.toString('hex')]).toEqual([text, hex]);
      expect([text, new Decimal128(Buffer.from(hex, 'hex')).toString()]).toEqual([text, standard]);
    }
  });

  it('gives its parts, and makes a decimal of them', () => {
    expect(Decimal128.fromString('-12.50').toParts()).toEqual({
      negative: true,
      coefficient: 1250,
      exponent: -2,
      special: null,
    });
    const big = Decimal128.fromString('9999999999999999999999999999999999').toParts();
    expect(big.coefficient).toBe(9999999999999999999999999999999999n);
    expect(Decimal128.fromParts(false, 1250n, -2).toString()).toBe('12.50');
  });

  it('refuses what it cannot keep exactly', () => {
    expect(() => Decimal128.fromString('12345678901234567890123456789012345')).toThrow(RangeError);
    expect(() => Decimal128.fromString('1E+7000')).toThrow(RangeError);
    expect(() => Decimal128.fromString('abc')).toThrow(TypeError);
    // Zeros at the end that do not fit change nothing: they are dropped.
    expect(Decimal128.fromString('12345678901234567890123456789012340').toString()).toBe(
      '1.234567890123456789012345678901234E+34'
    );
  });

  it('goes through serialize and deserialize', () => {
    const doc = deserialize(serialize({ price: Decimal128.fromString('19.99') }));
    expect(doc.price).toBeInstanceOf(Decimal128);
    expect(doc.price.toString()).toBe('19.99');
    expect(JSON.stringify(doc.price)).toBe('{"$numberDecimal":"19.99"}');
  });
});
