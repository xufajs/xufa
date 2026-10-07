'use strict';

// The calls of the sources of AWS (Parameter Store of Systems Manager, Secrets Manager): JSON over POST, signed with
// Signature Version 4 (https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html).
// The credentials are those given, or those of the environment: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and
// AWS_SESSION_TOKEN; the region, AWS_REGION or AWS_DEFAULT_REGION. `endpoint` is another server of the same API
// (LocalStack, a VPC endpoint).
const crypto = require('node:crypto');

const ALGORITHM = 'AWS4-HMAC-SHA256';

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// The headers of a request, signed (host and x-amz-date are added; the token of a session too).
function sign({ method, url, headers, body, region, service, credentials, date = new Date() }) {
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const all = { ...headers, host: url.host, 'x-amz-date': amzDate };
  if (credentials.sessionToken) all['x-amz-security-token'] = credentials.sessionToken;
  const names = Object.keys(all).sort();
  const canonical = [
    method,
    url.pathname || '/',
    '',
    names.map((name) => `${name}:${String(all[name]).trim().replace(/\s+/g, ' ')}\n`).join(''),
    names.join(';'),
    sha256(body),
  ].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const key = hmac(hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, day), region), service), 'aws4_request');
  const signature = crypto
    .createHmac('sha256', key)
    .update([ALGORITHM, amzDate, scope, sha256(canonical)].join('\n'))
    .digest('hex');
  all.authorization = `${ALGORITHM} Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
  delete all.host; // fetch sets it
  return all;
}

function settings(options, env, what) {
  const region = options.region || env.AWS_REGION || env.AWS_DEFAULT_REGION;
  if (!region) throw new Error(`${what}: no region (region, AWS_REGION or AWS_DEFAULT_REGION)`);
  const credentials = options.credentials || {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    sessionToken: env.AWS_SESSION_TOKEN,
  };
  if (!credentials.accessKeyId || !credentials.secretAccessKey) {
    throw new Error(`${what}: no credentials (credentials, or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY)`);
  }
  return { region, credentials };
}

// A call of a JSON API of AWS: what it answers, or an error with its type and message.
async function call({ options, env, signal, service, host, target, payload, what }) {
  const { region, credentials } = settings(options, env, what);
  const url = new URL(options.endpoint || `https://${host}.${region}.amazonaws.com/`);
  const body = JSON.stringify(payload);
  const headers = sign({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': target },
    body,
    region,
    service,
    credentials,
  });
  let response;
  try {
    response = await fetch(url, { method: 'POST', headers, body, signal });
  } catch (err) {
    throw new Error(`${what}: ${err.cause ? err.cause.message || err.cause.code : err.message}`);
  }
  const text = await response.text();
  if (!response.ok) {
    let reason = text.slice(0, 200);
    try {
      const error = JSON.parse(text);
      const type = String(error.__type || error.code || '').replace(/^.*#/, '');
      reason = [type, error.message || error.Message].filter(Boolean).join(': ');
    } catch {
      // not JSON: the text
    }
    throw new Error(`${what}: ${response.status}${reason ? ` ${reason}` : ''}`);
  }
  return JSON.parse(text);
}

module.exports = { sign, call };
