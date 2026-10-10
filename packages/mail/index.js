// @xufa/mail: emails as classes (Laravel's Mailables), rendered with @xufa/template in a layout for email clients and
// sent through the model of the emails of @xufa/orm (smtp, or memory-mail in tests), at once or from jobs of
// @xufa/queue; and notifications by channels (mail, database, your own), sent from jobs.
import { Mailable, Mailer, MailError, mailFields, textOf } from './lib/mailer.js';
import { Notification, Notifier, AnonymousNotifiable, notificationFields } from './lib/notifications.js';
import { LAYOUT, BUTTON } from './lib/layout.js';

export {
  Mailable,
  Mailer,
  MailError,
  mailFields,
  textOf,
  Notification,
  Notifier,
  AnonymousNotifiable,
  notificationFields,
  LAYOUT,
  BUTTON,
};
