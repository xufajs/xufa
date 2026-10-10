// Passwords hashed with scrypt (node:crypto), as PHC strings that say how they were made:
//
//   $scrypt$ln=17,r=8,p=1$<salt>$<hash>      (salt and hash in base64 without padding)
//
// ln is log2 of the cost N. verifyPassword() reads the parameters from the hash, so hashes made with older ones still
// verify; needsRehash() says when one should be made again with the current ones (after a login, when the password
// is at hand).
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

// The defaults: N = 2^17, r = 8, p = 1 (128 MiB of memory, as OWASP recommends for scrypt), 16 bytes of salt and 32
// of hash.
const DEFAULTS = { ln: 17, r: 8, p: 1, saltLength: 16, keyLength: 32 };

function settingsOf(options = {}) {
  const settings = { ...DEFAULTS, ...options };
  const { ln, r, p, saltLength, keyLength } = settings;
  if (!Number.isInteger(ln) || ln < 1 || ln > 30) throw new RangeError(`ln must be an integer from 1 to 30: ${ln}`);
  for (const [name, value] of Object.entries({ r, p, saltLength, keyLength })) {
    if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer: ${value}`);
  }
  return settings;
}

// The memory scrypt takes (128 * N * r * p), with room: node refuses more than 32 MiB unless it is told.
const maxmemOf = ({ ln, r, p }) => 128 * 2 ** ln * r * (p + 2) + 1024 * 1024;

const b64 = (buffer) => buffer.toString('base64').replace(/=+$/, '');

async function hashPassword(password, options) {
  if (typeof password !== 'string' || password.length === 0) throw new TypeError('The password must be a text');
  const settings = settingsOf(options);
  const { ln, r, p, saltLength, keyLength } = settings;
  const salt = crypto.randomBytes(saltLength);
  const hash = await scrypt(password.normalize('NFKC'), salt, keyLength, {
    N: 2 ** ln,
    r,
    p,
    maxmem: maxmemOf(settings),
  });
  return `$scrypt$ln=${ln},r=${r},p=${p}$${b64(salt)}$${b64(hash)}`;
}

// The parts of a PHC string of scrypt, or null when it is not one.
function parse(phc) {
  if (typeof phc !== 'string') return null;
  const match = /^\$scrypt\$ln=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(phc);
  if (!match) return null;
  const [, ln, r, p, salt, hash] = match;
  const settings = { ln: Number(ln), r: Number(r), p: Number(p) };
  if (settings.ln < 1 || settings.ln > 30 || settings.r < 1 || settings.p < 1) return null;
  return { ...settings, salt: Buffer.from(salt, 'base64'), hash: Buffer.from(hash, 'base64') };
}

// Whether a password is the one of a hash (false for a hash that is not one of scrypt). The comparison takes the same
// time whatever the bytes that differ.
async function verifyPassword(password, phc) {
  const parsed = parse(phc);
  if (!parsed || typeof password !== 'string' || parsed.hash.length === 0) return false;
  const hash = await scrypt(password.normalize('NFKC'), parsed.salt, parsed.hash.length, {
    N: 2 ** parsed.ln,
    r: parsed.r,
    p: parsed.p,
    maxmem: maxmemOf(parsed),
  });
  return crypto.timingSafeEqual(hash, parsed.hash);
}

// Whether a hash was made with other parameters than these (or is no hash of scrypt): it should be made again.
function needsRehash(phc, options) {
  const parsed = parse(phc);
  if (!parsed) return true;
  const { ln, r, p, saltLength, keyLength } = settingsOf(options);
  return (
    parsed.ln !== ln ||
    parsed.r !== r ||
    parsed.p !== p ||
    parsed.salt.length !== saltLength ||
    parsed.hash.length !== keyLength
  );
}

export { hashPassword, verifyPassword, needsRehash, DEFAULTS as PASSWORD_DEFAULTS };
