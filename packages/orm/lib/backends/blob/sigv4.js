// AWS Signature Version 4: the signatures of requests to S3 (and to stores that speak its API: R2, MinIO, OSS...),
// in the Authorization header (sign) or in the query of a URL that works without credentials for a while (presign).
// https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html
const crypto = require('node:crypto');

const ALGORITHM = 'AWS4-HMAC-SHA256';
const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const UNSIGNED = 'UNSIGNED-PAYLOAD';

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// URI encoding of AWS: every byte but A-Z a-z 0-9 - _ . ~ (and / in paths) as %XX.
function encode(text, keepSlash = false) {
  const encoded = encodeURIComponent(text).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return keepSlash ? encoded.replace(/%2F/g, '/') : encoded;
}

// 20130524T000000Z and 20130524.
function stamps(date) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, day: iso.slice(0, 8) };
}

// The query of a URL as AWS orders it: by key, then value, each encoded.
function canonicalQuery(searchParams) {
  return [...searchParams.entries()]
    .map(([key, value]) => [encode(key), encode(value)])
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

// The path of a URL as AWS signs it: its segments decoded, then encoded as AWS does (S3: not normalized).
function canonicalPath(pathname) {
  return pathname
    .split('/')
    .map((segment) => encode(decodeURIComponent(segment)))
    .join('/');
}

function signingKey(secret, day, region, service) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), service), 'aws4_request');
}

// The canonical request, the string to sign and the signature of a request.
function signature({ method, url, headers, payloadHash, region, service, credentials, date }) {
  const { amzDate, day } = stamps(date);
  const names = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  const canonicalHeaders = names.map((name) => `${name}:${String(lower[name]).trim().replace(/\s+/g, ' ')}\n`).join('');
  const signedHeaders = names.join(';');
  const canonical = [
    method,
    canonicalPath(url.pathname),
    canonicalQuery(url.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, scope, sha256(canonical)].join('\n');
  const signed = crypto
    .createHmac('sha256', signingKey(credentials.secretAccessKey, day, region, service))
    .update(stringToSign)
    .digest('hex');
  return { signed, signedHeaders, scope, canonical, stringToSign };
}

// The headers of a request, signed: host, x-amz-date, x-amz-content-sha256 (and the session token) are added.
function sign({
  method,
  url,
  headers = {},
  payloadHash = EMPTY_HASH,
  region,
  service = 's3',
  credentials,
  date = new Date(),
}) {
  const { amzDate } = stamps(date);
  const all = { ...headers, host: url.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash };
  if (credentials.sessionToken) all['x-amz-security-token'] = credentials.sessionToken;
  const { signed, signedHeaders, scope } = signature({
    method,
    url,
    headers: all,
    payloadHash,
    region,
    service,
    credentials,
    date,
  });
  all.authorization = `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signed}`;
  delete all.host; // fetch sets it
  return all;
}

// A URL signed in its query: it works without credentials for `expiresIn` seconds (up to 7 days).
function presign({ method = 'GET', url, region, service = 's3', credentials, date = new Date(), expiresIn = 900 }) {
  const { amzDate, day } = stamps(date);
  const signedUrl = new URL(url);
  const query = signedUrl.searchParams;
  query.set('X-Amz-Algorithm', ALGORITHM);
  query.set('X-Amz-Credential', `${credentials.accessKeyId}/${day}/${region}/${service}/aws4_request`);
  query.set('X-Amz-Date', amzDate);
  query.set('X-Amz-Expires', String(expiresIn));
  query.set('X-Amz-SignedHeaders', 'host');
  if (credentials.sessionToken) query.set('X-Amz-Security-Token', credentials.sessionToken);
  const { signed } = signature({
    method,
    url: signedUrl,
    headers: { host: signedUrl.host },
    payloadHash: UNSIGNED,
    region,
    service,
    credentials,
    date,
  });
  query.set('X-Amz-Signature', signed);
  return signedUrl.toString();
}

module.exports = { sign, presign, signature, encode, sha256, EMPTY_HASH, UNSIGNED };
