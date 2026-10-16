// Content negotiation (accepts, negotiator): which of the types, encodings, charsets or languages offered a request
// prefers, by its Accept headers (their q, then how specific the match is, then their order, then the offer's).
import { parseMedia } from './headers.js';
import { lookup } from './mime.js';

// The entries of an Accept header: [{ type, parameters }].
function entriesOf(header) {
  const entries = [];
  let index = 0;
  while (index < header.length) {
    let start = index;
    while (header.charCodeAt(start) === 0x20 || header.charCodeAt(start) === 0x09) start += 1;
    const parsed = parseMedia(header, true, start);
    parsed.type = header.slice(start, start + parsed.type.length);
    entries.push(parsed);
    index = parsed.index + 1;
  }
  return entries;
}

const quality = (parameters) => (parameters.q ? parseFloat(parameters.q) : 1);

const compare = (a, b) => b.q - a.q || b.s - a.s || a.o - b.o || a.i - b.i || 0;

// The offers in the order the accepted prefer them (those it refuses, q=0 or no match, left out). specify(offer,
// accepted) is { s } (how specific) or null.
function preferred(accepted, offers, specify) {
  const priorities = offers.map((offer, index) => {
    let priority = { o: -1, q: 0, s: 0, i: index };
    accepted.forEach((spec) => {
      const s = specify(offer, spec);
      if (s === null) return;
      const candidate = { i: index, o: spec.i, q: spec.q, s };
      if ((priority.s - candidate.s || priority.q - candidate.q || priority.o - candidate.o) < 0) priority = candidate;
    });
    return priority;
  });
  return priorities
    .filter((priority) => priority.q > 0)
    .sort(compare)
    .map((priority) => offers[priority.i]);
}

// --- Media types ---

function mediaOf(parsed, i) {
  const slash = parsed.type.indexOf('/');
  if (slash === -1) return null;
  const q = quality(parsed.parameters);
  delete parsed.parameters.q;
  return { type: parsed.type.slice(0, slash), subtype: parsed.type.slice(slash + 1), params: parsed.parameters, q, i };
}

function acceptedMedia(header) {
  return entriesOf(header)
    .map(mediaOf)
    .filter(Boolean)
    .map((entry, i) => ({ ...entry, i: entry.i ?? i }));
}

function specifyMedia(offer, spec) {
  const p = mediaOf(parseMedia(offer), 0);
  if (!p) return null;
  let s = 0;
  if (spec.type.toLowerCase() === p.type.toLowerCase()) s |= 4;
  else if (spec.type !== '*') return null;
  if (spec.subtype.toLowerCase() === p.subtype.toLowerCase()) s |= 2;
  else if (spec.subtype !== '*') return null;
  const keys = Object.keys(spec.params);
  if (keys.length > 0) {
    const all = keys.every(
      (key) =>
        spec.params[key] === '*' || (spec.params[key] || '').toLowerCase() === (p.params[key] || '').toLowerCase()
    );
    if (!all) return null;
    s |= 1;
  }
  return s;
}

// The media types a request accepts (offers: those of them it prefers, in order).
export function mediaTypes(accept, offers) {
  const accepted = acceptedMedia(accept === undefined ? '*/*' : accept || '');
  if (!offers) {
    return accepted
      .filter((spec) => spec.q > 0)
      .sort(compare)
      .map((spec) => `${spec.type}/${spec.subtype}`);
  }
  return preferred(accepted, offers, specifyMedia);
}

// --- Charsets and encodings ---

function tokensOf(header) {
  return entriesOf(header)
    .filter((parsed) => parsed.type)
    .map((parsed, i) => ({ value: parsed.type, q: quality(parsed.parameters), i }));
}

const specifyToken = (offer, spec) => {
  if (spec.value.toLowerCase() === offer.toLowerCase()) return 1;
  return spec.value === '*' ? 0 : null;
};

function plain(accepted) {
  return accepted
    .filter((spec) => spec.q > 0)
    .sort(compare)
    .map((spec) => spec.value);
}

export function charsets(header, offers) {
  const accepted = tokensOf(header === undefined ? '*' : header || '');
  return offers ? preferred(accepted, offers, specifyToken) : plain(accepted);
}

// (identity is accepted unless the header says otherwise, at the lowest q given.)
export function encodings(header, offers) {
  const accepted = tokensOf(header || '');
  if (!accepted.some((spec) => specifyToken('identity', spec) !== null)) {
    const lowest = accepted.reduce((min, spec) => Math.min(min, spec.q || 1), 1);
    accepted.push({ value: 'identity', q: lowest, i: accepted.length });
  }
  return offers ? preferred(accepted, offers, specifyToken) : plain(accepted);
}

// --- Languages ---

function languageOf(full, q, i) {
  const hyphen = full.indexOf('-');
  return {
    prefix: hyphen === -1 ? full : full.slice(0, hyphen),
    suffix: hyphen === -1 ? undefined : full.slice(hyphen + 1),
    q,
    i,
    full,
  };
}

function specifyLanguage(offer, spec) {
  const type = parseMedia(offer).type;
  if (!type) return null;
  const p = languageOf(type, 1, 0);
  const full = spec.full.toLowerCase();
  if (full === p.full.toLowerCase()) return 4;
  if (spec.prefix.toLowerCase() === p.full.toLowerCase()) return 2;
  if (full === p.prefix.toLowerCase()) return 1;
  return spec.full === '*' ? 0 : null;
}

export function languages(header, offers) {
  const accepted = entriesOf(header === undefined ? '*' : header || '')
    .filter((parsed) => parsed.type)
    .map((parsed, i) => languageOf(parsed.type, quality(parsed.parameters), i));
  if (offers) return preferred(accepted, offers, specifyLanguage);
  return accepted
    .filter((spec) => spec.q > 0)
    .sort(compare)
    .map((spec) => spec.full);
}

// --- accepts' API: the first offer the request prefers, false when it takes none; all it accepts without offers ---

const flat = (args) => (args.length === 1 && Array.isArray(args[0]) ? args[0] : args);

export function acceptsTypes(headers, args) {
  const types = flat(args);
  if (types.length === 0) return mediaTypes(headers.accept);
  if (!headers.accept) return types[0];
  const mimes = types.map((type) => (type.indexOf('/') === -1 ? lookup(type) : type));
  const first = mediaTypes(
    headers.accept,
    mimes.filter((type) => typeof type === 'string')
  )[0];
  return first ? types[mimes.indexOf(first)] : false;
}

export function acceptsEncodings(headers, args) {
  const offers = flat(args);
  if (offers.length === 0) return encodings(headers['accept-encoding']);
  return encodings(headers['accept-encoding'], offers)[0] || false;
}

export function acceptsCharsets(headers, args) {
  const offers = flat(args);
  if (offers.length === 0) return charsets(headers['accept-charset']);
  return charsets(headers['accept-charset'], offers)[0] || false;
}

export function acceptsLanguages(headers, args) {
  const offers = flat(args);
  if (offers.length === 0) return languages(headers['accept-language']);
  return languages(headers['accept-language'], offers)[0] || false;
}
