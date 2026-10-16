// Ported from axios's tests/unit/composeSignals.test.js (MIT License) by tools/port-axios/port.js: do not edit, change the tool.
import { describe, it } from '@xufa/test';
import assert from 'assert';
import { composeSignals } from '../support/internals.js';

describe('helpers::composeSignals', () => {
  const runIfAbortController = typeof AbortController === 'function' ? it : it.skip;

  runIfAbortController('should abort when any of the signals abort', () => {
    let called;

    const controllerA = new AbortController();
    const controllerB = new AbortController();

    const signal = composeSignals([controllerA.signal, controllerB.signal]);

    signal.addEventListener('abort', () => {
      called = true;
    });

    controllerA.abort(new Error('test'));

    assert.ok(called);
  });

  runIfAbortController('should abort on timeout', async () => {
    const signal = composeSignals([], 100);

    await new Promise((resolve) => {
      signal.addEventListener('abort', resolve);
    });

    assert.match(String(signal.reason), /timeout of 100ms exceeded/);
  });

  it('should return undefined if signals and timeout are not provided', () => {
    const signal = composeSignals([]);

    assert.strictEqual(signal, undefined);
  });
});
