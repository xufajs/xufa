// SmtpBackend ('smtp'): messages sent to a server of SMTP (lib/backends/mail/smtp-client.js: no dependencies).
//
//   new Database({ backend: 'smtp', url: 'smtp://user:password@smtp.example.com:587', from: 'App <app@example.com>' })
//   new Database({ backend: 'smtp', host: 'smtp.example.com', port: 465, auth: { user, pass }, from })
//
// Options: url (smtp://, or smtps:// for TLS from the start), or host ('localhost'), port (587; 465 is TLS from the
// start), secure (TLS from the start: true for port 465); auth ({ user, pass }, or { user, accessToken } for XOAUTH2);
// from (the sender of the messages whose model has none); clientName (of this machine in EHLO: its hostname); tls
// (options of tls.connect: ca, rejectUnauthorized, servername...); requireTLS (refuse a server without STARTTLS,
// which is used whenever offered), ignoreTLS (do not use it); connectionTimeout (10 s) and socketTimeout (60 s); pool
// ({ maxConnections: 3, maxMessages: 100, idleTimeout: 30000 }).
const { MailBackend } = require('./base');
const { SmtpConnection, SmtpPool } = require('./smtp-client');

// The options of an smtp:// or smtps:// URL.
function parseUrl(text) {
  const url = new URL(text);
  if (url.protocol !== 'smtp:' && url.protocol !== 'smtps:') {
    throw new TypeError(`The URL of the smtp backend is smtp:// or smtps:// (it is ${url.protocol})`);
  }
  const secure = url.protocol === 'smtps:';
  const options = { host: url.hostname, port: url.port ? Number(url.port) : secure ? 465 : 587, secure };
  if (url.username) options.auth = { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) };
  if (url.searchParams.get('name')) options.name = url.searchParams.get('name');
  return options;
}

class SmtpBackend extends MailBackend {
  constructor(options = {}) {
    super(options);
    const fromUrl = options.url ? parseUrl(options.url) : {};
    const port = options.port || fromUrl.port || (options.secure ? 465 : 587);
    this.smtp = {
      host: options.host || fromUrl.host || 'localhost',
      port,
      secure:
        options.secure === undefined ? (fromUrl.secure === undefined ? port === 465 : fromUrl.secure) : options.secure,
      auth: options.auth || fromUrl.auth || null,
      name: options.clientName || fromUrl.name,
      tls: options.tls || {},
      requireTLS: Boolean(options.requireTLS),
      ignoreTLS: Boolean(options.ignoreTLS),
      connectionTimeout: options.connectionTimeout,
      socketTimeout: options.socketTimeout,
      pool: options.pool,
    };
    this.pool = null;
  }

  get name() {
    return 'smtp';
  }

  async deliver(built) {
    if (!this.pool) this.pool = new SmtpPool(this.smtp);
    return this.pool.send(built.envelope, built.raw, { utf8: built.utf8 });
  }

  // Connects, says hello, secures the connection and logs in, and quits: an error when one of them fails.
  async verify() {
    const connection = await new SmtpConnection(this.smtp).connect();
    const { secure } = connection;
    const extensions = [...connection.extensions.keys()];
    await connection.quit();
    return { secure, extensions };
  }

  async close() {
    if (this.pool) await this.pool.close();
    this.pool = null;
  }
}

module.exports = { SmtpBackend, parseUrl };
