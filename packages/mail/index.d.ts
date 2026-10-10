import type { ModelClass, Model } from '@xufa/orm';
import type { TemplateEngine } from '@xufa/template';

/** An address: 'Ada <ada@example.com>', or { name, address }. */
export type Address = string | { name?: string; address: string };
export type Addresses = Address | Address[];

/** Who an email goes to and what it is called (templates: 'Order {{ order.number }}'). */
export interface Envelope {
  from?: Address;
  to?: Addresses;
  cc?: Addresses;
  bcc?: Addresses;
  replyTo?: Addresses;
  subject?: string;
  headers?: Record<string, string>;
}

/**
 * What an email says: a view (name.html and name.txt of the views of the Mailer), or html and text (templates of
 * @xufa/template); with: their data (over the fields of the mailable, the app and the globals). preheader: the line
 * clients show after the subject. layout: false for none, or a template of your own.
 */
export interface Content {
  view?: string;
  html?: string;
  text?: string;
  with?: Record<string, unknown>;
  preheader?: string;
  footer?: string;
  layout?: false | string;
}

/** A file of an email: its bytes (or text), or a path read when the email is rendered; cid for images of the HTML. */
export type Attachment =
  | { filename: string; content: Buffer | Uint8Array | string; contentType?: string; cid?: string; encoding?: 'base64' }
  | { path: string; filename?: string; contentType?: string; cid?: string };

/** An email as a class (Laravel's Mailables): its fields are the data of its templates. */
export declare class Mailable {
  envelope(): Envelope | Promise<Envelope>;
  content(): Content | Promise<Content>;
  attachments(): Attachment[] | Promise<Attachment[]>;
}

/** An email as a plain object: its envelope, content and attachments. */
export type PlainMail = Envelope & Content & { attachments?: Attachment[] };

/** An email rendered: what the model of the emails gets. */
export interface Message extends Envelope {
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
}

export interface MailerOptions {
  /** The model of the emails (fields of mailFields()), in a database of smtp (or memory-mail). */
  model: ModelClass<any>;
  /** The folder of the views: name.html and name.txt. */
  views?: string | null;
  /** The HTML around every email: true (the one of xufa), false, or a template ({{{ body }}}). */
  layout?: boolean | string;
  /** The app in the layout: its name and url. */
  app?: { name?: string; url?: string; [key: string]: unknown };
  /** Data of every template. */
  globals?: Record<string, unknown>;
  /** The line under every email. */
  footer?: string | null;
  /** An engine of @xufa/template of your own (filters, partials). */
  engine?: TemplateEngine | null;
  /** A Queue of @xufa/queue, for queue(). */
  queue?: {
    define(name: string, handler: (payload: any) => unknown, options?: any): unknown;
    enqueue(name: string, payload?: unknown, options?: any): Promise<any>;
  } | null;
  /** The name of the job that sends ('xufa:mail'). */
  jobName?: string;
  /** Its attempts (5). */
  attempts?: number;
}

/** The options of queue(): those of the message, and of the job. */
export type QueueOptions = Envelope & {
  delay?: number | string;
  at?: Date | string | number;
  priority?: number;
  queue?: string;
  attempts?: number;
  key?: string;
};

export declare class Mailer {
  constructor(options: MailerOptions);
  /** The email rendered: subject, HTML in the layout, its text. The recipients and subject given override its own. */
  render(mail: Mailable | PlainMail, overrides?: Envelope): Promise<Message>;
  /** Its HTML (in a browser, in tests). */
  preview(mail: Mailable | PlainMail, overrides?: Envelope): Promise<string>;
  /** Sends it now: the object of the model of the emails (its mailInfo fields: what the sending gave). */
  send<M extends Model = any>(mail: Mailable | PlainMail, overrides?: Envelope): Promise<M>;
  /** Sends it from a job of the queue: rendered now, sent by a worker (tried again when the server fails). */
  queue(mail: Mailable | PlainMail, options?: QueueOptions): Promise<any>;
  /** An email rendered, as an object of the model (which sends it). */
  deliver<M extends Model = any>(message: Message): Promise<M>;
}

export declare class MailError extends Error {
  code: string;
  statusCode: number;
}

/** The fields of a model of emails: class Email extends Model { static fields = mailFields(fields); }. */
export declare function mailFields(fields: any): Record<string, any>;

/** The text of the HTML of an email: blocks on lines, links with their addresses, lists, entities decoded. */
export declare function textOf(html: string | null | undefined): string;

/** The layout of the emails (a template), and the partial {{> button ({ url, text: 'Go' }) }}. */
export declare const LAYOUT: string;
export declare const BUTTON: string;

/** Something that happened, told by channels: via() and to<Channel>() (toMail, toDatabase...). */
export declare class Notification {
  via(notifiable: any): string[] | Promise<string[]>;
  toMail?(notifiable: any): Mailable | PlainMail | Promise<Mailable | PlainMail>;
  toDatabase?(notifiable: any): Record<string, unknown> | Promise<Record<string, unknown>>;
  [method: string]: unknown;
}

/** Someone who is not a user: its address by channel. */
export declare class AnonymousNotifiable {
  constructor(routes?: Record<string, unknown>);
  readonly routes: Record<string, unknown>;
  route(channel: string, address: unknown): this;
  routeNotificationFor(channel: string): unknown;
}

export interface NotifierOptions {
  mailer?: Mailer | null;
  /** The model of the notifications kept (notificationFields()): the channel database. */
  model?: ModelClass<any> | null;
  /** A Queue of @xufa/queue: each notification sent from jobs, one by notifiable and channel. */
  queue?: MailerOptions['queue'];
  /** The classes of the notifications (made again in the workers). */
  notifications?: Array<new (...args: any[]) => Notification>;
  /** The models notified or carried by notifications, found by name in the workers. */
  models?: ModelClass<any>[];
  /** Channels of your own: fn(notifiable, message of to<Channel>(), notification). */
  channels?: Record<string, (notifiable: any, message: unknown, notification: Notification) => unknown>;
  jobName?: string;
  attempts?: number;
}

export declare class Notifier {
  constructor(options?: NotifierOptions);
  /** Someone with an address and no user: Notifier.route('mail', 'a@example.com'). */
  static route(channel: string, address: unknown): AnonymousNotifiable;
  channel(name: string, fn: (notifiable: any, message: unknown, notification: Notification) => unknown): this;
  /** Sends a notification to one notifiable or many: from jobs (with a queue), or at once ({ now: true }). */
  notify(
    notifiables: unknown | unknown[],
    notification: Notification,
    options?: { now?: boolean; delay?: number | string; priority?: number }
  ): Promise<unknown[]>;
  /** The notifications kept of a notifiable, the newest first ({ unread: true }: not read). */
  of(notifiable: Model, options?: { unread?: boolean }): import('@xufa/orm').QuerySet<any>;
  /** Marks the notifications of a notifiable as read (those of these keys, or all): how many. */
  markRead(notifiable: Model, keys?: unknown[] | null): Promise<number>;
}

/** The fields of the model of the notifications kept: notifiableType, notifiableId, type, data, readAt, createdAt. */
export declare function notificationFields(fields: any): Record<string, any>;
