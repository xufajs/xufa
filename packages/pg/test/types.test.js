const { types, parseConfig } = require('..');

const { parserOf, paramToText } = types;

const parse = (oid, value) => {
  const bytes = Buffer.from(value, 'utf8');
  return parserOf(oid)(bytes, 0, bytes.length);
};

describe('types', () => {
  it('parses numbers and booleans from bytes', () => {
    expect(parse(23, '42')).toBe(42);
    expect(parse(23, '-2147483648')).toBe(-2147483648);
    expect(parse(21, '-7')).toBe(-7);
    expect(parse(20, '9007199254740991')).toBe(9007199254740991);
    expect(parse(20, '-9007199254740991')).toBe(-9007199254740991);
    expect(parse(20, '9007199254740992')).toBe(9007199254740992n);
    expect(parse(20, '-9223372036854775808')).toBe(-9223372036854775808n);
    expect(parse(701, '1.5')).toBe(1.5);
    expect(parse(701, 'NaN')).toBeNaN();
    expect(parse(701, '-Infinity')).toBe(-Infinity);
    expect(parse(700, '1e-07')).toBe(1e-7);
    expect(parse(1700, '123.4500')).toBe('123.4500');
    expect(parse(16, 't')).toBe(true);
    expect(parse(16, 'f')).toBe(false);
  });

  it('parses text, json, bytea and unknown types', () => {
    expect(parse(25, 'héllo')).toBe('héllo');
    expect(parse(25, 'x'.repeat(100))).toBe('x'.repeat(100));
    expect(parse(3802, '{"a": [1, "b"]}')).toEqual({ a: [1, 'b'] });
    expect(parse(114, '[1,2]')).toEqual([1, 2]);
    expect([...parse(17, '\\x00ff10')]).toEqual([0, 255, 16]);
    expect(parse(2950, '6f1c7d3a-0000-4000-8000-000000000000')).toBe('6f1c7d3a-0000-4000-8000-000000000000');
    expect(parse(99999, 'whatever')).toBe('whatever');
  });

  it('parses timestamps with and without time zones, and dates', () => {
    expect(parse(1184, '2024-01-02 03:04:05.123456+00').toISOString()).toBe('2024-01-02T03:04:05.123Z');
    expect(parse(1184, '2024-01-02 03:04:05+02').toISOString()).toBe('2024-01-02T01:04:05.000Z');
    expect(parse(1184, '2024-01-02 03:04:05-03:30').toISOString()).toBe('2024-01-02T06:34:05.000Z');
    expect(parse(1184, '1969-12-31 23:59:59.9+00').getTime()).toBe(-100);
    expect(parse(1184, '0044-03-15 12:00:00+00 BC').getUTCFullYear()).toBe(-43);
    expect(parse(1184, '0099-01-01 00:00:00+00').getUTCFullYear()).toBe(99);
    expect(parse(1184, 'infinity')).toBe(Infinity);
    expect(parse(1184, '-infinity')).toBe(-Infinity);
    expect(parse(1114, '2024-01-02 03:04:05.5').getTime()).toBe(new Date(2024, 0, 2, 3, 4, 5, 500).getTime());
    expect(parse(1082, '2024-02-29').getTime()).toBe(new Date(2024, 1, 29).getTime());
  });

  it('parses arrays', () => {
    expect(parse(1007, '{1,2,NULL,-3}')).toEqual([1, 2, null, -3]);
    expect(parse(1009, '{a,"b c","d\\"e","f\\\\g",NULL,"NULL"}')).toEqual(['a', 'b c', 'd"e', 'f\\g', null, 'NULL']);
    expect(parse(1007, '{{1,2},{3,4}}')).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(parse(1000, '{t,f}')).toEqual([true, false]);
    expect(parse(1007, '{}')).toEqual([]);
    expect(parse(1007, '[0:1]={5,6}')).toEqual([5, 6]);
    expect(parse(3807, '{"{\\"a\\": 1}"}')).toEqual([{ a: 1 }]);
  });

  it('writes parameters in the text format', () => {
    expect(paramToText(null)).toBeNull();
    expect(paramToText(undefined)).toBeNull();
    expect(paramToText(5)).toBe('5');
    expect(paramToText(2n ** 62n)).toBe('4611686018427387904');
    expect(paramToText(true)).toBe('true');
    expect(paramToText('x')).toBe('x');
    expect(paramToText(new Date('2024-01-02T03:04:05.006Z'))).toBe('2024-01-02T03:04:05.006+00:00');
    expect(paramToText({ a: 1 })).toBe('{"a":1}');
    expect(paramToText([1, null, 'a "b"', [2]])).toBe('{"1",NULL,"a \\"b\\"",{"2"}}');
    expect(Buffer.isBuffer(paramToText(Buffer.from('x')))).toBe(true);
    expect(paramToText({ toPostgres: () => 'custom' })).toBe('custom');
    expect(() => paramToText(new Date(NaN))).toThrow('Invalid Date');
  });
});

describe('parseConfig', () => {
  it('reads connection strings', () => {
    const config = parseConfig('postgres://us%40r:p%3Ass@db.example.com:6543/app?sslmode=require&application_name=x');
    expect(config).toMatchObject({
      user: 'us@r',
      password: 'p:ss',
      host: 'db.example.com',
      port: 6543,
      database: 'app',
      application_name: 'x',
      ssl: { rejectUnauthorized: false },
    });
    expect(parseConfig({ user: 'a' })).toMatchObject({ user: 'a', host: '127.0.0.1', port: 5432, database: 'a' });
    expect(parseConfig({ connectionString: 'postgres://a@h/d', port: 1 }).port).toBe(1);
  });
});
