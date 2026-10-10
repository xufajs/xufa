// The packets of @xufa/discovery: "XD", a version, a flag, then the message as JSON, or with a secret sealed by
// AES-256-GCM (a key derived from the secret and the service by HKDF, a random nonce, the first 4 bytes as additional
// data), so that only the nodes that know the secret read them, and none can be changed or forged on the way.
//
//   plain:  X D 1 0 | JSON
//   sealed: X D 1 1 | nonce (12) | ciphertext | tag (16)
import crypto from 'node:crypto';

const MAGIC_0 = 0x58; // X
const MAGIC_1 = 0x44; // D
const VERSION = 1;
const PLAIN = 0;
const SEALED = 1;
const HEAD = 4;
const NONCE = 12;
const TAG = 16;

// What fits in one Ethernet frame (1500) with the headers of IPv4 (20 to 60) and UDP (8): larger datagrams are split
// in fragments, and one lost fragment loses the packet.
const MAX_PACKET = 1400;

function keyOf(secret, service) {
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'xufa-discovery', `service:${service}`, 32));
}

function createCodec({ secret, service }) {
  const key = secret === undefined ? null : keyOf(secret, service);
  const head = Buffer.from([MAGIC_0, MAGIC_1, VERSION, key ? SEALED : PLAIN]);

  function encode(message) {
    const json = Buffer.from(JSON.stringify(message));
    let packet;
    if (!key) {
      packet = Buffer.concat([head, json]);
    } else {
      const nonce = crypto.randomBytes(NONCE);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(head);
      packet = Buffer.concat([head, nonce, cipher.update(json), cipher.final(), cipher.getAuthTag()]);
    }
    return packet;
  }

  // The message of a packet, or null: packets of other apps, of another version, plain when a secret is expected (or
  // the other way), not sealed with this secret, or not JSON objects.
  function decode(packet) {
    if (packet.length < HEAD || packet[0] !== MAGIC_0 || packet[1] !== MAGIC_1 || packet[2] !== VERSION) return null;
    let json;
    if (!key) {
      if (packet[3] !== PLAIN) return null;
      json = packet.subarray(HEAD);
    } else {
      if (packet[3] !== SEALED || packet.length < HEAD + NONCE + TAG) return null;
      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, packet.subarray(HEAD, HEAD + NONCE));
        decipher.setAAD(packet.subarray(0, HEAD));
        decipher.setAuthTag(packet.subarray(packet.length - TAG));
        json = Buffer.concat([decipher.update(packet.subarray(HEAD + NONCE, packet.length - TAG)), decipher.final()]);
      } catch {
        return null;
      }
    }
    try {
      const message = JSON.parse(json);
      return message !== null && typeof message === 'object' && !Array.isArray(message) ? message : null;
    } catch {
      return null;
    }
  }

  return { encode, decode, sealed: Boolean(key) };
}

export { createCodec, MAX_PACKET };
