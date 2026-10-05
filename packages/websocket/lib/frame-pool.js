'use strict';

// The buffers of masked frames (what a client sends), used again once the socket has written them. Writing into a
// buffer just allocated costs from 5 to 20 times what writing into one used before does (the pages of memory are
// new: 3 µs instead of 0.3 for 16 KB, 200 µs instead of 40 for 1 MB on Windows; on Linux about half of that), and a
// masked frame is a copy of the message. Only the Sender takes and gives them back, and only on a net.Socket, which
// is done with a buffer when it calls the callback of its write (another Duplex can hand it to someone else).

// Below, Buffer.allocUnsafe takes from the pool of Node.js already; above, a buffer is not kept.
const MIN = 4 * 1024;
const MAX = 4 * 1024 * 1024;
// What is kept, at most, between frames.
const MAX_FREE = 8;
const MAX_FREE_BYTES = 8 * 1024 * 1024;
const PAGE = 4096;

const free = [];
let freeBytes = 0;

/**
 * A buffer of at least `size` bytes (MIN to MAX), of its own (not a slice of the pool of Node.js).
 *
 * @param {Number} size The bytes needed
 * @return {Buffer} A buffer of `size` bytes or more, up to twice that
 */
function take(size) {
  for (let i = 0; i < free.length; i++) {
    const buffer = free[i];
    if (buffer.length >= size && buffer.length <= size * 2) {
      free[i] = free[free.length - 1];
      free.pop();
      freeBytes -= buffer.length;
      return buffer;
    }
  }
  return Buffer.allocUnsafeSlow(Math.ceil(size / PAGE) * PAGE);
}

/**
 * Gives back a buffer of take(), once nothing uses it.
 *
 * @param {Buffer} buffer The buffer
 */
function release(buffer) {
  if (buffer.length > MAX || free.length >= MAX_FREE || freeBytes + buffer.length > MAX_FREE_BYTES) return;
  free.push(buffer);
  freeBytes += buffer.length;
}

module.exports = { MAX, MIN, release, take, free };
