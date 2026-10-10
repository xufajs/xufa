// Notifications (Laravel's): something that happened, told to the users it concerns through channels. A
// Notification says which channels (via()) and what each one gets (toMail(): a Mailable or a plain email;
// toDatabase(): data kept in the model of the notifications, read and unread; to<Channel>() for channels of your
// own). A Notifier sends it to each user by each channel, from a job of the queue each (so one that fails is tried
// again alone), or at once.
//
//   class InvoicePaid extends Notification {
//     constructor(invoice) { super(); this.invoice = invoice; }
//     via(user) { return user.wantsEmail ? ['mail', 'database'] : ['database']; }
//     toMail(user) { return { subject: 'Invoice {{ invoice.number }} paid', view: 'invoice-paid' }; }
//     toDatabase(user) { return { invoice: this.invoice.number, amount: this.invoice.amount }; }
//   }
//   const notifier = new Notifier({ mailer, queue, model: NotificationRecord, notifications: [InvoicePaid], models: [User] });
//   await notifier.notify(user, new InvoicePaid(invoice));
//   await notifier.notify(Notifier.route('mail', 'billing@example.com'), new InvoicePaid(invoice));
import { MailError } from './mailer.js';

// What a notification says, by channel. Its own fields are what it carries (to the jobs of the queue too, as JSON:
// objects of models go as their model and key, and are read again).
class Notification {
  via() {
    return ['mail'];
  }
}

// Someone who is not a user of the app: its address by channel (Notifier.route('mail', 'a@example.com')).
class AnonymousNotifiable {
  constructor(routes = {}) {
    this.routes = routes;
  }

  route(channel, address) {
    this.routes[channel] = address;
    return this;
  }

  routeNotificationFor(channel) {
    return this.routes[channel];
  }
}

const isModel = (value) =>
  Boolean(value && typeof value === 'object' && value.constructor && value.constructor.meta && 'pk' in value);

class Notifier {
  // mailer: a Mailer (the channel mail). model: the model of the notifications kept (notificationFields(), the channel
  // database). queue: a Queue of @xufa/queue (each notification sent from jobs). notifications: their classes (to
  // make them again in the workers). models: the classes of the models that are notified or carried (found by name;
  // those of the database of the model are found too). channels: { name: (notifiable, message, notification) => ... }.
  constructor({
    mailer = null,
    model = null,
    queue = null,
    notifications = [],
    models = [],
    channels = {},
    jobName = 'xufa:notify',
    attempts = 5,
  } = {}) {
    this.mailer = mailer;
    this.model = model;
    this.queueRef = queue;
    this.jobName = jobName;
    this.classes = new Map(notifications.map((cls) => [cls.name, cls]));
    this.models = new Map(models.map((cls) => [cls.name, cls]));
    this.channels = new Map(Object.entries(channels));
    if (queue) queue.define(jobName, (payload) => this.run(payload), { attempts });
  }

  // Someone with an address (or more) and no user: Notifier.route('mail', 'a@example.com').route('sms', '+34...').
  static route(channel, address) {
    return new AnonymousNotifiable().route(channel, address);
  }

  // A channel of your own: fn(notifiable, message, notification), message what to<Channel>(notifiable) gave.
  channel(name, fn) {
    if (typeof fn !== 'function') throw new MailError(`The channel ${name} is a function`);
    this.channels.set(name, fn);
    return this;
  }

  // Sends a notification to one notifiable or many: from jobs of the queue (one by notifiable and channel), or at once
  // without a queue, or with { now: true }. Options of the jobs: delay, priority. The jobs, or the results by channel.
  async notify(notifiables, notification, { now = false, delay, priority } = {}) {
    if (!(notification instanceof Notification) && (!notification || typeof notification.via !== 'function')) {
      throw new MailError('notify(notifiable, notification): a Notification');
    }
    const list = Array.isArray(notifiables) ? notifiables : [notifiables];
    const results = [];
    for (const notifiable of list) {
      const channels = await notification.via(notifiable);
      for (const channel of channels || []) {
        if (this.queueRef && !now) {
          if (!this.classes.has(notification.constructor.name)) {
            throw new MailError(
              `The notification ${notification.constructor.name} is sent by jobs: give its class to the Notifier (notifications: [...])`
            );
          }
          results.push(
            await this.queueRef.enqueue(
              this.jobName,
              {
                type: notification.constructor.name,
                data: this.pack(notification),
                notifiable: this.refOf(notifiable),
                channel,
              },
              { ...(delay !== undefined ? { delay } : {}), ...(priority !== undefined ? { priority } : {}) }
            )
          );
        } else {
          results.push(await this.send(notifiable, notification, channel));
        }
      }
    }
    return results;
  }

  // The job of a notification by a channel: the notification and its notifiable made again, then sent.
  async run({ type, data, notifiable, channel }) {
    const cls = this.classes.get(type);
    if (!cls) throw new MailError(`No notification ${type} in the Notifier (notifications: [...])`);
    const notification = Object.assign(Object.create(cls.prototype), await this.unpack(data));
    return this.send(await this.notifiableOf(notifiable), notification, channel);
  }

  // Sends by one channel: mail, database, or one of your own.
  async send(notifiable, notification, channel) {
    const method = `to${channel.charAt(0).toUpperCase()}${channel.slice(1)}`;
    const message = typeof notification[method] === 'function' ? await notification[method](notifiable) : null;
    if (channel === 'mail') {
      if (!this.mailer) throw new MailError('The channel mail needs the mailer of the Notifier');
      if (!message) throw new MailError(`${notification.constructor.name} has no ${method}()`);
      const to = addressOf(notifiable, 'mail');
      if (!to) throw new MailError(`No address of mail for the notification ${notification.constructor.name}`);
      return this.mailer.send(message, message.to ? {} : { to });
    }
    if (channel === 'database') {
      if (!this.model) throw new MailError('The channel database needs the model of the Notifier');
      if (!isModel(notifiable)) throw new MailError('The channel database notifies objects of models');
      const data =
        message || (typeof notification.toArray === 'function' ? await notification.toArray(notifiable) : {});
      return this.model.objects.create({
        notifiableType: notifiable.constructor.name,
        notifiableId: String(notifiable.pk),
        type: notification.constructor.name,
        data,
      });
    }
    const fn = this.channels.get(channel);
    if (!fn) throw new MailError(`No channel ${channel} (channels: { ${channel}: fn })`);
    return fn(notifiable, message, notification);
  }

  // The notifications kept of a notifiable (the channel database), the newest first: { unread: true } those not read.
  of(notifiable, { unread = false } = {}) {
    if (!this.model) throw new MailError('notifications need the model of the Notifier');
    let qs = this.model.objects.filter({
      notifiableType: notifiable.constructor.name,
      notifiableId: String(notifiable.pk),
    });
    if (unread) qs = qs.filter({ readAt: null });
    return qs.orderBy('-createdAt', '-pk');
  }

  // Marks notifications of a notifiable as read (those of these keys, or all): how many.
  markRead(notifiable, keys = null) {
    let qs = this.of(notifiable, { unread: true });
    if (keys) qs = qs.filter({ pk__in: keys });
    return qs.update({ readAt: new Date() });
  }

  // The fields of a notification as JSON: objects of models as their model and key.
  pack(notification) {
    const out = {};
    for (const [key, value] of Object.entries(notification)) out[key] = this.packValue(value);
    return out;
  }

  packValue(value) {
    if (isModel(value)) {
      if (!this.models.has(value.constructor.name)) this.models.set(value.constructor.name, value.constructor);
      return { $model: value.constructor.name, pk: value.pk };
    }
    if (Array.isArray(value)) return value.map((item) => this.packValue(item));
    if (value instanceof Date) return { $date: value.toISOString() };
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      const out = {};
      for (const [key, item] of Object.entries(value)) out[key] = this.packValue(item);
      return out;
    }
    return value;
  }

  async unpack(data) {
    if (Array.isArray(data)) return Promise.all(data.map((item) => this.unpack(item)));
    if (data && typeof data === 'object') {
      if (data.$model !== undefined) return this.notifiableOf(data);
      if (data.$date !== undefined) return new Date(data.$date);
      const out = {};
      for (const [key, item] of Object.entries(data)) out[key] = await this.unpack(item);
      return out;
    }
    return data;
  }

  refOf(notifiable) {
    if (notifiable instanceof AnonymousNotifiable) return { $routes: notifiable.routes };
    if (isModel(notifiable)) return this.packValue(notifiable);
    throw new MailError('A notifiable is an object of a model, or Notifier.route(channel, address)');
  }

  async notifiableOf(ref) {
    if (ref.$routes) return new AnonymousNotifiable({ ...ref.$routes });
    const cls =
      this.models.get(ref.$model) ||
      (this.model && this.model.db && this.model.db.model ? this.model.db.model(ref.$model) : null);
    if (!cls) throw new MailError(`No model ${ref.$model} to find what was notified (models: [...])`);
    const found = await cls.objects.filter({ pk: ref.pk }).first();
    if (!found) throw new MailError(`The ${ref.$model} ${ref.pk} of the notification is not there any more`);
    return found;
  }
}

// The address of a notifiable for a channel: routeNotificationFor(channel), or its email (mail).
function addressOf(notifiable, channel) {
  if (notifiable && typeof notifiable.routeNotificationFor === 'function') {
    const address = notifiable.routeNotificationFor(channel);
    if (address) return address;
  }
  if (channel === 'mail' && notifiable && notifiable.email) return notifiable.email;
  return null;
}

// The fields of the model of the notifications kept (the channel database): class Notification extends Model {
// static fields = notificationFields(fields); }.
function notificationFields(fields) {
  return {
    notifiableType: fields.string({ maxLength: 200 }),
    notifiableId: fields.string({ maxLength: 64 }),
    type: fields.string({ maxLength: 200 }),
    data: fields.json({ null: true }),
    readAt: fields.datetime({ null: true }),
    createdAt: fields.datetime({ autoNowAdd: true }),
  };
}

export { Notification, Notifier, AnonymousNotifiable, notificationFields };
