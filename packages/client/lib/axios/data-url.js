// data: URLs, which the http adapter answers itself: decoded to a Buffer (or a Blob), and their size estimated before,
// for maxContentLength.
import { AxiosError } from './errors.js';
import { parseProtocol } from './url.js';

const DATA_URL_PATTERN = /^(?:([^;]+);)?(?:[^;]+;)?(base64|),([\s\S]*)$/;

/** The bytes of a data: URL: a Buffer, or a Blob of its type when asBlob (the default where there are Blobs). */
function fromDataURI(uri, asBlob, options) {
  const Blob_ = (options && options.Blob) || (typeof Blob !== 'undefined' ? Blob : null);
  const protocol = parseProtocol(uri);
  if (asBlob === undefined && Blob_) asBlob = true;
  if (protocol !== 'data') throw new AxiosError(`Unsupported protocol ${protocol}`, AxiosError.ERR_NOT_SUPPORT);
  const match = DATA_URL_PATTERN.exec(uri.slice(protocol.length + 1));
  if (!match) throw new AxiosError('Invalid URL', AxiosError.ERR_INVALID_URL);
  const [, mime, isBase64, body] = match;
  const buffer = Buffer.from(decodeURIComponent(body), isBase64 ? 'base64' : 'utf8');
  if (!asBlob) return buffer;
  if (!Blob_) throw new AxiosError('Blob is not supported', AxiosError.ERR_NOT_SUPPORT);
  return new Blob_([buffer], { type: mime });
}

const isHex = (code) => (code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);

/** The bytes a data: URL decodes to, without decoding it (%XX escapes and padding counted). */
function estimateDataURLDecodedBytes(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('data:')) return 0;
  const comma = url.indexOf(',');
  if (comma < 0) return 0;
  const meta = url.slice(5, comma);
  const body = url.slice(comma + 1);
  if (!/;base64/i.test(meta)) return Buffer.byteLength(body, 'utf8');

  const length = body.length;
  let effectiveLength = length;
  for (let i = 0; i < length; i++) {
    if (body.charCodeAt(i) === 37 && i + 2 < length && isHex(body.charCodeAt(i + 1)) && isHex(body.charCodeAt(i + 2))) {
      effectiveLength -= 2;
      i += 2;
    }
  }
  // '=' or '%3D' at the end, once or twice.
  const pct3D = (j) =>
    j >= 2 &&
    body.charCodeAt(j - 2) === 37 &&
    body.charCodeAt(j - 1) === 51 &&
    (body.charCodeAt(j) === 68 || body.charCodeAt(j) === 100);
  let pad = 0;
  let idx = length - 1;
  if (idx >= 0) {
    if (body.charCodeAt(idx) === 61) {
      pad++;
      idx--;
    } else if (pct3D(idx)) {
      pad++;
      idx -= 3;
    }
  }
  if (pad === 1 && idx >= 0 && (body.charCodeAt(idx) === 61 || pct3D(idx))) pad++;
  const bytes = Math.floor(effectiveLength / 4) * 3 - pad;
  return bytes > 0 ? bytes : 0;
}

export { fromDataURI, estimateDataURLDecodedBytes };
