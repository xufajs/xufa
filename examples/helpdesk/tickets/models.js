// The tickets of an organization: in its own database (tenants: apps [tickets] in xufa.yaml).
import { Model, fields } from 'xufa/orm';

export class Ticket extends Model {
  static fields = {
    title: fields.string({ maxLength: 200 }),
    body: fields.text({ blank: true, default: '' }),
    status: fields.string({
      maxLength: 10,
      choices: [
        ['open', 'Open'],
        ['closed', 'Closed'],
      ],
      default: 'open',
    }),
    createdAt: fields.datetime({ autoNowAdd: true }),
  };

  static options = { ordering: ['-createdAt'], display: '{title}' };
}
