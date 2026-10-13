import { parseDirective, parseList, parseNames, parseRules } from '../../lib/source-code/comments.js';

describe('directive comments', () => {
  it('a label, its value and the reason after --', () => {
    expect(parseDirective(' eslint-disable no-alert, no-console -- legacy code ')).toEqual({
      label: 'eslint-disable',
      value: 'no-alert, no-console',
      justification: 'legacy code',
    });
    expect(parseDirective('global a, b:writable')).toEqual({
      label: 'global',
      value: 'a, b:writable',
      justification: '',
    });
    expect(parseDirective('eslint-enable')).toEqual({ label: 'eslint-enable', value: '', justification: '' });
  });

  it('not a directive: no label first', () => {
    expect(parseDirective(' just a comment')).toEqual({ label: 'just', value: 'a comment', justification: '' });
    expect(parseDirective('Eslint-disable')).toBeUndefined();
    expect(parseDirective('* @param a')).toBeUndefined();
  });

  it('-- needs spaces around it', () => {
    expect(parseDirective('eslint-disable a--b')).toEqual({
      label: 'eslint-disable',
      value: 'a--b',
      justification: '',
    });
  });
});

describe('lists of rules', () => {
  it('names, trimmed, quotes off', () => {
    expect(parseList(' no-alert , "no-console",\'eqeqeq\', ')).toEqual({
      'no-alert': true,
      'no-console': true,
      eqeqeq: true,
    });
    expect(parseList('')).toEqual({});
  });
});

describe('names with values', () => {
  it('/* global */: names, a value after :', () => {
    expect(parseNames('a, b:writable  c : readonly,,d')).toEqual({ a: null, b: 'writable', c: 'readonly', d: null });
  });
});

describe('settings of rules', () => {
  it('the object of /* eslint */, as levn reads it', () => {
    expect(parseRules('no-alert: 2, quotes: [2, single], eqeqeq: "off"')).toEqual({
      ok: true,
      config: { 'no-alert': 2, quotes: [2, 'single'], eqeqeq: 'off' },
    });
    expect(parseRules("no-alert: 'warn'")).toEqual({ ok: true, config: { 'no-alert': 'warn' } });
  });

  it('commas may end lists and objects; values are what they look like', () => {
    expect(parseRules('no-alert: [2,], no-console: 1,')).toEqual({ ok: true, config: { 'no-alert': [2], 'no-console': 1 } });
    expect(parseRules('no-alert: 0x2, max-len: [2, {code: 8e1, ignoreUrls: true, x: null}]')).toEqual({
      ok: true,
      config: { 'no-alert': 2, 'max-len': [2, { code: 80, ignoreUrls: true, x: null }] },
    });
    expect(parseRules('{"no-alert": "error", id-match: [2, "^[a-z]\\"+$", /a+/i]}')).toEqual({
      ok: true,
      config: { 'no-alert': 'error', 'id-match': [2, '^[a-z]"+$', /a+/i] },
    });
  });

  it('a value of more than one word is one string, and not a severity', () => {
    expect(parseRules('no-alert: off no-console: warn').ok).toBe(false);
  });

  it('without commas, as JSON', () => {
    expect(parseRules('"no-alert": 2 "no-console": 1')).toEqual({
      ok: true,
      config: { 'no-alert': 2, 'no-console': 1 },
    });
    expect(parseRules('no-alert: 2 no-console: 1')).toEqual({ ok: true, config: { 'no-alert': 2, 'no-console': 1 } });
  });

  it('what neither reads is an error that says what was read', () => {
    const result = parseRules('no-alert: [2');
    expect(result.ok).toBe(false);
    expect(result.error.message).toMatch(/^Failed to parse JSON from '"no-alert": \[2': /);
  });
});
