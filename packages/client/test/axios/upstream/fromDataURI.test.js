// Ported from axios's tests/unit/fromDataURI.test.js (MIT License) by tools/port-axios/port.js: do not edit, change the tool.
import { describe, it } from '@xufa/test';
import assert from 'assert';
import { fromDataURI } from '../support/internals.js';

describe('helpers::fromDataURI', () => {
  it('should return buffer from data uri', () => {
    const buffer = Buffer.from('123');

    const dataURI = 'data:application/octet-stream;base64,' + buffer.toString('base64');

    assert.deepStrictEqual(fromDataURI(dataURI, false), buffer);
  });
});
