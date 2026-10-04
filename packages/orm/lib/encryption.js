// The encryption of the values of encrypted fields: AES-256-GCM (authenticated: a changed value is refused, not
// decrypted to garbage), with the keys of a keyring by id, so they can be rotated. A value is stored as text that says
// what it is:
//
//   $xenc$1$<key id>$<iv>$<ciphertext and tag>        (iv, ciphertext and tag in base64url)
//
// The keys are 32 random bytes (generateEncryptionKey()), given in base64 or hex, as Buffers, or in the environment:
// XUFA_ENCRYPTION_KEYS='k2:<base64>,k1:<base64>' (the first one encrypts; all of them decrypt). Each one is the root of
// two keys made by HKDF: one encrypts, and one makes the IVs of deterministic values.
//
// Every value is bound to its context (the table and the column of its field, by default): a value copied to another
// column (or table) is refused, so values cannot be moved where the app would show them.
//
// Deterministic values (an IV made from the value, by HMAC) are the same for the same value and key: they can be found
// by equality and be unique, at the cost of telling which rows have the same value.
const crypto = require('node:crypto');
const { EncryptionError } = require('./errors');

const PREFIX = '$xenc$1$';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/;

// The bytes of a key: a Buffer, or text in base64 (or base64url) or hex, of 32 bytes.
function keyBytes(id, key) {
  let bytes;
  if (Buffer.isBuffer(key) || key instanceof Uint8Array) bytes = Buffer.from(key);
  else if (typeof key === 'string' && /^[0-9a-f]{64}$/i.test(key)) bytes = Buffer.from(key, 'hex');
  else if (typeof key === 'string')
    bytes = Buffer.from(key, key.includes('-') || key.includes('_') ? 'base64url' : 'base64');
  else throw new EncryptionError(`The encryption key ${id} must be a Buffer or text in base64 or hex`);
  if (bytes.length !== 32) {
    throw new EncryptionError(
      `The encryption key ${id} must have 32 bytes (it has ${bytes.length}): make one with generateEncryptionKey()`
    );
  }
  return bytes;
}

const derive = (root, info) => Buffer.from(crypto.hkdfSync('sha256', root, Buffer.alloc(0), info, 32));

class Keyring {
  // new Keyring({ current, keys: { id: key } }) (current: the first id by default), or new Keyring(key) (its id 'k1').
  constructor(options) {
    const set =
      options && typeof options === 'object' && !Buffer.isBuffer(options) && !(options instanceof Uint8Array)
        ? options
        : { keys: { k1: options } };
    const ids = Object.keys(set.keys || {});
    if (!ids.length) throw new EncryptionError('An encryption keyring needs a key');
    this.keys = new Map();
    for (const id of ids) {
      if (!KEY_ID.test(id)) throw new EncryptionError(`The id of an encryption key is letters, digits, - and _: ${id}`);
      const root = keyBytes(id, set.keys[id]);
      this.keys.set(id, {
        id,
        encrypt: derive(root, 'xufa encrypted field'),
        iv: derive(root, 'xufa deterministic iv'),
      });
    }
    this.current = set.current === undefined ? ids[0] : set.current;
    if (!this.keys.has(this.current))
      throw new EncryptionError(`The current key ${this.current} is not one of the keys`);
  }

  // The text of a value (bytes) encrypted with the current key, in its context.
  seal(plaintext, context, deterministic = false) {
    const key = this.keys.get(this.current);
    const aad = Buffer.from(context);
    const iv = deterministic
      ? crypto
          .createHmac('sha256', key.iv)
          .update(aad)
          .update(Buffer.from([0]))
          .update(plaintext)
          .digest()
          .subarray(0, IV_BYTES)
      : crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', key.encrypt, iv);
    cipher.setAAD(aad);
    const data = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    return `${PREFIX}${key.id}$${iv.toString('base64url')}$${data.toString('base64url')}`;
  }

  // The bytes of an encrypted text, or an EncryptionError (unknown key, changed value, other context).
  open(text, context) {
    const parts = isEncrypted(text) ? text.slice(PREFIX.length).split('$') : null;
    if (!parts || parts.length !== 3) throw new EncryptionError('The value is not an encrypted value');
    const [id, ivText, dataText] = parts;
    const key = this.keys.get(id);
    if (!key) throw new EncryptionError(`The value was encrypted with the key ${id}, which is not in the keyring`);
    const iv = Buffer.from(ivText, 'base64url');
    const data = Buffer.from(dataText, 'base64url');
    if (iv.length !== IV_BYTES || data.length < TAG_BYTES)
      throw new EncryptionError('The encrypted value is malformed');
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key.encrypt, iv);
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(data.subarray(data.length - TAG_BYTES));
      return Buffer.concat([decipher.update(data.subarray(0, data.length - TAG_BYTES)), decipher.final()]);
    } catch {
      throw new EncryptionError('The encrypted value was changed, or is of another field');
    }
  }
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

// The id of the key of an encrypted text (null when it is not one).
function keyIdOf(value) {
  return isEncrypted(value) ? value.slice(PREFIX.length, value.indexOf('$', PREFIX.length)) : null;
}

// The keyring of the process: given by setEncryptionKeys(), or read from XUFA_ENCRYPTION_KEYS the first time.
let keyring = null;

function setEncryptionKeys(options) {
  keyring = options === null ? null : options instanceof Keyring ? options : new Keyring(options);
  return keyring;
}

function fromEnvironment() {
  const text = process.env.XUFA_ENCRYPTION_KEYS;
  if (!text) return null;
  const entries = text
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const keys = {};
  for (const entry of entries) {
    const index = entry.indexOf(':');
    if (index === -1) throw new EncryptionError('XUFA_ENCRYPTION_KEYS is id:key,id:key (the first one encrypts)');
    keys[entry.slice(0, index)] = entry.slice(index + 1);
  }
  return new Keyring({ keys });
}

function getKeyring() {
  if (!keyring) keyring = fromEnvironment();
  if (!keyring) {
    throw new EncryptionError(
      'Encrypted fields need keys: setEncryptionKeys({ keys: { k1: key } }) or XUFA_ENCRYPTION_KEYS (generateEncryptionKey() makes one)'
    );
  }
  return keyring;
}

// 32 random bytes in base64: a key.
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('base64');
}

module.exports = { Keyring, setEncryptionKeys, getKeyring, generateEncryptionKey, isEncrypted, keyIdOf };

// Writes the encrypted fields of every object of a model again, with the current key: after a key is added (so the
// old one can be removed, and deterministic values found by equality again), or after a field became encrypted (its
// values written before, read with acceptPlaintext, are encrypted). In batches of `batchSize` objects; `fields`: the
// names of the fields (all the encrypted ones by default). Returns the number of objects written.
async function reencrypt(Model, { fields, batchSize = 500 } = {}) {
  const { meta } = Model;
  if (!meta.pk) throw new EncryptionError(`reencrypt() needs a primary key to write ${Model.name} again`);
  const names = fields || meta.fields.filter((field) => field.encrypted).map((field) => field.name);
  if (!names.length) return 0;
  let written = 0;
  for (let offset = 0; ; offset += batchSize) {
    const objects = await Model.objects.orderBy('pk').limit(batchSize).offset(offset);
    for (const object of objects) await object.save({ fields: names });
    written += objects.length;
    if (objects.length < batchSize) return written;
  }
}

module.exports.reencrypt = reencrypt;
