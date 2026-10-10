// A connection between two nodes over TCP: frames of a length (4 bytes) and a body. It starts with a "hi" of each side
// (JSON: id, service, a random nonce); with a secret, both derive the key of this connection from the secret, the
// service and both nonces (HKDF), and every frame after is sealed with AES-256-GCM under a counter of its direction:
// a frame cannot be read, changed, dropped, reordered or replayed (from this connection or a recorded one), and the
// first sealed frame of each side ("auth") proves it knows the secret. Bodies are v8 serializations.
import crypto from 'node:crypto';
import v8 from 'node:v8';
import { EventEmitter } from 'node:events';

const HANDSHAKE_TIMEOUT = 5000;
const MAX_HI = 4096;

function baseKey(secret, service) {
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'xufa-netcache', `service:${service}`, 32));
}

class Wire extends EventEmitter {
  // `key`: baseKey() of the secret, or null (insecure). `dialer`: this side opened the connection.
  constructor(socket, { key, service, hi, dialer, maxFrame }) {
    super();
    this.socket = socket;
    this.key = key;
    this.service = service;
    this.dialer = dialer;
    this.maxFrame = maxFrame;
    this.nonce = crypto.randomBytes(16);
    this.state = 'hi'; // hi -> auth -> ready -> closed
    this.peer = null;
    this.sendCounter = 0n;
    this.recvCounter = 0n;
    this.buffer = Buffer.alloc(0);
    this.timer = setTimeout(() => this.close(new Error('the handshake took too long')), HANDSHAKE_TIMEOUT);
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 10000);
    socket.on('data', (chunk) => this.#data(chunk));
    socket.on('error', (err) => this.close(err));
    socket.on('close', () => this.close());
    this.#write(Buffer.from(JSON.stringify({ t: 'hi', ...hi, service, nonce: this.nonce.toString('base64') })));
  }

  get ready() {
    return this.state === 'ready';
  }

  send(message) {
    if (this.state !== 'ready' && !(this.state === 'auth' && message.t === 'auth')) return false;
    const body = v8.serialize(message);
    this.#write(this.session ? this.#seal(body) : body);
    return true;
  }

  close(err) {
    if (this.state === 'closed') return;
    this.state = 'closed';
    clearTimeout(this.timer);
    this.socket.destroy();
    this.emit('close', err);
  }

  #write(body) {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(body.length);
    this.socket.write(Buffer.concat([head, body]));
  }

  #nonceOf(direction, counter) {
    const nonce = Buffer.alloc(12);
    nonce.writeUInt32BE(direction);
    nonce.writeBigUInt64BE(counter, 4);
    return nonce;
  }

  #seal(body) {
    const nonce = this.#nonceOf(this.dialer ? 0 : 1, this.sendCounter);
    this.sendCounter += 1n;
    const cipher = crypto.createCipheriv('aes-256-gcm', this.session, nonce);
    return Buffer.concat([cipher.update(body), cipher.final(), cipher.getAuthTag()]);
  }

  #open(frame) {
    if (frame.length < 16) throw new Error('a frame too short');
    const nonce = this.#nonceOf(this.dialer ? 1 : 0, this.recvCounter);
    this.recvCounter += 1n;
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.session, nonce);
    decipher.setAuthTag(frame.subarray(frame.length - 16));
    return Buffer.concat([decipher.update(frame.subarray(0, frame.length - 16)), decipher.final()]);
  }

  #data(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    while (this.state !== 'closed' && this.buffer.length >= 4) {
      const length = this.buffer.readUInt32BE(0);
      const limit = this.state === 'hi' ? MAX_HI : this.maxFrame;
      if (length > limit) return this.close(new Error(`a frame of ${length} bytes`));
      if (this.buffer.length < 4 + length) return undefined;
      const frame = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      try {
        this.#frame(frame);
      } catch (err) {
        return this.close(err);
      }
    }
    return undefined;
  }

  #frame(frame) {
    if (this.state === 'hi') {
      const hi = JSON.parse(frame);
      if (!hi || hi.t !== 'hi' || typeof hi.id !== 'string' || typeof hi.nonce !== 'string') {
        throw new Error('not a node of @xufa/netcache');
      }
      if (hi.service !== this.service) throw new Error(`a node of another service: ${hi.service}`);
      this.peer = hi;
      if (!this.key) return this.#ready();
      const theirs = Buffer.from(hi.nonce, 'base64');
      const salt = this.dialer ? Buffer.concat([this.nonce, theirs]) : Buffer.concat([theirs, this.nonce]);
      this.session = Buffer.from(crypto.hkdfSync('sha256', this.key, salt, 'xufa-netcache session', 32));
      this.state = 'auth';
      this.send({ t: 'auth' });
      return undefined;
    }
    const message = v8.deserialize(this.session ? this.#open(frame) : frame);
    if (this.state === 'auth') {
      if (!message || message.t !== 'auth') throw new Error('no auth');
      return this.#ready();
    }
    this.emit('message', message);
    return undefined;
  }

  #ready() {
    this.state = 'ready';
    clearTimeout(this.timer);
    this.emit('ready', this.peer);
  }
}

export { Wire, baseKey };
