// The serializer of errors written by the fallback error handler: { statusCode, code, error, message }.
const build = require('@xufa/serializer');

module.exports = build({
  type: 'object',
  properties: {
    statusCode: { type: 'number' },
    code: { type: 'string' },
    error: { type: 'string' },
    message: { type: 'string' },
  },
});
