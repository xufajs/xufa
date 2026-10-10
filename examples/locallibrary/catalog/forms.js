// The forms of the catalog (catalog/forms.py): the renewal date a librarian gives a copy, between today and 4 weeks.
import { Form, fields } from 'xufa/forms';

class RenewBookForm extends Form {
  static fields = {
    renewalDate: fields.date({
      help: 'Enter a date between now and 4 weeks (default 3).',
      min: 'today',
      max: '+4w',
      messages: { min: 'Invalid date - renewal in past', max: 'Invalid date - renewal more than 4 weeks ahead' },
    }),
  };
}

export { RenewBookForm };
