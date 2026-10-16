// Ported from axios's tests/unit/utils/toFlatObject.test.js (MIT License) by tools/port-axios/port.js: do not edit, change the tool.
import { describe, it, expect } from '@xufa/test';
import { utils } from '../../support/internals.js';

const { toFlatObject } = utils;

describe('utils::toFlatObject', () => {
  it('should resolve object proto chain to a flat object representation', () => {
    const a = { x: 1 };
    const b = Object.create(a, { y: { value: 2 } });
    const c = Object.create(b, { z: { value: 3 } });
    expect(toFlatObject(c)).toEqual({ x: 1, y: 2, z: 3 });
  });
});
