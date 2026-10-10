// A time in seconds since the epoch: `iat` (now, by default) plus a span, given in seconds or as text ('1d', '20h').
// undefined when the span is not one.
import ms from './ms.js';

const __default = function timespan(time, iat) {
  const timestamp = typeof iat === 'number' ? iat : Math.floor(Date.now() / 1000);
  if (typeof time === 'string') {
    const milliseconds = ms(time);
    if (milliseconds === undefined) return undefined;
    return Math.floor(timestamp + milliseconds / 1000);
  }
  if (typeof time === 'number') return timestamp + time;
  return undefined;
};
export default __default;
