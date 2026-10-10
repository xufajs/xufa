// Notifications: by mail (a Mailable or a plain email, to the email of the user or its route), kept in the database
// (read and unread, marked read), by a channel of your own; sent at once, or from a job of the queue by notifiable and
// channel (the notification and the objects of models it carries made again in the worker); anonymous notifiables;
// and what is wrong.
import { Database, Model, fields } from '@xufa/orm';
import { Queue } from '@xufa/queue';
import { Mailable, Mailer, mailFields, Notification, Notifier, notificationFields } from '../index.js';

class Email extends Model {
  static fields = mailFields(fields);
}
class User extends Model {
  static fields = { name: fields.string(), email: fields.string(), wantsEmail: fields.boolean({ default: true }) };
}
class Invoice extends Model {
  static fields = { number: fields.string(), amount: fields.integer(), user: fields.foreignKey(() => User) };
}
class NotificationRecord extends Model {
  static fields = notificationFields(fields);

  static options = { table: 'notifications' };
}

class InvoiceMail extends Mailable {
  constructor(invoice) {
    super();
    this.invoice = invoice;
  }

  envelope() {
    return { subject: 'Invoice {{ invoice.number }} paid' };
  }

  content() {
    return { text: 'We got {{ invoice.amount }} EUR, thank you.' };
  }
}

class InvoicePaid extends Notification {
  constructor(invoice, when) {
    super();
    this.invoice = invoice;
    this.when = when;
  }

  via(user) {
    return user.wantsEmail === false ? ['database'] : ['mail', 'database'];
  }

  toMail() {
    return new InvoiceMail(this.invoice);
  }

  toDatabase() {
    return { invoice: this.invoice.number, amount: this.invoice.amount, at: this.when.toISOString() };
  }
}

class Digest extends Notification {
  via() {
    return ['mail', 'sms'];
  }

  toMail() {
    return { subject: 'Your digest', text: 'Nothing new.' };
  }

  toSms() {
    return 'Nothing new.';
  }
}

let mail;
let db;
let ada;
let bob;
let invoice;
// The databases once (a model keeps the database it is registered in first), emptied before each test.
beforeAll(async () => {
  mail = new Database({ backend: 'memory-mail', from: 'Shop <shop@example.com>' }).register(Email);
  db = new Database({ backend: 'memory' }).register(User, Invoice, NotificationRecord);
  await mail.connect();
  await db.sync();
});
afterAll(async () => {
  await mail.close();
  await db.close();
});
beforeEach(async () => {
  await Email.objects.delete();
  await NotificationRecord.objects.delete();
  await Invoice.objects.delete();
  await User.objects.delete();
  ada = await User.objects.create({ name: 'Ada', email: 'ada@example.com' });
  bob = await User.objects.create({ name: 'Bob', email: 'bob@example.com', wantsEmail: false });
  invoice = await Invoice.objects.create({ number: 'F-9', amount: 120, user: ada });
});

describe('notifications', () => {
  it('at once: by mail to the email of the user, and kept in the database; read and unread', async () => {
    const notifier = new Notifier({ mailer: new Mailer({ model: Email, layout: false }), model: NotificationRecord });
    const when = new Date('2026-10-08T10:00:00Z');
    await notifier.notify([ada, bob], new InvoicePaid(invoice, when));
    const [sent] = await Email.objects.all();
    expect([sent.to, sent.subject, sent.text]).toEqual([
      'ada@example.com',
      'Invoice F-9 paid',
      'We got 120 EUR, thank you.',
    ]);
    expect(await Email.objects.count()).toBe(1); // Bob wants no email
    const kept = await notifier.of(ada);
    expect(kept.map((row) => [row.type, row.data, row.readAt])).toEqual([
      ['InvoicePaid', { invoice: 'F-9', amount: 120, at: '2026-10-08T10:00:00.000Z' }, null],
    ]);
    expect(await notifier.of(bob, { unread: true }).count()).toBe(1);
    expect(await notifier.markRead(ada)).toBe(1);
    expect(await notifier.of(ada, { unread: true }).count()).toBe(0);
    expect((await notifier.of(ada).first()).readAt).toBeInstanceOf(Date);
  });

  it('from jobs: one by notifiable and channel, the notification and its objects made again in the worker', async () => {
    const jobs = new Database({ backend: 'memory' });
    const queue = new Queue(jobs, { backoff: 0, keepDone: true });
    await jobs.sync();
    const notifier = new Notifier({
      mailer: new Mailer({ model: Email, layout: false }),
      model: NotificationRecord,
      queue,
      notifications: [InvoicePaid],
      models: [User, Invoice],
    });
    const enqueued = await notifier.notify([ada, bob], new InvoicePaid(invoice, new Date('2026-10-08T10:00:00Z')), {
      priority: 2,
    });
    expect(enqueued.map((job) => [job.name, job.payload.channel, job.priority])).toEqual([
      ['xufa:notify', 'mail', 2],
      ['xufa:notify', 'database', 2],
      ['xufa:notify', 'database', 2],
    ]);
    expect(enqueued[0].payload.data.invoice).toEqual({ $model: 'Invoice', pk: invoice.pk });
    expect(enqueued[0].payload.notifiable).toEqual({ $model: 'User', pk: ada.pk });
    // The invoice changes before the worker runs: it reads it again.
    await Invoice.objects.filter({ pk: invoice.pk }).update({ amount: 150 });
    await queue.runDue();
    expect((await Email.objects.first()).text).toBe('We got 150 EUR, thank you.');
    expect(await NotificationRecord.objects.count()).toBe(2);
    expect((await notifier.of(ada).first()).data.at).toBe('2026-10-08T10:00:00.000Z');
    // now: true skips the queue.
    await notifier.notify(ada, new InvoicePaid(invoice, new Date()), { now: true });
    expect(await NotificationRecord.objects.count()).toBe(3);
  });

  it('anonymous notifiables and channels of your own', async () => {
    const texts = [];
    const notifier = new Notifier({
      mailer: new Mailer({ model: Email, layout: false }),
      channels: { sms: (notifiable, message) => texts.push([notifiable.routeNotificationFor('sms'), message]) },
    });
    await notifier.notify(Notifier.route('mail', 'ops@example.com').route('sms', '+34600000000'), new Digest());
    expect((await Email.objects.first()).to).toBe('ops@example.com');
    expect(texts).toEqual([['+34600000000', 'Nothing new.']]);
  });

  it('what is wrong: no class for the jobs, no channel, no address, not a notification', async () => {
    const jobs = new Database({ backend: 'memory' });
    const queue = new Queue(jobs, { backoff: 0 });
    await jobs.sync();
    const queued = new Notifier({ mailer: new Mailer({ model: Email }), queue });
    await expect(queued.notify(ada, new Digest())).rejects.toThrow('give its class to the Notifier');
    const notifier = new Notifier({ mailer: new Mailer({ model: Email }) });
    await expect(notifier.notify(ada, new Digest())).rejects.toThrow('No channel sms');
    await expect(notifier.notify(Notifier.route('sms', '+1'), new Digest())).rejects.toThrow('No address of mail');
    await expect(notifier.notify(ada, { hello: true })).rejects.toThrow('a Notification');
    await expect(new Notifier({}).notify(ada, new InvoicePaid(invoice, new Date()))).rejects.toThrow(
      'needs the mailer'
    );
  });
});
