// A client of SMTP (RFC 5321) for the smtp backend, over node:net and node:tls: the greeting, EHLO (HELO when the
// server knows no EHLO), STARTTLS (or TLS from the start: port 465), AUTH (PLAIN, LOGIN, XOAUTH2), and messages (MAIL,
// RCPT for each recipient, DATA with its dots doubled), on connections kept in a pool for the next messages (RSET
// after a message refused; a connection the server closed while it waited is opened again).
const net = require('node:net');
const tls = require('node:tls');
const os = require('node:os');
const { MailError } = require('../../errors');

// An error of the server (with its code and text) or of the connection.
function smtpError(message, response = null, extra = {}) {
  const err = new MailError(message);
  if (response) {
    err.responseCode = response.code;
    err.response = response.text;
  }
  return Object.assign(err, extra);
}

class SmtpConnection {
  constructor(options) {
    this.options = options;
    this.socket = null;
    this.text = '';
    this.lines = [];
    this.waiter = null;
    this.early = null;
    this.failure = null;
    this.extensions = new Map();
    this.messages = 0;
    this.closed = false;
    this.secure = Boolean(options.secure);
  }

  // Reads what the server answers: lines of one response (250-..., then 250 ...) as { code, text }.
  attach(socket) {
    if (this.socket) this.socket.removeAllListeners();
    this.socket = socket;
    socket.on('data', (chunk) => this.read(chunk));
    socket.on('error', (err) => this.fail(smtpError(`SMTP ${this.where()}: ${err.message}`, null, { cause: err })));
    socket.on('close', () =>
      this.fail(smtpError(`SMTP ${this.where()}: the connection closed`, null, { closed: true }))
    );
    socket.setTimeout(this.options.socketTimeout || 60000, () => {
      this.fail(
        smtpError(`SMTP ${this.where()}: no answer in ${this.options.socketTimeout || 60000} ms`, null, {
          timeout: true,
        })
      );
      socket.destroy();
    });
  }

  where() {
    return `${this.options.host}:${this.options.port}`;
  }

  read(chunk) {
    this.text += chunk.toString('latin1');
    let end = this.text.indexOf('\n');
    while (end >= 0) {
      const line = this.text.slice(0, end).replace(/\r$/, '');
      this.text = this.text.slice(end + 1);
      this.lines.push(line);
      if (!/^\d{3}-/.test(line)) {
        const code = Number(line.slice(0, 3));
        const text = this.lines.map((item) => item.slice(4)).join('\n');
        this.lines = [];
        const waiter = this.waiter;
        this.waiter = null;
        if (waiter) waiter.resolve({ code, text });
        else this.early = { code, text }; // a 421 the server sends before it closes
      }
      end = this.text.indexOf('\n');
    }
  }

  fail(err) {
    if (this.closed) return;
    this.closed = true;
    this.failure = err;
    const waiter = this.waiter;
    this.waiter = null;
    if (waiter) waiter.reject(err);
  }

  response() {
    if (this.early) {
      const early = this.early;
      this.early = null;
      return Promise.resolve(early);
    }
    if (this.closed) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }

  // A command, and its response (an error when its code is not one of `expected`). `shown`: the command as errors
  // tell it (credentials not shown).
  async command(line, expected, shown = line) {
    const answer = this.response();
    this.socket.write(`${line}\r\n`);
    const response = await answer;
    if (expected && !expected.includes(response.code)) {
      throw smtpError(`SMTP ${this.where()}: ${shown} was answered ${response.code} ${response.text}`, response);
    }
    return response;
  }

  async connect() {
    const { host, port, connectionTimeout = 10000 } = this.options;
    const tlsOptions = { servername: net.isIP(host) ? undefined : host, ...this.options.tls };
    const socket = await new Promise((resolve, reject) => {
      const made = this.secure ? tls.connect({ host, port, ...tlsOptions }) : net.connect({ host, port });
      const timer = setTimeout(() => {
        made.destroy();
        reject(
          smtpError(`SMTP ${this.where()}: could not connect in ${connectionTimeout} ms`, null, { timeout: true })
        );
      }, connectionTimeout);
      made.once(this.secure ? 'secureConnect' : 'connect', () => {
        clearTimeout(timer);
        made.removeAllListeners('error');
        resolve(made);
      });
      made.once('error', (err) => {
        clearTimeout(timer);
        reject(smtpError(`SMTP ${this.where()}: ${err.message}`, null, { cause: err }));
      });
    });
    this.attach(socket);
    const greeting = await this.response();
    if (greeting.code !== 220)
      throw smtpError(`SMTP ${this.where()}: greeted with ${greeting.code} ${greeting.text}`, greeting);
    await this.hello();
    if (!this.secure && this.extensions.has('STARTTLS') && !this.options.ignoreTLS) {
      await this.command('STARTTLS', [220]);
      await this.upgrade(tlsOptions);
      await this.hello();
    }
    if (!this.secure && this.options.requireTLS) {
      throw smtpError(`SMTP ${this.where()}: the server offers no STARTTLS, and requireTLS is set`);
    }
    if (this.options.auth) await this.login(this.options.auth);
    return this;
  }

  async hello() {
    const name = this.options.name || os.hostname() || 'localhost';
    let response = await this.command(`EHLO ${name}`);
    this.extensions = new Map();
    if (response.code !== 250) {
      response = await this.command(`HELO ${name}`, [250]);
      return;
    }
    for (const line of response.text.split('\n').slice(1)) {
      const [keyword, ...rest] = line.trim().split(/[\s=]+/);
      if (keyword) this.extensions.set(keyword.toUpperCase(), rest);
    }
  }

  upgrade(tlsOptions) {
    return new Promise((resolve, reject) => {
      const plain = this.socket;
      plain.removeAllListeners('data');
      plain.removeAllListeners('close');
      plain.removeAllListeners('error');
      plain.setTimeout(0);
      const secured = tls.connect({ socket: plain, ...tlsOptions });
      secured.once('secureConnect', () => {
        secured.removeAllListeners('error');
        this.secure = true;
        this.attach(secured);
        resolve();
      });
      secured.once('error', (err) =>
        reject(smtpError(`SMTP ${this.where()}: STARTTLS: ${err.message}`, null, { cause: err }))
      );
    });
  }

  async login(auth) {
    const methods = (this.extensions.get('AUTH') || []).map((method) => method.toUpperCase());
    const { user } = auth;
    const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');
    if (auth.accessToken) {
      const token = b64(`user=${user}\x01auth=Bearer ${auth.accessToken}\x01\x01`);
      const response = await this.command(`AUTH XOAUTH2 ${token}`, null, 'AUTH XOAUTH2 (token)');
      if (response.code === 334) {
        // The error of the server, in base64 JSON: an empty line ends the exchange.
        const failed = await this.command('', null);
        throw smtpError(
          `SMTP ${this.where()}: XOAUTH2 refused (${Buffer.from(response.text, 'base64').toString()})`,
          failed
        );
      }
      if (response.code !== 235)
        throw smtpError(`SMTP ${this.where()}: XOAUTH2 refused: ${response.code} ${response.text}`, response);
      return;
    }
    const pass = auth.pass === undefined ? auth.password : auth.pass;
    if (methods.includes('PLAIN') || !methods.includes('LOGIN')) {
      await this.command(`AUTH PLAIN ${b64(`\0${user}\0${pass}`)}`, [235], 'AUTH PLAIN (credentials)');
      return;
    }
    await this.command('AUTH LOGIN', [334]);
    await this.command(b64(user), [334], '(user)');
    await this.command(b64(pass), [235], '(password)');
  }

  // A message: MAIL FROM, RCPT TO for each recipient (those refused in `rejected`), DATA. Gives { accepted, rejected,
  // response }; an error when no recipient was accepted.
  async send(envelope, raw, { utf8 = false } = {}) {
    let mail = `MAIL FROM:<${envelope.from}>`;
    if (utf8) {
      if (!this.extensions.has('SMTPUTF8')) {
        throw smtpError(`SMTP ${this.where()}: the server takes no addresses that are not ASCII (no SMTPUTF8)`, null, {
          statusCode: 400,
        });
      }
      mail += ' SMTPUTF8';
    }
    if (this.extensions.has('SIZE')) mail += ` SIZE=${raw.length}`;
    this.stage = 'mail';
    await this.command(mail, [250]);
    this.stage = 'rcpt';
    const accepted = [];
    const rejected = [];
    for (const recipient of envelope.to) {
      const response = await this.command(`RCPT TO:<${recipient}>`);
      if (response.code === 250 || response.code === 251) accepted.push(recipient);
      else rejected.push({ address: recipient, code: response.code, response: response.text });
    }
    if (accepted.length === 0) {
      throw smtpError(
        `SMTP ${this.where()}: no recipient was accepted (${rejected.map((r) => `${r.address} ${r.code}`).join(', ')})`,
        null,
        { rejected, responseCode: rejected[0].code, response: rejected[0].response }
      );
    }
    this.stage = 'data';
    await this.command('DATA', [354]);
    // Lines that start with a dot get another (RFC 5321 4.5.2), and the message ends with CRLF . CRLF.
    const text = raw.toString('latin1').replace(/(^|\r\n)\./g, '$1..');
    const answer = this.response();
    this.socket.write(Buffer.from(`${text}${text.endsWith('\r\n') ? '' : '\r\n'}.\r\n`, 'latin1'));
    const response = await answer;
    this.stage = null;
    if (response.code !== 250)
      throw smtpError(`SMTP ${this.where()}: the message was answered ${response.code} ${response.text}`, response, {
        rejected,
      });
    this.messages += 1;
    return { accepted, rejected, response: response.text };
  }

  async quit() {
    if (this.closed) return;
    try {
      await this.command('QUIT');
    } catch {
      // closed already
    }
    this.destroy();
  }

  destroy() {
    this.closed = true;
    if (this.socket) this.socket.destroy();
  }
}

// Connections kept for the next messages: maxConnections at once (3), each for maxMessages (100), closed when idle for
// idleTimeout ms (30 s).
class SmtpPool {
  constructor(options) {
    this.options = options;
    const pool = options.pool || {};
    this.max = pool.maxConnections || 3;
    this.maxMessages = pool.maxMessages || 100;
    this.idleTimeout = pool.idleTimeout === undefined ? 30000 : pool.idleTimeout;
    this.idle = [];
    this.count = 0;
    this.waiting = [];
    this.closing = false;
  }

  async acquire() {
    while (this.idle.length) {
      const connection = this.idle.pop();
      clearTimeout(connection.idleTimer);
      if (!connection.closed) return { connection, reused: true };
      this.count -= 1;
    }
    if (this.count < this.max) {
      this.count += 1;
      try {
        return { connection: await new SmtpConnection(this.options).connect(), reused: false };
      } catch (err) {
        this.count -= 1;
        this.next();
        throw err;
      }
    }
    await new Promise((resolve) => this.waiting.push(resolve));
    return this.acquire();
  }

  release(connection, broken = false) {
    if (broken || connection.closed || connection.messages >= this.maxMessages || this.closing) {
      this.count -= 1;
      if (broken || connection.closed) connection.destroy();
      else connection.quit();
    } else {
      connection.idleTimer = setTimeout(() => {
        this.idle = this.idle.filter((item) => item !== connection);
        this.count -= 1;
        connection.quit();
      }, this.idleTimeout);
      connection.idleTimer.unref();
      this.idle.push(connection);
    }
    this.next();
  }

  next() {
    const waiter = this.waiting.shift();
    if (waiter) waiter();
  }

  async send(envelope, raw, options) {
    const { connection, reused } = await this.acquire();
    try {
      const result = await connection.send(envelope, raw, options);
      this.release(connection);
      return result;
    } catch (err) {
      // A connection the server closed while it waited in the pool: once more on a new one.
      if (reused && connection.closed && connection.stage === 'mail') {
        this.release(connection, true);
        return this.send(envelope, raw, options);
      }
      // Refused by the server: the connection serves again after RSET.
      if (err.responseCode && !connection.closed) {
        connection.stage = null;
        await connection.command('RSET', [250]).then(
          () => this.release(connection),
          () => this.release(connection, true)
        );
      } else this.release(connection, true);
      throw err;
    }
  }

  async close() {
    this.closing = true;
    const idle = this.idle;
    this.idle = [];
    for (const connection of idle) {
      clearTimeout(connection.idleTimer);
      this.count -= 1;
    }
    await Promise.all(idle.map((connection) => connection.quit()));
  }
}

module.exports = { SmtpConnection, SmtpPool };
