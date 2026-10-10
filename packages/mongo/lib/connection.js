// A connection to a MongoDB server: OP_MSG messages over a socket (TCP or TLS). Commands are sent as they come and
// their replies matched by request id, so one connection carries many commands at the same time.
import net from 'node:net';
import zlib from 'node:zlib';
import tls from 'node:tls';
import { serialize, deserialize } from './bson.js';
import { MongoError, MongoServerError, MongoNetworkError } from './errors.js';

const OP_MSG = 2013;
const OP_COMPRESSED = 2012;
// The compressors (by name and by id) of OP_COMPRESSED: zstd when this Node.js has it, and zlib.
const COMPRESSORS = {
  zlib: {
    id: 2,
    compress: (data, level) => zlib.deflateSync(data, level === undefined ? {} : { level }),
    decompress: (data) => zlib.inflateSync(data),
  },
  ...(zlib.zstdCompressSync
    ? {
        zstd: {
          id: 3,
          compress: (data) => zlib.zstdCompressSync(data),
          decompress: (data) => zlib.zstdDecompressSync(data),
        },
      }
    : {}),
};
const COMPRESSOR_IDS = new Map(Object.values(COMPRESSORS).map((compressor) => [compressor.id, compressor]));
// Commands never compressed (the handshake and the authentication).
const UNCOMPRESSED = new Set([
  'hello',
  'isMaster',
  'ismaster',
  'saslStart',
  'saslContinue',
  'getnonce',
  'authenticate',
  'createUser',
  'updateUser',
]);
const HEADER_SIZE = 16;
const MORE_TO_COME = 2;

let nextRequestId = 1;

// The number of reply hooks running: commands sent while one runs are written at once.
let replyHooks = 0;

function uncork(connection) {
  connection.corked = false;
  if (!connection.closed) connection.socket.uncork();
}

class Connection {
  constructor(options) {
    this.options = options;
    this.socket = null;
    this.pending = new Map();
    this.chunks = [];
    this.received = 0;
    this.closed = false;
    this.corked = false;
    // The compressor agreed with the server in the hello (null: none).
    this.compressor = null;
    this.hello = null;
  }

  get busy() {
    return this.pending.size;
  }

  connect() {
    const { host, port, tls: useTls, tlsOptions, connectTimeoutMS = 30000 } = this.options;
    return new Promise((resolve, reject) => {
      const onError = (err) => {
        socket.destroy();
        reject(new MongoNetworkError(`Cannot connect to ${host}:${port}: ${err.message}`, { cause: err }));
      };
      const ready = useTls ? 'secureConnect' : 'connect';
      const socket = useTls
        ? tls.connect({ host, port, servername: net.isIP(host) ? undefined : host, ...tlsOptions })
        : net.connect({ host, port });
      socket.setNoDelay(true);
      socket.setTimeout(connectTimeoutMS, () => onError(new Error('connection timed out')));
      socket.once('error', onError);
      socket.once(ready, () => {
        socket.setTimeout(0);
        socket.removeListener('error', onError);
        socket.on('error', (err) => this.destroy(new MongoNetworkError(err.message, { cause: err })));
        socket.on('close', () => this.destroy(new MongoNetworkError('The connection was closed')));
        socket.on('data', (chunk) => this.onData(chunk));
        this.socket = socket;
        resolve(this);
      });
    });
  }

  // Chunks are joined only once a whole message has arrived, so a large reply is copied once.
  onData(chunk) {
    this.chunks.push(chunk);
    this.received += chunk.length;
    while (this.received >= 4) {
      if (this.chunks[0].length < 4) this.chunks = [Buffer.concat(this.chunks)];
      const length = this.chunks[0].readInt32LE(0);
      if (this.received < length) return;
      const buffer = this.chunks.length > 1 ? Buffer.concat(this.chunks) : this.chunks[0];
      const message = buffer.subarray(0, length);
      const rest = buffer.subarray(length);
      this.chunks = rest.length ? [rest] : [];
      this.received = rest.length;
      this.onMessage(message);
    }
  }

  onMessage(received) {
    let message = received;
    // A compressed reply is the message of its original opcode (header and decompressed body).
    if (message.readInt32LE(12) === OP_COMPRESSED) {
      try {
        message = decompress(message);
      } catch (err) {
        this.destroy(new MongoNetworkError(`Cannot decompress a reply: ${err.message}`, { cause: err }));
        return;
      }
    }
    const responseTo = message.readInt32LE(8);
    const opCode = message.readInt32LE(12);
    const request = this.pending.get(responseTo);
    if (!request) return;
    this.pending.delete(responseTo);
    if (opCode !== OP_MSG) {
      request.reject(new MongoError(`Unexpected reply with the opcode ${opCode}`));
      return;
    }
    // Sections after the flags: a body (kind 0) is the reply.
    let offset = HEADER_SIZE + 4;
    let reply;
    try {
      while (offset < message.length && !reply) {
        const kind = message[offset];
        offset += 1;
        if (kind === 0 && request.onReply) {
          // Every connection writes at once the commands of the hook (they may go to another one).
          replyHooks += 1;
          try {
            request.onReply(message, offset);
          } finally {
            replyHooks -= 1;
          }
        }
        if (kind === 0) reply = deserialize(message, offset);
        else offset += message.readInt32LE(offset);
      }
    } catch (err) {
      request.reject(err);
      return;
    }
    if (!reply) request.reject(new MongoError('A reply without a body'));
    else if ((reply.ok === 1 || reply.ok === true) && !reply.writeErrors && !reply.writeConcernError) {
      request.resolve(reply);
    } else request.reject(new MongoServerError(reply));
  }

  // Sends a command (a document with $db) and gives the reply. Replies with ok: 0 are thrown as MongoServerError.
  // `onReply(message, offset)`, when given, is called with the bytes of the reply before they are decoded; commands
  // sent from it are written at once (a read ahead has to reach the server before the decoding starts).
  command(doc, onReply, noResponse = false) {
    if (this.closed || !this.socket) return Promise.reject(new MongoNetworkError('The connection is closed'));
    // The header and the flags are written before the document, in the same buffer.
    const message = serialize(doc, HEADER_SIZE + 5);
    message[20] = 0;
    // The commands of the handshake and the authentication are never compressed.
    const compress = this.compressor !== null && !UNCOMPRESSED.has(Object.keys(doc)[0]);
    return this.send(message, onReply, noResponse, false, compress);
  }

  // Sends a message whose sections are encoded (from offset 20), written at once.
  sendNow(message) {
    if (this.closed || !this.socket) return Promise.reject(new MongoNetworkError('The connection is closed'));
    return this.send(message, undefined, false, true, this.compressor !== null);
  }

  // Writes the header of a message (after it, its sections are already encoded) and sends it.
  send(encoded, onReply, noResponse = false, now = false, compress = false) {
    const requestId = nextRequestId;
    nextRequestId = nextRequestId === 0x7fffffff ? 1 : nextRequestId + 1;
    let message = encoded;
    message.writeInt32LE(message.length, 0);
    message.writeInt32LE(requestId, 4);
    message.writeInt32LE(0, 8);
    message.writeInt32LE(OP_MSG, 12);
    message.writeUInt32LE(noResponse ? MORE_TO_COME : 0, 16);
    if (compress) message = this.compress(message);
    // The commands of the same tick are written with one system call: the socket is corked until the next tick.
    if (now || replyHooks > 0) {
      this.writeNow(message);
    } else {
      if (!this.corked) {
        this.corked = true;
        this.socket.cork();
        process.nextTick(uncork, this);
      }
      // Errors of writes destroy the socket, which rejects every command waiting.
      this.socket.write(message);
    }
    if (noResponse) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onReply });
    });
  }

  // OP_COMPRESSED of a message: its header, the original opcode and size, the compressor, and the body compressed.
  compress(message) {
    const compressor = COMPRESSORS[this.compressor];
    const body = message.subarray(HEADER_SIZE);
    const data = compressor.compress(body, this.options.zlibCompressionLevel);
    const result = Buffer.allocUnsafe(HEADER_SIZE + 9 + data.length);
    message.copy(result, 0, 0, HEADER_SIZE);
    result.writeInt32LE(result.length, 0);
    result.writeInt32LE(OP_COMPRESSED, 12);
    result.writeInt32LE(OP_MSG, HEADER_SIZE);
    result.writeInt32LE(body.length, HEADER_SIZE + 4);
    result[HEADER_SIZE + 8] = compressor.id;
    data.copy(result, HEADER_SIZE + 9);
    return result;
  }

  // Writes a message now, even when the socket is corked for the commands of this tick.
  writeNow(message) {
    const { socket } = this;
    const corked = socket.writableCorked;
    for (let i = 0; i < corked; i += 1) socket.uncork();
    socket.write(message);
    for (let i = 0; i < corked; i += 1) socket.cork();
  }

  destroy(err = new MongoNetworkError('The connection was closed')) {
    if (this.closed) return;
    this.closed = true;
    if (this.socket) this.socket.destroy();
    this.pending.forEach((request) => request.reject(err));
    this.pending.clear();
  }
}

function decompress(message) {
  const originalOpcode = message.readInt32LE(HEADER_SIZE);
  const size = message.readInt32LE(HEADER_SIZE + 4);
  const compressor = COMPRESSOR_IDS.get(message[HEADER_SIZE + 8]);
  if (message[HEADER_SIZE + 8] !== 0 && !compressor) throw new Error(`Unknown compressor ${message[HEADER_SIZE + 8]}`);
  const data = message.subarray(HEADER_SIZE + 9);
  const body = compressor ? compressor.decompress(data) : data;
  if (body.length !== size) throw new Error('The decompressed size does not match');
  const result = Buffer.allocUnsafe(HEADER_SIZE + body.length);
  message.copy(result, 0, 0, HEADER_SIZE);
  result.writeInt32LE(result.length, 0);
  result.writeInt32LE(originalOpcode, 12);
  body.copy(result, HEADER_SIZE);
  return result;
}

export { Connection, COMPRESSORS };
