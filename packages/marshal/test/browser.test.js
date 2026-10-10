// Without Buffer (in a browser): typed arrays, ArrayBuffer and DataView as base64 by btoa and atob, and errors and
// other objects not taken for Buffers.
import * as withBuffer from '../index.js';

describe('without Buffer', () => {
  let lib;
  const saved = globalThis.Buffer;
  beforeAll(async () => {
    // A module of its own (the query makes another instance), loaded without Buffer.
    globalThis.Buffer = undefined;
    lib = await import('../lib/marshal.js?without-buffer');
  });
  afterAll(() => {
    globalThis.Buffer = saved;
  });

  it('keeps typed arrays, ArrayBuffer and DataView, and errors', () => {
    const { stringify, parse } = lib;
    const value = {
      bytes: new Uint8Array([0, 1, 255]),
      floats: new Float64Array([1.5, -2]),
      raw: new Uint8Array([7, 8]).buffer,
      view: new DataView(new Uint8Array([9]).buffer),
      error: new TypeError('boom'),
    };
    const back = parse(stringify(value));
    expect([...back.bytes]).toEqual([0, 1, 255]);
    expect([...back.floats]).toEqual([1.5, -2]);
    expect([...new Uint8Array(back.raw)]).toEqual([7, 8]);
    expect(back.view.getUint8(0)).toBe(9);
    expect([back.error instanceof TypeError, back.error.message]).toEqual([true, 'boom']);
    // The same text as with Buffer.
    globalThis.Buffer = saved;
    expect(withBuffer.stringify({ bytes: new Uint8Array([0, 1, 255]) })).toBe(stringify({ bytes: new Uint8Array([0, 1, 255]) }));
    globalThis.Buffer = undefined;
  });
});
