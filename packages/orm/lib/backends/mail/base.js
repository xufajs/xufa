// Mail backends (smtp, memory-mail): models whose objects are messages of email. Creating one sends it, and
// fields.mailInfo() are what the sending gave: its Message-ID, the recipients accepted and refused, the answer of the
// server, when it was sent, the message as sent (MIME).
//
//   class Email extends Model {
//     static fields = {
//       to: fields.json(),                          // 'ada@example.com', 'Ada <ada@...>, bob@...', or an array
//       subject: fields.string(),
//       text: fields.text({ null: true }),
//       html: fields.text({ null: true }),
//       messageId: fields.mailInfo('messageId'),
//       accepted: fields.mailInfo('accepted'),
//     };
//   }
//   await Email.objects.create({ to: 'ada@example.com', subject: 'Welcome', text: 'Hello!' });
//
// The fields of a message are those of these names: from (the option `from` of the backend when the model has none,
// or the value is null), to, cc, bcc, replyTo, subject, text, html, attachments ([{ filename, content, contentType,
// cid, encoding }]) and headers ({ name: value }); a model has the ones it needs. Other fields are refused: a server of
// mail does not keep the messages (memory-mail keeps them, for tests). The primary key is the automatic one (smtp
// gives none: there is nothing to find the message by), or a string with a default, which is then the Message-ID.
const { Backend } = require('../base');
const { buildMessage } = require('./mime');
const { ModelError } = require('../../errors');

const MESSAGE_FIELDS = ['from', 'to', 'cc', 'bcc', 'replyTo', 'subject', 'text', 'html', 'attachments', 'headers'];

// The shape of a model of messages: its key (keyed: a string, the Message-ID), the fields of the message by name,
// its info fields by kind.
function mailShape(meta) {
  const name = meta.model ? meta.model.name : meta.table;
  const { pk } = meta;
  if (pk && pk.composite) throw new ModelError(name, 'a model of a mail backend has no composite key');
  const keyed = Boolean(pk) && ['string', 'text', 'uuid'].includes(pk.type);
  const message = {};
  const info = {};
  for (const field of meta.fields) {
    if (field === pk) continue;
    if (field.mailInfo) info[field.mailInfo] = field;
    else if (MESSAGE_FIELDS.includes(field.name)) message[field.name] = field;
    else {
      throw new ModelError(
        name,
        `${field.name} is not a field of a message (${MESSAGE_FIELDS.join(', ')}, or fields.mailInfo())`
      );
    }
  }
  if (meta.manyToMany.length) throw new ModelError(name, 'a model of a mail backend has no relations');
  return { pk, keyed, message, info };
}

// The message of a row of the model (the sender of the backend when it has none).
function messageOf(shape, row, defaults) {
  const message = {};
  for (const [name, field] of Object.entries(shape.message)) message[name] = row[field.attname];
  if (message.from === null || message.from === undefined) message.from = defaults.from;
  if (shape.keyed && row[shape.pk.attname] !== null && row[shape.pk.attname] !== undefined) {
    message.messageId = row[shape.pk.attname];
  }
  return message;
}

// The info of a message sent, into its row (Model.save() takes it from there).
function giveInfo(shape, row, built, result) {
  const values = {
    messageId: built.messageId,
    accepted: result.accepted,
    rejected: result.rejected,
    response: result.response,
    sentAt: new Date(),
    raw: built.raw.toString('utf8'),
  };
  for (const [kind, field] of Object.entries(shape.info)) row[field.attname] = values[kind];
  if (shape.keyed) row[shape.pk.attname] = built.messageId;
}

// The backends that send: no reads (a server of mail does not keep the messages), no updates nor deletes.
class MailBackend extends Backend {
  constructor(options = {}) {
    super(options);
    this.from = options.from || null;
    this.shapes = new WeakMap();
  }

  get mail() {
    return true;
  }

  shape(meta) {
    let shape = this.shapes.get(meta);
    if (!shape) {
      shape = mailShape(meta);
      this.shapes.set(meta, shape);
    }
    return shape;
  }

  // Sends a message: { accepted, rejected, response }.
  async deliver() {
    throw this.unsupported('Sending');
  }

  async insert(meta, rows, options = {}) {
    if (options.conflict) throw this.unsupported('Inserts with conflicts');
    const shape = this.shape(meta);
    const keys = [];
    for (const row of rows) {
      const built = buildMessage(messageOf(shape, row, this));
      const result = await this.deliver(built);
      giveInfo(shape, row, built, result);
      keys.push(shape.keyed ? built.messageId : null);
    }
    return keys;
  }

  kept() {
    return this.unsupported(`Reading messages (the ${this.name} backend sends them; memory-mail keeps them)`);
  }

  async select() {
    throw this.kept();
  }

  async count() {
    throw this.kept();
  }

  async aggregate() {
    throw this.kept();
  }

  async update() {
    throw this.unsupported('Changing messages sent');
  }

  async delete() {
    throw this.unsupported('Deleting messages sent');
  }

  async createSchema() {}

  async dropSchema() {}

  // No transactions: the function runs, its messages sent at once.
  async transaction(fn) {
    return fn();
  }
}

module.exports = { MailBackend, mailShape, messageOf, giveInfo, MESSAGE_FIELDS };
