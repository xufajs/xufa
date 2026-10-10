import { expectType, expectError } from 'tsd';
import { Model, fields } from '@xufa/orm';
import {
  Mailable,
  Mailer,
  mailFields,
  Notification,
  Notifier,
  notificationFields,
  type Message,
  type Content,
} from '../..';

class Email extends Model {
  static fields = mailFields(fields);
}

class Welcome extends Mailable {
  constructor(public name: string) {
    super();
  }

  envelope() {
    return { subject: 'Welcome, {{ name }}' };
  }

  content(): Content {
    return { view: 'welcome', preheader: 'Glad you came' };
  }
}

const mailer = new Mailer({ model: Email, views: 'views/mail', app: { name: 'Shop' } });
mailer.render(new Welcome('Ada'), { to: 'ada@example.com' }).then((message) => expectType<Message>(message));
mailer.send({ to: ['a@example.com', { name: 'Bo', address: 'bo@example.com' }], subject: 'Hi', text: 'Hello' });
mailer.queue(new Welcome('Ada'), { to: 'ada@example.com', delay: '5m', priority: 2 });
mailer
  .preview({ subject: 'x', html: '<p>y</p>', attachments: [{ path: 'invoice.pdf' }] })
  .then((html) => expectType<string>(html));
expectError(new Mailer({}));
expectError(mailer.send({ to: 'a', subject: 's', layout: true }));

class Paid extends Notification {
  via() {
    return ['mail', 'database'];
  }

  toMail() {
    return { subject: 'Paid', text: 'Thanks' };
  }
}
class NotificationRecord extends Model {
  static fields = notificationFields(fields);
}
const notifier = new Notifier({ mailer, model: NotificationRecord, notifications: [Paid], channels: { sms: () => 1 } });
notifier.notify(Notifier.route('mail', 'ops@example.com'), new Paid(), { now: true });
expectType<Promise<number>>(notifier.markRead(new NotificationRecord()));
