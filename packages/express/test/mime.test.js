// The types and charsets of lib/mime.js (generated from mime-db) against mime-types itself, for every extension.
import mimeTypes from 'mime-types';
import { lookup, charset, contentType } from '../lib/mime.js';

describe('mime', () => {
  it('lookup and contentType answer what mime-types answers, for every extension', () => {
    const extensions = Object.keys(mimeTypes.types);
    expect(extensions.length).toBeGreaterThan(1000);
    extensions.forEach((extension) => {
      expect([extension, lookup(extension)]).toEqual([extension, mimeTypes.lookup(extension)]);
      expect([extension, contentType(extension)]).toEqual([extension, mimeTypes.contentType(extension)]);
    });
  });

  it('and for paths, types with and without charsets, and what is not a type', () => {
    const values = ['a/b/file.HTML', '.json', 'x.unknownext', '', 'html', 'text/csv', 'application/json', 'image/png'];
    const more = ['text/plain; charset=latin1', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    [...values, ...more].forEach((value) => {
      expect([value, lookup(value)]).toEqual([value, mimeTypes.lookup(value)]);
      expect([value, contentType(value)]).toEqual([value, mimeTypes.contentType(value)]);
      expect([value, charset(value)]).toEqual([value, mimeTypes.charset(value)]);
    });
  });
});
