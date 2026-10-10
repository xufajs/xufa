// Mailables and the Mailer: the subject and body rendered with their data (the fields of the mailable, with, the app
// and globals), escaped in HTML and not in text, in the layout (or none), the text made of the HTML when there is no
// text, views of a folder (name.html, name.txt), attachments (bytes, files, inline images), plain objects as
// mailables, send() through the model of memory-mail, queue() from a job of @xufa/queue (with its attachments), and
// what is wrong (no recipients, no content, fields the model does not have).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Database, Model, fields } from '@xufa/orm';
import { Queue } from '@xufa/queue';
import { Mailable, Mailer, MailError, mailFields, textOf } from '../index.js';

class Email extends Model {
  static fields = mailFields(fields);
}

class OrderShipped extends Mailable {
  constructor(order) {
    super();
    this.order = order;
  }

  envelope() {
    return { subject: 'Your order {{ order.number }} is on its way', replyTo: 'help@shop.example' };
  }

  content() {
    return {
      html: '<p>Hello {{ order.name }},</p><p>{{ order.items.length }} items: {{ order.items | join(", ") }}.</p>{{> button ({ url: order.url, text: "Track it" }) }}',
      with: { carrier: 'Fast Post' },
      preheader: 'It arrives on Friday',
    };
  }
}

let db;
let dir;
// One database of mail (a model keeps the database it is registered in first), emptied before each test.
beforeAll(async () => {
  db = new Database({ backend: 'memory-mail', from: 'Shop <shop@example.com>' }).register(Email);
  await db.connect();
});
afterAll(() => db.close());
beforeEach(async () => {
  await Email.objects.delete();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-mail-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const order = { number: 'A-17', name: 'Ada <3', items: ['Book', 'Pen'], url: 'https://shop.example/track/A-17' };

describe('Mailer', () => {
  it('renders a mailable: subject, HTML in the layout (escaped), the text of its HTML; and sends it', async () => {
    const mailer = new Mailer({ model: Email, app: { name: 'Shop', url: 'https://shop.example' }, footer: 'Shop Ltd' });
    const message = await mailer.render(new OrderShipped(order), { to: 'ada@example.com' });
    expect(message.subject).toBe('Your order A-17 is on its way');
    expect(message.to).toBe('ada@example.com');
    expect(message.replyTo).toBe('help@shop.example');
    expect(message.html).toContain('<p>Hello Ada &lt;3,</p>');
    expect(message.html).toContain('2 items: Book, Pen.');
    expect(message.html).toContain('href="https://shop.example/track/A-17"');
    expect(message.html).toContain('>Track it</a>');
    // The layout: the app, the preheader, the footer, and the subject as its title.
    expect(message.html).toMatch(/^<!doctype html>/);
    expect(message.html).toContain('<title>Your order A-17 is on its way</title>');
    expect(message.html).toContain('It arrives on Friday');
    expect(message.html).toContain('Shop Ltd');
    expect(message.html).toContain('>Shop</a>');
    // The text: of the body, not of the layout.
    expect(message.text).toBe('Hello Ada <3,\n\n2 items: Book, Pen.\n\nTrack it (https://shop.example/track/A-17)');

    const sent = await mailer.send(new OrderShipped(order), { to: 'Ada <ada@example.com>' });
    expect(sent.accepted).toEqual(['ada@example.com']);
    expect(sent.messageId).toMatch(/^[\w-]+@example\.com$/);
    const kept = await Email.objects.get({ pk: sent.pk });
    expect([kept.subject, kept.from]).toEqual(['Your order A-17 is on its way', null]);
    expect(await Email.objects.count()).toBe(1);
  });

  it('views of a folder: name.html and name.txt; text alone; no layout', async () => {
    fs.writeFileSync(path.join(dir, 'welcome.html'), '<h1>Welcome, {{ user.name }}</h1>');
    fs.writeFileSync(path.join(dir, 'welcome.txt'), 'Welcome, {{ user.name }} & co');
    fs.writeFileSync(path.join(dir, 'reset.txt'), 'Your code: {{ code }}');
    const mailer = new Mailer({ model: Email, views: dir, layout: false, globals: { support: 'help@example.com' } });
    const welcome = await mailer.render({
      to: 'a@example.com',
      subject: 'Hi {{ user.name }}',
      view: 'welcome',
      with: { user: { name: 'Ada & Bo' } },
    });
    expect([welcome.subject, welcome.html, welcome.text]).toEqual([
      'Hi Ada & Bo',
      '<h1>Welcome, Ada &amp; Bo</h1>',
      'Welcome, Ada & Bo & co',
    ]);
    const reset = await mailer.render({ to: 'a@example.com', subject: 'Code', view: 'reset', with: { code: '<123>' } });
    expect([reset.html, reset.text]).toEqual([undefined, 'Your code: <123>']);
    expect(await mailer.preview({ to: 'a@example.com', subject: 'Code', view: 'reset', with: { code: '<1>' } })).toBe(
      '<pre>Your code: &#60;1&#62;</pre>'
    );
    await expect(mailer.render({ to: 'a', subject: 's', view: 'nope' })).rejects.toThrow('There is no view nope');
    await expect(mailer.render({ to: 'a', subject: 's', view: '../secret' })).rejects.toThrow(MailError);
    await expect(new Mailer({ model: Email }).render({ to: 'a', view: 'welcome' })).rejects.toThrow('needs the views');
  });

  it('attachments: bytes, files and inline images', async () => {
    const file = path.join(dir, 'invoice.pdf');
    fs.writeFileSync(file, Buffer.from('%PDF-1.4 tiny'));
    const mailer = new Mailer({ model: Email });
    const sent = await mailer.send({
      to: 'a@example.com',
      subject: 'Invoice',
      html: '<p>See attached <img src="cid:logo"></p>',
      attachments: [
        { path: file, contentType: 'application/pdf' },
        { filename: 'logo.png', content: Buffer.from([137, 80, 78, 71]), contentType: 'image/png', cid: 'logo' },
      ],
    });
    expect(sent.attachments.map((item) => item.filename)).toEqual(['invoice.pdf', 'logo.png']);
    expect(Buffer.from(sent.attachments[0].content).toString()).toBe('%PDF-1.4 tiny');
  });

  it('queue(): rendered now, sent by a worker (attachments as base64), with the options of the job', async () => {
    const jobs = new Database({ backend: 'memory' });
    const queue = new Queue(jobs, { backoff: 0, keepDone: true });
    await jobs.sync();
    const mailer = new Mailer({ model: Email, queue });
    const job = await mailer.queue(
      {
        to: 'a@example.com',
        subject: 'Report',
        text: 'Attached.',
        attachments: [{ filename: 'r.csv', content: Buffer.from('a,b\n1,2') }],
      },
      { delay: '1m', priority: 3 }
    );
    expect([job.name, job.priority, job.runAt.getTime() > Date.now() + 50000]).toEqual(['xufa:mail', 3, true]);
    expect(job.payload.message.attachments[0]).toMatchObject({
      encoding: 'base64',
      content: Buffer.from('a,b\n1,2').toString('base64'),
    });
    expect(await Email.objects.count()).toBe(0);
    await queue.jobs.filter({ pk: job.pk }).update({ runAt: new Date() });
    await queue.runDue();
    const [sent] = await Email.objects.all();
    expect(sent.subject).toBe('Report');
    expect(sent.attachments[0].filename).toBe('r.csv');
    await expect(new Mailer({ model: Email }).queue({ to: 'a', subject: 's', text: 't' })).rejects.toThrow(
      'needs the queue'
    );
  });

  it('what is wrong: no recipients, no content, fields the model has not, no model', async () => {
    const mailer = new Mailer({ model: Email });
    await expect(mailer.send({ subject: 'x', text: 'y' })).rejects.toThrow('who it goes to');
    await expect(mailer.send({ to: 'a@example.com', subject: 'x' })).rejects.toThrow('needs content');
    class Small extends Model {
      static fields = { to: fields.json(), subject: fields.string(), text: fields.text({ null: true }) };
    }
    db.register(Small);
    await expect(
      new Mailer({ model: Small }).send({ to: 'a@example.com', subject: 'x', html: '<b>y</b>' })
    ).rejects.toThrow('has no field html');
    expect(() => new Mailer({})).toThrow(MailError);
  });
});

describe('textOf', () => {
  it('blocks on lines, links with their addresses, lists, entities, no styles nor scripts', () => {
    expect(
      textOf(
        '<style>p{color:red}</style><h1>Hi&nbsp;Ada</h1><p>Read <a href="https://x.example/a">the post</a> or <a href="https://x.example">https://x.example</a>.</p><ul><li>One</li><li>Two &amp; three</li></ul><script>alert(1)</script><p>&#169; &#x2014; end</p>'
      )
    ).toBe('Hi Ada\n\nRead the post (https://x.example/a) or https://x.example.\n\n- One\n- Two & three\n\n© — end');
    expect(textOf('')).toBe('');
  });
});
