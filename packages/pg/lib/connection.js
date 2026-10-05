// A connection to PostgreSQL (protocol 3.0). Queries are pipelined: their messages are sent as they come, each with
// its Sync, and the replies are matched in order, so one connection runs many queries at the same time. Queries
// that run again are prepared once per connection (named statements, by their text) and then only bound and
// executed; their rows are made by a function compiled for their columns.
const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { Writer } = require('./writer');
const { parserOf, paramToText } = require('./types');
const { resultParsers, paramWriters } = require('./binary');
const { DatabaseError, ConnectionError, PgError } = require('./errors');
const { parseRequireAuth, parseChannelBinding, allows, refuse, endPoint } = require('./auth');

const PROTOCOL_VERSION = 196608;
// Settings of the session given in the config and sent in the startup message (as pg does).
const SESSION_TIMEOUTS = ['statement_timeout', 'lock_timeout', 'idle_in_transaction_session_timeout'];
const SSL_REQUEST = 80877103;
const CANCEL_REQUEST = 80877102;

function abortError(signal) {
  const err = new PgError('The query was aborted', { cause: signal && signal.reason });
  err.name = 'AbortError';
  err.code = 'ABORT_ERR';
  return err;
}
const MAX_STATEMENTS = 1000;
// Texts run once remembered at most (beyond, they are forgotten and start again).
const MAX_TEXTS = 5000;

// Message types (char codes).
const AUTHENTICATION = 0x52; // R
const PARAMETER_STATUS = 0x53; // S
const BACKEND_KEY = 0x4b; // K
const READY = 0x5a; // Z
const ROW_DESCRIPTION = 0x54; // T
const DATA_ROW = 0x44; // D
const COMMAND_COMPLETE = 0x43; // C
const ERROR = 0x45; // E
const NOTICE = 0x4e; // N
const NOTIFICATION = 0x41; // A
const NO_DATA = 0x6e; // n
const PARAMETER_DESCRIPTION = 0x74; // t
const EMPTY_QUERY = 0x49; // I
const COPY_IN = 0x47; // G
const COPY_OUT = 0x48; // H
const COPY_BOTH = 0x57; // W
const COPY_DATA = 0x64; // d
const COPY_DONE = 0x63; // c
// Data of COPY OUT kept (bytes) before the socket is paused, until they are read.
const COPY_HIGH_WATER = 4 * 1024 * 1024;

function readCString(buffer, offset) {
  const end = buffer.indexOf(0, offset);
  return [buffer.utf8Slice(offset, end), end + 1];
}

// The fields of an ErrorResponse or a NoticeResponse.
function readFields(buffer, start, end) {
  const fields = {};
  let offset = start;
  while (offset < end && buffer[offset] !== 0) {
    const code = String.fromCharCode(buffer[offset]);
    let value;
    [value, offset] = readCString(buffer, offset + 1);
    fields[code] = value;
  }
  return fields;
}

// The description of the rows of a query: the fields, the parser of each and the function that makes a row.
function describe(buffer, start, custom) {
  const count = buffer.readInt16BE(start);
  const fields = new Array(count);
  const parsers = new Array(count);
  const binaryParsers = new Array(count);
  // The columns read in binary (when the statement is prepared): types with a binary parser and no parser of the
  // user.
  let resultFormats = null;
  let offset = start + 2;
  for (let i = 0; i < count; i += 1) {
    let name;
    [name, offset] = readCString(buffer, offset);
    const field = {
      name,
      tableID: buffer.readInt32BE(offset),
      columnID: buffer.readInt16BE(offset + 4),
      dataTypeID: buffer.readInt32BE(offset + 6),
      dataTypeSize: buffer.readInt16BE(offset + 10),
      dataTypeModifier: buffer.readInt32BE(offset + 12),
      format: buffer.readInt16BE(offset + 16) === 0 ? 'text' : 'binary',
    };
    offset += 18;
    fields[i] = field;
    parsers[i] = parserOf(field.dataTypeID, custom);
    const binary = custom && custom.has(field.dataTypeID) ? undefined : resultParsers.get(field.dataTypeID);
    binaryParsers[i] = binary || parsers[i];
    if (binary) {
      if (resultFormats === null) resultFormats = new Array(count).fill(0);
      resultFormats[i] = 1;
    }
  }
  const names = fields.map((field) => field.name);
  let make = null;
  // __proto__ in an object literal would set the prototype: such rows are made property by property.
  if (!names.includes('__proto__')) {
    const properties = names.map((name, i) => `${JSON.stringify(name)}: v[${i}]`).join(', ');
    // eslint-disable-next-line no-new-func
    make = new Function('v', `return { ${properties} };`);
  } else {
    make = (values) => {
      const row = {};
      names.forEach((name, i) =>
        Object.defineProperty(row, name, { value: values[i], enumerable: true, writable: true, configurable: true })
      );
      return row;
    };
  }
  return { fields, parsers, binaryParsers, resultFormats, make, values: new Array(count) };
}

function commandOf(tag) {
  const space = tag.indexOf(' ');
  const command = space === -1 ? tag : tag.slice(0, space);
  const last = tag.lastIndexOf(' ');
  const count = last === -1 ? NaN : Number(tag.slice(last + 1));
  return { command, rowCount: Number.isNaN(count) ? null : count };
}

let nextStatement = 1;

// The SCRAM keys derived from a password, a salt and a number of iterations (PBKDF2, slow on purpose): the
// connections after the first to the same server reuse them.
const saltedPasswords = new Map();

function saltedPassword(password, salt, iterations, length, digest) {
  const key = crypto
    .createHash('sha256')
    .update(`${password}\u0000${salt.toString('base64')}\u0000${iterations}`)
    .digest('base64');
  let salted = saltedPasswords.get(key);
  if (salted === undefined) {
    salted = crypto.pbkdf2Sync(password, salt, iterations, length, digest);
    if (saltedPasswords.size > 100) saltedPasswords.clear();
    saltedPasswords.set(key, salted);
  }
  return salted;
}

class Connection extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.socket = null;
    this.writer = new Writer();
    this.queue = [];
    this.statements = new Map();
    // The texts of several statements, run as simple queries (they cannot be prepared).
    this.simpleTexts = new Set();
    // The texts run once and not prepared yet (they are the second time they run).
    this.texts = new Set();
    this.parameters = {};
    this.processID = null;
    this.secretKey = null;
    this.transactionStatus = 'I';
    this.closed = false;
    // The promise of end() once it was called (new queries are refused).
    this.ending = null;
    this.corked = false;
    // A COPY holding the connection (a promise of its end).
    this.held = null;
    this.pending = null;
    this.partial = null;
    this.custom = options.types || null;
    // What the server asked for (method), whether it was bound to the channel, and what is accepted.
    this.auth = {
      requirement: parseRequireAuth(options.require_auth),
      channelBinding: parseChannelBinding(options.channel_binding),
      method: null,
      sasl: null,
      bound: false,
      ok: false,
    };
    this.prepare = options.prepare !== false;
    // Prepared statements send parameters and read results in binary for the types that have it.
    this.binary = options.binary !== false;
  }

  // The number of queries sent and not ended (a connection held for a COPY or a cancellable query is busy).
  get busy() {
    return this.queue.length + (this.held ? 1 : 0);
  }

  // Where the server is: a TCP host and port, or a unix socket when the host is a directory (as in libpq:
  // /var/run/postgresql is /var/run/postgresql/.s.PGSQL.5432).
  get address() {
    const { host = '127.0.0.1', port = 5432 } = this.options;
    if (typeof host === 'string' && host.startsWith('/')) return { path: `${host}/.s.PGSQL.${port}`, name: host };
    return { host, port, name: `${host}:${port}` };
  }

  // Connects and logs in. The whole of it (TCP, TLS, authentication) has connectionTimeoutMillis (30 s by default; 0
  // waits forever): a connection that has not logged in by then is closed.
  connect() {
    const { options } = this;
    const timeout = options.connectionTimeoutMillis ?? options.connectTimeoutMillis ?? 30000;
    const { path, host, port, name } = this.address;
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.destroy(err);
        reject(err);
      };
      if (timeout > 0) {
        timer = setTimeout(
          () => fail(new ConnectionError(`Cannot connect to ${name}: timed out after ${timeout} ms`)),
          timeout
        );
      }
      const socket = path ? net.connect({ path }) : net.connect({ host, port });
      socket.setNoDelay(true);
      socket.once('error', (err) =>
        fail(new ConnectionError(`Cannot connect to ${name}: ${err.message}`, { cause: err }))
      );
      socket.once('connect', async () => {
        try {
          // Unix sockets are not encrypted (as in libpq).
          this.socket = options.ssl && !path ? await this.upgrade(socket) : socket;
          this.listen();
          // The user and the password can be functions (sync or async): asked for every connection.
          this.user = typeof options.user === 'function' ? await options.user() : options.user;
          this.password = typeof options.password === 'function' ? await options.password() : options.password;
          if (settled) return;
          // The startup is a query of its own: it ends with the first ReadyForQuery.
          const startup = new Promise((done, failed) => {
            this.queue.push({ startup: true, resolve: done, reject: failed });
          });
          this.sendStartup();
          await startup;
          // Servers before PostgreSQL 12 write floats in text with 15 digits (they lose precision): with
          // extra_float_digits 3 they write them exactly (12 and later always do). Set now, not as a startup
          // parameter, which some poolers (PgBouncer) refuse.
          if (Number.parseInt(this.parameters.server_version, 10) < 12) {
            await this.send('SET extra_float_digits = 3').promise;
          }
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(this);
        } catch (err) {
          fail(err);
        }
      });
    });
  }

  // SSLRequest, then TLS over the socket when the server accepts it. With sslmode prefer, a server that does not
  // accept it is talked to without TLS.
  upgrade(socket) {
    const ssl = this.options.ssl === true ? {} : this.options.ssl;
    return new Promise((resolve, reject) => {
      const request = Buffer.alloc(8);
      request.writeInt32BE(8, 0);
      request.writeInt32BE(SSL_REQUEST, 4);
      socket.once('data', (data) => {
        if (data[0] === 0x4e && this.options.sslmode === 'prefer') {
          resolve(socket);
          return;
        }
        if (data[0] !== 0x53) {
          reject(new ConnectionError('The server does not accept SSL connections'));
          return;
        }
        // Bytes after the answer, before TLS, would be taken as messages of the server that no one encrypted
        // (CVE-2021-23222 of libpq): refused.
        if (data.length > 1) {
          reject(new ConnectionError('The server sent data before TLS was set up'));
          return;
        }
        // The certificate is checked against the host (an IP too: without `host`, Node would check it against
        // localhost); the name of the server (SNI) is sent for host names only.
        const host = this.options.host || '127.0.0.1';
        const secure = tls.connect({ socket, host, servername: net.isIP(host) ? undefined : host, ...ssl });
        secure.once('secureConnect', () => resolve(secure));
        secure.once('error', reject);
      });
      socket.write(request);
    });
  }

  listen() {
    const { socket } = this;
    socket.removeAllListeners('error');
    socket.on('error', (err) => this.destroy(new ConnectionError(err.message, { cause: err })));
    socket.on('close', () => this.destroy(new ConnectionError('The connection was closed')));
    socket.on('data', (chunk) => this.onData(chunk));
  }

  sendStartup() {
    const { database, application_name: applicationName, options: serverOptions } = this.options;
    const { user } = this;
    const writer = this.writer.start(0).int32(PROTOCOL_VERSION).cstring('user').cstring(user);
    writer.cstring('database').cstring(database || user);
    writer.cstring('client_encoding').cstring('UTF8');
    writer.cstring('DateStyle').cstring('ISO, MDY');
    if (applicationName) writer.cstring('application_name').cstring(applicationName);
    if (serverOptions) writer.cstring('options').cstring(serverOptions);
    // The timeouts of the session, as pg sends them (milliseconds).
    for (const name of SESSION_TIMEOUTS) {
      const value = this.options[name];
      if (value !== undefined && value !== null && value !== false) {
        writer.cstring(name).cstring(String(Number.parseInt(value, 10)));
      }
    }
    writer.byte(0).end();
    this.socket.write(writer.flush());
  }

  // Messages are cut from the chunks: the complete ones of a chunk are read where they are. A message cut between
  // chunks is copied once into a buffer of its size (`partial`), known from its header, that the next chunks fill:
  // joining every chunk to what came before would copy a large message (a value of megabytes, in chunks of 64 kB)
  // again and again. Only a header cut between chunks (less than 5 bytes, `pending`) is joined to the next chunk.
  onData(chunk) {
    let buffer = chunk;
    let offset = 0;
    if (this.partial) {
      const partial = this.partial;
      const taken = Math.min(partial.buffer.length - partial.filled, chunk.length);
      chunk.copy(partial.buffer, partial.filled, 0, taken);
      partial.filled += taken;
      if (partial.filled < partial.buffer.length) return;
      this.partial = null;
      if (!this.dispatch(partial.buffer, 0, partial.buffer.length)) return;
      offset = taken;
    } else if (this.pending) {
      buffer = Buffer.concat([this.pending, chunk]);
      this.pending = null;
    }
    const { length } = buffer;
    while (offset + 5 <= length) {
      const end = offset + 1 + buffer.readInt32BE(offset + 1);
      if (end > length) break;
      if (!this.dispatch(buffer, offset, end)) return;
      offset = end;
    }
    if (offset === length) return;
    if (length - offset < 5) {
      this.pending = buffer.subarray(offset);
      return;
    }
    const message = Buffer.allocUnsafe(1 + buffer.readInt32BE(offset + 1));
    buffer.copy(message, 0, offset, length);
    this.partial = { buffer: message, filled: length - offset };
  }

  // Reads one message (buffer[start] is its type); false when it broke the connection.
  dispatch(buffer, start, end) {
    try {
      this.onMessage(buffer[start], buffer, start + 5, end);
      return true;
    } catch (err) {
      this.destroy(err instanceof PgError ? err : new ConnectionError(err.message, { cause: err }));
      return false;
    }
  }

  onMessage(type, buffer, start, end) {
    const query = this.queue[0];
    switch (type) {
      case DATA_ROW: {
        // The rows after a value that could not be parsed are not read: the query fails with that error.
        if (query.error) return;
        // Queries sent while their statement was being prepared take its description when their rows come.
        let { description } = query;
        if (description === null) description = query.description = query.statement.description;
        const count = buffer.readInt16BE(start);
        const { values } = description;
        const parsers = query.binaryResults ? description.binaryParsers : description.parsers;
        let offset = start + 2;
        for (let i = 0; i < count; i += 1) {
          const size = buffer.readInt32BE(offset);
          offset += 4;
          if (size === -1) values[i] = null;
          else {
            try {
              values[i] = parsers[i](buffer, offset, offset + size);
            } catch (err) {
              // A parser of the user that throws (or a value too large for a string): an error of the query, not
              // of the connection (the messages are still read where they are).
              const field = description.fields[i];
              query.error = new PgError(
                `Cannot parse the value of ${field.name} (type ${field.dataTypeID}): ${err.message}`,
                {
                  cause: err,
                }
              );
              return;
            }
            offset += size;
          }
        }
        query.rows.push(query.rowMode === 'array' ? values.slice(0, count) : description.make(values));
        return;
      }
      case ROW_DESCRIPTION:
        query.description = describe(buffer, start, this.custom);
        if (query.statement) query.statement.description = query.description;
        return;
      case PARAMETER_DESCRIPTION: {
        if (!query.statement) return;
        const count = buffer.readInt16BE(start);
        const types = new Array(count);
        for (let i = 0; i < count; i += 1) types[i] = buffer.readInt32BE(start + 2 + i * 4);
        query.statement.paramTypes = types;
        return;
      }
      case NO_DATA:
        query.description = null;
        if (query.statement) query.statement.description = null;
        return;
      case COMMAND_COMPLETE: {
        const [tag] = readCString(buffer, start);
        query.results.push(this.result(query, tag));
        query.rows = [];
        // The next statement of a simple query has a description of its own.
        if (query.simple) query.description = null;
        return;
      }
      case EMPTY_QUERY:
        query.results.push(this.result(query, ''));
        return;
      case ERROR: {
        const error = new DatabaseError(readFields(buffer, start, end));
        if (!query || query.startup) {
          if (query) query.error = error;
          else throw error;
          if (query && query.startup) this.endQuery();
          return;
        }
        query.error = query.error || error;
        // A statement that failed to be prepared is not kept.
        if (query.preparing) this.statements.delete(query.text);
        return;
      }
      case READY:
        // A server cannot make a connection usable without saying it is authenticated (and so being checked).
        if (query && query.startup && !query.error && !this.auth.ok) {
          throw new ConnectionError('The server did not authenticate the connection');
        }
        this.transactionStatus = String.fromCharCode(buffer[start]);
        this.endQuery();
        return;
      case AUTHENTICATION:
        this.authenticate(buffer, start, end);
        return;
      case PARAMETER_STATUS: {
        const [name, offset] = readCString(buffer, start);
        [this.parameters[name]] = readCString(buffer, offset);
        return;
      }
      case BACKEND_KEY:
        this.processID = buffer.readInt32BE(start);
        this.secretKey = buffer.readInt32BE(start + 4);
        return;
      case NOTICE:
        this.emit('notice', new DatabaseError(readFields(buffer, start, end)));
        return;
      case NOTIFICATION: {
        const processId = buffer.readInt32BE(start);
        const [channel, offset] = readCString(buffer, start + 4);
        const [payload] = readCString(buffer, offset);
        this.emit('notification', { processId, channel, payload });
        return;
      }
      case COPY_IN:
        if (query.onCopyIn) query.onCopyIn();
        else {
          // COPY FROM STDIN run by query(): it has no data to send. A prepared one needs a Sync after the CopyFail
          // (the server ignores the Sync sent before the copy began).
          this.writer.start(0x66).cstring('COPY FROM STDIN needs copyFrom()').end();
          if (!query.simple) this.writer.start(0x53).end();
          this.socket.write(this.writer.flush());
        }
        return;
      case COPY_DATA:
        if (query.onCopyData) query.onCopyData(Buffer.from(buffer.subarray(start, end)));
        return;
      case COPY_OUT:
      case COPY_DONE:
        return;
      case COPY_BOTH:
        throw new PgError('COPY BOTH (replication) is not supported');
      default:
        // ParseComplete, BindComplete, CloseComplete, ParameterDescription, PortalSuspended.
        return;
    }
  }

  result(query, tag) {
    const { command, rowCount } = commandOf(tag);
    const description = query.description || (query.statement && !query.simple ? query.statement.description : null);
    return {
      command,
      rowCount: command === 'SELECT' || command === 'FETCH' ? query.rows.length : rowCount,
      rows: query.rows,
      fields: description ? description.fields : [],
      rowAsArray: query.rowMode === 'array',
    };
  }

  endQuery() {
    const query = this.queue.shift();
    if (!query) return;
    if (query.error) query.reject(query.error);
    else if (query.startup) query.resolve();
    else if (query.describe) {
      const { description, paramTypes } = query.statement;
      query.resolve({ fields: description ? description.fields : [], params: paramTypes || [] });
    } else if (query.simple && query.results.length > 1) query.resolve(query.results);
    else query.resolve(query.results[0] || this.result(query, ''));
    if (this.queue.length === 0) this.emit('drain');
  }

  // Authentication: cleartext passwords, MD5, SCRAM-SHA-256 (bound to the TLS channel, SCRAM-SHA-256-PLUS, when it
  // can be) and OAUTHBEARER (a token of the application). Every request of the server is checked before it is answered
  // (require_auth, channel_binding), and the server is answered once: one that asks again is refused.
  authenticate(buffer, start, end) {
    const code = buffer.readInt32BE(start);
    const { auth } = this;
    switch (code) {
      case 0:
        this.checkAuthenticated();
        return;
      case 3:
      case 5: {
        const method = code === 3 ? 'password' : 'md5';
        this.expect(method);
        const password = this.needPassword();
        if (code === 3) {
          this.socket.write(this.writer.start(0x70).cstring(password).end().flush());
          return;
        }
        const md5 = (value) => crypto.createHash('md5').update(value).digest('hex');
        const salt = buffer.subarray(start + 4, start + 8);
        const inner = md5(password + this.user);
        const outer = md5(Buffer.concat([Buffer.from(inner), salt]));
        this.socket.write(this.writer.start(0x70).cstring(`md5${outer}`).end().flush());
        return;
      }
      case 10: {
        const mechanisms = buffer
          .latin1Slice(start + 4, end)
          .split('\u0000')
          .filter(Boolean);
        this.startSasl(mechanisms);
        return;
      }
      case 11: {
        if (!auth.sasl) throw new ConnectionError('The server continued an authentication that did not start');
        const data = buffer.subarray(start + 4, end);
        if (auth.sasl.mechanism === 'OAUTHBEARER') {
          // The token was refused: the server says why (JSON) and waits for a dummy answer before its error.
          auth.sasl.error = data.toString();
          this.socket.write(
            this.writer
              .start(0x70)
              .bytes(Buffer.from([1]))
              .end()
              .flush()
          );
          return;
        }
        this.scramContinue(data.toString());
        return;
      }
      case 12: {
        const { sasl } = auth;
        if (!sasl || !sasl.serverSignature) throw new ConnectionError('Invalid SASL final message of the server');
        const final = buffer.utf8Slice(start + 4, end);
        if (final.slice(2) !== sasl.serverSignature) {
          throw new ConnectionError('The SCRAM signature of the server does not match');
        }
        // Bound only once the server proved it knows the password, over the channel it was bound to.
        auth.bound = sasl.mechanism === 'SCRAM-SHA-256-PLUS';
        sasl.verified = true;
        return;
      }
      default:
        throw new ConnectionError(`Unsupported authentication method (${code})`);
    }
  }

  needPassword() {
    if (typeof this.password !== 'string') {
      throw new ConnectionError('The server asks for a password and none was given');
    }
    return this.password;
  }

  // A method the server asks for: refused when require_auth does not allow it, when channel binding is required
  // (only SCRAM-SHA-256-PLUS binds), or when the server already asked for one.
  expect(method) {
    const { auth } = this;
    if (auth.method !== null) throw new ConnectionError('The server asked to authenticate again');
    if (!allows(auth.requirement, method)) throw refuse(method, auth.requirement);
    if (auth.channelBinding === 'require' && method !== 'scram-sha-256') {
      throw new ConnectionError(`channel_binding=require, and the server asked for ${method} authentication`);
    }
    auth.method = method;
  }

  // AuthenticationOk: the requirements are met (also by a server that asked for nothing).
  checkAuthenticated() {
    const { auth } = this;
    if (auth.method === null && !allows(auth.requirement, 'none')) throw refuse('none', auth.requirement);
    if (auth.channelBinding === 'require' && !auth.bound) {
      throw new ConnectionError('channel_binding=require, and the authentication was not bound to the channel');
    }
    if (auth.sasl && auth.sasl.mechanism.startsWith('SCRAM') && !auth.sasl.verified) {
      throw new ConnectionError('The server ended SCRAM without proving it knows the password');
    }
    auth.ok = true;
  }

  // AuthenticationSASL: the mechanism chosen among those of the server. OAUTHBEARER when a token is given (unless
  // channel binding is required: it does not bind), SCRAM-SHA-256-PLUS over TLS when the server has it (unless
  // channel_binding=disable), SCRAM-SHA-256 otherwise.
  startSasl(mechanisms) {
    const { auth, options } = this;
    const encrypted = Boolean(this.socket.encrypted);
    const plus = mechanisms.includes('SCRAM-SHA-256-PLUS');
    if (plus && !encrypted) {
      throw new ConnectionError('The server offers SCRAM-SHA-256-PLUS on a connection without TLS');
    }
    const token = options.oauthBearerToken;
    let mechanism = null;
    if (
      mechanisms.includes('OAUTHBEARER') &&
      token !== undefined &&
      token !== null &&
      auth.channelBinding !== 'require' &&
      allows(auth.requirement, 'oauth')
    ) {
      mechanism = 'OAUTHBEARER';
    } else if (plus && auth.channelBinding !== 'disable') mechanism = 'SCRAM-SHA-256-PLUS';
    else if (mechanisms.includes('SCRAM-SHA-256')) mechanism = 'SCRAM-SHA-256';
    else if (mechanisms.includes('OAUTHBEARER')) {
      throw new ConnectionError('The server asks for an OAuth token (OAUTHBEARER) and no oauthBearerToken was given');
    }
    if (!mechanism) throw new ConnectionError(`No supported SASL mechanism (${mechanisms.join(', ')})`);
    this.expect(mechanism === 'OAUTHBEARER' ? 'oauth' : 'scram-sha-256');
    if (auth.channelBinding === 'require' && mechanism !== 'SCRAM-SHA-256-PLUS') {
      throw new ConnectionError(
        encrypted
          ? 'channel_binding=require, and the server does not offer SCRAM-SHA-256-PLUS'
          : 'channel_binding=require needs TLS'
      );
    }
    auth.sasl = { mechanism };
    if (mechanism === 'OAUTHBEARER') {
      // The token can be a function (sync or async): asked for when the server wants it.
      this.authenticating = Promise.resolve(typeof token === 'function' ? token() : token).then((value) => {
        if (typeof value !== 'string' || !value)
          throw new ConnectionError('The OAuth token must be a non-empty string');
        if (this.closed) return;
        const initial = Buffer.from(`n,,\u0001auth=Bearer ${value}\u0001\u0001`);
        this.socket.write(
          this.writer.start(0x70).cstring(mechanism).int32(initial.length).bytes(initial).end().flush()
        );
      });
      this.authenticating.catch((err) =>
        this.destroy(err instanceof ConnectionError ? err : new ConnectionError(err.message, { cause: err }))
      );
      return;
    }
    // The GS2 header: p= when bound, y when the client could bind but the server cannot (over TLS), n otherwise.
    let header = 'n,,';
    if (mechanism === 'SCRAM-SHA-256-PLUS') {
      header = 'p=tls-server-end-point,,';
      auth.sasl.binding = endPoint(this.socket);
    } else if (encrypted && auth.channelBinding !== 'disable') header = 'y,,';
    const nonce = crypto.randomBytes(18).toString('base64');
    Object.assign(auth.sasl, { header, nonce, firstBare: `n=*,r=${nonce}`, password: this.needPassword() });
    const first = Buffer.from(`${header}${auth.sasl.firstBare}`);
    this.socket.write(this.writer.start(0x70).cstring(mechanism).int32(first.length).bytes(first).end().flush());
  }

  // AuthenticationSASLContinue of SCRAM: the proof of the client, and the signature the server must answer with.
  scramContinue(serverFirst) {
    const { sasl } = this.auth;
    if (sasl.serverSignature) throw new ConnectionError('The server continued SCRAM twice');
    const server = Object.fromEntries(serverFirst.split(',').map((part) => [part[0], part.slice(2)]));
    if (!server.r || !server.r.startsWith(sasl.nonce) || !server.s || !Number(server.i)) {
      throw new ConnectionError('Invalid SCRAM reply of the server');
    }
    const salted = saltedPassword(
      sasl.password.normalize('NFKC'),
      Buffer.from(server.s, 'base64'),
      Number(server.i),
      32,
      'sha256'
    );
    const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
    const clientKey = hmac(salted, 'Client Key');
    // c=: the GS2 header and, when bound, the hash of the certificate of the server.
    const channel = Buffer.concat([Buffer.from(sasl.header), sasl.binding || Buffer.alloc(0)]).toString('base64');
    const withoutProof = `c=${channel},r=${server.r}`;
    const authMessage = `${sasl.firstBare},${serverFirst},${withoutProof}`;
    const signature = hmac(crypto.createHash('sha256').update(clientKey).digest(), authMessage);
    const proof = Buffer.from(clientKey.map((byte, i) => byte ^ signature[i]));
    sasl.serverSignature = hmac(hmac(salted, 'Server Key'), authMessage).toString('base64');
    const final = Buffer.from(`${withoutProof},p=${proof.toString('base64')}`);
    this.socket.write(this.writer.start(0x70).bytes(final).end().flush());
  }

  // Runs a query: { text, values, rowMode, prepare }. Without values, it is a simple query (several statements may
  // be given; their results are an array when there is more than one).
  query(text, values, options = {}) {
    if (this.closed || !this.socket) return Promise.reject(new ConnectionError('The connection is closed'));
    if (this.ending) return Promise.reject(new ConnectionError('The connection is ending'));
    // A COPY holds the connection: the queries sent while it runs go after it.
    if (this.held) return this.held.then(() => this.query(text, values, options));
    return this.send(text, values, options).promise;
  }

  // Sends a query and gives it with the promise of its result. `options.copy` has the functions of a COPY.
  send(text, values, options = {}) {
    let query;
    const promise = new Promise((resolve, reject) => {
      query = {
        text,
        values,
        rowMode: options.rowMode,
        simple: values === undefined,
        statement: null,
        preparing: false,
        binaryResults: false,
        description: null,
        rows: [],
        results: [],
        error: null,
        onCopyIn: options.onCopyIn,
        onCopyData: options.onCopyData,
        resolve,
        reject,
      };
      try {
        if (options.describe) this.writeDescribe(query);
        else if (query.simple) this.writer.start(0x51).cstring(text).end();
        else this.writeExtended(query, options.prepare !== false && this.prepare);
      } catch (err) {
        // A value that cannot be written (its toPostgres() throws, an invalid Date): nothing of the query is sent,
        // and a statement it was preparing is not kept (it was never prepared). The statements it closed are
        // closed (they are no longer in the cache).
        if (query.preparing) this.statements.delete(text);
        this.writer.offset = query.housekeeping || 0;
        if (this.writer.offset > 0) this.write(this.writer.flush());
        reject(err);
        return;
      }
      this.queue.push(query);
      this.write(this.writer.flush());
    });
    return { promise, query };
  }

  // Runs a query that can be cancelled: by an AbortSignal (`signal`) or after `timeout` milliseconds. It rejects at once;
  // a query sent is then cancelled in the server (CancelRequest). It has the connection to itself (after the queries
  // sent before, and before those sent after), so the cancel stops it and no other query.
  cancellableQuery(text, values, options, { signal, timeout }) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let sent = false;
      let timer = null;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        fn(value);
      };
      const stop = (err) => {
        if (settled) return;
        if (sent) this.cancel();
        finish(reject, err);
      };
      function onAbort() {
        stop(abortError(signal));
      }
      if (signal) {
        if (signal.aborted) {
          reject(abortError(signal));
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
      if (timeout) {
        timer = setTimeout(() => {
          // As pg says it (its code tells it apart).
          const err = new PgError('Query read timeout');
          err.code = 'QUERY_TIMEOUT';
          stop(err);
        }, timeout);
      }
      this.hold().then((release) => {
        // Aborted while it waited for the connection: it is never sent.
        if (settled) {
          release();
          return;
        }
        sent = true;
        const { promise } = this.send(text, values, options);
        promise.then(
          (result) => finish(resolve, result),
          (err) => finish(reject, err)
        );
        // The connection is given back when the query has ended in the server (cancelled or not).
        promise.catch(() => {}).finally(release);
      });
    });
  }

  // Asks the server to cancel the query running in this connection: a CancelRequest from another connection. Gives
  // whether it was sent.
  cancel() {
    const { path, host, port } = this.address;
    return new Promise((resolve) => {
      if (this.processID === null) {
        resolve(false);
        return;
      }
      const socket = path ? net.connect({ path }) : net.connect({ host, port });
      socket.once('error', () => resolve(false));
      socket.once('connect', async () => {
        let target = socket;
        try {
          if (this.options.ssl && !path) target = await this.upgrade(socket);
        } catch {
          socket.destroy();
          resolve(false);
          return;
        }
        const message = Buffer.alloc(16);
        message.writeInt32BE(16, 0);
        message.writeInt32BE(CANCEL_REQUEST, 4);
        message.writeInt32BE(this.processID, 8);
        message.writeInt32BE(this.secretKey, 12);
        target.once('close', () => resolve(true));
        target.end(message);
      });
    });
  }

  // Holds the connection for one user (a COPY): after the queries sent before, and before those sent after. Gives the
  // function that gives it back.
  async hold() {
    while (this.held) await this.held;
    let release;
    this.held = new Promise((resolve) => {
      release = resolve;
    });
    if (this.queue.length) await new Promise((resolve) => this.once('drain', resolve));
    return () => {
      this.held = null;
      release();
      // Free again: who waits for it (the pool) is told.
      if (this.queue.length === 0) this.emit('drain');
    };
  }

  // COPY ... FROM STDIN with the data given: a Buffer, a string, or an iterable or async iterable of them (in the format
  // of the COPY). On an error of the data, the COPY fails (CopyFail) and the error is thrown.
  async copyFrom(text, data) {
    if (this.closed || !this.socket) throw new ConnectionError('The connection is closed');
    if (this.ending) throw new ConnectionError('The connection is ending');
    const release = await this.hold();
    try {
      let started;
      const start = new Promise((resolve) => {
        started = resolve;
      });
      const { promise } = this.send(text, undefined, { onCopyIn: () => started(true) });
      // A text that is not a COPY FROM STDIN (or fails) ends without CopyInResponse.
      promise.then(
        () => started(false),
        () => started(false)
      );
      if (!(await start)) return await promise;
      try {
        const chunks = typeof data === 'string' || Buffer.isBuffer(data) ? [data] : data;
        for await (const chunk of chunks) await this.copyData(chunk);
      } catch (err) {
        this.socket.write(
          this.writer
            .start(0x66)
            .cstring(String(err && err.message))
            .end()
            .flush()
        );
        await promise.catch(() => {});
        throw err;
      }
      this.socket.write(this.writer.start(0x63).end().flush());
      return await promise;
    } finally {
      release();
    }
  }

  // Writes a CopyData message, waiting for the socket when it is full.
  async copyData(chunk) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    if (bytes.length === 0) return;
    if (this.closed) throw new ConnectionError('The connection is closed');
    const header = Buffer.allocUnsafe(5);
    header[0] = COPY_DATA;
    header.writeInt32BE(bytes.length + 4, 1);
    this.socket.write(header);
    if (!this.socket.write(bytes)) {
      await new Promise((resolve) => {
        const done = () => {
          this.socket.removeListener('drain', done);
          this.socket.removeListener('close', done);
          resolve();
        };
        this.socket.once('drain', done);
        this.socket.once('close', done);
      });
    }
  }

  // COPY ... TO STDOUT: the chunks of data as they come (an async iterator). The socket is paused while too much
  // data waits to be read; leaving the iteration early reads (and drops) the rest.
  async *copyTo(text) {
    if (this.closed || !this.socket) throw new ConnectionError('The connection is closed');
    if (this.ending) throw new ConnectionError('The connection is ending');
    const release = await this.hold();
    const chunks = [];
    let waiting = 0;
    let wake = null;
    let finished = false;
    let failure = null;
    let paused = false;
    const signal = () => {
      if (wake) wake();
    };
    const { promise, query } = this.send(text, undefined, {
      onCopyData: (chunk) => {
        chunks.push(chunk);
        waiting += chunk.length;
        if (waiting > COPY_HIGH_WATER && !paused) {
          paused = true;
          this.socket.pause();
        }
        signal();
      },
    });
    promise.then(
      () => {
        finished = true;
        signal();
      },
      (err) => {
        failure = err;
        finished = true;
        signal();
      }
    );
    try {
      for (;;) {
        if (chunks.length) {
          const chunk = chunks.shift();
          waiting -= chunk.length;
          if (paused && waiting < COPY_HIGH_WATER / 2) {
            paused = false;
            this.socket.resume();
          }
          yield chunk;
        } else if (finished) {
          if (failure) throw failure;
          return;
        } else {
          await new Promise((resolve) => {
            wake = resolve;
          });
          wake = null;
        }
      }
    } finally {
      if (!finished) {
        query.onCopyData = null;
        chunks.length = 0;
        if (paused) this.socket.resume();
        await promise.catch(() => {});
      }
      release();
    }
  }

  // Describes a text without running it: Parse (unnamed) and Describe of the statement, then Sync. The server says
  // the types of its parameters (ParameterDescription) and its columns (RowDescription, or NoData).
  writeDescribe(query) {
    query.simple = false;
    query.describe = true;
    query.statement = { description: null, paramTypes: null };
    this.writer.start(0x50).cstring('').cstring(query.text).int16(0).end();
    this.writer.start(0x44).byte(0x53).cstring('').end();
    this.writer.start(0x53).end();
  }

  writeExtended(query, prepare) {
    const { writer } = this;
    const { text } = query;
    let name = '';
    // Statements to forget are closed first (in order: the queries sent before still use them).
    if (this.forgetting) {
      this.forgetting = false;
      this.statements.forEach((statement) => writer.start(0x43).byte(0x53).cstring(statement.name).end());
      this.statements.clear();
    }
    query.housekeeping = writer.offset;
    if (prepare) {
      let statement = this.statements.get(text);
      if (statement === undefined && this.statements.size >= MAX_STATEMENTS) this.evictStatement();
      // The Close messages above are sent even if the values of this query cannot be written (see send()).
      query.housekeeping = writer.offset;
      if (statement === undefined) {
        statement = { name: `xufa_${nextStatement}`, description: null, paramTypes: null };
        nextStatement += 1;
        this.statements.set(text, statement);
        writer.start(0x50).cstring(statement.name).cstring(text).int16(0).end();
        writer.start(0x44).byte(0x53).cstring(statement.name).end();
        query.preparing = true;
      } else {
        query.description = statement.description;
      }
      query.statement = statement;
      ({ name } = statement);
    } else {
      writer.start(0x50).cstring('').cstring(text).int16(0).end();
    }
    // Bind. Parameters go in binary when the type of their statement is known and they are of it (and Buffers,
    // for bytea), in text otherwise; their format codes are written first and set as the values are written.
    const values = query.values || [];
    const { statement } = query;
    const types = statement && this.binary ? statement.paramTypes : null;
    writer.start(0x42).cstring('').cstring(name);
    const count = values.length;
    writer.int16(count);
    const formats = writer.offset;
    for (let i = 0; i < count; i += 1) writer.int16(0);
    writer.int16(count);
    for (let i = 0; i < count; i += 1) {
      const value = values[i];
      if (value === null || value === undefined) {
        writer.int32(-1);
        continue;
      }
      const write = types === null ? undefined : paramWriters.get(types[i]);
      if (write !== undefined && write(writer, value)) {
        writer.buffer[formats + i * 2 + 1] = 1;
        continue;
      }
      const param = paramToText(value);
      if (param === null) writer.int32(-1);
      else if (typeof param === 'string') writer.lengthString(param);
      else {
        writer.lengthBytes(param);
        writer.buffer[formats + i * 2 + 1] = 1;
      }
    }
    // Results in binary for the columns that have it, when the description of the statement is known.
    const description = statement && this.binary ? statement.description : null;
    if (description && description.resultFormats) {
      const { resultFormats } = description;
      writer.int16(resultFormats.length);
      for (let i = 0; i < resultFormats.length; i += 1) writer.int16(resultFormats[i]);
      query.binaryResults = true;
    } else writer.int16(0);
    writer.end();
    if (!prepare) writer.start(0x44).byte(0x50).cstring('').end();
    writer.start(0x45).cstring('').int32(0).end();
    writer.start(0x53).end();
  }

  // Whether a text ran before (it is prepared, or it is in the texts run once): the first time, it is remembered.
  ranBefore(text) {
    if (this.statements.has(text)) return true;
    if (this.texts.delete(text)) return true;
    if (this.texts.size >= MAX_TEXTS) this.texts.clear();
    this.texts.add(text);
    return false;
  }

  // The statements prepared are closed before the next query (after DDL: their tables or types changed).
  forgetStatements() {
    if (this.statements.size) this.forgetting = true;
  }

  // Closes the statement prepared first (the cache keeps the last ones).
  evictStatement() {
    const [text, statement] = this.statements.entries().next().value;
    this.statements.delete(text);
    this.writer.start(0x43).byte(0x53).cstring(statement.name).end();
  }

  // The messages of the same tick go to the socket in one write: it is corked until the next tick.
  write(message) {
    if (!this.corked) {
      this.corked = true;
      this.socket.cork();
      process.nextTick(() => {
        this.corked = false;
        if (!this.closed) this.socket.uncork();
      });
    }
    this.socket.write(message);
  }

  // Ends the connection: the queries sent before (and a COPY running) end first, since the server runs them; new ones
  // are refused. Then Terminate, and the socket closes.
  end() {
    if (!this.ending) this.ending = this.endGracefully();
    return this.ending;
  }

  async endGracefully() {
    while (!this.closed && (this.queue.length || this.held)) {
      if (this.held) await this.held;
      else {
        await new Promise((resolve) => {
          const done = () => {
            this.removeListener('drain', done);
            this.removeListener('end', done);
            resolve();
          };
          this.once('drain', done);
          this.once('end', done);
        });
      }
    }
    if (this.closed || !this.socket) {
      this.closed = true;
      return;
    }
    await new Promise((resolve) => {
      this.socket.once('close', resolve);
      this.closed = true;
      this.socket.end(this.writer.start(0x58).end().flush());
    });
  }

  destroy(err = new ConnectionError('The connection was closed')) {
    if (this.closed) return;
    this.closed = true;
    if (this.socket) this.socket.destroy();
    const { queue } = this;
    this.queue = [];
    queue.forEach((query) => query.reject(err));
    this.emit('end', err);
  }
}

module.exports = { Connection, describe, commandOf };
