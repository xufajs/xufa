// Ported from axios's tests/unit/helpers/isAxiosError.test.js (MIT License) by tools/port-axios/port.js: do not edit, change the tool.
import { describe, it, expect } from '@xufa/test';
import { AxiosError } from '../../support/internals.js';
import { isAxiosError } from '../../support/internals.js';

describe('helpers::isAxiosError', () => {
  it('should return true if the error is created by core::createError', () => {
    expect(isAxiosError(new AxiosError('Boom!', null, { foo: 'bar' }))).toBe(true);
  });

  it('should return true if the error is enhanced by core::enhanceError', () => {
    expect(isAxiosError(AxiosError.from(new Error('Boom!'), null, { foo: 'bar' }))).toBe(true);
  });

  it('should return false if the error is a normal Error instance', () => {
    expect(isAxiosError(new Error('Boom!'))).toBe(false);
  });

  it('should return false if the error is null', () => {
    expect(isAxiosError(null)).toBe(false);
  });
});
