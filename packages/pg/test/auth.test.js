// Authentication against a scripted server: SCRAM-SHA-256 with and without channel binding (the server checks the
// proof of the client and the binding data from what the client sent, as PostgreSQL does), cleartext and MD5
// passwords, OAUTHBEARER, and what require_auth and channel_binding refuse.
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const tls = require('node:tls');
const { Client } = require('..');

const KEY = fs.readFileSync(path.join(__dirname, 'fixtures', 'ip-key.pem'));
const CERT = fs.readFileSync(path.join(__dirname, 'fixtures', 'ip-cert.pem'));
const PASSWORD = 'secret';

const message = (type, body) => {
  const header = Buffer.alloc(5);
  header[0] = type;
  header.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([header, body]);
};
const int32 = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
};
const auth = (code, data = Buffer.alloc(0)) => message(0x52, Buffer.concat([int32(code), data]));
const OK = auth(0);
const READY = message(0x5a, Buffer.from('I'));
const error = (text) =>
  message(0x45, Buffer.concat([Buffer.from(`SFATAL\0C28000\0M${text}\0`), Buffer.from([0])]));

// The messages of a client, one by one: the first has no type (startup or SSLRequest).
function reader(stream, onMessage) {
  let buffer = Buffer.alloc(0);
  let first = true;
  stream.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);
    for (;;) {
      if (first) {
        if (buffer.length < 4 || buffer.length < buffer.readInt32BE(0)) return;
        const length = buffer.readInt32BE(0);
        const body = buffer.subarray(4, length);
        buffer = buffer.subarray(length);
        first = false;
        onMessage(0, body);
      } else {
        if (buffer.length < 5 || buffer.length < 1 + buffer.readInt32BE(1)) return;
        const length = 1 + buffer.readInt32BE(1);
        const type = buffer[0];
        const body = buffer.subarray(5, length);
        buffer = buffer.subarray(length);
        onMessage(type, body);
      }
    }
  });
}

// A server: TLS when `tls` (answering the SSLRequest), then `script(stream, received)` answers the startup.
async function server({ secure = false, script }) {
  const log = { messages: [], secure: false };
  const sockets = new Set();
  const srv = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    const start = (stream) => {
      const conversation = script(stream, log);
      reader(stream, (type, body) => {
        log.messages.push({ type: String.fromCharCode(type), body });
        conversation(type, body);
      });
    };
    if (!secure) {
      start(socket);
      return;
    }
    socket.once('data', () => {
      socket.write('S');
      const stream = new tls.TLSSocket(socket, { isServer: true, key: KEY, cert: CERT });
      stream.on('error', () => {});
      log.secure = true;
      start(stream);
    });
  });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  return {
    port: srv.address().port,
    log,
    close: () => {
      sockets.forEach((socket) => socket.destroy());
      return new Promise((resolve) => srv.close(resolve));
    },
  };
}

// The server side of SCRAM-SHA-256 (RFC 5802/7677), checking the proof and the channel binding of the client.
function scram({ mechanisms, password = PASSWORD, badSignature = false }) {
  return (stream, log) => {
    const salt = crypto.randomBytes(16);
    const iterations = 4096;
    const salted = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
    const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
    const storedKey = crypto.createHash('sha256').update(hmac(salted, 'Client Key')).digest();
    let state = null;
    return (type, body) => {
      if (type === 0) {
        stream.write(auth(10, Buffer.from(`${mechanisms.join('\0')}\0\0`)));
        return;
      }
      if (!state) {
        // SASLInitialResponse: mechanism, length, client-first (gs2 header, then the bare part).
        const end = body.indexOf(0);
        const mechanism = body.subarray(0, end).toString();
        const first = body.subarray(end + 5).toString();
        const [, header, bare] = /^((?:p=[^,]*|y|n),[^,]*,)(.*)$/.exec(first);
        const nonce = /r=([^,]*)/.exec(bare)[1] + crypto.randomBytes(9).toString('base64');
        const serverFirst = `r=${nonce},s=${salt.toString('base64')},i=${iterations}`;
        state = { mechanism, header, bare, serverFirst, nonce };
        log.sasl = { mechanism, header };
        stream.write(auth(11, Buffer.from(serverFirst)));
        return;
      }
      // SASLResponse: client-final, checked as the server checks it.
      const final = body.toString();
      const withoutProof = final.slice(0, final.lastIndexOf(',p='));
      const proof = Buffer.from(final.slice(final.lastIndexOf(',p=') + 3), 'base64');
      const channel = Buffer.from(/^c=([^,]*)/.exec(final)[1], 'base64');
      let expected = Buffer.from(state.header);
      if (state.header.startsWith('p=')) {
        const der = new crypto.X509Certificate(CERT).raw;
        expected = Buffer.concat([expected, crypto.createHash('sha256').update(der).digest()]);
      }
      if (!channel.equals(expected)) {
        stream.write(error('channel binding mismatch'));
        return;
      }
      const authMessage = `${state.bare},${state.serverFirst},${withoutProof}`;
      const signature = hmac(storedKey, authMessage);
      const clientKey = Buffer.from(proof.map((byte, i) => byte ^ signature[i]));
      if (!crypto.createHash('sha256').update(clientKey).digest().equals(storedKey)) {
        stream.write(error('password authentication failed'));
        return;
      }
      const serverSignature = hmac(hmac(salted, 'Server Key'), authMessage).toString('base64');
      const v = badSignature ? Buffer.alloc(32).toString('base64') : serverSignature;
      stream.write(Buffer.concat([auth(12, Buffer.from(`v=${v}`)), OK, READY]));
    };
  };
}

const connect = (port, config = {}) =>
  new Client({ host: '127.0.0.1', port, user: 'u', password: PASSWORD, ...config });

async function connected(client) {
  await client.connect();
  client.on('error', () => {});
  const { auth: state } = client.connection;
  client.connection.destroy();
  return state;
}

describe('authentication', () => {
  let srv;

  afterEach(async () => {
    if (srv) await srv.close();
    srv = null;
  });

  it('binds SCRAM to the TLS channel when the server offers SCRAM-SHA-256-PLUS', async () => {
    srv = await server({ secure: true, script: scram({ mechanisms: ['SCRAM-SHA-256-PLUS', 'SCRAM-SHA-256'] }) });
    const state = await connected(connect(srv.port, { ssl: { ca: CERT } }));
    expect(srv.log.sasl).toEqual({ mechanism: 'SCRAM-SHA-256-PLUS', header: 'p=tls-server-end-point,,' });
    expect(state.bound).toBe(true);
    // channel_binding=require too.
    await srv.close();
    srv = await server({ secure: true, script: scram({ mechanisms: ['SCRAM-SHA-256-PLUS', 'SCRAM-SHA-256'] }) });
    expect((await connected(connect(srv.port, { ssl: { ca: CERT }, channel_binding: 'require' }))).bound).toBe(true);
  });

  it('does not bind with channel_binding=disable, and says it could with y when the server cannot', async () => {
    srv = await server({ secure: true, script: scram({ mechanisms: ['SCRAM-SHA-256-PLUS', 'SCRAM-SHA-256'] }) });
    const state = await connected(connect(srv.port, { ssl: { ca: CERT }, channel_binding: 'disable' }));
    expect(srv.log.sasl).toEqual({ mechanism: 'SCRAM-SHA-256', header: 'n,,' });
    expect(state.bound).toBe(false);
    await srv.close();
    srv = await server({ secure: true, script: scram({ mechanisms: ['SCRAM-SHA-256'] }) });
    await connected(connect(srv.port, { ssl: { ca: CERT } }));
    expect(srv.log.sasl).toEqual({ mechanism: 'SCRAM-SHA-256', header: 'y,,' });
  });

  it('refuses what channel_binding=require cannot have', async () => {
    srv = await server({ secure: true, script: scram({ mechanisms: ['SCRAM-SHA-256'] }) });
    await expect(connect(srv.port, { ssl: { ca: CERT }, channel_binding: 'require' }).connect()).rejects.toThrow(
      'does not offer SCRAM-SHA-256-PLUS'
    );
    await srv.close();
    srv = await server({ script: scram({ mechanisms: ['SCRAM-SHA-256'] }) });
    await expect(connect(srv.port, { channel_binding: 'require' }).connect()).rejects.toThrow('needs TLS');
    await srv.close();
    // A server that asks for a password instead (CVE-2025-49146 of pgjdbc): refused, the password is not sent.
    srv = await server({
      secure: true,
      script: (stream) => (type) => {
        if (type === 0) stream.write(auth(3));
        else stream.write(Buffer.concat([OK, READY]));
      },
    });
    await expect(connect(srv.port, { ssl: { ca: CERT }, channel_binding: 'require' }).connect()).rejects.toThrow(
      'asked for password authentication'
    );
    expect(srv.log.messages.map((item) => item.type)).toEqual(['\0']);
  });

  it('refuses a server that offers SCRAM-SHA-256-PLUS without TLS, or signs wrongly', async () => {
    srv = await server({ script: scram({ mechanisms: ['SCRAM-SHA-256-PLUS', 'SCRAM-SHA-256'] }) });
    await expect(connect(srv.port).connect()).rejects.toThrow('without TLS');
    await srv.close();
    srv = await server({ script: scram({ mechanisms: ['SCRAM-SHA-256'], badSignature: true }) });
    await expect(connect(srv.port).connect()).rejects.toThrow('signature of the server does not match');
  });

  it('allows the methods of require_auth, and refuses the others before answering', async () => {
    const asksFor = (code) => (stream) => (type) => {
      if (type === 0) stream.write(code === null ? Buffer.concat([OK, READY]) : auth(code, Buffer.alloc(code === 5 ? 4 : 0)));
      else stream.write(Buffer.concat([OK, READY]));
    };
    for (const [code, requireAuth, outcome] of [
      [3, 'password', 'ok'],
      [5, 'md5', 'ok'],
      [5, 'password,md5', 'ok'],
      [3, 'scram-sha-256', 'asked for password authentication'],
      [3, '!password', 'asked for password authentication'],
      [5, '!password', 'ok'],
      [null, 'password', 'asked for no authentication'],
      [null, 'none', 'ok'],
      [null, '!none', 'asked for no authentication'],
      [3, 'none', 'asked for password authentication'],
    ]) {
      srv = await server({ script: asksFor(code) });
      const client = connect(srv.port, { require_auth: requireAuth });
      if (outcome === 'ok') await connected(client);
      else {
        await expect(client.connect()).rejects.toThrow(outcome);
        // Refused before answering: no password was sent.
        expect(srv.log.messages.map((item) => item.type)).toEqual(['\0']);
      }
      await srv.close();
    }
    srv = await server({ script: scram({ mechanisms: ['SCRAM-SHA-256'] }) });
    await connected(connect(srv.port, { require_auth: 'scram-sha-256' }));
  });

  it('refuses servers that ask twice, or make the connection usable without authenticating it', async () => {
    srv = await server({
      script: (stream) => (type) => {
        if (type === 0) stream.write(auth(3));
        else stream.write(auth(3));
      },
    });
    await expect(connect(srv.port).connect()).rejects.toThrow('asked to authenticate again');
    await srv.close();
    srv = await server({ script: (stream) => () => stream.write(READY) });
    await expect(connect(srv.port).connect()).rejects.toThrow('did not authenticate the connection');
  });

  it('checks the settings of require_auth and channel_binding', () => {
    expect(() => connect(1, { require_auth: 'password,!md5' })).toThrow('cannot mix');
    expect(() => connect(1, { require_auth: 'kerberos5' })).toThrow('Unknown method');
    expect(() => connect(1, { channel_binding: 'always' })).toThrow('disable, prefer or require');
    expect(() => connect(1, { requireAuth: 'password' })).toThrow('require_auth');
    expect(() => connect(1, { channelBinding: 'require' })).toThrow('channel_binding');
    const config = new Client('postgres://u@h/db?require_auth=scram-sha-256&channel_binding=require').options;
    expect(config).toMatchObject({ require_auth: 'scram-sha-256', channel_binding: 'require' });
  });

  it('gives OAuth tokens with OAUTHBEARER', async () => {
    const oauth = (accept) => (stream, log) => (type, body) => {
      if (type === 0) {
        stream.write(auth(10, Buffer.from('OAUTHBEARER\0SCRAM-SHA-256\0\0')));
        return;
      }
      if (body.length === 1 && body[0] === 1) {
        stream.write(error('OAuth bearer authentication failed'));
        return;
      }
      const end = body.indexOf(0);
      log.initial = body.subarray(end + 5).toString();
      if (accept) stream.write(Buffer.concat([OK, READY]));
      else stream.write(auth(11, Buffer.from('{"status":"invalid_token"}')));
    };
    srv = await server({ script: oauth(true) });
    await connected(connect(srv.port, { oauthBearerToken: async () => 'tok3n' }));
    expect(srv.log.initial).toBe('n,,\u0001auth=Bearer tok3n\u0001\u0001');
    await srv.close();
    srv = await server({ script: oauth(false) });
    await expect(connect(srv.port, { oauthBearerToken: 'bad' }).connect()).rejects.toThrow('OAuth bearer authentication failed');
    await srv.close();
    // Without a token, SCRAM; a server that only takes OAuth says so.
    srv = await server({
      script: (stream) => (type) => {
        if (type === 0) stream.write(auth(10, Buffer.from('OAUTHBEARER\0\0')));
      },
    });
    await expect(connect(srv.port).connect()).rejects.toThrow('no oauthBearerToken');
    await srv.close();
    srv = await server({ script: oauth(true) });
    await expect(connect(srv.port, { oauthBearerToken: 't', require_auth: 'scram-sha-256' }).connect()).rejects.toThrow();
  });
});
