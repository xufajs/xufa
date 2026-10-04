// SCRAM authentication (RFC 5802, RFC 7677) with SCRAM-SHA-256 and SCRAM-SHA-1, as MongoDB does it.
const crypto = require('node:crypto');
const { Binary } = require('./bson');
const { MongoError } = require('./errors');

function escapeName(name) {
  return name.replace(/=/g, '=3D').replace(/,/g, '=2C');
}

function parse(payload) {
  const result = {};
  payload.split(',').forEach((part) => {
    const index = part.indexOf('=');
    result[part.slice(0, index)] = part.slice(index + 1);
  });
  return result;
}

function xor(a, b) {
  const result = Buffer.allocUnsafe(a.length);
  for (let i = 0; i < a.length; i += 1) result[i] = a[i] ^ b[i];
  return result;
}

const hmac = (algorithm, key, data) => crypto.createHmac(algorithm, key).update(data).digest();
const hash = (algorithm, data) => crypto.createHash(algorithm).update(data).digest();

async function authenticate(connection, { username, password, source = 'admin', mechanism = 'SCRAM-SHA-256' }) {
  const sha1 = mechanism === 'SCRAM-SHA-1';
  const algorithm = sha1 ? 'sha1' : 'sha256';
  const nonce = crypto.randomBytes(24).toString('base64');
  const firstBare = `n=${escapeName(username)},r=${nonce}`;
  const start = await connection.command({
    saslStart: 1,
    mechanism,
    payload: new Binary(Buffer.from(`n,,${firstBare}`)),
    autoAuthorize: 1,
    options: { skipEmptyExchange: true },
    $db: source,
  });
  const serverFirst = start.payload.toString('utf8');
  const server = parse(serverFirst);
  const iterations = Number(server.i);
  if (!server.r || !server.r.startsWith(nonce) || !server.s || !(iterations >= 4096)) {
    throw new MongoError('Invalid SCRAM reply of the server');
  }
  // SCRAM-SHA-1 hashes the password as MONGODB-CR did; SCRAM-SHA-256 uses it as it is (normalized).
  const secret = sha1
    ? crypto.createHash('md5').update(`${username}:mongo:${password}`).digest('hex')
    : password.normalize('NFKC');
  const salted = crypto.pbkdf2Sync(secret, Buffer.from(server.s, 'base64'), iterations, sha1 ? 20 : 32, algorithm);
  const clientKey = hmac(algorithm, salted, 'Client Key');
  const serverKey = hmac(algorithm, salted, 'Server Key');
  const withoutProof = `c=biws,r=${server.r}`;
  const authMessage = `${firstBare},${serverFirst},${withoutProof}`;
  const proof = xor(clientKey, hmac(algorithm, hash(algorithm, clientKey), authMessage));
  let reply = await connection.command({
    saslContinue: 1,
    conversationId: start.conversationId,
    payload: new Binary(Buffer.from(`${withoutProof},p=${proof.toString('base64')}`)),
    $db: source,
  });
  const final = parse(reply.payload.toString('utf8'));
  const signature = hmac(algorithm, serverKey, authMessage).toString('base64');
  if (final.v !== signature) throw new MongoError('The server signature of SCRAM does not match');
  while (!reply.done) {
    reply = await connection.command({
      saslContinue: 1,
      conversationId: reply.conversationId,
      payload: new Binary(Buffer.alloc(0)),
      $db: source,
    });
  }
}

module.exports = { authenticate };
