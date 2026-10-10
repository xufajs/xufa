// The serializer of errors written by the fallback error handler: { statusCode, code, error, message }.
import build from '@xufa/serializer';

const __default = build({
  type: 'object',
  properties: {
    statusCode: { type: 'number' },
    code: { type: 'string' },
    error: { type: 'string' },
    message: { type: 'string' },
  },
});
export default __default;

// What require() gives (the tests of fastify are CommonJS).
export { __default as 'module.exports' };
