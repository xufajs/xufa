// The charsets of bodies: those of the WHATWG Encoding standard (Node's TextDecoder: a byte order mark at the start
// dropped), latin-1 as itself (iso-8859-1, latin1, binary: TextDecoder would read windows-1252), and utf-16 whose
// endianness comes from its byte order mark or, without one, from its first characters (ASCII as U+00xx).
const canonical = (encoding) =>
  String(encoding)
    .toLowerCase()
    .replace(/:\d{4}$|[^0-9a-z]/g, '');

const LATIN1 = new Set(['iso88591', 'latin1', 'binary', 'l1', 'isoir100', 'cp819', 'ibm819', 'csisolatin1']);

function detectUtf16(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  let le = 0;
  let be = 0;
  for (let i = 0; i + 1 < bytes.length && i < 200; i += 2) {
    if (bytes[i] === 0 && bytes[i + 1] !== 0) be += 1;
    if (bytes[i] !== 0 && bytes[i + 1] === 0) le += 1;
  }
  return be > le ? 'utf-16be' : 'utf-16le';
}

// A decoder of utf-16 that waits for 16 bytes (or the end) to know its endianness.
function utf16Decoder() {
  let decoder = null;
  let initial = [];
  let length = 0;
  const start = () => {
    const bytes = Buffer.concat(initial);
    decoder = new TextDecoder(detectUtf16(bytes));
    initial = [];
    return decoder.decode(bytes, { stream: true });
  };
  return {
    write(chunk) {
      if (decoder) return decoder.decode(chunk, { stream: true });
      initial.push(chunk);
      length += chunk.length;
      return length < 16 ? '' : start();
    },
    end() {
      const head = decoder ? '' : start();
      return head + decoder.decode();
    },
  };
}

function latin1Decoder() {
  return { write: (chunk) => chunk.toString('latin1'), end: () => '' };
}

// A decoder of a charset ({ write(chunk), end() } giving text), or null for one it does not know.
export function decoderOf(encoding) {
  const name = canonical(encoding);
  if (name === 'utf16' || name === 'ucs2') return utf16Decoder();
  if (LATIN1.has(name)) return latin1Decoder();
  let decoder;
  try {
    decoder = new TextDecoder(String(encoding).toLowerCase());
  } catch {
    return null;
  }
  return { write: (chunk) => decoder.decode(chunk, { stream: true }), end: () => decoder.decode() };
}

export const charsetExists = (encoding) => decoderOf(encoding) !== null;

export function decode(buffer, encoding) {
  const decoder = decoderOf(encoding);
  return decoder.write(buffer) + decoder.end();
}
