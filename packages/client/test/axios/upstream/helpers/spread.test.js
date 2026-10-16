// Ported from axios's tests/unit/helpers/spread.test.js (MIT License) by tools/port-axios/port.js: do not edit, change the tool.
import { describe, it, expect } from '@xufa/test';
import { spread } from '../../support/internals.js';

describe('helpers::spread', () => {
  it('should spread array to arguments', () => {
    let value = 0;
    spread((a, b) => {
      value = a * b;
    })([5, 10]);

    expect(value).toEqual(50);
  });

  it('should return callback result', () => {
    const value = spread((a, b) => {
      return a * b;
    })([5, 10]);

    expect(value).toEqual(50);
  });
});
