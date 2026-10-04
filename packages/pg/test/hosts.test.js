// Several hosts: failover in order, target_session_attrs (from the parameters servers report, or by asking older
// ones) and load_balance_hosts, against fake servers that are primaries or standbys.
const net = require('node:net');
const { Client, Pool, parseConfig } = require('..');

const message = (type, body) => {
  const header = Buffer.alloc(5);
  header[0] = type;
  header.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([header, body]);
};
const cstring = (text) => Buffer.concat([Buffer.from(text), Buffer.from([0])]);
const int16 = (value) => {
  const buffer = Buffer.alloc(2);
  buffer.writeInt16BE(value);
  return buffer;
};
const int32 = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value);
  return buffer;
};
const parameter = (name, value) => message(0x53, Buffer.concat([cstring(name), cstring(value)]));
const READY = message(0x5a, Buffer.from('I'));

// The rows of a simple query of one column of text: RowDescription, DataRow, CommandComplete, ReadyForQuery.
function textRow(name, value) {
  const description = Buffer.concat([int16(1), cstring(name), int32(0), int16(0), int32(25), int16(-1), int32(-1), int16(0)]);
  const row = Buffer.concat([int16(1), int32(Buffer.byteLength(value)), Buffer.from(value)]);
  return Buffer.concat([message(0x54, description), message(0x44, row), message(0x43, cstring('SELECT 1')), READY]);
}

// A server that is a standby or not: it reports in_hot_standby (as PostgreSQL 14 and later do), or answers the
// queries of older servers when `old`.
async function fake({ standby = false, readOnly = false, old = false }) {
  const log = { connections: 0, queries: [] };
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    log.connections += 1;
    socket.on('error', () => {});
    let startup = true;
    socket.on('data', (data) => {
      if (startup) {
        startup = false;
        const params = old
          ? []
          : [parameter('in_hot_standby', standby ? 'on' : 'off'), parameter('default_transaction_read_only', readOnly ? 'on' : 'off')];
        socket.write(Buffer.concat([message(0x52, int32(0)), ...params, READY]));
        return;
      }
      if (data[0] !== 0x51) return;
      const text = data.subarray(5, data.length - 1).toString();
      log.queries.push(text);
      if (text.includes('pg_is_in_recovery')) socket.write(textRow('standby', standby ? 't' : 'f'));
      else if (text.includes('transaction_read_only')) socket.write(textRow('transaction_read_only', readOnly ? 'on' : 'off'));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    log,
    close: () => {
      sockets.forEach((socket) => socket.destroy());
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

// A port where nothing listens.
async function deadPort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function portOf(config) {
  const client = new Client({ user: 'u', ...config });
  await client.connect();
  const { port } = client.connection.options;
  client.on('error', () => {});
  client.connection.destroy();
  return port;
}

describe('several hosts', () => {
  let servers = [];

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
    servers = [];
  });

  it('reads lists of hosts and ports', () => {
    const config = parseConfig('postgres://u:p@h1:5432,h2,[::1]:6000/db?target_session_attrs=read-write&load_balance_hosts=random');
    expect(config).toMatchObject({
      host: ['h1', 'h2', '::1'],
      port: [5432, 5432, 6000],
      user: 'u',
      database: 'db',
      target_session_attrs: 'read-write',
      load_balance_hosts: 'random',
    });
    expect(parseConfig({ host: 'a,b', port: 7000 })).toMatchObject({ host: ['a', 'b'], port: 7000 });
    expect(parseConfig({ host: ['a', 'b'], port: '1,2' }).port).toEqual([1, 2]);
    expect(() => parseConfig({ host: 'a,b,c', port: '1,2' })).toThrow('3 hosts and 2 ports');
    expect(() => parseConfig({ host: 'a', target_session_attrs: 'leader' })).toThrow('Invalid target_session_attrs');
    expect(() => parseConfig({ host: 'a', load_balance_hosts: 'round-robin' })).toThrow('Invalid load_balance_hosts');
  });

  it('goes to the next host when one cannot be connected to', async () => {
    const primary = await fake({});
    servers.push(primary);
    const dead = await deadPort();
    expect(await portOf({ host: '127.0.0.1,127.0.0.1', port: [dead, primary.port] })).toBe(primary.port);
    await expect(portOf({ host: '127.0.0.1', port: dead })).rejects.toThrow('ECONNREFUSED');
  });

  it('finds the host target_session_attrs asks for', async () => {
    const standby = await fake({ standby: true });
    const primary = await fake({});
    const readOnly = await fake({ readOnly: true });
    servers.push(standby, primary, readOnly);
    const all = { host: ['127.0.0.1', '127.0.0.1', '127.0.0.1'], port: [standby.port, readOnly.port, primary.port] };
    expect(await portOf({ ...all, target_session_attrs: 'any' })).toBe(standby.port);
    expect(await portOf({ ...all, target_session_attrs: 'primary' })).toBe(readOnly.port);
    expect(await portOf({ ...all, target_session_attrs: 'read-write' })).toBe(primary.port);
    expect(await portOf({ ...all, target_session_attrs: 'read-only' })).toBe(standby.port);
    expect(await portOf({ ...all, target_session_attrs: 'standby' })).toBe(standby.port);
    expect(await portOf({ ...all, port: [primary.port, standby.port, readOnly.port], target_session_attrs: 'prefer-standby' })).toBe(
      standby.port
    );
    // No standby: prefer-standby takes the first host; standby fails, saying why.
    const primaries = { host: '127.0.0.1,127.0.0.1', port: [readOnly.port, primary.port] };
    expect(await portOf({ ...primaries, target_session_attrs: 'prefer-standby' })).toBe(readOnly.port);
    await expect(portOf({ ...primaries, target_session_attrs: 'standby' })).rejects.toThrow(
      `127.0.0.1:${readOnly.port} is not standby`
    );
  });

  it('asks servers that do not report in_hot_standby', async () => {
    const old = await fake({ old: true, standby: true });
    const oldPrimary = await fake({ old: true, readOnly: false });
    servers.push(old, oldPrimary);
    const both = { host: '127.0.0.1,127.0.0.1', port: [old.port, oldPrimary.port] };
    expect(await portOf({ ...both, target_session_attrs: 'read-write' })).toBe(oldPrimary.port);
    expect(old.log.queries).toEqual(['SELECT pg_catalog.pg_is_in_recovery() AS standby']);
    expect(oldPrimary.log.queries).toEqual(['SELECT pg_catalog.pg_is_in_recovery() AS standby', 'SHOW transaction_read_only']);
  });

  it('spreads connections over the hosts with load_balance_hosts=random', async () => {
    const a = await fake({});
    const b = await fake({});
    servers.push(a, b);
    const pool = new Pool({ host: '127.0.0.1,127.0.0.1', port: [a.port, b.port], user: 'u', load_balance_hosts: 'random', max: 40 });
    pool.on('error', () => {});
    const clients = await Promise.all(Array.from({ length: 40 }, () => pool.connect()));
    expect(a.log.connections + b.log.connections).toBe(40);
    expect(a.log.connections).toBeGreaterThan(5);
    expect(b.log.connections).toBeGreaterThan(5);
    clients.forEach((client) => client.release(true));
  });
});
