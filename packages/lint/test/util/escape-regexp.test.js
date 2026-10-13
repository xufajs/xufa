import escapeRegExp from '../../lib/util/escape-regexp.js';

describe('escapeRegExp', () => {
  it('escapes what has a meaning in a regular expression', () => {
    expect(escapeRegExp('a.b*c?(d)[e]{f}|g^h$i+j\\k')).toBe('a\\.b\\*c\\?\\(d\\)\\[e\\]\\{f\\}\\|g\\^h\\$i\\+j\\\\k');
  });

  it('escapes - as \\x2d, which a class with the u flag allows', () => {
    expect(escapeRegExp('no-console')).toBe('no\\x2dconsole');
    expect(new RegExp(`[${escapeRegExp('a-z')}]`, 'u').test('-')).toBe(true);
    expect(new RegExp(`[${escapeRegExp('a-z')}]`, 'u').test('b')).toBe(false);
  });

  it('matches the text it was given', () => {
    const text = 'eslint-disable no-unused-vars, (x)?';
    expect(new RegExp(`^${escapeRegExp(text)}$`, 'u').test(text)).toBe(true);
  });

  it('takes strings only', () => {
    expect(() => escapeRegExp(1)).toThrow(TypeError);
  });
});
