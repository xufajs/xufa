// stream-throttle's Throttle: a pass-through at most `rate` bytes a second (chunkSize bytes at a time).
import { Transform } from 'node:stream';

class Throttle extends Transform {
  constructor({ rate, chunksize = rate / 10 }) {
    super();
    this.rate = rate;
    this.chunkSize = Math.max(1, Math.floor(chunksize));
    this.started = Date.now();
    this.sent = 0;
  }

  _transform(chunk, encoding, callback) {
    let offset = 0;
    const next = () => {
      if (offset >= chunk.length) {
        callback();
        return;
      }
      const piece = chunk.subarray(offset, offset + this.chunkSize);
      offset += piece.length;
      this.sent += piece.length;
      this.push(piece);
      // The time these bytes should have taken at the rate, less the time passed.
      const wait = (this.sent / this.rate) * 1000 - (Date.now() - this.started);
      if (wait > 0) setTimeout(next, wait);
      else setImmediate(next);
    };
    next();
  }
}

export { Throttle };
export default { Throttle };
