// MemoryMailBackend ('memory-mail'): messages kept in memory instead of sent, as Django's locmem backend: for tests and
// development. The messages are made as the smtp backend makes them (the same checks), every recipient is accepted,
// and they can be read with the querysets of their model (Email.objects.filter({ subject__contains: 'Welcome' })).
const { MemoryBackend } = require('../memory');
const { mailShape, messageOf, giveInfo } = require('./base');
const { buildMessage } = require('./mime');

class MemoryMailBackend extends MemoryBackend {
  constructor(options = {}) {
    super(options);
    this.from = options.from || null;
    this.shapes = new WeakMap();
  }

  get name() {
    return 'memory-mail';
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

  async insert(meta, rows, options = {}) {
    const shape = this.shape(meta);
    for (const row of rows) {
      const built = buildMessage(messageOf(shape, row, this));
      giveInfo(shape, row, built, { accepted: built.envelope.to, rejected: [], response: '250 kept in memory' });
    }
    return super.insert(meta, rows, options);
  }
}

module.exports = { MemoryMailBackend };
