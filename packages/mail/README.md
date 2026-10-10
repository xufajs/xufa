# @xufa/mail

Emails as classes, as Laravel's Mailables: each says who it goes to and what it says (a template of
[@xufa/template](../template) with its data), and a `Mailer` renders it in a layout that email clients read and sends it,
at once or from a job of [@xufa/queue](../queue). Sending is creating an object of the model of the emails of
[@xufa/orm](../orm) (`smtp`, or `memory-mail` in tests). And notifications by mail, kept in the database, or by channels
of your own. No dependencies outside xufa.

Its documentation is in [docs/mail/](../../docs/mail/index.html). This file is the summary.

```sh
npm install @xufa/mail
```

```js
import { Model, fields } from '@xufa/orm';
import { Mailable, Mailer, mailFields } from '@xufa/mail';

class Email extends Model {
  static fields = mailFields(fields); // in a database of smtp (or memory-mail)
}

class OrderShipped extends Mailable {
  constructor(order) {
    super();
    this.order = order; // the data of its templates
  }

  envelope() {
    return { subject: 'Your order {{ order.number }} is on its way' };
  }

  content() {
    return { view: 'order-shipped', preheader: 'It arrives soon' }; // views/mail/order-shipped.html (and .txt)
  }
}

const mailer = new Mailer({ model: Email, views: 'views/mail', app: { name: 'Shop', url }, queue });
await mailer.send(new OrderShipped(order), { to: user.email });
await mailer.queue(new OrderShipped(order), { to: user.email, delay: '5m' });
```

- `content()`: `{ view }` (`name.html` and `name.txt`) or `{ html, text }` (templates), `with` (their data, over the
  fields of the mailable, `app` and `globals`), `preheader`, `footer`, `layout` (`false`, or a template with
  `{{{ body }}}`). Without text, the text is made of the HTML. `{{> button ({ url, text: 'Go' }) }}` is a button for every
  client.
- `attachments()`: `{ filename, content, contentType, cid }` or `{ path }`.
- `send()` gives the object of the model (`messageId`, `accepted`, `rejected`, `sentAt`); `queue()` renders now and sends
  from the job `xufa:mail` (`delay`, `at`, `priority`, `queue`, `key`), tried again when the server fails;
  `preview()` gives the HTML.

## Notifications

```js
class InvoicePaid extends Notification {
  constructor(invoice) {
    super();
    this.invoice = invoice;
  }

  via(user) {
    return ['mail', 'database'];
  }

  toMail() {
    return { subject: 'Invoice {{ invoice.number }} paid', view: 'invoice-paid' };
  }

  toDatabase() {
    return { invoice: this.invoice.number };
  }
}

const notifier = new Notifier({
  mailer,
  queue,
  model: NotificationRecord,
  notifications: [InvoicePaid],
  models: [User],
});
await notifier.notify(user, new InvoicePaid(invoice));
await notifier.of(user, { unread: true });
await notifier.markRead(user);
```

- Channels: `mail` (to `routeNotificationFor('mail')` or `email`), `database` (`notificationFields(fields)`), and your
  own (`channels: { sms: (user, message, notification) => ... }`, with `toSms()`).
- With a queue, one job by notifiable and channel; the notification is made again in the worker (its fields as JSON,
  objects of models read again by their key). `{ now: true }` skips the queue; `Notifier.route('mail', address)` is
  someone who is not a user.

## License

MIT
