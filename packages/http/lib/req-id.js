// Ids of requests: req-1, req-2... (in base 36), or the value of a header when requestIdHeader is set.
const { kGenReqId } = require('./symbols');

// The largest SMI: ids stay small integers for V8 (and wrap around after 2^31 requests).
const MAX_INT = 2147483647;

function buildDefaultGenReqId() {
  let next = 0;
  return function genReqId() {
    next = (next + 1) & MAX_INT; // eslint-disable-line no-bitwise
    return `req-${next.toString(36)}`;
  };
}

function reqIdGenFactory(requestIdHeader, optGenReqId) {
  const genReqId = optGenReqId || buildDefaultGenReqId();
  if (!requestIdHeader) return genReqId;
  return function genReqIdFromHeader(req) {
    return req.headers[requestIdHeader] || genReqId(req);
  };
}

function getGenReqId(server, req) {
  return server[kGenReqId](req);
}

module.exports = { reqIdGenFactory, getGenReqId };
