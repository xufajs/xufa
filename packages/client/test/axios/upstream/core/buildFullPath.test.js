// Ported from axios's tests/unit/core/buildFullPath.test.js (MIT License) by tools/port-axios/port.js: do not edit, change the tool.
import { describe, it, expect } from '@xufa/test';
import { buildFullPath } from '../../support/internals.js';

describe('core::buildFullPath', () => {
  it('combines URLs when the requested URL is relative', () => {
    expect(buildFullPath('https://api.github.com', '/users')).toBe('https://api.github.com/users');
  });

  it('does not combine URLs when the requested URL is absolute', () => {
    expect(buildFullPath('https://api.github.com', 'https://api.example.com/users')).toBe(
      'https://api.example.com/users'
    );
  });

  it('combines URLs when requested URL is absolute and allowAbsoluteUrls is false', () => {
    expect(buildFullPath('https://api.github.com', 'https://api.example.com/users', false)).toBe(
      'https://api.github.com/https://api.example.com/users'
    );
  });

  it('does not combine URLs when baseURL is missing and allowAbsoluteUrls is false', () => {
    expect(buildFullPath(undefined, 'https://api.example.com/users', false)).toBe(
      'https://api.example.com/users'
    );
  });

  it('does not combine URLs when baseURL is not configured', () => {
    expect(buildFullPath(undefined, '/users')).toBe('/users');
  });

  it('combines URLs when baseURL and requested URL are both relative', () => {
    expect(buildFullPath('/api', '/users')).toBe('/api/users');
  });
});
