// Ported from axios's tests/unit/utils/kindOf.test.js (MIT License) by tools/port-axios/port.js: do not edit, change the tool.
import { describe, it, expect } from '@xufa/test';
import { utils } from '../../support/internals.js';

const { kindOf } = utils;

describe('utils::kindOf', () => {
  it('should return object tag', () => {
    expect(kindOf({})).toEqual('object');
    // cached result
    expect(kindOf({})).toEqual('object');
    expect(kindOf([])).toEqual('array');
  });
});
