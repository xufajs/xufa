// The types of @xufa/http/form-data, as code of the form-data package uses it.
import { expectTypeOf } from '@xufa/test';
import * as fs from 'node:fs';
import type * as http from 'node:http';
import FormData = require('@xufa/http/form-data');

const form = new FormData({ maxDataSize: 20 * 1024 * 1024 });
form.append('title', 'Dune');
form.append('cover', Buffer.from('png'), 'cover.png');
form.append('notes', fs.createReadStream('notes.txt'), {
  filename: 'notes.txt',
  contentType: 'text/plain',
  knownLength: 12,
});
form.append('raw', 'x', { header: { 'X-Part': '1' } });

expectTypeOf(form.getHeaders()).toEqualTypeOf<FormData.Headers>();
expectTypeOf(form.getHeaders({ Authorization: 'Bearer x' })['content-type']).toBeAny();
expectTypeOf(form.getBoundary()).toEqualTypeOf<string>();
expectTypeOf(form.getBuffer()).toEqualTypeOf<Buffer>();
expectTypeOf(form.getLengthSync()).toEqualTypeOf<number>();
expectTypeOf(form.hasKnownLength()).toEqualTypeOf<boolean>();
form.getLength((err, length) => {
  expectTypeOf(err).toEqualTypeOf<Error | null>();
  expectTypeOf(length).toEqualTypeOf<number>();
});
expectTypeOf(form.submit('http://localhost:8080/upload')).toEqualTypeOf<http.ClientRequest>();
form.submit({ host: 'localhost', path: '/upload', protocol: 'https:' }, (err, res) => {
  expectTypeOf(res).toEqualTypeOf<http.IncomingMessage>();
});
expectTypeOf(FormData.LINE_BREAK).toEqualTypeOf<'\r\n'>();
expectTypeOf(form.pipe(fs.createWriteStream('body.bin'))).toEqualTypeOf<fs.WriteStream>();

// @ts-expect-error: options are a filename or an object
form.append('x', 'y', 3);
// @ts-expect-error: a boundary is a string
form.setBoundary(5);
