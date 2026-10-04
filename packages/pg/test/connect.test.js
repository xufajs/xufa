// Connecting: the options of connection strings and of the environment, and what happens before the login (TLS,
// timeouts), against fake servers that speak only what each test needs.
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const tls = require('node:tls');
const { Client, parseConfig, escapeIdentifier, escapeLiteral } = require('..');
const { paramToText } = require('../lib/types');

const KEY = fs.readFileSync(path.join(__dirname, 'fixtures', 'ip-key.pem'));
const CERT = fs.readFileSync(path.join(__dirname, 'fixtures', 'ip-cert.pem'));

// A server on a free port: `onSocket(socket)` talks to each client.
async function fakeServer(onSocket) {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    onSocket(socket);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    close: () => {
      sockets.forEach((socket) => socket.destroy());
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

const message = (type, body) => {
  const header = Buffer.alloc(5);
  header[0] = type;
  header.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([header, body]);
};
const cstring = (text) => Buffer.concat([Buffer.from(text), Buffer.from([0])]);

// The messages that log a client in: AuthenticationOk, BackendKeyData and ReadyForQuery.
function loggedIn() {
  const auth = Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0]);
  const key = Buffer.from([0x4b, 0, 0, 0, 12, 0, 0, 0, 1, 0, 0, 0, 2]);
  const ready = Buffer.from([0x5a, 0, 0, 0, 5, 0x49]);
  return Buffer.concat([auth, key, ready]);
}

// Answers the startup message (after `first`, the SSLRequest when there is one) by logging the client in.
function answerStartup(stream) {
  let received = Buffer.alloc(0);
  const onData = (data) => {
    received = Buffer.concat([received, data]);
    if (received.length >= 4 && received.length >= received.readInt32BE(0)) {
      stream.removeListener('data', onData);
      stream.write(loggedIn());
    }
  };
  stream.on('data', onData);
}

const env = (values, fn) => {
  const saved = {};
  for (const [key, value] of Object.entries(values)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

describe('connection strings', () => {
  it('decodes credentials, keeps + as it is and takes the parameters of libpq', () => {
    expect(parseConfig('postgres://u:pa%ss@h/db').password).toBe('pa%ss');
    expect(parseConfig('postgres://app:s3cr%2Ft%3A@db/prod?options=-c search_path=app').password).toBe('s3cr/t:');
    const config = parseConfig(
      'postgres://u@h/db?options=-c%20a%3Db+c&application_name=my+app&connect_timeout=7&port=6543'
    );
    expect(config.options).toBe('-c a=b+c');
    expect(config.application_name).toBe('my+app');
    expect(config.connectionTimeoutMillis).toBe(7000);
    expect(config.port).toBe(6543);
    expect(parseConfig('postgres:///app?host=/var/run/postgresql').host).toBe('/var/run/postgresql');
    expect(parseConfig('postgres://%2Fvar%2Frun%2Fpostgresql/app').host).toBe('/var/run/postgresql');
    expect(parseConfig('postgres://u@h/?dbname=other').database).toBe('other');
  });

  it('gives sslmode the meaning it has in libpq', () => {
    const ssl = (query) => parseConfig(`postgres://u@h/db?${query}`).ssl;
    expect(ssl('')).toBe(false);
    expect(ssl('sslmode=disable')).toBe(false);
    expect(ssl('sslmode=allow')).toBe(false);
    expect(ssl('sslmode=prefer')).toEqual({ rejectUnauthorized: false });
    expect(parseConfig('postgres://u@h/db?sslmode=prefer').sslmode).toBe('prefer');
    expect(ssl('sslmode=require')).toEqual({ rejectUnauthorized: false });
    expect(ssl('sslmode=no-verify')).toEqual({ rejectUnauthorized: false });
    const verifyCa = ssl('sslmode=verify-ca');
    expect(verifyCa.rejectUnauthorized).toBeUndefined();
    expect(verifyCa.checkServerIdentity()).toBeUndefined();
    expect(ssl('sslmode=verify-full')).toEqual({});
    expect(ssl('ssl=true')).toEqual({});
    expect(ssl('ssl=false')).toBe(false);
    expect(ssl('ssl=0')).toBe(false);
    expect(() => ssl('sslmode=sometimes')).toThrow('Invalid sslmode');
    // ssl in the object wins.
    expect(parseConfig({ connectionString: 'postgres://u@h/db?sslmode=disable', ssl: true }).ssl).toBe(true);
  });

  it('reads the files of the certificates, with sslrootcert making require check the chain', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-pg-ssl-'));
    const file = (name) => {
      const full = path.join(dir, name);
      fs.writeFileSync(full, `${name} contents`);
      return encodeURIComponent(full);
    };
    const config = parseConfig(
      `postgres://u@h/db?sslmode=require&sslcert=${file('c.crt')}&sslkey=${file('c.key')}&sslrootcert=${file('ca.crt')}&sslpassword=p%2Fw`
    );
    expect(config.ssl.cert.toString()).toBe('c.crt contents');
    expect(config.ssl.key.toString()).toBe('c.key contents');
    expect(config.ssl.ca.toString()).toBe('ca.crt contents');
    expect(config.ssl.passphrase).toBe('p/w');
    expect(config.ssl.rejectUnauthorized).toBeUndefined();
    expect(config.ssl.checkServerIdentity()).toBeUndefined();
    // sslrootcert=system: the CAs of the system.
    expect(parseConfig('postgres://u@h/db?sslmode=verify-full&sslrootcert=system').ssl).toEqual({});
  });

  it('reads the PG variables of libpq', () => {
    const config = env(
      {
        PGSSLMODE: 'require',
        PGAPPNAME: 'from-env',
        PGOPTIONS: '-c x=1',
        PGCONNECT_TIMEOUT: '3',
        PGSSLCERT: undefined,
        PGSSLKEY: undefined,
        PGSSLROOTCERT: undefined,
      },
      () => parseConfig({ host: 'h', user: 'u' })
    );
    expect(config).toMatchObject({
      ssl: { rejectUnauthorized: false },
      application_name: 'from-env',
      options: '-c x=1',
      connectionTimeoutMillis: 3000,
    });
    // The options of the object and of the string come first.
    expect(env({ PGSSLMODE: 'require' }, () => parseConfig('postgres://u@h/db?sslmode=disable').ssl)).toBe(false);
  });

  it('does not make a function of the user the name of the database', () => {
    const user = () => 'ada';
    expect(env({ PGDATABASE: undefined }, () => parseConfig({ user }).database)).toBeUndefined();
  });
});

describe('escaping and parameters', () => {
  it('escapes identifiers and literals as pg does, and refuses null characters', () => {
    expect(escapeIdentifier('my "table"')).toBe('"my ""table"""');
    expect(escapeLiteral("it's")).toBe("'it''s'");
    expect(escapeLiteral('a\\b')).toBe(" E'a\\\\b'");
    expect(() => escapeIdentifier('a\u0000b')).toThrow('null characters');
    expect(() => escapeLiteral('a\u0000b')).toThrow('null characters');
    expect(new Client({ host: 'h' }).escapeLiteral('x')).toBe("'x'");
  });

  it('takes toPostgres() of values that extend Array', () => {
    class Range extends Array {
      toPostgres() {
        return `[${this[0]},${this[1]})`;
      }
    }
    expect(paramToText(Range.from([1, 5]))).toBe('[1,5)');
    expect(paramToText([1, 5])).toBe('{"1","5"}');
  });
});

describe('connecting', () => {
  let server;

  afterEach(async () => {
    if (server) await server.close();
    server = null;
  });

  it('times out a server that accepts the connection but never logs the client in', async () => {
    server = await fakeServer(() => {});
    const client = new Client({ host: '127.0.0.1', port: server.port, user: 'u', connectionTimeoutMillis: 100 });
    const started = Date.now();
    await expect(client.connect()).rejects.toThrow('timed out after 100 ms');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('asks a password function for each connection', async () => {
    const asked = [];
    server = await fakeServer((socket) => {
      // Asks for a cleartext password, then logs the client in.
      let step = 0;
      socket.on('data', (data) => {
        step += 1;
        if (step === 1) socket.write(Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 3]));
        else {
          asked.push(data.subarray(5, data.length - 1).toString());
          socket.write(loggedIn());
        }
      });
    });
    let n = 0;
    const password = async () => {
      n += 1;
      return `token-${n}`;
    };
    for (let i = 0; i < 2; i += 1) {
      const client = new Client({ host: '127.0.0.1', port: server.port, user: 'u', password });
      await client.connect();
      client.on('error', () => {});
      client.connection.destroy();
    }
    expect(asked).toEqual(['token-1', 'token-2']);
  });

  it('checks the certificate of a server at an IP against the IP', async () => {
    server = await fakeServer((socket) => {
      socket.once('data', () => {
        socket.write('S');
        const secure = new tls.TLSSocket(socket, { isServer: true, key: KEY, cert: CERT });
        secure.on('error', () => {});
        answerStartup(secure);
      });
    });
    const client = new Client({ host: '127.0.0.1', port: server.port, user: 'u', ssl: { ca: CERT } });
    await client.connect();
    expect(client.connection.socket.encrypted).toBe(true);
    client.on('error', () => {});
    client.connection.destroy();
    // A certificate the client does not trust is refused.
    const untrusted = new Client({ host: '127.0.0.1', port: server.port, user: 'u', ssl: true });
    await expect(untrusted.connect()).rejects.toThrow();
  });

  it('refuses data sent before TLS is set up', async () => {
    server = await fakeServer((socket) => {
      socket.once('data', () => socket.write(Buffer.concat([Buffer.from('S'), loggedIn()])));
    });
    const client = new Client({ host: '127.0.0.1', port: server.port, user: 'u', ssl: true });
    await expect(client.connect()).rejects.toThrow('sent data before TLS');
  });

  it('goes on without TLS with sslmode prefer, when the server has none', async () => {
    server = await fakeServer((socket) => {
      socket.once('data', () => {
        socket.write('N');
        answerStartup(socket);
      });
    });
    const client = new Client(`postgres://u@127.0.0.1:${server.port}/db?sslmode=prefer`);
    await client.connect();
    expect(client.connection.socket.encrypted).toBeUndefined();
    client.on('error', () => {});
    client.connection.destroy();
    const required = new Client(`postgres://u@127.0.0.1:${server.port}/db?sslmode=require`);
    await expect(required.connect()).rejects.toThrow('does not accept SSL');
  });

  it('asks servers before PostgreSQL 12 for exact floats', async () => {
    const queries = [];
    server = await fakeServer((socket) => {
      let startup = true;
      socket.on('data', (data) => {
        if (startup) {
          startup = false;
          const version = message(0x53, Buffer.concat([cstring('server_version'), cstring('11.22')]));
          socket.write(Buffer.concat([version, loggedIn()]));
          return;
        }
        // A simple query: CommandComplete and ReadyForQuery.
        queries.push(data.subarray(5, data.length - 1).toString());
        socket.write(Buffer.concat([message(0x43, cstring('SET')), message(0x5a, Buffer.from('I'))]));
      });
    });
    const client = new Client({ host: '127.0.0.1', port: server.port, user: 'u' });
    await client.connect();
    expect(queries).toEqual(['SET extra_float_digits = 3']);
    client.on('error', () => {});
    client.connection.destroy();
  });

  it('connects to unix sockets by their directory', () => {
    const client = new Client({ host: '/var/run/postgresql', port: 5433, user: 'u' });
    const { Connection } = require('..');
    const connection = new Connection(client.options);
    expect(connection.address).toEqual({ path: '/var/run/postgresql/.s.PGSQL.5433', name: '/var/run/postgresql' });
  });
});
