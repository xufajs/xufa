// The mail backends: messages made (addresses, encoded words, folding, quoted-printable, parts, attachments; checked
// too, while they were written, against mailparser), memory-mail (messages kept and queried), and smtp against a
// server of SMTP (test/fake-smtp.js; also tried against nodemailer's smtp-server): STARTTLS and TLS from the start,
// AUTH PLAIN, LOGIN and XOAUTH2, recipients refused, connections kept and opened again, SMTPUTF8, dots, errors.
const fs = require('node:fs');
const path = require('node:path');
const { Database, Model, fields, ModelError, UnsupportedError } = require('..');
const { buildMessage, parseAddresses, quotedPrintable, header } = require('../lib/backends/mail/mime');
const { parseUrl } = require('../lib/backends/mail/smtp');
const { fakeSmtp } = require('./fake-smtp');

const FIXTURES = path.join(__dirname, '../../client/test/fixtures');
const TLS = {
  key: fs.readFileSync(path.join(FIXTURES, 'key.pem')),
  cert: fs.readFileSync(path.join(FIXTURES, 'cert.pem')),
};
const CA = fs.readFileSync(path.join(FIXTURES, 'ca.pem'));

// The text of encoded words (=?UTF-8?B?...?=), and of quoted-printable.
const decodeWords = (text) =>
  text.replace(/\r\n /g, ' ').replace(/=\?UTF-8\?B\?([^?]*)\?=( (?==\?))?/g, (all, b64) => Buffer.from(b64, 'base64').toString());
const decodeQp = (text) =>
  Buffer.from(text.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (all, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1').toString();
const headerOf = (raw, name) => {
  const match = new RegExp(`^${name}: (.*(?:\\r\\n [^\\r]*)*)`, 'mi').exec(raw);
  return match ? match[1] : null;
};

function makeEmail(extra = {}) {
  class Email extends Model {
    static fields = {
      to: fields.json(),
      cc: fields.json({ null: true }),
      bcc: fields.json({ null: true }),
      subject: fields.string(),
      text: fields.text({ null: true }),
      html: fields.text({ null: true }),
      attachments: fields.json({ null: true }),
      messageId: fields.mailInfo('messageId'),
      accepted: fields.mailInfo('accepted'),
      rejected: fields.mailInfo('rejected'),
      response: fields.mailInfo('response'),
      sentAt: fields.mailInfo('sentAt'),
      raw: fields.mailInfo('raw'),
      ...extra,
    };
  }
  return Email;
}

describe('messages', () => {
  it('addresses: names, quotes, lists, objects, domains in punycode; what is not one is refused (400)', () => {
    expect(parseAddresses('"Lovelace, Ada" <ada@example.com>, bob@example.com')).toEqual([
      { name: 'Lovelace, Ada', address: 'ada@example.com' },
      { name: '', address: 'bob@example.com' },
    ]);
    expect(parseAddresses([{ name: 'José', address: 'jose@exämple.com' }, 'Grace <grace@example.com>'])).toEqual([
      { name: 'José', address: 'jose@xn--exmple-cua.com' },
      { name: 'Grace', address: 'grace@example.com' },
    ]);
    for (const wrong of ['ada', 'ada@', '@example.com', 'a b@example.com', 'Ada <ada@example.com']) {
      expect(() => parseAddresses(wrong)).toThrow(expect.objectContaining({ code: 'XUFA_ORM_ERR_MAIL', statusCode: 400 }));
    }
  });

  it('headers: non-ASCII (and line breaks) as encoded words, folded under 78 characters; names checked', () => {
    const { raw } = buildMessage({
      from: 'José Núñez <jose@example.com>',
      to: 'ada@example.com',
      subject: '¡Hola! Ünïcödé subject 😀 that is long enough to need several encoded words in its header line',
      text: 'x',
    });
    const text = raw.toString();
    const head = text.slice(0, text.indexOf('\r\n\r\n')).split('\r\n');
    expect(Math.max(...head.map((line) => line.length))).toBeLessThanOrEqual(78);
    expect(decodeWords(headerOf(text, 'Subject'))).toBe('¡Hola! Ünïcödé subject 😀 that is long enough to need several encoded words in its header line');
    expect(decodeWords(headerOf(text, 'From'))).toBe('José Núñez <jose@example.com>');
    expect(headerOf(text, 'Date')).toMatch(/^\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} \+0000$/);
    expect(headerOf(text, 'MIME-Version')).toBe('1.0');
    expect(() => header('X-Evil', 'a\r\nBcc: someone@example.com')).toThrow(/line break/);
    // A line break in a value makes it encoded words: no header can be added through one.
    const injected = buildMessage({ from: 'a@example.com', to: 'b@example.com', subject: 's\r\nBcc: x@example.com', headers: { 'X-Tag': 'a\nBcc: y@example.com' } });
    expect(injected.raw.toString()).not.toMatch(/\r\nBcc:/);
    expect(decodeWords(headerOf(injected.raw.toString(), 'Subject'))).toBe('s\r\nBcc: x@example.com');
    expect(() => buildMessage({ from: 'a@example.com', to: 'b@example.com', headers: { Subject: 'twice' } })).toThrow(/made from the message/);
  });

  it('bodies: 7bit when they can, quoted-printable otherwise (lines under 77, spaces at the end kept)', () => {
    expect(quotedPrintable('café = ok')).toBe('caf=C3=A9 =3D ok');
    expect(quotedPrintable('trailing space \nnext')).toBe('trailing space=20\r\nnext');
    const long = quotedPrintable('é'.repeat(100));
    expect(long.split('\r\n').every((line) => line.length <= 76)).toBe(true);
    expect(decodeQp(long)).toBe('é'.repeat(100));
    const plain = buildMessage({ from: 'a@example.com', to: 'b@example.com', subject: 's', text: 'Hello\nworld' }).raw.toString();
    expect(plain).toContain('Content-Transfer-Encoding: 7bit\r\n\r\nHello\r\nworld');
  });

  it('parts: text and HTML as alternatives, inline images (related), attachments (mixed), names in RFC 2231', () => {
    const { raw } = buildMessage({
      from: 'a@example.com',
      to: 'b@example.com',
      subject: 's',
      text: 'plain',
      html: '<img src="cid:logo">',
      attachments: [
        { filename: 'logo.png', content: Buffer.from([137, 80, 78, 71]), cid: 'logo' },
        { filename: 'informe ñ.pdf', content: Buffer.from('%PDF') },
        { filename: 'data.csv', content: 'YSxiLGMK', encoding: 'base64' },
      ],
    });
    const text = raw.toString();
    const order = ['multipart/mixed', 'multipart/related', 'multipart/alternative', 'text/plain', 'text/html', 'image/png', 'application/pdf', 'text/csv'];
    const positions = order.map((type) => text.indexOf(`Content-Type: ${type}`));
    expect(positions.every((position, i) => position > (i ? positions[i - 1] : -1))).toBe(true);
    expect(text).toContain('Content-ID: <logo>\r\nContent-Disposition: inline; filename="logo.png"');
    expect(text).toContain("Content-Disposition: attachment; filename*=UTF-8''informe%20%C3%B1.pdf");
    expect(text).toContain('iVBORw==');
    expect(text).toContain('YSxiLGMK');
  });

  it('the envelope: every recipient once (bcc too, not in the headers); the sender; the Message-ID', () => {
    const built = buildMessage({ from: 'App <app@example.com>', to: 'a@example.com, b@example.com', cc: 'b@example.com', bcc: 'c@example.com', subject: 's', text: 't', messageId: '<given@example.com>' });
    expect(built.envelope).toEqual({ from: 'app@example.com', to: ['a@example.com', 'b@example.com', 'c@example.com'] });
    expect(built.raw.toString()).not.toContain('c@example.com');
    expect(built.messageId).toBe('given@example.com');
    expect(() => buildMessage({ to: 'a@example.com' })).toThrow(/needs a sender/);
    expect(() => buildMessage({ from: 'a@example.com' })).toThrow(/needs a recipient/);
  });
});

describe('memory-mail', () => {
  it('messages made as smtp makes them, kept, and queried; the info of the sending on the object', async () => {
    const Email = makeEmail();
    const db = new Database({ backend: 'memory-mail', from: 'App <app@example.com>' }).register(Email);
    await db.connect();
    const sent = await Email.objects.create({ to: ['ada@example.com', 'Grace <grace@example.com>'], subject: 'Welcome', text: 'Hello!' });
    expect(sent.id).toBe(1);
    expect(sent.messageId).toMatch(/^[0-9a-f-]{36}@example\.com$/);
    expect(sent.accepted).toEqual(['ada@example.com', 'grace@example.com']);
    expect(sent.rejected).toEqual([]);
    expect(sent.sentAt).toBeInstanceOf(Date);
    expect(sent.raw).toContain('From: App <app@example.com>');
    await Email.objects.bulkCreate([
      { to: 'b@example.com', subject: 'Your order', text: '1' },
      { to: 'c@example.com', subject: 'Your invoice', text: '2' },
    ]);
    expect(await Email.objects.filter({ subject__startswith: 'Your' }).count()).toBe(2);
    const [first] = await Email.objects.filter({ subject: 'Your order' });
    expect(first.messageId).toMatch(/@example\.com$/);
    await expect(Email.objects.create({ to: 'nobody', subject: 'x', text: 'y' })).rejects.toThrow(/Not an email address/);
    await db.close();
  });

  it('the shape of a model of messages: its fields, and mailInfo() only on mail backends', () => {
    class Wrong extends Model {
      static fields = { to: fields.json(), subject: fields.string(), userId: fields.integer() };
    }
    expect(() => new Database({ backend: 'memory-mail' }).register(Wrong)).toThrow(/userId is not a field of a message/);
    expect(() => new Database({ backend: 'memory' }).register(makeEmail())).toThrow(/fields.mailInfo\(\) is of mail backends/);
    expect(() => new Database({ backend: 'memory-mail', audit: true })).toThrow(/not a blob or mail backend/);
    expect(() => fields.mailInfo('size')).toThrow(/kind is messageId, accepted/);
  });

  it('a string key with a default is the Message-ID', async () => {
    class Keyed extends Model {
      static fields = {
        id: fields.string({ primaryKey: true, default: () => `order-42@shop.example.com` }),
        to: fields.json(),
        subject: fields.string(),
        raw: fields.mailInfo('raw'),
      };
    }
    const db = new Database({ backend: 'memory-mail', from: 'shop@example.com' }).register(Keyed);
    await db.connect();
    const sent = await Keyed.objects.create({ to: 'a@example.com', subject: 'Order 42' });
    expect(sent.id).toBe('order-42@shop.example.com');
    expect(sent.raw).toContain('Message-ID: <order-42@shop.example.com>');
    expect((await Keyed.objects.get({ pk: 'order-42@shop.example.com' })).subject).toBe('Order 42');
    await db.close();
  });
});

describe('smtp', () => {
  const servers = [];
  const dbs = [];
  afterEach(async () => {
    await Promise.all(dbs.splice(0).map((db) => db.close()));
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  async function open(serverOptions = {}, options = {}) {
    const server = await fakeSmtp(serverOptions).start();
    servers.push(server);
    const Email = makeEmail();
    const db = new Database({ backend: 'smtp', host: '127.0.0.1', port: server.port, from: 'App <app@example.com>', ...options }).register(Email);
    dbs.push(db);
    return { server, Email, db };
  }

  it('STARTTLS and AUTH PLAIN: the message, its envelope and its info', async () => {
    const { server, Email } = await open(
      { tlsOptions: TLS, users: { ada: 's3cret' } },
      { host: 'localhost', auth: { user: 'ada', pass: 's3cret' }, tls: { ca: CA }, requireTLS: true }
    );
    const sent = await Email.objects.create({ to: 'Ada <ada@example.com>', bcc: 'audit@example.com', subject: 'Héllo', text: '.a line with a dot\n..two\n' });
    expect(server.messages).toHaveLength(1);
    const [message] = server.messages;
    expect([message.secure, message.user, message.from, message.to]).toEqual([true, 'ada', 'app@example.com', ['ada@example.com', 'audit@example.com']]);
    expect(message.raw).toContain('\r\n\r\n.a line with a dot\r\n..two\r\n');
    expect(message.raw).not.toContain('audit@example.com');
    expect(decodeWords(headerOf(message.raw, 'Subject'))).toBe('Héllo');
    expect(sent.accepted).toEqual(['ada@example.com', 'audit@example.com']);
    expect(sent.response).toBe('2.0.0 Ok: queued as M1');
    expect(server.log.some((line) => /^AUTH PLAIN /.test(line))).toBe(true);
    expect(server.log.filter((line) => line.startsWith('EHLO'))).toHaveLength(2); // before and after STARTTLS
  });

  it('AUTH LOGIN when it is the one offered; XOAUTH2 with an access token; credentials refused', async () => {
    const login = await open({ users: { ada: 'pw' }, auth: ['LOGIN'] }, { auth: { user: 'ada', pass: 'pw' } });
    await login.Email.objects.create({ to: 'b@example.com', subject: 's', text: 't' });
    expect(login.server.log.includes('AUTH LOGIN')).toBe(true);
    const oauth = await open({ users: { ada: 'token-1' } }, { auth: { user: 'ada', accessToken: 'token-1' } });
    await oauth.Email.objects.create({ to: 'b@example.com', subject: 's', text: 't' });
    expect(oauth.server.messages[0].user).toBe('ada');
    const refused = await open({ users: { ada: 'pw' } }, { auth: { user: 'ada', pass: 'wrong' } });
    const error = await refused.Email.objects.create({ to: 'b@example.com', subject: 's', text: 't' }).catch((err) => err);
    expect([error.code, error.statusCode, error.responseCode]).toEqual(['XUFA_ORM_ERR_MAIL', 502, 535]);
    expect(error.message).not.toContain('wrong');
    const badToken = await open({ users: { ada: 'token-1' } }, { auth: { user: 'ada', accessToken: 'token-2' } });
    await expect(badToken.Email.objects.create({ to: 'b@example.com', subject: 's', text: 't' })).rejects.toThrow(/XOAUTH2 refused/);
  });

  it('TLS from the start (port 465, smtps://); requireTLS without STARTTLS is an error', async () => {
    const tlsServer = await fakeSmtp({ tlsOptions: TLS, secure: true }).start();
    servers.push(tlsServer);
    const Email = makeEmail();
    const db = new Database({ backend: 'smtp', url: `smtps://localhost:${tlsServer.port}`, tls: { ca: CA }, from: 'a@example.com' }).register(Email);
    dbs.push(db);
    await Email.objects.create({ to: 'b@example.com', subject: 's', text: 't' });
    expect(tlsServer.messages[0].secure).toBe(true);
    const plain = await open({}, { requireTLS: true });
    await expect(plain.Email.objects.create({ to: 'b@example.com', subject: 's', text: 't' })).rejects.toThrow(/offers no STARTTLS/);
    expect(parseUrl('smtps://u%40x:p%3A@mail.example.com')).toEqual({ host: 'mail.example.com', port: 465, secure: true, auth: { user: 'u@x', pass: 'p:' } });
    expect(parseUrl('smtp://mail.example.com?name=app.example.com')).toEqual({ host: 'mail.example.com', port: 587, secure: false, name: 'app.example.com' });
  });

  it('recipients refused: in `rejected` when others are accepted; an error when none is (RSET: the connection serves again)', async () => {
    const { server, Email } = await open();
    const sent = await Email.objects.create({ to: ['ok@example.com', 'refuse@example.com', 'later@example.com'], subject: 's', text: 't' });
    expect(sent.accepted).toEqual(['ok@example.com']);
    expect(sent.rejected).toEqual([
      { address: 'refuse@example.com', code: 550, response: '5.1.1 <refuse@example.com>: Recipient address rejected' },
      { address: 'later@example.com', code: 451, response: '4.7.1 Try again later' },
    ]);
    const error = await Email.objects.create({ to: 'refuse@example.com', subject: 's', text: 't' }).catch((err) => err);
    expect([error.statusCode, error.responseCode, error.rejected.length]).toEqual([502, 550, 1]);
    await Email.objects.create({ to: 'again@example.com', subject: 's', text: 't' });
    expect(server.connections).toBe(1);
    expect(server.log.includes('RSET')).toBe(true);
  });

  it('connections kept for the next messages (maxConnections at once), and opened again when the server closed one', async () => {
    const { server, Email } = await open({}, { pool: { maxConnections: 2 } });
    await Promise.all(Array.from({ length: 6 }, (_, i) => Email.objects.create({ to: `u${i}@example.com`, subject: String(i), text: 't' })));
    expect(server.messages).toHaveLength(6);
    expect(server.connections).toBe(2);
    const dropping = await open({ dropAfter: 1 });
    for (let i = 0; i < 3; i += 1) await dropping.Email.objects.create({ to: `d${i}@example.com`, subject: 's', text: 't' });
    expect(dropping.server.messages).toHaveLength(3);
    expect(dropping.server.connections).toBe(3);
  });

  it('SMTPUTF8 for addresses that are not ASCII, when the server has it', async () => {
    const { server, Email } = await open();
    await Email.objects.create({ to: 'josé@example.com', subject: 's', text: 't' });
    expect(server.messages[0].to).toEqual(['josé@example.com'.normalize()].map((value) => Buffer.from(value).toString('latin1')));
    expect(server.log.some((line) => /^MAIL FROM:<app@example.com> SMTPUTF8/.test(line))).toBe(true);
    const old = await open({ smtputf8: false });
    const error = await old.Email.objects.create({ to: 'josé@example.com', subject: 's', text: 't' }).catch((err) => err);
    expect([error.statusCode, /no SMTPUTF8/.test(error.message)]).toEqual([400, true]);
  });

  it('what a server of mail does not do: reads, updates, deletes; verify(); a server that is not there', async () => {
    const { Email, db } = await open({ tlsOptions: TLS }, { host: 'localhost', tls: { ca: CA } });
    await expect(Email.objects.count()).rejects.toThrow(UnsupportedError);
    await expect(Email.objects.filter({ subject: 's' })).rejects.toThrow(/memory-mail keeps them/);
    await expect(Email.objects.all().delete()).rejects.toThrow(/Deleting messages sent/);
    expect(await db.backend.verify()).toEqual({ secure: true, extensions: expect.arrayContaining(['SIZE', 'SMTPUTF8']) });
    const nowhere = new Database({ backend: 'smtp', host: '127.0.0.1', port: 1, from: 'a@example.com', connectionTimeout: 2000 }).register(makeEmail());
    dbs.push(nowhere);
    const error = await nowhere.models.get('Email').objects.create({ to: 'b@example.com', subject: 's', text: 't' }).catch((err) => err);
    expect([error.code, error.statusCode]).toEqual(['XUFA_ORM_ERR_MAIL', 502]);
    expect(error).not.toBeInstanceOf(ModelError);
  });
});
