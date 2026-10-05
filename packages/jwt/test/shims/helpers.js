// What the suites of jws and jwa take from small packages, by Node.js itself: safe-buffer, semver (their checks of
// versions of Node.js older than 22: all true), base64url and jwk-to-pem.
const crypto = require('node:crypto');

const semver = {
  clean: (version) => String(version).replace(/^v/, ''),
  gte: () => true,
  satisfies: () => true,
};

function base64url(input, encoding) {
  return Buffer.from(input, encoding).toString('base64url');
}
base64url.toBuffer = (text) => Buffer.from(text, 'base64url');
base64url.decode = (text, encoding = 'utf8') => Buffer.from(text, 'base64url').toString(encoding);
base64url.encode = (input, encoding) => base64url(input, encoding);

function jwkToPem(jwk, options = {}) {
  if (options.private)
    return crypto.createPrivateKey({ key: jwk, format: 'jwk' }).export({ type: 'pkcs8', format: 'pem' });
  return crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
}

module.exports = { safeBuffer: { Buffer }, semver, base64url, jwkToPem };
