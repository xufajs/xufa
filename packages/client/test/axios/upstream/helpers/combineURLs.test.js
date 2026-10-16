// Ported from axios's tests/unit/helpers/combineURLs.test.js (MIT License) by tools/port-axios/port.js: do not edit, change the tool.
import { describe, it, expect } from '@xufa/test';
import { combineURLs } from '../../support/internals.js';

describe('helpers::combineURLs', () => {
  it('should combine URLs', () => {
    expect(combineURLs('https://api.github.com', '/users')).toBe('https://api.github.com/users');
  });

  it('should remove duplicate slashes', () => {
    expect(combineURLs('https://api.github.com/', '/users')).toBe('https://api.github.com/users');
  });

  it('should insert missing slash', () => {
    expect(combineURLs('https://api.github.com', 'users')).toBe('https://api.github.com/users');
  });

  it('should not insert slash when relative url missing/empty', () => {
    expect(combineURLs('https://api.github.com/users', '')).toBe('https://api.github.com/users');
  });

  it('should allow a single slash for relative url', () => {
    expect(combineURLs('https://api.github.com/users', '/')).toBe('https://api.github.com/users/');
  });
});
