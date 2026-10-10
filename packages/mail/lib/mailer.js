// Emails as classes (Laravel's Mailables): a Mailable says who it goes to and what it says (a template of
// @xufa/template, with its data), and a Mailer renders it in the layout of the emails and sends it, at once or from a
// job of @xufa/queue. Sending is creating an object of the model of the emails of @xufa/orm (in a database of smtp,
// or memory-mail in tests): the mail is a backend of the ORM.
//
//   class OrderShipped extends Mailable {
//     constructor(order) { super(); this.order = order; }
//     envelope() { return { subject: 'Your order {{ order.number }} is on its way' }; }
//     content() { return { view: 'order-shipped' }; }        // views/order-shipped.html (and .txt, if there is one)
//   }
//   const mailer = new Mailer({ model: Email, views: 'views/mail', app: { name: 'Shop', url }, queue });
//   await mailer.send(new OrderShipped(order), { to: order.email });
//   await mailer.queue(new OrderShipped(order), { to: order.email, delay: '5m' });
import fs from 'node:fs';
import path from 'node:path';
import { TemplateEngine, SafeString } from '@xufa/template';
import { LAYOUT, BUTTON } from './layout.js';
import { textOf } from './text.js';

class MailError extends Error {
  constructor(message, code = 'XUFA_MAIL_ERR', statusCode = 400) {
    super(message);
    this.name = 'MailError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

// What an email is, from its class: envelope() (subject, to, cc, bcc, replyTo, from, headers), content() (view, or
// html and text: templates; with: their data, over the fields of the mailable) and attachments().
class Mailable {
  envelope() {
    return {};
  }

  content() {
    return {};
  }

  attachments() {
    return [];
  }
}

const ENVELOPE = ['from', 'to', 'cc', 'bcc', 'replyTo', 'subject', 'headers'];
const JOB_OPTIONS = ['delay', 'at', 'priority', 'queue', 'attempts', 'key'];

// A plain object as a Mailable: { to, subject, view or html and text, with, attachments }.
class PlainMailable extends Mailable {
  constructor(spec) {
    super();
    Object.defineProperty(this, 'spec', { value: spec });
  }

  envelope() {
    return pick(this.spec, ENVELOPE);
  }

  content() {
    const { view, html, text, with: data, layout, preheader } = this.spec;
    return { view, html, text, with: data, layout, preheader };
  }

  attachments() {
    return this.spec.attachments || [];
  }
}

function pick(object, keys) {
  const out = {};
  for (const key of keys) if (object && object[key] !== undefined) out[key] = object[key];
  return out;
}

// The data of the templates of a mailable: its own fields (as the public properties of Laravel's).
function fieldsOf(mailable) {
  const out = {};
  for (const key of Object.keys(mailable)) out[key] = mailable[key];
  return out;
}

class Mailer {
  // model: the model of the emails (fields of mailFields()). views: the folder of the templates of content().view
  // (name.html and name.txt). layout: the HTML around every email (true: the one of xufa; false: none; a template).
  // app: { name, url } for the layout. globals: data of every template. queue: a Queue of @xufa/queue for queue().
  constructor({
    model,
    views = null,
    layout = true,
    app = {},
    globals = {},
    footer = null,
    engine = null,
    queue = null,
    jobName = 'xufa:mail',
    attempts = 5,
  } = {}) {
    if (!model || !model.objects) throw new MailError('new Mailer({ model }): the model of the emails of @xufa/orm');
    this.model = model;
    this.views = views;
    this.layout = layout === true ? LAYOUT : layout || null;
    this.app = app;
    this.globals = globals;
    this.footer = footer;
    this.engine = engine || new TemplateEngine({ partials: { button: BUTTON } });
    this.queueRef = queue;
    this.jobName = jobName;
    this.compiled = new Map();
    if (queue) queue.define(jobName, ({ message }) => this.deliver(message), { attempts });
  }

  // A template compiled once: of a source (inline), or of a file of the views.
  templateOf(source, { escape = true, name } = {}) {
    const key = `${escape ? 'h' : 't'}\0${source}`;
    let template = this.compiled.get(key);
    if (!template) {
      template = this.engine.compile(source, { escape, name });
      this.compiled.set(key, template);
    }
    return template;
  }

  // The source of a view (null when there is no such file): name.html or name.txt in the views.
  viewSource(name, extension) {
    if (!this.views) throw new MailError(`The view ${name} needs the views of the Mailer (new Mailer({ views }))`);
    const file = path.join(this.views, `${name}.${extension}`);
    if (!path.resolve(file).startsWith(path.resolve(this.views))) throw new MailError(`Not a view: ${name}`);
    try {
      return fs.readFileSync(file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  // The message of a mailable (or of a plain object), rendered: { from, to, cc, bcc, replyTo, subject, html, text,
  // attachments, headers }. The recipients and subject given override those of the mailable.
  async render(mail, overrides = {}) {
    const mailable =
      mail instanceof Mailable || (mail && typeof mail.content === 'function') ? mail : new PlainMailable(mail);
    const envelope = { ...(await mailable.envelope()), ...pick(overrides, ENVELOPE) };
    const content = (await mailable.content()) || {};
    const data = { app: this.app, ...this.globals, ...fieldsOf(mailable), ...(content.with || {}) };

    const subject = envelope.subject ? this.templateOf(String(envelope.subject), { escape: false })(data) : '';
    let html = null;
    let text = null;
    if (content.view) {
      const htmlSource = this.viewSource(content.view, 'html');
      const textSource = this.viewSource(content.view, 'txt');
      if (htmlSource === null && textSource === null) throw new MailError(`There is no view ${content.view}`);
      if (htmlSource !== null) html = this.templateOf(htmlSource, { name: `${content.view}.html` })(data);
      if (textSource !== null) text = this.templateOf(textSource, { escape: false, name: `${content.view}.txt` })(data);
    }
    if (content.html !== undefined && content.html !== null) html = this.templateOf(String(content.html))(data);
    if (content.text !== undefined && content.text !== null) {
      text = this.templateOf(String(content.text), { escape: false })(data);
    }
    if (html === null && text === null) throw new MailError('An email needs content: a view, html or text');
    // The text of the HTML when there is none (clients without HTML, and the filters of spam, read it).
    if (text === null) text = textOf(html);
    const layout = content.layout === false ? null : content.layout || this.layout;
    if (html !== null && layout) {
      html = this.templateOf(layout, { name: 'layout' })({
        ...data,
        subject,
        preheader: content.preheader,
        footer: content.footer || this.footer,
        body: new SafeString(html),
      });
    }

    const attachments = [];
    for (const item of (await mailable.attachments()) || []) attachments.push(attachmentOf(item));
    const message = { ...pick(envelope, ['from', 'to', 'cc', 'bcc', 'replyTo', 'headers']), subject, text };
    if (html !== null) message.html = html;
    if (attachments.length) message.attachments = attachments;
    return message;
  }

  // The HTML of an email, to look at (in a browser, in tests).
  async preview(mail, overrides) {
    const message = await this.render(mail, overrides);
    return message.html || `<pre>${String(message.text).replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`)}</pre>`;
  }

  // Sends an email now: the object of the model of the emails made (its mailInfo fields: what the sending gave).
  async send(mail, overrides = {}) {
    return this.deliver(await this.render(mail, overrides));
  }

  // Sends an email from a job of the queue: rendered now (the job carries the message), sent by a worker, tried again
  // when the server of mail fails. Options: those of the message, and delay, at, priority, queue, attempts, key.
  async queue(mail, options = {}) {
    if (!this.queueRef) throw new MailError('mailer.queue() needs the queue of the Mailer (new Mailer({ queue }))');
    const message = await this.render(mail, options);
    if (message.attachments) message.attachments = message.attachments.map(storable);
    return this.queueRef.enqueue(this.jobName, { message }, pick(options, JOB_OPTIONS));
  }

  // An email rendered, as an object of the model (which sends it). Values of fields the model does not have are an
  // error, not a silence.
  async deliver(message) {
    if (!message.to || (Array.isArray(message.to) && message.to.length === 0)) {
      throw new MailError('An email needs who it goes to (to)');
    }
    const { meta } = this.model;
    const missing = Object.keys(message).filter((key) => message[key] !== undefined && !meta.field(key));
    if (missing.length) {
      throw new MailError(
        `The model ${this.model.name} has no field ${missing.join(', ')} (mailFields() has them all)`
      );
    }
    return this.model.objects.create(message);
  }
}

// An attachment: { filename, content (a Buffer or a string), contentType, cid }, or { path } (a file, read now).
function attachmentOf(item) {
  if (!item || typeof item !== 'object') throw new MailError('An attachment is { filename, content } or { path }');
  if (item.path) {
    const { path: file, ...rest } = item;
    return { filename: path.basename(file), ...rest, content: fs.readFileSync(file) };
  }
  if (item.content === undefined) throw new MailError(`The attachment ${item.filename || ''} has no content`);
  return { ...item };
}

// An attachment that goes through the payload of a job (JSON): its bytes in base64.
function storable(item) {
  if (Buffer.isBuffer(item.content) || item.content instanceof Uint8Array) {
    return { ...item, content: Buffer.from(item.content).toString('base64'), encoding: 'base64' };
  }
  return item;
}

// The fields of a model of emails, with what the backend gives back: class Email extends Model { static fields =
// mailFields(fields); } in a database of smtp (or memory-mail).
function mailFields(fields) {
  return {
    from: fields.json({ null: true }),
    to: fields.json(),
    cc: fields.json({ null: true }),
    bcc: fields.json({ null: true }),
    replyTo: fields.json({ null: true }),
    subject: fields.string({ maxLength: 998 }),
    text: fields.text({ null: true }),
    html: fields.text({ null: true }),
    attachments: fields.json({ null: true }),
    headers: fields.json({ null: true }),
    messageId: fields.mailInfo('messageId'),
    accepted: fields.mailInfo('accepted'),
    rejected: fields.mailInfo('rejected'),
    sentAt: fields.mailInfo('sentAt'),
  };
}

export { Mailable, Mailer, MailError, mailFields, textOf };
