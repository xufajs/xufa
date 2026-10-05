// The payload of a token (parsed when it is JSON), or { header, payload, signature } with { complete: true }; null
// when it is not a JWS. Nothing is verified.
const jws = require('./jws');

function decodeOrThrow(token, options = {}) {
  const opts = options || {};
  const decoded = jws.decode(token, opts);
  if (!decoded) return null;
  let { payload } = decoded;
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      if (parsed !== null && typeof parsed === 'object') payload = parsed;
    } catch {
      // a payload that is not JSON is given as it is
    }
  }
  if (opts.complete === true) return { header: decoded.header, payload, signature: decoded.signature };
  return payload;
}

// A payload that is not JSON gives null, as any token that is not one (jws throws a SyntaxError, which code reading the
// kid of a token before verifying it does not expect: jws#107). verify() uses decodeOrThrow, to say 'jwt malformed'.
function decode(token, options) {
  try {
    return decodeOrThrow(token, options);
  } catch (err) {
    if (err instanceof SyntaxError) return null;
    throw err;
  }
}

module.exports = decode;
module.exports.decodeOrThrow = decodeOrThrow;
