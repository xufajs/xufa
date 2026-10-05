// Masking 8 bytes at a time (lib/buffer-util.js) gives what masking byte by byte gives: every size around the
// threshold and the words, every alignment of the buffer and of the offset of the output, and in place. The same for
// bufferutil when it is installed (a devDependency here), and for what is exported (one or the other).
const crypto = require('node:crypto');
const bufferUtil = require('../../lib/buffer-util');

const reference = (source, key) => Buffer.from(source.map((byte, i) => byte ^ key[i & 3]));
const SIZES = [0, 1, 7, 8, 9, 63, 383, 384, 385, 391, 392, 1000, 4096, 65537];

const IMPLEMENTATIONS = { javascript: bufferUtil.js, exported: bufferUtil };
try {
  IMPLEMENTATIONS.bufferutil = require('bufferutil');
} catch {
  // Not installed.
}

describe('bufferutil', () => {
  it('is used when installed, unless WS_NO_BUFFER_UTIL', () => {
    expect(bufferUtil.native).toBe(Boolean(IMPLEMENTATIONS.bufferutil) && !process.env.WS_NO_BUFFER_UTIL);
  });
});

for (const [name, { mask, unmask }] of Object.entries(IMPLEMENTATIONS))
  describe(`masking (${name})`, () => {
    it('unmask in place, at every alignment', () => {
      for (const size of SIZES) {
        for (let shift = 0; shift < 8; shift += 1) {
          const key = crypto.randomBytes(4);
          const data = crypto.randomBytes(size);
          const holder = Buffer.alloc(size + shift);
          const buffer = holder.subarray(shift);
          data.copy(buffer);
          unmask(buffer, key);
          expect(buffer.equals(reference(data, key))).toBe(true);
        }
      }
    });

    it('mask into an output at an offset, at every alignment of both', () => {
      for (const size of SIZES) {
        for (let shift = 0; shift < 8; shift += 3) {
          for (let offset = 0; offset < 8; offset += 1) {
            const key = crypto.randomBytes(4);
            const source = crypto.randomBytes(size + shift).subarray(shift);
            const output = Buffer.alloc(size + offset + 2, 0xaa);
            mask(source, key, output, offset, size);
            expect(output.subarray(offset, offset + size).equals(reference(source, key))).toBe(true);
            // Nothing written outside.
            expect(output.subarray(0, offset).every((byte) => byte === 0xaa)).toBe(true);
            expect(output.subarray(offset + size).every((byte) => byte === 0xaa)).toBe(true);
          }
        }
      }
    });

    it('mask of a source longer than the length masks only the length', () => {
      const key = crypto.randomBytes(4);
      const source = crypto.randomBytes(1000);
      const output = Buffer.alloc(500);
      mask(source, key, output, 0, 500);
      expect(output.equals(reference(source.subarray(0, 500), key))).toBe(true);
    });
  });
