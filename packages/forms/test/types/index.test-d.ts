import { expectType, expectError } from 'tsd';
import { Form, ModelForm, modelFormOf, fields, ValidationError, BoundField, FormFileValue } from '../..';

class RenewForm extends Form<{ renewalDate: string }> {
  static fields = { renewalDate: fields.date({ help: 'Within 4 weeks' }) };

  cleanRenewalDate(value: string) {
    if (value < '2026-01-01') throw new ValidationError('Invalid date - renewal in past');
    return value;
  }
}

const form = new RenewForm({ data: { renewalDate: '2026-10-08' } });
form.isValid().then((valid) => {
  expectType<boolean>(valid);
  if (valid && form.cleanedData) expectType<string>(form.cleanedData.renewalDate);
});
expectType<Record<string, string[]>>(form.errors);
expectType<BoundField>(form.field('renewalDate'));
expectType<string>(form.asTable());
expectType<string>(form.field('renewalDate').widget({ class: 'wide' }));

fields.choice({ choices: [['a', 'Available'], ['o', 'On loan']] });
fields.choice({ choices: { a: 'Available' }, widget: 'radio' });
fields.file({ maxSize: 1024, accept: 'image/*' }).clean(null);
expectType<FormFileValue | null>(fields.file().clean(null));
expectError(fields.string({ maxLength: 'long' }));
expectError(fields.choice({}));

class BookForm extends ModelForm<{ title: string }> {
  static meta = { model: class {}, fields: ['title', 'author'] };
}
const bookForm = new BookForm({ data: {}, instance: { title: 'x' } });
bookForm.save({ commit: false }).then((book) => expectType<{ title: string }>(book));
expectError(new BookForm({ data: 7 }));

const AuthorForm = modelFormOf(class {}, { fields: ['firstName'] });
expectType<string>(new AuthorForm({ data: {} }).asTable());

// Days, limits of dates and messages of fields.
import { today as day, addDays, dateOf, fields as formFields } from '../..';
expectType<string>(day());
expectType<string>(addDays(3, '2026-01-01'));
expectType<string>(dateOf('+4w'));
formFields.date({ min: 'today', max: () => addDays(28), messages: { min: 'Too soon' } });
