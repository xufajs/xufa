// QR codes (ISO/IEC 18004), with no dependencies: the matrix of a text (as UTF-8 bytes, versions 1 to 40, error
// correction L, M, Q or H) and its SVG, for the otpauth:// URIs an authenticator app scans (totpUri()).
//
//   const svg = qrSvg(totpUri({ secret, issuer: 'App', label: user.email })); // <svg ...> to put in a page
//
// The steps: the bytes in segments of bits, Reed-Solomon codes by blocks, interleaved; the function patterns (finders,
// timing, alignment, format and version), the data in zigzag, and the mask (of eight) that looks least like them.

const LEVELS = { L: 0, M: 1, Q: 2, H: 3 };
// The bits of each level in the format information.
const FORMAT_BITS = [1, 0, 3, 2];
// By level and version (index 0 unused): codewords of error correction per block, and blocks.
const ECC_PER_BLOCK = [
  [
    -1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  [
    -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  ],
  [
    -1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  [
    -1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
];
const BLOCKS = [
  [
    -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19,
    19, 20, 21, 22, 24, 25,
  ],
  [
    -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31,
    33, 35, 37, 38, 40, 43, 45, 47, 49,
  ],
  [
    -1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43,
    45, 48, 51, 53, 56, 59, 62, 65, 68,
  ],
  [
    -1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48,
    51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
  ],
];

class QrError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QrError';
  }
}

const bitOf = (value, index) => ((value >>> index) & 1) !== 0;

// The modules of a version that hold data (all but the function patterns), in bits.
function rawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const aligns = Math.floor(version / 7) + 2;
    result -= (25 * aligns - 10) * aligns - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

const dataCodewords = (version, level) =>
  Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[level][version] * BLOCKS[level][version];

// Multiplication in GF(2^8) modulo x^8 + x^4 + x^3 + x^2 + 1.
function multiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function divisorOf(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = multiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = multiply(root, 0x02);
  }
  return result;
}

function remainderOf(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    for (let i = 0; i < divisor.length; i += 1) result[i] ^= multiply(divisor[i], factor);
  }
  return result;
}

// The codewords of the data with those of error correction, by blocks, interleaved.
function withErrorCorrection(data, version, level) {
  const blocks = BLOCKS[level][version];
  const eccLength = ECC_PER_BLOCK[level][version];
  const raw = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blocks - (raw % blocks);
  const shortLength = Math.floor(raw / blocks);
  const divisor = divisorOf(eccLength);
  const made = [];
  for (let i = 0, k = 0; i < blocks; i += 1) {
    const part = data.slice(k, k + shortLength - eccLength + (i < shortBlocks ? 0 : 1));
    k += part.length;
    const ecc = remainderOf(part, divisor);
    if (i < shortBlocks) part.push(0);
    made.push(part.concat(ecc));
  }
  const result = [];
  for (let i = 0; i < made[0].length; i += 1) {
    for (let j = 0; j < made.length; j += 1) {
      // The padding of the short blocks is not sent.
      if (i !== shortLength - eccLength || j >= shortBlocks) result.push(made[j][i]);
    }
  }
  return result;
}

function alignmentPositions(version, size) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const result = [6];
  for (let position = size - 7; result.length < count; position -= step) result.splice(1, 0, position);
  return result;
}

class Matrix {
  constructor(version) {
    this.version = version;
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    this.functional = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
  }

  setFunction(x, y, dark) {
    this.modules[y][x] = dark;
    this.functional[y][x] = true;
  }

  drawFunctionPatterns() {
    const { size } = this;
    for (let i = 0; i < size; i += 1) {
      this.setFunction(6, i, i % 2 === 0);
      this.setFunction(i, 6, i % 2 === 0);
    }
    for (const [x, y] of [
      [3, 3],
      [size - 4, 3],
      [3, size - 4],
    ]) {
      for (let dy = -4; dy <= 4; dy += 1) {
        for (let dx = -4; dx <= 4; dx += 1) {
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < size && yy >= 0 && yy < size) this.setFunction(xx, yy, distance !== 2 && distance !== 4);
        }
      }
    }
    const positions = alignmentPositions(this.version, size);
    const last = positions.length - 1;
    for (let i = 0; i <= last; i += 1) {
      for (let j = 0; j <= last; j += 1) {
        // Not over the finders.
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            this.setFunction(positions[i] + dx, positions[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }
    }
    // Reserved now (with mask 0), drawn again with the mask chosen.
    this.drawFormat(0, 0);
    this.drawVersion();
  }

  drawFormat(level, mask) {
    const data = (FORMAT_BITS[level] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const { size } = this;
    for (let i = 0; i <= 5; i += 1) this.setFunction(8, i, bitOf(bits, i));
    this.setFunction(8, 7, bitOf(bits, 6));
    this.setFunction(8, 8, bitOf(bits, 7));
    this.setFunction(7, 8, bitOf(bits, 8));
    for (let i = 9; i < 15; i += 1) this.setFunction(14 - i, 8, bitOf(bits, i));
    for (let i = 0; i < 8; i += 1) this.setFunction(size - 1 - i, 8, bitOf(bits, i));
    for (let i = 8; i < 15; i += 1) this.setFunction(8, size - 15 + i, bitOf(bits, i));
    // Always dark.
    this.setFunction(8, size - 8, true);
  }

  drawVersion() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const dark = bitOf(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunction(a, b, dark);
      this.setFunction(b, a, dark);
    }
  }

  // The codewords in zigzag: columns of two from the right, up and down, skipping the vertical timing pattern.
  drawCodewords(codewords) {
    const { size } = this;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < size; vertical += 1) {
        for (let j = 0; j < 2; j += 1) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vertical : vertical;
          if (!this.functional[y][x] && i < codewords.length * 8) {
            this.modules[y][x] = bitOf(codewords[i >>> 3], 7 - (i & 7));
            i += 1;
          }
        }
      }
    }
  }

  // Masks are their own inverse: applied twice, the data is back.
  applyMask(mask) {
    const { size } = this;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (this.functional[y][x]) continue;
        let invert;
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0;
            break;
          case 1:
            invert = y % 2 === 0;
            break;
          case 2:
            invert = x % 3 === 0;
            break;
          case 3:
            invert = (x + y) % 3 === 0;
            break;
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            break;
          case 5:
            invert = ((x * y) % 2) + ((x * y) % 3) === 0;
            break;
          case 6:
            invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
            break;
          default:
            invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        if (invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  // How much a masked matrix looks like what confuses readers (the rules of the standard): runs of five or more,
  // blocks of 2x2, patterns like the finders, and an unbalanced count of dark modules.
  penalty() {
    const { size, modules } = this;
    let result = 0;
    const lines = [];
    for (let y = 0; y < size; y += 1) lines.push(modules[y]);
    for (let x = 0; x < size; x += 1) lines.push(modules.map((row) => row[x]));
    const finder = [true, false, true, true, true, false, true];
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= size; i += 1) {
        if (i < size && line[i] === line[i - 1]) run += 1;
        else {
          if (run >= 5) result += 3 + (run - 5);
          run = 1;
        }
      }
      // 1:1:3:1:1 with four light modules before or after it (outside the matrix is light).
      const at = (i) => (i >= 0 && i < size ? line[i] : false);
      for (let i = -4; i < size; i += 1) {
        if (!finder.every((dark, k) => at(i + k) === dark)) continue;
        const before = [1, 2, 3, 4].every((k) => !at(i - k));
        const after = [7, 8, 9, 10].every((k) => !at(i + k));
        if (before || after) result += 40;
      }
    }
    for (let y = 0; y < size - 1; y += 1) {
      for (let x = 0; x < size - 1; x += 1) {
        const color = modules[y][x];
        if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) result += 3;
      }
    }
    let dark = 0;
    for (const row of modules) for (const module of row) if (module) dark += 1;
    const total = size * size;
    result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return result;
  }
}

// The matrix of a text: { version, size, modules } (modules[y][x], true is dark), the smallest version that holds it.
function qrCode(text, { level = 'M', minVersion = 1 } = {}) {
  const ecl = LEVELS[level];
  if (ecl === undefined) throw new QrError(`The level of a QR code is L, M, Q or H, not ${level}`);
  const bytes = [...Buffer.from(String(text), 'utf8')];
  let version = Math.max(1, Math.min(40, minVersion));
  for (; ; version += 1) {
    if (version > 40) throw new QrError(`The text is too long for a QR code (${bytes.length} bytes)`);
    const lengthBits = version <= 9 ? 8 : 16;
    if (bytes.length < 2 ** lengthBits && 4 + lengthBits + bytes.length * 8 <= dataCodewords(version, ecl) * 8) break;
  }
  // The bits: byte mode (0100), the length, the bytes, a terminator, then pad bytes.
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);
  const capacity = dataCodewords(version, ecl) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));

  const matrix = new Matrix(version);
  matrix.drawFunctionPatterns();
  matrix.drawCodewords(withErrorCorrection(data, version, ecl));
  let best = 0;
  let lowest = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    matrix.applyMask(mask);
    matrix.drawFormat(ecl, mask);
    const penalty = matrix.penalty();
    if (penalty < lowest) {
      best = mask;
      lowest = penalty;
    }
    matrix.applyMask(mask);
  }
  matrix.applyMask(best);
  matrix.drawFormat(ecl, best);
  return { version, size: matrix.size, modules: matrix.modules };
}

// The SVG of the QR code of a text: dark modules as one path, with a quiet zone of `border` modules (4).
function qrSvg(text, { level = 'M', border = 4, dark = '#000', light = '#fff', size: pixels } = {}) {
  const { size, modules } = qrCode(text, { level });
  const full = size + border * 2;
  let path = '';
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) if (modules[y][x]) path += `M${x + border},${y + border}h1v1h-1z`;
  }
  const dimensions = pixels ? ` width="${Number(pixels)}" height="${Number(pixels)}"` : '';
  const escape = (value) => String(value).replace(/[<>&"]/g, '');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}"${dimensions} shape-rendering="crispEdges">` +
    `<rect width="100%" height="100%" fill="${escape(light)}"/><path d="${path}" fill="${escape(dark)}"/></svg>`
  );
}

export { qrCode, qrSvg, QrError };
