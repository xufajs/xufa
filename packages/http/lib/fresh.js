// Freshness, as Express answers 304 (fresh 2, etag 1.8): whether the client's copy (If-None-Match, If-Modified-Since)
// is the response's, and the ETag of a body. For xufa.etag and @xufa/express.
import crypto from 'node:crypto';
import { tokens } from './vary.js';

export function parseHttpDate(date) {
  const time = date && Date.parse(date);
  return typeof time === 'number' ? time : NaN;
}

const NO_CACHE = /(?:^|,)\s*?no-cache\s*?(?:,|$)/;

// fresh: whether the client's copy (If-None-Match, If-Modified-Since) is the response's (etag, last-modified).
export function fresh(reqHeaders, etag, lastModified) {
  const modifiedSince = reqHeaders['if-modified-since'];
  const noneMatch = reqHeaders['if-none-match'];
  if (!modifiedSince && !noneMatch) return false;
  const cacheControl = reqHeaders['cache-control'];
  if (cacheControl && NO_CACHE.test(cacheControl)) return false;
  if (noneMatch) {
    if (noneMatch === '*') return true;
    if (!etag) return false;
    return tokens(noneMatch).some((match) => match === etag || match === `W/${etag}` || `W/${match}` === etag);
  }
  return Boolean(lastModified) && parseHttpDate(lastModified) <= parseHttpDate(modifiedSince);
}

// An ETag of a body (its length and SHA-1), strong or weak.
export function entityTag(body, weak) {
  let tag;
  if (body.length === 0) tag = '"0-2jmj7l5rSw0yVb/vlWAYkK/YBwk"';
  else {
    const length = typeof body === 'string' ? Buffer.byteLength(body, 'utf8') : body.length;
    tag = `"${length.toString(16)}-${crypto.hash('sha1', body, 'base64').substring(0, 27)}"`;
  }
  return weak ? `W/${tag}` : tag;
}
