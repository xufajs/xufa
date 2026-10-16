// multipart/form-data read as it arrives: a writable stream that the body of a request is piped to, and that tells of
// each field (`field`: name, value, info) and each file (`file`: name, a readable stream of its bytes, info) as it
// comes, without keeping the body. The meaning is busboy's (what multer is made on), so that what reads it reads the
// same: a part is a file when it has a filename (or is application/octet-stream); file names lose their folders
// (preservePath keeps them) and are decoded as `defParamCharset` says ('latin1' by default, as busboy's; 'utf8' reads
// them as browsers send them; filename* says its own); values are decoded by their charset ('utf8' by default).
//
// Limits: fieldSize (1 MiB: a longer value is truncated, info.valueTruncated), fileSize (a file's stream gets 'limit'
// and its bytes stop there, stream.truncated), files, fields and parts (past them the parts are skipped, and
// 'filesLimit', 'fieldsLimit' or 'partsLimit' is told once). Errors: 'Multipart: Boundary not found' (thrown), 'Malformed
// part header', 'Unexpected end of form'. A file whose stream is not read holds the writes (backpressure).
//
//   const parser = new MultipartParser({ headers: req.headers, limits: { fileSize: 1e6 } });
//   parser.on('file', (name, stream, { filename, encoding, mimeType }) => stream.pipe(somewhere));
//   parser.on('field', (name, value) => ...);
//   parser.on('close', () => ...);
//   req.pipe(parser);
import { Readable, Writable } from 'node:stream';

const CRLF = Buffer.from('\r\n');
const HEADERS_END = Buffer.from('\r\n\r\n');

// Where the bytes of data from a position on begin the needle (\r\n--boundary) and reach its end; data.length if none.
function tailOf(data, from, needle) {
  for (let at = data.indexOf(13, from); at !== -1; at = data.indexOf(13, at + 1)) {
    if (needle.compare(data, at, data.length, 0, data.length - at) === 0) return at;
  }
  return data.length;
}
// (As Node's HTTP parser: the size of a part's headers, and how many are read.)
const MAX_HEADER_SIZE = 16 * 1024;
const MAX_HEADER_PAIRS = 2000;
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// (The same characters by code: a test per character without a regular expression.)
const TOKEN_CHAR = new Uint8Array(128);
for (const char of "!#$%&'*+-.^_`|~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz") {
  TOKEN_CHAR[char.charCodeAt(0)] = 1;
}
const isToken = (code) => code < 128 && TOKEN_CHAR[code] === 1;

// States of the parser.
const PREAMBLE = 0;
const AFTER_BOUNDARY = 1;
const HEADERS = 2;
const BODY = 3;
const SKIP = 4;
const DONE = 5;

// A text decoder of a charset ('utf8', 'latin1', 'utf16le', 'base64', or any TextDecoder knows), or null.
function decoderOf(charset) {
  const name = String(charset).toLowerCase();
  switch (name) {
    case 'utf8':
    case 'utf-8':
      return (bytes) => bytes.toString('utf8');
    case 'latin1':
    case 'ascii':
    case 'us-ascii':
    case 'iso-8859-1':
    case 'iso8859-1':
    case 'iso88591':
    case 'iso_8859-1':
    case 'iso_8859-1:1987':
    case 'windows-1252':
    case 'cp1252':
    case 'x-cp1252':
      return (bytes) => bytes.toString('latin1');
    case 'utf16le':
    case 'utf-16le':
    case 'ucs2':
    case 'ucs-2':
      return (bytes) => bytes.toString('utf16le');
    case 'base64':
      return (bytes) => bytes.toString('base64');
    default:
      try {
        const decoder = new TextDecoder(name);
        return (bytes) => decoder.decode(bytes);
      } catch {
        return null;
      }
  }
}

// The parameters after a value of a header (; name=value; name="quoted"; name*=charset'lang'percent-encoded), or
// null if malformed. Plain values are given to `decode` (they are latin1 text: their bytes as read), extended ones are
// decoded by their own charset.
function paramsOf(text, from, decode) {
  const params = Object.create(null);
  let i = from;
  const skipSpace = () => {
    while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i += 1;
  };
  while (i < text.length) {
    skipSpace();
    if (i === text.length) break;
    if (text[i] !== ';') return null;
    i += 1;
    skipSpace();
    if (i === text.length) return null;
    const nameStart = i;
    while (i < text.length && text[i] !== '=') {
      if (!isToken(text.charCodeAt(i))) return null;
      i += 1;
    }
    if (i === text.length || i === nameStart) return null;
    let name = text.slice(nameStart, i);
    i += 1;
    if (i === text.length) return null;
    let value;
    if (name.endsWith('*')) {
      // RFC 5987: charset'language'value, its bytes percent-encoded.
      const quote = text.indexOf("'", i);
      const second = quote === -1 ? -1 : text.indexOf("'", quote + 1);
      if (second === -1) return null;
      const charset = text.slice(i, quote);
      let end = second + 1;
      while (end < text.length && !/[\s;]/.test(text[end])) end += 1;
      const raw = text.slice(second + 1, end);
      if (raw === '' || /%(?![0-9A-Fa-f]{2})/.test(raw)) return null;
      const decoder = decoderOf(charset || 'utf8');
      if (!decoder) return null;
      value = decoder(
        Buffer.from(
          raw.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))),
          'latin1'
        )
      );
      i = end;
    } else if (text[i] === '"') {
      // A quoted string: \" and \\ escaped (another backslash is kept, as busboy does: Windows' paths).
      i += 1;
      let quoted = '';
      let closed = false;
      // (Runs of plain characters are sliced whole.)
      let run = i;
      while (i < text.length) {
        const code = text.charCodeAt(i);
        if (code === 92 && (text[i + 1] === '"' || text[i + 1] === '\\')) {
          quoted += text.slice(run, i) + text[i + 1];
          i += 2;
          run = i;
        } else if (code === 34) {
          quoted += text.slice(run, i);
          closed = true;
          i += 1;
          break;
        } else i += 1;
      }
      if (!closed) return null;
      value = decode(quoted);
    } else {
      const valueStart = i;
      while (i < text.length && isToken(text.charCodeAt(i))) i += 1;
      if (i === valueStart) return null;
      value = decode(text.slice(valueStart, i));
    }
    name = name.toLowerCase();
    if (params[name] === undefined) params[name] = value;
  }
  return params;
}

// { type, subtype, params } of a Content-Type, or null.
function parseContentType(text) {
  const match = /^([!#$%&'*+\-.^_`|~0-9A-Za-z]+)\/([!#$%&'*+\-.^_`|~0-9A-Za-z]+)/.exec(text);
  if (!match) return null;
  const params = paramsOf(text, match[0].length, (value) => value);
  if (!params) return null;
  return { type: match[1].toLowerCase(), subtype: match[2].toLowerCase(), params };
}

// { type, params } of a Content-Disposition, or null.
function parseDisposition(text, decode) {
  const match = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+/.exec(text);
  if (!match) return null;
  const params = paramsOf(text, match[0].length, decode);
  if (!params) return null;
  return { type: match[0].toLowerCase(), params };
}

// A path's last name ('' for '.' and '..').
function basename(path) {
  const name = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
  return name === '.' || name === '..' ? '' : name;
}

// Whether a line of a header has a control character (but tab).
function hasControl(line) {
  for (let i = 0; i < line.length; i += 1) {
    const code = line.charCodeAt(i);
    if ((code < 32 && code !== 9) || code === 127) return true;
  }
  return false;
}

// The headers of a part (name -> [values], names in lowercase), or null if malformed.
function parseHeaders(text) {
  const headers = Object.create(null);
  if (text === '') return headers;
  const lines = text.split('\r\n');
  let pairs = 0;
  let name = null;
  let value = '';
  const keep = () => {
    if (name === null) return;
    pairs += 1;
    if (pairs < MAX_HEADER_PAIRS) {
      const key = name.toLowerCase();
      if (headers[key] === undefined) headers[key] = [value];
      else headers[key].push(value);
    }
  };
  for (const line of lines) {
    if (hasControl(line)) return null;
    if (line[0] === ' ' || line[0] === '\t') {
      // A folded value.
      if (name === null) return null;
      value += line.replace(/^[ \t]+/, '');
      continue;
    }
    keep();
    const colon = line.indexOf(':');
    if (colon <= 0 || !TOKEN.test(line.slice(0, colon))) return null;
    name = line.slice(0, colon);
    value = line.slice(colon + 1).replace(/^[ \t]+/, '');
  }
  keep();
  return headers;
}

// The stream of a file's bytes; its reads release the writes held for it.
class FileStream extends Readable {
  constructor(parser) {
    super();
    this.truncated = false;
    this.parser = parser;
    this.once('end', () => {
      // (Writes held for it go on; and the parser ends when the last file was read.)
      this.release();
      this.parser.fileEnded();
    });
  }

  release() {
    const { waiting } = this.parser;
    if (waiting) {
      this.parser.waiting = null;
      waiting();
    }
  }

  _read() {
    this.release();
  }
}

class MultipartParser extends Writable {
  // headers: of the request; limits: { fieldSize, fileSize, files, fields, parts }; preservePath; defParamCharset
  // ('latin1'); defCharset ('utf8').
  constructor({ headers, limits = {}, preservePath = false, defParamCharset = 'latin1', defCharset = 'utf8' } = {}) {
    super({ autoDestroy: true, emitClose: true });
    const contentType = headers && headers['content-type'];
    if (typeof contentType !== 'string') throw new Error('Missing Content-Type');
    const type = parseContentType(contentType);
    if (!type) throw new Error('Malformed content type');
    if (type.type !== 'multipart' || type.subtype !== 'form-data') {
      throw new Error(`Unsupported content type: ${contentType}`);
    }
    if (typeof type.params.boundary !== 'string') throw new Error('Multipart: Boundary not found');
    this.needle = Buffer.from(`\r\n--${type.params.boundary}`);
    const decoder = decoderOf(defParamCharset || 'latin1') ?? decoderOf('latin1');
    // (Header values are read as latin1 text: their bytes as they came.)
    this.decodeParam = (value) => decoder(Buffer.from(value, 'latin1'));
    this.defCharset = defCharset;
    this.preservePath = preservePath;
    const limitOf = (name, fallback) => (typeof limits[name] === 'number' ? limits[name] : fallback);
    this.limits = {
      fieldSize: limitOf('fieldSize', 1024 * 1024),
      fileSize: limitOf('fileSize', Infinity),
      files: limitOf('files', Infinity),
      fields: limitOf('fields', Infinity),
      parts: limitOf('parts', Infinity),
    };
    this.state = PREAMBLE;
    // (The bytes not yet read: a tail that may begin a boundary, or headers not complete.)
    this.pending = CRLF;
    // (Boundaries met: the first one opens the first part.)
    this.parts = -1;
    this.files = 0;
    this.fields = 0;
    this.toldFiles = false;
    this.toldFields = false;
    this.part = null;
    this.complete = false;
    this.filesOpen = 0;
    this.waiting = null;
    this.finishing = null;
  }

  _write(chunk, encoding, callback) {
    let held = false;
    try {
      // (Mostly nothing is pending: the chunk is read as it came, not copied. When something is (the CRLF before the
      // first boundary, a tail that begins one), it is joined to the head of the chunk only, and the rest read in place.)
      const cut = this.needle.length + 1024;
      if (this.pending.length !== 0 && chunk.length > cut * 2) {
        held = this.scan(Buffer.concat([this.pending, chunk.subarray(0, cut)]));
        const rest = chunk.subarray(cut);
        held = this.scan(this.pending.length === 0 ? rest : Buffer.concat([this.pending, rest])) || held;
      } else held = this.scan(this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]));
    } catch (err) {
      callback(err);
      return;
    }
    // (A file that cannot take more: the next write waits for it to be read.)
    if (held) this.waiting = callback;
    else callback();
  }

  // Reads what can be read of the bytes, keeps the rest in pending; true when a file's stream is full.
  scan(data) {
    let offset = 0;
    let full = false;
    const { needle } = this;
    while (offset < data.length) {
      if (this.state === DONE) {
        offset = data.length;
        break;
      }
      if (this.state === AFTER_BOUNDARY) {
        if (data.length - offset < 2) break;
        if (data[offset] === 45 && data[offset + 1] === 45) {
          // --: the end of the form.
          this.complete = true;
          this.state = DONE;
          offset = data.length;
          break;
        }
        if (data[offset] === 13 && data[offset + 1] === 10) {
          offset += 2;
          // (Past the limit of parts, the rest is read and left.)
          this.state = this.parts >= this.limits.parts ? SKIP : HEADERS;
        } else this.state = SKIP;
        continue;
      }
      if (this.state === HEADERS) {
        // Headers end at an empty line. (A part needs a header; and a boundary before its headers end cuts them: as
        // busboy, which looks for boundaries first, both are malformed.)
        if (data[offset] === 13) {
          if (data.length - offset < 2) break;
          if (data[offset + 1] === 10) throw new Error('Malformed part header');
        }
        const end = data.indexOf(HEADERS_END, offset);
        const boundary = data.indexOf(needle, offset);
        if (boundary !== -1 && (end === -1 || boundary < end + HEADERS_END.length)) {
          throw new Error('Malformed part header');
        }
        if (end === -1) {
          if (data.length - offset > MAX_HEADER_SIZE) throw new Error('Malformed part header');
          break;
        }
        if (end - offset > MAX_HEADER_SIZE) throw new Error('Malformed part header');
        const headers = parseHeaders(data.latin1Slice(offset, end));
        if (!headers) throw new Error('Malformed part header');
        offset = end + HEADERS_END.length;
        this.startPart(headers);
        continue;
      }
      // Bytes of a part (or before the first boundary, or of a part left), up to the next boundary.
      const at = data.indexOf(needle, offset);
      if (at === -1) {
        // (The last bytes that begin a boundary, if any: kept for the next write.)
        const safe = tailOf(data, Math.max(offset, data.length - (needle.length - 1)), needle);
        if (this.state === BODY && safe > offset) full = this.partData(data.subarray(offset, safe)) || full;
        offset = safe;
        break;
      }
      if (this.state === BODY && at > offset) full = this.partData(data.subarray(offset, at)) || full;
      this.endPart();
      offset = at + needle.length;
      this.state = AFTER_BOUNDARY;
      this.parts += 1;
      if (this.parts === this.limits.parts) this.emit('partsLimit');
    }
    this.pending = Buffer.from(data.subarray(offset));
    return full;
  }

  startPart(headers) {
    this.state = SKIP;
    this.part = null;
    const disposition = headers['content-disposition'];
    if (!disposition) return;
    const parsed = parseDisposition(disposition[0], this.decodeParam);
    if (!parsed || parsed.type !== 'form-data') return;
    // (An empty name is none, as busboy's.)
    const name = parsed.params.name || undefined;
    let filename = parsed.params['filename*'] ?? parsed.params.filename;
    if (filename !== undefined && !this.preservePath) filename = basename(filename);
    let mimeType = 'text/plain';
    let charset = this.defCharset;
    // (The header as it came, too: info.contentType.)
    const contentType = headers['content-type'] ? headers['content-type'][0] : undefined;
    if (headers['content-type']) {
      const type = parseContentType(headers['content-type'][0]);
      if (type) {
        mimeType = `${type.type}/${type.subtype}`;
        if (typeof type.params.charset === 'string') charset = type.params.charset.toLowerCase();
      }
    }
    const encoding = headers['content-transfer-encoding']
      ? headers['content-transfer-encoding'][0].toLowerCase()
      : '7bit';
    if (mimeType === 'application/octet-stream' || filename !== undefined) {
      if (this.files === this.limits.files) {
        if (!this.toldFiles) {
          this.toldFiles = true;
          this.emit('filesLimit');
        }
        return;
      }
      this.files += 1;
      if (this.listenerCount('file') === 0) return;
      const stream = new FileStream(this);
      this.filesOpen += 1;
      this.part = { stream, size: 0 };
      this.state = BODY;
      this.emit('file', name, stream, { filename, encoding, mimeType, contentType });
      return;
    }
    if (this.fields === this.limits.fields) {
      if (!this.toldFields) {
        this.toldFields = true;
        this.emit('fieldsLimit');
      }
      return;
    }
    this.fields += 1;
    if (this.listenerCount('field') === 0) return;
    this.part = { name, chunks: [], size: 0, truncated: false, charset, encoding, mimeType, contentType };
    this.state = BODY;
  }

  // Bytes of the part being read; true when its file's stream is full.
  partData(bytes) {
    const { part } = this;
    if (part.stream) {
      const room = this.limits.fileSize - part.size;
      const kept = bytes.length > room ? bytes.subarray(0, room) : bytes;
      part.size += kept.length;
      if (part.size === this.limits.fileSize) {
        if (kept.length > 0) part.stream.push(kept);
        part.stream.truncated = true;
        part.stream.emit('limit');
        // (The rest of the file is read and left; its stream ends at its boundary.)
        this.state = SKIP;
        return false;
      }
      return !part.stream.push(kept);
    }
    const room = this.limits.fieldSize - part.size;
    const kept = bytes.length > room ? bytes.subarray(0, room) : bytes;
    part.chunks.push(kept);
    part.size += kept.length;
    if (part.size === this.limits.fieldSize && bytes.length >= room) {
      part.truncated = true;
      this.state = SKIP;
    }
    return false;
  }

  endPart() {
    const { part } = this;
    this.part = null;
    if (!part) return;
    if (part.stream) {
      part.stream.push(null);
      return;
    }
    const decode = decoderOf(part.charset) ?? decoderOf('utf8');
    const value = part.chunks.length === 0 ? '' : decode(Buffer.concat(part.chunks, part.size));
    this.emit('field', part.name, value, {
      nameTruncated: false,
      valueTruncated: part.truncated,
      encoding: part.encoding,
      mimeType: part.mimeType,
      contentType: part.contentType,
    });
  }

  fileEnded() {
    this.filesOpen -= 1;
    if (this.filesOpen === 0 && this.finishing) {
      const finish = this.finishing;
      this.finishing = null;
      // (Other listeners of the file's end first.)
      process.nextTick(finish);
    }
  }

  _final(callback) {
    if (!this.complete) {
      callback(new Error('Unexpected end of form'));
      return;
    }
    // (Finished when every file was read.)
    if (this.filesOpen > 0) this.finishing = () => callback();
    else callback();
  }

  _destroy(err, callback) {
    let error = err;
    if (!error && !this.complete) error = new Error('Unexpected end of form');
    if (this.part?.stream) {
      const { stream } = this.part;
      this.part = null;
      stream.destroy(err ?? new Error('Unexpected end of file'));
    }
    this.state = DONE;
    callback(error);
  }
}

export { MultipartParser, parseContentType, parseDisposition, decoderOf };
