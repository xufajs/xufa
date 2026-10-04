// What authentication a connection accepts (libpq's require_auth and channel_binding), and the hash of the
// certificate of a server that binds a SCRAM exchange to its TLS channel (tls-server-end-point, RFC 5929).
const crypto = require('node:crypto');
const { ConnectionError } = require('./errors');

const METHODS = new Set(['password', 'md5', 'scram-sha-256', 'oauth', 'gss', 'sspi', 'none']);
const CHANNEL_BINDING = new Set(['disable', 'prefer', 'require']);

// require_auth: a list of the methods the server may ask for ('scram-sha-256,oauth'), or of those it may not, every one
// negated ('!password,!md5'); 'none' is a server that asks for nothing. Gives null when anything goes.
function parseRequireAuth(value) {
  if (value === undefined || value === null || value === '') return null;
  const entries = String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const negated = entries.filter((entry) => entry.startsWith('!'));
  if (negated.length && negated.length !== entries.length) {
    throw new ConnectionError(`require_auth cannot mix methods and negated methods: ${value}`);
  }
  const names = entries.map((entry) => entry.replace(/^!/, ''));
  for (const name of names) {
    if (!METHODS.has(name)) throw new ConnectionError(`Unknown method in require_auth: ${name}`);
  }
  return { allow: !negated.length, methods: new Set(names), text: String(value) };
}

function parseChannelBinding(value) {
  if (value === undefined || value === null || value === '') return 'prefer';
  if (value === true) return 'prefer';
  if (value === false) return 'disable';
  if (!CHANNEL_BINDING.has(value)) {
    throw new ConnectionError(`channel_binding is disable, prefer or require, not ${value}`);
  }
  return value;
}

// Whether require_auth lets the server use a method ('none': it asked for nothing).
function allows(requirement, method) {
  if (!requirement) return true;
  return requirement.allow ? requirement.methods.has(method) : !requirement.methods.has(method);
}

function refuse(method, requirement) {
  return new ConnectionError(
    `The server asked for ${method === 'none' ? 'no authentication' : `${method} authentication`}, which require_auth (${
      requirement.text
    }) does not allow`
  );
}

// A small reader of DER: the tag, the content and the end of the element at an offset.
function element(buffer, offset) {
  const tag = buffer[offset];
  let length = buffer[offset + 1];
  let start = offset + 2;
  if (length & 0x80) {
    const bytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < bytes; i += 1) length = length * 256 + buffer[start + i];
    start += bytes;
  }
  return { tag, start, end: start + length };
}

function oidOf(buffer, { start, end }) {
  const parts = [Math.floor(buffer[start] / 40), buffer[start] % 40];
  let value = 0;
  for (let i = start + 1; i < end; i += 1) {
    value = value * 128 + (buffer[i] & 0x7f);
    if (!(buffer[i] & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join('.');
}

// The hash of the signature algorithms of certificates, as tls-server-end-point uses them (MD5 and SHA-1 are
// SHA-256).
const HASHES = {
  '1.2.840.113549.1.1.4': 'sha256', // md5WithRSAEncryption
  '1.2.840.113549.1.1.5': 'sha256', // sha1WithRSAEncryption
  '1.2.840.113549.1.1.14': 'sha224',
  '1.2.840.113549.1.1.11': 'sha256',
  '1.2.840.113549.1.1.12': 'sha384',
  '1.2.840.113549.1.1.13': 'sha512',
  '1.2.840.10045.4.1': 'sha256', // ecdsa-with-SHA1
  '1.2.840.10045.4.3.1': 'sha224',
  '1.2.840.10045.4.3.2': 'sha256',
  '1.2.840.10045.4.3.3': 'sha384',
  '1.2.840.10045.4.3.4': 'sha512',
  '1.2.840.10040.4.3': 'sha256', // dsa-with-sha1
  '2.16.840.1.101.3.4.3.1': 'sha224',
  '2.16.840.1.101.3.4.3.2': 'sha256',
};
// The hashes of RSASSA-PSS, in its parameters (SHA-1 by default).
const PSS_HASHES = {
  '1.3.14.3.2.26': 'sha256',
  '2.16.840.1.101.3.4.2.4': 'sha224',
  '2.16.840.1.101.3.4.2.1': 'sha256',
  '2.16.840.1.101.3.4.2.2': 'sha384',
  '2.16.840.1.101.3.4.2.3': 'sha512',
};

// The hash of the signature algorithm of a certificate (DER): Certificate ::= SEQUENCE { tbsCertificate,
// signatureAlgorithm AlgorithmIdentifier, signature }.
function certificateHash(der) {
  const certificate = element(der, 0);
  const tbs = element(der, certificate.start);
  const algorithm = element(der, tbs.end);
  const oidElement = element(der, algorithm.start);
  const oid = oidOf(der, oidElement);
  if (HASHES[oid]) return HASHES[oid];
  if (oid === '1.2.840.113549.1.1.10') {
    // RSASSA-PSS-params ::= SEQUENCE { hashAlgorithm [0] AlgorithmIdentifier DEFAULT sha1, ... }
    if (oidElement.end >= algorithm.end) return 'sha256';
    const params = element(der, oidElement.end);
    if (params.start < params.end && der[params.start] === 0xa0) {
      const hash = element(der, element(der, params.start).start);
      const hashOid = oidOf(der, element(der, hash.start));
      if (PSS_HASHES[hashOid]) return PSS_HASHES[hashOid];
      throw new ConnectionError(`Unknown hash of the RSASSA-PSS certificate of the server: ${hashOid}`);
    }
    return 'sha256';
  }
  throw new ConnectionError(
    `The certificate of the server is signed with an algorithm channel binding cannot use (${oid}): use channel_binding=disable`
  );
}

// The binding data of tls-server-end-point: the hash of the certificate of the server.
function endPoint(socket) {
  const certificate = socket.getPeerCertificate();
  if (!certificate || !certificate.raw) throw new ConnectionError('The server gave no certificate to bind to');
  return crypto.createHash(certificateHash(certificate.raw)).update(certificate.raw).digest();
}

module.exports = { parseRequireAuth, parseChannelBinding, allows, refuse, certificateHash, endPoint };
