// QR codes: what qrCode() makes is read back by a decoder (jsQR, as a camera would), for every level and lengths that
// take small and large versions; the otpauth:// URI of a secret; and the SVG.
import jsQR from 'jsqr';
import { qrCode, qrSvg, QrError, totpUri, generateSecret } from '../index.js';

// The pixels of a matrix (4 per module, a quiet zone of 4 modules), as an image of RGBA bytes.
function read(text, options) {
  const { size, modules } = qrCode(text, options);
  const scale = 4;
  const border = 4;
  const full = (size + border * 2) * scale;
  const data = new Uint8ClampedArray(full * full * 4);
  for (let py = 0; py < full; py += 1) {
    for (let px = 0; px < full; px += 1) {
      const x = Math.floor(px / scale) - border;
      const y = Math.floor(py / scale) - border;
      const dark = x >= 0 && y >= 0 && x < size && y < size && modules[y][x];
      const i = (py * full + px) * 4;
      data[i] = dark ? 0 : 255;
      data[i + 1] = data[i];
      data[i + 2] = data[i];
      data[i + 3] = 255;
    }
  }
  const found = jsQR(data, full, full);
  return found ? found.data : null;
}

describe('QR codes', () => {
  it('read back by a decoder: every level, from one byte to versions above 25, UTF-8 too', () => {
    for (const level of ['L', 'M', 'Q', 'H']) {
      for (const length of [1, 17, 100, 300, 900]) {
        const text = Array.from({ length }, (_, i) => 'otpauth://totp/Ä?x='[i % 19]).join('');
        expect([level, length, read(text, { level })]).toEqual([level, length, text]);
      }
    }
    // The smallest version that holds it: 17 bytes is version 1 at L, 2 at H.
    expect(qrCode('a'.repeat(17), { level: 'L' }).version).toBe(1);
    expect(qrCode('a'.repeat(17), { level: 'H' }).version).toBe(3);
    expect(qrCode('a'.repeat(900), { level: 'L' }).size).toBe(qrCode('a'.repeat(900), { level: 'L' }).version * 4 + 17);
  });

  it('the URI of a secret for an authenticator app; the SVG; errors', () => {
    const uri = totpUri({ secret: generateSecret(), issuer: 'Acme Books', label: 'ada@example.com' });
    expect(read(uri)).toBe(uri);
    const svg = qrSvg(uri, { size: 200 });
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 (\d+) \1" width="200" height="200"/);
    expect(svg).toMatch(/<path d="(M\d+,\d+h1v1h-1z)+" fill="#000"\/><\/svg>$/);
    expect(() => qrCode('x', { level: 'X' })).toThrow(QrError);
    expect(() => qrCode('x'.repeat(3000), { level: 'H' })).toThrow('The text is too long for a QR code (3000 bytes)');
  });
});
