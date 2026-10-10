// A Set-like object that keeps nothing, for when sockets do not have to be tracked.
export { noopSet as default } from './server.js';

// What require() gives (the tests of fastify are CommonJS).
export { noopSet as 'module.exports' } from './server.js';
