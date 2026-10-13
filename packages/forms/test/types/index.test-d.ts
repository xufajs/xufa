import { expectTypeOf } from '@xufa/test';
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
  expectTypeOf(valid).toEqualTypeOf<boolean>();
  if (valid && form.cleanedData) expectTypeOf(form.cleanedData.renewalDate).toEqualTypeOf<string>();
});
expectTypeOf(form.errors).toEqualTypeOf<Record<string, string[]>>();
expectTypeOf(form.field('renewalDate')).toEqualTypeOf<BoundField>();
expectTypeOf(form.asTable()).toEqualTypeOf<string>();
expectTypeOf(form.field('renewalDate').widget({ class: 'wide' })).toEqualTypeOf<string>();

fields.choice({ choices: [['a', 'Available'], ['o', 'On loan']] });
fields.choice({ choices: { a: 'Available' }, widget: 'radio' });
fields.file({ maxSize: 1024, accept: 'image/*' }).clean(null);
expectTypeOf(fields.file().clean(null)).toEqualTypeOf<FormFileValue | null>();
// @ts-expect-error
fields.string({ maxLength: 'long' });
// @ts-expect-error
fields.choice({});

class BookForm extends ModelForm<{ title: string }> {
  static meta = { model: class {}, fields: ['title', 'author'] };
}
const bookForm = new BookForm({ data: {}, instance: { title: 'x' } });
bookForm.save({ commit: false }).then((book) => expectTypeOf(book).toEqualTypeOf<{ title: string }>());
// @ts-expect-error
new BookForm({ data: 7 });

const AuthorForm = modelFormOf(class {}, { fields: ['firstName'] });
expectTypeOf(new AuthorForm({ data: {} }).asTable()).toEqualTypeOf<string>();

// Days, limits of dates and messages of fields.
import { today as day, addDays, dateOf, fields as formFields } from '../..';
expectTypeOf(day()).toEqualTypeOf<string>();
expectTypeOf(addDays(3, '2026-01-01')).toEqualTypeOf<string>();
expectTypeOf(dateOf('+4w')).toEqualTypeOf<string>();
formFields.date({ min: 'today', max: () => addDays(28), messages: { min: 'Too soon' } });
