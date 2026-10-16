// dev-null: a Writable that drops what it is given.
import { Writable } from 'node:stream';

export default function devNull() {
  return new Writable({
    write(chunk, encoding, callback) {
      callback();
    },
  });
}
