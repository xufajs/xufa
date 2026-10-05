// Named imports from ES modules (jsonwebtoken#997): Node finds the names of module.exports when they are plain names.
const path = require('node:path');
const { pathToFileURL } = require('node:url');

describe('ES modules', () => {
  it('import { sign, verify, decode, ... } from the package and from jws', async () => {
    const jwt = await import(pathToFileURL(path.join(__dirname, '../index.js')).href);
    for (const name of ['sign', 'verify', 'decode', 'JsonWebTokenError', 'NotBeforeError', 'TokenExpiredError']) {
      expect(typeof jwt[name]).toBe('function');
    }
    const jws = await import(pathToFileURL(path.join(__dirname, '../lib/jws.js')).href);
    for (const name of ['sign', 'verify', 'decode', 'isValid', 'createSign', 'createVerify']) {
      expect(typeof jws[name]).toBe('function');
    }
  });
});
