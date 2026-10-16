// Ported from axios's tests/unit/cancel/isCancel.test.js (MIT License) by tools/port-axios/port.js: do not edit, change the tool.
import { describe, it, expect } from '@xufa/test';
import { isCancel } from '../../support/internals.js';
import { CanceledError } from '../../support/internals.js';

describe('cancel::isCancel', () => {
  it('returns true when value is a CanceledError', () => {
    expect(isCancel(new CanceledError())).toBe(true);
  });

  it('returns false when value is not canceled', () => {
    expect(isCancel({ foo: 'bar' })).toBe(false);
  });
});
