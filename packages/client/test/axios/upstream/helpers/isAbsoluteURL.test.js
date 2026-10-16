// Ported from axios's tests/unit/helpers/isAbsoluteURL.test.js (MIT License) by tools/port-axios/port.js: do not edit, change the tool.
import { describe, it, expect } from '@xufa/test';
import { isAbsoluteURL } from '../../support/internals.js';

describe('helpers::isAbsoluteURL', () => {
  it('should return true if URL begins with valid scheme name', () => {
    expect(isAbsoluteURL('https://api.github.com/users')).toBe(true);
    expect(isAbsoluteURL('custom-scheme-v1.0://example.com/')).toBe(true);
    expect(isAbsoluteURL('HTTP://example.com/')).toBe(true);
  });

  it('should return false if URL begins with invalid scheme name', () => {
    expect(isAbsoluteURL('123://example.com/')).toBe(false);
    expect(isAbsoluteURL('!valid://example.com/')).toBe(false);
  });

  it('should return true if URL is protocol-relative', () => {
    expect(isAbsoluteURL('//example.com/')).toBe(true);
  });

  it('should return false if URL is relative', () => {
    expect(isAbsoluteURL('/foo')).toBe(false);
    expect(isAbsoluteURL('foo')).toBe(false);
  });
});
